// 03_items.js — items, monsters, loot.
// Owner: items. Calls Core and Rules.

const Items = (() => {
  'use strict';

  const { clamp } = Core;

  // slot: which equip slot it occupies. `skill` is the skill that governs it.
  // `speed` is the weapon's base recovery time — lower is faster.
  const ITEMS = {
    // ---------------- weapons
    dagger:        { name: 'Dagger',          kind: 'weapon', slot: 'weapon', skill: 'dagger', dmg: { n: 1, sides: 4 }, speed: 60,  value: 20,   tier: 1 },
    short_sword:   { name: 'Short Sword',     kind: 'weapon', slot: 'weapon', skill: 'sword',  dmg: { n: 1, sides: 6 }, speed: 80,  value: 45,   tier: 1 },
    long_sword:    { name: 'Long Sword',      kind: 'weapon', slot: 'weapon', skill: 'sword',  dmg: { n: 1, sides: 8, plus: 1 }, speed: 90, value: 120, tier: 2 },
    broadsword:    { name: 'Broadsword',      kind: 'weapon', slot: 'weapon', skill: 'sword',  dmg: { n: 2, sides: 6 }, speed: 100, value: 260,  tier: 3 },
    hand_axe:      { name: 'Hand Axe',        kind: 'weapon', slot: 'weapon', skill: 'axe',    dmg: { n: 1, sides: 7 }, speed: 85,  value: 60,   tier: 1 },
    battle_axe:    { name: 'Battle Axe',      kind: 'weapon', slot: 'weapon', skill: 'axe',    dmg: { n: 2, sides: 7 }, speed: 110, value: 280,  tier: 3 },
    spear:         { name: 'Spear',           kind: 'weapon', slot: 'weapon', skill: 'spear',  dmg: { n: 1, sides: 9 }, speed: 90,  value: 90,   tier: 2 },
    halberd:       { name: 'Halberd',         kind: 'weapon', slot: 'weapon', skill: 'spear',  dmg: { n: 2, sides: 8 }, speed: 115, value: 340,  tier: 3 },
    club:          { name: 'Club',            kind: 'weapon', slot: 'weapon', skill: 'mace',   dmg: { n: 1, sides: 5 }, speed: 70,  value: 12,   tier: 1 },
    mace:          { name: 'Mace',            kind: 'weapon', slot: 'weapon', skill: 'mace',   dmg: { n: 1, sides: 8 }, speed: 95,  value: 110,  tier: 2 },
    war_hammer:    { name: 'War Hammer',      kind: 'weapon', slot: 'weapon', skill: 'mace',   dmg: { n: 2, sides: 8 }, speed: 120, value: 380,  tier: 3 },
    quarterstaff:  { name: 'Quarterstaff',    kind: 'weapon', slot: 'weapon', skill: 'staff',  dmg: { n: 1, sides: 6, plus: 1 }, speed: 75, value: 35, tier: 1 },
    oak_staff:     { name: 'Oaken Staff',     kind: 'weapon', slot: 'weapon', skill: 'staff',  dmg: { n: 2, sides: 5 }, speed: 85,  value: 180,  tier: 2 },
    short_bow:     { name: 'Short Bow',       kind: 'weapon', slot: 'bow',    skill: 'bow',    dmg: { n: 1, sides: 6 }, speed: 90,  value: 70,   tier: 1 },
    long_bow:      { name: 'Long Bow',        kind: 'weapon', slot: 'bow',    skill: 'bow',    dmg: { n: 2, sides: 6 }, speed: 100, value: 240,  tier: 2 },
    war_bow:       { name: 'War Bow',         kind: 'weapon', slot: 'bow',    skill: 'bow',    dmg: { n: 2, sides: 8 }, speed: 110, value: 520,  tier: 3 },

    // ---------------- armour
    padded:        { name: 'Padded Armour',   kind: 'armour', slot: 'armour', skill: 'leather', ac: 3,  value: 40,   tier: 1 },
    leather_armour:{ name: 'Leather Armour',  kind: 'armour', slot: 'armour', skill: 'leather', ac: 6,  value: 110,  tier: 1 },
    studded:       { name: 'Studded Leather', kind: 'armour', slot: 'armour', skill: 'leather', ac: 9,  value: 240,  tier: 2 },
    ring_mail:     { name: 'Ring Mail',       kind: 'armour', slot: 'armour', skill: 'chain',   ac: 11, value: 320,  tier: 2 },
    chain_mail:    { name: 'Chain Mail',      kind: 'armour', slot: 'armour', skill: 'chain',   ac: 15, value: 620,  tier: 3 },
    scale_mail:    { name: 'Scale Mail',      kind: 'armour', slot: 'armour', skill: 'chain',   ac: 18, value: 900,  tier: 3 },
    brigandine:    { name: 'Brigandine',      kind: 'armour', slot: 'armour', skill: 'plate',   ac: 21, value: 1300, tier: 4 },
    plate_mail:    { name: 'Plate Mail',      kind: 'armour', slot: 'armour', skill: 'plate',   ac: 26, value: 2200, tier: 4 },

    buckler:       { name: 'Buckler',         kind: 'armour', slot: 'offhand', skill: 'shield', ac: 4,  value: 80,   tier: 1 },
    kite_shield:   { name: 'Kite Shield',     kind: 'armour', slot: 'offhand', skill: 'shield', ac: 8,  value: 260,  tier: 2 },
    tower_shield:  { name: 'Tower Shield',    kind: 'armour', slot: 'offhand', skill: 'shield', ac: 13, value: 700,  tier: 3 },

    leather_cap:   { name: 'Leather Cap',     kind: 'armour', slot: 'helm',  ac: 2,  value: 30,   tier: 1 },
    iron_helm:     { name: 'Iron Helm',       kind: 'armour', slot: 'helm',  ac: 5,  value: 180,  tier: 2 },
    great_helm:    { name: 'Great Helm',      kind: 'armour', slot: 'helm',  ac: 9,  value: 560,  tier: 3 },
    boots_leather: { name: 'Leather Boots',   kind: 'armour', slot: 'boots', ac: 2,  value: 35,   tier: 1 },
    boots_plate:   { name: 'Plate Boots',     kind: 'armour', slot: 'boots', ac: 6,  value: 400,  tier: 3 },
    cloak_wool:    { name: 'Wool Cloak',      kind: 'armour', slot: 'cloak', ac: 1,  value: 25,   tier: 1 },
    cloak_fine:    { name: 'Fine Cloak',      kind: 'armour', slot: 'cloak', ac: 3,  value: 220,  tier: 2 },
    gauntlets:     { name: 'Gauntlets',       kind: 'armour', slot: 'gaunt', ac: 3,  value: 150,  tier: 2 },
    belt_leather:  { name: 'Leather Belt',    kind: 'armour', slot: 'belt',  ac: 1,  value: 20,   tier: 1 },

    // ---------------- accessories (stat sticks)
    ring_might:    { name: 'Ring of Might',     kind: 'ring',   slot: 'ring1', stat: 'mig', amount: 5, value: 800,  tier: 3 },
    ring_intellect:{ name: 'Ring of Intellect', kind: 'ring',   slot: 'ring1', stat: 'int', amount: 5, value: 800,  tier: 3 },
    ring_speed:    { name: 'Ring of Speed',     kind: 'ring',   slot: 'ring1', stat: 'spd', amount: 5, value: 900,  tier: 3 },
    ring_luck:     { name: 'Ring of Luck',      kind: 'ring',   slot: 'ring1', stat: 'lck', amount: 6, value: 700,  tier: 2 },
    amulet_endure: { name: 'Amulet of Endurance', kind: 'amulet', slot: 'amulet', stat: 'end', amount: 6, value: 1100, tier: 3 },
    amulet_accuracy:{ name: 'Amulet of the Eye',  kind: 'amulet', slot: 'amulet', stat: 'acc', amount: 6, value: 1100, tier: 3 },

    // ---------------- consumables
    potion_heal:   { name: 'Healing Potion',    kind: 'potion', heal: 25,  value: 50,  tier: 1, stack: 10 },
    potion_heal_g: { name: 'Greater Healing',   kind: 'potion', heal: 70,  value: 180, tier: 2, stack: 10 },
    potion_mana:   { name: 'Mana Potion',       kind: 'potion', mana: 20,  value: 60,  tier: 1, stack: 10 },
    potion_cure:   { name: 'Antidote',          kind: 'potion', cure: ['poison'], value: 90, tier: 1, stack: 10 },
    potion_elixir: { name: 'Elixir',            kind: 'potion', cure: ['poison', 'disease', 'weak'], heal: 40, value: 400, tier: 3, stack: 5 },
    food_ration:   { name: 'Rations',           kind: 'food',   food: 1,   value: 12,  tier: 1, stack: 40 },
    torch:         { name: 'Torch',             kind: 'tool',   light: 4,  value: 8,   tier: 1, stack: 20 },
    lockpick:      { name: 'Lockpicks',         kind: 'tool',   disarm: 6, value: 140, tier: 2 },

    // ---------------- quest items
    // `quest: true` is what makes these sort FIRST when looting. If mundane loot takes the last
    // pack slot the quest item is destroyed and the game becomes unwinnable with no message.
    barrow_seal:   { name: 'Seal of the Barrow',  kind: 'quest', quest: true, value: 0, tier: 0 },
    mine_ledger:   { name: "Foreman's Ledger",    kind: 'quest', quest: true, value: 0, tier: 0 },
    ash_key:       { name: 'Ashen Key',           kind: 'quest', quest: true, value: 0, tier: 0 },
    crown_shard:   { name: 'Shard of the Crown',  kind: 'quest', quest: true, value: 0, tier: 0 },
    wolf_pelt:     { name: 'Grey Wolf Pelt',      kind: 'quest', quest: true, value: 35, tier: 0, stack: 8 , trade: true},
    herb_bundle:   { name: 'Marshwort Bundle',    kind: 'quest', quest: true, value: 30, tier: 0, stack: 6 , trade: true},
  };

  const ITEM_IDS = Object.keys(ITEMS);

  // ---------------------------------------------------------------- monsters
  // `ai`: 'melee' | 'ranged' | 'caster' | 'brute'. `hide` feeds Perception.
  const MONSTERS = {
    rat:         { name: 'Giant Rat',       level: 1,  hp: 8,   ac: 4,  atk: 2,  dmg: { n: 1, sides: 3 }, xp: 38,   speed: 90,  ai: 'melee',  loot: 0, resist: {} },
    goblin:      { name: 'Goblin',          level: 2,  hp: 14,  ac: 7,  atk: 4,  dmg: { n: 1, sides: 5 }, xp: 90,   speed: 95,  ai: 'melee',  loot: 1, resist: {} },
    goblin_arch: { name: 'Goblin Archer',   level: 3,  hp: 16,  ac: 8,  atk: 6,  dmg: { n: 1, sides: 6 }, xp: 128,   speed: 100, ai: 'ranged', loot: 1, resist: {} },
    wolf:        { name: 'Grey Wolf',       level: 3,  hp: 22,  ac: 9,  atk: 7,  dmg: { n: 1, sides: 7 }, xp: 147,   speed: 70,  ai: 'melee',  loot: 0, resist: {}, drops: 'wolf_pelt' },
    bandit:      { name: 'Bandit',          level: 4,  hp: 30,  ac: 12, atk: 9,  dmg: { n: 1, sides: 8, plus: 1 }, xp: 224, speed: 95, ai: 'melee', loot: 2, resist: {} },
    bandit_capt: { name: 'Bandit Captain',  level: 7,  hp: 62,  ac: 18, atk: 15, dmg: { n: 2, sides: 6, plus: 2 }, xp: 608, speed: 90, ai: 'melee', loot: 3, resist: {} },
    skeleton:    { name: 'Skeleton',        level: 4,  hp: 26,  ac: 13, atk: 10, dmg: { n: 1, sides: 8 }, xp: 250,   speed: 100, ai: 'melee',  loot: 1, resist: { cold: 60, poison: 200, dark: 100 } },
    zombie:      { name: 'Zombie',          level: 5,  hp: 46,  ac: 9,  atk: 9,  dmg: { n: 2, sides: 5 }, xp: 307,   speed: 130, ai: 'brute',  loot: 1, resist: { poison: 200, dark: 80 } },
    ghoul:       { name: 'Ghoul',           level: 6,  hp: 54,  ac: 15, atk: 13, dmg: { n: 2, sides: 6 }, xp: 448,  speed: 90,  ai: 'melee',  loot: 2, resist: { poison: 200, dark: 100 }, inflict: 'disease' },
    wraith:      { name: 'Barrow Wraith',   level: 9,  hp: 70,  ac: 22, atk: 18, dmg: { n: 2, sides: 8 }, xp: 960,  speed: 80,  ai: 'caster', loot: 3, resist: { phys: 120, cold: 100, dark: 200 }, school: 'dark' },
    spider:      { name: 'Cave Spider',     level: 4,  hp: 24,  ac: 14, atk: 10, dmg: { n: 1, sides: 6 }, xp: 262,   speed: 75,  ai: 'melee',  loot: 1, resist: { poison: 150 }, inflict: 'poison' },
    kobold:      { name: 'Kobold Digger',   level: 3,  hp: 18,  ac: 10, atk: 6,  dmg: { n: 1, sides: 6 }, xp: 141,   speed: 90,  ai: 'melee',  loot: 1, resist: {} },
    kobold_sham: { name: 'Kobold Shaman',   level: 5,  hp: 26,  ac: 11, atk: 8,  dmg: { n: 1, sides: 5 }, xp: 352,  speed: 100, ai: 'caster', loot: 2, resist: {}, school: 'fire' },
    ogre:        { name: 'Ogre',            level: 8,  hp: 96,  ac: 16, atk: 16, dmg: { n: 3, sides: 6 }, xp: 832,  speed: 125, ai: 'brute',  loot: 2, resist: { mind: 80 } },
    troll:       { name: 'Marsh Troll',     level: 10, hp: 130, ac: 20, atk: 20, dmg: { n: 3, sides: 7 }, xp: 420,  speed: 115, ai: 'brute',  loot: 3, resist: { phys: 60, poison: 120 }, regen: 3 },
    harpy:       { name: 'Harpy',           level: 6,  hp: 40,  ac: 19, atk: 12, dmg: { n: 2, sides: 5 }, xp: 480,  speed: 65,  ai: 'melee',  loot: 2, resist: { elec: 60 }, inflict: 'afraid' },
    elemental:   { name: 'Ash Elemental',   level: 11, hp: 120, ac: 24, atk: 21, dmg: { n: 3, sides: 8 }, xp: 500,  speed: 95,  ai: 'caster', loot: 3, resist: { fire: 250, phys: 80 }, school: 'fire' },
    knight_ash:  { name: 'Ashen Knight',    level: 12, hp: 160, ac: 30, atk: 24, dmg: { n: 3, sides: 9 }, xp: 620,  speed: 100, ai: 'melee',  loot: 4, resist: { phys: 100, dark: 150 } },
    lich:        { name: 'Barrow Lich',     level: 14, hp: 190, ac: 28, atk: 26, dmg: { n: 3, sides: 8 }, xp: 900,  speed: 85,  ai: 'caster', loot: 4, resist: { cold: 200, dark: 250, poison: 250 }, school: 'dark' },
    // The final boss. Deliberately beatable by a level ~13 party that trained rather than one
    // that only levelled: high AC punishes low Accuracy, high HP punishes low sustained damage.
    ash_crown:   { name: 'The Ashen Crown',  level: 16, hp: 320, ac: 34, atk: 30, dmg: { n: 4, sides: 8 }, xp: 2400, speed: 90, ai: 'caster', loot: 5, resist: { fire: 200, dark: 200, phys: 90 }, school: 'fire', boss: true },
  };

  const MONSTER_IDS = Object.keys(MONSTERS);

  // ---------------------------------------------------------------- loot
  // Tier -> what can drop. Tier 0 drops nothing but coin.
  const LOOT_TIERS = [
    { gold: [0, 6],     items: [] },
    { gold: [4, 25],    items: ['dagger', 'club', 'padded', 'leather_cap', 'potion_heal', 'food_ration', 'torch', 'short_sword'] },
    { gold: [20, 90],   items: ['short_sword', 'hand_axe', 'leather_armour', 'buckler', 'boots_leather', 'potion_heal', 'potion_mana', 'spear', 'short_bow'] },
    { gold: [80, 300],  items: ['long_sword', 'mace', 'studded', 'ring_mail', 'kite_shield', 'iron_helm', 'potion_heal_g', 'long_bow', 'ring_luck', 'lockpick'] },
    { gold: [250, 900], items: ['broadsword', 'battle_axe', 'chain_mail', 'tower_shield', 'great_helm', 'ring_might', 'ring_intellect', 'amulet_endure', 'war_bow', 'potion_elixir'] },
    { gold: [800, 2400],items: ['plate_mail', 'brigandine', 'war_hammer', 'halberd', 'ring_speed', 'amulet_accuracy', 'boots_plate', 'potion_elixir'] },
  ];

  // Magical suffixes. `bonus` is a flat add applied by the caller to damage/AC as appropriate.
  const ENCHANTS = [
    { name: 'of the Bear',   bonus: 2, value: 200,  stat: 'mig' },
    { name: 'of the Fox',    bonus: 2, value: 200,  stat: 'spd' },
    { name: 'of the Owl',    bonus: 2, value: 200,  stat: 'int' },
    { name: 'of the Hawk',   bonus: 2, value: 200,  stat: 'acc' },
    { name: 'of Warding',    bonus: 3, value: 350 },
    { name: 'of Slaying',    bonus: 4, value: 600 },
    { name: 'of the Ashes',  bonus: 6, value: 1400 },
  ];

  // Roll loot for a monster. PURE apart from advancing the stream it is handed.
  function rollLoot(rng, tier, luckBonus) {
    const t = LOOT_TIERS[clamp(tier, 0, LOOT_TIERS.length - 1)];
    const out = { gold: 0, items: [] };
    out.gold = rng.range(t.gold[0], t.gold[1]);
    if (!t.items.length) return out;

    // Luck nudges both the drop chance and the enchant chance. It is the only place Luck has a
    // visible effect, so it needs to be a real one.
    const lb = (luckBonus || 0) * 0.01;
    if (rng.chance(clamp(0.35 + lb, 0.05, 0.85))) {
      const id = rng.pick(t.items);
      const stack = { id, qty: 1, ident: false, bonus: 0, charges: 0 };
      if (rng.chance(clamp(0.12 + lb, 0.02, 0.4))) {
        const e = rng.pick(ENCHANTS.slice(0, Math.min(ENCHANTS.length, 2 + tier)));
        stack.ench = ENCHANTS.indexOf(e);
        stack.bonus = e.bonus;
      }
      out.items.push(stack);
    }
    return out;
  }

  // THE LOOT LAW. Quest items sort first, always. Everything else follows by value descending so
  // that if a pack does overflow, what is lost is the cheapest mundane item, not the run.
  function sortForPickup(stacks) {
    return stacks.slice().sort((a, b) => {
      const qa = isQuest(a) ? 0 : 1, qb = isQuest(b) ? 0 : 1;
      if (qa !== qb) return qa - qb;
      return value(b) - value(a);
    });
  }

  function isQuest(stack) {
    const it = ITEMS[stack.id];
    return !!(it && it.quest);
  }

  function def(stack) { return ITEMS[stack.id] || null; }

  // Value of ONE unit. The stack total is a separate question and must be asked explicitly:
  // conflating them priced a 100g potion at 1050g because shop stock carries ten of them.
  function unitValue(stack) {
    const it = ITEMS[stack.id];
    if (!it) return 0;
    let v = it.value || 0;
    if (stack.ench !== undefined && ENCHANTS[stack.ench]) v += ENCHANTS[stack.ench].value;
    return v;
  }

  function value(stack) {
    return unitValue(stack) * (stack.qty || 1);
  }

  function displayName(stack) {
    const it = ITEMS[stack.id];
    if (!it) return '???';
    let n = it.name;
    if (stack.ench !== undefined && ENCHANTS[stack.ench]) {
      n = stack.ident ? n + ' ' + ENCHANTS[stack.ench].name : n;
    }
    if (!stack.ident && stack.ench !== undefined) n = n + ' ?';
    if ((stack.qty || 1) > 1) n += ' (' + stack.qty + ')';
    return n;
  }

  function maxStack(id) {
    const it = ITEMS[id];
    return (it && it.stack) || 1;
  }

  // Shop stock. Deterministic per shop per day from a LAYOUT stream, so a player who reloads
  // does not reroll the shop — which is the exploit every 1998 RPG shipped with.
  function shopStock(rng, kind, tier) {
    const pool = [];
    for (const id of ITEM_IDS) {
      const it = ITEMS[id];
      if (it.quest) continue;
      if ((it.tier || 1) > tier) continue;
      if (kind === 'weapon' && it.kind !== 'weapon') continue;
      if (kind === 'armour' && it.kind !== 'armour') continue;
      if (kind === 'general' && !(it.kind === 'potion' || it.kind === 'food' || it.kind === 'tool')) continue;
      if (kind === 'magic' && !(it.kind === 'ring' || it.kind === 'amulet' || it.kind === 'potion')) continue;
      pool.push(id);
    }
    rng.shuffle(pool);
    const n = Math.min(pool.length, 6 + rng.int(5));
    return pool.slice(0, n).map((id) => ({
      id, qty: maxStack(id) > 1 ? 5 + rng.int(10) : 1, ident: true, bonus: 0, charges: 0,
    }));
  }

  return {
    ITEMS, ITEM_IDS, MONSTERS, MONSTER_IDS, LOOT_TIERS, ENCHANTS,
    rollLoot, sortForPickup, isQuest, def, value, unitValue, displayName, maxStack, shopStock,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Items;
