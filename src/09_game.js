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
    return Rules.armourClass(ch, wornSkill, ac) + buff('ac') + Math.round(buff('shield') * 0.5) + buff('day_of_gods');
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
      // Starting spells: tiers 1-3 of every school the class is TRAINED in, plus a guaranteed
      // heal for divine casters and a guaranteed attack cantrip for arcane ones. A party that
      // cannot heal or hurt anything at level 1 is not a party.
      for (const id of Spellcraft.SPELL_IDS) {
        const sp = Spellcraft.SPELLS[id];
        if (sp.tier <= 3 && Rules.classCap(ch.cls, sp.school) > 0 && ch.skills[sp.school]) ch.spells[id] = true;
      }
      for (const guaranteed of ['first_aid', 'fire_bolt', 'mind_blast', 'light_bolt', 'cure_weak', 'torch_light']) {
        const sp = Spellcraft.SPELLS[guaranteed];
        if (Rules.classCap(ch.cls, sp.school) > 0) {
          if (!ch.skills[sp.school]) ch.skills[sp.school] = { lvl: 1, mastery: Rules.MASTERY.NOVICE };
          ch.spells[guaranteed] = true;
        }
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
  // Materialise a map's live entities from its generated template. NO side effects on party state:
  // this is called for every map during load, and if it also moved the party the load would end
  // with the party standing on whichever map happened to be last.
  function ensureLive(m) {
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

  function enterMap(id) {
    const m = state.world.maps[id];
    if (!m) throw new Error('no such map: ' + id);
    ensureLive(m);
    state.map = m;
    state.party.map = id;
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
    // Water Walk and Fly genuinely change where the party may go.
    if (buff('fly') || buff('waterwalk')) {
      const h = World.H(m, nx, ny);
      const cx = Math.floor(nx), cy = Math.floor(ny);
      if (nx > 0.4 && ny > 0.4 && nx < m.w - 0.4 && ny < m.h - 0.4 && !World.isSolid(World.cellAt(m, cx, cy))) {
        p.x = nx; p.y = ny;
        p.z = buff('fly') ? Math.max(h, p.z) : Math.max(h, m.sea);
        markSeen(p.map, p.x, p.y, m.kind === 'dungeon' ? 6 : 11);
        return true;
      }
    }
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

  function reachOf(ch) {
    return (ch.equip.bow && !ch.equip.weapon) ? 18 : MELEE;
  }

  function partyAttack(idx) {
    const ch = state.party.members[idx === undefined ? state.active : idx];
    if (!Rules.canAct(ch)) return { ok: false, why: ch.name + ' cannot act.' };
    if (ch.recovery > 0) return { ok: false, why: ch.name + ' is recovering.' };
    const target = nearestEnemy(reachOf(ch));
    if (!target) return { ok: false, why: 'Nothing in reach.' };

    const w = weaponOf(ch);
    const rng = RNG.live('combat');
    const atk = Rules.attackBonus(ch, w.skill, w.bonus) + buff('hit') + Math.round(buff('acc') / 2) + buff('day_of_gods');
    const def = Items.MONSTERS[target.kind];

    if (!Rules.rollHit(rng, atk, def.ac)) {
      Log.push(ch.name + ' misses the ' + def.name + '.', 'info');
    } else {
      const bonus = w.bonus + buff('dmg') + buff('hammerhands') + buff('day_of_gods');
      const dmg = Rules.rollDamage(rng, w.dmg, Rules.statBonus(Rules.effStat(ch, 'mig')), bonus);
      let dealt = Rules.applyResist(dmg, (def.resist && def.resist.phys) || 0);
      // A weapon enchanted by Fire Aura / Vampiric Weapon adds its element on top.
      const wp = ch.equip.weapon || ch.equip.bow;
      if (wp && wp.elem && wp.elemUntil > Clock.t) {
        const ex = Rules.applyResist(wp.elemAmount + Math.round(ch.level / 2), (def.resist && def.resist[wp.elem]) || 0);
        dealt += ex;
        if (wp.elem === 'drain') Rules.healTo(ch, Math.round(ex * 0.5));
      }
      target.hp -= dealt;
      Log.push(ch.name + ' hits the ' + def.name + ' for ' + dealt + '.', 'hit');
      if (target.hp <= 0) killEntityObj(target);
    }
    ch.recovery = Math.round(Rules.recoveryTime(ch, w.speed, w.skill) * 8 * (buff('haste') ? 0.6 : 1));
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

  function allyTurn(e, dt) {
    const def = Items.MONSTERS[e.kind];
    let foe = null, bd = 14;
    for (const o of liveEnemies()) {
      if (o === e || o.ally || o.charmed > Clock.t || o.enslaved > Clock.t) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < bd) { bd = d; foe = o; }
    }
    if (!foe) return;
    e.recovery = Math.max(0, e.recovery - dt);
    if (bd > MELEE) {
      const sp = (dt / 1000) * 2.2;
      const nx = e.x + ((foe.x - e.x) / bd) * sp, ny = e.y + ((foe.y - e.y) / bd) * sp;
      if (World.passable(state.map, nx, ny, e.z)) { e.x = nx; e.y = ny; e.z = World.walkHeight(state.map, nx, ny, e.z); }
      e.ang = Math.atan2(foe.y - e.y, foe.x - e.x);
      return;
    }
    if (e.recovery > 0) return;
    const rng = RNG.live('combat');
    const fdef = Items.MONSTERS[foe.kind];
    if (Rules.rollHit(rng, def.atk, fdef.ac)) {
      const dmg = Rules.rollDamage(rng, def.dmg, 0, 0);
      foe.hp -= dmg;
      Log.push('The ' + def.name + ' turns on the ' + fdef.name + '.', 'good');
      if (foe.hp <= 0) killEntityObj(foe);
    }
    e.recovery = def.speed * 8;
  }

  function monsterTurn(e, dt) {
    const p = state.party;
    const def = Items.MONSTERS[e.kind];
    const d = Math.hypot(e.x - p.x, e.y - p.y);

    // Timed statuses genuinely take a monster out of the fight. Without this, Charm and Paralyze
    // are decorative and the Mind school is a trap.
    if (e.paralysed > Clock.t || e.stunned > Clock.t) { e.recovery = Math.max(0, e.recovery - dt); return; }
    if (e.afraid > Clock.t) {
      const away = Math.atan2(e.y - p.y, e.x - p.x);
      const sp = (dt / 1000) * 2.2;
      const nx = e.x + Math.cos(away) * sp, ny = e.y + Math.sin(away) * sp;
      if (World.passable(state.map, nx, ny, e.z)) { e.x = nx; e.y = ny; e.z = World.walkHeight(state.map, nx, ny, e.z); }
      return;
    }
    if (e.charmed > Clock.t || e.enslaved > Clock.t || (e.ally && e.allyUntil > Clock.t)) {
      // Charmed and summoned creatures fight the nearest OTHER monster instead of the party.
      allyTurn(e, dt);
      return;
    }
    if (e.ally && e.allyUntil <= Clock.t) { e.ally = false; }

    if (d < AGGRO && !buff('invisible')) e.alerted = true;
    if (!e.alerted) return;

    const slowFactor = e.slowed > Clock.t ? 0.45 : 1;
    e.recovery = Math.max(0, e.recovery - dt * slowFactor);

    if (d > MELEE) {
      // Approach. Ground-snapped, and blocked by the same rules the party obeys.
      const sp = (dt / 1000) * (def.ai === 'brute' ? 1.6 : 2.4) * slowFactor;
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
      const raw = Rules.rollDamage(rng, def.dmg, 0, 0);
      const dmg = Rules.applyResist(raw, partyResist('phys'));
      const r = Rules.applyDamage(victim, dmg);
      // Preservation converts a killing blow into unconsciousness — the reason to carry it.
      if (r.died && buff('preservation')) { victim.cond.dead = false; victim.cond.unconscious = true; victim.hp = 0; r.died = false; }
      // Pain Reflection sends a share straight back.
      const refl = buff('pain_reflection');
      if (refl) {
        const back = Math.max(1, Math.round(dmg * refl / 100));
        e.hp -= back;
        if (e.hp <= 0) killEntityObj(e);
      }
      Log.push('The ' + def.name + ' hits ' + victim.name + ' for ' + r.dmg + '.', 'hit');
      if (r.died) Log.push(victim.name + ' has died!', 'hit');
      else if (r.knocked) Log.push(victim.name + ' is knocked out.', 'hit');
      if (def.inflict && victim.cond && rng.chance(0.25)) victim.cond[def.inflict] = true;
    } else {
      Log.push('The ' + def.name + ' misses ' + victim.name + '.', 'info');
    }
    e.recovery = def.speed * 8;
  }

  // Defeat is a terminal event with a cost, the way MM6 handled it: you wake at the temple,
  // poorer, a day later. It must NEVER be a state the player can walk around in, and it must never
  // be something a save can silently capture.
  function checkDefeat() {
    if (!state.party || state.defeated) return false;
    const anyUp = state.party.members.some((c) => Rules.canAct(c));
    if (anyUp) return false;
    state.defeated = true;
    state.screen = 'defeat';
    return true;
  }

  function reviveAtTemple() {
    const p = state.party;
    const toll = Math.min(p.gold, Math.max(0, Math.round(p.gold * 0.4)));
    p.gold -= toll;
    for (const c of p.members) {
      c.cond.dead = false; c.cond.unconscious = false; c.cond.asleep = false;
      c.cond.afraid = false; c.cond.weak = false;
      c.hp = Math.max(1, Math.round(Rules.maxHP(c) * 0.5));
      c.sp = Math.round(Rules.maxSP(c) * 0.5);
    }
    Clock.skip(1440);
    const home = state.world.maps.harrowgate;
    enterMap('harrowgate');
    p.x = home.town.x + 0.5; p.y = home.town.y + 3.5;
    p.z = World.walkHeight(state.map, p.x, p.y);
    p.ang = -Math.PI / 2;
    state.defeated = false;
    state.screen = null;
    Log.push('You wake in the Harrowgate temple. The priests took ' + toll + ' gold.', 'sys');
    return true;
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
      if (Math.hypot(n.x - p.x, n.y - p.y) < 3.2) return { kind: 'npc', npc: n };
    }
    let bestDecor = null, bestRank = 99, bestD = 3.0;
    for (const d of m.decor) {
      if (d.kind !== 'chest' && d.kind !== 'questitem') continue;
      if (d.opened || d.taken) continue;
      const dd = Math.hypot(d.x - p.x, d.y - p.y);
      if (dd >= 3.0) continue;
      // Quest items outrank chests unconditionally. A chest standing beside the seal must never
      // consume the interaction the campaign depends on.
      const rank = d.kind === 'questitem' ? 0 : 1;
      if (rank < bestRank || (rank === bestRank && dd < bestD)) { bestRank = rank; bestD = dd; bestDecor = d; }
    }
    if (bestDecor) return { kind: bestDecor.kind, decor: bestDecor };
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


  // ---------------------------------------------------------------- buffs
  // One place buffs live, one place they are read. `until` is a game-minute stamp so they expire
  // on the same clock everything else uses.
  function setBuff(name, amount, durMinutes) {
    const b = state.party.buffs || (state.party.buffs = Object.create(null));
    const until = Clock.t + Math.max(1, Math.round(durMinutes));
    // Re-casting refreshes and takes the stronger amount, never stacks into absurdity.
    if (!b[name] || b[name].until < until) b[name] = { until, amount: Math.max(amount, (b[name] || {}).amount || 0) };
    else b[name].amount = Math.max(b[name].amount, amount);
    return b[name];
  }

  function buff(name) {
    const b = state.party.buffs && state.party.buffs[name];
    if (!b) return 0;
    if (b.until <= Clock.t) { delete state.party.buffs[name]; return 0; }
    return b.amount;
  }

  function expireBuffs() {
    const b = state.party.buffs;
    if (!b) return;
    for (const k of Object.keys(b)) if (b[k].until <= Clock.t) delete b[k];
  }

  // Party-wide resistance from Protection spells, Day of Protection and Protection from Magic.
  function partyResist(elem) {
    return buff('resist_' + elem) + buff('day_of_protection') + buff('resist_magic') * 0.5;
  }

  const isUndead = (kind) => /skeleton|zombie|ghoul|wraith|lich|knight_ash|ash_crown/.test(kind);

  // ---------------------------------------------------------------- spell specials
  // EVERY special a spell declares must have a handler here. test/systems.test.js asserts it, so a
  // spell can never be decorative.
  const SPECIALS = {
    enchant_weapon(eff) {
      const ch = eff.caster;
      const w = ch.equip.weapon || ch.equip.bow;
      if (!w) { Log.push('No weapon to enchant.', 'info'); return false; }
      w.elem = eff.elem; w.elemAmount = eff.amount || 4;
      w.elemUntil = Clock.t + eff.dur;
      Log.push(Items.displayName(w) + ' glows.', 'good');
      return true;
    },
    wizard_eye(eff) {
      // Reveal the map generously around the party — the whole point of the spell.
      markSeen(state.party.map, state.party.x, state.party.y, 34);
      setBuff('wizard_eye', 1, eff.dur);
      Log.push('The world opens to you.', 'good');
      return true;
    },
    jump(eff) {
      const p = state.party;
      // Hop forward over whatever is directly ahead, landing on the walk surface.
      for (let d = 3.5; d >= 1.0; d -= 0.5) {
        const nx = p.x + Math.cos(p.ang) * d, ny = p.y + Math.sin(p.ang) * d;
        if (World.passable(state.map, nx, ny, p.z + 3)) {
          p.x = nx; p.y = ny; p.z = World.walkHeight(state.map, nx, ny);
          Log.push('You leap forward.', 'good');
          return true;
        }
      }
      Log.push('No room to jump.', 'info');
      return false;
    },
    fly(eff) { setBuff('fly', 1, eff.dur); Log.push('You rise off the ground.', 'good'); return true; },
    water_walk(eff) { setBuff('waterwalk', 1, eff.dur); Log.push('The water firms underfoot.', 'good'); return true; },
    recharge(eff) {
      const ch = eff.caster;
      const it = ch.pack.find((st) => st.charges !== undefined && Items.def(st) && Items.def(st).kind === 'wand');
      if (!it) { Log.push('Nothing to recharge.', 'info'); return false; }
      it.charges = Math.round(10 + eff.power / 4);
      Log.push(Items.displayName(it) + ' hums.', 'good');
      return true;
    },
    enchant_item(eff) {
      const ch = eff.caster;
      // Enchant the best unenchanted equipped item. Power decides how good the suffix is.
      const slots = Object.keys(ch.equip).filter((k) => ch.equip[k] && ch.equip[k].ench === undefined);
      if (!slots.length) { Log.push('Nothing left to enchant.', 'info'); return false; }
      const st = ch.equip[slots[0]];
      const tier = clamp(Math.floor(eff.power / 12), 0, Items.ENCHANTS.length - 1);
      st.ench = tier;
      st.bonus = (st.bonus || 0) + Items.ENCHANTS[tier].bonus;
      st.ident = true;
      recompute(ch);
      Log.push(Items.displayName(st) + '!', 'good');
      return true;
    },
    town_portal(eff) {
      if (state.map.kind === 'dungeon') { Log.push('The way will not open underground.', 'info'); return false; }
      const home = state.world.maps.harrowgate;
      gotoMap('harrowgate', home.town.x, home.town.y + 3, -Math.PI / 2);
      Log.push('The world folds and you stand in Harrowgate.', 'good');
      return true;
    },
    lloyds_beacon(eff) {
      const p = state.party;
      if (!p.beacon) {
        p.beacon = { map: p.map, x: p.x, y: p.y, ang: p.ang };
        Log.push('Beacon set.', 'good');
        return true;
      }
      const b = p.beacon;
      gotoMap(b.map, b.x - 0.5, b.y - 0.5, b.ang);
      Log.push('You return to your beacon.', 'good');
      p.beacon = null;
      return true;
    },
    mass_distortion(eff) {
      const e = eff.target && eff.target.__entity;
      if (!e) return false;
      // A percentage of MAXIMUM hp, which is what makes it the answer to a high-HP boss.
      const dmg = Math.max(1, Math.round(e.hpMax * (eff.scale || 0.35)));
      e.hp -= dmg;
      Log.push('The ' + Items.MONSTERS[e.kind].name + ' is crushed for ' + dmg + '.', 'hit');
      if (e.hp <= 0) killEntityObj(e);
      return true;
    },
    turn_undead(eff) {
      const e = eff.target && eff.target.__entity;
      if (!e || !isUndead(e.kind)) return false;
      e.afraid = Clock.t + eff.dur;
      e.alerted = false;
      Log.push('The ' + Items.MONSTERS[e.kind].name + ' recoils.', 'good');
      return true;
    },
    destroy_undead(eff) {
      const e = eff.target && eff.target.__entity;
      if (!e) return false;
      if (!isUndead(e.kind)) { Log.push('It has no undeath to destroy.', 'info'); return false; }
      const dmg = Math.round(eff.power * (eff.scale || 3));
      e.hp -= dmg;
      Log.push('The ' + Items.MONSTERS[e.kind].name + ' is unmade for ' + dmg + '.', 'hit');
      if (e.hp <= 0) killEntityObj(e);
      return true;
    },
    dispel_magic(eff) {
      const e = eff.target && eff.target.__entity;
      if (!e) return false;
      // Strip every timed status the entity carries.
      for (const k of ['charmed', 'berserk', 'enslaved', 'afraid', 'slowed', 'stunned', 'paralysed', 'feebled']) delete e[k];
      e.dispelled = true;
      return true;
    },
    summon_elemental(eff) {
      const p = state.party;
      const e = spawnEntityRaw('elemental', p.x + Math.cos(p.ang) * 2, p.y + Math.sin(p.ang) * 2);
      e.ally = true; e.allyUntil = Clock.t + eff.dur; e.alerted = true;
      Log.push('An elemental answers.', 'good');
      return true;
    },
    hour_of_power(eff) {
      // Every self-buff at once, which is exactly what the tier-9 Light spell is for.
      const d = eff.dur;
      for (const [n, a] of [['ac', 14], ['hit', 8], ['dmg', 8], ['acc', 12], ['haste', 30],
        ['shield', 12], ['day_of_protection', 25], ['hammerhands', 10]]) setBuff(n, a, d);
      Log.push('The hour of power is upon you.', 'good');
      return true;
    },
    divine_intervention(eff) {
      // Full restoration, at a real cost: it ages the party a day. Free omnipotence is not a spell.
      for (const c of state.party.members) {
        for (const k of Object.keys(c.cond)) c.cond[k] = false;
        c.hp = Rules.maxHP(c); c.sp = Rules.maxSP(c);
      }
      Clock.skip(1440);
      Log.push('Divine intervention. A day passes.', 'good');
      return true;
    },
    reanimate(eff) {
      // Raise the nearest corpse to fight for you until the duration lapses.
      let best = null, bd = 12;
      for (const e of (state.map.live || [])) {
        if (!e.dead) continue;
        const d = Math.hypot(e.x - state.party.x, e.y - state.party.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) { Log.push('No corpse answers.', 'info'); return false; }
      best.dead = false; best.hp = Math.round(best.hpMax * 0.5);
      best.ally = true; best.allyUntil = Clock.t + eff.dur; best.alerted = true;
      Log.push('The ' + Items.MONSTERS[best.kind].name + ' rises for you.', 'good');
      return true;
    },
    control_undead(eff) {
      const e = eff.target && eff.target.__entity;
      if (!e || !isUndead(e.kind)) { Log.push('Only the undead can be commanded.', 'info'); return false; }
      e.ally = true; e.allyUntil = Clock.t + eff.dur;
      Log.push('The ' + Items.MONSTERS[e.kind].name + ' obeys.', 'good');
      return true;
    },
    sacrifice(eff) {
      // Spend the caster's life to restore the target's. A real cost, not a free heal.
      const ch = eff.caster, t = eff.target;
      if (!t || t === ch) { Log.push('Choose another.', 'info'); return false; }
      const give = Math.max(1, Math.round(ch.hp * 0.5));
      Rules.applyDamage(ch, give);
      Rules.healTo(t, give * 2);
      Log.push(ch.name + ' gives life to ' + t.name + '.', 'good');
      return true;
    },
    armageddon(eff) {
      // Hits EVERYTHING on the map, including the party. That is what makes it a last resort.
      let n = 0;
      for (const e of liveEnemies()) {
        const dmg = Math.round(eff.power * 3 + 40);
        e.hp -= dmg; n++;
        if (e.hp <= 0) killEntityObj(e);
      }
      for (const c of state.party.members) Rules.applyDamage(c, Math.round(10 + eff.power * 0.3));
      Log.push('The sky falls. ' + n + ' struck, and you among them.', 'hit');
      return true;
    },
    dark_ritual(eff) {
      // Convert the party's health into the caster's spell points.
      const ch = eff.caster;
      let drained = 0;
      for (const c of state.party.members) {
        const take = Math.max(0, Math.round(c.hp * 0.35));
        if (take > 0) { Rules.applyDamage(c, take); drained += take; }
      }
      ch.sp = Math.min(Rules.maxSP(ch), ch.sp + drained);
      Log.push('Blood becomes power. +' + drained + ' spell points.', 'good');
      return true;
    },
    raise_dead(eff) {
      // The cure/heal components come through as ordinary effects; this adds the lasting cost.
      const t = eff.target;
      if (t && t.cond) { t.cond.weak = true; Log.push(t.name + ' returns, weakened.', 'good'); }
      return true;
    },
    shared_life(eff) {
      // Pool the party's HP and divide it evenly — the classic "everyone survives" button.
      const alive = state.party.members.filter((c) => !Rules.isDead(c));
      if (!alive.length) return false;
      let pool = 0;
      for (const c of alive) pool += Math.max(0, c.hp);
      pool += Math.round(eff.power * 2);
      const each = Math.floor(pool / alive.length);
      for (const c of alive) {
        c.hp = Math.min(Rules.maxHP(c), each);
        if (c.hp > 0) c.cond.unconscious = false;
      }
      Log.push('Life is shared between you.', 'good');
      return true;
    },
  };

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
      setBuff(eff.buff, eff.amount || 1, eff.dur);
    } else if (eff.kind === 'status') {
      if (t && t.__entity) t.__entity[eff.status] = Clock.t + eff.dur;
      else if (t && t.cond && t.cond[eff.status] !== undefined) t.cond[eff.status] = true;
    } else if (eff.kind === 'special') {
      const fn = SPECIALS[eff.special];
      if (!fn) {
        // Loud, not silent. A spell whose special has no handler is a decorative spell, and the
        // systems suite fails on exactly this condition.
        state.lastError = 'no handler for spell special: ' + eff.special;
        Log.push('That magic does nothing. (bug: ' + eff.special + ')', 'hit');
        return;
      }
      fn(eff);
    }
  }

  function spawnEntityRaw(kind, x, y) {
    const def = Items.MONSTERS[kind];
    const e = { eid: 'sum' + Math.round(Clock.t) + '_' + (state.map.live || []).length, kind, x, y,
      z: World.walkHeight(state.map, x, y), ang: 0, hp: def.hp, hpMax: def.hp,
      recovery: 0, dead: false, alerted: true };
    (state.map.live || (state.map.live = [])).push(e);
    return e;
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
        ensureLive(m);
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
    // MNU used to be a silent one-slot save. A player looking for a menu after a party wipe
    // overwrote their only save with the corpse and lost the run.
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
      case 'act': {
        // One button, two verbs, exactly as the label says: ATK in combat, USE otherwise.
        if (state.combat.active && nearestEnemy(18)) {
          // Commit the WHOLE party, the way MM6's Attack did. Swinging one character at a time
          // while the other three stand idle is not a combat system.
          let any = false, why = null;
          for (let i = 0; i < state.party.members.length; i++) {
            const r = partyAttack(i);
            if (r.ok) any = true; else if (!why) why = r.why;
          }
          if (!any && why) Log.push(why, 'info');
        } else interact();
        break;
      }
      case 'cast': typeof r.data === 'string' ? castSpell(r.data) : openScreen('book'); break;
      case 'wait': stepTurn(); break;
      case 'close': closeScreens(); break;
      case 'item': state.selectedItem = r.data; break;
      case 'doequip': equipFromPack(r.data); break;
      case 'drop': dropFromPack(r.data); break;
      case 'equip': unequip(r.data); break;
      case 'school': state.bookSchool = r.data; state.bookPage = 0; break;
      case 'bookpage': state.bookPage = clamp((state.bookPage || 0) + r.data, 0, 2); break;
      case 'buy': buy(r.data); break;
      case 'templeheal': if (state.party.gold >= r.data) { state.party.gold -= r.data; healParty(); Log.push('You are made whole.', 'good'); } else Log.push('Not enough gold — the temple asks ' + r.data + ', you have ' + state.party.gold + '.', 'info'); break;
      case 'tavernrest': if (state.party.gold >= r.data) { state.party.gold -= r.data; Clock.skip(480); healParty(); Log.push('You sleep at the inn.', 'good'); } else Log.push('Not enough gold for a bed (' + r.data + ').', 'info'); break;
      case 'buyfood': if (state.party.gold >= r.data) { state.party.gold -= r.data; state.party.food += 1; Log.push('Bought rations.', 'good'); } else Log.push('Not enough gold for rations.', 'info'); break;
      case 'train': doTrain(r.data); break;
      case 'skillup': doSkillUp(r.data); break;
      case 'acceptquest': acceptQuest(r.data); break;
      case 'turnin': turnInQuest(r.data); closeScreens(); break;
      case 'dorest': doRest(); break;
      case 'newgame': startCreation(); break;
      case 'saveslot': if (save(r.data)) Log.push('Saved to slot ' + (r.data + 1) + '.', 'sys'); else Log.push('Could not save.', 'hit'); break;
      case 'loadslot': if (load(r.data)) Log.push('Loaded slot ' + (r.data + 1) + '.', 'sys'); else Log.push('Slot ' + (r.data + 1) + ' is empty.', 'info'); break;
      case 'revive': reviveAtTemple(); break;
      case 'usepack': useFromPack(r.data); break;
      case 'titlescreen': state.screen = 'title'; break;
      case 'continue': if (!load(0)) { startCreation(); } else state.screen = null; break;
      case 'cslot': state.createSlot = r.data; break;
      case 'cclass': state.createSpec[state.createSlot].cls = r.data; break;
      case 'cname': cycleName(state.createSlot, r.data); break;
      case 'csex': cycleSex(state.createSlot); break;
      case 'cport': cyclePortrait(state.createSlot, r.data); break;
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

  // USE a consumable. This did not exist: the inventory offered EQUIP and DROP, so eight healing
  // potions sat in the pack while the party died.
  function useFromPack(i, who) {
    const ch = state.party.members[who === undefined ? state.active : who];
    const st = ch.pack[i];
    if (!st) return false;
    const it = Items.def(st);
    if (!it) return false;

    if (it.kind === 'food') {
      state.party.food += it.food || 1;
      Log.push(ch.name + ' stows rations.', 'good');
    } else if (it.kind === 'potion') {
      if (Rules.isDead(ch)) { Log.push(ch.name + ' cannot drink.', 'info'); return false; }
      let did = false;
      if (it.heal) { const h = Rules.healTo(ch, it.heal); if (h) { Log.push(ch.name + ' recovers ' + h + ' HP.', 'good'); did = true; } }
      if (it.mana) { const before = ch.sp; ch.sp = Math.min(Rules.maxSP(ch), ch.sp + it.mana);
        if (ch.sp > before) { Log.push(ch.name + ' recovers ' + (ch.sp - before) + ' SP.', 'good'); did = true; } }
      if (it.cure) { for (const c of it.cure) if (ch.cond[c]) { ch.cond[c] = false; did = true; }
        if (did) Log.push(ch.name + ' is cured.', 'good'); }
      if (!did) { Log.push('That would do nothing right now.', 'info'); return false; }
    } else if (it.kind === 'tool' && it.light) {
      setBuff('light', it.light, 240);
      Log.push(ch.name + ' lights a torch.', 'good');
    } else {
      Log.push('You cannot use that.', 'info');
      return false;
    }

    st.qty = (st.qty || 1) - 1;
    if (st.qty <= 0) ch.pack.splice(i, 1);
    state.selectedItem = null;
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
    if (state.party.gold < price) {
      Log.push('Not enough gold — ' + Items.ITEMS[st.id].name + ' costs ' + price + ', you have ' + state.party.gold + '.', 'info');
      return false;
    }
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

  const NAME_POOL = [
    ['Alder', 'Bree', 'Cass', 'Dorn', 'Edrik', 'Fenn', 'Gwen', 'Hale'],
    ['Isolde', 'Jarn', 'Kesta', 'Lyril', 'Maud', 'Neris', 'Orrin', 'Pell'],
    ['Quill', 'Rowan', 'Sela', 'Tarn', 'Ulric', 'Vesta', 'Wray', 'Yarrow'],
    ['Ansel', 'Brann', 'Corvin', 'Dara', 'Eska', 'Fyn', 'Garrick', 'Hesper'],
  ];

  function startCreation() {
    state.createSpec = defaultSpec();
    state.createSlot = 0;
    state.screen = 'creation';
  }

  // Cycle the name, sex and portrait of the character being created. Creation that ignores what
  // you chose and hands you the same four people is not character creation.
  function cycleName(slot, dir) {
    const spec = state.createSpec[slot];
    const pool = NAME_POOL[slot];
    const i = pool.indexOf(spec.name);
    spec.name = pool[((i < 0 ? 0 : i) + (dir || 1) + pool.length) % pool.length];
    return spec.name;
  }
  function cycleSex(slot) {
    const spec = state.createSpec[slot];
    spec.sex = spec.sex === 'f' ? 'm' : 'f';
    return spec.sex;
  }
  function cyclePortrait(slot, dir) {
    const spec = state.createSpec[slot];
    spec.portrait = (((spec.portrait === undefined ? slot : spec.portrait) + (dir || 1)) + 12) % 12;
    return spec.portrait;
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
    state.slotUsed = (i) => { try { return !!localStorage.getItem(SAVE_KEY + i); } catch (e) { return false; } };

    state.world = World.build(7);
    state.createSpec = defaultSpec();
    // A party exists from boot so the harness can drive the sim before anyone presses New Game.
    if (!state.party) {
      try { newParty(defaultSpec()); } catch (e) { state.lastError = e.message; }
    }
    state.screen = 'title';
    // Baked art replaces the procedural painters where it exists. Failures are RECORDED, never
    // swallowed: a texture that silently fails to decode looks like an art problem three stages later.
    if (typeof window !== 'undefined' && window.__BAKED__) {
      const blob = window.__BAKED__;
      if (typeof Art !== 'undefined' && Art.installBakedTextures) {
        Art.installBakedTextures(blob)
          .then((n) => { state.bakedTextures = n; })
          .catch((e) => { state.lastError = 'texture bake: ' + e.message; });
      }
      if (typeof Sprites !== 'undefined' && blob.sprites) {
        Sprites.installBaked(blob.sprites);
        Sprites.prepareBaked()
          .then((r) => { Sprites.BAKED.__ready = r; state.bakedSprites = Object.keys(r).length; })
          .catch((e) => { state.lastError = 'sprite bake: ' + e.message; });
      }
    }
  }

  function update(dt) {
    Art.step();
    // The clock runs only during PLAY. It ran through the title screen and character creation, so
    // a new game could begin at 21:47 in the dark, and it ran behind every open menu, so reading
    // an inventory cost six game hours.
    if (state.screen === 'title' || state.screen === 'creation' || !state.party) return;
    if (!state.screen) Clock.advance(dt);
    else return;

    if (!state.screen) move(dt);

    expireBuffs();
    const regen = buff('regen');
    for (const ch of state.party.members) {
      ch.recovery = Math.max(0, ch.recovery - dt * (buff('haste') ? 1.5 : 1));
      if (regen && Clock.t !== state._lastRegen) Rules.healTo(ch, regen);
    }
    if (regen) state._lastRegen = Clock.t;
    // Immolation burns whatever stands next to the party.
    const imm = buff('immolation');
    if (imm && Clock.t !== state._lastImm) {
      state._lastImm = Clock.t;
      for (const e of liveEnemies()) {
        if (Math.hypot(e.x - state.party.x, e.y - state.party.y) > 3.2) continue;
        e.hp -= imm;
        if (e.hp <= 0) killEntityObj(e);
      }
    }

    const enemies = liveEnemies();
    let anyAlerted = false;
    for (const e of enemies) {
      if (Math.hypot(e.x - state.party.x, e.y - state.party.y) < 26) monsterTurn(e, dt);
      if (e.alerted) anyAlerted = true;
    }
    state.combat.active = anyAlerted && !!nearestEnemy(AGGRO);
    checkDefeat();
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
      torch: state.map.kind === 'dungeon' ? 8.5 + buff('light') * 1.8 : 99,
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
      const nspr = Sprites.creature('npc_' + n.role);
      list.push({ dist, spr: nspr, x: n.x, y: n.y,
        z: World.H(m, n.x, n.y), h: Sprites.worldHeight(nspr, 1.8) });
    }
    for (const e of (m.live || [])) {
      if (e.dead) continue;
      const dist = Math.hypot(e.x - cam.x, e.y - cam.y);
      if (dist > m.fogEnd) continue;
      const f = Engine.facingFor(e.ang, cam.x, cam.y, e.x, e.y, 5);
      const spr = Sprites.creature(e.kind, f.index);
      const real = /ogre|troll|elemental|crown|knight_ash/.test(e.kind) ? 2.8
        : /rat|spider/.test(e.kind) ? 0.8 : /wolf/.test(e.kind) ? 1.1 : 1.8;
      list.push({ dist, spr, mirror: f.mirror,
        x: e.x, y: e.y, z: World.walkHeight(m, e.x, e.y, e.z),
        h: Sprites.worldHeight(spr, real) });
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
    partyAttack, reachOf, nearestEnemy, liveEnemies,
    buy, doTrain, doSkillUp, equipFromPack, unequip, dropFromPack, useFromPack, usePortal, giveStack,
    checkDefeat, reviveAtTemple, cycleName, cycleSex, cyclePortrait, NAME_POOL,
    buff, setBuff, SPECIALS, isUndead,
    get party() { return state.party; },
    get map() { return state.map; },
    get screen() { return state.screen; },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Game;
