// 02_spells.js — nine schools, thirty-six spells.
// Owner: spells. Calls Core and Rules.
//
// Pure. `resolve` returns a list of EFFECTS to apply; it never mutates a character. The caller
// applies them. That split is what lets the systems suite check a fireball's numbers without a
// world, and what stops combat code from growing its own private damage formula.

const Spellcraft = (() => {
  'use strict';

  const { clamp } = Core;
  const { MASTERY, skillPower, statBonus, effStat } = Rules;

  const SCHOOLS = {
    fire:   { name: 'Fire',   kind: 'elemental', gem: 15 },
    water:  { name: 'Water',  kind: 'elemental', gem: 8 },
    air:    { name: 'Air',    kind: 'elemental', gem: 9 },
    earth:  { name: 'Earth',  kind: 'elemental', gem: 5 },
    spirit: { name: 'Spirit', kind: 'self',      gem: 13 },
    mind:   { name: 'Mind',   kind: 'self',      gem: 12 },
    body:   { name: 'Body',   kind: 'self',      gem: 11 },
    light:  { name: 'Light',  kind: 'divine',    gem: 0 },
    dark:   { name: 'Dark',   kind: 'divine',    gem: 12 },
  };
  const SCHOOL_IDS = Object.keys(SCHOOLS);

  // Tier gates mastery: 1-2 Novice, 3 Expert, 4 Master. That is the whole progression curve of a
  // caster, and it is why training matters more than levelling for them.
  const TIER_MASTERY = [0, MASTERY.NOVICE, MASTERY.NOVICE, MASTERY.EXPERT, MASTERY.MASTER];

  // target: 'enemy' | 'enemies' | 'ally' | 'party' | 'self' | 'world'
  const SPELLS = {
    // ---- fire
    flame_arrow:  { school: 'fire', tier: 1, sp: 2, name: 'Flame Arrow', target: 'enemy',   dmg: { n: 1, sides: 6 }, scale: 1.0, elem: 'fire' },
    fire_bolt:    { school: 'fire', tier: 2, sp: 5, name: 'Fire Bolt',   target: 'enemy',   dmg: { n: 2, sides: 6 }, scale: 1.5, elem: 'fire' },
    fireball:     { school: 'fire', tier: 3, sp: 10, name: 'Fireball',   target: 'enemies', dmg: { n: 3, sides: 6 }, scale: 2.0, elem: 'fire', radius: 2.5 },
    immolation:   { school: 'fire', tier: 4, sp: 18, name: 'Immolation', target: 'enemies', dmg: { n: 5, sides: 8 }, scale: 3.0, elem: 'fire', radius: 3.5 },

    // ---- water
    frostbite:    { school: 'water', tier: 1, sp: 2, name: 'Frostbite',   target: 'enemy',   dmg: { n: 1, sides: 5 }, scale: 1.0, elem: 'cold' },
    ice_bolt:     { school: 'water', tier: 2, sp: 5, name: 'Ice Bolt',    target: 'enemy',   dmg: { n: 2, sides: 7 }, scale: 1.5, elem: 'cold' },
    water_walk:   { school: 'water', tier: 3, sp: 8, name: 'Water Walk',  target: 'party',   buff: 'waterwalk', dur: 60 },
    ice_blast:    { school: 'water', tier: 4, sp: 16, name: 'Ice Blast',  target: 'enemies', dmg: { n: 4, sides: 8 }, scale: 2.6, elem: 'cold', radius: 3.0 },

    // ---- air
    spark:        { school: 'air', tier: 1, sp: 2, name: 'Spark',          target: 'enemy',  dmg: { n: 1, sides: 4 }, scale: 1.0, elem: 'elec' },
    feather_fall: { school: 'air', tier: 2, sp: 4, name: 'Feather Fall',   target: 'party',  buff: 'featherfall', dur: 45 },
    lightning:    { school: 'air', tier: 3, sp: 11, name: 'Lightning Bolt',target: 'enemies',dmg: { n: 4, sides: 6 }, scale: 2.2, elem: 'elec', radius: 1.5 },
    invisibility: { school: 'air', tier: 4, sp: 20, name: 'Invisibility',  target: 'party',  buff: 'invisible', dur: 30 },

    // ---- earth
    stone_skin:   { school: 'earth', tier: 1, sp: 3, name: 'Stone Skin',   target: 'party',  buff: 'ac', dur: 60, amount: 5 },
    rock_blast:   { school: 'earth', tier: 2, sp: 6, name: 'Rock Blast',   target: 'enemy',  dmg: { n: 2, sides: 8 }, scale: 1.4, elem: 'phys' },
    deadly_swarm: { school: 'earth', tier: 3, sp: 12, name: 'Deadly Swarm',target: 'enemies',dmg: { n: 3, sides: 8 }, scale: 2.0, elem: 'phys', radius: 2.5 },
    stone_flesh:  { school: 'earth', tier: 4, sp: 15, name: 'Stone to Flesh', target: 'ally', cure: ['stoned', 'weak'] },

    // ---- spirit
    bless:        { school: 'spirit', tier: 1, sp: 3, name: 'Bless',       target: 'party', buff: 'hit', dur: 60, amount: 5 },
    heroism:      { school: 'spirit', tier: 2, sp: 6, name: 'Heroism',     target: 'party', buff: 'dmg', dur: 60, amount: 4 },
    remove_curse: { school: 'spirit', tier: 3, sp: 10, name: 'Remove Curse', target: 'ally', cure: ['curse'] },
    resurrect:    { school: 'spirit', tier: 4, sp: 30, name: 'Resurrection', target: 'ally', cure: ['dead', 'unconscious'], healFrac: 0.25 },

    // ---- mind
    mind_blast:   { school: 'mind', tier: 1, sp: 3, name: 'Mind Blast',    target: 'enemy', dmg: { n: 1, sides: 8 }, scale: 1.1, elem: 'mind' },
    remove_fear:  { school: 'mind', tier: 2, sp: 4, name: 'Remove Fear',   target: 'party', cure: ['afraid'] },
    charm:        { school: 'mind', tier: 3, sp: 9, name: 'Charm',         target: 'enemy', status: 'charmed', dur: 20 },
    berserk:      { school: 'mind', tier: 4, sp: 14, name: 'Berserk',      target: 'enemy', status: 'berserk', dur: 25 },

    // ---- body
    first_aid:    { school: 'body', tier: 1, sp: 2, name: 'First Aid',     target: 'ally',  heal: { n: 1, sides: 8 }, scale: 1.0 },
    cure_wounds:  { school: 'body', tier: 2, sp: 5, name: 'Cure Wounds',   target: 'ally',  heal: { n: 2, sides: 8 }, scale: 2.0 },
    cure_poison:  { school: 'body', tier: 3, sp: 8, name: 'Cure Poison',   target: 'ally',  cure: ['poison'] },
    regeneration: { school: 'body', tier: 4, sp: 16, name: 'Regeneration', target: 'party', buff: 'regen', dur: 90, amount: 2 },

    // ---- light
    torch_light:  { school: 'light', tier: 1, sp: 1, name: 'Torch Light',  target: 'party', buff: 'light', dur: 120, amount: 3 },
    cure_disease: { school: 'light', tier: 2, sp: 7, name: 'Cure Disease', target: 'ally',  cure: ['disease'] },
    sunray:       { school: 'light', tier: 3, sp: 13, name: 'Sunray',      target: 'enemy', dmg: { n: 4, sides: 8 }, scale: 2.4, elem: 'light' },
    divine_heal:  { school: 'light', tier: 4, sp: 22, name: 'Divine Heal', target: 'party', heal: { n: 4, sides: 10 }, scale: 3.0 },

    // ---- dark
    darkness:     { school: 'dark', tier: 1, sp: 3, name: 'Darkness',      target: 'enemies', status: 'blind', dur: 20, radius: 2.5 },
    drain_life:   { school: 'dark', tier: 2, sp: 7, name: 'Drain Life',    target: 'enemy', dmg: { n: 2, sides: 6 }, scale: 1.4, elem: 'dark', drain: true },
    toxic_cloud:  { school: 'dark', tier: 3, sp: 12, name: 'Toxic Cloud',  target: 'enemies', dmg: { n: 3, sides: 7 }, scale: 1.9, elem: 'poison', radius: 3.0, status: 'poison' },
    shrapmetal:   { school: 'dark', tier: 4, sp: 20, name: 'Shrapmetal',   target: 'enemies', dmg: { n: 5, sides: 6 }, scale: 2.8, elem: 'phys', radius: 2.0 },
  };

  const SPELL_IDS = Object.keys(SPELLS);

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
    // Master casters pay less. It is the reason a Master Fire mage out-sustains an Expert one
    // even at identical skill level.
    const m = Rules.mastery(ch, sp.school);
    const mult = m >= MASTERY.MASTER ? 0.7 : m >= MASTERY.EXPERT ? 0.85 : 1.0;
    return Math.max(1, Math.round(sp.sp * mult));
  }

  // Every refusal carries a REASON. A spell that silently fails to cast is indistinguishable from
  // a bug, and the player will report it as one.
  function canCast(ch, id, ctx) {
    const sp = SPELLS[id];
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
    if (sp.school === 'light' && ctx && ctx.underground && sp.tier >= 3) {
      return { ok: false, why: 'Light magic of this power will not answer underground.' };
    }
    return { ok: true, cost };
  }

  function learnable(ch, id) {
    const sp = SPELLS[id];
    if (!sp) return false;
    return Rules.classCap(ch.cls, sp.school) >= TIER_MASTERY[sp.tier];
  }

  // ---------------------------------------------------------------- resolve
  // PURE. Returns { cost, effects: [...] }. The caller applies every effect.
  //
  // Effect shapes:
  //   { kind:'damage', target, amount, elem }
  //   { kind:'heal',   target, amount }
  //   { kind:'cure',   target, conds:[] }
  //   { kind:'buff',   target, buff, amount, dur }
  //   { kind:'status', target, status, dur }
  function resolve(ch, id, targets, rng, ctx) {
    const sp = SPELLS[id];
    const out = { spell: id, cost: spCost(ch, id), effects: [] };
    if (!sp) return out;

    const pw = power(ch, sp.school);
    const tlist = Array.isArray(targets) ? targets : (targets ? [targets] : []);

    for (const t of tlist) {
      if (sp.dmg) {
        // Base dice plus power scaling. The scale factor is what separates a tier-1 dart from a
        // tier-4 nuke far more than the dice do.
        const base = rng.dice(sp.dmg.n, sp.dmg.sides);
        const raw = Math.round(base + pw * sp.scale);
        const res = (t.resist && t.resist[sp.elem]) || 0;
        const amount = Rules.applyResist(raw, res);
        out.effects.push({ kind: 'damage', target: t, amount, elem: sp.elem });
        if (sp.drain) out.effects.push({ kind: 'heal', target: ch, amount: Math.round(amount * 0.5) });
        if (sp.status) out.effects.push({ kind: 'status', target: t, status: sp.status, dur: sp.dur || 20 });
      } else if (sp.heal) {
        const amount = Math.round(rng.dice(sp.heal.n, sp.heal.sides) + pw * sp.scale);
        out.effects.push({ kind: 'heal', target: t, amount });
      } else if (sp.cure) {
        out.effects.push({ kind: 'cure', target: t, conds: sp.cure.slice() });
        if (sp.healFrac) {
          out.effects.push({ kind: 'heal', target: t, amount: Math.round(Rules.maxHP(t) * sp.healFrac) });
        }
      } else if (sp.buff) {
        // Duration scales with power: the same spell lasts a dungeon at Master and a fight at Novice.
        const dur = Math.round(sp.dur * (1 + pw / 30));
        out.effects.push({ kind: 'buff', target: t, buff: sp.buff, amount: sp.amount || 1, dur });
      } else if (sp.status) {
        out.effects.push({ kind: 'status', target: t, status: sp.status, dur: sp.dur || 20 });
      }
    }
    return out;
  }

  // What the shop charges to teach it, and what the guild requires.
  function scrollPrice(id) {
    const sp = SPELLS[id];
    return sp ? sp.tier * sp.tier * 120 + 60 : 0;
  }

  return {
    SCHOOLS, SCHOOL_IDS, SPELLS, SPELL_IDS, TIER_MASTERY,
    bySchool, power, spCost, canCast, learnable, resolve, scrollPrice,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Spellcraft;
