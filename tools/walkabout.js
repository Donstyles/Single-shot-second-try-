#!/usr/bin/env node
// tools/walkabout.js — capture the game the way it is actually played, with nothing curated.
//
// THIS REPLACES THE SHOT LIST, AND IT EXISTS BECAUSE THE SHOT LIST WAS LYING.
//
// critique/SHOTLIST.md is twenty-two framed compositions that I chose. Every judging round for
// twenty rounds looked at those twenty-two frames, and the metrics against them improved every
// round, and the game still looked bad — because the shot list never once put the camera where a
// player actually spends their time: nose against a wall, standing in the middle of nowhere,
// facing a corner, halfway up a hill with nothing in frame. A player opened the build and found
// the worst defects in the game in under five seconds. The captures could not have found them
// because the captures were not looking there.
//
// So: no chosen positions. Pick a map, pick a passable cell uniformly at random, pick a facing
// uniformly at random, and take the frame. Some will be boring. Some will be walls. That is the
// point — a game has to survive the boring frames, and a wall at point-blank IS most of a dungeon.
//
//   node tools/walkabout.js <outdir> [shotsPerMap]
//
// Writes NNN_<map>_<x>_<y>_<deg>.png at the true device viewport (844x390 CSS px), plus an
// index.json recording exactly where each camera was, so any finding can be reproduced by
// teleporting back to the same spot.

const fs = require('fs');
const path = require('path');
const T = require(path.resolve(__dirname, '..', 'test', '_harness.js'));

const OUT = process.argv[2];
const PER_MAP = parseInt(process.argv[3] || '4', 10);
if (!OUT) { console.error('usage: node tools/walkabout.js <outdir> [shotsPerMap]'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

// The device the game is built for. Capturing at the framebuffer's native 800x480 hides how much
// the letterbox scale costs, so this is the CSS viewport of an iPhone 14 Pro Max in landscape.
const VIEWPORT = { width: 844, height: 390 };

(async () => {
  const pw = T.requirePlaywright();
  const { browser, page } = await T.openPage(pw, { viewport: VIEWPORT });

  // Baked sprite frames decode asynchronously from embedded PNGs. Capturing before they land
  // photographs the procedural fallbacks, which is a different game from the one that ships.
  await page.waitForTimeout(4000);

  const maps = await page.evaluate(`(() => {
    const h = window.__game; h.beginGame();
    return Object.keys(Game.state.world.maps);
  })()`);

  const shots = [];
  let n = 0;
  for (const id of maps) {
    for (let k = 0; k < PER_MAP; k++) {
      const where = await page.evaluate(`(() => {
        const h = window.__game, G = Game, m = G.state.world.maps[${JSON.stringify(id)}];
        // Teleporting into a level-12 region drops a level-1 party into a fight it loses, and once
        // the party is down every later frame is the death screen -- twenty-two of sixty-six frames
        // in the first run were "YOUR PARTY HAS FALLEN" rather than the game. Heal before every
        // shot and close whatever screen is up. This is the ONLY concession the walk makes: the
        // camera position stays uniformly random.
        h.heal(); h.closeAll();
        // A REPEATABLE random walk. Seeded off the map id and the shot index so a rerun captures
        // the same places -- an unreproducible screenshot cannot be turned into a fix.
        let s = (Core.hashStr(${JSON.stringify(id)} + ':walk:' + ${k}) >>> 0) || 1;
        const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
        for (let t = 0; t < 4000; t++) {
          const x = rnd() * (m.w - 2) + 1, y = rnd() * (m.h - 2) + 1;
          const z = World.H(m, x, y);
          if (!World.passable(m, x, y, z)) continue;
          const ang = rnd() * Math.PI * 2;
          h.gotoMap(${JSON.stringify(id)}, x, y, ang);
          h.settle(3); h.redraw();
          return { x: +x.toFixed(2), y: +y.toFixed(2), deg: Math.round(ang * 180 / Math.PI) };
        }
        return null;
      })()`);
      if (!where) { console.warn('no passable cell found in ' + id); continue; }
      const name = String(n).padStart(3, '0') + '_' + id + '_' + where.x + '_' + where.y + '_' + where.deg + '.png';
      const el = await page.$('#fb');
      fs.writeFileSync(path.join(OUT, name), await el.screenshot());
      shots.push({ file: name, map: id, ...where });
      n++;
    }
    process.stdout.write('.');
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(shots, null, 1));
  console.log('\n' + n + ' frames -> ' + OUT);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
