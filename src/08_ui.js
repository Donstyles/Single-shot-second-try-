// 08_ui.js — the HUD and every screen.
// Owner: ui. Calls Core, Rules, Spellcraft, Items, Art, Sprites.
//
// GLUE CALLS RULES. Nothing here computes a price, a hit chance or a max HP; it asks Rules. If a
// formula appears in this file it is a bug by definition.
//
// Sized for touch. The framebuffer is 800x480 letterboxed to 650x390 on an iPhone 14 Pro Max in
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

  const HUD = { x: 0, y: 352, w: 800, h: 128 };
  const PORTRAIT = { w: 72, h: 88, y: 358, pitch: 78, x0: 6 };

  // ---------------------------------------------------------------- hud
  function drawHUD(g, interactive) {
    const En = E();
    Art.panel(En, HUD.x, HUD.y, HUD.w, HUD.h, 13, true);
    En.hline(0, HUD.y, En.W, Core.idx(13, 11));

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
      // NUMBERS on the bars. A cold player spent fifteen minutes watching two coloured bars that
      // never moved and wrote: "I could not tell what my party is doing. To learn that Alder has
      // 31/31 HP I had to open a separate full-screen sheet." A bar shows a ratio; a player needs
      // the value, and the party bar is the only thing on screen during a fight.
      const hpMax = Math.max(1, Rules.maxHP(ch));
      Art.bar(En, x + 2, y + 68, PORTRAIT.w - 4, 9, ch.hp / hpMax, 11);
      Art.textCentredShadow(En, x + PORTRAIT.w / 2, y + 69, ch.hp + "/" + hpMax, Core.idx(0, 15), 1);
      const spMax = Rules.maxSP(ch);
      if (spMax > 0) {
        Art.bar(En, x + 2, y + 79, PORTRAIT.w - 4, 9, ch.sp / spMax, 12);
        Art.textCentredShadow(En, x + PORTRAIT.w / 2, y + 80, ch.sp + "/" + spMax, Core.idx(0, 15), 1);
      } else {
        Art.text(En, x + 2, y + 80, 'LV ' + ch.level, Core.idx(13, 12), 1);
      }

      const cond = Rules.worstCondition(ch);
      if (cond) Art.text(En, x + 2, y + 46, cond.slice(0, 9).toUpperCase(), Core.idx(11, 12), 1);

      if (interactive) reg('pc', x - 2, y - 2, PORTRAIT.w + 4, PORTRAIT.h + 4, i);
    });

    // ---- message log
    const lx = PORTRAIT.x0 + 4 * PORTRAIT.pitch + 4;
    const lw = 636 - lx - 118;
    Art.panel(En, lx, HUD.y + 6, lw, 74, 4, true);
    // Word-wrap rather than hard-truncate. Every shot in round r3 showed "Your party arri".
    const perLine = Math.floor((lw - 10) / (Art.CH_W * 2));
    // Fill the window from the NEWEST message backwards, whole messages only. Wrapping oldest-first
    // and then keeping the last four lines left the previous message's tail orphaned at the top and
    // cut the current one mid-sentence — a player read "ahead. / Nothing here. A / door is 4 paces
    // / ahead." and never saw the front of the sentence that mattered ("The water is too deep").
    const LINES = 4;
    const wrapMsg = (l) => {
      const c = l.kind === 'hit' ? Core.idx(11, 12) : l.kind === 'good' ? Core.idx(6, 12)
        : l.kind === 'sys' ? Core.idx(9, 11) : Core.idx(0, 13);
      const out = [];
      let line = '';
      for (const w of String(l.text).split(' ')) {
        if (line && (line + ' ' + w).length > perLine) { out.push([line, c]); line = w; }
        else line = line ? line + ' ' + w : w;
      }
      if (line) out.push([line, c]);
      return out;
    };
    const recent = Core.Log.tail(8);
    const shown = [];
    for (let i = recent.length - 1; i >= 0; i--) {
      const block = wrapMsg(recent[i]);
      if (shown.length && shown.length + block.length > LINES) break;
      shown.unshift(...block.slice(0, LINES));
      if (shown.length >= LINES) break;
    }
    shown.slice(0, LINES).forEach((row, i) => {
      Art.text(En, lx + 5, HUD.y + 11 + i * 17, row[0], row[1], 2);
    });

    // ---- gold, time, place
    Art.text(En, lx + 5, HUD.y + 86, g.party.gold + 'g', Core.idx(13, 13), 2);
    Art.text(En, lx + 90, HUD.y + 86, Core.Clock.hhmm(), Core.idx(9, 12), 2);
    Art.text(En, lx + 5, HUD.y + 106, (g.map.town ? g.map.town.name + ', ' : '') + g.map.name, Core.idx(2, 12), 1);

    // ---- buttons, two rows of three, each a comfortable finger target
    // Pictorial, not typographic. Six three-letter text labels in flat rectangles is the fastest
    // possible way to read as placeholder tooling, and "MNU" is a debug string.
    const BX = En.W - 118, BW = 54, BH = 36;
    const btns = ['sheet', 'inv', 'book', 'map', 'rest', 'menu'];
    btns.forEach((id, i) => {
      const bx = BX + (i % 2) * (BW + 4);
      const by = HUD.y + 6 + Math.floor(i / 2) * (BH + 4);
      Art.button(En, bx, by, BW, BH, null, g.pressed === id, 2);
      Art.hudIcon(En, id, bx + 11, by + 6, 2);
      if (interactive) reg('btn', bx, by, BW, BH, id);
    });
  }

  // ---------------------------------------------------------------- touch controls
  // Drawn in the CARVED CHROME either side of the viewport, never over the world. Movement under
  // the left thumb, verbs under the right, which is also where they fall when the phone is held in
  // landscape. Nothing here overlaps a single pixel of the 3D view.
  function drawTouchControls(g) {
    const En = E(), L = En.CHROME_L, R = En.CHROME_R;

    // ---- movement cluster, bottom of the left column
    const bw = 80, bh = 34, gap = 3;
    const mx = L.x + 4;
    const my = L.y + L.h - (bh * 3 + gap * 2) - 8;
    const half = (bw - gap) >> 1;
    const moves = [
      ['fwd', mx, my, bw, bh, 'up'],
      ['turnL', mx, my + bh + gap, half, bh, 'left'],
      ['turnR', mx + half + gap, my + bh + gap, half, bh, 'right'],
      ['back', mx, my + (bh + gap) * 2, bw, bh, 'down'],
    ];
    for (const [id, x, y, w, h, glyph] of moves) {
      const down = !!g.keys[id] || (g.keyLatch && g.keyLatch[id] > 0);
      Art.button(En, x, y, w, h, null, down, 2);
      Art.arrowGlyph(En, x + w / 2, y + h / 2, glyph, Core.idx(13, down ? 15 : 13));
      reg('move', x, y, w, h, id);
    }
    Art.textCentred(En, L.x + L.w / 2, my - 13, 'MOVE', Core.idx(13, 10), 1);

    // ---- verbs, bottom of the right column
    const vx = R.x + 4;
    let vy = R.y + R.h - bh - 8;
    const verb = (id, label, on) => {
      Art.button(En, vx, vy, bw, bh, label, g.pressed === id, 2);
      reg(id, vx, vy, bw, bh, id);
      vy -= bh + gap;
    };
    verb('act', g.combat.active || g.turnBased ? 'ATK' : 'USE');
    if (g.combat.active || g.turnBased) { verb('cast', 'CAST'); verb('wait', 'WAIT'); }
    // The MM6 key. It is always available, always visible, and says which mode you are in.
    Art.button(En, vx, vy, bw, bh, g.turnBased ? 'REAL' : 'TURN', g.turnBased, 2);
    reg('turnbased', vx, vy, bw, bh, 1);
    vy -= bh + gap;
    Art.textCentred(En, R.x + R.w / 2, vy + bh - 6, 'ACT', Core.idx(13, 10), 1);
  }


  // Who is up, and what is in front of you. A veteran played forty minutes and wrote: "no enemy
  // health, no enemy name on screen, no target indicator, no indication of which of your four is
  // swinging... a 1998 player cannot make a single tactical decision here."
  function combatReadout(g) {
    const En = E(), V = En.VIEW;
    const foe = g.nearestFoe ? g.nearestFoe(14) : null;
    if (foe) {
      const name = foe.name || 'Enemy';
      const w = Math.max(150, Art.textWidth(name, 2) + 24);
      const x = V.x + ((V.w - w) >> 1), y = V.y + 6;
      Art.panel(En, x, y, w, 34, 13, true);
      Art.textCentred(En, x + w / 2, y + 3, name, Core.idx(0, 15), 2);
      Art.bar(En, x + 8, y + 22, w - 16, 8, foe.hp / Math.max(1, foe.maxHp), 11);
      Art.textCentredShadow(En, x + w / 2, y + 22, foe.hp + '/' + foe.maxHp, Core.idx(0, 15), 1);
    }
    if (!g.turnBased) return;
    // Turn banner: whose turn, which round, and who is still to act.
    const bw2 = 200, bx = V.x + V.w - bw2 - 6, by = V.y + 6;
    Art.panel(En, bx, by, bw2, 40, 13, true);
    const who = g.party.members[g.active];
    Art.text(En, bx + 8, by + 3, 'ROUND ' + (g.tbRound || 1), Core.idx(13, 13), 1);
    Art.text(En, bx + 8, by + 15, who ? who.name.toUpperCase() + "'S TURN" : '', Core.idx(0, 15), 2);
    g.party.members.forEach((c, i) => {
      const px2 = bx + bw2 - 12 - (3 - i) * 12;
      En.rect(px2, by + 6, 8, 8, Core.idx(g.acted && g.acted[i] ? 0 : 6, g.acted && g.acted[i] ? 5 : 12));
    });
  }

  // ---------------------------------------------------------------- screens
  // Panels cover the HUD portraits, and several screens are per-character. Give them their own
  // selector rather than relying on a strip the panel is sitting on top of.
  function pcSelector(g, x, y) {
    const En = E();
    g.party.members.forEach((ch, i) => {
      const bx = x + i * 92;
      const on = g.active === i;
      Art.button(En, bx, y, 88, 30, ch.name.slice(0, 7).toUpperCase(), on, 2);
      if (Rules.isDead(ch)) En.frameRect(bx, y, 88, 30, Core.idx(11, 12));
      reg('pc', bx, y, 88, 30, i);
    });
    return y + 36;
  }

  function screenFrame(title, w, h) {
    const En = E();
    const x = (E().W - w) >> 1, y = (E().H - h) >> 1;
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
    pcSelector(g, f.x + 20, f.y + 44);
    const ch = g.party.members[g.active];
    const p = Sprites.portrait(ch.portrait, ch.cls, ch.sex);
    En.blitScaled(p, f.x + 20, f.inner + 40, 96, 108, 0);

    let y = f.inner + 40;
    Art.text(En, f.x + 130, y, ch.name, Core.idx(13, 14), 2); y += 22;
    Art.text(En, f.x + 130, y, Rules.CLASSES[ch.cls].name + '  Level ' + ch.level, Core.idx(0, 13), 2); y += 20;
    Art.text(En, f.x + 130, y, 'XP ' + ch.xp + ' / ' + Rules.xpForLevel(ch.level + 1), Core.idx(2, 12), 2); y += 20;
    Art.text(En, f.x + 130, y, 'HP ' + ch.hp + '/' + Rules.maxHP(ch) +
      '   SP ' + ch.sp + '/' + Rules.maxSP(ch), Core.idx(0, 13), 2); y += 20;
    Art.text(En, f.x + 130, y, 'AC ' + g.acOf(ch) + '   Skill pts ' + ch.skillPts, Core.idx(0, 13), 2);

    // Stats in two columns.
    y = f.inner + 164;
    Rules.STATS.forEach((s, i) => {
      const cx = f.x + 24 + (i % 2) * 260;
      const cy = y + Math.floor(i / 2) * 22;
      const v = Rules.effStat(ch, s);
      const b = Rules.statBonus(v);
      Art.text(En, cx, cy, Rules.STAT_NAME[s], Core.idx(0, 11), 2);
      Art.text(En, cx + 150, cy, String(v), Core.idx(13, 14), 2);
      Art.text(En, cx + 192, cy, (b >= 0 ? '+' : '') + b, Core.idx(b >= 0 ? 6 : 11, 12), 2);
    });

    // Skills, scrollable-free: only trained ones are listed, which is always few enough to fit.
    y = f.inner + 164 + 92;
    Art.text(En, f.x + 24, y, 'SKILLS', Core.idx(13, 13), 2); y += 20;
    const trained = Object.keys(ch.skills).filter((k) => ch.skills[k].mastery > 0);
    trained.slice(0, 12).forEach((k, i) => {
      const cx = f.x + 24 + (i % 3) * 190;
      const cy = y + Math.floor(i / 3) * 22;
      Art.text(En, cx, cy, Rules.SKILLS[k].name.slice(0, 9) + ' ' + ch.skills[k].lvl +
        Rules.MASTERY_NAME[ch.skills[k].mastery].slice(0, 1), Core.idx(0, 13), 2);
    });
  }

  function inventory(g) {
    const En = E();
    const f = screenFrame('INVENTORY', 600, 430);
    pcSelector(g, f.x + 20, f.y + 44);
    const ch = g.party.members[g.active];

    // Paperdoll on the left: slots as boxes, equipped items as icons.
    const SLOTS = [
      ['helm', 60, 0], ['amulet', 120, 0],
      ['armour', 60, 46], ['cloak', 0, 46], ['gaunt', 120, 46],
      ['weapon', 0, 92], ['offhand', 120, 92], ['belt', 60, 92],
      ['bow', 0, 138], ['boots', 60, 138], ['ring1', 120, 138],
    ];
    const px0 = f.x + 24, py0 = f.inner + 40;

    // A BODY behind the slots. The entire point of a paperdoll is the figure, and twelve labelled
    // boxes in a loose cross is not one.
    {
      const bx = px0 + 84, by = py0 + 8;
      const lim = (x, y, w2, h2, ramp, sh) => En.rect(x, y, w2, h2, Core.idx(ramp, sh));
      lim(bx - 9, by - 4, 18, 18, 10, 10);          // head
      lim(bx - 6, by + 13, 12, 5, 10, 8);           // neck
      lim(bx - 17, by + 17, 34, 40, 4, 7);          // torso
      lim(bx - 27, by + 20, 10, 34, 4, 6);          // arms
      lim(bx + 17, by + 20, 10, 34, 4, 6);
      lim(bx - 15, by + 56, 12, 40, 4, 6);          // legs
      lim(bx + 3, by + 56, 12, 40, 4, 6);
      lim(bx - 17, by + 95, 14, 8, 4, 5);           // feet
      lim(bx + 3, by + 95, 14, 8, 4, 5);
      En.frameRect(bx - 28, by - 5, 56, 110, Core.idx(0, 4));
    }

    for (const [slot, ox, oy] of SLOTS) {
      const x = px0 + ox, y = py0 + oy;
      Art.panel(En, x, y, 42, 42, 4, true);
      const it = ch.equip[slot];
      if (it) En.blitScaled(Sprites.icon(it.id), x + 5, y + 5, 32, 32, 0);
      else {
        // Three letters at scale 2 fits a 42px well; five at scale 1 did not and rendered as
        // garbage like "c nat" and "ufft a".
        const SHORT = { helm: 'HLM', amulet: 'AMU', armour: 'ARM', cloak: 'CLK', gaunt: 'GNT',
          weapon: 'WPN', offhand: 'OFF', belt: 'BLT', bow: 'BOW', boots: 'BTS', ring1: 'RNG' };
        Art.textCentred(En, x + 21, y + 15, SHORT[slot] || slot.slice(0, 3).toUpperCase(), Core.idx(0, 7), 2);
      }
      reg('equip', x, y, 42, 42, slot);
    }

    // Pack grid on the right.
    const gx = f.x + 220, gy = f.inner + 40;
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
        (it.ac ? 'AC ' + it.ac + '  ' : '') + (it.heal ? 'Heals ' + it.heal + '  ' : '') + 'Value ' + Items.unitValue(st) + 'g each';
      Art.text(En, f.x + 22, f.y + f.h - 36, line, Core.idx(0, 12), 2);
      // USE is the verb the game was missing entirely: eight healing potions the party could not
      // drink, offered only EQUIP and DROP.
      const usable = it && (it.kind === 'potion' || it.kind === 'food' || (it.kind === 'tool' && it.light));
      if (usable) {
        Art.button(En, f.x + f.w - 290, f.y + f.h - 56, 84, 38, 'USE', false, 2);
        reg('usepack', f.x + f.w - 290, f.y + f.h - 56, 84, 38, sel);
      } else if (it && it.slot) {
        Art.button(En, f.x + f.w - 290, f.y + f.h - 56, 84, 38, 'EQUIP', false, 2);
        reg('doequip', f.x + f.w - 290, f.y + f.h - 56, 84, 38, sel);
      }
      Art.button(En, f.x + f.w - 108, f.y + f.h - 56, 84, 38, 'DROP', false, 2);
      reg('drop', f.x + f.w - 108, f.y + f.h - 56, 84, 38, sel);
    }
  }

  function spellbook(g) {
    const En = E();
    const f = screenFrame('SPELLBOOK', 600, 430);
    pcSelector(g, f.x + 20, f.y + 44);
    const ch = g.party.members[g.active];

    // School tabs down the left.
    Spellcraft.SCHOOL_IDS.forEach((s, i) => {
      const x = f.x + 16, y = f.inner + 40 + i * 38;
      const cap = Rules.classCap(ch.cls, s);
      const on = g.bookSchool === s;
      Art.button(En, x, y, 96, 34, null, on, 2);
      Art.text(En, x + 6, y + 9, Spellcraft.SCHOOLS[s].name.toUpperCase().slice(0, 6), Core.idx(0, on ? 15 : 14), 2);
      if (!on) {
        // Unselected tabs must still READ. In r3 all eight sat one value step off the panel and
        // were invisible on a phone.
        En.frameRect(x, y, 96, 34, Core.idx(13, 10));
      }
      if (cap === 0) {
        // Unavailable schools are HATCHED, not dimmed — dim is indistinguishable from unselected.
        for (let yy = y + 1; yy < y + 33; yy += 3) En.hline(x + 1, yy, 94, Core.idx(0, 3));
      }
      reg('school', x, y, 96, 34, s);
    });

    const school = g.bookSchool || 'fire';
    const all = Spellcraft.bySchool(school);
    const page = g.bookPage || 0;
    const ids = all.slice(page * 4, page * 4 + 4);
    Art.button(En, f.x + f.w - 150, f.y + f.h - 46, 60, 34, '<', false, 2);
    reg('bookpage', f.x + f.w - 150, f.y + f.h - 46, 60, 34, -1);
    Art.button(En, f.x + f.w - 84, f.y + f.h - 46, 60, 34, '>', false, 2);
    reg('bookpage', f.x + f.w - 84, f.y + f.h - 46, 60, 34, 1);
    Art.text(En, f.x + f.w - 250, f.y + f.h - 38, 'TIER ' + (page * 4 + 1) + '-' + Math.min(11, page * 4 + 4), Core.idx(13, 13), 2);
    ids.forEach((id, i) => {
      const sp = Spellcraft.SPELLS[id];
      const x = f.x + 130, y = f.inner + 40 + i * 76;
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

  // Bounding box of everything the party has seen on this map. Sampled on a stride, because the
  // exact rim of the explored region does not need to be pixel-perfect to frame a map.
  function seenBounds(g, m) {
    let x0 = m.w, y0 = m.h, x1 = 0, y1 = 0, any = false;
    for (let y = 0; y < m.h; y += 2) {
      for (let x = 0; x < m.w; x += 2) {
        if (!g.seen(m.id, x, y)) continue;
        any = true;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!any) return { x0: g.party.x - 8, y0: g.party.y - 8, x1: g.party.x + 8, y1: g.party.y + 8 };
    return { x0, y0, x1, y1 };
  }

  function automap(g) {
    const En = E();
    const f = screenFrame('MAP — ' + g.map.name.toUpperCase(), 600, 430);
    const m = g.map;
    // SCALE TO WHAT IS EXPLORED, centred on the party — not to the whole 128x128 region. Fitting
    // the full map put an entire town into a 45-pixel blob: "I had to screenshot it and blow it up
    // 6x offline before I could see that the yellow dots formed a ring of buildings. Playing on the
    // phone as handed to me, that map is a brown smudge with a red pixel in it."
    const bnd = seenBounds(g, m);
    const MIN_SPAN = 26;                        // never magnify a first step into a wall of pixels
    const span = Math.max(MIN_SPAN, bnd.x1 - bnd.x0 + 4, bnd.y1 - bnd.y0 + 4);
    const scale = Math.max(1, Math.min((f.w - 40) / span, (f.h - 96) / span));
    const viewW = (f.w - 40) / scale, viewH = (f.h - 96) / scale;
    // Centre on the party, then slide back inside the map so half the panel is never empty.
    let camX = clamp(g.party.x, viewW / 2, Math.max(viewW / 2, m.w - viewW / 2));
    let camY = clamp(g.party.y, viewH / 2, Math.max(viewH / 2, m.h - viewH / 2));
    const ox = f.x + 20 + (f.w - 40) / 2 - camX * scale;
    const oy = f.inner + (f.h - 96) / 2 - camY * scale;

    En.clip(f.x + 18, f.inner - 2, f.w - 36, f.h - 92);
    const y0 = Math.max(0, Math.floor(camY - viewH / 2) - 1), y1 = Math.min(m.h, Math.ceil(camY + viewH / 2) + 1);
    const x0 = Math.max(0, Math.floor(camX - viewW / 2) - 1), x1 = Math.min(m.w, Math.ceil(camX + viewW / 2) + 1);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
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
    // Only draw a door the party has actually SEEN. Markers floating in unmapped void are worse
    // than no markers: they promise geometry that is not on the map.
    for (const p of m.portals) {
      if (!g.seen(m.id, p.x, p.y)) continue;
      En.rect(Math.round(ox + p.x * scale) - 1, Math.round(oy + p.y * scale) - 1, 4, 4, Core.idx(13, 14));
    }

    // The party marker with a REAL facing arrow. "Knowing a door is to the left on the map is
    // useless, because I don't know which way left is."
    const pxp = Math.round(ox + g.party.x * scale), pyp = Math.round(oy + g.party.y * scale);
    const ca = Math.cos(g.party.ang), sa = Math.sin(g.party.ang);
    for (let t = 0; t <= 10; t++) {
      const w = Math.max(0, 4 - Math.round(t * 0.4));
      const bx = pxp + Math.round(ca * t), by = pyp + Math.round(sa * t);
      for (let o = -w; o <= w; o++) En.px(bx + Math.round(-sa * o), by + Math.round(ca * o), Core.idx(11, 14));
    }
    En.rect(pxp - 2, pyp - 2, 5, 5, Core.idx(11, 15));
    En.clipReset();

    // Compass rose, so the arrow means something.
    const cxp = f.x + f.w - 62, cyp = f.inner + 8, CR = 26;
    Art.panel(En, cxp - CR, cyp - CR, CR * 2, CR * 2, 13, true);
    En.frameRect(cxp - CR, cyp - CR, CR * 2, CR * 2, Core.idx(13, 11));
    Art.textCentred(En, cxp, cyp - CR + 2, 'N', Core.idx(13, 15), 2);
    Art.textCentred(En, cxp, cyp + CR - 20, 'S', Core.idx(13, 10), 2);
    Art.text(En, cxp - CR + 3, cyp - 9, 'W', Core.idx(13, 10), 2);
    Art.text(En, cxp + CR - 13, cyp - 9, 'E', Core.idx(13, 10), 2);
    // A needle, so the rose is a compass and not four letters in a box.
    for (let t = -8; t <= 8; t++) {
      En.px(cxp, cyp + t, Core.idx(t < 0 ? 11 : 0, t < 0 ? 14 : 8));
      if (t > -6 && t < 0) { En.px(cxp - 1, cyp + t, Core.idx(11, 12)); En.px(cxp + 1, cyp + t, Core.idx(11, 12)); }
    }

    // Legend, because eight unexplained yellow dots in empty brown is not a map.
    const ly = f.y + f.h - 30;
    Art.text(En, f.x + 20, ly, (World.REGIONS[m.region] ? World.REGIONS[m.region].name : m.name), Core.idx(2, 13), 2);
    En.rect(f.x + 300, ly + 2, 10, 10, Core.idx(11, 14)); Art.text(En, f.x + 316, ly, 'YOU', Core.idx(0, 12), 2);
    En.rect(f.x + 380, ly + 2, 10, 10, Core.idx(13, 14)); Art.text(En, f.x + 396, ly, 'DOOR', Core.idx(0, 12), 2);
  }

  function shop(g) {
    const En = E();
    const kind = g.shopKind;
    const f = screenFrame(kind.toUpperCase(), 600, 430);
    pcSelector(g, f.x + 20, f.y + 44);
    const ch = g.party.members[g.active];
    const stock = g.shopStock || [];

    // Gold RIGHT-ALIGNED in the header. Printed at x+20 it landed on top of whatever the shop's
    // own first two lines were: at the guild, the name/level line, the gold line and a red "Not
    // enough experience yet" were all drawn within four pixels of each other and came out as "an
    // unreadable smear across the top".
    Art.text(En, f.x + f.w - 24 - Art.textWidth(g.party.gold + 'g', 2), f.inner + 18,
      g.party.gold + 'g', Core.idx(13, 14), 2);

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
    // A GUILD teaches magic; a TRAINER teaches arms. They used to render the identical body — the
    // same twelve weapon and armour buttons — so no magic-school skill was reachable anywhere in
    // the game, and neither was any spell. A QA pass at level 100 with every skill point spent
    // could cast three spells out of ninety-nine.
    if (kind === 'guild') {
      const schools = Spellcraft.SCHOOL_IDS.filter((sc) => Rules.classCap(ch.cls, sc) > 0);
      if (!schools.length) {
        Art.text(En, f.x + 24, f.inner + 30, ch.name + ' has no aptitude for magic.', Core.idx(11, 12), 2);
        Art.text(En, f.x + 24, f.inner + 56, 'Pick a spellcaster from the party above.', Core.idx(0, 12), 2);
        return;
      }
      let sch = g.guildSchool;
      if (schools.indexOf(sch) < 0) sch = schools[0];
      // School tabs.
      schools.forEach((sc, i) => {
        const bx = f.x + 24 + i * 92, by = f.inner + 16;
        Art.button(En, bx, by, 86, 32, Spellcraft.SCHOOLS[sc].name.toUpperCase().slice(0, 6), sc === sch, 2);
        reg('guildschool', bx, by, 86, 32, sc);
      });
      const skill = ch.skills[sch];
      const lvl = skill ? skill.lvl : 0;
      const mast = skill ? skill.mastery : 0;
      Art.text(En, f.x + 24, f.inner + 58, Spellcraft.SCHOOLS[sch].name + ' — ' +
        Rules.MASTERY_NAME[mast] + ' ' + lvl, Core.idx(13, 14), 2);
      Art.button(En, f.x + 330, f.inner + 54, 230, 34,
        'STUDY (' + Rules.skillUpCost(lvl) + ' PTS, HAVE ' + ch.skillPts + ')', false, 2);
      reg('skillup', f.x + 330, f.inner + 54, 230, 34, sch);

      // The spells of this school, with what each needs and what it costs.
      const list = Spellcraft.bySchool(sch);
      list.forEach((id, i) => {
        const sp = Spellcraft.SPELLS[id];
        const x = f.x + 22 + (i % 2) * 278, y = f.inner + 96 + Math.floor(i / 2) * 42;
        if (y > f.y + f.h - 60) return;
        const known = !!(ch.spells && ch.spells[id]);
        const need = Spellcraft.TIER_MASTERY[sp.tier];
        const gated = mast < need;
        const price = Spellcraft.scrollPrice(id);
        Art.panel(En, x, y, 270, 38, 4, true);
        Art.text(En, x + 6, y + 4, sp.name.slice(0, 17), Core.idx(0, known ? 8 : gated ? 6 : 14), 2);
        Art.text(En, x + 6, y + 22, 'T' + sp.tier + '  ' + sp.sp + ' SP', Core.idx(12, 12), 1);
        if (known) Art.text(En, x + 190, y + 12, 'KNOWN', Core.idx(6, 12), 2);
        else if (gated) Art.text(En, x + 150, y + 12, Rules.MASTERY_NAME[need].toUpperCase(), Core.idx(11, 11), 2);
        else {
          Art.text(En, x + 194, y + 12, price + 'g', Core.idx(13, g.party.gold >= price ? 14 : 7), 2);
          reg('learnspell', x, y, 270, 38, id);
        }
      });
      return;
    }
    if (kind === 'trainer') {
      const pending = Rules.levelForXP(ch.xp) - ch.level;
      const cost = Rules.trainCost(ch.level);
      Art.text(En, f.x + 24, f.inner + 20, ch.name + ' — level ' + ch.level, Core.idx(13, 14), 2);
      Art.text(En, f.x + 24, f.inner + 48, pending > 0 ? 'Ready to advance ' + pending + ' level(s)' : 'Not enough experience yet', Core.idx(pending > 0 ? 6 : 11, 12), 2);
      Art.text(En, f.x + 24, f.inner + 70, 'XP ' + ch.xp + ' / ' + Rules.xpForLevel(ch.level + 1), Core.idx(0, 12), 2);
      if (pending > 0) {
        Art.button(En, f.x + 24, f.inner + 96, 260, 46, 'TRAIN ' + cost + 'g', false, 2);
        reg('train', f.x + 24, f.inner + 96, 260, 46, cost);
      }
      // Skill spending, at readable size. Twelve buttons of 1x type on a brown plate was "dim brown
      // on dim brown, and I had to squint to make out Sword 1 / Axe 0 / Spear 0".
      Art.text(En, f.x + 24, f.inner + 150, 'SKILL POINTS: ' + ch.skillPts, Core.idx(13, 13), 2);
      const learnable = Object.keys(Rules.SKILLS).filter((k) => Rules.classCap(ch.cls, k) > 0).slice(0, 12);
      learnable.forEach((k, i) => {
        const x = f.x + 24 + (i % 3) * 180, y = f.inner + 176 + Math.floor(i / 3) * 40;
        const cur = ch.skills[k];
        Art.button(En, x, y, 172, 34, Rules.SKILLS[k].name.slice(0, 7).toUpperCase() + ' ' + (cur ? cur.lvl : 0), false, 2);
        reg('skillup', x, y, 172, 34, k);
      });
      return;
    }

    // Goods shops.
    stock.forEach((st, i) => {
      // Bigger rows and a bigger icon on its own recessed plate. At 32px on a dark panel the
      // silhouettes had almost no contrast and the whole list read as one repeated shape: "six of
      // seven items share one icon", then "6x14 vertical sticks" a round later.
      const x = f.x + 18 + (i % 2) * 288, y = f.inner + 62 + Math.floor(i / 2) * 66;
      if (y > f.y + f.h - 84) return;
      const price = Rules.buyPrice(Items.unitValue(st), ch);
      const afford = g.party.gold >= price;
      Art.panel(En, x, y, 282, 60, 4, true);
      Art.panel(En, x + 5, y + 5, 50, 50, 13, true);
      En.frameRect(x + 5, y + 5, 50, 50, Core.idx(13, 9));
      En.blitScaled(Sprites.icon(st.id), x + 6, y + 6, 48, 48, 0);
      Art.text(En, x + 62, y + 10, Items.ITEMS[st.id].name.slice(0, 16), Core.idx(0, afford ? 14 : 7), 2);
      Art.text(En, x + 62, y + 32, price + 'g', Core.idx(13, afford ? 14 : 7), 2);
      if (!afford) Art.text(En, x + 180, y + 34, 'TOO DEAR', Core.idx(11, 11), 1);
      if (afford) reg('buy', x, y, 282, 60, i);
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

  function defeat(g) {
    const En = E();
    En.rect(0, 0, En.W, En.H, Core.idx(0, 1));
    for (let y = 0; y < En.H; y += 2) En.hline(0, y, En.W, Core.idx(11, 2));
    Art.panel(En, 90, 130, 460, 220, 13, false);
    Art.textCentred(En, 320, 158, 'YOUR PARTY HAS FALLEN', Core.idx(11, 13), 3);
    Art.textCentred(En, 320, 210, 'The priests of Harrowgate will take you in,', Core.idx(0, 12), 2);
    Art.textCentred(En, 320, 232, 'for a share of what you carry.', Core.idx(0, 12), 2);
    Art.button(En, 170, 268, 300, 56, 'WAKE AT THE TEMPLE', false, 2);
    reg('revive', 170, 268, 300, 56, 1);
  }

  function menu(g) {
    const En = E();
    const f = screenFrame('MENU', 520, 400);
    Art.text(En, f.x + 30, f.inner + 6, 'SAVE', Core.idx(13, 14), 2);
    for (let i = 0; i < 3; i++) {
      Art.button(En, f.x + 30, f.inner + 32 + i * 48, 190, 42, 'SLOT ' + (i + 1), false, 2);
      reg('saveslot', f.x + 30, f.inner + 32 + i * 48, 190, 42, i);
    }
    Art.text(En, f.x + 260, f.inner + 6, 'LOAD', Core.idx(13, 14), 2);
    for (let i = 0; i < 3; i++) {
      const has = g.slotUsed ? g.slotUsed(i) : true;
      Art.button(En, f.x + 260, f.inner + 32 + i * 48, 190, 42, has ? 'SLOT ' + (i + 1) : 'EMPTY', false, 2);
      if (has) reg('loadslot', f.x + 260, f.inner + 32 + i * 48, 190, 42, i);
    }
    Art.button(En, f.x + 30, f.y + f.h - 62, 200, 44, 'TITLE SCREEN', false, 2);
    reg('titlescreen', f.x + 30, f.y + f.h - 62, 200, 44, 1);
    Art.text(En, f.x + 250, f.y + f.h - 50, 'Three slots. Saving never', Core.idx(0, 11), 1);
    Art.text(En, f.x + 250, f.y + f.h - 38, 'overwrites without you choosing.', Core.idx(0, 11), 1);
  }

  // ---------------------------------------------------------------- title & creation
  function title(g) {
    const En = E();
    // Vista: sky gradient, a ridge line and the logotype. First impression is a real shot (s22).
    for (let y = 0; y < 480; y++) {
      En.hline(0, y, En.W, Core.shade(9 << 4, clamp(Math.round(3 + y / En.H * 9), 0, 15)));
    }
    for (let x = 0; x < En.W; x++) {
      const h = 300 + Math.round(Math.sin(x / 61) * 26 + Math.sin(x / 23) * 12 + World.vnoise(x / 40, 0, 99) * 40);
      for (let y = h; y < 480; y++) {
        En.px(x, y, Core.shade(1 << 4, clamp(6 - Math.round((y - h) / 26), 1, 12)));
      }
    }
    for (let x = 0; x < En.W; x++) {
      const h = 372 + Math.round(Math.sin(x / 37 + 2) * 14 + World.vnoise(x / 26, 7, 31) * 22);
      for (let y = h; y < 480; y++) En.px(x, y, Core.shade(7 << 4, clamp(8 - Math.round((y - h) / 30), 1, 12)));
    }

    // A carved wordmark, not a panel. Drop shadow, dark bevel, bright face, and a rule beneath —
    // so the logo cannot be mistaken for a third button.
    Art.textCentred(En, 322, 66, 'THORNMARCH', Core.idx(0, 1), 5);
    Art.textCentred(En, 320, 64, 'THORNMARCH', Core.idx(13, 6), 5);
    Art.textCentred(En, 319, 63, 'THORNMARCH', Core.idx(13, 15), 5);
    const tw = Art.textWidth('THORNMARCH', 5);
    En.hline(320 - tw / 2, 112, tw, Core.idx(13, 11));
    En.hline(320 - tw / 2, 114, tw, Core.idx(13, 5));
    Art.textCentred(En, 321, 127, 'THE ASHEN CROWN', Core.idx(0, 1), 2);
    Art.textCentred(En, 320, 126, 'THE ASHEN CROWN', Core.idx(13, 13), 2);

    Art.button(En, 200, 250, 240, 56, 'NEW GAME', false, 3);
    reg('newgame', 200, 250, 240, 56, 1);
    Art.button(En, 200, 316, 240, 56, 'CONTINUE', false, 3);
    reg('continue', 200, 316, 240, 56, 1);
    Art.textCentred(En, 320, 444, 'THE ROAD ENDS AT THE KEEP', Core.idx(13, 10), 2);
  }

  function creation(g) {
    const En = E();
    const f = screenFrame('CREATE YOUR PARTY', 620, 452);
    const slot = g.createSlot;
    const spec = g.createSpec[slot];

    // Four member tabs, ABOVE the name row rather than through it. They overlapped by 26 pixels,
    // which printed the arrow, the name and the tab label into each other: a player read the result
    // as "< Alden PC 1 >" and wrote "I could not tell whether Alden was a name field, a label, or a
    // portrait caption. I never found out." They also never realised there were four characters to
    // make, so the tabs now say who they are, not just which number they are.
    for (let i = 0; i < 4; i++) {
      const x = f.x + 16 + i * 100, y = f.inner - 8;
      Art.button(En, x, y, 94, 28, g.createSpec[i].name.toUpperCase().slice(0, 8), i === slot, 2);
      reg('cslot', x, y, 94, 28, i);
    }
    Art.text(En, f.x + 424, f.inner - 2, 'ALL FOUR', Core.idx(13, 12), 1);
    Art.text(En, f.x + 424, f.inner + 8, 'ARE YOURS', Core.idx(13, 12), 1);

    // Name, sex and portrait. Creation that ignores all three and hands you the same four people
    // is not character creation.
    let ny = f.inner + 26;
    Art.button(En, f.x + 16, ny, 34, 30, '<', false, 2); reg('cname', f.x + 16, ny, 34, 30, -1);
    Art.text(En, f.x + 58, ny + 8, spec.name, Core.idx(13, 14), 2);
    Art.button(En, f.x + 170, ny, 34, 30, '>', false, 2); reg('cname', f.x + 170, ny, 34, 30, 1);
    Art.button(En, f.x + 214, ny, 70, 30, spec.sex === 'f' ? 'FEMALE' : 'MALE', false, 2);
    reg('csex', f.x + 214, ny, 70, 30, 1);
    Art.button(En, f.x + 292, ny, 34, 30, '<', false, 2); reg('cport', f.x + 292, ny, 34, 30, -1);
    const pv = Sprites.portrait(spec.portrait === undefined ? slot : spec.portrait, spec.cls, spec.sex);
    En.blitScaled(pv, f.x + 330, ny - 4, 36, 40, 0);
    Art.button(En, f.x + 372, ny, 34, 30, '>', false, 2); reg('cport', f.x + 372, ny, 34, 30, 1);

    let y = f.inner + 64;
    Art.text(En, f.x + 16, y, 'CLASS', Core.idx(13, 13), 2);
    Rules.CLASS_IDS.forEach((cid, i) => {
      const x = f.x + 16 + (i % 3) * 130, yy = y + 22 + Math.floor(i / 3) * 40;
      Art.button(En, x, yy, 124, 34, Rules.CLASSES[cid].name.toUpperCase(), spec.cls === cid, 2);
      reg('cclass', x, yy, 124, 34, cid);
    });

    y += 106;
    // Word-wrap the blurb. Slicing at a fixed character count broke it mid-word, and it is the
    // first prose a new player reads.
    {
      const words = Rules.CLASSES[spec.cls].blurb.split(' ');
      let line = '', ly = y;
      for (const w of words) {
        if (line && (line + ' ' + w).length > 44) { Art.text(En, f.x + 16, ly, line, Core.idx(2, 15), 2); ly += 18; line = w; }
        else line = line ? line + ' ' + w : w;
      }
      if (line) Art.text(En, f.x + 16, ly, line, Core.idx(2, 15), 2);
      y = ly;
    }

    // Point buy.
    y += 26;
    const spent = Rules.creationCost(spec.base);
    Art.text(En, f.x + 16, y, 'POINTS  ' + spent + ' / ' + Rules.CREATE_POINTS,
      Core.idx(spent > Rules.CREATE_POINTS ? 11 : 6, 13), 2);
    y += 24;
    Rules.STATS.forEach((s, i) => {
      const cx = f.x + 16 + (i % 2) * 300, cy = y + Math.floor(i / 2) * 34;
      Art.text(En, cx, cy + 8, Rules.STAT_NAME[s].slice(0, 11), Core.idx(0, 12), 2);
      Art.button(En, cx + 148, cy, 34, 30, '-', false, 2);
      reg('statdn', cx + 148, cy, 34, 30, s);
      Art.text(En, cx + 192, cy + 8, String(spec.base[s]), Core.idx(13, 14), 2);
      Art.button(En, cx + 228, cy, 34, 30, '+', false, 2);
      reg('statup', cx + 228, cy, 34, 30, s);
    });

    const errs = Rules.validateCreation({ members: g.createSpec });
    Art.button(En, f.x + f.w - 200, f.y + f.h - 56, 180, 44, errs.length ? 'FIX ERRORS' : 'BEGIN', false, 2);
    if (!errs.length) reg('startgame', f.x + f.w - 200, f.y + f.h - 56, 180, 44, 1);
    if (errs.length) Art.text(En, f.x + 16, f.y + f.h - 44, errs[0].slice(0, 52), Core.idx(11, 12), 1);
  }

  // ---------------------------------------------------------------- dispatch
  const SCREENS = {
    sheet: charSheet, inv: inventory, book: spellbook, map: automap,
    shop, dialogue, rest: restScreen, title, creation, menu, defeat,
  };

  function draw(g) {
    clearRegions();
    if (g.screen === 'title') { title(g); return; }
    if (g.screen === 'creation') { creation(g); return; }
    if (g.screen === 'defeat') { defeat(g); return; }

    Art.gameFrame(E());
    if (!g.screen) combatReadout(g);
    // HUD is drawn NON-INTERACTIVE behind a modal: it used to render on top of every panel and
    // stay clickable through it, so pressing where RST sits opened Make Camp through the sheet.
    drawHUD(g, !g.screen);
    if (!g.screen) drawTouchControls(g);
    else if (SCREENS[g.screen]) SCREENS[g.screen](g);
  }

  return { draw, hit, regions: () => regions, HUD, PORTRAIT, screenFrame };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UI;
