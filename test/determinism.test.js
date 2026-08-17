// test/determinism.test.js — same seed, same inputs, byte-identical state. Plus the size ceiling.
//
// Any difference between two identical runs is a bug you have not found yet. This suite exists to
// find it before a player does, and it is the reason the RNG registry is serialised into saves.

const fs = require('fs');
const path = require('path');
const T = require('./_harness.js');
const { build, SIZE_CEILING } = require('../build.js');

// A scripted session driven ONLY through the harness at a fixed timestep. No wall-clock, no
// Math.random, no rAF — so two runs of this must agree exactly.
const SCRIPT = `(() => {
  // THE RAF LOOP RUNS BETWEEN PAGE LOAD AND THIS SCRIPT, advancing the clock and the frame counter
  // by however long the browser took to get here. That is wall-clock dependent, so a test that
  // does not reset it is measuring the machine's mood, not the simulation. page.evaluate runs
  // synchronously, so nothing can interleave once we start.
  window.__debug.state.frames = 0;
  Core.Clock.setTod(540);
  Core.Clock.micro = 0;
  Core.Log.clear();

  window.__game.seed(1234);
  Game.state.screen = null;
  Game.newParty([
    { name: 'Ann', cls: 'knight', sex: 'f', base: { mig: 17, int: 8, per: 8, end: 15, acc: 13, spd: 12, lck: 10 } },
    { name: 'Ben', cls: 'priest', sex: 'm', base: { mig: 10, int: 10, per: 17, end: 13, acc: 11, spd: 12, lck: 10 } },
    { name: 'Cai', cls: 'mage',   sex: 'f', base: { mig: 8, int: 18, per: 10, end: 12, acc: 10, spd: 13, lck: 10 } },
    { name: 'Dee', cls: 'ranger', sex: 'm', base: { mig: 12, int: 10, per: 10, end: 13, acc: 18, spd: 13, lck: 10 } },
  ]);

  // A fixed sequence of player-legal actions, deliberately touching every live RNG stream:
  // movement, combat rolls, loot, magic, and the clock.
  const steps = [];
  for (let i = 0; i < 40; i++) {
    Game.state.keys.fwd = true;  Game.update(16);
    Game.state.keys.fwd = false; Game.update(16);
    if (i % 7 === 0) { Game.state.party.ang += 0.37; }
    if (i % 5 === 0) { Game.partyAttack(i % 4); }
    if (i % 11 === 0) { Game.castSpell('first_aid'); }
    if (i % 13 === 0) { Game.interact(); Game.closeScreens(); }
    steps.push(Game.state.party.x.toFixed(4) + ',' + Game.state.party.y.toFixed(4));
  }

  return { dump: window.__session.dump(), steps, census: window.__session.census() };
})()`;

(async () => {
  const pw = T.requirePlaywright();

  T.suite('determinism');

  // Two INDEPENDENT page loads, so nothing carries over in module state.
  const runs = [];
  for (let i = 0; i < 2; i++) {
    const { browser, page, errors } = await T.openPage(pw, { query: 'seed=1234' });
    T.eq(errors, [], 'run ' + (i + 1) + ': no page errors');
    runs.push(await page.evaluate(SCRIPT));
    await browser.close();
  }

  const a = JSON.stringify(runs[0].dump), b = JSON.stringify(runs[1].dump);
  if (a !== b) {
    // Name the first divergence rather than just asserting inequality — "they differ" is not a
    // finding, "party.x diverged at step 12" is.
    const oa = runs[0].dump, ob = runs[1].dump;
    const diffs = [];
    const walk = (x, y, p) => {
      if (diffs.length > 8) return;
      if (JSON.stringify(x) === JSON.stringify(y)) return;
      if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') {
        diffs.push(p + ': ' + JSON.stringify(x) + ' != ' + JSON.stringify(y));
        return;
      }
      for (const k of new Set([].concat(Object.keys(x), Object.keys(y)))) walk(x[k], y[k], p + '.' + k);
    };
    walk(oa, ob, '');
    T.ok(false, 'two identical runs produced identical dumps — first divergences: ' + diffs.join(' | '));
  } else {
    T.ok(true, 'two identical runs produce byte-identical state dumps');
  }

  T.eq(runs[0].steps, runs[1].steps, 'the movement trace is identical step for step');
  T.eq(JSON.stringify(runs[0].census), JSON.stringify(runs[1].census), 'the item census is identical');

  // A different seed MUST diverge, or the seed is being ignored and the test above proves nothing.
  {
    const { browser, page } = await T.openPage(pw, { query: 'seed=999' });
    const other = await page.evaluate(SCRIPT.replace('window.__game.seed(1234)', 'window.__game.seed(999)'));
    await browser.close();
    T.ok(JSON.stringify(other.dump) !== a, 'a different seed produces a different run (the seed is real)');
  }

  T.suite('conservation');
  // The probe that refuses to chase a duplication ghost: count every item in the world before and
  // after several hundred operations, and account for the difference.
  {
    const { browser, page, errors } = await T.openPage(pw, { query: 'seed=5' });
    const probe = await page.evaluate(`(() => {
      Game.state.screen = null;
      Game.newParty([
        { name: 'A', cls: 'knight', sex: 'f', base: { mig: 16, int: 8, per: 8, end: 15, acc: 13, spd: 12, lck: 10 } },
        { name: 'B', cls: 'priest', sex: 'm', base: { mig: 10, int: 10, per: 17, end: 13, acc: 11, spd: 12, lck: 10 } },
        { name: 'C', cls: 'mage',   sex: 'f', base: { mig: 8, int: 18, per: 10, end: 12, acc: 10, spd: 13, lck: 10 } },
        { name: 'D', cls: 'ranger', sex: 'm', base: { mig: 12, int: 10, per: 10, end: 13, acc: 18, spd: 13, lck: 10 } },
      ]);
      const before = window.__session.census();
      // 400 operations that MOVE items around without creating or destroying any: equip, unequip,
      // swap active character, open and close screens.
      for (let i = 0; i < 400; i++) {
        Game.state.active = i % 4;
        const ch = Game.state.party.members[i % 4];
        if (ch.pack.length) Game.equipFromPack(0);
        const slots = Object.keys(ch.equip).filter((k) => ch.equip[k]);
        if (slots.length) Game.unequip(slots[i % slots.length]);
        Game.openScreen('inv'); Game.closeScreens();
      }
      const after = window.__session.census();
      return { before, after };
    })()`);
    await browser.close();
    T.eq(errors, [], 'conservation probe: no page errors');
    T.eq(probe.after.total, probe.before.total,
      'equipping and unequipping 400 times creates and destroys nothing (' +
      probe.before.total + ' -> ' + probe.after.total + ')');
    T.eq(probe.after.gold, probe.before.gold, 'and does not mint gold');
    T.eq(JSON.stringify(probe.after.byId), JSON.stringify(probe.before.byId),
      'every individual item id is conserved');
  }

  T.suite('size ceiling');
  {
    const dist = path.join(__dirname, '..', 'dist', 'index.html');
    const bytes = fs.statSync(dist).size;
    T.ok(bytes <= SIZE_CEILING,
      'dist/index.html is within the 2 MB ceiling (' + (bytes / 1024 / 1024).toFixed(2) + ' MB)');
    // Two DISTINCT properties, which the old single check conflated into one misleading failure.
    //   1. dist on disk is not stale with respect to src/ and art/.
    //   2. the build is reproducible.
    // Failing (1) while (2) holds reads as "the build is nondeterministic", which sent me hunting
    // a phantom for ten minutes. Name them separately so the message points at the real cause.
    const onDisk = fs.readFileSync(dist);
    build();
    const fresh = fs.readFileSync(dist);
    T.ok(Buffer.compare(onDisk, fresh) === 0,
      'dist/index.html on disk is up to date with src/ and art/ (rebuild before capture)');
    build();
    const again = fs.readFileSync(dist);
    T.ok(Buffer.compare(fresh, again) === 0,
      'building twice from the same sources produces byte-identical output');
  }

  T.report('determinism');
})().catch((e) => {
  console.error('\ndeterminism: FATAL\n  ' + (e && e.stack ? e.stack : e) + '\n');
  process.exit(1);
});
