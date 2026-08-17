// 02_spells.js — nine schools, eleven spells each, ninety-nine total.
// Owner: spells. Calls Core and Rules.
//
// Pure. `resolve` returns a list of EFFECTS to apply; it never mutates a character. The caller
// applies them. That split is what lets the systems suite check a meteor shower's numbers without
// a world, and what stops combat code from growing its own private damage formula.
//
// FULL FUNCTIONALITY IS THE BAR. Every spell below produces a real effect that the game layer acts
// on — there are no decorative entries. Utility spells (Town Portal, Lloyd's Beacon, Wizard Eye,
// Enchant Item, Fly, Water Walk) carry a `special` the game implements; if a special has no
// handler, the systems suite fails.

const Spellcraft = (() => {
  'use strict';

  const { clamp } = Core;
  const { MASTERY, skillPower, statBonus, effStat } = Rules;

  const SCHOOLS = {
    fire:   { name: 'Fire',   kind: 'elemental', gem: 15 },
    air:    { name: 'Air',    kind: 'elemental', gem: 9 },
    water:  { name: 'Water',  kind: 'elemental', gem: 8 },
    earth:  { name: 'Earth',  kind: 'elemental', gem: 5 },
    spirit: { name: 'Spirit', kind: 'self',      gem: 13 },
    mind:   { name: 'Mind',   kind: 'self',      gem: 12 },
    body:   { name: 'Body',   kind: 'self',      gem: 11 },
    light:  { name: 'Light',  kind: 'divine',    gem: 0 },
    dark:   { name: 'Dark',   kind: 'divine',    gem: 12 },
  };
  const SCHOOL_IDS = Object.keys(SCHOOLS);

  // Eleven tiers per school. 1-4 Novice, 5-7 Expert, 8-11 Master — the whole progression curve of
  // a caster, and why training matters more to them than levelling.
  const TIER_MASTERY = [0,
    MASTERY.NOVICE, MASTERY.NOVICE, MASTERY.NOVICE, MASTERY.NOVICE,
    MASTERY.EXPERT, MASTERY.EXPERT, MASTERY.EXPERT,
    MASTERY.MASTER, MASTERY.MASTER, MASTERY.MASTER, MASTERY.MASTER];

  // target: 'enemy' | 'enemies' | 'ally' | 'party' | 'self' | 'world' | 'item'
  // dmg/heal are dice; `scale` multiplies caster power into the result.
  // buff/amount/dur -> a timed party or single-target modifier the game reads.
  // status -> a timed condition on an enemy.
  // special -> a named hook the game layer MUST implement.
  const S = (school, tier, sp, name, target, extra) =>
    Object.assign({ school, tier, sp, name, target }, extra || {});

  const SPELLS = {
    // ============================================================ FIRE
    torch_light:   S('fire', 1, 1, 'Torch Light', 'party', { buff: 'light', amount: 4, dur: 180 }),
    fire_bolt:     S('fire', 2, 3, 'Fire Bolt', 'enemy', { dmg: { n: 1, sides: 6 }, scale: 1.0, elem: 'fire' }),
    prot_fire:     S('fire', 3, 4, 'Protection from Fire', 'party', { buff: 'resist_fire', amount: 20, dur: 240 }),
    fire_aura:     S('fire', 4, 6, 'Fire Aura', 'item', { special: 'enchant_weapon', elem: 'fire', amount: 4 }),
    haste:         S('fire', 5, 10, 'Haste', 'party', { buff: 'haste', amount: 30, dur: 120 }),
    fireball:      S('fire', 6, 12, 'Fireball', 'enemies', { dmg: { n: 3, sides: 6 }, scale: 1.8, elem: 'fire', radius: 3.0 }),
    fire_spike:    S('fire', 7, 14, 'Fire Spike', 'enemy', { dmg: { n: 4, sides: 8 }, scale: 2.2, elem: 'fire', pierce: true }),
    immolation:    S('fire', 8, 18, 'Immolation', 'party', { buff: 'immolation', amount: 8, dur: 90 }),
    meteor_shower: S('fire', 9, 22, 'Meteor Shower', 'enemies', { dmg: { n: 5, sides: 8 }, scale: 2.6, elem: 'fire', radius: 5.0, outdoorOnly: true }),
    inferno:       S('fire', 10, 26, 'Inferno', 'enemies', { dmg: { n: 6, sides: 8 }, scale: 3.0, elem: 'fire', radius: 4.0, indoorOnly: true }),
    incinerate:    S('fire', 11, 32, 'Incinerate', 'enemy', { dmg: { n: 12, sides: 8 }, scale: 4.5, elem: 'fire' }),

    // ============================================================ AIR
    wizard_eye:    S('air', 1, 1, 'Wizard Eye', 'party', { special: 'wizard_eye', buff: 'wizard_eye', amount: 1, dur: 300 }),
    feather_fall:  S('air', 2, 3, 'Feather Fall', 'party', { buff: 'featherfall', amount: 1, dur: 180 }),
    prot_air:      S('air', 3, 4, 'Protection from Air', 'party', { buff: 'resist_elec', amount: 20, dur: 240 }),
    sparks:        S('air', 4, 6, 'Sparks', 'enemies', { dmg: { n: 2, sides: 4 }, scale: 0.9, elem: 'elec', radius: 2.5 }),
    jump:          S('air', 5, 6, 'Jump', 'party', { special: 'jump', buff: 'jump', amount: 1, dur: 1 }),
    shield:        S('air', 6, 10, 'Shield', 'party', { buff: 'shield', amount: 12, dur: 180 }),
    lightning:     S('air', 7, 14, 'Lightning Bolt', 'enemy', { dmg: { n: 5, sides: 8 }, scale: 2.4, elem: 'elec', pierce: true }),
    invisibility:  S('air', 8, 18, 'Invisibility', 'party', { buff: 'invisible', amount: 1, dur: 90 }),
    implosion:     S('air', 9, 24, 'Implosion', 'enemy', { dmg: { n: 8, sides: 8 }, scale: 3.4, elem: 'elec' }),
    fly:           S('air', 10, 26, 'Fly', 'party', { special: 'fly', buff: 'fly', amount: 1, dur: 300, outdoorOnly: true }),
    starburst:     S('air', 11, 34, 'Starburst', 'enemies', { dmg: { n: 10, sides: 8 }, scale: 4.0, elem: 'elec', radius: 6.0, outdoorOnly: true }),

    // ============================================================ WATER
    awaken:        S('water', 1, 1, 'Awaken', 'party', { cure: ['asleep'] }),
    poison_spray:  S('water', 2, 3, 'Poison Spray', 'enemy', { dmg: { n: 1, sides: 6 }, scale: 0.9, elem: 'poison', status: 'poison', dur: 40 }),
    prot_water:    S('water', 3, 4, 'Protection from Water', 'party', { buff: 'resist_cold', amount: 20, dur: 240 }),
    ice_bolt:      S('water', 4, 6, 'Ice Bolt', 'enemy', { dmg: { n: 3, sides: 6 }, scale: 1.4, elem: 'cold' }),
    water_walk:    S('water', 5, 8, 'Water Walk', 'party', { special: 'water_walk', buff: 'waterwalk', amount: 1, dur: 300 }),
    recharge:      S('water', 6, 10, 'Recharge Item', 'item', { special: 'recharge' }),
    acid_burst:    S('water', 7, 13, 'Acid Burst', 'enemy', { dmg: { n: 5, sides: 6 }, scale: 2.2, elem: 'poison' }),
    enchant_item:  S('water', 8, 20, 'Enchant Item', 'item', { special: 'enchant_item' }),
    town_portal:   S('water', 9, 24, 'Town Portal', 'world', { special: 'town_portal' }),
    ice_blast:     S('water', 10, 26, 'Ice Blast', 'enemies', { dmg: { n: 7, sides: 8 }, scale: 3.0, elem: 'cold', radius: 4.0 }),
    lloyds_beacon: S('water', 11, 30, "Lloyd's Beacon", 'world', { special: 'lloyds_beacon' }),

    // ============================================================ EARTH
    stun:          S('earth', 1, 2, 'Stun', 'enemy', { status: 'stunned', dur: 20 }),
    slow:          S('earth', 2, 4, 'Slow', 'enemies', { status: 'slowed', dur: 40, radius: 3.0 }),
    prot_earth:    S('earth', 3, 4, 'Protection from Earth', 'party', { buff: 'resist_phys', amount: 20, dur: 240 }),
    deadly_swarm:  S('earth', 4, 6, 'Deadly Swarm', 'enemies', { dmg: { n: 2, sides: 6 }, scale: 1.2, elem: 'phys', radius: 3.0 }),
    stone_skin:    S('earth', 5, 8, 'Stone Skin', 'party', { buff: 'ac', amount: 14, dur: 240 }),
    blades:        S('earth', 6, 11, 'Blades', 'enemy', { dmg: { n: 5, sides: 5 }, scale: 2.0, elem: 'phys' }),
    stone_flesh:   S('earth', 7, 12, 'Stone to Flesh', 'ally', { cure: ['stoned', 'weak'] }),
    rock_blast:    S('earth', 8, 16, 'Rock Blast', 'enemies', { dmg: { n: 6, sides: 7 }, scale: 2.6, elem: 'phys', radius: 3.5 }),
    death_blossom: S('earth', 9, 24, 'Death Blossom', 'enemies', { dmg: { n: 8, sides: 8 }, scale: 3.2, elem: 'phys', radius: 5.0, outdoorOnly: true }),
    mass_distort:  S('earth', 10, 28, 'Mass Distortion', 'enemy', { special: 'mass_distortion', scale: 0.35 }),
    quake:         S('earth', 11, 34, 'Earthquake', 'enemies', { dmg: { n: 10, sides: 8 }, scale: 3.8, elem: 'phys', radius: 7.0 }),

    // ============================================================ SPIRIT
    detect_life:   S('spirit', 1, 1, 'Detect Life', 'party', { buff: 'detect_life', amount: 1, dur: 240 }),
    bless:         S('spirit', 2, 3, 'Bless', 'party', { buff: 'hit', amount: 8, dur: 180 }),
    fate:          S('spirit', 3, 5, 'Fate', 'ally', { buff: 'fate', amount: 20, dur: 60 }),
    turn_undead:   S('spirit', 4, 7, 'Turn Undead', 'enemies', { special: 'turn_undead', radius: 5.0, dur: 40 }),
    remove_curse:  S('spirit', 5, 8, 'Remove Curse', 'ally', { cure: ['curse'] }),
    preservation:  S('spirit', 6, 10, 'Preservation', 'party', { buff: 'preservation', amount: 1, dur: 240 }),
    heroism:       S('spirit', 7, 12, 'Heroism', 'party', { buff: 'dmg', amount: 8, dur: 180 }),
    spirit_lash:   S('spirit', 8, 16, 'Spirit Lash', 'enemy', { dmg: { n: 6, sides: 8 }, scale: 2.8, elem: 'spirit' }),
    raise_dead:    S('spirit', 9, 22, 'Raise Dead', 'ally', { cure: ['dead', 'unconscious'], healFrac: 0.15, special: 'raise_dead' }),
    shared_life:   S('spirit', 10, 24, 'Shared Life', 'party', { special: 'shared_life' }),
    resurrect:     S('spirit', 11, 32, 'Resurrection', 'ally', { cure: ['dead', 'unconscious', 'weak'], healFrac: 0.5 }),

    // ============================================================ MIND
    remove_fear:   S('mind', 1, 1, 'Remove Fear', 'party', { cure: ['afraid'] }),
    mind_blast:    S('mind', 2, 3, 'Mind Blast', 'enemy', { dmg: { n: 2, sides: 5 }, scale: 1.1, elem: 'mind' }),
    prot_mind:     S('mind', 3, 4, 'Protection from Mind', 'party', { buff: 'resist_mind', amount: 20, dur: 240 }),
    precision:     S('mind', 4, 6, 'Precision', 'party', { buff: 'acc', amount: 12, dur: 180 }),
    cure_para:     S('mind', 5, 8, 'Cure Paralysis', 'ally', { cure: ['paralysed', 'stoned'] }),
    charm:         S('mind', 6, 10, 'Charm', 'enemy', { status: 'charmed', dur: 45 }),
    mass_fear:     S('mind', 7, 13, 'Mass Fear', 'enemies', { status: 'afraid', dur: 40, radius: 5.0 }),
    feeblemind:    S('mind', 8, 16, 'Feeblemind', 'enemy', { status: 'feebled', dur: 60 }),
    berserk:       S('mind', 9, 20, 'Berserk', 'enemies', { status: 'berserk', dur: 45, radius: 4.0 }),
    enslave:       S('mind', 10, 26, 'Enslave', 'enemy', { status: 'enslaved', dur: 120 }),
    psychic_shock: S('mind', 11, 32, 'Psychic Shock', 'enemy', { dmg: { n: 10, sides: 8 }, scale: 4.0, elem: 'mind' }),

    // ============================================================ BODY
    cure_weak:     S('body', 1, 1, 'Cure Weakness', 'ally', { cure: ['weak'] }),
    first_aid:     S('body', 2, 2, 'First Aid', 'ally', { heal: { n: 1, sides: 8 }, scale: 1.0 }),
    prot_body:     S('body', 3, 4, 'Protection from Body', 'party', { buff: 'resist_poison', amount: 20, dur: 240 }),
    harm:          S('body', 4, 6, 'Harm', 'enemy', { dmg: { n: 3, sides: 6 }, scale: 1.5, elem: 'body' }),
    regeneration:  S('body', 5, 9, 'Regeneration', 'party', { buff: 'regen', amount: 3, dur: 180 }),
    cure_poison:   S('body', 6, 10, 'Cure Poison', 'ally', { cure: ['poison'] }),
    hammerhands:   S('body', 7, 13, 'Hammerhands', 'ally', { buff: 'hammerhands', amount: 10, dur: 180 }),
    cure_disease:  S('body', 8, 16, 'Cure Disease', 'ally', { cure: ['disease'] }),
    protection:    S('body', 9, 20, 'Protection from Magic', 'party', { buff: 'resist_magic', amount: 40, dur: 240 }),
    power_cure:    S('body', 10, 24, 'Power Cure', 'party', { heal: { n: 5, sides: 10 }, scale: 3.0 }),
    flying_fist:   S('body', 11, 30, 'Flying Fist', 'enemy', { dmg: { n: 9, sides: 8 }, scale: 3.6, elem: 'body' }),

    // ============================================================ LIGHT
    light_bolt:    S('light', 1, 2, 'Light Bolt', 'enemy', { dmg: { n: 2, sides: 6 }, scale: 1.2, elem: 'light' }),
    destroy_undead:S('light', 2, 5, 'Destroy Undead', 'enemy', { special: 'destroy_undead', scale: 3.0, elem: 'light' }),
    dispel_magic:  S('light', 3, 7, 'Dispel Magic', 'enemies', { special: 'dispel_magic', radius: 5.0 }),
    paralyze:      S('light', 4, 9, 'Paralyze', 'enemy', { status: 'paralysed', dur: 60 }),
    summon_elem:   S('light', 5, 12, 'Summon Elemental', 'world', { special: 'summon_elemental', dur: 180 }),
    day_of_gods:   S('light', 6, 16, 'Day of the Gods', 'party', { buff: 'day_of_gods', amount: 12, dur: 300 }),
    prismatic:     S('light', 7, 20, 'Prismatic Light', 'enemies', { dmg: { n: 6, sides: 8 }, scale: 2.8, elem: 'light', radius: 6.0, indoorOnly: true }),
    day_of_prot:   S('light', 8, 24, 'Day of Protection', 'party', { buff: 'day_of_protection', amount: 25, dur: 300 }),
    hour_of_power: S('light', 9, 28, 'Hour of Power', 'party', { special: 'hour_of_power', dur: 300 }),
    sunray:        S('light', 10, 30, 'Sunray', 'enemy', { dmg: { n: 11, sides: 8 }, scale: 4.2, elem: 'light', outdoorOnly: true }),
    divine_int:    S('light', 11, 40, 'Divine Intervention', 'party', { special: 'divine_intervention' }),

    // ============================================================ DARK
    reanimate:     S('dark', 1, 3, 'Reanimate', 'world', { special: 'reanimate', dur: 180 }),
    toxic_cloud:   S('dark', 2, 5, 'Toxic Cloud', 'enemies', { dmg: { n: 3, sides: 6 }, scale: 1.5, elem: 'poison', radius: 3.5, status: 'poison', dur: 40 }),
    vampiric:      S('dark', 3, 8, 'Vampiric Weapon', 'item', { special: 'enchant_weapon', elem: 'drain', amount: 5 }),
    shrapmetal:    S('dark', 4, 10, 'Shrapmetal', 'enemies', { dmg: { n: 4, sides: 6 }, scale: 1.8, elem: 'phys', radius: 2.5 }),
    control_undead:S('dark', 5, 13, 'Control Undead', 'enemy', { special: 'control_undead', dur: 90 }),
    pain_reflect:  S('dark', 6, 16, 'Pain Reflection', 'party', { buff: 'pain_reflection', amount: 40, dur: 180 }),
    sacrifice:     S('dark', 7, 18, 'Sacrifice', 'ally', { special: 'sacrifice' }),
    dragon_breath: S('dark', 8, 22, 'Dragon Breath', 'enemies', { dmg: { n: 8, sides: 8 }, scale: 3.2, elem: 'fire', radius: 4.5 }),
    souldrinker:   S('dark', 9, 26, 'Souldrinker', 'enemies', { dmg: { n: 9, sides: 8 }, scale: 3.6, elem: 'dark', radius: 6.0, drain: true }),
    armageddon:    S('dark', 10, 30, 'Armageddon', 'enemies', { special: 'armageddon', dmg: { n: 12, sides: 10 }, scale: 4.0, elem: 'phys', radius: 40, outdoorOnly: true }),
    dark_ritual:   S('dark', 11, 36, 'Dark Ritual', 'party', { special: 'dark_ritual' }),
  };

  const SPELL_IDS = Object.keys(SPELLS);

  // Every `special` a spell can carry. The systems suite asserts the game layer implements each
  // one, so a spell can never be decorative.
  const SPECIALS = [
    'enchant_weapon', 'wizard_eye', 'jump', 'fly', 'water_walk', 'recharge', 'enchant_item',
    'town_portal', 'lloyds_beacon', 'mass_distortion', 'turn_undead', 'raise_dead', 'shared_life',
    'destroy_undead', 'dispel_magic', 'summon_elemental', 'hour_of_power', 'divine_intervention',
    'reanimate', 'control_undead', 'sacrifice', 'armageddon', 'dark_ritual',
  ];

  function bySchool(school) {
    return SPELL_IDS.filter((id) => SPELLS[id].school === school)
      .sort((a, b) => SPELLS[a].tier - SPELLS[b].tier);
  }

  // The caster's power in a school. Drives damage scaling and duration.
  function power(ch, school) {
    const sk = skillPower(ch, school);
    const c = Rules.CLASSES[ch.cls];
    const key = (c.prime === 'per') ? 'per' : 'int';
    return sk + statBonus(effStat(ch, key));
  }

  function spCost(ch, id) {
    const sp = SPELLS[id];
    if (!sp) return 0;
    const m = Rules.mastery(ch, sp.school);
    const mult = m >= MASTERY.MASTER ? 0.7 : m >= MASTERY.EXPERT ? 0.85 : 1.0;
    return Math.max(1, Math.round(sp.sp * mult));
  }

  // Every refusal carries a REASON. A spell that silently fails to cast is indistinguishable from
  // a bug, and the player will report it as one.
  function canCast(ch, id, ctx) {
    const sp = SPELLS[id];
    const c = ctx || {};
    if (!sp) return { ok: false, why: 'No such spell.' };
    if (!Rules.canAct(ch)) return { ok: false, why: ch.name + ' cannot act.' };
    if (Rules.classCap(ch.cls, sp.school) === 0) {
      return { ok: false, why: Rules.CLASSES[ch.cls].name + 's cannot learn ' + SCHOOLS[sp.school].name + '.' };
    }
    const m = Rules.mastery(ch, sp.school);
    if (m === 0) return { ok: false, why: 'Not trained in ' + SCHOOLS[sp.school].name + '.' };
    if (m < TIER_MASTERY[sp.tier]) {
      return { ok: false, why: 'Requires ' + Rules.MASTERY_NAME[TIER_MASTERY[sp.tier]] + ' ' + SCHOOLS[sp.school].name + '.' };
    }
    if (!ch.spells || !ch.spells[id]) return { ok: false, why: ch.name + ' has not learned ' + sp.name + '.' };
    const cost = spCost(ch, id);
    if (ch.sp < cost) return { ok: false, why: 'Not enough spell points (' + cost + ' needed).' };
    if (ch.recovery > 0) return { ok: false, why: ch.name + ' is still recovering.' };
    if (sp.outdoorOnly && c.underground) return { ok: false, why: sp.name + ' will not work underground.' };
    if (sp.indoorOnly && !c.underground) return { ok: false, why: sp.name + ' needs an enclosed space.' };
    return { ok: true, cost };
  }

  function learnable(ch, id) {
    const sp = SPELLS[id];
    if (!sp) return false;
    return Rules.classCap(ch.cls, sp.school) >= TIER_MASTERY[sp.tier];
  }

  // ---------------------------------------------------------------- resolve
  // PURE. Returns { cost, effects: [...] }. The caller applies every effect.
  function resolve(ch, id, targets, rng, ctx) {
    const sp = SPELLS[id];
    const out = { spell: id, cost: spCost(ch, id), effects: [] };
    if (!sp) return out;

    const pw = power(ch, sp.school);
    const tlist = Array.isArray(targets) ? targets : (targets ? [targets] : []);

    // World-scope specials do not need a target list.
    if (sp.target === 'world' || sp.target === 'item') {
      out.effects.push({ kind: 'special', special: sp.special, caster: ch, power: pw,
        dur: Math.round((sp.dur || 60) * (1 + pw / 40)), amount: sp.amount, elem: sp.elem });
      return out;
    }

    for (const t of tlist) {
      if (sp.special) {
        out.effects.push({ kind: 'special', special: sp.special, target: t, caster: ch,
          power: pw, dur: Math.round((sp.dur || 60) * (1 + pw / 40)), scale: sp.scale, elem: sp.elem });
        // Some specials ALSO carry ordinary components (Raise Dead cures and heals).
        if (!sp.cure && !sp.dmg && !sp.heal) continue;
      }
      if (sp.dmg) {
        const base = rng.dice(sp.dmg.n, sp.dmg.sides);
        const raw = Math.round(base + pw * sp.scale);
        // `pierce` ignores resistance, which is the entire reason to carry a pierce spell.
        const res = sp.pierce ? 0 : ((t.resist && t.resist[sp.elem]) || 0);
        const amount = Rules.applyResist(raw, res);
        out.effects.push({ kind: 'damage', target: t, amount, elem: sp.elem });
        if (sp.drain) out.effects.push({ kind: 'heal', target: ch, amount: Math.round(amount * 0.4) });
        if (sp.status) out.effects.push({ kind: 'status', target: t, status: sp.status, dur: sp.dur || 30 });
      } else if (sp.heal) {
        const amount = Math.round(rng.dice(sp.heal.n, sp.heal.sides) + pw * sp.scale);
        out.effects.push({ kind: 'heal', target: t, amount });
      } else if (sp.cure) {
        out.effects.push({ kind: 'cure', target: t, conds: sp.cure.slice() });
        if (sp.healFrac) out.effects.push({ kind: 'heal', target: t, amount: Math.round(Rules.maxHP(t) * sp.healFrac) });
      } else if (sp.buff) {
        // Duration scales with power: the same spell lasts a dungeon at Master and a fight at Novice.
        const dur = Math.round(sp.dur * (1 + pw / 30));
        const amount = Math.round((sp.amount || 1) * (1 + pw / 60));
        out.effects.push({ kind: 'buff', target: t, buff: sp.buff, amount, dur });
      } else if (sp.status) {
        out.effects.push({ kind: 'status', target: t, status: sp.status, dur: Math.round((sp.dur || 30) * (1 + pw / 50)) });
      }
    }
    return out;
  }

  function scrollPrice(id) {
    const sp = SPELLS[id];
    return sp ? sp.tier * sp.tier * 90 + 80 : 0;
  }

  // What a guild of this school teaches at a given tier cap.
  function guildStock(school, maxTier) {
    return bySchool(school).filter((id) => SPELLS[id].tier <= maxTier);
  }

  return {
    SCHOOLS, SCHOOL_IDS, SPELLS, SPELL_IDS, TIER_MASTERY, SPECIALS,
    bySchool, power, spCost, canCast, learnable, resolve, scrollPrice, guildStock,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Spellcraft;
