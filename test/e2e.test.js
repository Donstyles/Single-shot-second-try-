// test/e2e.test.js — headless Chromium against the real built artifact.
//
// At R0 this asserts the boot path, the harness contract and the presentation layer. It grows with
// each round; the assertions written here never get relaxed to keep a later round green.

const T = require('./_harness.js');

(async () => {
  const pw = T.requirePlaywright();
  const { browser, page, errors } = await T.openPage(pw);

  T.suite('boot');

  // The artifact loads with zero page errors. This is the assertion that a silent catch would
  // have destroyed in v1.
  T.eq(errors, [], 'no page errors or console errors during boot');

  const layers = await page.evaluate('window.__game.layers()');
  T.ok(layers.core, 'Core loaded');
  T.ok(layers.engine, 'Engine loaded');
  T.ok(layers.game, 'game layer is present');
  T.ok(layers.world && layers.ui && layers.art, 'world, ui and art layers are present');

  T.suite('canvas');
  const canvas = await page.evaluate(`(() => {
    const c = document.getElementById('fb');
    return { w: c.width, h: c.height, cssW: c.style.width, cssH: c.style.height };
  })()`);
  T.eq(canvas.w, 640, 'framebuffer width is 640');
  T.eq(canvas.h, 480, 'framebuffer height is 480');
  T.ok(canvas.cssW && canvas.cssH, 'canvas is letterboxed to a CSS size');
  // 844x390 landscape: height-bound, so 480 -> 390 gives 520 wide.
  T.eq(canvas.cssW, '520px', 'aspect-correct fit in iPhone 14 Pro Max landscape');
  T.eq(canvas.cssH, '390px', 'fills the available height');

  T.suite('palette');
  const pal = await page.evaluate(`(() => {
    const bad = [];
    // Index 0 is transparent and is the ONLY transparent index.
    if (Core.TRANSPARENT !== 0) bad.push('TRANSPARENT is not 0');
    // Every ramp must be monotonically non-decreasing in luminance, or shading arithmetic lies.
    for (let r = 0; r < 16; r++) {
      let prev = -1;
      for (let s = 0; s < 16; s++) {
        const i = (r << 4 | s) * 3;
        const lum = Core.PAL[i]*0.30 + Core.PAL[i+1]*0.59 + Core.PAL[i+2]*0.11;
        if (r === 0 && s === 0) continue;               // the transparent slot
        if (lum < prev - 0.001) bad.push('ramp ' + r + ' non-monotonic at shade ' + s);
        prev = lum;
      }
    }
    // shade() must clamp into the ramp and must never produce index 0 from a non-zero ramp.
    for (let r = 0; r < 16; r++) {
      for (let s = -8; s < 24; s++) {
        const out = Core.shade(r << 4, s);
        if ((out >> 4) !== r) bad.push('shade() escaped ramp ' + r + ' at s=' + s);
        if (r === 0 && out === 0) bad.push('shade() produced the transparent index on ramp 0');
      }
    }
    return bad;
  })()`);
  T.eq(pal, [], 'palette ramps are monotonic and shade() stays in-ramp');

  T.suite('determinism primitives');
  const det = await page.evaluate(`(() => {
    Core.RNG.setSeed(12345);
    const a = [];
    for (let i = 0; i < 64; i++) a.push(Core.RNG.live('combat').next());
    const mid = Core.RNG.dump();
    for (let i = 0; i < 32; i++) Core.RNG.live('combat').next();
    Core.RNG.restore(mid);
    const b = [];
    for (let i = 0; i < 32; i++) b.push(Core.RNG.live('combat').next());
    Core.RNG.restore(mid);
    const c = [];
    for (let i = 0; i < 32; i++) c.push(Core.RNG.live('combat').next());
    return { same: JSON.stringify(b) === JSON.stringify(c), n: a.length };
  })()`);
  T.ok(det.same, 'RNG dump/restore reproduces a stream exactly');

  const world = await page.evaluate(`(() => {
    Core.RNG.setSeed(999);
    const a = []; for (let i=0;i<16;i++) a.push(Core.RNG.world('terrain').next());
    Core.RNG.setSeed(999);
    const b = []; for (let i=0;i<16;i++) b.push(Core.RNG.world('terrain').next());
    return JSON.stringify(a) === JSON.stringify(b);
  })()`);
  T.ok(world, 'layout streams are reproducible from the seed alone');

  T.suite('clock');
  const clock = await page.evaluate(`(() => {
    Core.Clock.setTod(720);
    const noon = { tod: Core.Clock.tod, phase: Core.Clock.phase(), hhmm: Core.Clock.hhmm() };
    Core.Clock.setTod(1380);
    const night = { tod: Core.Clock.tod, phase: Core.Clock.phase(), hhmm: Core.Clock.hhmm() };
    // Advancing must be exact at a fixed timestep: 1000 steps of 16ms at 6 game-min/sec = 96 min.
    Core.Clock.setTod(0);
    for (let i = 0; i < 1000; i++) Core.Clock.advance(16);
    const advanced = Core.Clock.tod;
    return { noon, night, advanced, integer: Number.isInteger(Core.Clock.t) };
  })()`);
  T.eq(clock.noon.hhmm, '12:00', 'setTod(720) is noon');
  T.eq(clock.noon.phase, 'noon', 'noon phase');
  T.eq(clock.night.hhmm, '23:00', 'setTod(1380) is 23:00');
  T.eq(clock.night.phase, 'night', 'night phase');
  T.eq(clock.advanced, 96, '1000 fixed 16ms steps advance exactly 96 game minutes');
  T.ok(clock.integer, 'clock.t stays an integer');

  T.suite('harness contract');
  const contract = await page.evaluate(`(() => {
    const need = ['teleport','gotoMap','walk','press','tap','key','give','gold','xp','setTime',
                  'setDay','save','load','newParty','screen','closeAll','seed','step','settle'];
    const missing = need.filter(k => typeof window.__game[k] !== 'function');
    const sess = ['dump','brief','invariants','census'].filter(k => typeof window.__session[k] !== 'function');
    return { missing, sess };
  })()`);
  T.eq(contract.missing, [], 'every __game method in the architecture contract exists');
  T.eq(contract.sess, [], 'every __session method exists');

  // Harness methods that need the game layer must throw a CLEAR error, not fail obscurely and
  // not silently no-op. A no-op here would let a later test "pass" against nothing.
  const moved = await page.evaluate(`(() => {
    window.__game.gotoMap('harrowgate', 64, 64, 0);
    const a = window.__session.brief();
    const r = window.__game.teleport(70.5, 60.5, 1.0);
    return { map: a.map, x: r.x, y: r.y, z: typeof r.z };
  })()`);
  T.eq(moved.map, 'harrowgate', 'gotoMap moves the party to the named region');
  T.eq(moved.x, 70.5, 'teleport sets x exactly');
  T.eq(moved.z, 'number', 'teleport snaps the party to a terrain height');

  T.suite('session dump');
  const dump = await page.evaluate(`(() => {
    const a = JSON.stringify(window.__session.dump());
    const b = JSON.stringify(window.__session.dump());
    return { stable: a === b, hasClock: a.includes('clock'), hasRng: a.includes('rng') };
  })()`);
  T.ok(dump.stable, 'dump() is side-effect free and stable across consecutive calls');
  T.ok(dump.hasClock && dump.hasRng, 'dump() carries clock and rng state');

  await page.evaluate('window.__game.settle(2)');
  const inv = await page.evaluate('window.__session.invariants()');
  T.eq(inv, [], 'no invariant violations at boot');

  T.suite('rendering');
  // The title screen is what a player sees first, and it must not be a flat plate.
  const titleShot = await page.evaluate(`(() => {
    Game.state.screen = 'title';
    window.__game.redraw();
    const d = document.getElementById('fb').getContext('2d').getImageData(0, 0, 640, 480).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i]<<16)|(d[i+1]<<8)|d[i+2]);
    return seen.size;
  })()`);
  T.ok(titleShot > 12, 'title screen renders a real vista (' + titleShot + ' colours)');

  // The 3D pass must produce a varied frame from a real camera. A uniform viewport means the march
  // bailed on step one, which is exactly the failure a screenshot would hide behind "looks dark".
  const world3d = await page.evaluate(`(() => {
    Game.state.screen = null;
    window.__game.gotoMap('harrowgate', 88.5, 57.5, 0);
    window.__game.setTime(720);
    window.__game.settle(3);
    const d = document.getElementById('fb').getContext('2d').getImageData(0, 0, 640, 480).data;
    // Sample the WHOLE viewport, not one column: a single column can sit behind a tree trunk and
    // report "no sky" while the frame is fine.
    const seen = new Set();
    let sky = 0, ground = 0;
    for (let y = 10; y < 350; y += 2) {
      for (let x = 12; x < 630; x += 2) {
        const p = (y * 640 + x) * 4;
        seen.add((d[p]<<16)|(d[p+1]<<8)|d[p+2]);
        if (d[p+2] > d[p] + 24) sky++; else ground++;
      }
    }
    return { distinct: seen.size, skyRows: sky, groundRows: ground };
  })()`);
  T.ok(world3d.distinct > 20, '3D viewport has real depth variety (' + world3d.distinct + ' distinct colours)');
  T.ok(world3d.skyRows > 400, 'sky is visible above the horizon (' + world3d.skyRows + ' px)');
  T.ok(world3d.groundRows > 4000, 'terrain fills the frame (' + world3d.groundRows + ' px)');

  // The heightfield must actually vary. A flat plane here is the loudest possible "not MM6" tell.
  const relief = await page.evaluate(`(() => {
    const m = Game.state.world.maps.harrowgate;
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < m.terrain.length; i++) { if (m.terrain[i] < lo) lo = m.terrain[i]; if (m.terrain[i] > hi) hi = m.terrain[i]; }
    return { lo: Math.round(lo), hi: Math.round(hi), spans: m.spans.size };
  })()`);
  T.ok(relief.hi - relief.lo > 20, 'terrain has real relief (' + relief.lo + ' to ' + relief.hi + ' units)');
  T.ok(relief.spans > 0, 'overhead spans exist (' + relief.spans + ' cells)');

  T.suite('world integrity');
  const integ = await page.evaluate(`(() => {
    const maps = Game.state.world.maps;
    const bad = [];
    let portals = 0, ents = 0;
    for (const id of Object.keys(maps)) {
      const m = maps[id];
      for (const p of m.portals) {
        if (p.shop) continue;
        portals++;
        if (p.tx === undefined || p.ty === undefined) bad.push(id + '->' + p.to + ' no landing');
        if (!maps[p.to]) bad.push(id + '->' + p.to + ' unknown destination');
        // A landing must not sit ON the reciprocal portal, or the player bounces straight back.
        const dest = maps[p.to];
        if (dest) for (const q of dest.portals) {
          if (q.shop) continue;
          if (q.x === p.tx && q.y === p.ty) bad.push(id + '->' + p.to + ' lands on a return trigger');
        }
      }
      ents += m.entities.length;
    }
    return { bad, portals, ents, maps: Object.keys(maps).length };
  })()`);
  T.eq(integ.bad, [], 'every portal has a landing that is not a return trigger');
  T.eq(integ.maps, 22, '22 maps: nine regions plus thirteen dungeons');
  T.ok(integ.portals > 40, 'portals wire the world together (' + integ.portals + ')');
  T.ok(integ.ents > 400, 'the world is populated (' + integ.ents + ' entities)');

  T.suite('spells: every special has a handler');
  const specials = await page.evaluate(`(() => {
    const missing = Spellcraft.SPECIALS.filter(sp => typeof Game.SPECIALS[sp] !== 'function');
    return { missing, declared: Spellcraft.SPECIALS.length, handlers: Object.keys(Game.SPECIALS).length };
  })()`);
  T.eq(specials.missing, [], 'every declared spell special has a game handler (no decorative spells)');
  T.ok(specials.handlers >= specials.declared, specials.handlers + ' handlers for ' + specials.declared + ' declared specials');

  // Cast ALL 99 spells for real, in the live game, and require that none throws and none reports
  // a missing handler. This is the loop that would otherwise let a spell ship as scenery.
  T.suite('spells: cast all 99 live');
  const cast = await page.evaluate(`(() => {
    Game.state.screen = null;
    window.__game.gotoMap('harrowgate', 64, 64, 0);
    const failures = [];
    let ok = 0;
    for (const id of Spellcraft.SPELL_IDS) {
      const sp = Spellcraft.SPELLS[id];
      const ch = Game.state.party.members[0];
      // Grant everything needed so the test measures the EFFECT path, not the gating path
      // (gating is asserted separately in the systems suite).
      ch.cls = 'mage';
      ch.skills[sp.school] = { lvl: 14, mastery: 3 };
      ch.spells = ch.spells || {};
      ch.spells[id] = true;
      ch.sp = 9999; ch.recovery = 0; ch.hp = Rules.maxHP(ch);
      for (const k of Object.keys(ch.cond)) ch.cond[k] = false;
      Game.state.lastError = null;
      // Give the spell something to act on.
      window.__game.spawn('goblin', Game.state.party.x + 2, Game.state.party.y);
      try {
        // Clear rather than measure length: Log is a 200-line RING BUFFER, so once it fills,
        // length stops growing and every later spell would look silent. That is a measurement
        // artefact, and it would have read as 50 broken spells.
        Core.Log.clear();
        Game.castSpell(id);
        if (Game.state.lastError && /no handler/.test(Game.state.lastError)) {
          failures.push(id + ': ' + Game.state.lastError);
        } else if (Core.Log.lines.length === 0) {
          failures.push(id + ': cast produced no log line at all');
        } else ok++;
      } catch (e) {
        failures.push(id + ': THREW ' + e.message);
      }
    }
    return { failures, ok, total: Spellcraft.SPELL_IDS.length };
  })()`);
  T.eq(cast.failures, [], 'all 99 spells cast in the live game without a missing handler or a throw');
  T.eq(cast.ok, 99, 'ninety-nine spells produced a real effect (' + cast.ok + '/' + cast.total + ')');

  T.suite('buffs are actually read');
  const buffs = await page.evaluate(`(() => {
    Game.state.screen = null;
    window.__game.gotoMap('harrowgate', 64, 64, 0);
    const ch = Game.state.party.members[0];
    Game.state.party.buffs = Object.create(null);
    const acBefore = Game.acOf(ch);
    Game.setBuff('ac', 14, 600);
    const acAfter = Game.acOf(ch);
    Game.state.party.buffs = Object.create(null);
    // Torch Light must widen the dungeon torch radius, or the Fire school's tier 1 is scenery.
    window.__game.gotoMap('barrow', 4, 4, 0);
    const t0 = Game.state.map.kind;
    Game.setBuff('light', 6, 600);
    const lit = Game.buff('light');
    Game.state.party.buffs = Object.create(null);
    return { acBefore, acAfter, lit, inDungeon: t0 === 'dungeon' };
  })()`);
  T.ok(buffs.acAfter > buffs.acBefore, 'Stone Skin raises armour class (' + buffs.acBefore + ' -> ' + buffs.acAfter + ')');
  T.ok(buffs.inDungeon, 'the barrow is a dungeon');
  T.eq(buffs.lit, 6, 'Torch Light is readable by the renderer');

  // ---- regressions from the r3 cold veteran review (NO-SHIP 4/10). Each of these was a real
  // defect a player hit in the first ten minutes; none may come back silently.
  T.suite('veteran regressions');

  const vet = await page.evaluate(`(() => {
    const out = {};
    Game.state.screen = null;
    Game.newParty([
      { name: 'A', cls: 'knight', sex: 'f', base: { mig: 16, int: 8, per: 8, end: 15, acc: 13, spd: 12, lck: 10 } },
      { name: 'B', cls: 'priest', sex: 'm', base: { mig: 10, int: 10, per: 17, end: 13, acc: 11, spd: 12, lck: 10 } },
      { name: 'C', cls: 'mage',   sex: 'f', base: { mig: 8, int: 18, per: 10, end: 12, acc: 10, spd: 13, lck: 10 } },
      { name: 'D', cls: 'ranger', sex: 'm', base: { mig: 12, int: 10, per: 10, end: 13, acc: 18, spd: 13, lck: 10 } },
    ]);

    // 1. Casters must START knowing a heal and an attack spell.
    const priest = Game.state.party.members[1], mage = Game.state.party.members[2];
    out.priestKnows = Object.keys(priest.spells || {}).length;
    out.mageKnows = Object.keys(mage.spells || {}).length;
    out.priestHeal = !!(priest.spells && priest.spells.first_aid);
    out.mageBolt = !!(mage.spells && mage.spells.fire_bolt);

    // 2. Potions must be DRINKABLE.
    const knight = Game.state.party.members[0];
    knight.hp = 3;
    const potIdx = knight.pack.findIndex(st => st.id === 'potion_heal');
    out.hadPotion = potIdx >= 0;
    Game.state.active = 0;
    out.used = potIdx >= 0 ? Game.useFromPack(potIdx, 0) : false;
    out.hpAfterPotion = knight.hp;

    // 3. Shop price must be near item VALUE, not ten times it (stack qty was multiplying in).
    const stock = Items.shopStock(Core.RNG.world('t:shop'), 'general', 2);
    const potion = stock.find(st => st.id === 'potion_heal') || { id: 'potion_heal', qty: 10 };
    out.unitValue = Items.unitValue(potion);
    out.shopPrice = Rules.buyPrice(Items.unitValue(potion), knight);
    out.priceRatio = out.shopPrice / Math.max(1, out.unitValue);

    // 4. A party wipe must be a TERMINAL event, not a state you walk around in.
    for (const c of Game.state.party.members) { c.hp = -5; c.cond.unconscious = true; }
    Game.update(16);
    out.defeatScreen = Game.state.screen;
    const beforeX = Game.state.party.x;
    Game.state.keys.fwd = true; Game.update(16); Game.update(16); Game.state.keys.fwd = false;
    out.movedWhileDead = Math.abs(Game.state.party.x - beforeX) > 0.001;
    Game.reviveAtTemple();
    out.revivedAlive = Game.state.party.members.filter(c => Rules.canAct(c)).length;
    out.revivedMap = Game.state.map.id;

    // 5. The clock must NOT run behind an open menu.
    Game.state.screen = null;
    const t0 = Core.Clock.t;
    for (let i = 0; i < 200; i++) Game.update(16);
    const played = Core.Clock.t - t0;
    Game.state.screen = 'inv';
    const t1 = Core.Clock.t;
    for (let i = 0; i < 200; i++) Game.update(16);
    out.clockPlaying = played;
    out.clockInMenu = Core.Clock.t - t1;
    Game.state.screen = null;

    return out;
  })()`);

  T.ok(vet.priestKnows >= 3, 'a level-1 priest starts knowing spells (' + vet.priestKnows + ')');
  T.ok(vet.mageKnows >= 3, 'a level-1 mage starts knowing spells (' + vet.mageKnows + ')');
  T.ok(vet.priestHeal, 'the priest starts with a heal');
  T.ok(vet.mageBolt, 'the mage starts with an attack spell');
  T.ok(vet.hadPotion, 'the party starts with healing potions');
  T.ok(vet.used, 'a healing potion can be USED');
  T.ok(vet.hpAfterPotion > 3, 'drinking it actually heals (' + vet.hpAfterPotion + ' HP)');
  T.ok(vet.priceRatio <= 2.0,
    'a shop prices ONE unit, not the stack (value ' + vet.unitValue + ' -> price ' + vet.shopPrice + ')');
  T.eq(vet.defeatScreen, 'defeat', 'a party wipe raises a defeat screen');
  T.eq(vet.movedWhileDead, false, 'a defeated party cannot walk around');
  T.eq(vet.revivedAlive, 4, 'waking at the temple revives the whole party');
  T.eq(vet.revivedMap, 'harrowgate', 'and puts them in Harrowgate');
  T.ok(vet.clockPlaying > 0, 'the clock runs during play (' + vet.clockPlaying + ' minutes)');
  T.eq(vet.clockInMenu, 0, 'the clock does NOT run behind an open menu');

  // 6. The HUD must not be clickable through a modal.
  const modal = await page.evaluate(`(() => {
    Game.state.screen = null;
    UI.draw(Game.state);
    const openCount = UI.regions().filter(r => r.id === 'btn').length;
    Game.state.screen = 'sheet';
    UI.draw(Game.state);
    const modalCount = UI.regions().filter(r => r.id === 'btn').length;
    Game.state.screen = null;
    return { openCount, modalCount };
  })()`);
  T.ok(modal.openCount >= 6, 'the HUD registers its buttons during play (' + modal.openCount + ')');
  T.eq(modal.modalCount, 0, 'and registers NONE of them behind a modal panel');

  T.eq(errors, [], 'still no page errors after exercising the harness');

  await browser.close();
  T.report('e2e');
})().catch((e) => {
  // Explicit and loud. Never swallowed.
  console.error('\ne2e: FATAL\n  ' + (e && e.stack ? e.stack : e) + '\n');
  process.exit(1);
});
