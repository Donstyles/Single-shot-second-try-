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
  // Narrower portraits buy the width the command bar needs for labels a player can actually read.
  // 1x text does not survive the 0.8125 nearest downscale to the phone — measured, not assumed —
  // so every label the player must read is 2x now, and 2x labels need room.
  const PORTRAIT = { w: 64, h: 94, y: 356, pitch: 70, x0: 6 };

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
      En.clip(x, y, PORTRAIT.w, 46);
      En.blitScaled(p, x, y, PORTRAIT.w, 52, dead ? -5 : 0);
      En.clipReset();

      // Name, then HP and SP bars. The bars are the only thing a player actually reads mid-fight,
      // so they get the width.
      Art.text(En, x + 2, y + 48, ch.name.slice(0, 5), Core.idx(0, dead ? 6 : 15), 2);
      // NUMBERS on the bars. A cold player spent fifteen minutes watching two coloured bars that
      // never moved and wrote: "I could not tell what my party is doing. To learn that Alder has
      // 31/31 HP I had to open a separate full-screen sheet." A bar shows a ratio; a player needs
      // the value, and the party bar is the only thing on screen during a fight.
      const hpMax = Math.max(1, Rules.maxHP(ch));
      Art.bar(En, x + 2, y + 66, PORTRAIT.w - 4, 13, ch.hp / hpMax, 11);
      Art.textCentredShadow(En, x + PORTRAIT.w / 2, y + 67, ch.hp + '/' + hpMax, Core.idx(0, 15), 2);
      const spMax = Rules.maxSP(ch);
      if (spMax > 0) {
        Art.bar(En, x + 2, y + 81, PORTRAIT.w - 4, 13, ch.sp / spMax, 12);
        Art.textCentredShadow(En, x + PORTRAIT.w / 2, y + 82, ch.sp + '/' + spMax, Core.idx(0, 15), 2);
      } else {
        // A flat plate where the SP bar would be, so the strip stays a grid rather than a ragged
        // edge. Level goes on it, and on the casters too — printing LV only for the one character
        // without spell points made a player assume "the others weren't levelled or weren't real".
        En.rect(x + 2, y + 81, PORTRAIT.w - 4, 13, Core.idx(13, 3));
      }
      // The level sits on the portrait's own corner. Beside a five-character name at 2x it had
      // nowhere to go and printed straight through it.
      const lvs = String(ch.level);
      En.rect(x + PORTRAIT.w - Art.textWidth(lvs, 2) - 5, y + 2, Art.textWidth(lvs, 2) + 4, 18, Core.idx(0, 2));
      Art.text(En, x + PORTRAIT.w - Art.textWidth(lvs, 2) - 3, y + 3, lvs, Core.idx(13, 15), 2);

      const cond = Rules.worstCondition(ch);
      if (cond) Art.text(En, x + 2, y + 28, cond.slice(0, 5).toUpperCase(), Core.idx(11, 13), 2);

      if (interactive) reg('pc', x - 2, y - 2, PORTRAIT.w + 4, PORTRAIT.h + 4, i);
    });

    // ---- message log
    const lx = PORTRAIT.x0 + 4 * PORTRAIT.pitch + 4;
    const lw = En.W - 6 - lx - (62 * 4 + 12 + 12);   // leaves room for the command bar
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
    // The clock is RIGHT-ALIGNED in the log panel. Fixed at lx+90 it collided with gold the moment
    // the party got rich: "493750g09:00".
    Art.text(En, lx + 5, HUD.y + 86, g.party.gold + 'g', Core.idx(13, 13), 2);
    const hh = Core.Clock.hhmm();
    Art.text(En, lx + lw - 8 - Art.textWidth(hh, 2), HUD.y + 86, hh, Core.idx(9, 12), 2);
    Art.text(En, lx + 5, HUD.y + 104, (g.map.town ? g.map.town.name : g.map.name).slice(0, 18), Core.idx(2, 14), 2);

    // ---- buttons, two rows of three, each a comfortable finger target
    // Pictorial, not typographic. Six three-letter text labels in flat rectangles is the fastest
    // possible way to read as placeholder tooling, and "MNU" is a debug string.
    // Pictorial AND named. A player pressed all six to find out what they were and still could not
    // identify two of them: "none of them is a map" — the map was there, its icon was not legible.
    // A 1998 command bar could afford to be purely pictorial because you played it for forty hours;
    // a phone game gets fifteen minutes.
    // Three across, two down. Two columns of six left no room under the icon for its name, so the
    // labels printed over the pictograms. The 800px HUD has the width for a proper command bar.
    const BW = 62, BH = 55, BX = En.W - (BW * 4 + 12) - 4;
    const btns = [['sheet', 'PARTY'], ['inv', 'PACK'], ['book', 'MAGIC'],
      ['map', 'MAP'], ['journal', 'QUEST'], ['rest', 'CAMP'], ['menu', 'MENU']];
    btns.forEach(([id, label], i) => {
      const bx = BX + (i % 4) * (BW + 4);
      const by = HUD.y + 4 + Math.floor(i / 4) * (BH + 4);
      Art.button(En, bx, by, BW, BH, null, g.pressed === id, 2);
      Art.hudIcon(En, id, bx + 19, by + 2, 2);
      const lw3 = Art.textWidth(label, 2);
      En.rect(Math.round(bx + BW / 2 - lw3 / 2) - 3, by + BH - 21, lw3 + 6, 19, Core.idx(13, 3));
      Art.textCentred(En, bx + BW / 2, by + BH - 19, label, Core.idx(0, 15), 2);
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
      Art.arrowGlyph(En, x + w / 2, y + h / 2 - (glyph === 'left' || glyph === 'right' ? 3 : 0),
        glyph, Core.idx(13, down ? 15 : 13));
      // The turn buttons say TURN. Belt and braces after a player lost a whole session to believing
      // they were strafe controls.
      if (glyph === 'left' || glyph === 'right') {
        Art.textCentred(En, x + w / 2, y + h - 11, 'TURN', Core.idx(13, down ? 15 : 11), 1);
      }
      reg('move', x, y, w, h, id);
    }
    Art.textCentred(En, L.x + L.w / 2, my - 21, 'MOVE', Core.idx(13, 12), 2);

    // ---- verbs, bottom of the right column
    // FIXED SLOTS. The verbs used to be stacked from the bottom up and re-laid-out whenever combat
    // started or ended, so ATK and USE shared a screen position: a player spamming ATK killed a rat
    // and their next tap — same pixel, no warning — opened a tavern. Nothing may move under a
    // thumb that is already pressing it. Every verb has one home; unavailable ones are drawn
    // greyed rather than removed.
    const vx = R.x + 4;
    const fighting = g.combat.active || g.turnBased;
    const slot = (i) => R.y + R.h - 8 - (i + 1) * bh - i * gap;
    const verb = (id, label, live, row) => {
      const y = slot(row);
      Art.button(En, vx, y, bw, bh, label, live && g.pressed === id, 2);
      if (!live) {
        // A dimming wash, so a dead verb reads as unavailable rather than as missing.
        for (let yy = y + 1; yy < y + bh - 1; yy += 2) En.hline(vx + 1, yy, bw - 2, Core.idx(0, 3));
      }
      if (live) reg(id, vx, y, bw, bh, id);
    };
    // USE IS ALWAYS LIVE. Making it conditional on "no enemy nearby" locked the player out of every
    // building in a town where monsters roam: a veteran stood on the exact tile that had opened the
    // tavern ten minutes earlier, pressed the same button, and got "Dorn hits the Grey Wolf for 4"
    // because a rat had wandered within twelve units. "You are wounded, you run for the temple, and
    // the temple stops existing because a rat followed you." A verb that vanishes when you need it
    // most is worse than no verb.
    verb('use', 'USE', true, 0);
    verb('act', 'ATK', fighting, 1);
    verb('cast', 'CAST', fighting, 2);
    verb('wait', 'WAIT', fighting, 3);
    const ty = slot(4);
    Art.button(En, vx, ty, bw, bh, g.turnBased ? 'REAL' : 'TURN', g.turnBased, 2);
    reg('turnbased', vx, ty, bw, bh, 1);
    Art.textCentred(En, R.x + R.w / 2, ty - 21, 'ACT', Core.idx(13, 12), 2);
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
      Art.panel(En, x, y, w, 40, 13, true);
      Art.textCentred(En, x + w / 2, y + 3, name, Core.idx(0, 15), 2);
      Art.bar(En, x + 8, y + 21, w - 16, 14, foe.hp / Math.max(1, foe.maxHp), 11);
      Art.textCentredShadow(En, x + w / 2, y + 21, foe.hp + '/' + foe.maxHp, Core.idx(0, 15), 2);
    }
    if (!g.turnBased) return;
    // Turn banner: whose turn, which round, and who is still to act.
    const bw2 = 210, bx = V.x + V.w - bw2 - 6, by = V.y + 6;
    Art.panel(En, bx, by, bw2, 46, 13, true);
    const who = g.party.members[g.active];
    Art.text(En, bx + 8, by + 2, 'ROUND ' + (g.tbRound || 1), Core.idx(13, 14), 2);
    Art.text(En, bx + 8, by + 22, who ? who.name.toUpperCase() : '', Core.idx(0, 15), 2);
    g.party.members.forEach((c, i) => {
      const px2 = bx + bw2 - 12 - (3 - i) * 12;
      En.rect(px2, by + 5, 9, 9, Core.idx(g.acted && g.acted[i] ? 0 : 6, g.acted && g.acted[i] ? 5 : 12));
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
    const f = screenFrame('INVENTORY', 740, 440);
    pcSelector(g, f.x + 20, f.y + 44);
    const ch = g.party.members[g.active];

    // Paperdoll on the left: slots as boxes, equipped items as icons.
    // Each well is NAMED, in words, under the well. Three-letter codes were reported twice: "the
    // equipment slots are labelled HLM, AMU, CLK, GNT, BLT, OFF, BOW, BTS, RNG — I can guess helm
    // and gauntlets, I have no idea what OFF or BTS are." The 800px frame has the room now.
    // TWO FLANKING COLUMNS with the figure between them. A three-column grid puts wells straight
    // over the body, and a paperdoll whose figure is hidden behind its own slots is just a grid
    // again — which is what an art critic said the first version was: "there is no body, no figure,
    // no armour silhouette, just twelve labelled boxes. The entire point of the paperdoll is the
    // figure; it is missing."
    const CW = 170;                                  // gap between the two columns
    const SLOTS = [
      ['helm', 0, 0, 'HELM'], ['amulet', CW, 0, 'AMULET'],
      ['cloak', 0, 56, 'CLOAK'], ['gaunt', CW, 56, 'GLOVES'],
      ['armour', 0, 112, 'ARMOUR'], ['offhand', CW, 112, 'SHIELD'],
      ['weapon', 0, 168, 'WEAPON'], ['bow', CW, 168, 'BOW'],
      ['belt', 0, 224, 'BELT'], ['ring1', CW, 224, 'RING'],
      ['boots', 0, 280, 'BOOTS'],
    ];
    const px0 = f.x + 22, py0 = f.inner + 34;

    // A BODY behind the slots. The entire point of a paperdoll is the figure, and twelve labelled
    // boxes in a loose cross is not one.
    // The figure sits BEHIND and DARKER than the wells, a silhouette rather than a diagram. Drawn
    // at full value it covered the slot names it is meant to sit behind.
    {
      const bx = px0 + 23 + CW / 2, by = py0 + 12;
      const S = 2.2;                                 // the figure fills the gap between the columns
      const lim = (x, y, w2, h2, sh) => En.rect(Math.round(bx + x * S), Math.round(by + y * S),
        Math.round(w2 * S), Math.round(h2 * S), Core.idx(4, sh));
      // A recessed alcove for the figure to stand in.
      En.rect(bx - 52, by - 6, 104, 296, Core.idx(0, 2));
      En.frameRect(bx - 52, by - 6, 104, 296, Core.idx(13, 7));
      lim(-8, 0, 16, 17, 9);                        // head
      lim(-5, 16, 10, 5, 7);                        // neck
      lim(-15, 20, 30, 38, 8);                      // torso
      lim(-24, 23, 9, 32, 5);                       // arms, set back from the torso
      lim(15, 23, 9, 32, 4);
      lim(-13, 57, 11, 38, 6);                      // legs
      lim(2, 57, 11, 38, 5);
      lim(-15, 94, 13, 7, 3);                       // feet
      lim(2, 94, 13, 7, 3);
      lim(-7, 2, 14, 6, 6);                         // hair line, so the head has a top
      // A light from the upper left, so the figure has a form rather than being a flat cutout.
      En.rect(Math.round(bx - 15 * S), Math.round(by + 20 * S), Math.round(6 * S), Math.round(38 * S), Core.idx(4, 11));
      En.rect(Math.round(bx - 8 * S), Math.round(by), Math.round(6 * S), Math.round(17 * S), Core.idx(4, 12));
    }

    for (const [slot, ox, oy, label] of SLOTS) {
      const x = px0 + ox, y = py0 + oy;
      const it = ch.equip[slot];
      // A visible RECESSED well, whether or not something is in it. Painted the same brown as the
      // panel behind it, an empty slot reads as a hole and its name floats unattached.
      En.rect(x, y, 46, 46, Core.idx(0, it ? 4 : 2));
      En.hline(x, y, 46, Core.idx(0, 1)); En.vline(x, y, 46, Core.idx(0, 1));
      En.hline(x, y + 45, 46, Core.idx(13, 8)); En.vline(x + 45, y, 46, Core.idx(13, 8));
      En.frameRect(x - 1, y - 1, 48, 48, Core.idx(13, it ? 12 : 7));
      if (it) En.blitScaled(Sprites.icon(it.id), x + 3, y + 3, 40, 40, 0);
      // A knocked-out plate behind the label. At 1x on a textured panel the glyphs lost strokes —
      // a critic read AMULET as "FMULCT", GLOVES as "FLNUFS" and CLOAK as "C ?K".
      const lw2 = Art.textWidth(label, 1);
      En.rect(Math.round(x + 23 - lw2 / 2) - 2, y + 46, lw2 + 4, 10, Core.idx(0, 2));
      Art.textCentred(En, x + 23, y + 47, label, Core.idx(13, it ? 15 : 13), 1);
      reg('equip', x, y, 46, 46, slot);
    }

    // Pack grid on the right.
    const gx = f.x + 320, gy = f.inner + 58;
    Art.text(En, gx, gy - 20, 'PACK  ' + ch.pack.length + '/30', Core.idx(13, 14), 2);
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
      // The detail bar starts where the paperdoll column ENDS. Spanning the full panel width put
      // it straight over the BOOTS well and half of BELT, so selecting an item hid two slots.
      const dx0 = f.x + 240;
      Art.panel(En, dx0, f.y + f.h - 62, f.x + f.w - 14 - dx0, 48, 4, true);
      Art.text(En, dx0 + 8, f.y + f.h - 56, Items.displayName(st), Core.idx(13, 14), 2);
      const it = Items.def(st);
      const line = (it.dmg ? 'Dmg ' + it.dmg.n + 'd' + it.dmg.sides + (it.dmg.plus ? '+' + it.dmg.plus : '') + '  ' : '') +
        (it.ac ? 'AC ' + it.ac + '  ' : '') + (it.heal ? 'Heals ' + it.heal + '  ' : '') + 'Value ' + Items.unitValue(st) + 'g each';
      Art.text(En, dx0 + 8, f.y + f.h - 36, line, Core.idx(0, 12), 2);
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
      // ORDER MATTERS. The hatch used to be drawn AFTER the label, so its 2px-pitch scanlines ran
      // straight through the letterforms at the same pitch as the font stroke: EARTH read "FARTH",
      // MIND read "MINU", BODY read "BUUY". Plate first, then hatch, then a knocked-out solid
      // panel behind the glyphs, then the glyphs.
      Art.button(En, x, y, 96, 34, null, on, 2);
      if (!on) En.frameRect(x, y, 96, 34, Core.idx(13, 10));
      if (cap === 0) {
        // Unavailable schools are HATCHED, not dimmed — dim is indistinguishable from unselected.
        for (let yy = y + 1; yy < y + 33; yy += 3) En.hline(x + 1, yy, 94, Core.idx(0, 3));
      }
      const label = Spellcraft.SCHOOLS[s].name.toUpperCase().slice(0, 6);
      const lw = Art.textWidth(label, 2);
      En.rect(x + 4, y + 7, lw + 4, 20, Core.idx(13, on ? 6 : 3));
      Art.text(En, x + 6, y + 9, label, Core.idx(0, on ? 15 : 14), 2);
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

  // A QUEST JOURNAL. There was none: "the only way to read your quest is to walk back across town
  // to the Captain." MM6 had Quests, Notes and Autonotes and they carried the campaign; a party RPG
  // whose objectives live only in the head of the man who gave them is not navigable.
  function journal(g) {
    const En = E();
    const f = screenFrame('QUEST JOURNAL', 740, 448);
    const ids = World.QUEST_IDS.filter((q) => g.party.quests[q]);
    if (!ids.length) {
      Art.text(En, f.x + 26, f.inner + 30, 'No quests yet.', Core.idx(13, 13), 2);
      Art.text(En, f.x + 26, f.inner + 56, 'Townspeople stand around the plaza. Walk up to one', Core.idx(0, 12), 2);
      Art.text(En, f.x + 26, f.inner + 78, 'and press USE.', Core.idx(0, 12), 2);
      return;
    }
    // Active first, then finished, because the one you are doing is the one you opened this for.
    const order = ids.slice().sort((a, b) => (g.party.quests[a].state) - (g.party.quests[b].state));
    // PAGINATED. Five entries fit; a player who had accepted nine saw five, with blank space below
    // the last one and nothing to say four more existed. Silently truncating a list is worse than
    // truncating it loudly, because the player has no reason to look for what is missing.
    const PER_PAGE = 5;
    const pages = Math.max(1, Math.ceil(order.length / PER_PAGE));
    const page = clamp(g.journalPage || 0, 0, pages - 1);
    const shown = order.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    if (pages > 1) {
      Art.button(En, f.x + f.w - 200, f.y + f.h - 52, 60, 40, '<', false, 2);
      reg('journalpage', f.x + f.w - 200, f.y + f.h - 52, 60, 40, -1);
      Art.button(En, f.x + f.w - 76, f.y + f.h - 52, 60, 40, '>', false, 2);
      reg('journalpage', f.x + f.w - 76, f.y + f.h - 52, 60, 40, 1);
      Art.textCentred(En, f.x + f.w - 108, f.y + f.h - 44,
        (page + 1) + '/' + pages, Core.idx(13, 14), 2);
    }
    Art.text(En, f.x + 22, f.y + f.h - 44, order.length + ' QUEST' + (order.length === 1 ? '' : 'S'),
      Core.idx(13, 13), 2);
    let y = f.inner + 16;
    for (const qid of shown) {
      if (y > f.y + f.h - 70) break;
      const q = World.QUESTS[qid], st = g.party.quests[qid];
      const done = st.state === 2;
      Art.panel(En, f.x + 20, y, f.w - 40, 62, 4, true);
      Art.text(En, f.x + 28, y + 4, q.name.toUpperCase(), Core.idx(13, done ? 9 : 15), 2);
      const region = World.REGIONS[q.region];
      // Word-wrapped, not sliced. Cutting at a fixed character count breaks mid-word, and this is
      // the prose that tells a player why they are walking somewhere.
      const words = q.text.split(' ');
      let line = '', ln = 0;
      for (const w of words) {
        if (line && (line + ' ' + w).length > 70) {
          Art.text(En, f.x + 28, y + 24 + ln * 12, line, Core.idx(0, done ? 7 : 13), 1);
          line = w; ln++;
          if (ln > 1) break;
        } else line = line ? line + ' ' + w : w;
      }
      if (ln <= 1 && line) Art.text(En, f.x + 28, y + 24 + ln * 12, line, Core.idx(0, done ? 7 : 13), 1);
      // What, precisely, is still owed.
      let need = '';
      if (done) need = 'DONE';
      else if (q.need) need = 'Bring ' + (q.count || 1) + ' ' +
        (Items.ITEMS[q.need] ? Items.ITEMS[q.need].name : q.need) +
        '  (have ' + (g.countItem ? g.countItem(q.need) : 0) + ')';
      else if (q.kill) need = 'Kill ' + q.kill.replace(/_/g, ' ') + (q.killIn ? ' in ' + q.killIn : '');
      Art.text(En, f.x + 28, y + 48, need, Core.idx(done ? 6 : 13, 13), 1);
      Art.text(En, f.x + f.w - 190, y + 48, region ? region.name : '', Core.idx(2, 12), 1);
      y += 68;
    }
  }

  const SHOP_TITLE = {
    weapon: 'THE ARMOURY', armour: "ARMOURER'S", general: 'GENERAL GOODS', magic: 'APOTHECARY',
    temple: 'TEMPLE', tavern: 'TAVERN', trainer: 'TRAINING HALL', guild: 'MAGE GUILD',
  };

  function shop(g) {
    const En = E();
    const kind = g.shopKind;
    const f = screenFrame(SHOP_TITLE[kind] || kind.toUpperCase(), 700, 440);
    // A PLACE, not a panel. "A door swaps the view for a menu panel"; "buildings are shells";
    // "25% content and 75% empty brown box" — three reviews, three ways of saying the same thing,
    // and all three named it the largest gap to MM6. MM6's own shops are painted 2D interiors with
    // a list of goods over them, so this is the faithful answer rather than a substitute for one.
    // BELOW the title rule, and inside the frame. Painting from f.inner-34 put the room straight
    // over the shop's own name and its close button: a player reported "a gold rule where a shop
    // name should be and no name", and had to guess where the X was.
    const roomY = f.y + 40, roomH = f.h - 48;
    Art.shopInterior(En, f.x + 8, roomY, f.w - 16, roomH, kind);
    // The room stays VISIBLE. The first attempt scrimmed the whole panel and put the stock list
    // across it, which hid the painting completely and just produced a darker brown box. The goods
    // live in their own column on the right; the left third is the shop.
    const listX = f.x + Math.round(f.w * 0.34);
    En.rect(listX, roomY, f.x + f.w - 8 - listX, roomH, Core.idx(0, 2));
    for (let y = roomY; y < roomY + roomH; y += 2) En.hline(listX, y, f.x + f.w - 8 - listX, Core.idx(0, 1));
    En.vline(listX, roomY, roomH, Core.idx(13, 9));
    // Redraw the title and the close button ON TOP of the room, so the room can never hide them.
    Art.panel(En, f.x + 6, f.y + 6, f.w - 12, 34, 13, false);
    Art.textCentred(En, f.x + f.w / 2, f.y + 12, SHOP_TITLE[kind] || kind.toUpperCase(), Core.idx(13, 15), 2);
    Art.button(En, f.x + f.w - 52, f.y + 8, 44, 26, 'X', false, 2);
    reg('close', f.x + f.w - 52, f.y + 8, 44, 26, 1);
    pcSelector(g, f.x + 20, f.y + 44);
    const ch = g.party.members[g.active];
    const stock = g.shopStock || [];

    // Gold RIGHT-ALIGNED in the header. Printed at x+20 it landed on top of whatever the shop's
    // own first two lines were: at the guild, the name/level line, the gold line and a red "Not
    // enough experience yet" were all drawn within four pixels of each other and came out as "an
    // unreadable smear across the top".
    // Gold on the LEFT, over the room, clear of the goods column it used to sit behind.
    Art.panel(En, f.x + 16, f.y + 86, 122, 26, 13, true);
    En.frameRect(f.x + 16, f.y + 86, 122, 26, Core.idx(13, 10));
    Art.textCentred(En, f.x + 77, f.y + 91, g.party.gold + 'g', Core.idx(13, 15), 2);

    if (kind === 'temple') {
      const cost = g.party.members.reduce((a, c) => a + Rules.healCost(c), 0);
      const ty = f.inner + 46;
      En.rect(listX + 6, ty - 8, f.x + f.w - 20 - listX, 150, Core.idx(0, 3));
      Art.text(En, listX + 14, ty, 'Heal and cure the party', Core.idx(0, 14), 2);
      if (cost <= 0) {
        // "Cost: 0 gold" over a "PAY 0" button is a strange thing to show a player who is unhurt.
        Art.text(En, listX + 14, ty + 26, 'Nobody here is hurt.', Core.idx(6, 14), 2);
        return;
      }
      Art.text(En, listX + 14, ty + 26, 'Cost: ' + cost + ' gold', Core.idx(13, 14), 2);
      Art.button(En, listX + 14, ty + 60, 220, 46, 'PAY ' + cost, false, 2);
      reg('templeheal', listX + 14, ty + 60, 220, 46, cost);
      return;
    }
    if (kind === 'tavern') {
      // Everything starts BELOW the tab row. "Rest the night 10 gold" was drawn straight through
      // the ALDER/BREE/CASS/DORN tabs, letters on top of letters.
      let ty = f.inner + 46;
      En.rect(listX + 6, ty - 8, f.x + f.w - 20 - listX, 210, Core.idx(0, 3));
      Art.text(En, listX + 14, ty, 'Rest the night — 10 gold', Core.idx(0, 14), 2);
      Art.button(En, listX + 14, ty + 26, 220, 46, 'SLEEP', false, 2);
      reg('tavernrest', listX + 14, ty + 26, 220, 46, 10);
      ty += 96;
      Art.text(En, listX + 14, ty, 'Buy rations — 12 gold each', Core.idx(0, 14), 2);
      Art.button(En, listX + 14, ty + 26, 220, 46, 'BUY FOOD', false, 2);
      reg('buyfood', listX + 14, ty + 26, 220, 46, 12);
      Art.text(En, listX + 14, ty + 84, 'Rations: ' + g.party.food, Core.idx(2, 14), 2);
      return;
    }
    // A GUILD teaches magic; a TRAINER teaches arms. They used to render the identical body — the
    // same twelve weapon and armour buttons — so no magic-school skill was reachable anywhere in
    // the game, and neither was any spell. A QA pass at level 100 with every skill point spent
    // could cast three spells out of ninety-nine.
    if (kind === 'guild') {
      // The school rail starts BELOW the character tabs. It was drawn on top of them, so both rows
      // were unreadable and both were clickable in the overlap — an ambiguous hit region.
      const schools = Spellcraft.SCHOOL_IDS.filter((sc) => Rules.classCap(ch.cls, sc) > 0);
      if (!schools.length) {
        Art.text(En, listX + 14, f.inner + 46, ch.name + ' has no aptitude for magic.', Core.idx(11, 13), 2);
        Art.text(En, listX + 14, f.inner + 70, 'Pick a caster from the tabs above.', Core.idx(0, 13), 2);
        return;
      }
      let sch = g.guildSchool;
      if (schools.indexOf(sch) < 0) sch = schools[0];
      // School tabs.
      schools.forEach((sc, i) => {
        const bx = listX + 12 + (i % 4) * 92, by = f.inner + 40 + Math.floor(i / 4) * 36;
        Art.button(En, bx, by, 86, 32, Spellcraft.SCHOOLS[sc].name.toUpperCase().slice(0, 6), sc === sch, 2);
        reg('guildschool', bx, by, 86, 32, sc);
      });
      const skill = ch.skills[sch];
      const lvl = skill ? skill.lvl : 0;
      const mast = skill ? skill.mastery : 0;
      Art.text(En, listX + 14, f.inner + 118, Spellcraft.SCHOOLS[sch].name + ' — ' +
        Rules.MASTERY_NAME[mast] + ' ' + lvl, Core.idx(13, 14), 2);
      Art.button(En, listX + 240, f.inner + 114, 210, 34,
        'STUDY (' + Rules.skillUpCost(lvl) + ' PTS, HAVE ' + ch.skillPts + ')', false, 2);
      reg('skillup', listX + 240, f.inner + 114, 210, 34, sch);

      // The spells of this school, with what each needs and what it costs.
      const list = Spellcraft.bySchool(sch);
      list.forEach((id, i) => {
        const sp = Spellcraft.SPELLS[id];
        const x = listX + 10 + (i % 2) * 232, y = f.inner + 156 + Math.floor(i / 2) * 42;
        if (y > f.y + f.h - 60) return;
        const known = !!(ch.spells && ch.spells[id]);
        const need = Spellcraft.TIER_MASTERY[sp.tier];
        const gated = mast < need;
        const price = Spellcraft.scrollPrice(id);
        Art.panel(En, x, y, 226, 38, 4, true);
        Art.text(En, x + 6, y + 4, sp.name.slice(0, 17), Core.idx(0, known ? 8 : gated ? 6 : 14), 2);
        Art.text(En, x + 6, y + 22, 'T' + sp.tier + '  ' + sp.sp + ' SP', Core.idx(12, 12), 1);
        if (known) Art.text(En, x + 190, y + 12, 'KNOWN', Core.idx(6, 12), 2);
        else if (gated) Art.text(En, x + 150, y + 12, Rules.MASTERY_NAME[need].toUpperCase(), Core.idx(11, 11), 2);
        else {
          Art.text(En, x + 194, y + 12, price + 'g', Core.idx(13, g.party.gold >= price ? 14 : 7), 2);
          reg('learnspell', x, y, 226, 38, id);
        }
      });
      return;
    }
    if (kind === 'trainer') {
      const pending = Rules.levelForXP(ch.xp) - ch.level;
      const cost = Rules.trainCost(ch.level);
      // Below the tab row, like every other shop screen. "Alder Level 1" was drawn on top of the
      // ALDER/KESTA/CASS/DORN tabs and both were illegible.
      En.rect(listX + 6, f.inner + 38, f.x + f.w - 20 - listX, f.h - 110, Core.idx(0, 3));
      Art.text(En, listX + 14, f.inner + 46, ch.name + ' — level ' + ch.level, Core.idx(13, 15), 2);
      Art.text(En, listX + 14, f.inner + 70, pending > 0 ? 'Ready to advance ' + pending + ' level(s)' : 'Not enough experience yet', Core.idx(pending > 0 ? 6 : 11, 12), 2);
      Art.text(En, listX + 14, f.inner + 92, 'XP ' + ch.xp + ' / ' + Rules.xpForLevel(ch.level + 1), Core.idx(0, 12), 2);
      if (pending > 0) {
        Art.button(En, listX + 14, f.inner + 118, 260, 46, 'TRAIN ' + cost + 'g', false, 2);
        reg('train', listX + 14, f.inner + 118, 260, 46, cost);
      }
      // Skill spending, at readable size. Twelve buttons of 1x type on a brown plate was "dim brown
      // on dim brown, and I had to squint to make out Sword 1 / Axe 0 / Spear 0".
      Art.text(En, listX + 14, f.inner + 146, 'SKILL POINTS: ' + ch.skillPts, Core.idx(13, 13), 2);
      const learnable = Object.keys(Rules.SKILLS).filter((k) => Rules.classCap(ch.cls, k) > 0).slice(0, 12);
      learnable.forEach((k, i) => {
        // Three columns, four rows. Two columns ran the last pair of skills off the bottom of the
        // panel — PLATE and SHIELD were cut in half by the frame.
        const x = listX + 12 + (i % 3) * 146, y = f.inner + 170 + Math.floor(i / 3) * 40;
        const cur = ch.skills[k];
        Art.button(En, x, y, 140, 34, Rules.SKILLS[k].name.slice(0, 6).toUpperCase() + ' ' + (cur ? cur.lvl : 0), false, 2);
        reg('skillup', x, y, 140, 34, k);
      });
      return;
    }

    // Goods shops.
    stock.forEach((st, i) => {
      // Bigger rows and a bigger icon on its own recessed plate. At 32px on a dark panel the
      // silhouettes had almost no contrast and the whole list read as one repeated shape: "six of
      // seven items share one icon", then "6x14 vertical sticks" a round later.
      const x = listX + 8, y = f.inner + 44 + i * 54;
      if (y > f.y + f.h - 60) return;
      const price = Rules.buyPrice(Items.unitValue(st), ch);
      const afford = g.party.gold >= price;
      Art.panel(En, x, y, f.x + f.w - 20 - x, 52, 4, true);
      Art.panel(En, x + 4, y + 4, 44, 44, 13, true);
      En.frameRect(x + 4, y + 4, 44, 44, Core.idx(13, 9));
      En.blitScaled(Sprites.icon(st.id), x + 5, y + 5, 42, 42, 0);
      Art.text(En, x + 54, y + 6, Items.ITEMS[st.id].name.slice(0, 18), Core.idx(0, afford ? 14 : 7), 2);
      Art.text(En, x + 54, y + 28, price + 'g', Core.idx(13, afford ? 14 : 7), 2);
      if (!afford) Art.text(En, x + 140, y + 32, 'TOO DEAR', Core.idx(11, 11), 1);
      if (afford) reg('buy', x, y, f.x + f.w - 20 - x, 52, i);
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
    const f = screenFrame('CREATE YOUR PARTY', 660, 468);
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

    let y = f.y + 104;
    Art.text(En, f.x + 16, y, 'CLASS', Core.idx(13, 13), 2);
    Rules.CLASS_IDS.forEach((cid, i) => {
      const x = f.x + 16 + (i % 3) * 138, yy = f.y + 124 + Math.floor(i / 3) * 38;
      Art.button(En, x, yy, 132, 34, Rules.CLASSES[cid].name.toUpperCase(), spec.cls === cid, 2);
      reg('cclass', x, yy, 132, 34, cid);
    });

    y += 106;
    // ONE ANCHOR, laid out from the bottom up. The stat grid, the points line, the blurb and the
    // BEGIN button were each positioned from their own running offset, so clamping the grid to keep
    // it clear of BEGIN drove it up into the points line, which was already sitting on the blurb.
    // A player aiming at Speed's "+" hit BEGIN and started the game with a party they had not
    // finished making, thirty seconds in, with no way to undo it.
    // The budget is explicit and top-down, because every implicit running offset in this screen has
    // collided with something at least once: the blurb with the class buttons, the points line with
    // the stat grid, the stat grid with BEGIN.
    // EVERY row is a fixed offset from the panel's own top. Deriving them from a running `y` is
    // what let the blurb land on the class buttons, the points line on the stat grid, and the stat
    // grid under BEGIN — three separate collisions, one of which started the game for a player who
    // was aiming at Speed's "+".
    //   title   f.y +   6 ..  40      class buttons f.y + 124 .. 196
    //   tabs    f.y +  34 ..  68      blurb         f.y + 204 .. 240
    //   name    f.y +  68 ..  98      points        f.y + 246 .. 264
    //   CLASS   f.y + 104             stats         f.y + 272 .. 400
    //                                 BEGIN         f.y + 410 .. 452   (panel is 468 tall)
    const blurbTop = f.y + 204;
    const pointsY = f.y + 246;
    const gridTop = f.y + 272;

    {
      // Three lines, always, whatever the class says. A blurb that changes height moves everything
      // below it under the player's finger.
      const words = Rules.CLASSES[spec.cls].blurb.split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        if (line && (line + ' ' + w).length > 58) { lines.push(line); line = w; }
        else line = line ? line + ' ' + w : w;
      }
      if (line) lines.push(line);
      lines.slice(0, 2).forEach((l, i) => Art.text(En, f.x + 16, blurbTop + i * 18, l, Core.idx(2, 15), 2));
    }

    const spent = Rules.creationCost(spec.base);
    // "POINTS 32 / 50" is ambiguous on sight — spent, or remaining? A player had to tap + twice and
    // watch the number move to find out. Say the number that decides what they do next.
    const left = Rules.CREATE_POINTS - spent;
    Art.text(En, f.x + 16, pointsY, left + ' POINTS LEFT',
      Core.idx(left < 0 ? 11 : left === 0 ? 13 : 6, 14), 2);
    Art.text(En, f.x + 260, pointsY + 4, '(' + spent + ' of ' + Rules.CREATE_POINTS + ')', Core.idx(0, 12), 1);
    y = gridTop;
    Rules.STATS.forEach((s, i) => {
      const cx = f.x + 16 + (i % 2) * 320, cy = y + Math.floor(i / 2) * 32;
      Art.text(En, cx, cy + 8, Rules.STAT_NAME[s].slice(0, 11), Core.idx(0, 12), 2);
      Art.button(En, cx + 148, cy, 34, 30, '-', false, 2);
      reg('statdn', cx + 148, cy, 34, 30, s);
      Art.text(En, cx + 192, cy + 8, String(spec.base[s]), Core.idx(13, 14), 2);
      Art.button(En, cx + 228, cy, 34, 30, '+', false, 2);
      reg('statup', cx + 228, cy, 34, 30, s);
    });

    const errs = Rules.validateCreation({ members: g.createSpec });
    Art.button(En, f.x + f.w - 200, f.y + 410, 180, 42, errs.length ? 'FIX ERRORS' : 'BEGIN', false, 2);
    if (!errs.length) reg('startgame', f.x + f.w - 200, f.y + 410, 180, 42, 1);
    if (errs.length) Art.text(En, f.x + 16, f.y + 420, errs[0].slice(0, 40), Core.idx(11, 13), 2);
  }

  // ---------------------------------------------------------------- dispatch
  const SCREENS = {
    sheet: charSheet, inv: inventory, book: spellbook, map: automap, journal,
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
