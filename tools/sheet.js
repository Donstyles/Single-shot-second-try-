#!/usr/bin/env node
// tools/sheet.js — contact sheet of a directory of PNGs, aspect preserved.
//
// Looking at twenty images one at a time is how the foundry shipped thirteen identical goblins.
// A contact sheet is the cheapest defect detector in this project.
//
// usage: node tools/sheet.js <dir> <out.png> [cols] [cellW]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { chromium } = (() => {
  try { return require('playwright'); } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
})();

const dir = process.argv[2];
const out = process.argv[3];
const COLS = parseInt(process.argv[4] || '4', 10);
const CELL = parseInt(process.argv[5] || '400', 10);
if (!dir || !out) {
  console.error('usage: node tools/sheet.js <dir> <out.png> [cols] [cellW]');
  process.exit(1);
}

const names = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
if (!names.length) { console.error('no PNGs in ' + dir); process.exit(1); }

const PAGE = `
<!doctype html><meta charset="utf-8"><body style="margin:0">
<script>
window.sheet = async (items, cols, cell) => {
  const imgs = [];
  for (const it of items) {
    const img = new Image();
    await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = it.url; });
    imgs.push({ img, label: it.label });
  }
  // One row height for the whole sheet: the tallest cell once each image is fit to cell width.
  const LABEL = 18, PAD = 4;
  let cellH = 0;
  for (const o of imgs) cellH = Math.max(cellH, Math.round(cell * o.img.naturalHeight / o.img.naturalWidth));
  const rows = Math.ceil(imgs.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * (cell + PAD) + PAD;
  c.height = rows * (cellH + LABEL + PAD) + PAD;
  const g = c.getContext('2d');
  g.fillStyle = '#141416'; g.fillRect(0, 0, c.width, c.height);
  g.font = '13px monospace'; g.textBaseline = 'top';
  imgs.forEach((o, i) => {
    const cx = PAD + (i % cols) * (cell + PAD);
    const cy = PAD + Math.floor(i / cols) * (cellH + LABEL + PAD);
    const w = cell, h = Math.round(cell * o.img.naturalHeight / o.img.naturalWidth);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(o.img, cx, cy + (cellH - h) / 2, w, h);
    g.fillStyle = '#e8e4d8'; g.fillText(o.label, cx + 2, cy + cellH + 2);
  });
  return c.toDataURL('image/png');
};
</script></body>`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.setContent(PAGE);
  const items = names.map((n) => ({
    label: n.replace(/\.png$/i, ''),
    url: 'data:image/png;base64,' + fs.readFileSync(path.join(dir, n)).toString('base64'),
  }));
  const url = await page.evaluate(([it, c, s]) => window.sheet(it, c, s), [items, COLS, CELL]);
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  await browser.close();
  console.log(`${names.length} images -> ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
