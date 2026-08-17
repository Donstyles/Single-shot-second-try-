#!/usr/bin/env node
// tools/crop.js — crop a region out of a PNG and optionally magnify it, nearest-neighbour.
//
// Reviewing a 4px-tall label inside a 650x390 frame by eye is how "WAIT" shipped as "UAII" for
// four rounds. Magnify the region and look at the actual pixels.
//
// usage: node tools/crop.js <in.png> <out.png> <x> <y> <w> <h> [zoom]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { chromium } = (() => {
  try { return require('playwright'); } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
})();

const [inp, outp, X, Y, W, H, Z] = process.argv.slice(2);
if (!inp || !outp || W === undefined) {
  console.error('usage: node tools/crop.js <in.png> <out.png> <x> <y> <w> <h> [zoom]');
  process.exit(1);
}
const zoom = parseInt(Z || '1', 10);

const PAGE = `
<!doctype html><meta charset="utf-8"><body style="margin:0">
<script>
window.crop = async (url, x, y, w, h, z) => {
  const img = new Image();
  await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = url; });
  const c = document.createElement('canvas');
  c.width = w * z; c.height = h * z;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;           // NEAREST. Smoothing here invents pixels that are
  g.drawImage(img, x, y, w, h, 0, 0, w * z, h * z);  // exactly what we are trying to inspect.
  return c.toDataURL('image/png');
};
</script></body>`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.setContent(PAGE);
  const url = 'data:image/png;base64,' + fs.readFileSync(inp).toString('base64');
  const r = await page.evaluate(
    ([u, x, y, w, h, z]) => window.crop(u, x, y, w, h, z),
    [url, +X, +Y, +W, +H, zoom]);
  fs.writeFileSync(outp, Buffer.from(r.split(',')[1], 'base64'));
  await browser.close();
  console.log(`${inp} [${X},${Y} ${W}x${H}] x${zoom} -> ${outp}`);
})().catch((e) => { console.error(e); process.exit(1); });
