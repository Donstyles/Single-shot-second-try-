#!/usr/bin/env node
// tools/capture.js — capture the canonical shot list from a PINNED build.
//
// The shots never change. Same camera, same seed, same clock, so a difference between rounds is a
// change we made and not a frame we got lucky with. Capture the WHOLE list before reading any of
// it: judging as you capture biases the fix list.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHROMIUM = '/opt/pw-browsers/chromium';

function requirePlaywright() {
  try { return require('playwright'); } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

// map, x, y, ang, t — mirrors critique/SHOTLIST.md exactly. A shot that cannot be taken is a WORLD
// bug, not a shot-list bug.
// A shot may name a LANDMARK instead of a coordinate. The world records where it put its gate,
// its bridge, its cave mouth, its market and its shoreline, and the capture asks. Eight rounds of
// hardcoded coordinates produced "there is no market", "no gate arch exists in frame", "no water
// and no coastline" — the shots were not lying, they were pointed at empty ground.
const WORLD_SHOTS = [
  ['s01_plaza_noon',       'harrowgate', 58.5, 56.5, 0, 720, true, 'plaza'],
  ['s02_market_row_morn',  'harrowgate', 50.5, 60.5, -1.5708, 540, false, 'market'],
  ['s03_gate_east_dusk',   'harrowgate', 78.5, 57.5, 3.1416, 1140, true, 'gate'],
  ['s04_road_east_noon',   'harrowgate', 88.5, 57.5, 0, 720, true, 'road'],
  ['s05_barrow_mouth',     'harrowgate', 101.5, 52.5, 0, 900, true, 'cave'],
  ['s06_bridge_ravine',    'harrowgate', 84.5, 62.5, -1.5708, 660, true, 'bridge'],
  ['s07_bandit_camp',      'duskwood',   92.5, 34.5, -1.5708, 780, false, 'camp'],
  ['s08_town_night',       'harrowgate', 58.5, 59.5, -1.5708, 1380, true, 'plaza'],
  ['s09_dawn_road',        'harrowgate', 70.5, 50.5, 0, 330, false, 'road'],
  ['s10_coast_west',       'ashencoast', 18.5, 58.5, 3.1416, 1020, false, 'coast'],
  ['s11_ridge_north',      'greyhollow', 60.5, 22.5, -1.5708, 840, false],
  ['s12_barrow_entry',     'barrow',      3.5,  2.5, 0, 720, true],
  ['s13_barrow_corridor',  'barrow',      9.5,  9.5, 0, 720, false],
  ['s14_mine_hall',        'mine',        8.5,  8.5, 0, 720, false],
  ['s15_keep_vault',       'keep',        5.5,  2.5, 0, 720, false],
];

// Screen shots need a state, not just a camera.
const UI_SHOTS = [
  ['s16_combat', null, true],
  ['s17_charsheet', 'sheet', false],
  ['s18_paperdoll', 'inv', false],
  ['s19_shop', 'shop', false],
  ['s20_spellbook', 'book', false],
  ['s21_automap', 'map', false],
  ['s22_title', 'title', false],
];

async function main() {
  const round = process.argv[2] || 'r1';
  const core = process.argv.indexOf('--core') >= 0;
  const outDir = path.join(ROOT, 'critique', 'shots', round);

  if (fs.existsSync(outDir) && !process.argv.includes('--force')) {
    console.error('refusing to overwrite ' + path.relative(ROOT, outDir) +
      ' — a previous round\'s captures are the only evidence its findings were real. ' +
      'Use a new round name, or --force if you truly mean it.');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  // Pin the artifact: record the SHA these shots belong to.
  let sha = 'unknown';
  try { sha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch {}
  fs.writeFileSync(path.join(outDir, 'SHA'), sha + '\n');

  const pw = requirePlaywright();
  const browser = await pw.chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('file://' + path.join(ROOT, 'dist', 'index.html') + '?seed=7', { waitUntil: 'load' });
  await page.waitForFunction('typeof window.__game !== "undefined" && window.__game.ready()', null, { timeout: 20000 });

  let taken = 0, skipped = [];
  const missing = [];
  for (const [id, map, x, y, ang, t, isCore, mark] of WORLD_SHOTS) {
    if (core && !isCore) continue;
    try {
      const found = await page.evaluate(([m, xx, yy, aa, tt, mk]) => {
        Game.state.screen = null;
        let px = xx, py = yy, pa = aa, resolved = false;
        if (mk) {
          const l = window.__game.landmark(m, mk);
          if (l) { px = l.x; py = l.y; pa = l.ang; resolved = true; }
        }
        window.__game.gotoMap(m, px - 0.5, py - 0.5, pa);
        window.__game.setTime(tt);
        return resolved;
      }, [map, x, y, ang, t, mark || null]);
      // A shot whose subject the world does not contain is a WORLD bug, and it must be visible in
      // the run output rather than quietly captured as a picture of a field.
      if (mark && !found) missing.push(id + ' (no "' + mark + '" landmark in ' + map + ')');
      await page.evaluate('window.__game.settle(4)');
      await page.locator('#fb').screenshot({ path: path.join(outDir, id + '.png') });
      taken++;
    } catch (e) {
      skipped.push(id + ': ' + e.message.split('\n')[0]);
    }
  }

  for (const [id, screen, isCore] of UI_SHOTS) {
    if (core && !isCore) continue;
    try {
      await page.evaluate((s) => {
        if (s === 'title') { Game.state.screen = 'title'; return; }
        Game.state.screen = null;
        window.__game.gotoMap('harrowgate', 58.5, 56.5, 0);
        window.__game.setTime(720);
        if (s === 'shop') {
          Game.state.shopKind = 'weapon';
          Game.state.shopStock = Items.shopStock(Core.RNG.world('shot:shop'), 'weapon', 3);
        }
        if (s === null) {
          // Combat: put two monsters in front of the party and alert them.
          window.__game.spawn('goblin', Game.state.party.x + 7.0, Game.state.party.y + 1.1);
          window.__game.spawn('skeleton', Game.state.party.x + 9.5, Game.state.party.y - 2.2);
          window.__game.spawn('ogre', Game.state.party.x + 13.0, Game.state.party.y + 3.0);
          Game.state.combat.active = true;
        }
        Game.state.screen = s;
      }, screen);
      await page.evaluate('window.__game.settle(4)');
      await page.locator('#fb').screenshot({ path: path.join(outDir, id + '.png') });
      taken++;
    } catch (e) {
      skipped.push(id + ': ' + e.message.split('\n')[0]);
    }
  }

  await browser.close();

  if (missing.length) {
    console.log('WORLD GAPS — the world does not contain these shots\' subjects, so they fell back');
    console.log('to a hardcoded pose. Each one is a world bug:');
    for (const mm of missing) console.log('  ! ' + mm);
  }
  console.log('round ' + round + ' @ ' + sha + ': ' + taken + ' shots -> critique/shots/' + round + '/');
  if (skipped.length) {
    console.log('SKIPPED (each of these is a world bug, not a shot-list bug):');
    for (const s of skipped) console.log('  ' + s);
  }
  if (errors.length) {
    console.log('PAGE ERRORS during capture:');
    for (const e of errors.slice(0, 10)) console.log('  ' + e);
  }
  fs.writeFileSync(path.join(outDir, 'capture.log'),
    JSON.stringify({ sha, taken, skipped, errors }, null, 2) + '\n');
}

main().catch((e) => { console.error('FAILED: ' + (e.stack || e.message)); process.exit(1); });
