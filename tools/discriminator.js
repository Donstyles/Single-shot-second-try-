#!/usr/bin/env node
// tools/discriminator.js — the ship gate.
//
// Every other loop in this project produces OPINION. This one produces a MEASUREMENT: real
// reference screenshots shuffled with ours, shown to a fresh vision judge that has never seen the
// project, asked only "real or fake". Ship when accuracy approaches chance.
//
// Until this runs, "better" is a feeling and every fix wave is a guess.
//
// ---------------------------------------------------------------------------------------------
// REFERENCE MATERIAL IS NOT INCLUDED AND MUST NOT BE COMMITTED.
//
// Put real Might & Magic VI screenshots in critique/reference/ yourself. They are:
//   - for MEASUREMENT and COMPARISON only,
//   - never shipped in dist/,
//   - never used as a prompt input to any generation API,
//   - never committed to this repository (critique/reference/ is gitignored).
// No asset rips, ever. Style parity with original content is the whole point.
// ---------------------------------------------------------------------------------------------
//
// The harness deliberately does NOT tell the judge how many of each it is looking at, and shuffles
// deterministically from a seed so a round can be replayed exactly.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REF_DIR = path.join(ROOT, 'critique', 'reference');
const OUT_DIR = path.join(ROOT, 'critique', 'discriminator');

// SplitMix32, the same generator the game uses, so a round is reproducible from its seed.
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
  const r = rng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function listPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(dir, f));
}

// Build a shuffled, anonymised deck. Filenames are replaced by opaque ids so nothing about the
// filename can leak the answer — "s04_road_east_noon.png" would give the whole game away.
function buildRound(roundDir, seed) {
  const ours = listPngs(roundDir).filter((f) => !/^_/.test(path.basename(f)));
  const refs = listPngs(REF_DIR);

  if (!refs.length) {
    return {
      error:
        'No reference screenshots in critique/reference/.\n\n' +
        'The discriminator is the only loop in this project that produces a measurement rather\n' +
        'than an opinion, and it cannot run without something real to compare against.\n\n' +
        'Put real Might & Magic VI screenshots there yourself. They are for measurement and\n' +
        'comparison ONLY: never shipped, never sent to a generation API, never committed.\n' +
        'The directory is gitignored for exactly that reason.',
      ours: ours.length, refs: 0,
    };
  }

  const deck = shuffle(
    ours.map((f) => ({ file: f, truth: 'ours' })).concat(refs.map((f) => ({ file: f, truth: 'real' }))),
    seed);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stage = path.join(OUT_DIR, 'round_' + seed);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  const key = [];
  deck.forEach((card, i) => {
    // Opaque, fixed-width ids. A judge must not be able to infer anything from ordering either,
    // which is why the shuffle happens before numbering.
    const id = 'img_' + String(i + 1).padStart(3, '0');
    fs.copyFileSync(card.file, path.join(stage, id + '.png'));
    key.push({ id, truth: card.truth, source: path.relative(ROOT, card.file) });
  });

  // The key lives OUTSIDE the staged directory the judge is pointed at.
  fs.writeFileSync(path.join(OUT_DIR, 'key_' + seed + '.json'), JSON.stringify(key, null, 2) + '\n');
  return { stage, key, ours: ours.length, refs: refs.length };
}

// Score a judge's verdicts against the key. Accuracy near 50% is the ship condition; accuracy near
// 100% means it can tell instantly and the presentation axis is not done.
function score(seed, verdicts) {
  const key = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'key_' + seed + '.json'), 'utf8'));
  const byId = new Map(key.map((k) => [k.id, k]));
  let correct = 0, n = 0;
  const wrong = [], missed = [];
  for (const v of verdicts) {
    const k = byId.get(v.id);
    if (!k) continue;
    n++;
    if (v.label === k.truth) correct++;
    else wrong.push({ id: v.id, said: v.label, actually: k.truth, source: k.source });
  }
  for (const k of key) if (!verdicts.some((v) => v.id === k.id)) missed.push(k.id);

  // Accuracy on OUR images specifically: how often a fake was spotted. That is the number that
  // matters, and it is the one an overall figure can hide when the deck is unbalanced.
  const oursCards = key.filter((k) => k.truth === 'ours');
  const oursCaught = oursCards.filter((k) => {
    const v = verdicts.find((x) => x.id === k.id);
    return v && v.label === 'ours';
  }).length;

  return {
    n, correct,
    accuracy: n ? correct / n : 0,
    oursTotal: oursCards.length,
    oursCaught,
    fakeDetectionRate: oursCards.length ? oursCaught / oursCards.length : 0,
    wrong, missed,
  };
}

function main() {
  const cmd = process.argv[2] || 'stage';
  const round = process.argv[3] || 'r8';
  const seed = parseInt(process.argv[4] || '20260817', 10);

  if (cmd === 'stage') {
    const r = buildRound(path.join(ROOT, 'critique', 'shots', round), seed);
    if (r.error) { console.error(r.error); process.exit(2); }
    console.log('staged ' + (r.ours + r.refs) + ' images (' + r.ours + ' ours, ' + r.refs + ' real)');
    console.log('  deck : ' + path.relative(ROOT, r.stage));
    console.log('  key  : critique/discriminator/key_' + seed + '.json  (do NOT show this to the judge)');
    console.log('');
    console.log('Point a fresh zero-context vision judge at the deck and ask it to label every');
    console.log('image "real" or "ours" with a one-line reason. Then:');
    console.log('  node tools/discriminator.js score ' + round + ' ' + seed + ' <verdicts.json>');
    return;
  }

  if (cmd === 'score') {
    const file = process.argv[5];
    if (!file) { console.error('usage: score <round> <seed> <verdicts.json>'); process.exit(1); }
    const verdicts = JSON.parse(fs.readFileSync(file, 'utf8'));
    const s = score(seed, verdicts);
    console.log('discriminator round ' + round + ' seed ' + seed);
    console.log('  judged            : ' + s.n);
    console.log('  overall accuracy  : ' + (s.accuracy * 100).toFixed(1) + '%   (50% = indistinguishable, 100% = obvious)');
    console.log('  our shots spotted : ' + s.oursCaught + '/' + s.oursTotal +
      '  (' + (s.fakeDetectionRate * 100).toFixed(1) + '%)');
    if (s.missed.length) console.log('  UNJUDGED          : ' + s.missed.join(', '));
    if (s.wrong.length) {
      console.log('  judge got these WRONG (these are the shots that are working):');
      for (const w of s.wrong) console.log('    ' + w.id + ' said ' + w.said + ', actually ' + w.truth + '  <- ' + w.source);
    }
    const verdict = s.fakeDetectionRate <= 0.6 ? 'PASS — approaching chance'
      : s.fakeDetectionRate <= 0.8 ? 'CLOSE — some shots are convincing'
      : 'FAIL — the judge can tell instantly';
    console.log('  VERDICT           : ' + verdict);
    return;
  }

  console.log('usage: node tools/discriminator.js stage|score <round> [seed] [verdicts.json]');
}

if (require.main === module) main();
module.exports = { buildRound, score, shuffle };
