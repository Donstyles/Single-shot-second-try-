// 08_ui.js — the HUD and every screen.
// Owner: ui. Calls Core, Rules, Spellcraft, Items, Art, Sprites.
//
// GLUE CALLS RULES. Nothing here computes a price, a hit chance or a max HP; it asks Rules. If a
// formula appears in this file it is a bug by definition.
//
// Sized for touch. The framebuffer is 640x480 letterboxed to 520x390 on an iPhone 14 Pro Max in
// landscape, so a 44pt finger target is roughly 54 framebuffer pixels. Every tappable thing below
// is at least that, and text is drawn at scale 2 by default because scale 1 is unreadable on glass.

const UI = (() => {
  'use strict';

  const { clamp } = Core;
  const E = () => Engine;

  // Hit regions rebuilt every frame; the tap handler walks them newest-first.
  let regions = [];
  const reg = (id, x, y, w, h, data) => { regions.push({ id, x, y, w, h, data }); };
  const clearRegions = () => { regions = []; };
  function hit(x, y) {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return r;
    }
    return null;
  }

  const HUD = { x: 0, y: 352, w: 640, h: 128 };
  const PORTRAIT = { w: 72, h: 88, y: 358, pitch: 78, x0: 6 };

  // ---------------------------------------------------------------- hud
  function drawHUD(g) {
    const En = E();
    Art.panel(En, HUD.x, HUD.y, HUD.w, HUD.h, 13, true);
    En.hline(0, HUD.y, 640, Core.idx(13, 11));

    // ---- party portraits
    g.party.members.forEach((ch, i) => {
      const x = PORTRAIT.x0 + i * PORTRAIT.pitch;
      const y = PORTRAIT.y;
      const active = g.active === i;
      const dead = Rules.isDead(ch);

      Art.panel(En, x - 2, y - 2, PORTRAIT.w + 4, PORTRAIT.h + 4, active ? 13 : 4, !active);
      const p = Sprites.portrait(ch.portrait, ch.cls, ch.sex);
      En.clip(x, y, PORTRAIT.w, 56);
      En.blitScaled(p, x, y, PORTRAIT.w, 62, dead ? -5 : 0);
      En.clipReset();

      // Name, then HP and SP bars. The bars are the only thing a player actually reads mid-fight,
      // so they get the width.
      Art.text(En, x + 2, y + 58, ch.name.slice(0, 8), Core.idx(0, dead ? 6 : 14), 1);
      Art.bar(En, x + 2, y + 68, PORTRAIT.w - 4, 8, ch.hp / Math.max(1, Rules.maxHP(ch)), 11);
      const spMax = Rules.maxSP(ch);
      if (spMax > 0) Art.bar(En, x + 2, y + 78, PORTRAIT.w - 4, 8, ch.sp / spMax, 12);

      const cond = Rules.worstCondition(ch);
      if (cond) Art.text(En, x + 2, y + 46, cond.slice(0, 9).toUpperCase(), Core.idx(11, 12), 1);

      reg('pc', x - 2, y - 2, PORTRAIT.w + 4, PORTRAIT.h + 4, i);
    });

    // ---- message log
    const lx = PORTRAIT.x0 + 4 * PORTRAIT.pitch + 4;
    const lw = 636 - lx - 118;
    Art.panel(En, lx, HUD.y + 6, lw, 74, 4, true);
    const lines = Core.Log.tail(4);
    lines.forEach((l, i) => {
      const c = l.kind === 'hit' ? Core.idx(11, 12) : l.kind === 'good' ? Core.idx(6, 12)
        : l.kind === 'sys' ? Core.idx(9, 11) : Core.idx(0, 13);
      Art.text(En, lx + 5, HUD.y + 11 + i * 17, l.text.slice(0, Math.floor((lw - 10) / (Art.CH_W * 2))), c, 2);
    });

    // ---- gold, time, place
    Art.text(En, lx + 5, HUD.y + 86, g.party.gold + 'g', Core.idx(13, 13), 2);
    Art.text(En, lx + 90, HUD.y + 86, Core.Clock.hhmm(), Core.idx(9, 12), 2);
    Art.text(En, lx + 5, HUD.y + 106, (g.map.town ? g.map.town.name + ', ' : '') + g.map.name, Core.idx(2, 12), 1);

    // ---- buttons, two rows of three, each a comfortable finger target
    const BX = 640 - 114, BW = 54, BH = 36;
    const btns = [
      ['CHR', 'sheet'], ['INV', 'inv'], ['SPL', 'book'],
      ['MAP', 'map'], ['RST', 'rest'], ['MNU', 'menu'],
    ];
    btns.forEach((b, i) => {
      const bx = BX + (i % 2) * (BW + 4);
      const by = HUD.y + 6 + Math.floor(i / 2) * (BH + 4);
      Art.button(En, bx, by, BW, BH, b[0], g.pressed === b[1], 2);
      reg('btn', bx, by, BW, BH, b[1]);
    });
  }

  // ---------------------------------------------------------------- touch controls
  // Drawn INSIDE the 3D viewport, translucent-by-dither so they never hide the world entirely.
  function drawTouchControls(g) {
    const En = E(), V = En.VIEW;
    const S = 62, pad = 8;
    const bx = V.x + pad, by = V.y + V.h - S * 2 - pad * 2;

    const pad4 = [
      ['fwd', bx + S, by, '^'],
      ['back', bx + S, by + S + 4, 'v'],
      ['turnL', bx, by + S / 2 + 2, '<'],
      ['turnR', bx + S * 2, by + S / 2 + 2, '>'],
    ];
    for (const [id, x, y, label] of pad4) {
      ghostButton(x, y, S, S, label, g.keys[id]);
      reg('move', x, y, S, S, id);
    }

    // Attack / interact on the right, where a thumb actually is.
    const ax = V.x + V.w - S - pad, ay = V.y + V.h - S - pad;
    ghostButton(ax, ay, S, S, g.combat.active ? 'ATK' : 'USE', g.pressed === 'act');
    reg('act', ax, ay, S, S, 'act');

    if (g.combat.active) {
      ghostButton(ax - S - 6, ay, S, S, 'CAST', g.pressed === 'cast');
      reg('cast', ax - S - 6, ay, S, S, 'cast');
      ghostButton(ax, ay - S - 6, S, S, 'WAIT', g.pressed === 'wait');
      reg('wait', ax, ay - S - 6, S, S, 'wait');
    }
  }

  // A button that lets the world show through on a checker, which is how a 1998 game faked alpha.
  function ghostButton(x, y, w, h, label, down) {
    const En = E();
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if ((xx + yy) & 1) continue;
        En.px(xx, yy, Core.idx(0, down ? 5 : 2));
      }
    }
    En.frameRect(x, y, w, h, Core.idx(13, down ? 13 : 9));
    Art.textCentred(En, x + w / 2, y + (h >> 1) - 7, label, Core.idx(0, 15), 2);
  }

  // ---------------------------------------------------------------- screens
  function screenFrame(title, w, h) {
    const En = E();
    const x = (640 - w) >> 1, y = (480 - h) >> 1;
    Art.panel(En, x, y, w, h, 13, false);
    Art.panel(En, x + 6, y + 6, w - 12, h - 12, 4, true);
    Art.textCentred(En, 320, y + 14, title, Core.idx(13, 14), 2);
    En.hline(x + 14, y + 34, w - 28, Core.idx(13, 9));
    // Close button, large enough to hit without aiming.
    Art.button(En, x + w - 52, y + 8, 44, 26, 'X', false, 2);
    reg('close', x + w - 52, y + 8, 44, 26, 1);
    return { x, y, w, h, inner: y + 42 };
  }

  function charSheet(g) {
    const En = E();
    const f = screenFrame('CHARACTER', 600, 430);
    const ch = g.party.members[g.active];
    const p = Sprites.portrait(ch.portrait, ch.cls, ch.sex);
    En.blitScaled(p, f.x + 20, f.inner, 96, 108, 0);

    let y = f.inner;
    Art.text(En, f.x + 130, y, ch.name, Core.idx(13, 14), 2); y += 22;
    Art.text(En, f.x + 130, y, Rules.CLASSES[ch.cls].name + '  Level ' + ch.level, Core.idx(0, 13), 2); y += 20;
    Art.text(En, f.x + 130, y, 'XP ' + ch.xp + ' / ' + Rules.xpForLevel(ch.level + 1), Core.idx(2, 12), 2); y += 20;
    Art.text(En, f.x + 130, y, 'HP ' + ch.hp + '/' + Rules.maxHP(ch) +
      '   SP ' + ch.sp + '/' + Rules.maxSP(ch), Core.idx(0, 13), 2); y += 20;
    Art.text(En, f.x + 130, y, 'AC ' + g.acOf(ch) + '   Skill pts ' + ch.skillPts, Core.idx(0, 13), 2);

    // Stats in two columns.
    y = f.inner + 124;
    Rules.STATS.forEach((s, i) => {
      const cx = f.x + 24 + (i % 2) * 200;
      const cy = y + Math.floor(i / 2) * 22;
      const v = Rules.effStat(ch, s);
      const b = Rules.statBonus(v);
      Art.text(En, cx, cy, Rules.STAT_NAME[s], Core.idx(0, 11), 2);
      Art.text(En, cx + 130, cy, String(v), Core.idx(13, 14), 2);
      Art.text(En, cx + 160, cy, (b >= 0 ? '+' : '') + b, Core.idx(b >= 0 ? 6 : 11, 12), 2);
    });

    // Skills, scrollable-free: only trained ones are listed, which is always few enough to fit.
    y = f.inner + 124 + 96;
    Art.text(En, f.x + 24, y, 'SKILLS', Core.idx(13, 13), 2); y += 20;
    const trained = Object.keys(ch.skills).filter((k) => ch.skills[k].mastery > 0);
    trained.slice(0, 12).forEach((k, i) => {
      const cx = f.x + 24 + (i % 3) * 190;
      const cy = y + Math.floor(i / 3) * 18;
      Art.text(En, cx, cy, Rules.SKILLS[k].name + ' ' + ch.skills[k].lvl +
        ' ' + Rules.MASTERY_NAME[ch.skills[k].mastery].slice(0, 1), Core.idx(0, 12), 1);
    });
  }

  function inventory(g) {
    const En = E();
    const f = screenFrame('INVENTORY', 600, 430);
    const ch = g.party.members[g.active];

    // Paperdoll on the left: slots as boxes, equipped items as icons.
    const SLOTS = [
      ['helm', 60, 0], ['amulet', 120, 0],
      ['armour', 60, 46], ['cloak', 0, 46], ['gaunt', 120, 46],
      ['weapon', 0, 92], ['offhand', 120, 92], ['belt', 60, 92],
      ['bow', 0, 138], ['boots', 60, 138], ['ring1', 120, 138],
    ];
    const px0 = f.x + 24, py0 = f.inner;
    for (const [slot, ox, oy] of SLOTS) {
      const x = px0 + ox, y = py0 + oy;
      Art.panel(En, x, y, 42, 42, 4, true);
      const it = ch.equip[slot];
      if (it) En.blitScaled(Sprites.icon(it.id), x + 5, y + 5, 32, 32, 0);
      else Art.text(En, x + 3, y + 17, slot.slice(0, 5), Core.idx(0, 6), 1);
      reg('equip', x, y, 42, 42, slot);
    }

    // Pack grid on the right.
    const gx = f.x + 220, gy = f.inner;
    Art.text(En, gx, gy - 16, 'PACK  ' + ch.pack.length + '/30', Core.idx(13, 13), 2);
    for (let i = 0; i < 30; i++) {
      const x = gx + (i % 6) * 58, y = gy + Math.floor(i / 6) * 52;
      Art.panel(En, x, y, 54, 48, 4, true);
      const st = ch.pack[i];
      if (st) {
        En.blitScaled(Sprites.icon(st.id), x + 11, y + 8, 32, 32, 0);
        if ((st.qty || 1) > 1) Art.text(En, x + 3, y + 36, String(st.qty), Core.idx(13, 14), 1);
        if (Items.isQuest(st)) En.frameRect(x, y, 54, 48, Core.idx(13, 13));
        reg('item', x, y, 54, 48, i);
      }
    }

    const sel = g.selectedItem;
    if (sel !== null && ch.pack[sel]) {
      const st = ch.pack[sel];
      Art.panel(En, f.x + 14, f.y + f.h - 62, f.w - 28, 48, 4, true);
      Art.text(En, f.x + 22, f.y + f.h - 56, Items.displayName(st), Core.idx(13, 14), 2);
      const it = Items.def(st);
      const line = (it.dmg ? 'Dmg ' + it.dmg.n + 'd' + it.dmg.sides + (it.dmg.plus ? '+' + it.dmg.plus : '') + '  ' : '') +
        (it.ac ? 'AC ' + it.ac + '  ' : '') + 'Value ' + Items.value(st) + 'g';
      Art.text(En, f.x + 22, f.y + f.h - 36, line, Core.idx(0, 12), 2);
      Art.button(En, f.x + f.w - 200, f.y + f.h - 56, 84, 38, 'EQUIP', false, 2);
      reg('doequip', f.x + f.w - 200, f.y + f.h - 56, 84, 38, sel);
      Art.button(En, f.x + f.w - 108, f.y + f.h - 56, 84, 38, 'DROP', false, 2);
      reg('drop', f.x + f.w - 108, f.y + f.h - 56, 84, 38, sel);
    }
  }

  function spellbook(g) {
    const En = E();
    const f = screenFrame('SPELLBOOK', 600, 430);
    const ch = g.party.members[g.active];

    // School tabs down the left.
    Spellcraft.SCHOOL_IDS.forEach((s, i) => {
      const x = f.x + 16, y = f.inner + i * 40;
      const cap = Rules.classCap(ch.cls, s);
      const on = g.bookSchool === s;
      Art.button(En, x, y, 96, 34, Spellcraft.SCHOOLS[s].name.toUpperCase().slice(0, 6), on, 2);
      if (cap === 0) {
        for (let yy = y; yy < y + 34; yy += 2) En.hline(x, yy, 96, Core.idx(0, 2));
      }
      reg('school', x, y, 96, 34, s);
    });

    const school = g.bookSchool || 'fire';
    const ids = Spellcraft.bySchool(school);
    ids.forEach((id, i) => {
      const sp = Spellcraft.SPELLS[id];
      const x = f.x + 130, y = f.inner + i * 76;
      const known = ch.spells && ch.spells[id];
      const can = Spellcraft.canCast(ch, id, { underground: g.map.kind === 'dungeon' });
      Art.panel(En, x, y, f.w - 160, 68, can.ok ? 13 : 4, !can.ok);
      Art.text(En, x + 10, y + 8, sp.name, Core.idx(13, can.ok ? 14 : 9), 2);
      Art.text(En, x + 10, y + 30, 'Tier ' + sp.tier + '   ' + Spellcraft.spCost(ch, id) + ' SP', Core.idx(0, 12), 2);
      const note = !known ? 'not learned' : can.ok ? 'ready' : can.why;
      Art.text(En, x + 10, y + 50, note.slice(0, 48), Core.idx(can.ok ? 6 : 11, 11), 1);
      if (can.ok) reg('cast', x, y, f.w - 160, 68, id);
    });
  }

  function automap(g) {
    const En = E();
    const f = screenFrame('MAP — ' + g.map.name.toUpperCase(), 600, 430);
    const m = g.map;
    const scale = Math.min((f.w - 40) / m.w, (f.h - 70) / m.h);
    const ox = f.x + ((f.w - m.w * scale) >> 1), oy = f.inner;

    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!g.seen(m.id, x, y)) continue;
        const c = m.cells[y * m.w + x];
        const mat = World.matOf(c);
        let pi;
        if (World.isSolid(c)) pi = Core.idx(1, 9);
        else if (mat === World.MAT.water) pi = Core.idx(8, 8);
        else if (mat === World.MAT.road || mat === World.MAT.plaza) pi = Core.idx(5, 11);
        else pi = Core.idx(World.MAT_RAMP[mat] === undefined ? 6 : World.MAT_RAMP[mat], 6);
        En.rect(Math.round(ox + x * scale), Math.round(oy + y * scale),
          Math.ceil(scale), Math.ceil(scale), pi);
      }
    }
    // Portals and the party.
    for (const p of m.portals) {
      En.rect(Math.round(ox + p.x * scale) - 1, Math.round(oy + p.y * scale) - 1, 4, 4, Core.idx(13, 14));
    }
    const pxp = Math.round(ox + g.party.x * scale), pyp = Math.round(oy + g.party.y * scale);
    En.rect(pxp - 2, pyp - 2, 5, 5, Core.idx(11, 14));
    En.px(pxp + Math.round(Math.cos(g.party.ang) * 5), pyp + Math.round(Math.sin(g.party.ang) * 5), Core.idx(0, 15));

    Art.text(En, f.x + 20, f.y + f.h - 26, 'Region ' + (World.REGIONS[m.region] ? World.REGIONS[m.region].name : m.name), Core.idx(0, 12), 2);
  }

  function shop(g) {
    const En = E();
    const kind = g.shopKind;
    const f = screenFrame(kind.toUpperCase(), 600, 430);
    const ch = g.party.members[g.active];
    const stock = g.shopStock || [];

    Art.text(En, f.x + 20, f.inner - 14, 'Your gold: ' + g.party.gold, Core.idx(13, 13), 2);

    if (kind === 'temple') {
      const cost = g.party.members.reduce((a, c) => a + Rules.healCost(c), 0);
      Art.text(En, f.x + 24, f.inner + 30, 'Heal and cure the whole party', Core.idx(0, 13), 2);
      Art.text(En, f.x + 24, f.inner + 56, 'Cost: ' + cost + ' gold', Core.idx(13, 13), 2);
      Art.button(En, f.x + 24, f.inner + 90, 200, 46, 'PAY ' + cost, false, 2);
      reg('templeheal', f.x + 24, f.inner + 90, 200, 46, cost);
      return;
    }
    if (kind === 'tavern') {
      Art.text(En, f.x + 24, f.inner + 20, 'Rest the night — 10 gold', Core.idx(0, 13), 2);
      Art.button(En, f.x + 24, f.inner + 50, 200, 46, 'SLEEP', false, 2);
      reg('tavernrest', f.x + 24, f.inner + 50, 200, 46, 10);
      Art.text(En, f.x + 24, f.inner + 116, 'Buy rations — 12 gold each', Core.idx(0, 13), 2);
      Art.button(En, f.x + 24, f.inner + 146, 200, 46, 'BUY FOOD', false, 2);
      reg('buyfood', f.x + 24, f.inner + 146, 200, 46, 12);
      Art.text(En, f.x + 24, f.inner + 210, 'Food: ' + g.party.food, Core.idx(2, 12), 2);
      return;
    }
    if (kind === 'trainer' || kind === 'guild') {
      const pending = Rules.levelForXP(ch.xp) - ch.level;
      const cost = Rules.trainCost(ch.level);
      Art.text(En, f.x + 24, f.inner + 20, ch.name + ' — level ' + ch.level, Core.idx(13, 14), 2);
      Art.text(En, f.x + 24, f.inner + 46, pending > 0 ? 'Ready to advance ' + pending + ' level(s)' : 'Not enough experience yet', Core.idx(pending > 0 ? 6 : 11, 12), 2);
      if (pending > 0) {
        Art.button(En, f.x + 24, f.inner + 80, 260, 46, 'TRAIN ' + cost + 'g', false, 2);
        reg('train', f.x + 24, f.inner + 80, 260, 46, cost);
      }
      // Skill spending.
      Art.text(En, f.x + 24, f.inner + 140, 'Skill points: ' + ch.skillPts, Core.idx(13, 13), 2);
      const learnable = Object.keys(Rules.SKILLS).filter((k) => Rules.classCap(ch.cls, k) > 0).slice(0, 12);
      learnable.forEach((k, i) => {
        const x = f.x + 24 + (i % 3) * 180, y = f.inner + 170 + Math.floor(i / 3) * 40;
        const cur = ch.skills[k];
        Art.button(En, x, y, 172, 34, Rules.SKILLS[k].name.slice(0, 9) + ' ' + (cur ? cur.lvl : 0), false, 1);
        reg('skillup', x, y, 172, 34, k);
      });
      return;
    }

    // Goods shops.
    stock.forEach((st, i) => {
      const x = f.x + 20 + (i % 2) * 280, y = f.inner + Math.floor(i / 2) * 54;
      if (y > f.y + f.h - 80) return;
      const price = Rules.buyPrice(Items.value(st), ch);
      const afford = g.party.gold >= price;
      Art.panel(En, x, y, 272, 48, afford ? 4 : 4, true);
      En.blitScaled(Sprites.icon(st.id), x + 6, y + 8, 32, 32, 0);
      Art.text(En, x + 46, y + 8, Items.ITEMS[st.id].name.slice(0, 16), Core.idx(0, afford ? 13 : 7), 2);
      Art.text(En, x + 46, y + 28, price + 'g', Core.idx(13, afford ? 13 : 7), 2);
      if (afford) reg('buy', x, y, 272, 48, i);
    });
  }

  function dialogue(g) {
    const En = E();
    const npc = g.talkingTo;
    const q = npc && World.QUESTS[npc.quest];
    const f = screenFrame(npc ? npc.role.toUpperCase() : 'SOMEONE', 560, 300);
    if (!q) return;

    const state = g.party.quests[npc.quest] ? g.party.quests[npc.quest].state : 0;
    Art.text(En, f.x + 24, f.inner, q.name, Core.idx(13, 14), 2);

    // Word-wrap the quest text at the panel width.
    const words = q.text.split(' ');
    let line = '', y = f.inner + 28;
    for (const w of words) {
      if ((line + ' ' + w).length > 44) { Art.text(En, f.x + 24, y, line, Core.idx(0, 13), 2); y += 20; line = w; }
      else line = line ? line + ' ' + w : w;
    }
    if (line) Art.text(En, f.x + 24, y, line, Core.idx(0, 13), 2);

    y += 34;
    if (state === 0) {
      Art.button(En, f.x + 24, y, 200, 46, 'ACCEPT', false, 2);
      reg('acceptquest', f.x + 24, y, 200, 46, npc.quest);
    } else if (state === 1) {
      const done = g.questComplete(npc.quest);
      Art.text(En, f.x + 24, y, done ? 'You have what was asked.' : 'Not yet done.', Core.idx(done ? 6 : 11, 12), 2);
      if (done) {
        Art.button(En, f.x + 24, y + 26, 220, 46, 'TURN IN', false, 2);
        reg('turnin', f.x + 24, y + 26, 220, 46, npc.quest);
      }
    } else {
      Art.text(En, f.x + 24, y, 'Thank you again.', Core.idx(6, 12), 2);
    }
  }

  function restScreen(g) {
    const En = E();
    const f = screenFrame('MAKE CAMP', 460, 260);
    const can = Rules.canRest(g.party, g.safeToRest());
    if (!can.ok) {
      Art.text(En, f.x + 24, f.inner + 20, can.why, Core.idx(11, 12), 2);
      return;
    }
    Art.text(En, f.x + 24, f.inner + 10, 'Rest 8 hours', Core.idx(0, 13), 2);
    Art.text(En, f.x + 24, f.inner + 34, 'Uses 2 rations (you have ' + g.party.food + ')', Core.idx(2, 12), 2);
    Art.button(En, f.x + 24, f.inner + 70, 220, 50, 'SLEEP', false, 2);
    reg('dorest', f.x + 24, f.inner + 70, 220, 50, 1);
  }

  // ---------------------------------------------------------------- title & creation
  function title(g) {
    const En = E();
    // Vista: sky gradient, a ridge line and the logotype. First impression is a real shot (s22).
    for (let y = 0; y < 480; y++) {
      En.hline(0, y, 640, Core.shade(9 << 4, clamp(Math.round(3 + y / 480 * 9), 0, 15)));
    }
    for (let x = 0; x < 640; x++) {
      const h = 300 + Math.round(Math.sin(x / 61) * 26 + Math.sin(x / 23) * 12 + World.vnoise(x / 40, 0, 99) * 40);
      for (let y = h; y < 480; y++) {
        En.px(x, y, Core.shade(1 << 4, clamp(6 - Math.round((y - h) / 26), 1, 12)));
      }
    }
    for (let x = 0; x < 640; x++) {
      const h = 372 + Math.round(Math.sin(x / 37 + 2) * 14 + World.vnoise(x / 26, 7, 31) * 22);
      for (let y = h; y < 480; y++) En.px(x, y, Core.shade(7 << 4, clamp(8 - Math.round((y - h) / 30), 1, 12)));
    }

    Art.panel(En, 120, 60, 400, 96, 13, false);
    Art.textCentred(En, 320, 78, 'THORNMARCH', Core.idx(13, 15), 4);
    Art.textCentred(En, 320, 122, 'THE ASHEN CROWN', Core.idx(13, 12), 2);

    Art.button(En, 200, 250, 240, 56, 'NEW GAME', false, 3);
    reg('newgame', 200, 250, 240, 56, 1);
    Art.button(En, 200, 316, 240, 56, 'CONTINUE', false, 3);
    reg('continue', 200, 316, 240, 56, 1);
    Art.textCentred(En, 320, 452, 'nine regions  ·  thirteen dungeons', Core.idx(0, 11), 1);
  }

  function creation(g) {
    const En = E();
    const f = screenFrame('CREATE YOUR PARTY', 620, 452);
    const slot = g.createSlot;
    const spec = g.createSpec[slot];

    // Four member tabs.
    for (let i = 0; i < 4; i++) {
      const x = f.x + 16 + i * 96, y = f.inner - 6;
      Art.button(En, x, y, 90, 34, 'PC ' + (i + 1), i === slot, 2);
      reg('cslot', x, y, 90, 34, i);
    }

    let y = f.inner + 40;
    Art.text(En, f.x + 16, y, 'CLASS', Core.idx(13, 13), 2);
    Rules.CLASS_IDS.forEach((cid, i) => {
      const x = f.x + 16 + (i % 3) * 130, yy = y + 22 + Math.floor(i / 3) * 40;
      Art.button(En, x, yy, 124, 34, Rules.CLASSES[cid].name.toUpperCase(), spec.cls === cid, 2);
      reg('cclass', x, yy, 124, 34, cid);
    });

    y += 110;
    Art.text(En, f.x + 16, y, Rules.CLASSES[spec.cls].blurb.slice(0, 74), Core.idx(0, 11), 1);
    y += 18;
    Art.text(En, f.x + 16, y, Rules.CLASSES[spec.cls].blurb.slice(74, 148), Core.idx(0, 11), 1);

    // Point buy.
    y += 26;
    const spent = Rules.creationCost(spec.base);
    Art.text(En, f.x + 16, y, 'POINTS  ' + spent + ' / ' + Rules.CREATE_POINTS,
      Core.idx(spent > Rules.CREATE_POINTS ? 11 : 6, 13), 2);
    y += 24;
    Rules.STATS.forEach((s, i) => {
      const cx = f.x + 16 + (i % 2) * 300, cy = y + Math.floor(i / 2) * 34;
      Art.text(En, cx, cy + 8, Rules.STAT_NAME[s], Core.idx(0, 12), 2);
      Art.button(En, cx + 130, cy, 34, 30, '-', false, 2);
      reg('statdn', cx + 130, cy, 34, 30, s);
      Art.text(En, cx + 176, cy + 8, String(spec.base[s]), Core.idx(13, 14), 2);
      Art.button(En, cx + 210, cy, 34, 30, '+', false, 2);
      reg('statup', cx + 210, cy, 34, 30, s);
    });

    const errs = Rules.validateCreation({ members: g.createSpec });
    Art.button(En, f.x + f.w - 200, f.y + f.h - 56, 180, 44, errs.length ? 'FIX ERRORS' : 'BEGIN', false, 2);
    if (!errs.length) reg('startgame', f.x + f.w - 200, f.y + f.h - 56, 180, 44, 1);
    if (errs.length) Art.text(En, f.x + 16, f.y + f.h - 44, errs[0].slice(0, 52), Core.idx(11, 12), 1);
  }

  // ---------------------------------------------------------------- dispatch
  const SCREENS = {
    sheet: charSheet, inv: inventory, book: spellbook, map: automap,
    shop, dialogue, rest: restScreen, title, creation,
  };

  function draw(g) {
    clearRegions();
    if (g.screen === 'title') { title(g); return; }
    if (g.screen === 'creation') { creation(g); return; }

    Art.gameFrame(E());
    drawHUD(g);
    if (!g.screen) drawTouchControls(g);
    else if (SCREENS[g.screen]) SCREENS[g.screen](g);
  }

  return { draw, hit, regions: () => regions, HUD, PORTRAIT, screenFrame, ghostButton };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UI;
