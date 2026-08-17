#!/usr/bin/env node
// tools/refprep.js — normalise reference screenshots for the discriminator.
//
// Reference shots arrive as whatever the player's desktop was: ultrawide, letterboxed, scaled by
// the OS. None of that is the game. This finds the game window inside the frame, crops to it, and
// rescales every reference to the SAME presented size our own captures use, so the discriminator
// judge is comparing art and not aspect ratios or JPEG-era desktop chrome.
//
// A judge that can pick ours out because theirs are 3440 wide has measured nothing.
//
// ------------------------------------------------------------------------------------------
// REFERENCE MATERIAL IS MEASUREMENT ONLY. Never shipped, never sent to a generation API, never
// committed. critique/reference/ and everything under it is gitignored. No asset rips, ever.
// ------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Same resolution capture.js uses: local install first, global second.
const { chromium } = (() => {
  try { return require('playwright'); } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
})();

const ROOT = path.resolve(__dirname, '..');
const REF = path.join(ROOT, 'critique', 'reference');
const OUT = path.join(REF, 'crop');

// Our own captures present at 650x390. References are normalised to the same HEIGHT and their
// own aspect is PRESERVED — squashing a 4:3 reference into a 5:3 frame distorts every texture in
// it, which would corrupt exactly the measurement this exists to make.
const TARGET_H = 390;

// A pixel this dark in every channel is letterbox, not art. MM6's darkest dungeon is well above
// this; the bars around a windowed game are hardware black.
const BLACK = 18;

const PAGE = `
<!doctype html><meta charset="utf-8"><body style="margin:0">
<script>
window.prep = async (dataUrl) => {
  const img = new Image();
  await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = dataUrl; });
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;

  const BLACK = ${BLACK};
  const lit = (x, y) => {
    const i = (y * w + x) * 4;
    return d[i] > BLACK || d[i + 1] > BLACK || d[i + 2] > BLACK;
  };
  // A row or column counts as content only if a real fraction of it is lit. One stray bright
  // pixel in a black bar (a cursor, a compression artefact) must not define the crop.
  const NEED = 0.02;
  const colLit = (x) => { let n = 0; for (let y = 0; y < h; y += 2) if (lit(x, y)) n++; return n / (h / 2) > NEED; };
  const rowLit = (y) => { let n = 0; for (let x = 0; x < w; x += 2) if (lit(x, y)) n++; return n / (w / 2) > NEED; };

  let x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1;
  while (x0 < x1 && !colLit(x0)) x0++;
  while (x1 > x0 && !colLit(x1)) x1--;
  while (y0 < y1 && !rowLit(y0)) y0++;
  while (y1 > y0 && !rowLit(y1)) y1--;

  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

  const oh = ${TARGET_H};
  const ow = Math.round(oh * cw / ch);
  const o = document.createElement('canvas');
  o.width = ow; o.height = oh;
  const og = o.getContext('2d');
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = 'high';
  og.drawImage(c, x0, y0, cw, ch, 0, 0, ow, oh);
  return { url: o.toDataURL('image/png'), src: [w, h], crop: [x0, y0, cw, ch] };
};
</script></body>`;

// Names listed in critique/reference/EXCLUDE are still normalised (they are useful to look at)
// but are written with a leading underscore, which every deck builder filters out.
function excluded() {
  const f = path.join(REF, 'EXCLUDE');
  if (!fs.existsSync(f)) return new Set();
  return new Set(fs.readFileSync(f, 'utf8').split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l && /\.png$/i.test(l)));
}

async function main() {
  const skip = excluded();
  const names = fs.readdirSync(REF)
    .filter((f) => /\.png$/i.test(f))
    .sort();
  if (!names.length) {
    console.error('no reference PNGs in critique/reference/');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.setContent(PAGE);

  const manifest = [];
  for (let i = 0; i < names.length; i++) {
    const raw = fs.readFileSync(path.join(REF, names[i]));
    const dataUrl = 'data:image/png;base64,' + raw.toString('base64');
    const r = await page.evaluate((u) => window.prep(u), dataUrl);
    const out = (skip.has(names[i]) ? '_ref' : 'ref') + String(i + 1).padStart(2, '0') + '.png';
    fs.writeFileSync(path.join(OUT, out), Buffer.from(r.url.split(',')[1], 'base64'));
    const [sw, sh] = r.src;
    const [cx, cy, cw, ch] = r.crop;
    const pct = ((cw * ch) / (sw * sh) * 100).toFixed(0);
    console.log(
      `${out}${skip.has(names[i]) ? ' [EXCLUDED from decks]' : ''}  <- ${names[i]}\n        ${sw}x${sh} -> crop ${cw}x${ch} at ${cx},${cy} (${pct}% of frame, ${(cw / ch).toFixed(2)}:1)`
    );
    manifest.push({ out, from: names[i], src: r.src, crop: r.crop });
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  await browser.close();
  console.log(`\n${names.length} references normalised to height ${TARGET_H}, aspect preserved -> ${path.relative(ROOT, OUT)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
