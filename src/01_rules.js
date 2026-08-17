// 01_rules.js — the pure rules layer.
// Owner: rules. Calls Core only.
//
// Every function here is a pure function over plain data: no rendering, no DOM, no globals, no
// hidden state. Randomness is passed IN as a stream, never reached for, so a test can hand it a
// seeded stream and get an exact answer.
//
// GLUE CALLS RULES. If a damage or price calculation appears anywhere in 08_ui.js or 09_game.js,
// that is the mistake this layer exists to prevent.

const Rules = (() => {
  'use strict';

  const { clamp } = Core;

  // ---------------------------------------------------------------- stats
  const STATS = ['mig', 'int', 'per', 'end', 'acc', 'spd', 'lck'];
  const STAT_NAME = {
    mig: 'Might', int: 'Intellect', per: 'Personality', end: 'Endurance',
    acc: 'Accuracy', spd: 'Speed', lck: 'Luck',
  };

  // The stat -> bonus curve. Deliberately flat in the middle and steep at the top: it is what
  // makes a 19 feel like an achievement at creation and a 40 feel like a build at level 30.
  const STAT_BREAKS = [
    [1, -6], [2, -5], [4, -4], [6, -3], [7, -2], [8, -1], [10, 0], [12, 1], [14, 2], [16, 3],
    [17, 4], [19, 5], [21, 6], [25, 7], [30, 8], [35, 9], [40, 10], [50, 11], [60, 12],
    [75, 13], [100, 14], [125, 15], [175, 16], [200, 17],
  ];

  function statBonus(v) {
    if (v <= 0) return -6;
    let b = -6;
    for (let i = 0; i < STAT_BREAKS.length; i++) {
      if (v >= STAT_BREAKS[i][0]) b = STAT_BREAKS[i][1]; else break;
    }
    return b;
  }

  // ---------------------------------------------------------------- skills
  const SKILL_KINDS = { WEAPON: 'weapon', ARMOUR: 'armour', MAGIC: 'magic', MISC: 'misc' };

  const SKILLS = {
    sword:  { name: 'Sword',  kind: 'weapon' },
    axe:    { name: 'Axe',    kind: 'weapon' },
    spear:  { name: 'Spear',  kind: 'weapon' },
    mace:   { name: 'Mace',   kind: 'weapon' },
    dagger: { name: 'Dagger', kind: 'weapon' },
    staff:  { name: 'Staff',  kind: 'weapon' },
    bow:    { name: 'Bow',    kind: 'weapon' },
    unarmed:{ name: 'Unarmed',kind: 'weapon' },

    leather:{ name: 'Leather', kind: 'armour' },
    chain:  { name: 'Chain',   kind: 'armour' },
    plate:  { name: 'Plate',   kind: 'armour' },
    shield: { name: 'Shield',  kind: 'armour' },
    dodge:  { name: 'Dodging', kind: 'armour' },

    fire:   { name: 'Fire',   kind: 'magic' },
    water:  { name: 'Water',  kind: 'magic' },
    air:    { name: 'Air',    kind: 'magic' },
    earth:  { name: 'Earth',  kind: 'magic' },
    spirit: { name: 'Spirit', kind: 'magic' },
    mind:   { name: 'Mind',   kind: 'magic' },
    body:   { name: 'Body',   kind: 'magic' },
    light:  { name: 'Light',  kind: 'magic' },
    dark:   { name: 'Dark',   kind: 'magic' },

    bodybuilding: { name: 'Bodybuilding', kind: 'misc' },
    meditation:   { name: 'Meditation',   kind: 'misc' },
    merchant:     { name: 'Merchant',     kind: 'misc' },
    repair:       { name: 'Repair',       kind: 'misc' },
    identify:     { name: 'Identify',     kind: 'misc' },
    disarm:       { name: 'Disarm Trap',  kind: 'misc' },
    perception:   { name: 'Perception',   kind: 'misc' },
    learning:     { name: 'Learning',     kind: 'misc' },
    alchemy:      { name: 'Alchemy',      kind: 'misc' },
  };

  const MASTERY = { NONE: 0, NOVICE: 1, EXPERT: 2, MASTER: 3 };
  const MASTERY_NAME = ['—', 'Novice', 'Expert', 'Master'];

  // What a mastery tier multiplies the raw skill level by when it feeds a formula. Expert and
  // Master are worth training for; a master at skill 8 beats a novice at skill 20.
  const MASTERY_MULT = [0, 1.0, 1.6, 2.4];

  // Effective skill: the single number every formula consumes.
  function skillPower(ch, key) {
    const s = ch.skills && ch.skills[key];
    if (!s || s.mastery === 0) return 0;
    return s.lvl * MASTERY_MULT[s.mastery];
  }

  function skillLevel(ch, key) {
    const s = ch.skills && ch.skills[key];
    return s ? s.lvl : 0;
  }
  function mastery(ch, key) {
    const s = ch.skills && ch.skills[key];
    return s ? s.mastery : 0;
  }
  function hasSkill(ch, key) { return mastery(ch, key) > 0; }

  // ---------------------------------------------------------------- classes
  // `caps` is the highest mastery this class may ever reach in a skill. A class that cannot reach
  // Master in its own weapon is not a class, it is a handicap — so each has a clear identity.
  const CLASSES = {
    knight: {
      name: 'Knight', hpDie: 9, spDie: 0, hpBase: 20, spBase: 0,
      prime: 'mig',
      caps: {
        sword: 3, axe: 3, spear: 3, mace: 3, dagger: 2, staff: 2, bow: 2, unarmed: 2,
        leather: 3, chain: 3, plate: 3, shield: 3, dodge: 2,
        bodybuilding: 3, merchant: 2, repair: 3, identify: 2, disarm: 2, perception: 2, learning: 2,
      },
      start: ['sword', 'leather'],
      blurb: 'No magic at all, and the best armour and weapon skills in the party. The wall the rest of the party stands behind.',
    },
    templar: {
      name: 'Templar', hpDie: 8, spDie: 2, hpBase: 16, spBase: 6,
      prime: 'per',
      caps: {
        sword: 3, axe: 2, spear: 2, mace: 3, dagger: 2, staff: 2, bow: 2, unarmed: 2,
        leather: 3, chain: 3, plate: 3, shield: 3, dodge: 2,
        spirit: 2, mind: 2, body: 2,
        bodybuilding: 3, meditation: 2, merchant: 2, repair: 2, identify: 2, disarm: 2, perception: 2, learning: 2,
      },
      start: ['sword', 'chain', 'spirit'],
      blurb: 'Plate armour and the self schools. Slower to come online than a Knight and still standing when the Knight is not.',
    },
    ranger: {
      name: 'Ranger', hpDie: 7, spDie: 2, hpBase: 14, spBase: 6,
      prime: 'acc',
      caps: {
        sword: 2, axe: 2, spear: 3, mace: 2, dagger: 3, staff: 2, bow: 3, unarmed: 2,
        leather: 3, chain: 3, plate: 1, shield: 2, dodge: 3,
        fire: 2, water: 2, air: 2, earth: 2,
        bodybuilding: 2, meditation: 2, merchant: 2, repair: 2, identify: 3, disarm: 3, perception: 3, learning: 3, alchemy: 2,
      },
      start: ['bow', 'leather', 'perception'],
      blurb: 'The only Master of the bow, and the party eyes: Perception and Disarm Trap at Master.',
    },
    priest: {
      name: 'Priest', hpDie: 6, spDie: 4, hpBase: 12, spBase: 12,
      prime: 'per',
      caps: {
        sword: 1, axe: 1, spear: 2, mace: 3, dagger: 2, staff: 3, bow: 1, unarmed: 2,
        leather: 3, chain: 3, plate: 1, shield: 3, dodge: 2,
        spirit: 3, mind: 3, body: 3, light: 3,
        bodybuilding: 2, meditation: 3, merchant: 2, repair: 1, identify: 2, disarm: 1, perception: 2, learning: 3, alchemy: 3,
      },
      start: ['mace', 'leather', 'body'],
      blurb: 'Master of Spirit, Mind, Body and Light. Nothing else in the game brings a dead character back.',
    },
    mage: {
      name: 'Mage', hpDie: 4, spDie: 5, hpBase: 8, spBase: 16,
      prime: 'int',
      caps: {
        sword: 1, axe: 1, spear: 1, mace: 1, dagger: 3, staff: 3, bow: 2, unarmed: 1,
        leather: 3, chain: 1, plate: 1, shield: 1, dodge: 3,
        fire: 3, water: 3, air: 3, earth: 3, dark: 3,
        meditation: 3, merchant: 3, identify: 3, perception: 2, learning: 3, alchemy: 3,
      },
      start: ['dagger', 'leather', 'fire'],
      blurb: 'Master of all four elements and of Dark. Dies to a stiff breeze until roughly level eight.',
    },
    warden: {
      name: 'Warden', hpDie: 5, spDie: 4, hpBase: 10, spBase: 14,
      prime: 'int',
      caps: {
        sword: 1, axe: 2, spear: 2, mace: 3, dagger: 2, staff: 3, bow: 2, unarmed: 2,
        leather: 3, chain: 2, plate: 1, shield: 2, dodge: 2,
        fire: 2, water: 2, air: 2, earth: 2, spirit: 2, mind: 2, body: 2,
        bodybuilding: 2, meditation: 3, merchant: 3, identify: 2, perception: 3, learning: 2, alchemy: 3,
      },
      start: ['staff', 'leather', 'earth'],
      blurb: 'Expert in nearly every school and Master of none. The party that is short one specialist takes a Warden.',
    },
  };

  const CLASS_IDS = Object.keys(CLASSES);

  function classCap(clsId, skill) {
    const c = CLASSES[clsId];
    if (!c) return 0;
    return c.caps[skill] || 0;
  }
  function canLearn(ch, skill) { return classCap(ch.cls, skill) > 0; }

  // ---------------------------------------------------------------- derived
  function maxHP(ch) {
    const c = CLASSES[ch.cls];
    const endB = statBonus(effStat(ch, 'end'));
    const bb = skillPower(ch, 'bodybuilding');
    return Math.max(1, Math.round(c.hpBase + (c.hpDie + endB) * ch.level + bb));
  }

  function maxSP(ch) {
    const c = CLASSES[ch.cls];
    if (c.spDie === 0 && c.spBase === 0) return 0;
    // Casters key SP off their prime stat: Intellect for arcane, Personality for divine.
    const key = (c.prime === 'int' || c.prime === 'per') ? c.prime : 'int';
    const b = statBonus(effStat(ch, key));
    const med = skillPower(ch, 'meditation');
    return Math.max(0, Math.round(c.spBase + (c.spDie + b) * ch.level + med));
  }

  // Effective stat = base + equipment/effect bonus. `bonus` is recomputed, never saved.
  function effStat(ch, k) {
    const base = (ch.base && ch.base[k]) || 0;
    const bon = (ch.bonus && ch.bonus[k]) || 0;
    let v = base + bon;
    if (ch.cond && ch.cond.weak) v = Math.round(v * 0.5);
    return v;
  }

  // Armour class. Armour skill contributes only while the character is trained in what they wear —
  // handled by the caller passing the worn skill key.
  function armourClass(ch, wornSkill, itemAC) {
    const spd = statBonus(effStat(ch, 'spd'));
    const dodge = skillPower(ch, 'dodge');
    const worn = wornSkill ? skillPower(ch, wornSkill) : 0;
    return Math.max(0, Math.round((itemAC || 0) + spd + dodge * 0.5 + worn * 0.5));
  }

  // How long until this character may act again. Lower is better. Speed and weapon skill both cut
  // it, which is why a fast character with a trained weapon acts roughly twice as often.
  function recoveryTime(ch, weaponSpeed, weaponSkill) {
    const spd = statBonus(effStat(ch, 'spd'));
    const sk = weaponSkill ? skillPower(ch, weaponSkill) : 0;
    const base = (weaponSpeed || 100) - spd * 2 - sk * 1.5;
    return Math.max(5, Math.round(base));
  }

  // ---------------------------------------------------------------- combat
  function attackBonus(ch, weaponSkill, itemBonus) {
    const acc = statBonus(effStat(ch, 'acc'));
    const sk = skillPower(ch, weaponSkill);
    return Math.round(ch.level / 2 + acc + sk + (itemBonus || 0));
  }

  // Probability in [0.05, 0.95]. Never certain in either direction: a guaranteed hit removes the
  // reason to improve Accuracy and a guaranteed miss makes a boss unkillable at low level.
  function hitChance(attack, targetAC) {
    const p = (attack + 15) / (attack + targetAC + 30);
    return clamp(p, 0.05, 0.95);
  }

  function rollHit(rng, attack, targetAC) {
    return rng.next() < hitChance(attack, targetAC);
  }

  // Damage before resistance. `dice` is {n, sides, plus}.
  function rollDamage(rng, dice, migBonus, itemBonus) {
    const d = rng.dice(dice.n, dice.sides) + (dice.plus || 0);
    return Math.max(1, d + (migBonus || 0) + (itemBonus || 0));
  }

  // Resistance is a soft curve, never a hard immunity: at resistance 200 roughly 15% still lands.
  // A hard immunity turns a fight into an unwinnable wall with no feedback.
  function resistFactor(resistance) {
    const r = Math.max(0, resistance || 0);
    return clamp(30 / (30 + r), 0.15, 1);
  }

  function applyResist(dmg, resistance) {
    return Math.max(1, Math.round(dmg * resistFactor(resistance)));
  }

  // ---------------------------------------------------------------- XP and levels
  // Total XP required to BE level n. Level 1 is free; level 2 costs 1000; the curve is quadratic
  // so late levels are a real commitment without becoming a wall.
  function xpForLevel(n) {
    if (n <= 1) return 0;
    return 1000 * (n - 1) * n / 2;
  }

  function levelForXP(xp) {
    let n = 1;
    while (xpForLevel(n + 1) <= xp && n < 100) n++;
    return n;
  }

  // Training is a purchase, not an automatic promotion: MM6 made you go back to town, and that
  // round trip is most of what made a level feel earned.
  function trainCost(level) { return level * level * 10; }

  function skillUpCost(currentLevel) { return currentLevel + 1; }

  function masteryReq(tier) {
    // { skill level required, gold }
    if (tier === MASTERY.EXPERT) return { lvl: 4, gold: 2000 };
    if (tier === MASTERY.MASTER) return { lvl: 8, gold: 8000 };
    return { lvl: 0, gold: 0 };
  }

  // ---------------------------------------------------------------- economy
  // Merchant skill moves both directions of the spread. An untrained party pays 1.5x and sells at
  // 0.25x; a Master pays near list and sells near half.
  // The floor is 2, not 1. At a floor of 1 the cheapest item's buy and sell prices both clamp to
  // 1, and buy == sell is a closed loop a player will find and a reviewer will report. Keeping
  // buy strictly above sell at every base value and every Merchant level is the invariant.
  function buyPrice(base, ch) {
    const m = ch ? skillPower(ch, 'merchant') : 0;
    const mult = clamp(1.5 - m * 0.02, 1.0, 1.5);
    return Math.max(2, Math.round(base * mult));
  }

  function sellPrice(base, ch) {
    const m = ch ? skillPower(ch, 'merchant') : 0;
    const mult = clamp(0.25 + m * 0.012, 0.25, 0.55);
    return Math.max(1, Math.floor(base * mult));
  }

  function repairCost(base, condition) {
    return Math.max(1, Math.round(base * 0.35 * (1 - clamp(condition, 0, 1))));
  }

  function identifyCost(base) { return Math.max(5, Math.round(base * 0.08)); }

  function healCost(ch) {
    const missing = Math.max(0, maxHP(ch) - ch.hp);
    let c = missing;
    if (ch.cond) {
      if (ch.cond.poison) c += 25;
      if (ch.cond.disease) c += 50;
      if (ch.cond.curse) c += 90;
      if (ch.cond.dead) c += 250;
      if (ch.cond.unconscious) c += 10;
    }
    return Math.max(0, Math.round(c));
  }

  // ---------------------------------------------------------------- rest
  const REST_MINUTES = 8 * 60;
  const REST_FOOD = 2;

  // Resting is refused, with a REASON, rather than silently failing. A rest button that does
  // nothing and says nothing is the single most common 1998 UI sin.
  function canRest(party, isSafe) {
    if (!isSafe) return { ok: false, why: 'Enemies are too close to make camp.' };
    if (party.food < REST_FOOD) return { ok: false, why: 'Not enough food to camp.' };
    return { ok: true };
  }

  // Returns the DELTA to apply; the caller applies it. Pure function, no mutation.
  function restResult(party) {
    const out = { minutes: REST_MINUTES, food: -REST_FOOD, members: [] };
    for (const ch of party.members) {
      const dead = ch.cond && (ch.cond.dead || ch.cond.unconscious);
      out.members.push({
        id: ch.id,
        hp: dead ? 0 : maxHP(ch) - ch.hp,
        sp: dead ? 0 : maxSP(ch) - ch.sp,
        // Rest clears fatigue-shaped conditions only. Poison, disease, curse and death need a
        // temple or a spell — otherwise the temple has no reason to exist.
        clears: dead ? [] : ['asleep', 'afraid', 'weak'],
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- traps
  function disarmChance(ch, trapLevel) {
    const sk = skillPower(ch, 'disarm');
    const lck = statBonus(effStat(ch, 'lck'));
    const p = (sk + lck + 10) / (sk + lck + 10 + trapLevel * 6);
    return clamp(p, 0.05, 0.95);
  }

  function trapDamage(rng, trapLevel) {
    return rng.dice(trapLevel, 6) + trapLevel * 2;
  }

  function perceptionChance(ch, hideLevel) {
    const sk = skillPower(ch, 'perception');
    const p = (sk + 6) / (sk + 6 + hideLevel * 5);
    return clamp(p, 0.02, 0.95);
  }

  // ---------------------------------------------------------------- conditions
  // Ordered worst-first. `worstCondition` drives the portrait and who may act.
  const CONDITIONS = ['dead', 'unconscious', 'asleep', 'curse', 'disease', 'poison', 'afraid', 'weak'];

  function worstCondition(ch) {
    if (!ch.cond) return null;
    for (const c of CONDITIONS) if (ch.cond[c]) return c;
    return null;
  }

  function canAct(ch) {
    if (!ch.cond) return true;
    return !(ch.cond.dead || ch.cond.unconscious || ch.cond.asleep);
  }

  function isDead(ch) { return !!(ch.cond && ch.cond.dead); }

  // Applying damage is a rule, not glue: dropping to 0 must always produce a consistent state, or
  // a character ends up at negative HP and "alive" in one code path and dead in another.
  function applyDamage(ch, dmg) {
    const out = { dmg: Math.max(0, Math.round(dmg)), died: false, knocked: false };
    ch.hp -= out.dmg;
    if (ch.hp <= -10) {
      ch.hp = -10;
      if (!ch.cond.dead) { ch.cond.dead = true; out.died = true; }
    } else if (ch.hp <= 0) {
      if (!ch.cond.unconscious && !ch.cond.dead) { ch.cond.unconscious = true; out.knocked = true; }
    }
    return out;
  }

  function healTo(ch, amount) {
    if (ch.cond && ch.cond.dead) return 0;
    const before = ch.hp;
    ch.hp = Math.min(maxHP(ch), ch.hp + amount);
    if (ch.hp > 0 && ch.cond) ch.cond.unconscious = false;
    return ch.hp - before;
  }

  // ---------------------------------------------------------------- creation
  // Point-buy at creation. The floor of 7 and ceiling of 19 is what stops a min-maxed 25/3/3/3
  // party, which trivialises the first third of the game and then hits a wall.
  const CREATE_POINTS = 50;
  const STAT_MIN = 7;
  const STAT_MAX = 19;

  // Raising a stat costs more the higher it goes, so spread is cheap and spikes are expensive.
  function statStepCost(v) {
    if (v < 15) return 1;
    if (v < 17) return 2;
    return 3;
  }

  function statBuyCost(from, to) {
    let c = 0;
    for (let v = from; v < to; v++) c += statStepCost(v);
    return c;
  }

  function creationCost(base) {
    let c = 0;
    for (const k of STATS) c += statBuyCost(STAT_MIN, base[k]);
    return c;
  }

  function validateCreation(spec) {
    const errs = [];
    if (!spec || !Array.isArray(spec.members)) return ['no members'];
    if (spec.members.length !== 4) errs.push('party must have exactly 4 members');
    const names = new Set();
    for (const m of spec.members) {
      if (!m.name || !m.name.trim()) errs.push('a member has no name');
      if (names.has(m.name)) errs.push('duplicate name: ' + m.name);
      names.add(m.name);
      if (!CLASSES[m.cls]) errs.push('unknown class: ' + m.cls);
      for (const k of STATS) {
        const v = m.base[k];
        if (v < STAT_MIN || v > STAT_MAX) errs.push(m.name + ': ' + k + ' out of range (' + v + ')');
      }
      const cost = creationCost(m.base);
      if (cost > CREATE_POINTS) errs.push(m.name + ': spent ' + cost + ' of ' + CREATE_POINTS + ' points');
    }
    return errs;
  }

  // Build a full character from a creation spec. Pure: returns a new object.
  function makeCharacter(spec, id) {
    const cls = CLASSES[spec.cls];
    const skills = {};
    for (const s of cls.start) skills[s] = { lvl: 1, mastery: MASTERY.NOVICE };
    const ch = {
      id,
      name: spec.name,
      cls: spec.cls,
      sex: spec.sex || 'f',
      portrait: spec.portrait === undefined ? id : spec.portrait,
      base: Object.assign({}, spec.base),
      bonus: { mig: 0, int: 0, per: 0, end: 0, acc: 0, spd: 0, lck: 0 },
      hp: 1, sp: 0, ac: 0, xp: 0, level: 1, skillPts: 0,
      skills,
      cond: { poison: false, disease: false, curse: false, asleep: false, afraid: false, weak: false, unconscious: false, dead: false },
      equip: { weapon: null, offhand: null, bow: null, armour: null, helm: null, boots: null, cloak: null, gaunt: null, belt: null, amulet: null, ring1: null, ring2: null },
      pack: [],
      recovery: 0,
      quickSpell: null,
    };
    ch.hp = maxHP(ch);
    ch.sp = maxSP(ch);
    return ch;
  }

  // Awarding XP is a rule because level-up has to be consistent everywhere it can happen: combat,
  // quest turn-in and the debug harness must all produce the same character.
  function awardXP(ch, amount) {
    if (isDead(ch)) return { gained: 0, levels: 0 };
    const before = ch.level;
    ch.xp += Math.max(0, Math.round(amount));
    const now = levelForXP(ch.xp);
    // The level is EARNED here but the character is not promoted until trained in town. `pending`
    // is what the trainer charges for.
    return { gained: amount, levels: Math.max(0, now - before), pending: now - ch.level };
  }

  function promote(ch) {
    const target = levelForXP(ch.xp);
    if (target <= ch.level) return 0;
    const gained = target - ch.level;
    ch.level = target;
    ch.skillPts += gained * 2;
    ch.hp = maxHP(ch);
    ch.sp = maxSP(ch);
    return gained;
  }

  return {
    STATS, STAT_NAME, statBonus, STAT_BREAKS,
    SKILLS, SKILL_KINDS, MASTERY, MASTERY_NAME, MASTERY_MULT,
    skillPower, skillLevel, mastery, hasSkill,
    CLASSES, CLASS_IDS, classCap, canLearn,
    effStat, maxHP, maxSP, armourClass, recoveryTime,
    attackBonus, hitChance, rollHit, rollDamage, resistFactor, applyResist,
    xpForLevel, levelForXP, trainCost, skillUpCost, masteryReq,
    buyPrice, sellPrice, repairCost, identifyCost, healCost,
    REST_MINUTES, REST_FOOD, canRest, restResult,
    disarmChance, trapDamage, perceptionChance,
    CONDITIONS, worstCondition, canAct, isDead, applyDamage, healTo,
    CREATE_POINTS, STAT_MIN, STAT_MAX, statStepCost, statBuyCost, creationCost,
    validateCreation, makeCharacter, awardXP, promote,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
