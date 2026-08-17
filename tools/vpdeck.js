#!/usr/bin/env node
// tools/vpdeck.js — a discriminator deck of 3D VIEWPORTS ONLY, with the interface cut away.
//
// WHY THIS EXISTS
//
// The full-frame deck scored 38/38 twice. The second judge then volunteered the thing that makes
// the score much less useful than it looks:
//
//   "my per-image reasons are genuinely drawn from the art, but the DECISION was effectively made
//    once, on the UI shell, and then confirmed 38 times ... the chrome gives it away before the 3D
//    view matters."
//
// It is right, and it is a flaw in the instrument, not in the game. Every card of ours is a 650x390
// frame with brown panels; every card of theirs is a 520x390 frame with painted marble. A judge
// only has to notice that once. Whatever the world rendering is worth, that deck cannot measure it.
//
// So this one cuts the interface off. Both sides are cropped to their 3D window, centre-cropped to
// a common 4:3, and scaled to the SAME pixel size, so frame size, aspect and chrome are all gone
// and the only thing left to judge is the render.
//
// ---------------------------------------------------------------------------------------------
// REFERENCE MATERIAL IS MEASUREMENT ONLY. Never shipped, never sent to a generation API, never
// committed. No asset rips, ever.
// ---------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { chromium } = (() => {
  try { return require('playwright'); } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
})();

const ROOT = path.resolve(__dirname, '..');
const REFC = path.join(ROOT, 'critique', 'reference', 'crop');
const OUT = path.join(ROOT, 'critique', 'discriminator');

// Where the 3D window sits inside each frame, as fractions of the frame.
//
// Ours: VIEW is {x:100, y:8, w:616, h:344} in an 800x480 framebuffer.
// Theirs: MM6's 640x480 layout puts its view in the upper left, with the chrome column on the
// right and the portrait bar underneath. Measured off the reference crops.
const OURS_VP = { x0: 100 / 800, y0: 8 / 480, x1: 716 / 800, y1: 352 / 480 };
const REF_VP = { x0: 0.017, y0: 0.014, x1: 0.726, y1: 0.742 };

// Common output size. 4:3, because a square would throw away most of a wide viewport and a wide
// box would letterbox a narrow one — either way the crop itself becomes the tell.
const OUT_W = 416, OUT_H = 312;

const PAGE = `
<!doctype html><meta charset="utf-8"><body style="margin:0">
<script>
window.vp = async (dataUrl, f, ow, oh) => {
  const img = new Image();
  await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = dataUrl; });
  const W = img.naturalWidth, H = img.naturalHeight;
  let sx = Math.round(f.x0 * W), sy = Math.round(f.y0 * H);
  let sw = Math.round((f.x1 - f.x0) * W), sh = Math.round((f.y1 - f.y0) * H);
  // Centre-crop to the output aspect so nothing is stretched. A distorted texture would be a
  // louder tell than any of the ones we are trying to measure.
  const want = ow / oh;
  if (sw / sh > want) { const nw = Math.round(sh * want); sx += (sw - nw) >> 1; sw = nw; }
  else { const nh = Math.round(sw / want); sy += (sh - nh) >> 1; sh = nh; }
  const c = document.createElement('canvas');
  c.width = ow; c.height = oh;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
  return c.toDataURL('image/png');
};
</script></body>`;

// SplitMix32 — the same generator the game uses, so a round replays exactly from its seed.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, seed) {
  const r = rng(seed), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Only shots that actually contain a 3D view. A charsheet or a spellbook has no world in it, and
// cropping its "viewport" yields a rectangle of panel — which measures the chrome all over again.
const WORLD_SHOTS = /^s(0[1-9]|1[0-6])_/;

async function main() {
  const round = process.argv[2] || 'r16';
  const seed = parseInt(process.argv[3] || '20260818', 10);
  const shotDir = path.join(ROOT, 'critique', 'shots', round);

  const ours = fs.readdirSync(shotDir).filter((f) => f.endsWith('.png') && WORLD_SHOTS.test(f)).sort();
  const refs = fs.readdirSync(REFC).filter((f) => /^ref\d+\.png$/.test(f)).sort();
  if (!ours.length || !refs.length) {
    console.error('need world shots in ' + shotDir + ' and normalised references in ' + REFC);
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.setContent(PAGE);

  const stage = path.join(OUT, 'vp_' + seed);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  async function crop(file, frac) {
    const url = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    const out = await page.evaluate(
      ([u, f, w, h]) => window.vp(u, f, w, h), [url, frac, OUT_W, OUT_H]);
    return Buffer.from(out.split(',')[1], 'base64');
  }

  const deck = shuffle(
    ours.map((f) => ({ file: path.join(shotDir, f), frac: OURS_VP, truth: 'ours' }))
      .concat(refs.map((f) => ({ file: path.join(REFC, f), frac: REF_VP, truth: 'real' }))),
    seed);

  const key = [];
  for (let i = 0; i < deck.length; i++) {
    const id = 'vp_' + String(i + 1).padStart(3, '0');
    fs.writeFileSync(path.join(stage, id + '.png'), await crop(deck[i].file, deck[i].frac));
    key.push({ id, truth: deck[i].truth, source: path.relative(ROOT, deck[i].file) });
  }
  fs.writeFileSync(path.join(OUT, 'vpkey_' + seed + '.json'), JSON.stringify(key, null, 2) + '\n');

  await browser.close();
  const nOurs = key.filter((k) => k.truth === 'ours').length;
  console.log(`staged ${key.length} viewports (${nOurs} ours, ${key.length - nOurs} real) at ${OUT_W}x${OUT_H}`);
  console.log('  deck : ' + path.relative(ROOT, stage));
  console.log('  key  : ' + path.relative(ROOT, path.join(OUT, 'vpkey_' + seed + '.json')));
}

main().catch((e) => { console.error(e); process.exit(1); });
