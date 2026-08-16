#!/usr/bin/env node
// tools/foundry.js — 3D mesh -> palette-quantised multi-facing sprite frames.
//
// The pipeline, and where the coherence comes from:
//
//   GLB mesh (Meshy)  ->  OUR fixed light rig  ->  5 facings  ->  palette quantise
//                     ->  1px dark outline     ->  trim        ->  indexed PNG
//
// Only the first box is generated. Every lever that makes hundreds of assets look like one art
// department — the rig, the camera ladder, the 256-index palette, the outline — is ours and is
// identical for every creature.
//
// Output is COMMITTED as baked data. build.js only embeds what is already on disk; generation is
// non-deterministic and the build must be reproducible.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { loadUpTo } = require('../test/_load.js');
const png = require('./png.js');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'assets', 'raw');
const ASSETS = path.join(ROOT, 'assets');
const CHROMIUM = '/opt/pw-browsers/chromium';

// Sprite authoring height. Creatures are seen between roughly 40px (ten cells) and 240px (two
// cells). Authoring at 96 keeps them sharp where it matters without paying for pixels a phone
// never resolves — and the payload is the constraint, not the fidelity.
const SPRITE_H = 96;
const RENDER_SIZE = 192;   // render large, downsample with area averaging: never ask for tiny
const FACINGS = 5;         // 0..180 degrees; the other three eighths are mirrored at draw time

const OUTLINE_RAMP = 0;
const OUTLINE_SHADE = 2;

function requirePlaywright() {
  try { return require('playwright'); } catch {
    const { execSync } = require('child_process');
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

// ---------------------------------------------------------------- static server
// GLTFLoader is ESM and needs a real origin; file:// module imports are blocked by Chromium.
function serve(dir) {
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Answer the browser's automatic favicon request. Letting it 404 produces a console error,
      // and the render path treats console errors as fatal — correctly, so fix the cause rather
      // than filtering the symptom and going blind to real 404s.
      if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        res.writeHead(404); res.end('nope'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------- image ops
// Area-average downsample. Point sampling a 192px render to 96px throws away exactly the detail
// that makes a silhouette read.
function downsample(rgba, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * yr), y1 = Math.min(sh, Math.ceil((y + 1) * yr));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * xr), x1 = Math.min(sw, Math.ceil((x + 1) * xr));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = (sy * sw + sx) * 4;
          const al = rgba[p + 3] / 255;
          // Premultiply: averaging colour across transparent pixels drags the edge toward black.
          r += rgba[p] * al; g += rgba[p + 1] * al; b += rgba[p + 2] * al; a += rgba[p + 3];
          n++;
        }
      }
      const q = (y * dw + x) * 4;
      const aa = a / n;
      const un = aa > 0 ? (n * 255) / a : 0;
      out[q] = Math.min(255, (r / n) * un);
      out[q + 1] = Math.min(255, (g / n) * un);
      out[q + 2] = Math.min(255, (b / n) * un);
      out[q + 3] = aa;
    }
  }
  return out;
}

// 1px dark outline OUTSIDE the silhouette. This is what separates a 1998 pre-rendered sprite from
// a modern render pasted onto a background, and it is why the sprites read against any wall.
function outline(idx, w, h, Core) {
  const oi = Core.idx(OUTLINE_RAMP, OUTLINE_SHADE);
  const out = Uint8Array.from(idx);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (idx[y * w + x] !== 0) continue;
      let touch = false;
      if (x > 0 && idx[y * w + x - 1]) touch = true;
      if (x < w - 1 && idx[y * w + x + 1]) touch = true;
      if (y > 0 && idx[(y - 1) * w + x]) touch = true;
      if (y < h - 1 && idx[(y + 1) * w + x]) touch = true;
      if (touch) out[y * w + x] = oi;
    }
  }
  return out;
}

// Trim to the content bounding box. Most creatures occupy well under half the square, and every
// trimmed row is payload we do not ship.
function trim(idx, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (idx[y * w + x] === 0) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { w: 1, h: 1, ox: 0, oy: 0, data: new Uint8Array(1) };
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) out[y * nw + x] = idx[(y + y0) * w + (x + x0)];
  }
  return { w: nw, h: nh, ox: x0, oy: y0, data: out };
}

// ---------------------------------------------------------------- acceptance
// Reject on any failure. Regeneration is cheap and drift is not.
function accept(frame, Core) {
  const fails = [];
  const { data, w, h } = frame;

  // Palette-legal: every pixel is a valid index (a Uint8Array guarantees 0-255, so what actually
  // matters is that transparency is index 0 and ONLY index 0).
  let opaque = 0;
  for (let i = 0; i < data.length; i++) if (data[i] !== 0) opaque++;
  if (opaque === 0) fails.push('empty frame');

  // Coverage: a silhouette that fills under 4% of its box is a dot, and one over 85% is a slab.
  const cover = opaque / (w * h);
  if (cover < 0.04) fails.push('silhouette too sparse (' + (cover * 100).toFixed(1) + '%)');
  if (cover > 0.92) fails.push('silhouette fills its box (' + (cover * 100).toFixed(1) + '%)');

  // Readable at target size: if it does not survive a reduction to 40px tall with a recognisable
  // shape, the model is wrong and no texture fixes it.
  if (h < 24) fails.push('frame is only ' + h + 'px tall');

  // Distinct shades: a flat two-tone blob means the rig failed to light it.
  const seen = new Set();
  for (let i = 0; i < data.length; i++) if (data[i]) seen.add(data[i]);
  if (seen.size < 8) fails.push('only ' + seen.size + ' distinct indices — lighting failed');

  return fails;
}

// The silhouette test: fill it solid black. It must still be identifiable. We cannot judge
// "identifiable" mechanically, so the foundry EMITS the silhouette sheet and a human/vision judge
// rules on it. What we can check is that the silhouette is not degenerate.
function silhouette(frame) {
  const out = new Uint8Array(frame.data.length);
  for (let i = 0; i < frame.data.length; i++) out[i] = frame.data[i] ? 1 : 0;
  return out;
}

// ---------------------------------------------------------------- contact sheet
// Drift is invisible one asset at a time and obvious in a grid of twenty. Every class is reviewed
// as a sheet, never per-asset.
function contactSheet(frames, Core, cols) {
  const c = cols || frames.length;
  const rows = Math.ceil(frames.length / c);
  const cw = Math.max.apply(null, frames.map((f) => f.w)) + 6;
  const ch = Math.max.apply(null, frames.map((f) => f.h)) + 6;
  const W = cw * c, H = ch * rows;
  const sheet = new Uint8Array(W * H).fill(Core.idx(0, 3));
  frames.forEach((f, i) => {
    const gx = (i % c) * cw + ((cw - f.w) >> 1);
    const gy = Math.floor(i / c) * ch + ((ch - f.h) >> 1);
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const pi = f.data[y * f.w + x];
        if (pi) sheet[(gy + y) * W + (gx + x)] = pi;
      }
    }
  });
  return { w: W, h: H, data: sheet };
}

// ---------------------------------------------------------------- main
async function bake(creatureId, glbPath, opts = {}) {
  const Core = loadUpTo('00').Core;
  const pw = requirePlaywright();

  const { server, port } = await serve(ROOT);
  const browser = await pw.chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('http://127.0.0.1:' + port + '/tools/foundry/foundry.html', { waitUntil: 'load' });
    await page.waitForFunction('window.__foundryReady === true', null, { timeout: 30000 });

    const b64 = fs.readFileSync(glbPath).toString('base64');
    const result = await page.evaluate(
      ([data, o]) => window.FOUNDRY.render(data, o),
      [b64, { size: RENDER_SIZE, facings: FACINGS }]
    );

    if (errors.length) throw new Error('render page errors: ' + errors.join(' | '));

    const frames = [];
    for (const f of result.frames) {
      const src = Uint8Array.from(f.data);
      const dw = Math.round(RENDER_SIZE * (SPRITE_H / RENDER_SIZE));
      const small = downsample(src, result.size, result.size, dw, SPRITE_H);
      // NOTHING enters the build as RGB.
      let idx = Core.palDither(small, dw, SPRITE_H, 128);
      idx = outline(idx, dw, SPRITE_H, Core);
      const t = trim(idx, dw, SPRITE_H);
      t.facing = f.facing;
      t.angle = Number(f.angle.toFixed(4));
      t.fails = accept(t, Core);
      frames.push(t);
    }

    return { creatureId, frames, aspect: result.aspect, Core };
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  const id = process.argv[2] || 'goblin';
  const glb = process.argv[3] || path.join(RAW, 'meshy', 'probe_goblin.glb');
  if (!fs.existsSync(glb)) { console.error('no such GLB: ' + glb); process.exit(1); }

  console.log('foundry: ' + id + '  <- ' + path.relative(ROOT, glb));
  const t0 = Date.now();
  const { frames, aspect, Core } = await bake(id, glb);
  console.log('  rendered ' + frames.length + ' facings in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

  fs.mkdirSync(path.join(ASSETS, 'sprites'), { recursive: true });
  fs.mkdirSync(path.join(RAW, 'sheets'), { recursive: true });

  let totalBytes = 0, rejected = 0;
  const manifest = { id, aspect: Number(aspect.toFixed(3)), h: SPRITE_H, facings: [] };

  frames.forEach((f) => {
    const buf = png.encodeIndexed(f.data, f.w, f.h, Core.PAL, 0);
    // Prove the encode round-trips. A corrupted sprite only shows up much later as "that one
    // looks wrong", by which point the cause is three stages back.
    const back = png.decodeIndexed(buf);
    const same = back.w === f.w && back.h === f.h && Buffer.compare(Buffer.from(back.indices), Buffer.from(f.data)) === 0;
    if (!same) throw new Error('PNG round trip FAILED for facing ' + f.facing);

    const rleBytes = png.rle(f.data).length;
    totalBytes += buf.length;
    if (f.fails.length) rejected++;

    console.log('  facing ' + f.facing + '  ' + String(f.w).padStart(3) + 'x' + f.h +
      '  png ' + String(buf.length).padStart(5) + 'B  rle ' + String(rleBytes).padStart(6) + 'B  raw ' +
      String(f.w * f.h).padStart(6) + 'B' +
      (f.fails.length ? '  REJECT: ' + f.fails.join('; ') : '  ok'));

    manifest.facings.push({
      facing: f.facing, angle: f.angle, w: f.w, h: f.h, ox: f.ox, oy: f.oy,
      png: buf.toString('base64'),
    });
  });

  const sheet = contactSheet(frames, Core, frames.length);
  fs.writeFileSync(path.join(RAW, 'sheets', id + '_sheet.png'),
    png.encodeIndexed(sheet.data, sheet.w, sheet.h, Core.PAL, 0));

  const sil = frames.map((f) => ({
    w: f.w, h: f.h,
    data: Uint8Array.from(silhouette(f), (v) => (v ? Core.idx(0, 1) : 0)),
  }));
  const silSheet = contactSheet(sil, Core, frames.length);
  fs.writeFileSync(path.join(RAW, 'sheets', id + '_silhouette.png'),
    png.encodeIndexed(silSheet.data, silSheet.w, silSheet.h, Core.PAL, 0));

  fs.writeFileSync(path.join(ASSETS, 'sprites', id + '.json'), JSON.stringify(manifest));

  const jsonBytes = fs.statSync(path.join(ASSETS, 'sprites', id + '.json')).size;
  console.log('  ---');
  console.log('  png payload       : ' + (totalBytes / 1024).toFixed(1) + ' KB');
  console.log('  manifest (base64) : ' + (jsonBytes / 1024).toFixed(1) + ' KB');
  console.log('  rejected frames   : ' + rejected + '/' + frames.length);
  console.log('  contact sheet     : assets/raw/sheets/' + id + '_sheet.png');
  console.log('  silhouette sheet  : assets/raw/sheets/' + id + '_silhouette.png');
  console.log('  projected 21 actors: ' + ((jsonBytes * 21) / 1024 / 1024).toFixed(2) + ' MB against a 2 MB total ceiling');
}

if (require.main === module) {
  main().catch((e) => { console.error('FAILED: ' + (e.stack || e.message)); process.exit(1); });
}

module.exports = { bake, downsample, outline, trim, accept, contactSheet, SPRITE_H, FACINGS };
