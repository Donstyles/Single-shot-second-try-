#!/usr/bin/env node
// tools/screens.js — capture every menu the game has, on a party that actually owns things.
//
// The screens were being reviewed on a FRESH party: four level-1 characters with a starting
// weapon each, twelve gold and three tier-1 spells. Every panel was therefore mostly empty, and an
// empty panel hides exactly the failures that matter -- how a full pack paginates, what forty
// spells look like in one book, whether a long item name fits its row, whether the quest log
// scrolls. So this levels the party, opens every school, gives it a pack of real loot across the
// value tiers, and then photographs the menus.
//
//   node tools/screens.js <outdir>
//
// Captured at the true device viewport (844x390 CSS px), same as tools/walkabout.js.

const fs = require('fs');
const path = require('path');
const T = require(path.resolve(__dirname, '..', 'test', '_harness.js'));

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/screens.js <outdir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 844, height: 390 };

// name -> the harness call that puts the game in that state.
const SHOTS = [
  ['01_title', `Game.state.screen = 'title';`],
  ['02_creation', `Game.state.screen = 'creation';`],
  ['03_world', `h.closeAll();`],
  ['04_sheet', `h.screen('sheet');`],
  ['04b_sheet_caster', `Game.state.active = 1; h.screen('sheet');`],
  ['05_inventory', `h.screen('inv');`],
  ['06_inventory_caster', `Game.state.active = 1; h.screen('inv');`],
  // The party's first member is a Knight, who casts nothing. Opening the book on him is what a
  // player actually sees on the default tab -- worth photographing -- but the book itself has to
  // be photographed on a caster, or the shot is of an apology rather than of a spell list.
  ['07_spellbook_default', `h.screen('book');`],
  ['07b_spellbook_sorc', `Game.state.active = 1; h.screen('book');`],
  ['08_spellbook_body', `Game.state.active = 2; h.screen('book'); Game.state.bookSchool = 'body'; Game.state.bookPage = 0;`],
  ['08b_spellbook_high', `Game.state.active = 1; h.screen('book'); Game.state.bookPage = 2;`],
  ['09_automap', `h.screen('map');`],
  ['10_journal', `for (const q of World.QUEST_IDS.slice(0, 6)) Game.acceptQuest(q); h.screen('journal');`],
  ['11_menu', `h.screen('menu');`],
  ['12_rest', `h.screen('rest');`],
  ['13_shop_buy', `Game.state.shopKind = 'weapon';
                   Game.state.shopStock = Items.shopStock(Core.RNG.world('shopshot'), 'weapon', 4);
                   Game.state.shopTab = 'buy'; Game.state.screen = 'shop';`],
  ['13b_shop_sell', `Game.state.shopKind = 'armour';
                     Game.state.shopStock = Items.shopStock(Core.RNG.world('shopshot2'), 'armour', 4);
                     Game.state.shopTab = 'sell'; Game.state.screen = 'shop';`],
  ['14_dialogue', `const n = (Game.state.map.npcs || [])[0];
                   if (n) { Game.state.talkingTo = n; Game.state.screen = 'dialogue'; }`],
  ['15_defeat', `Game.state.screen = 'defeat';`],
];

(async () => {
  const pw = T.requirePlaywright();
  const { browser, page } = await T.openPage(pw, { viewport: VIEWPORT });
  await page.waitForTimeout(4000);   // baked frames decode asynchronously

  // A party worth photographing: mid campaign, carrying real loot, knowing real spells.
  const kitted = await page.evaluate(`(() => {
    const h = window.__game;
    h.beginGame();
    h.gold(48000);
    // LEVEL IS NOT A FUNCTION OF XP HERE -- it is bought from a trainer, the way MM6 does it -- so
    // granting experience alone leaves four level-1 characters and every panel half empty. Set it.
    for (const c of Game.state.party.members) {
      c.level = 14; c.xp = 180000; c.skillPts = 12;
      // A skill is {lvl, mastery}, NOT a number. Writing a bare 6 here wiped the mastery field,
      // which emptied the character sheet's SKILLS list and made the spellbook mark every single
      // entry "Not trained" in red -- and I very nearly reported both as defects in the game.
      // A capture that corrupts the state it photographs is worse than no capture.
      for (const s of Object.keys(c.skills)) {
        const sk = c.skills[s];
        sk.lvl = Math.max(sk.lvl || 0, 8);
        sk.mastery = Math.max(sk.mastery || 0, 2);
      }
      // Teach every skill the class is allowed, so the sheet shows a full spread rather than the
      // four a character starts with.
      for (const id of Object.keys(Rules.SKILLS)) {
        if (!c.skills[id] && Rules.classCap(c.cls, id) > 0) c.skills[id] = { lvl: 6, mastery: 1 };
      }
      // Every spell this character's class can legally hold, so the book is a book and not a page.
      for (const id of Spellcraft.SPELL_IDS) {
        if (Spellcraft.learnable(c, id)) c.spells[id] = true;
      }
    }
    // Packs are PER CHARACTER. A pack drawn across the whole value range, so long names, high
    // tiers and the ornament that only appears above 1500g are all on screen at once.
    const byValue = Items.ITEM_IDS.slice().sort((a, b) => (Items.ITEMS[b].value || 0) - (Items.ITEMS[a].value || 0));
    // h.give() only ever fills the ACTIVE character's pack, so three of the four looked empty.
    for (let m = 0; m < Game.state.party.members.length; m++) {
      Game.state.active = m;
      for (let i = m; i < byValue.length; i += 4) h.give(byValue[i], 1);
    }
    Game.state.active = 0;
    h.heal();
    const ms = Game.state.party.members;
    return {
      spells: ms.map((c) => Object.keys(c.spells || {}).length),
      packs: ms.map((c) => (c.pack || []).length),
      levels: ms.map((c) => c.level),
    };
  })()`);
  console.log('party:', JSON.stringify(kitted));

  for (const [name, code] of SHOTS) {
    const err = await page.evaluate(`(() => { const h = window.__game;
      try { h.closeAll(); ${code} h.settle(2); h.redraw(); return null; }
      catch (e) { return String(e && e.message || e); } })()`);
    if (err) { console.warn(name + ': ' + err); continue; }
    const el = await page.$('#fb');
    fs.writeFileSync(path.join(OUT, name + '.png'), await el.screenshot());
    process.stdout.write('.');
  }
  console.log('\n-> ' + OUT);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
