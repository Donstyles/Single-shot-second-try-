// 09_game.js — the loop, input, movement, combat, interaction, save/load.
// Owner: game. Calls everything below it.
//
// GLUE CALLS RULES. Every number here comes from Rules, Spellcraft or Items. If a formula appears
// in this file it is the mistake ARCHITECTURE.md §3 exists to prevent.

const Game = (() => {
  'use strict';

  const { clamp, RNG, Clock, Log, Bus } = Core;

  const AGGRO = 11;
  const MELEE = 1.9;
  const RECOVER_MS = 16;              // one fixed timestep of recovery per frame

  const state = {
    booted: false,
    screen: 'title',
    party: null,
    world: null,
    map: null,
    active: 0,
    keys: Object.create(null),
    pressed: null,
    selectedItem: null,
    bookSchool: 'fire',
    shopKind: null,
    shopStock: null,
    talkingTo: null,
    createSlot: 0,
    createSpec: null,
    combat: { active: false, turn: 0, order: [] },
    seenMaps: Object.create(null),
    pendingCast: null,
    lastError: null,
  };

  // ---------------------------------------------------------------- helpers
  const M = () => state.map;
  const P = () => state.party;

  function acOf(ch) {
    let ac = 0, wornSkill = null;
    for (const slot of Object.keys(ch.equip)) {
      const st = ch.equip[slot];
      if (!st) continue;
      const it = Items.def(st);
      if (it && it.ac) ac += it.ac + (st.bonus || 0);
      if (slot === 'armour' && it && it.skill) wornSkill = it.skill;
    }
    return Rules.armourClass(ch, wornSkill, ac);
  }

  // Recompute equipment bonuses. Derived, never saved — saving it is how two sources of truth start.
  function recompute(ch) {
    for (const k of Rules.STATS) ch.bonus[k] = 0;
    for (const slot of Object.keys(ch.equip)) {
      const st = ch.equip[slot];
      if (!st) continue;
      const it = Items.def(st);
      if (it && it.stat) ch.bonus[it.stat] += it.amount || 0;
      if (st.ench !== undefined && Items.ENCHANTS[st.ench] && Items.ENCHANTS[st.ench].stat) {
        ch.bonus[Items.ENCHANTS[st.ench].stat] += Items.ENCHANTS[st.ench].bonus;
      }
    }
    ch.hp = Math.min(ch.hp, Rules.maxHP(ch));
    ch.sp = Math.min(ch.sp, Rules.maxSP(ch));
  }

  const seenKey = (mapId) => state.seenMaps[mapId] || (state.seenMaps[mapId] = new Set());
  function markSeen(mapId, x, y, r) {
    const s = seenKey(mapId), m = state.world.maps[mapId];
    const rr = r || 9;
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const cx = (x | 0) + dx, cy = (y | 0) + dy;
        if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) continue;
        if (dx * dx + dy * dy > rr * rr) continue;
        s.add(cy * 4096 + cx);
      }
    }
  }
  const seen = (mapId, x, y) => seenKey(mapId).has(y * 4096 + x);

  // ---------------------------------------------------------------- party
  function defaultSpec() {
    const base = () => ({ mig: 10, int: 10, per: 10, end: 10, acc: 10, spd: 10, lck: 10 });
    return [
      { name: 'Alder', cls: 'knight', sex: 'm', base: Object.assign(base(), { mig: 16, end: 14 }) },
      { name: 'Bree', cls: 'priest', sex: 'f', base: Object.assign(base(), { per: 16, int: 12 }) },
      { name: 'Cass', cls: 'mage', sex: 'f', base: Object.assign(base(), { int: 16, spd: 12 }) },
      { name: 'Dorn', cls: 'ranger', sex: 'm', base: Object.assign(base(), { acc: 16, spd: 12 }) },
    ];
  }

  function newParty(spec) {
    const s = spec || state.createSpec || defaultSpec();
    const errs = Rules.validateCreation({ members: s });
    if (errs.length) throw new Error('invalid party: ' + errs[0]);

    const members = s.map((m, i) => {
      const ch = Rules.makeCharacter(m, i);
      ch.spells = {};
      // Starting spells: tier 1 of every school the class can actually use.
      for (const id of Spellcraft.SPELL_IDS) {
        const sp = Spellcraft.SPELLS[id];
        if (sp.tier === 1 && Rules.classCap(ch.cls, sp.school) > 0 && ch.skills[sp.school]) ch.spells[id] = true;
      }
      return ch;
    });

    state.party = {
      members, gold: 250, food: 12,
      x: 0, y: 0, z: 0, ang: 0, pitch: 0, map: 'harrowgate',
      quests: Object.create(null), flags: Object.create(null), autonotes: [],
    };

    // Starting kit, so the first fight is winnable.
    const kit = { knight: ['short_sword', 'padded'], templar: ['short_sword', 'padded'],
      ranger: ['short_bow', 'padded'], priest: ['club', 'padded'], mage: ['dagger', 'padded'],
      warden: ['quarterstaff', 'padded'] };
    members.forEach((ch) => {
      for (const id of (kit[ch.cls] || ['dagger'])) {
        const st = { id, qty: 1, ident: true, bonus: 0, charges: 0 };
        const it = Items.def(st);
        ch.equip[it.slot] = st;
      }
      ch.pack.push({ id: 'potion_heal', qty: 2, ident: true, bonus: 0, charges: 0 });
      recompute(ch);
      ch.hp = Rules.maxHP(ch); ch.sp = Rules.maxSP(ch);
    });

    enterMap('harrowgate');
    const t = state.map.town;
    state.party.x = t.x + 0.5; state.party.y = t.y + 3.5;
    state.party.z = World.walkHeight(state.map, state.party.x, state.party.y);
    state.party.ang = -Math.PI / 2;
    Log.push('Your party arrives in ' + t.name + '.', 'sys');
    return state.party;
  }

  // ---------------------------------------------------------------- maps
  function enterMap(id) {
    const m = state.world.maps[id];
    if (!m) throw new Error('no such map: ' + id);
    state.map = m;
    state.party.map = id;
    // Live entity state lives on the map object, created lazily from the generated template.
    if (!m.live) {
      m.live = m.entities.map((e) => {
        const def = Items.MONSTERS[e.kind];
        return Object.assign({}, e, {
          hp: def.hp, hpMax: def.hp, recovery: 0, dead: false, alerted: false,
        });
      });
    }
    return m;
  }

  function gotoMap(id, x, y, ang) {
    enterMap(id);
    const p = state.party;
    p.x = x + 0.5; p.y = y + 0.5;
    p.ang = ang === undefined ? p.ang : ang;
    p.z = World.walkHeight(state.map, p.x, p.y);
    markSeen(id, p.x, p.y);
    return { map: id, x: p.x, y: p.y };
  }

  function teleport(x, y, ang) {
    const p = state.party;
    p.x = x; p.y = y;
    if (ang !== undefined) p.ang = ang;
    p.z = World.walkHeight(state.map, p.x, p.y);
    markSeen(p.map, p.x, p.y);
    return { x: p.x, y: p.y, z: p.z };
  }

  // ---------------------------------------------------------------- movement
  function tryMove(nx, ny) {
    const p = state.party, m = state.map;
    // Slide along walls: try the full move, then each axis alone. Without this the party sticks on
    // every corner and the game feels broken long before anything actually is.
    if (World.passable(m, nx, ny, p.z)) { p.x = nx; p.y = ny; }
    else if (World.passable(m, nx, p.y, p.z)) p.x = nx;
    else if (World.passable(m, p.x, ny, p.z)) p.y = ny;
    else return false;
    p.z = World.walkHeight(m, p.x, p.y, p.z);
    markSeen(p.map, p.x, p.y, m.kind === 'dungeon' ? 6 : 11);
    return true;
  }

  function move(dt) {
    const p = state.party, k = state.keys;
    const spd = (k.run ? 5.6 : 3.4) * (dt / 1000);
    const turn = 2.4 * (dt / 1000);

    if (k.turnL) p.ang -= turn;
    if (k.turnR) p.ang += turn;

    let dx = 0, dy = 0;
    if (k.fwd) { dx += Math.cos(p.ang); dy += Math.sin(p.ang); }
    if (k.back) { dx -= Math.cos(p.ang); dy -= Math.sin(p.ang); }
    if (k.strafeL) { dx += Math.sin(p.ang); dy -= Math.cos(p.ang); }
    if (k.strafeR) { dx -= Math.sin(p.ang); dy += Math.cos(p.ang); }

    if (dx || dy) {
      const l = Math.hypot(dx, dy);
      tryMove(p.x + (dx / l) * spd, p.y + (dy / l) * spd);
    }
  }

  function walkCells(dir, cells) {
    // Player-legal: the campaign test uses this and nothing else to get around.
    const p = state.party;
    const ang = dir === 'fwd' ? p.ang : dir === 'back' ? p.ang + Math.PI
      : dir === 'left' ? p.ang - Math.PI / 2 : p.ang + Math.PI / 2;
    let moved = 0;
    const stepLen = 0.2;
    for (let i = 0; i < cells / stepLen; i++) {
      if (!tryMove(p.x + Math.cos(ang) * stepLen, p.y + Math.sin(ang) * stepLen)) break;
      moved += stepLen;
    }
    return moved;
  }

  // ---------------------------------------------------------------- combat
  function liveEnemies() {
    return (state.map.live || []).filter((e) => !e.dead);
  }

  function nearestEnemy(maxD) {
    const p = state.party;
    let best = null, bd = maxD === undefined ? 1e9 : maxD;
    for (const e of liveEnemies()) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function safeToRest() {
    return !nearestEnemy(14);
  }

  function weaponOf(ch) {
    const st = ch.equip.weapon || ch.equip.bow;
    if (!st) return { dmg: { n: 1, sides: 3 }, skill: 'unarmed', speed: 70, bonus: 0 };
    const it = Items.def(st);
    return { dmg: it.dmg, skill: it.skill, speed: it.speed, bonus: st.bonus || 0 };
  }

  function partyAttack(idx) {
    const ch = state.party.members[idx === undefined ? state.active : idx];
    if (!Rules.canAct(ch)) return { ok: false, why: ch.name + ' cannot act.' };
    if (ch.recovery > 0) return { ok: false, why: ch.name + ' is recovering.' };
    const target = nearestEnemy(ch.equip.bow && !ch.equip.weapon ? 18 : MELEE);
    if (!target) return { ok: false, why: 'Nothing in reach.' };

    const w = weaponOf(ch);
    const rng = RNG.live('combat');
    const atk = Rules.attackBonus(ch, w.skill, w.bonus);
    const def = Items.MONSTERS[target.kind];

    if (!Rules.rollHit(rng, atk, def.ac)) {
      Log.push(ch.name + ' misses the ' + def.name + '.', 'info');
    } else {
      const dmg = Rules.rollDamage(rng, w.dmg, Rules.statBonus(Rules.effStat(ch, 'mig')), w.bonus);
      const dealt = Rules.applyResist(dmg, (def.resist && def.resist.phys) || 0);
      target.hp -= dealt;
      Log.push(ch.name + ' hits the ' + def.name + ' for ' + dealt + '.', 'hit');
      if (target.hp <= 0) killEntityObj(target);
    }
    ch.recovery = Rules.recoveryTime(ch, w.speed, w.skill) * 8;
    return { ok: true };
  }

  function killEntityObj(e) {
    if (e.dead) return;
    e.dead = true;
    const def = Items.MONSTERS[e.kind];
    Log.push('The ' + def.name + ' falls.', 'good');

    // XP split across the living. A dead character earns nothing (Rules enforces it).
    const alive = state.party.members.filter((c) => !Rules.isDead(c));
    const share = Math.max(1, Math.round(def.xp / Math.max(1, alive.length)));
    for (const c of alive) Rules.awardXP(c, share);

    // Loot. Quest items sort first so a full pack never destroys the run.
    const rng = RNG.live('loot');
    const lck = Rules.statBonus(Rules.effStat(state.party.members[0], 'lck'));
    const loot = Items.rollLoot(rng, def.loot, lck);
    state.party.gold += loot.gold;
    if (def.drops) loot.items.push({ id: def.drops, qty: 1, ident: true, bonus: 0, charges: 0 });
    for (const st of Items.sortForPickup(loot.items)) giveStack(st);
    if (loot.gold) Log.push('Found ' + loot.gold + ' gold.', 'good');

    // Quest kill credit.
    for (const qid of Object.keys(state.party.quests)) {
      const q = World.QUESTS[qid];
      if (!q || !q.kill || state.party.quests[qid].state !== 1) continue;
      if (q.kill !== e.kind) continue;
      if (q.killIn && state.map.id !== q.killIn) continue;
      state.party.quests[qid].killed = (state.party.quests[qid].killed || 0) + 1;
    }
  }

  function monsterTurn(e, dt) {
    const p = state.party;
    const def = Items.MONSTERS[e.kind];
    const d = Math.hypot(e.x - p.x, e.y - p.y);

    if (d < AGGRO) e.alerted = true;
    if (!e.alerted) return;

    e.recovery = Math.max(0, e.recovery - dt);

    if (d > MELEE) {
      // Approach. Ground-snapped, and blocked by the same rules the party obeys.
      const sp = (dt / 1000) * (def.ai === 'brute' ? 1.6 : 2.4);
      const nx = e.x + ((p.x - e.x) / d) * sp, ny = e.y + ((p.y - e.y) / d) * sp;
      if (World.passable(state.map, nx, ny, e.z)) {
        e.x = nx; e.y = ny;
        e.z = World.walkHeight(state.map, nx, ny, e.z);
      }
      e.ang = Math.atan2(p.y - e.y, p.x - e.x);
      return;
    }

    if (e.recovery > 0) return;

    // Attack a random living party member.
    const alive = p.members.filter((c) => !Rules.isDead(c) && !(c.cond && c.cond.unconscious));
    if (!alive.length) return;
    const rng = RNG.live('combat');
    const victim = rng.pick(alive);
    if (Rules.rollHit(rng, def.atk, acOf(victim))) {
      const dmg = Rules.rollDamage(rng, def.dmg, 0, 0);
      const r = Rules.applyDamage(victim, dmg);
      Log.push('The ' + def.name + ' hits ' + victim.name + ' for ' + r.dmg + '.', 'hit');
      if (r.died) Log.push(victim.name + ' has died!', 'hit');
      else if (r.knocked) Log.push(victim.name + ' is knocked out.', 'hit');
      if (def.inflict && victim.cond && rng.chance(0.25)) victim.cond[def.inflict] = true;
    } else {
      Log.push('The ' + def.name + ' misses ' + victim.name + '.', 'info');
    }
    e.recovery = def.speed * 8;
  }

  // ---------------------------------------------------------------- interaction
  function giveStack(st) {
    const p = state.party;
    const cap = Items.maxStack(st.id);
    // Stack first, then find a slot on whoever has room.
    for (const ch of p.members) {
      if (cap > 1) {
        const ex = ch.pack.find((s) => s.id === st.id && (s.qty || 1) < cap);
        if (ex) { ex.qty = (ex.qty || 1) + (st.qty || 1); return true; }
      }
    }
    for (const ch of p.members) {
      if (ch.pack.length < 30) { ch.pack.push(st); return true; }
    }
    Log.push('No room for ' + Items.displayName(st) + '!', 'hit');
    return false;
  }

  function grantItem(id, n) {
    const st = { id, qty: n || 1, ident: true, bonus: 0, charges: 0 };
    giveStack(st);
    return st;
  }

  function grantXP(n) {
    for (const c of state.party.members) Rules.awardXP(c, n);
    return n;
  }

  function healParty() {
    for (const c of state.party.members) {
      c.cond.dead = false; c.cond.unconscious = false; c.cond.poison = false;
      c.cond.disease = false; c.cond.curse = false; c.cond.asleep = false;
      c.cond.afraid = false; c.cond.weak = false;
      c.hp = Rules.maxHP(c); c.sp = Rules.maxSP(c);
    }
    return true;
  }

  function countItem(id) {
    let n = 0;
    for (const ch of state.party.members) {
      for (const st of ch.pack) if (st.id === id) n += st.qty || 1;
      for (const slot of Object.keys(ch.equip)) {
        const s = ch.equip[slot];
        if (s && s.id === id) n += s.qty || 1;
      }
    }
    return n;
  }

  function consumeItem(id, n) {
    let need = n || 1;
    for (const ch of state.party.members) {
      for (let i = ch.pack.length - 1; i >= 0 && need > 0; i--) {
        if (ch.pack[i].id !== id) continue;
        const have = ch.pack[i].qty || 1;
        const take = Math.min(have, need);
        need -= take;
        if (have - take <= 0) ch.pack.splice(i, 1); else ch.pack[i].qty = have - take;
      }
    }
    return need === 0;
  }

  function questComplete(qid) {
    const q = World.QUESTS[qid], st = state.party.quests[qid];
    if (!q || !st || st.state !== 1) return false;
    if (q.need) return countItem(q.need) >= (q.count || 1);
    if (q.kill) return (st.killed || 0) >= (q.count || 1);
    return false;
  }

  function turnInQuest(qid) {
    const q = World.QUESTS[qid];
    if (!questComplete(qid)) return false;
    if (q.need) consumeItem(q.need, q.count || 1);
    state.party.quests[qid].state = 2;
    state.party.gold += q.gold;
    grantXP(q.xp);
    Log.push('Quest complete: ' + q.name + '  (+' + q.xp + ' xp, +' + q.gold + 'g)', 'good');
    state.party.autonotes.push(q.name + ' — completed');
    if (q.final) { state.party.flags.won = true; Log.push('THE ASHEN CROWN IS BROKEN. You have won.', 'good'); }
    return true;
  }

  // What is in front of the party right now?
  function interactTarget() {
    const p = state.party, m = state.map;
    const fx = p.x + Math.cos(p.ang) * 1.4, fy = p.y + Math.sin(p.ang) * 1.4;

    for (const n of m.npcs || []) {
      if (Math.hypot(n.x - p.x, n.y - p.y) < 2.6) return { kind: 'npc', npc: n };
    }
    for (const d of m.decor) {
      if (d.kind !== 'chest' && d.kind !== 'questitem') continue;
      if (Math.hypot(d.x - p.x, d.y - p.y) < 2.0) return { kind: d.kind, decor: d };
    }
    for (const portal of m.portals) {
      if (Math.hypot(portal.x + 0.5 - fx, portal.y + 0.5 - fy) < 1.6 ||
          Math.hypot(portal.x + 0.5 - p.x, portal.y + 0.5 - p.y) < 1.3) return { kind: 'portal', portal };
    }
    return null;
  }

  function interact() {
    const t = interactTarget();
    if (!t) { Log.push('Nothing here.', 'info'); return false; }

    if (t.kind === 'npc') {
      state.talkingTo = t.npc;
      state.screen = 'dialogue';
      return true;
    }
    if (t.kind === 'chest') {
      if (t.decor.opened) { Log.push('Already looted.', 'info'); return false; }
      t.decor.opened = true;
      const rng = RNG.live('loot');
      const loot = Items.rollLoot(rng, t.decor.tier, 0);
      state.party.gold += loot.gold;
      for (const st of Items.sortForPickup(loot.items)) giveStack(st);
      Log.push('The chest holds ' + loot.gold + ' gold' + (loot.items.length ? ' and something else.' : '.'), 'good');
      return true;
    }
    if (t.kind === 'questitem') {
      if (t.decor.taken) return false;
      t.decor.taken = true;
      grantItem(t.decor.item, 1);
      Log.push('Taken: ' + Items.ITEMS[t.decor.item].name, 'good');
      return true;
    }
    if (t.kind === 'portal') {
      return usePortal(t.portal);
    }
    return false;
  }

  function usePortal(portal) {
    if (portal.shop) {
      state.shopKind = portal.shop;
      const day = Clock.day;
      state.shopStock = Items.shopStock(
        RNG.world('shop:' + state.map.id + ':' + portal.shop + ':' + day),
        portal.shop, clamp(1 + Math.round((state.map.level || 1) / 3), 1, 4));
      state.screen = 'shop';
      return true;
    }
    if (portal.locked && !countItem(portal.locked)) {
      Log.push('The way is barred. Something is missing.', 'info');
      return false;
    }
    // Landing coordinates are mandatory and validated at build time; trust but verify.
    if (portal.tx === undefined || portal.ty === undefined) {
      state.lastError = 'portal to ' + portal.to + ' has no landing coordinates';
      Log.push('The way leads nowhere. (bug)', 'hit');
      return false;
    }
    gotoMap(portal.to, portal.tx, portal.ty, portal.tang);
    Log.push('You enter ' + state.map.name + '.', 'sys');
    return true;
  }

  function doRest() {
    const can = Rules.canRest(state.party, safeToRest());
    if (!can.ok) { Log.push(can.why, 'info'); return false; }
    const res = Rules.restResult(state.party);
    state.party.food += res.food;
    Clock.skip(res.minutes);
    for (const d of res.members) {
      const ch = state.party.members.find((c) => c.id === d.id);
      ch.hp = Math.min(Rules.maxHP(ch), ch.hp + d.hp);
      ch.sp = Math.min(Rules.maxSP(ch), ch.sp + d.sp);
      for (const c of d.clears) ch.cond[c] = false;
    }
    Log.push('You make camp and sleep.', 'good');
    state.screen = null;
    return true;
  }

  function castSpell(id) {
    const ch = state.party.members[state.active];
    const can = Spellcraft.canCast(ch, id, { underground: state.map.kind === 'dungeon' });
    if (!can.ok) { Log.push(can.why, 'info'); return false; }

    const sp = Spellcraft.SPELLS[id];
    const rng = RNG.live('magic');
    let targets = [];
    if (sp.target === 'enemy') { const t = nearestEnemy(20); targets = t ? [wrapEnemy(t)] : []; }
    else if (sp.target === 'enemies') targets = liveEnemies().filter((e) =>
      Math.hypot(e.x - state.party.x, e.y - state.party.y) < 20).slice(0, 6).map(wrapEnemy);
    else if (sp.target === 'ally') targets = [ch];
    else if (sp.target === 'party' || sp.target === 'self') targets = state.party.members;

    if (!targets.length) { Log.push('No target.', 'info'); return false; }

    const out = Spellcraft.resolve(ch, id, targets, rng, {});
    ch.sp -= out.cost;
    ch.recovery = 100 * 8;

    for (const eff of out.effects) applyEffect(eff);
    Log.push(ch.name + ' casts ' + sp.name + '.', 'good');
    state.screen = null;
    return true;
  }

  // Spells resolve against a uniform target shape; monsters get wrapped so resolve() does not need
  // to know the difference between a character and an entity.
  function wrapEnemy(e) {
    const def = Items.MONSTERS[e.kind];
    return { __entity: e, name: def.name, hp: e.hp, resist: def.resist || {} };
  }

  function applyEffect(eff) {
    const t = eff.target;
    if (eff.kind === 'damage') {
      if (t.__entity) {
        t.__entity.hp -= eff.amount;
        Log.push('The ' + t.name + ' takes ' + eff.amount + '.', 'hit');
        if (t.__entity.hp <= 0) killEntityObj(t.__entity);
      } else if (t.cond) {
        Rules.applyDamage(t, eff.amount);
      }
    } else if (eff.kind === 'heal') {
      if (t.cond) { const h = Rules.healTo(t, eff.amount); if (h) Log.push(t.name + ' recovers ' + h + '.', 'good'); }
    } else if (eff.kind === 'cure') {
      if (t.cond) for (const c of eff.conds) t.cond[c] = false;
    } else if (eff.kind === 'buff') {
      // Buffs are stored on the party and read by the systems that care.
      state.party.flags['buff_' + eff.buff] = Clock.t + eff.dur;
    } else if (eff.kind === 'status') {
      if (t.__entity) t.__entity[eff.status] = Clock.t + eff.dur;
    }
  }

  // ---------------------------------------------------------------- save / load
  const SAVE_KEY = 'thornmarch.save.';

  function save(slot) {
    const d = {
      v: 3, seed: state.world.seed, t: Clock.t,
      party: state.party,
      rng: RNG.dump(),
      seen: Object.keys(state.seenMaps).reduce((a, k) => { a[k] = Array.from(state.seenMaps[k]); return a; }, {}),
      maps: {},
    };
    // Only the DELTA from the generated world: killed entities, opened chests, taken quest items.
    for (const id of Object.keys(state.world.maps)) {
      const m = state.world.maps[id];
      const dead = (m.live || []).filter((e) => e.dead).map((e) => e.eid);
      const opened = m.decor.filter((x) => x.opened || x.taken).map((x) => x.id);
      if (dead.length || opened.length) d.maps[id] = { dead, opened };
    }
    try { localStorage.setItem(SAVE_KEY + (slot || 0), JSON.stringify(d)); } catch (e) { return false; }
    return true;
  }

  function load(slot) {
    let raw;
    try { raw = localStorage.getItem(SAVE_KEY + (slot || 0)); } catch (e) { return false; }
    if (!raw) return false;

    // SNIFF BEFORE MUTATING, and roll back on failure. A hostile save once produced a 91-error
    // crash loop because load wrote into live state as it parsed.
    let d;
    try { d = JSON.parse(raw); } catch (e) { Log.push('Save is corrupt.', 'hit'); return false; }
    const bad = [];
    if (!d || typeof d !== 'object') bad.push('not an object');
    else {
      if (d.v !== 3) bad.push('schema v' + d.v + ' (expected 3)');
      if (typeof d.seed !== 'number') bad.push('no seed');
      if (!d.party || !Array.isArray(d.party.members) || d.party.members.length !== 4) bad.push('party malformed');
      if (!d.rng || typeof d.rng.seed !== 'number') bad.push('rng state missing');
      if (d.party && !state.world.maps[d.party.map]) bad.push('unknown map ' + (d.party && d.party.map));
    }
    if (bad.length) { Log.push('Save rejected: ' + bad[0], 'hit'); return false; }

    const backup = { party: state.party, seen: state.seenMaps, mapId: state.party && state.party.map };
    try {
      RNG.restore(d.rng);
      Clock.t = d.t;
      state.party = d.party;
      state.seenMaps = Object.create(null);
      for (const k of Object.keys(d.seen || {})) state.seenMaps[k] = new Set(d.seen[k]);
      for (const id of Object.keys(state.world.maps)) {
        const m = state.world.maps[id];
        if (!m.live) enterMap(id);
        const delta = (d.maps || {})[id];
        if (m.live) for (const e of m.live) e.dead = !!(delta && delta.dead.indexOf(e.eid) >= 0);
        for (const x of m.decor) {
          const on = !!(delta && delta.opened.indexOf(x.id) >= 0);
          if (x.kind === 'chest') x.opened = on;
          if (x.kind === 'questitem') x.taken = on;
        }
      }
      enterMap(state.party.map);
      for (const ch of state.party.members) recompute(ch);
      state.screen = null;
      Log.push('Game loaded.', 'sys');
      return true;
    } catch (e) {
      state.party = backup.party; state.seenMaps = backup.seen;
      if (backup.mapId) enterMap(backup.mapId);
      Log.push('Load failed and was rolled back.', 'hit');
      return false;
    }
  }

  // ---------------------------------------------------------------- input
  function onKey(k, down) {
    state.keys[k] = down;
    if (!down) return;
    if (k === 'act') interact();
    if (k === 'sheet') openScreen('sheet');
    if (k === 'inv') openScreen('inv');
    if (k === 'book') openScreen('book');
    if (k === 'map') openScreen('map');
    if (k === 'rest') openScreen('rest');
    if (k === 'esc') closeScreens();
    if (k === 'next') state.active = (state.active + 1) % 4;
    if (k === '1' || k === '2' || k === '3' || k === '4') state.active = parseInt(k, 10) - 1;
  }

  function openScreen(name) {
    if (name === 'menu') { save(0); Log.push('Saved.', 'sys'); return null; }
    state.screen = state.screen === name ? null : name;
    return state.screen;
  }
  function closeScreens() { state.screen = null; state.talkingTo = null; return true; }

  function onTap(x, y, down) {
    const r = UI.hit(x, y);
    if (!r) { if (!down) state.pressed = null; return; }

    if (down) {
      if (r.id === 'move') { state.keys[r.data] = true; state.pressed = r.data; }
      else state.pressed = r.data;
      return;
    }

    // Release: clear held movement, then act.
    for (const k of ['fwd', 'back', 'turnL', 'turnR']) state.keys[k] = false;
    state.pressed = null;

    switch (r.id) {
      case 'pc': state.active = r.data; break;
      case 'btn': openScreen(r.data); break;
      case 'act': interact(); break;
      case 'cast': typeof r.data === 'string' ? castSpell(r.data) : openScreen('book'); break;
      case 'wait': stepTurn(); break;
      case 'close': closeScreens(); break;
      case 'item': state.selectedItem = r.data; break;
      case 'doequip': equipFromPack(r.data); break;
      case 'drop': dropFromPack(r.data); break;
      case 'equip': unequip(r.data); break;
      case 'school': state.bookSchool = r.data; break;
      case 'buy': buy(r.data); break;
      case 'templeheal': if (state.party.gold >= r.data) { state.party.gold -= r.data; healParty(); Log.push('You are made whole.', 'good'); } break;
      case 'tavernrest': if (state.party.gold >= r.data) { state.party.gold -= r.data; Clock.skip(480); healParty(); Log.push('You sleep at the inn.', 'good'); } break;
      case 'buyfood': if (state.party.gold >= r.data) { state.party.gold -= r.data; state.party.food += 1; } break;
      case 'train': doTrain(r.data); break;
      case 'skillup': doSkillUp(r.data); break;
      case 'acceptquest': acceptQuest(r.data); break;
      case 'turnin': turnInQuest(r.data); closeScreens(); break;
      case 'dorest': doRest(); break;
      case 'newgame': startCreation(); break;
      case 'continue': if (!load(0)) { startCreation(); } else state.screen = null; break;
      case 'cslot': state.createSlot = r.data; break;
      case 'cclass': state.createSpec[state.createSlot].cls = r.data; break;
      case 'statup': bumpStat(r.data, 1); break;
      case 'statdn': bumpStat(r.data, -1); break;
      case 'startgame': newParty(state.createSpec); state.screen = null; break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- actions
  function equipFromPack(i) {
    const ch = state.party.members[state.active];
    const st = ch.pack[i];
    if (!st) return false;
    const it = Items.def(st);
    if (!it || !it.slot) { Log.push('Cannot equip that.', 'info'); return false; }
    const prev = ch.equip[it.slot];
    ch.equip[it.slot] = st;
    ch.pack.splice(i, 1);
    if (prev) ch.pack.push(prev);
    recompute(ch);
    state.selectedItem = null;
    return true;
  }

  function unequip(slot) {
    const ch = state.party.members[state.active];
    const st = ch.equip[slot];
    if (!st) return false;
    if (ch.pack.length >= 30) { Log.push('Pack is full.', 'info'); return false; }
    ch.equip[slot] = null;
    ch.pack.push(st);
    recompute(ch);
    return true;
  }

  function dropFromPack(i) {
    const ch = state.party.members[state.active];
    const st = ch.pack[i];
    if (!st) return false;
    if (Items.isQuest(st)) { Log.push('You should keep that.', 'info'); return false; }
    ch.pack.splice(i, 1);
    state.selectedItem = null;
    return true;
  }

  function buy(i) {
    const ch = state.party.members[state.active];
    const st = state.shopStock[i];
    if (!st) return false;
    const price = Rules.buyPrice(Items.value(st), ch);
    if (state.party.gold < price) { Log.push('Not enough gold.', 'info'); return false; }
    state.party.gold -= price;
    giveStack({ id: st.id, qty: 1, ident: true, bonus: 0, charges: 0 });
    Log.push('Bought ' + Items.ITEMS[st.id].name + '.', 'good');
    return true;
  }

  function doTrain(cost) {
    const ch = state.party.members[state.active];
    if (state.party.gold < cost) { Log.push('Not enough gold.', 'info'); return false; }
    const gained = Rules.promote(ch);
    if (!gained) { Log.push('Not enough experience.', 'info'); return false; }
    state.party.gold -= cost;
    Log.push(ch.name + ' reaches level ' + ch.level + '.', 'good');
    return true;
  }

  function doSkillUp(skill) {
    const ch = state.party.members[state.active];
    if (Rules.classCap(ch.cls, skill) === 0) { Log.push('That class cannot learn it.', 'info'); return false; }
    const cur = ch.skills[skill];
    const cost = Rules.skillUpCost(cur ? cur.lvl : 0);
    if (ch.skillPts < cost) { Log.push('Not enough skill points.', 'info'); return false; }
    ch.skillPts -= cost;
    if (!cur) ch.skills[skill] = { lvl: 1, mastery: Rules.MASTERY.NOVICE };
    else {
      cur.lvl++;
      // Mastery advances when the level threshold is met and the class allows it.
      const cap = Rules.classCap(ch.cls, skill);
      if (cur.lvl >= Rules.masteryReq(Rules.MASTERY.MASTER).lvl && cap >= 3) cur.mastery = Rules.MASTERY.MASTER;
      else if (cur.lvl >= Rules.masteryReq(Rules.MASTERY.EXPERT).lvl && cap >= 2) cur.mastery = Rules.MASTERY.EXPERT;
    }
    // Learning a magic school grants its tier-1 spell, or the skill is inert.
    for (const id of Spellcraft.SPELL_IDS) {
      const sp = Spellcraft.SPELLS[id];
      if (sp.school === skill && sp.tier <= 2 && Spellcraft.learnable(ch, id)) ch.spells[id] = true;
    }
    recompute(ch);
    return true;
  }

  function acceptQuest(qid) {
    if (!state.party.quests[qid]) state.party.quests[qid] = { state: 1, killed: 0 };
    else state.party.quests[qid].state = 1;
    Log.push('Quest accepted: ' + World.QUESTS[qid].name, 'sys');
    state.party.autonotes.push(World.QUESTS[qid].name);
    closeScreens();
    return true;
  }

  function startCreation() {
    state.createSpec = defaultSpec();
    state.createSlot = 0;
    state.screen = 'creation';
  }

  function bumpStat(s, d) {
    const spec = state.createSpec[state.createSlot];
    const v = spec.base[s] + d;
    if (v < Rules.STAT_MIN || v > Rules.STAT_MAX) return false;
    const trial = Object.assign({}, spec.base); trial[s] = v;
    if (Rules.creationCost(trial) > Rules.CREATE_POINTS) return false;
    spec.base[s] = v;
    return true;
  }

  // Advance one combat "round": everyone gets recovery time, which is what stops the deadlock where
  // the budget drains and nothing ever becomes ready again.
  function stepTurn() {
    const quantum = 120;
    for (const ch of state.party.members) ch.recovery = Math.max(0, ch.recovery - quantum);
    for (const e of liveEnemies()) monsterTurn(e, quantum);
    Clock.advance(quantum);
    return true;
  }

  // ---------------------------------------------------------------- loop
  function boot() {
    if (state.booted) return;
    state.booted = true;

    // UI is handed `state`, so the few queries it needs live on it. UI must never compute these
    // itself — that is how a second implementation of a rule gets born.
    state.acOf = acOf;
    state.seen = seen;
    state.safeToRest = safeToRest;
    state.questComplete = questComplete;

    state.world = World.build(7);
    state.createSpec = defaultSpec();
    // A party exists from boot so the harness can drive the sim before anyone presses New Game.
    if (!state.party) {
      try { newParty(defaultSpec()); } catch (e) { state.lastError = e.message; }
    }
    state.screen = 'title';
    if (typeof Sprites !== 'undefined' && typeof window !== 'undefined' && window.__BAKED__) {
      Sprites.installBaked(window.__BAKED__);
      Sprites.prepareBaked().then((r) => { Sprites.BAKED.__ready = r; }).catch(() => {});
    }
  }

  function update(dt) {
    Clock.advance(dt);
    Art.step();
    if (state.screen === 'title' || state.screen === 'creation' || !state.party) return;

    if (!state.screen) move(dt);

    for (const ch of state.party.members) {
      ch.recovery = Math.max(0, ch.recovery - dt);
      // Regeneration buff.
      if (state.party.flags.buff_regen > Clock.t && (Clock.t & 7) === 0) Rules.healTo(ch, 1);
    }

    const enemies = liveEnemies();
    let anyAlerted = false;
    for (const e of enemies) {
      if (Math.hypot(e.x - state.party.x, e.y - state.party.y) < 26) monsterTurn(e, dt);
      if (e.alerted) anyAlerted = true;
    }
    state.combat.active = anyAlerted && !!nearestEnemy(AGGRO);
  }

  function render() {
    const En = Engine;
    if (state.screen === 'title' || state.screen === 'creation') {
      En.clear(Core.idx(0, 1));
      UI.draw(state);
      return;
    }

    const p = state.party;
    const cam = {
      x: p.x, y: p.y, z: p.z, ang: p.ang, map: state.map,
      horizon: Math.round((p.pitch || 0) * 140),
      torch: state.map.kind === 'dungeon' ? 8.5 : 99,
    };
    En.clear(Core.idx(0, 1));
    En.render3D(cam, state.world);
    drawEntities(cam);
    UI.draw(state);
  }

  // Sprites, sorted far to near so nearer ones overwrite.
  function drawEntities(cam) {
    const m = state.map;
    const list = [];

    for (const d of m.decor) {
      if (d.kind === 'chest' && d.opened) continue;
      if (d.kind === 'questitem' && d.taken) continue;
      const dist = Math.hypot(d.x - cam.x, d.y - cam.y);
      if (dist > m.fogEnd) continue;
      list.push({ dist, spr: Sprites.decor(d.kind), x: d.x, y: d.y,
        z: m.kind === 'dungeon' ? 0 : World.H(m, d.x, d.y),
        h: Sprites.DECOR_HEIGHT[d.kind] || 2 });
    }
    for (const n of m.npcs || []) {
      const dist = Math.hypot(n.x - cam.x, n.y - cam.y);
      if (dist > m.fogEnd) continue;
      list.push({ dist, spr: Sprites.creature('npc_' + n.role), x: n.x, y: n.y,
        z: World.H(m, n.x, n.y), h: 1.8 });
    }
    for (const e of (m.live || [])) {
      if (e.dead) continue;
      const dist = Math.hypot(e.x - cam.x, e.y - cam.y);
      if (dist > m.fogEnd) continue;
      const f = Engine.facingFor(e.ang, cam.x, cam.y, e.x, e.y, 5);
      const def = Items.MONSTERS[e.kind];
      list.push({ dist, spr: Sprites.creature(e.kind, f.index), mirror: f.mirror,
        x: e.x, y: e.y, z: World.walkHeight(m, e.x, e.y, e.z),
        h: /ogre|troll|elemental|crown|knight/.test(e.kind) ? 2.9 : /rat|spider/.test(e.kind) ? 0.9 : 1.9 });
    }

    list.sort((a, b) => b.dist - a.dist);
    const lit = m.kind === 'dungeon' ? 0 : Art.sunShade(1);
    for (const s of list) {
      Engine.drawSprite(cam, s.spr, s.x, s.y, s.z, s.h,
        { lit: lit + (m.kind === 'dungeon' ? Engine.dungeonLight(cam, s.x, s.y, m) : 0), mirror: s.mirror });
    }
  }

  // ---------------------------------------------------------------- introspection
  function dumpState() {
    const p = state.party;
    if (!p) return null;
    return {
      map: p.map,
      pos: [Number(p.x.toFixed(4)), Number(p.y.toFixed(4)), Number(p.z.toFixed(4))],
      ang: Number(p.ang.toFixed(4)),
      gold: p.gold, food: p.food,
      quests: p.quests,
      members: p.members.map((c) => ({
        name: c.name, cls: c.cls, level: c.level, xp: c.xp, hp: c.hp, sp: c.sp,
        cond: c.cond, skillPts: c.skillPts,
        pack: c.pack.map((s) => s.id + 'x' + (s.qty || 1)),
        equip: Object.keys(c.equip).sort().map((k) => k + ':' + (c.equip[k] ? c.equip[k].id : '-')),
      })),
      dead: Object.keys(state.world.maps).sort().map((id) =>
        id + ':' + ((state.world.maps[id].live || []).filter((e) => e.dead).length)),
    };
  }

  function brief() {
    const p = state.party;
    return p ? { map: p.map, gold: p.gold, hp: p.members.map((c) => c.hp), screen: state.screen,
      won: !!p.flags.won, level: p.members[0].level } : { none: true };
  }

  function invariants() {
    const bad = [];
    const p = state.party;
    if (!p) return bad;
    for (const ch of p.members) {
      if (ch.hp > Rules.maxHP(ch)) bad.push(ch.name + ' hp above max');
      if (ch.hp < -10) bad.push(ch.name + ' hp below floor');
      if (ch.sp > Rules.maxSP(ch)) bad.push(ch.name + ' sp above max');
      if (ch.pack.length > 30) bad.push(ch.name + ' pack overflow');
      if (ch.cond.dead && ch.hp > 0) bad.push(ch.name + ' dead but positive hp');
    }
    if (p.gold < 0) bad.push('negative gold');
    if (!state.world.maps[p.map]) bad.push('party on unknown map');
    // Every portal must have landing coordinates. This is the v1 softlock, asserted at runtime.
    for (const id of Object.keys(state.world.maps)) {
      for (const portal of state.world.maps[id].portals) {
        if (portal.shop) continue;
        if (portal.tx === undefined || portal.ty === undefined) bad.push(id + ' portal to ' + portal.to + ' has no landing');
      }
    }
    return bad;
  }

  // Count every item everywhere. The conservation probe: how to refuse to chase a duplication ghost.
  function census() {
    const byId = Object.create(null);
    let total = 0;
    for (const ch of state.party.members) {
      for (const st of ch.pack) { byId[st.id] = (byId[st.id] || 0) + (st.qty || 1); total += st.qty || 1; }
      for (const slot of Object.keys(ch.equip)) {
        const s = ch.equip[slot];
        if (s) { byId[s.id] = (byId[s.id] || 0) + 1; total += 1; }
      }
    }
    return { total, byId, gold: state.party.gold };
  }

  function debugLines() {
    const p = state.party;
    if (!p) return ['no party'];
    return [
      'map ' + p.map + ' ' + state.map.w + 'x' + state.map.h,
      'pos ' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' z' + p.z.toFixed(2) + ' a' + p.ang.toFixed(2),
      'enemies ' + liveEnemies().length + '  combat ' + state.combat.active,
      state.lastError ? 'ERR ' + state.lastError : '',
    ].filter(Boolean);
  }

  return {
    state, boot, update, render, onKey, onTap,
    newParty, gotoMap, teleport, walkCells, openScreen, closeScreens,
    grantItem, grantXP, healParty, save, load,
    interact, castSpell, doRest, stepTurn, acceptQuest, turnInQuest, questComplete,
    killEntity: (eid) => { const e = (state.map.live || []).find((x) => x.eid === eid); if (e) killEntityObj(e); return !!e; },
    spawnEntity: (kind, x, y) => {
      const def = Items.MONSTERS[kind];
      const e = { eid: 'spawn' + Math.round(Clock.t) + '_' + (state.map.live || []).length, kind, x, y,
        z: World.walkHeight(state.map, x, y), ang: 0, hp: def.hp, hpMax: def.hp, recovery: 0, dead: false, alerted: true };
      (state.map.live || (state.map.live = [])).push(e);
      return e;
    },
    acOf, seen, safeToRest, countItem, dumpState, brief, invariants, census, debugLines,
    get party() { return state.party; },
    get map() { return state.map; },
    get screen() { return state.screen; },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Game;
