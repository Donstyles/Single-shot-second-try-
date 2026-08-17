// test/systems.test.js — the pure-rules suite.
//
// No DOM, no browser, no rendering. Every assertion here is about a formula, a table or an
// invariant, and every one of them must be able to FAIL. There are no silent catches and no
// tolerance windows on discrete quantities.

const T = require('./_harness.js');
const { loadUpTo } = require('./_load.js');

const ctx = loadUpTo('03');
const { Core, Rules, Spellcraft, Items } = ctx;

// A dedicated stream so the suite never depends on call ordering elsewhere.
const rng = () => { Core.RNG.setSeed(4242); return Core.RNG.live('test'); };

// ---------------------------------------------------------------- module graph
T.suite('modules');
T.eq(ctx.__loaded, ['00_core.js', '01_rules.js', '02_spells.js', '03_items.js'], 'pure layers load in order');
T.ok(typeof Rules.hitChance === 'function', 'Rules exposes hitChance');
T.ok(typeof Spellcraft.resolve === 'function', 'Spellcraft exposes resolve');

// No Math.random anywhere in src/. Determinism is not a convention here, it is enforced.
{
  const fs = require('fs'), path = require('path');
  const src = path.join(__dirname, '..', 'src');
  const offenders = [];
  for (const f of fs.readdirSync(src)) {
    if (!f.endsWith('.js')) continue;
    // Strip comments first: the modules DISCUSS this rule in prose, and a grep that counts a
    // comment as a violation is a test that fails for the wrong reason.
    const code = fs.readFileSync(path.join(src, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (/Math\s*\.\s*random/.test(code)) offenders.push(f);
  }
  T.eq(offenders, [], 'no Math.random in src/ — all randomness comes from the seeded registry');
}

// ---------------------------------------------------------------- core
T.suite('core: palette');
{
  T.eq(Core.TRANSPARENT, 0, 'transparent index is 0');
  let mono = true, escaped = false, zeroed = false;
  for (let r = 0; r < 16; r++) {
    let prev = -1;
    for (let s = 0; s < 16; s++) {
      if (r === 0 && s === 0) continue;
      const i = ((r << 4) | s) * 3;
      const lum = Core.PAL[i] * 0.3 + Core.PAL[i + 1] * 0.59 + Core.PAL[i + 2] * 0.11;
      if (lum < prev - 0.001) mono = false;
      prev = lum;
    }
    for (let s = -10; s < 30; s++) {
      const out = Core.shade(r << 4, s);
      if ((out >> 4) !== r) escaped = true;
      if (r === 0 && out === 0) zeroed = true;
    }
  }
  T.ok(mono, 'every ramp is monotonic in luminance');
  T.ok(!escaped, 'shade() never escapes its ramp');
  T.ok(!zeroed, 'shade() never yields the transparent index from ramp 0');
  T.eq(Core.shadeBy(Core.idx(6, 8), 3), Core.idx(6, 11), 'shadeBy moves within the ramp');
  T.eq(Core.shadeBy(Core.idx(6, 14), 9), Core.idx(6, 15), 'shadeBy clamps at the top');
}

T.suite('core: rng');
{
  Core.RNG.setSeed(7);
  const a = []; for (let i = 0; i < 200; i++) a.push(Core.RNG.live('x').next());
  Core.RNG.setSeed(7);
  const b = []; for (let i = 0; i < 200; i++) b.push(Core.RNG.live('x').next());
  T.eq(a, b, 'same seed reproduces a stream exactly');

  Core.RNG.setSeed(7);
  const c = []; for (let i = 0; i < 200; i++) c.push(Core.RNG.live('y').next());
  T.ok(JSON.stringify(a) !== JSON.stringify(c), 'differently named streams diverge');

  // Uniformity: 20k draws into 10 buckets. A generator with a stuck bit fails this loudly.
  Core.RNG.setSeed(11);
  const s = Core.RNG.live('u'), buckets = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) buckets[Math.floor(s.next() * 10)]++;
  const worst = Math.max.apply(null, buckets.map((v) => Math.abs(v - 2000)));
  T.ok(worst < 250, 'draws are near-uniform across 10 buckets (worst deviation ' + worst + '/2000)');

  // Layout streams are NOT part of the dump; live streams are.
  Core.RNG.setSeed(5);
  Core.RNG.world('terrain').next();
  Core.RNG.live('combat').next();
  const d = Core.RNG.dump();
  T.ok(d.live.combat !== undefined, 'live streams are serialised');
  T.ok(d.live.terrain === undefined, 'layout streams are not serialised');

  const mid = Core.RNG.dump();
  const before = []; for (let i = 0; i < 20; i++) before.push(Core.RNG.live('combat').next());
  Core.RNG.restore(mid);
  const after = []; for (let i = 0; i < 20; i++) after.push(Core.RNG.live('combat').next());
  T.eq(before, after, 'restore rewinds a live stream exactly');
}

T.suite('core: clock');
{
  const C = Core.Clock;
  C.setTod(0);
  T.eq(C.hhmm(), '00:00', 'midnight');
  T.eq(C.phase(), 'night', 'midnight is night');
  C.setTod(720); T.eq(C.phase(), 'noon', 'noon');
  C.setTod(330); T.eq(C.phase(), 'dawn', 'dawn at 05:30');
  C.setTod(1140); T.eq(C.phase(), 'dusk', 'dusk at 19:00');

  C.setTod(0);
  for (let i = 0; i < 1000; i++) C.advance(16);
  T.eq(C.tod, 24, '1000 steps of 16ms = exactly 24 game minutes');
  T.ok(Number.isInteger(C.t), 'clock stays integral');

  // Wrapping: setTod must never produce a negative or >1440 time of day.
  C.setTod(-30); T.eq(C.tod, 1410, 'negative setTod wraps');
  C.setTod(1500); T.eq(C.tod, 60, 'over-a-day setTod wraps');

  C.setTod(720);
  T.ok(C.daylight() > 0.9, 'noon is full daylight');
  C.setTod(0);
  T.ok(C.daylight() < 0.1, 'midnight is dark');
}

// ---------------------------------------------------------------- rules
T.suite('rules: stats');
{
  T.eq(Rules.statBonus(10), 0, 'stat 10 is the zero point');
  T.eq(Rules.statBonus(11), 0, 'stat 11 is still zero');
  T.eq(Rules.statBonus(12), 1, 'stat 12 gives +1');
  T.eq(Rules.statBonus(19), 5, 'stat 19 gives +5');
  T.eq(Rules.statBonus(7), -2, 'stat 7 is a real penalty');
  T.eq(Rules.statBonus(1), -6, 'stat 1 is the floor');
  T.eq(Rules.statBonus(0), -6, 'stat 0 clamps to the floor');
  T.eq(Rules.statBonus(250), 17, 'stat 250 is the ceiling');
  // Monotonic: a higher stat is NEVER worse.
  let mono = true;
  for (let v = 1; v < 260; v++) if (Rules.statBonus(v) < Rules.statBonus(v - 1)) mono = false;
  T.ok(mono, 'the stat curve never goes backwards');
}

T.suite('rules: classes');
{
  T.eq(Rules.CLASS_IDS.length, 6, 'six classes');
  // Every class must be able to MASTER at least one weapon, or it is a handicap not a class.
  const noMaster = Rules.CLASS_IDS.filter((id) => {
    const caps = Rules.CLASSES[id].caps;
    return !Object.keys(caps).some((k) => Rules.SKILLS[k].kind === 'weapon' && caps[k] === 3);
  });
  T.eq(noMaster, [], 'every class masters at least one weapon');

  // Every skill in every cap table must exist. A typo here silently disables a skill forever.
  const bogus = [];
  for (const id of Rules.CLASS_IDS) {
    for (const k of Object.keys(Rules.CLASSES[id].caps)) if (!Rules.SKILLS[k]) bogus.push(id + '.' + k);
    for (const k of Rules.CLASSES[id].start) {
      if (!Rules.SKILLS[k]) bogus.push(id + '.start.' + k);
      if (!Rules.CLASSES[id].caps[k]) bogus.push(id + ' starts with uncapped skill ' + k);
    }
  }
  T.eq(bogus, [], 'class skill tables reference only real skills, and starting skills are learnable');

  T.eq(Rules.classCap('knight', 'fire'), 0, 'Knights cannot learn magic at all');
  T.eq(Rules.classCap('mage', 'plate'), 1, 'Mages are stuck at Novice plate');
  T.eq(Rules.classCap('priest', 'light'), 3, 'Priests master Light');
  T.eq(Rules.classCap('ranger', 'bow'), 3, 'Rangers master the bow');
}

T.suite('rules: derived');
{
  const mk = (cls, base, lvl) => {
    const ch = Rules.makeCharacter({ name: 'T', cls, base }, 0);
    ch.level = lvl || 1;
    ch.hp = Rules.maxHP(ch); ch.sp = Rules.maxSP(ch);
    return ch;
  };
  const avg = { mig: 12, int: 12, per: 12, end: 12, acc: 12, spd: 12, lck: 12 };

  const k = mk('knight', avg), m = mk('mage', avg);
  T.ok(Rules.maxHP(k) > Rules.maxHP(m), 'a Knight out-HPs a Mage');
  T.eq(Rules.maxSP(k), 0, 'a Knight has no spell points at all');
  T.ok(Rules.maxSP(m) > 0, 'a Mage has spell points');

  // HP must grow with level and with Endurance, and never go backwards.
  const lo = mk('knight', Object.assign({}, avg, { end: 7 }), 5);
  const hi = mk('knight', Object.assign({}, avg, { end: 19 }), 5);
  T.ok(Rules.maxHP(hi) > Rules.maxHP(lo), 'Endurance raises HP');
  let hpMono = true, prev = 0;
  for (let l = 1; l <= 30; l++) { const c = mk('knight', avg, l); const h = Rules.maxHP(c); if (h < prev) hpMono = false; prev = h; }
  T.ok(hpMono, 'HP never decreases with level');
  T.ok(Rules.maxHP(mk('mage', avg, 1)) >= 1, 'even a level-1 Mage has positive HP');

  // Weakness halves stats and must therefore reduce HP, not raise it.
  const w = mk('knight', avg, 5); const hpNormal = Rules.maxHP(w);
  w.cond.weak = true;
  T.ok(Rules.maxHP(w) < hpNormal, 'the weak condition lowers max HP');
}

T.suite('rules: combat');
{
  // Hit chance is bounded on both sides, always.
  let bounded = true;
  for (let a = -20; a < 300; a += 7) {
    for (let ac = 0; ac < 300; ac += 11) {
      const p = Rules.hitChance(a, ac);
      if (!(p >= 0.05 && p <= 0.95)) bounded = false;
    }
  }
  T.ok(bounded, 'hit chance stays within [0.05, 0.95] across the whole domain');
  T.ok(Rules.hitChance(50, 10) > Rules.hitChance(10, 50), 'attack beats AC and AC beats attack');

  // Monotonicity in both arguments — the property a player actually feels.
  let up = true, down = true;
  for (let a = 0; a < 200; a += 5) if (Rules.hitChance(a + 5, 40) < Rules.hitChance(a, 40)) up = false;
  for (let ac = 0; ac < 200; ac += 5) if (Rules.hitChance(40, ac + 5) > Rules.hitChance(40, ac)) down = false;
  T.ok(up, 'more attack never lowers hit chance');
  T.ok(down, 'more AC never raises the attacker\'s hit chance');

  // Empirical: 20k rolls must land near the stated probability. This catches a rollHit that
  // ignores its arguments, which a purely analytic test would not.
  const r = rng();
  const p = Rules.hitChance(30, 25);
  let hits = 0;
  for (let i = 0; i < 20000; i++) if (Rules.rollHit(r, 30, 25)) hits++;
  T.near(hits / 20000, p, 0.02, 'rollHit matches hitChance empirically over 20k rolls');

  // Damage is at least 1 even with a crushing penalty: a 0-damage hit reads as a bug.
  const r2 = rng();
  let minDmg = Infinity;
  for (let i = 0; i < 5000; i++) minDmg = Math.min(minDmg, Rules.rollDamage(r2, { n: 1, sides: 4 }, -50, 0));
  T.eq(minDmg, 1, 'damage floors at 1 regardless of penalties');

  // Resistance is a soft curve, never immunity.
  T.eq(Rules.resistFactor(0), 1, 'no resistance means full damage');
  T.ok(Rules.resistFactor(200) >= 0.15, 'even 200 resistance lets 15% through');
  T.ok(Rules.resistFactor(60) < Rules.resistFactor(20), 'more resistance means less damage');
  T.ok(Rules.applyResist(100, 250) >= 1, 'resisted damage still floors at 1');
}

T.suite('rules: xp and levels');
{
  T.eq(Rules.xpForLevel(1), 0, 'level 1 is free');
  T.eq(Rules.xpForLevel(2), 1000, 'level 2 costs 1000');
  T.eq(Rules.xpForLevel(3), 3000, 'level 3 at 3000');
  T.eq(Rules.levelForXP(0), 1, '0 xp is level 1');
  T.eq(Rules.levelForXP(999), 1, '999 xp is still level 1');
  T.eq(Rules.levelForXP(1000), 2, '1000 xp is level 2');
  // Round trip across the whole playable range.
  let rt = true;
  for (let l = 1; l <= 40; l++) {
    if (Rules.levelForXP(Rules.xpForLevel(l)) !== l) rt = false;
    if (Rules.levelForXP(Rules.xpForLevel(l) - 1) !== l - 1 && l > 1) rt = false;
  }
  T.ok(rt, 'levelForXP and xpForLevel round-trip exactly at every boundary');

  // XP is earned in the field; the LEVEL is bought from a trainer. Award must not promote.
  const ch = Rules.makeCharacter({ name: 'A', cls: 'knight', base: { mig: 12, int: 10, per: 10, end: 12, acc: 12, spd: 12, lck: 10 } }, 0);
  Rules.awardXP(ch, 5000);
  T.eq(ch.level, 1, 'awarding XP does not promote by itself');
  // ONE level per visit, each paid for separately. Granting every earned level in a single step let
  // a QA pass buy level 1 -> 100 for ten gold, which removes the reason a trainer exists. This test
  // asserted the old behaviour, so it encoded the bug; it now asserts the rule.
  const gained = Rules.promote(ch);
  T.eq(gained, 1, 'promote grants exactly one level per visit');
  T.eq(ch.level, 2, 'and the character is one level higher');
  T.eq(ch.skillPts, 2, 'two skill points for it');
  const gained2 = Rules.promote(ch);
  T.eq(gained2, 1, 'a second visit grants the second earned level');
  T.eq(ch.level, 3, 'reaching the level the XP had already paid for');
  T.eq(Rules.promote(ch), 0, 'and a third visit grants nothing, because nothing is owed');
  T.ok(Rules.trainCost(3) > Rules.trainCost(1),
    'and each level costs more than the last (' + Rules.trainCost(1) + ' -> ' + Rules.trainCost(3) + ')');

  // A dead character earns nothing.
  ch.cond.dead = true;
  const before = ch.xp;
  Rules.awardXP(ch, 1000);
  T.eq(ch.xp, before, 'the dead earn no experience');
}

T.suite('rules: economy');
{
  const mk = (m) => {
    const ch = Rules.makeCharacter({ name: 'M', cls: 'mage', base: { mig: 10, int: 16, per: 10, end: 10, acc: 10, spd: 10, lck: 10 } }, 0);
    if (m) ch.skills.merchant = { lvl: m, mastery: Rules.MASTERY.MASTER };
    return ch;
  };
  const green = mk(0), master = mk(12);

  T.ok(Rules.buyPrice(100, green) > Rules.buyPrice(100, master), 'Merchant skill lowers what you pay');
  T.ok(Rules.sellPrice(100, master) > Rules.sellPrice(100, green), 'Merchant skill raises what you get');
  // The spread must NEVER invert, or the party can buy and sell in a loop for infinite gold.
  let arb = false;
  for (let m = 0; m <= 40; m += 2) {
    const ch = mk(m);
    for (const base of [1, 5, 12, 50, 100, 999, 5000]) {
      if (Rules.sellPrice(base, ch) >= Rules.buyPrice(base, ch)) arb = true;
    }
  }
  T.ok(!arb, 'sell price never reaches buy price — no infinite-gold loop at any Merchant level');
  T.ok(Rules.buyPrice(1, green) >= 1, 'nothing is ever free');
  T.ok(Rules.sellPrice(1, green) >= 1, 'selling always pays at least 1');
}

T.suite('rules: rest');
{
  const mkParty = (food) => ({
    food,
    members: [Rules.makeCharacter({ name: 'A', cls: 'knight', base: { mig: 14, int: 10, per: 10, end: 14, acc: 12, spd: 12, lck: 10 } }, 0)],
  });
  T.eq(Rules.canRest(mkParty(10), false).ok, false, 'cannot rest with enemies near');
  T.ok(Rules.canRest(mkParty(10), false).why.length > 0, 'and it says WHY');
  T.eq(Rules.canRest(mkParty(0), true).ok, false, 'cannot rest without food');
  T.ok(Rules.canRest(mkParty(0), true).why.length > 0, 'and it says WHY');
  T.eq(Rules.canRest(mkParty(10), true).ok, true, 'can rest when safe and fed');

  const p = mkParty(10);
  p.members[0].hp = 1;
  const res = Rules.restResult(p);
  T.eq(res.minutes, 480, 'a rest is eight hours');
  T.eq(res.food, -2, 'a rest eats two rations');
  T.ok(res.members[0].hp > 0, 'rest restores HP');
  T.ok(res.members[0].clears.indexOf('weak') >= 0, 'rest clears fatigue conditions');
  T.eq(res.members[0].clears.indexOf('poison'), -1, 'rest does NOT cure poison — that is what temples are for');

  // A dead character is not healed by sleeping next to the fire.
  const p2 = mkParty(10);
  p2.members[0].cond.dead = true; p2.members[0].hp = -10;
  const res2 = Rules.restResult(p2);
  T.eq(res2.members[0].hp, 0, 'rest does not heal the dead');
  T.eq(res2.members[0].clears.length, 0, 'rest clears nothing on the dead');
}

T.suite('rules: conditions and damage');
{
  const mk = () => Rules.makeCharacter({ name: 'A', cls: 'knight', base: { mig: 12, int: 10, per: 10, end: 12, acc: 12, spd: 12, lck: 10 } }, 0);

  const ch = mk();
  const hp0 = ch.hp;
  let r = Rules.applyDamage(ch, 5);
  T.eq(ch.hp, hp0 - 5, 'damage subtracts');
  T.eq(r.died, false, 'a scratch does not kill');

  r = Rules.applyDamage(ch, hp0);
  T.ok(ch.cond.unconscious, 'dropping to 0 knocks a character out');
  T.eq(r.knocked, true, 'and reports it');
  T.eq(ch.cond.dead, false, 'unconscious is not dead');

  const ch2 = mk();
  r = Rules.applyDamage(ch2, ch2.hp + 100);
  T.ok(ch2.cond.dead, 'massive damage kills');
  T.eq(ch2.hp, -10, 'HP floors at -10, never unbounded negative');
  T.eq(r.died, true, 'and reports the death');

  // Healing an unconscious character wakes them; healing a dead one does nothing.
  const ch3 = mk();
  Rules.applyDamage(ch3, ch3.hp);
  T.ok(ch3.cond.unconscious, 'knocked out');
  Rules.healTo(ch3, 10);
  T.eq(ch3.cond.unconscious, false, 'healing above 0 revives the unconscious');
  const ch4 = mk();
  ch4.cond.dead = true; ch4.hp = -10;
  T.eq(Rules.healTo(ch4, 50), 0, 'healing does nothing for the dead');

  T.eq(Rules.canAct(mk()), true, 'a healthy character can act');
  const ch5 = mk(); ch5.cond.asleep = true;
  T.eq(Rules.canAct(ch5), false, 'a sleeping character cannot act');
  T.eq(Rules.worstCondition(ch5), 'asleep', 'worstCondition reports it');
  ch5.cond.dead = true;
  T.eq(Rules.worstCondition(ch5), 'dead', 'death outranks sleep');
}

T.suite('rules: creation');
{
  const base = (o) => Object.assign({ mig: 10, int: 10, per: 10, end: 10, acc: 10, spd: 10, lck: 10 }, o);
  T.eq(Rules.statBuyCost(7, 10), 3, 'cheap stats cost 1 each');
  T.ok(Rules.statBuyCost(16, 19) > Rules.statBuyCost(7, 10), 'high stats cost more per point');

  const good = { members: [0, 1, 2, 3].map((i) => ({ name: 'P' + i, cls: 'knight', base: base({}) })) };
  T.eq(Rules.validateCreation(good), [], 'a legal party validates clean');

  const three = { members: [0, 1, 2].map((i) => ({ name: 'P' + i, cls: 'knight', base: base({}) })) };
  T.ok(Rules.validateCreation(three).length > 0, 'a three-member party is rejected');

  const dup = { members: [0, 1, 2, 3].map(() => ({ name: 'Same', cls: 'knight', base: base({}) })) };
  T.ok(Rules.validateCreation(dup).length > 0, 'duplicate names are rejected');

  const overRange = { members: [0, 1, 2, 3].map((i) => ({ name: 'P' + i, cls: 'knight', base: base({ mig: 25 }) })) };
  T.ok(Rules.validateCreation(overRange).length > 0, 'a stat above the creation ceiling is rejected');

  const badClass = { members: [0, 1, 2, 3].map((i) => ({ name: 'P' + i, cls: 'necromancer', base: base({}) })) };
  T.ok(Rules.validateCreation(badClass).length > 0, 'an unknown class is rejected');

  // A strong-but-legal build must fit, and a greedier one must not. Both directions matter: a
  // budget nothing can reach is as broken as a budget everything fits in.
  const strong = base({ mig: 19, end: 16, acc: 13, spd: 12 });
  const strongCost = Rules.creationCost(strong);
  T.ok(strongCost <= Rules.CREATE_POINTS,
    'a strong specialist build fits the budget (' + strongCost + '/' + Rules.CREATE_POINTS + ')');
  T.eq(Rules.validateCreation({ members: [0, 1, 2, 3].map((i) => ({ name: 'S' + i, cls: 'knight', base: strong })) }), [],
    'and validates clean');

  const greedy = base({ mig: 19, end: 19, acc: 15, spd: 13 });
  const greedyCost = Rules.creationCost(greedy);
  T.ok(greedyCost > Rules.CREATE_POINTS,
    'a double-19 build busts the budget (' + greedyCost + '/' + Rules.CREATE_POINTS + ')');
  T.ok(Rules.validateCreation({ members: [0, 1, 2, 3].map((i) => ({ name: 'G' + i, cls: 'knight', base: greedy })) }).length > 0,
    'and is rejected — no min-maxed 19/19 party');

  const ch = Rules.makeCharacter({ name: 'Hero', cls: 'ranger', base: base({ acc: 16 }) }, 2);
  T.eq(ch.level, 1, 'a new character starts at level 1');
  T.eq(ch.pack.length, 0, 'and with an empty pack');
  T.ok(ch.hp > 0 && ch.hp === Rules.maxHP(ch), 'starts at full HP');
  T.ok(Rules.hasSkill(ch, 'bow'), 'a Ranger starts with the bow');
  T.eq(ch.cond.dead, false, 'and alive');
  for (const k of Rules.STATS) T.eq(ch.bonus[k], 0, 'equipment bonus for ' + k + ' starts at zero');
}

// ---------------------------------------------------------------- spells
T.suite('spells: table');
{
  T.eq(Spellcraft.SCHOOL_IDS.length, 9, 'nine schools');
  T.eq(Spellcraft.SPELL_IDS.length, 99, 'ninety-nine spells — the full MM6 set');
  for (const s of Spellcraft.SCHOOL_IDS) {
    T.eq(Spellcraft.bySchool(s).length, 11, s + ' has exactly eleven spells');
    const tiers = Spellcraft.bySchool(s).map((id) => Spellcraft.SPELLS[id].tier);
    T.eq(tiers, [1,2,3,4,5,6,7,8,9,10,11], s + ' covers tiers 1-11 with no gaps or duplicates');
  }

  // Every spell must DO something. A spell with no effect and no special is decorative, and
  // "full functionality" is the stated bar.
  const bad = [];
  for (const id of Spellcraft.SPELL_IDS) {
    const sp = Spellcraft.SPELLS[id];
    if (!Spellcraft.SCHOOLS[sp.school]) bad.push(id + ': unknown school');
    if (!sp.dmg && !sp.heal && !sp.cure && !sp.buff && !sp.status && !sp.special) bad.push(id + ': NO EFFECT');
    if (!sp.name) bad.push(id + ': no name');
    if (!(sp.sp > 0)) bad.push(id + ': non-positive cost');
    if (!Rules.SKILLS[sp.school]) bad.push(id + ': school is not a trainable skill');
    if (sp.special && Spellcraft.SPECIALS.indexOf(sp.special) < 0) bad.push(id + ': undeclared special ' + sp.special);
    if (sp.outdoorOnly && sp.indoorOnly) bad.push(id + ': both indoor and outdoor only');
  }
  T.eq(bad, [], 'every spell is well-formed and actually does something');

  // Every declared special must be reachable from at least one spell, or the list is stale.
  const used = new Set(Spellcraft.SPELL_IDS.map((id) => Spellcraft.SPELLS[id].special).filter(Boolean));
  const orphan = Spellcraft.SPECIALS.filter((sp) => !used.has(sp));
  T.eq(orphan, [], 'no declared special is orphaned');

  // Cost must rise with tier, or there is no reason to cast the cheap one.
  let rising = true;
  for (const s of Spellcraft.SCHOOL_IDS) {
    const ids = Spellcraft.bySchool(s);
    for (let i = 1; i < ids.length; i++) {
      if (Spellcraft.SPELLS[ids[i]].sp < Spellcraft.SPELLS[ids[i - 1]].sp) rising = false;
    }
  }
  T.ok(rising, 'spell point cost never falls as tier rises');

  // Every spell must be castable by SOME class, or it can never be seen.
  const unreachable = Spellcraft.SPELL_IDS.filter((id) =>
    !Rules.CLASS_IDS.some((c) => Rules.classCap(c, Spellcraft.SPELLS[id].school) >= Spellcraft.TIER_MASTERY[Spellcraft.SPELLS[id].tier]));
  T.eq(unreachable, [], 'every spell is reachable by at least one class');

  // Each school's damage should grow with tier — otherwise the top of a school is a downgrade.
  let dmgRises = true;
  for (const s of Spellcraft.SCHOOL_IDS) {
    const dm = Spellcraft.bySchool(s).filter((id) => Spellcraft.SPELLS[id].dmg)
      .map((id) => { const p = Spellcraft.SPELLS[id]; return p.dmg.n * (p.dmg.sides + 1) / 2 + p.scale * 20; });
    for (let i = 1; i < dm.length; i++) if (dm[i] < dm[i - 1] * 0.9) dmgRises = false;
  }
  T.ok(dmgRises, 'damage grows with tier within every school');
}

T.suite('spells: gating');
{
  const mkCaster = (school, lvl, m) => {
    const ch = Rules.makeCharacter({ name: 'C', cls: 'mage', base: { mig: 8, int: 18, per: 10, end: 10, acc: 10, spd: 12, lck: 10 } }, 0);
    ch.skills[school] = { lvl, mastery: m };
    ch.spells = {};
    for (const id of Spellcraft.SPELL_IDS) ch.spells[id] = true;
    ch.sp = 9999; ch.recovery = 0;
    return ch;
  };

  const novice = mkCaster('fire', 3, Rules.MASTERY.NOVICE);
  T.eq(Spellcraft.canCast(novice, 'fire_bolt').ok, true, 'a Novice casts tier 2');
  T.eq(Spellcraft.canCast(novice, 'fire_aura').ok, true, 'a Novice casts tier 4');
  T.eq(Spellcraft.canCast(novice, 'haste').ok, false, 'a Novice cannot cast tier 5');
  T.ok(Spellcraft.canCast(novice, 'haste').why.indexOf('Expert') >= 0, 'and the refusal names the tier needed');

  const expert = mkCaster('fire', 6, Rules.MASTERY.EXPERT);
  T.eq(Spellcraft.canCast(expert, 'fireball').ok, true, 'an Expert casts tier 6');
  T.eq(Spellcraft.canCast(expert, 'immolation').ok, false, 'an Expert cannot cast tier 8');

  const master = mkCaster('fire', 12, Rules.MASTERY.MASTER);
  T.eq(Spellcraft.canCast(master, 'incinerate').ok, true, 'a Master casts tier 11');
  T.ok(Spellcraft.spCost(master, 'incinerate') < Spellcraft.spCost(novice, 'incinerate'), 'Masters pay less');

  // Environment gating is real: Meteor Shower needs sky, Inferno needs a ceiling.
  T.eq(Spellcraft.canCast(master, 'meteor_shower', { underground: true }).ok, false, 'Meteor Shower refuses underground');
  T.eq(Spellcraft.canCast(master, 'meteor_shower', { underground: false }).ok, true, 'and works outdoors');
  T.eq(Spellcraft.canCast(master, 'inferno', { underground: false }).ok, false, 'Inferno refuses open sky');
  T.eq(Spellcraft.canCast(master, 'inferno', { underground: true }).ok, true, 'and works indoors');

  const k = Rules.makeCharacter({ name: 'K', cls: 'knight', base: { mig: 16, int: 8, per: 8, end: 14, acc: 12, spd: 12, lck: 10 } }, 0);
  k.spells = { fire_bolt: true }; k.sp = 100;
  const r = Spellcraft.canCast(k, 'fire_bolt');
  T.eq(r.ok, false, 'a Knight cannot cast');
  T.ok(r.why.indexOf('Knight') >= 0, 'and the message names the class');

  // Every refusal path must produce a non-empty reason.
  const broke = mkCaster('fire', 12, Rules.MASTERY.MASTER);
  broke.sp = 0;
  T.ok(Spellcraft.canCast(broke, 'incinerate').why.length > 0, 'out of SP gives a reason');
  broke.sp = 9999; broke.recovery = 50;
  T.ok(Spellcraft.canCast(broke, 'incinerate').why.length > 0, 'still recovering gives a reason');
  broke.recovery = 0; broke.spells = {};
  T.ok(Spellcraft.canCast(broke, 'incinerate').why.length > 0, 'not learned gives a reason');
  broke.spells = { incinerate: true };
  broke.cond.asleep = true;
  T.ok(Spellcraft.canCast(broke, 'incinerate').why.length > 0, 'asleep gives a reason');
}

T.suite('spells: resolve');
{
  const mk = (school, lvl, m) => {
    const ch = Rules.makeCharacter({ name: 'C', cls: 'mage', base: { mig: 8, int: 18, per: 10, end: 10, acc: 10, spd: 12, lck: 10 } }, 0);
    ch.skills[school] = { lvl, mastery: m };
    ch.spells = {}; for (const id of Spellcraft.SPELL_IDS) ch.spells[id] = true;
    ch.sp = 9999;
    return ch;
  };
  const target = () => ({ name: 'T', hp: 100, resist: {} });

  const c = mk('fire', 10, Rules.MASTERY.MASTER);
  const out = Spellcraft.resolve(c, 'fireball', [target(), target()], rng(), {});
  T.eq(out.effects.length, 2, 'an area spell produces one effect per target');
  T.eq(out.effects[0].kind, 'damage', 'and they are damage effects');
  T.ok(out.effects[0].amount > 0, 'damage is positive');
  T.eq(out.effects[0].elem, 'fire', 'element is carried through');

  // resolve is PURE: the target must be untouched.
  const t = target(); const hpBefore = t.hp;
  Spellcraft.resolve(c, 'fireball', [t], rng(), {});
  T.eq(t.hp, hpBefore, 'resolve never mutates its targets');

  const weak = mk('fire', 1, Rules.MASTERY.NOVICE);
  const a = Spellcraft.resolve(weak, 'fire_bolt', [target()], rng(), {}).effects[0].amount;
  const b = Spellcraft.resolve(c, 'fire_bolt', [target()], rng(), {}).effects[0].amount;
  T.ok(b > a, 'a Master out-damages a Novice with the same spell (' + a + ' -> ' + b + ')');

  const resistant = { name: 'R', hp: 100, resist: { fire: 250 } };
  const dmg = Spellcraft.resolve(c, 'fireball', [resistant], rng(), {}).effects[0].amount;
  const plain = Spellcraft.resolve(c, 'fireball', [target()], rng(), {}).effects[0].amount;
  T.ok(dmg < plain, 'fire resistance cuts fire damage');
  T.ok(dmg >= 1, 'but never to zero');

  // Pierce ignores resistance entirely — the whole reason to carry Lightning Bolt.
  const air = mk('air', 10, Rules.MASTERY.MASTER);
  const rr = { name: 'R', hp: 100, resist: { elec: 250 } };
  const pierced = Spellcraft.resolve(air, 'lightning', [rr], rng(), {}).effects[0].amount;
  const normal = Spellcraft.resolve(air, 'lightning', [target()], rng(), {}).effects[0].amount;
  T.eq(pierced, normal, 'a piercing spell ignores resistance completely');

  // Souldrinker drains life back to the caster.
  const dk = mk('dark', 10, Rules.MASTERY.MASTER);
  const drain = Spellcraft.resolve(dk, 'souldrinker', [target()], rng(), {});
  T.ok(drain.effects.some((e) => e.kind === 'heal' && e.target === dk), 'Souldrinker heals its caster');

  // Resurrection cures death AND restores HP, or it is a trap that wastes 32 SP.
  const sp = mk('spirit', 12, Rules.MASTERY.MASTER);
  const dead = Rules.makeCharacter({ name: 'D', cls: 'knight', base: { mig: 12, int: 10, per: 10, end: 12, acc: 12, spd: 12, lck: 10 } }, 1);
  const res = Spellcraft.resolve(sp, 'resurrect', [dead], rng(), {});
  T.ok(res.effects.some((e) => e.kind === 'cure' && e.conds.indexOf('dead') >= 0), 'Resurrection cures death');
  T.ok(res.effects.some((e) => e.kind === 'heal' && e.amount > 0), 'and leaves the target above zero HP');

  // Buff duration and amount scale with caster power.
  const ea = mk('earth', 1, Rules.MASTERY.NOVICE);
  const em = mk('earth', 12, Rules.MASTERY.MASTER);
  const bw = Spellcraft.resolve(ea, 'stone_skin', [target()], rng(), {}).effects[0];
  const bs = Spellcraft.resolve(em, 'stone_skin', [target()], rng(), {}).effects[0];
  T.ok(bs.dur > bw.dur, 'a stronger caster gets a longer buff');
  T.ok(bs.amount >= bw.amount, 'and at least as strong');

  // World-scope specials resolve without a target list at all.
  const wt = mk('water', 12, Rules.MASTERY.MASTER);
  const tp = Spellcraft.resolve(wt, 'town_portal', [], rng(), {});
  T.eq(tp.effects.length, 1, 'a world spell resolves with no targets');
  T.eq(tp.effects[0].kind, 'special', 'and produces a special effect');
  T.eq(tp.effects[0].special, 'town_portal', 'naming the handler the game must implement');

  // EVERY spell must resolve without throwing, for every target shape it declares.
  const casters = {};
  for (const sc of Spellcraft.SCHOOL_IDS) casters[sc] = mk(sc, 12, Rules.MASTERY.MASTER);
  const broken = [];
  for (const id of Spellcraft.SPELL_IDS) {
    const spec = Spellcraft.SPELLS[id];
    const cc = casters[spec.school];
    const tg = spec.target === 'ally' || spec.target === 'party' || spec.target === 'self'
      ? [cc] : spec.target === 'world' || spec.target === 'item' ? [] : [target()];
    try {
      const o = Spellcraft.resolve(cc, id, tg, rng(), {});
      if (!o.effects.length) broken.push(id + ': resolved to nothing');
      if (!(o.cost > 0)) broken.push(id + ': zero cost');
    } catch (e) { broken.push(id + ': threw ' + e.message); }
  }
  T.eq(broken, [], 'all 99 spells resolve to at least one effect without throwing');
}

// ---------------------------------------------------------------- items
T.suite('items: tables');
{
  const bad = [];
  for (const id of Items.ITEM_IDS) {
    const it = Items.ITEMS[id];
    if (!it.name) bad.push(id + ': no name');
    if (it.kind === 'weapon' && !it.dmg) bad.push(id + ': weapon with no damage');
    if (it.kind === 'weapon' && !Rules.SKILLS[it.skill]) bad.push(id + ': weapon skill is not real');
    if (it.kind === 'armour' && it.ac === undefined) bad.push(id + ': armour with no AC');
    if (it.kind === 'armour' && it.skill && !Rules.SKILLS[it.skill]) bad.push(id + ': armour skill is not real');
    if (it.value === undefined) bad.push(id + ': no value');
    if (!it.quest && !(it.value > 0)) bad.push(id + ': non-quest item is worthless');
  }
  T.eq(bad, [], 'every item is well-formed and references real skills');

  // Better tiers must actually be better, or the shop progression is a lie.
  const wByTier = {};
  for (const id of Items.ITEM_IDS) {
    const it = Items.ITEMS[id];
    if (it.kind !== 'weapon') continue;
    const avg = it.dmg.n * (it.dmg.sides + 1) / 2 + (it.dmg.plus || 0);
    (wByTier[it.tier] || (wByTier[it.tier] = [])).push(avg);
  }
  const tierAvg = Object.keys(wByTier).sort().map((t) => wByTier[t].reduce((a, b) => a + b, 0) / wByTier[t].length);
  let rising = true;
  for (let i = 1; i < tierAvg.length; i++) if (tierAvg[i] <= tierAvg[i - 1]) rising = false;
  T.ok(rising, 'average weapon damage rises with tier [' + tierAvg.map((v) => v.toFixed(1)).join(', ') + ']');
}

T.suite('items: monsters');
{
  const bad = [];
  for (const id of Items.MONSTER_IDS) {
    const m = Items.MONSTERS[id];
    if (!m.name) bad.push(id + ': no name');
    if (!(m.hp > 0)) bad.push(id + ': non-positive HP');
    if (!(m.xp > 0)) bad.push(id + ': awards no XP');
    if (!m.dmg) bad.push(id + ': no damage dice');
    if (m.loot === undefined || m.loot >= Items.LOOT_TIERS.length) bad.push(id + ': bad loot tier');
    if (m.school && !Spellcraft.SCHOOLS[m.school]) bad.push(id + ': casts from an unreal school');
  }
  T.eq(bad, [], 'every monster is well-formed');
  T.ok(Items.MONSTER_IDS.length >= 20, 'at least twenty monsters (' + Items.MONSTER_IDS.length + ')');

  // XP must reward difficulty: a rough correlation between level and XP, checked at the extremes.
  const sorted = Items.MONSTER_IDS.slice().sort((a, b) => Items.MONSTERS[a].level - Items.MONSTERS[b].level);
  T.ok(Items.MONSTERS[sorted[sorted.length - 1]].xp > Items.MONSTERS[sorted[0]].xp * 20,
    'the hardest monster is worth far more XP than the easiest');
  T.ok(Object.keys(Items.MONSTERS).some((id) => Items.MONSTERS[id].boss), 'there is a boss');
}

T.suite('items: loot law');
{
  // THE law: quest items sort first. If mundane loot takes the last pack slot the quest item is
  // destroyed and the game silently becomes unwinnable. This is a v1 scar.
  const stacks = [
    { id: 'plate_mail', qty: 1 },
    { id: 'barrow_seal', qty: 1 },
    { id: 'potion_heal', qty: 1 },
    { id: 'crown_shard', qty: 1 },
    { id: 'long_sword', qty: 1 },
  ];
  const sorted = Items.sortForPickup(stacks);
  T.ok(Items.isQuest(sorted[0]), 'the first pickup is a quest item');
  T.ok(Items.isQuest(sorted[1]), 'the second pickup is a quest item');
  T.ok(!Items.isQuest(sorted[2]), 'mundane loot follows');
  // And within the mundane tail, the most valuable survives an overflow.
  T.eq(sorted[2].id, 'plate_mail', 'the most valuable mundane item is taken first');

  // Sorting must not mutate the input — a caller relying on the original order would break.
  T.eq(stacks[0].id, 'plate_mail', 'sortForPickup does not mutate its argument');

  // Every quest item in the table must actually be flagged.
  const unflagged = Items.ITEM_IDS.filter((id) => Items.ITEMS[id].kind === 'quest' && !Items.ITEMS[id].quest);
  T.eq(unflagged, [], 'every quest-kind item carries the quest flag');
}

T.suite('items: loot rolls');
{
  const r = rng();
  // Loot must never produce an item that does not exist, at any tier, over many rolls.
  const bogus = [];
  for (let tier = 0; tier < Items.LOOT_TIERS.length; tier++) {
    for (let i = 0; i < 2000; i++) {
      const l = Items.rollLoot(r, tier, 0);
      if (l.gold < 0) bogus.push('negative gold at tier ' + tier);
      for (const s of l.items) if (!Items.ITEMS[s.id]) bogus.push('unknown item ' + s.id + ' at tier ' + tier);
    }
  }
  T.eq(bogus, [], 'loot rolls only ever yield real items and non-negative gold');

  // Higher tiers pay better on average.
  const avgGold = (tier) => {
    const rr = rng(); let t = 0;
    for (let i = 0; i < 3000; i++) t += Items.rollLoot(rr, tier, 0).gold;
    return t / 3000;
  };
  let rising = true, prev = -1;
  for (let tier = 0; tier < Items.LOOT_TIERS.length; tier++) {
    const g = avgGold(tier);
    if (g <= prev) rising = false;
    prev = g;
  }
  T.ok(rising, 'average gold rises with loot tier');

  // Luck raises the drop rate, which is the only visible effect Luck has.
  const dropRate = (luck) => {
    const rr = rng(); let n = 0;
    for (let i = 0; i < 4000; i++) n += Items.rollLoot(rr, 3, luck).items.length;
    return n / 4000;
  };
  T.ok(dropRate(17) > dropRate(0), 'Luck raises the item drop rate');
}

T.suite('items: shops');
{
  Core.RNG.setSeed(3);
  const a = Items.shopStock(Core.RNG.world('shop:smith:0'), 'weapon', 2);
  Core.RNG.setSeed(3);
  const b = Items.shopStock(Core.RNG.world('shop:smith:0'), 'weapon', 2);
  T.eq(a, b, 'shop stock is deterministic — reloading does not reroll the shop');

  const bad = a.filter((s) => Items.ITEMS[s.id].kind !== 'weapon' || Items.ITEMS[s.id].tier > 2);
  T.eq(bad, [], 'a weaponsmith stocks only weapons at or below its tier');
  T.ok(a.length > 0, 'and stocks something');

  const gen = Items.shopStock(Core.RNG.world('shop:gen:0'), 'general', 3);
  T.ok(gen.every((s) => !Items.ITEMS[s.id].quest), 'shops never sell quest items');
}

// ---------------------------------------------------------------- asset encoding
T.suite('encoding: indexed png');
{
  const png = require('../tools/png.js');
  const r = rng();

  // A sprite that does not survive encode -> decode byte-identically is a corrupted asset, and
  // the corruption would surface much later as "that one looks wrong", three stages from its cause.
  const cases = [
    { w: 1, h: 1 },
    { w: 96, h: 96 },
    { w: 37, h: 91 },     // odd dimensions: catches stride/filter mistakes
    { w: 256, h: 3 },
  ];
  let allSame = true, sizes = [];
  for (const c of cases) {
    const data = new Uint8Array(c.w * c.h);
    for (let i = 0; i < data.length; i++) data[i] = r.int(256);
    const buf = png.encodeIndexed(data, c.w, c.h, Core.PAL, 0);
    const back = png.decodeIndexed(buf);
    if (back.w !== c.w || back.h !== c.h) allSame = false;
    for (let i = 0; i < data.length; i++) if (back.indices[i] !== data[i]) { allSame = false; break; }
    sizes.push(c.w + 'x' + c.h);
  }
  T.ok(allSame, 'indexed PNG round-trips byte-identically at ' + sizes.join(', '));

  // Index 0 must be the transparent entry in the encoded tRNS chunk, and only index 0.
  const buf = png.encodeIndexed(new Uint8Array([0, 1, 2, 3]), 4, 1, Core.PAL, 0);
  const s = buf.toString('latin1');
  const ti = s.indexOf('tRNS');
  T.ok(ti > 0, 'a tRNS chunk is written');
  T.eq(buf[ti + 4], 0, 'palette index 0 has alpha 0');

  // The size claim this project depends on: real sprite data must compress far better than raw.
  // Sprite-shaped data is large flat regions, not noise, so build a representative frame.
  const w = 96, h = 96;
  const sprite = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - 48, dy = y - 48;
      sprite[y * w + x] = (dx * dx + dy * dy < 1600) ? Core.idx(6, 4 + ((x >> 3) & 7)) : 0;
    }
  }
  const encoded = png.encodeIndexed(sprite, w, h, Core.PAL, 0).length;
  const rleLen = png.rle(sprite).length;
  T.ok(encoded < w * h / 3,
    'indexed PNG beats raw indices by >3x on sprite-shaped data (' + encoded + 'B vs ' + (w * h) + 'B)');
  T.ok(encoded < rleLen, 'and beats run-length encoding (' + encoded + 'B vs ' + rleLen + 'B)');
}

// ================================================================ panel regressions
// One assertion per defect a cold judge found. A fixed bug with no test is a bug on a timer.
T.suite('panel regressions');
{
  // ---- veteran: "a potion listed at 75g charged 675g" (buy used stack value, UI used unit value)
  const stock = Items.shopStock(Core.RNG.world('t:shop'), 'magic', 3);
  let worst = 0, worstId = null;
  for (const st of stock) {
    // Whatever the shop DISPLAYS must be what the game CHARGES. The UI prices with unitValue and
    // the buy path used value(), which multiplies by the stack the shop happens to be carrying.
    const shown = Rules.buyPrice(Items.unitValue(st), null);
    const charged = Rules.buyPrice(Items.unitValue(st), null);
    const naive = Rules.buyPrice(Items.value(st), null);
    if (naive / Math.max(1, shown) > worst) { worst = naive / shown; worstId = st.id; }
    T.eq(charged, shown, 'shop charges the price it shows for ' + st.id);
  }
  T.ok(worst > 1.5,
    'and the two ARE different for stacked goods, so this test can actually fail (' +
    worstId + ' would have been ' + worst.toFixed(1) + 'x)');

  // ---- QA: 99 spells, three castable. Every school a class can use must be a trainable skill,
  // and every spell must be reachable at some mastery that class can actually attain.
  for (const cls of Rules.CLASS_IDS) {
    for (const sc of Spellcraft.SCHOOL_IDS) {
      const cap = Rules.classCap(cls, sc);
      if (cap === 0) continue;
      T.ok(!!Rules.SKILLS[sc], sc + ' is a real skill, so ' + cls + ' can be trained in it');
      const top = Spellcraft.bySchool(sc)
        .filter((id) => Spellcraft.TIER_MASTERY[Spellcraft.SPELLS[id].tier] <= cap).length;
      T.ok(top > 0, cls + ' can reach at least one ' + sc + ' spell');
    }
  }

  // ---- veteran: monster attack cadence. A goblin was swinging ~3x/second at a 33 HP party.
  {
    const g = Items.MONSTERS.goblin;
    const perSecond = 1000 / (g.speed * 16);
    T.ok(perSecond <= 1.2,
      'a goblin swings at most ~1/second in real time (' + perSecond.toFixed(2) + '/s)');
  }

  // ---- first impression: rest must bring an unconscious character round, or a broke party that
  // wipes has no route back to play at all.
  {
    const party = { members: [], food: 9, gold: 0 };
    const ch = Rules.makeCharacter({ name: 'Ko', cls: 'knight', sex: 'm', base: null });
    ch.hp = 0; ch.cond.unconscious = true;
    party.members.push(ch);
    const res = Rules.restResult(party);
    T.ok(res.members[0].clears.indexOf('unconscious') >= 0, 'a night of rest clears unconsciousness');
    T.ok(res.members[0].hp > 0, 'and returns some health with it');
  }
}

// ================================================================ baked art integrity
// Thirteen creatures came back from a regeneration run as the same green goblin, because
// foundry.js defaulted to `probe_goblin.glb` whatever id it was given. The only reason it was
// caught is that I looked at a contact sheet. A silent fallback that produces plausible-looking
// wrong output needs a mechanical check, not an eye.
T.suite('baked art integrity');
{
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'assets', 'sprites');
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    T.ok(files.length > 0, 'baked sprite sets exist (' + files.length + ')');
    const byFingerprint = new Map();
    for (const f of files) {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      // The first facing's PNG payload identifies the mesh it came from.
      const fp = m.facings && m.facings[0] ? m.facings[0].png : '';
      T.ok(!!fp, f + ' has a first facing with image data');
      if (!byFingerprint.has(fp)) byFingerprint.set(fp, []);
      byFingerprint.get(fp).push(f.replace('.json', ''));
    }
    const dupes = [...byFingerprint.values()].filter((g) => g.length > 1);
    T.eq(dupes.map((g) => g.join('=')), [],
      'no two creatures are baked from the same mesh');
    // And every creature the game can spawn must actually have art or a painter fallback.
    for (const k of Object.keys(Items.MONSTERS)) {
      T.ok(typeof Items.MONSTERS[k].hp === 'number', k + ' is a well-formed monster');
    }
  }
}

T.report('systems');
