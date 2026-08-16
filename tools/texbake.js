#!/usr/bin/env node
// tools/texbake.js — generated image -> palette-quantised, seam-checked game texture.
//
//   1024px generation  ->  area-average downsample  ->  palette quantise  ->  seam measure
//                      ->  optional seam repair     ->  3x3 contact sheet ->  indexed PNG
//
// Generate large and downsample; never ask a model for a 128px image. Nothing enters the build as
// RGB. Tiling is the KNOWN weak point of image generation: a seam that is invisible in isolation
// becomes a grid of scars across a wall, so every texture is judged as a 3x3 grid, never alone.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { loadUpTo } = require('../test/_load.js');
const png = require('./png.js');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'assets', 'raw');
const ASSETS = path.join(ROOT, 'assets');
const CHROMIUM = '/opt/pw-browsers/chromium';

function requirePlaywright() {
  try { return require('playwright'); } catch {
    const { execSync } = require('child_process');
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

// Decode any PNG/JPEG and area-average downsample, using the browser's own decoder rather than
// hand-rolling one. `imageSmoothingQuality:'high'` is a real box filter, which is what we want:
// point sampling 1024 -> 128 throws away exactly the structure that makes a texture read.
async function decodeAndResize(buf, w, h) {
  const pw = requirePlaywright();
  const browser = await pw.chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
    return await page.evaluate(async ([url, tw, th]) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode failed')); img.src = url; });
      const c = document.getElementById('c');
      c.width = tw; c.height = th;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, tw, th);
      return { src: [img.width, img.height], data: Array.from(ctx.getImageData(0, 0, tw, th).data) };
    }, [dataUrl, w, h]);
  } finally {
    await browser.close();
  }
}

// How badly does it tile? Compare the wrapping edges: mean absolute difference between the last
// column and the first, and the last row and the first, in palette-index luminance. A perfectly
// seamless texture scores near the texture's own internal roughness; a bad one spikes.
function seamScore(idx, w, h, Core) {
  const lum = (pi) => {
    const i = pi * 3;
    return Core.PAL[i] * 0.3 + Core.PAL[i + 1] * 0.59 + Core.PAL[i + 2] * 0.11;
  };
  let vSeam = 0, hSeam = 0, vRef = 0, hRef = 0;
  for (let y = 0; y < h; y++) {
    vSeam += Math.abs(lum(idx[y * w + w - 1]) - lum(idx[y * w]));
    vRef += Math.abs(lum(idx[y * w + (w >> 1)]) - lum(idx[y * w + (w >> 1) - 1]));
  }
  for (let x = 0; x < w; x++) {
    hSeam += Math.abs(lum(idx[(h - 1) * w + x]) - lum(idx[x]));
    hRef += Math.abs(lum(idx[(h >> 1) * w + x]) - lum(idx[((h >> 1) - 1) * w + x]));
  }
  return {
    // Ratio against the texture's own internal roughness. ~1.0 means the seam is
    // indistinguishable from any other pair of adjacent columns, which is the goal.
    vertical: Number((vSeam / Math.max(vRef, 1e-6)).toFixed(2)),
    horizontal: Number((hSeam / Math.max(hRef, 1e-6)).toFixed(2)),
  };
}

// Make it tile by mirroring into a half-size quadrant and reflecting. This ALWAYS tiles perfectly
// and costs a visible symmetry; it is the fallback, not the default, because mirrored masonry
// reads as wallpaper. Preferred fix is generating deliberately flat material and blending.
function mirrorTile(rgba, w, h) {
  const out = new Uint8Array(w * h * 4);
  const hw = w >> 1, hh = h >> 1;
  for (let y = 0; y < h; y++) {
    const sy = y < hh ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const sx = x < hw ? x : w - 1 - x;
      const s = ((sy * 2) * w + (sx * 2)) * 4;
      const d = (y * w + x) * 4;
      out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
    }
  }
  return out;
}

// Cross-fade the wrapping edges into each other over `band` pixels. Preserves structure in the
// middle and only disturbs the rim, which is where the seam lives.
function blendEdges(rgba, w, h, band) {
  const out = Uint8Array.from(rgba);
  const mix = (d, s, t) => {
    for (let k = 0; k < 4; k++) out[d + k] = Math.round(out[d + k] * (1 - t) + rgba[s + k] * t);
  };
  for (let y = 0; y < h; y++) {
    for (let b = 0; b < band; b++) {
      const t = 0.5 * (1 - b / band);
      mix((y * w + b) * 4, (y * w + (w - 1 - b)) * 4, t);
      mix((y * w + (w - 1 - b)) * 4, (y * w + b) * 4, t);
    }
  }
  for (let x = 0; x < w; x++) {
    for (let b = 0; b < band; b++) {
      const t = 0.5 * (1 - b / band);
      mix((b * w + x) * 4, ((h - 1 - b) * w + x) * 4, t);
      mix(((h - 1 - b) * w + x) * 4, (b * w + x) * 4, t);
    }
  }
  return out;
}

// The 3x3 grid. Drift and seams are invisible in one tile and obvious here.
function tile3x3(idx, w, h) {
  const W = w * 3, H = h * 3;
  const out = new Uint8Array(W * H);
  for (let ty = 0; ty < 3; ty++) {
    for (let tx = 0; tx < 3; tx++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) out[(ty * h + y) * W + tx * w + x] = idx[y * w + x];
      }
    }
  }
  return { w: W, h: H, data: out };
}

async function bakeTexture(srcPath, id, opts = {}) {
  const Core = loadUpTo('00').Core;
  const size = opts.size || 128;
  const buf = fs.readFileSync(srcPath);

  const dec = await decodeAndResize(buf, size, size);
  let rgba = Uint8Array.from(dec.data);

  if (opts.blend) rgba = blendEdges(rgba, size, size, opts.blend);
  if (opts.mirror) rgba = mirrorTile(rgba, size, size);

  // NOTHING enters the build as RGB. alphaCut 0 keeps every pixel opaque: a wall texture has no
  // transparency, and letting index 0 appear in one would punch a hole through the world.
  const idx = Core.palDither(rgba, size, size, 0);
  let holes = 0;
  for (let i = 0; i < idx.length; i++) if (idx[i] === 0) holes++;

  return { Core, size, idx, holes, srcSize: dec.src, seam: seamScore(idx, size, size, Core) };
}

async function main() {
  const src = process.argv[2] || path.join(RAW, 'img', 'wall_anchor.png');
  const id = process.argv[3] || 'wall_stone';
  const mode = process.argv[4] || 'raw';   // raw | blend | mirror

  if (!fs.existsSync(src)) { console.error('no such image: ' + src); process.exit(1); }

  const opts = { size: 128 };
  if (mode === 'blend') opts.blend = 16;
  if (mode === 'mirror') opts.mirror = true;

  console.log('texbake: ' + id + '  <- ' + path.relative(ROOT, src) + '  [' + mode + ']');
  const r = await bakeTexture(src, id, opts);

  console.log('  source            : ' + r.srcSize[0] + 'x' + r.srcSize[1] + ' -> ' + r.size + 'x' + r.size);
  console.log('  distinct indices  : ' + new Set(r.idx).size);
  console.log('  transparent holes : ' + r.holes + (r.holes ? '   <-- REJECT: a wall texture must be fully opaque' : ''));
  console.log('  seam vs internal  : vertical ' + r.seam.vertical + 'x   horizontal ' + r.seam.horizontal + 'x   (1.0 = invisible)');

  fs.mkdirSync(path.join(ASSETS, 'tex'), { recursive: true });
  fs.mkdirSync(path.join(RAW, 'sheets'), { recursive: true });

  const single = png.encodeIndexed(r.idx, r.size, r.size, r.Core.PAL, 255);
  fs.writeFileSync(path.join(ASSETS, 'tex', id + '.png'), single);

  const grid = tile3x3(r.idx, r.size, r.size);
  fs.writeFileSync(path.join(RAW, 'sheets', id + '_' + mode + '_3x3.png'),
    png.encodeIndexed(grid.data, grid.w, grid.h, r.Core.PAL, 255));

  console.log('  texture           : ' + single.length + ' B  -> assets/tex/' + id + '.png');
  console.log('  3x3 proof         : assets/raw/sheets/' + id + '_' + mode + '_3x3.png');
}

if (require.main === module) {
  main().catch((e) => { console.error('FAILED: ' + (e.stack || e.message)); process.exit(1); });
}

module.exports = { bakeTexture, seamScore, tile3x3, blendEdges, mirrorTile };
