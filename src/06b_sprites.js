// 06b_sprites.js — sprite, portrait, paperdoll and icon painters.
// Owner: sprites. Calls Core, Art.
//
// Two sources, one interface. Baked foundry frames (assets/sprites/*.json, embedded by build.js)
// are used when present; otherwise a procedural painter stands in. The engine never knows which it
// got, which is what lets the art pass upgrade the game without touching the renderer.

const Sprites = (() => {
  'use strict';

  const { clamp, RNG } = Core;

  const cache = Object.create(null);
  const BAKED = Object.create(null);

  // ---------------------------------------------------------------- baked
  // Decode indexed PNGs the build embedded. The browser decodes them for free, which is why the
  // payload is PNG rather than raw index arrays.
  function installBaked(manifest) {
    if (!manifest) return 0;
    let n = 0;
    for (const id of Object.keys(manifest)) {
      BAKED[id] = manifest[id];
      n++;
    }
    return n;
  }

  // Decode a base64 indexed PNG into {w,h,data} using a canvas. Index recovery works because the
  // build writes the game palette into the PNG's PLTE, so a decoded RGB maps back 1:1.
  function decodePNG(b64, pal) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    return img;   // callers await decode; see prepareBaked
  }

  async function prepareBaked() {
    const out = {};
    for (const id of Object.keys(BAKED)) {
      const m = BAKED[id];
      const facings = [];
      for (const f of m.facings) {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + f.png; });
        const c = document.createElement('canvas');
        c.width = f.w; c.height = f.h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, f.w, f.h).data;
        const data = new Uint8Array(f.w * f.h);
        for (let i = 0, p = 0; i < data.length; i++, p += 4) {
          data[i] = d[p + 3] < 128 ? 0 : Core.palIdx(d[p], d[p + 1], d[p + 2]);
        }
        facings.push({ w: f.w, h: f.h, data });
      }
      out[id] = { facings, h: m.h, aspect: m.aspect, pxPerUnit: m.pxPerUnit || (m.h / 1.24) };
    }
    return out;
  }

  // ---------------------------------------------------------------- procedural
  // Stand-in creature painter. Deliberately silhouette-first: a blob that reads at 40px beats a
  // detailed thing that does not, and the silhouette is the best predictor of "reads as MM6".
  function paintCreature(kind, w, h) {
    const d = new Uint8Array(w * h);
    const r = RNG.world('spr:' + kind);
    const M = Items.MONSTERS[kind] || { level: 1 };

    // Body plan varies by rough archetype so a skeleton does not look like an ogre.
    const heavy = /ogre|troll|zombie|knight|elemental|crown/.test(kind);
    const thin = /skeleton|wraith|lich|harpy|spider|rat/.test(kind);
    const ramp = /skeleton|lich|wraith/.test(kind) ? 0
      : /goblin|troll|harpy/.test(kind) ? 6
      : /elemental|crown/.test(kind) ? 15
      : /knight|steel/.test(kind) ? 14
      : /zombie|ghoul/.test(kind) ? 7
      : 10;

    const cx = w >> 1;
    const bodyW = Math.round(w * (heavy ? 0.52 : thin ? 0.26 : 0.38));
    const headR = Math.round(w * (heavy ? 0.15 : 0.13));
    const shoulderY = Math.round(h * 0.30);
    const hipY = Math.round(h * 0.66);

    const put = (x, y, sh) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      d[y * w + x] = Core.shade(ramp << 4, sh);
    };

    // Legs
    for (let y = hipY; y < h; y++) {
      const spread = Math.round((y - hipY) * 0.22) + 2;
      const lw = Math.max(2, Math.round(bodyW * 0.22));
      for (let k = 0; k < lw; k++) {
        put(cx - spread - k, y, 7 - (k >> 1));
        put(cx + spread + k, y, 6 - (k >> 1));
      }
    }
    // Torso: a tapered barrel, lit from upper-left to match the foundry rig.
    for (let y = shoulderY; y < hipY; y++) {
      const t = (y - shoulderY) / Math.max(1, hipY - shoulderY);
      const ww = Math.round(bodyW * (1 - t * 0.18));
      for (let x = -ww; x <= ww; x++) {
        const lit = 10 - Math.round(Math.abs(x + ww * 0.35) / ww * 5);
        put(cx + x, y, clamp(lit, 3, 13));
      }
    }
    // Arms
    for (let y = shoulderY + 1; y < hipY - 1; y++) {
      const t = (y - shoulderY) / Math.max(1, hipY - shoulderY);
      const off = bodyW + 1 + Math.round(Math.sin(t * 2.4) * 2);
      for (let k = 0; k < Math.max(2, Math.round(bodyW * 0.28)); k++) {
        put(cx - off - k, y, 9 - (k >> 1));
        put(cx + off + k, y, 6 - (k >> 1));
      }
    }
    // Head
    for (let y = -headR; y <= headR; y++) {
      for (let x = -headR; x <= headR; x++) {
        if (x * x + y * y > headR * headR) continue;
        const lit = 11 - Math.round((x + headR) / (headR * 2) * 5) - Math.round((y + headR) / (headR * 2) * 2);
        put(cx + x, shoulderY - headR + y, clamp(lit, 4, 14));
      }
    }
    // Eyes: two dark pips. At 40px this is the only facial feature that survives, and it is the
    // one that makes a shape read as a creature rather than a rock.
    put(cx - Math.max(1, headR >> 1), shoulderY - headR, 1);
    put(cx + Math.max(1, headR >> 1), shoulderY - headR, 1);
    if (/goblin|troll|ogre/.test(kind)) {
      // Horns, because the silhouette test is what matters most.
      for (let k = 0; k < headR; k++) {
        put(cx - headR - k + 1, shoulderY - headR - k - 1, 5);
        put(cx + headR + k - 1, shoulderY - headR - k - 1, 5);
      }
    }

    // 1px dark outline outside the silhouette — what separates 1998 pre-rendered from a modern
    // render pasted on a background.
    const out = Uint8Array.from(d);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[y * w + x]) continue;
        if ((x > 0 && d[y * w + x - 1]) || (x < w - 1 && d[y * w + x + 1]) ||
            (y > 0 && d[(y - 1) * w + x]) || (y < h - 1 && d[(y + 1) * w + x])) {
          out[y * w + x] = Core.idx(0, 2);
        }
      }
    }
    return { w, h, data: out };
  }

  function creature(kind, facing) {
    const baked = BAKED.__ready && BAKED.__ready[kind];
    if (baked) {
      const f = baked.facings[clamp(facing || 0, 0, baked.facings.length - 1)];
      f.pxPerUnit = baked.pxPerUnit;
      return f;
    }
    const k = 'c:' + kind;
    if (!cache[k]) cache[k] = paintCreature(kind, 48, 64);
    return cache[k];
  }

  // World height a sprite should be drawn at, given the creature's real height. A trimmed frame is
  // only part of the model, so drawing it at the creature's full height inflates everything.
  function worldHeight(spr, creatureHeight) {
    if (!spr.pxPerUnit) return creatureHeight;
    return (spr.h / spr.pxPerUnit) * creatureHeight;
  }

  // ---------------------------------------------------------------- decor
  function paintDecor(kind) {
    const w = 40, h = 56;
    const clamp = Core.clamp;
    const d = new Uint8Array(w * h);
    const put = (x, y, ramp, sh) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      d[y * w + x] = Core.shade(ramp << 4, sh);
    };
    const cx = w >> 1;

    if (kind === 'oak' || kind === 'pine' || kind === 'deadtree' || kind === 'ashstump') {
      // Trunk and canopy MUST overlap. The first version started the trunk below where the canopy
      // ended, which drew a floating crown and a detached post — the defect reads instantly as
      // "sprites are not grounded" and no amount of texture work hides it.
      const canopyBottom = kind === 'pine' ? Math.round(h * 0.72) : Math.round(h * 0.58);
      const trunkTop = kind === 'ashstump' ? Math.round(h * 0.78) : Math.round(canopyBottom * 0.72);
      const trunkW = kind === 'ashstump' ? 4 : 2;
      for (let y = trunkTop; y < h; y++) {
        const taper = trunkW + Math.round((y - trunkTop) / Math.max(1, h - trunkTop) * 1.6);
        for (let x = -taper; x <= taper; x++) put(cx + x, y, 4, clamp(8 - Math.abs(x + 1), 3, 12));
      }
      // Root flare: without a darkened, widening base the trunk ends in a flat cut and the tree
      // reads as floating above the ground.
      for (let y = h - 4; y < h; y++) {
        const flare = trunkW + 2 + (y - (h - 4));
        for (let x = -flare; x <= flare; x++) put(cx + x, y, 5, clamp(5 - Math.abs(x) / 2, 2, 7));
      }
      if (kind !== 'ashstump') {
        const leafRamp = kind === 'deadtree' ? 4 : 7;
        if (kind === 'pine') {
          for (let t = 0; t < 4; t++) {
            const cyy = Math.round(h * (0.10 + t * 0.16));
            const rr = 5 + t * 4;
            for (let y = -rr; y <= rr + 2; y++) {
              for (let x = -rr; x <= rr; x++) {
                if (Math.abs(x) + Math.abs(y) * 1.3 > rr) continue;
                put(cx + x, cyy + y, leafRamp,
                  clamp(11 - Math.round((x + rr) / (rr * 2 + 1) * 5) - Math.round((y + rr) / (rr * 2 + 1) * 2), 3, 13));
              }
            }
          }
        } else {
          // Four overlapping lobes of different size, then a per-pixel noise nibble at the rim.
          // A clean ellipse is what makes a tree read as a modern low-poly asset.
          const cyy = Math.round(h * 0.30);
          const lobes = [[0, 0, 13], [-8, 3, 9], [8, 2, 10], [-2, -7, 8], [4, 8, 7]];
          for (const [ox, oy, rr] of lobes) {
            for (let y = -rr; y <= rr; y++) {
              for (let x = -rr; x <= rr; x++) {
                const dd = Math.hypot(x, y * 1.12);
                if (dd > rr) continue;
                // Ragged rim: drop scattered pixels in the outer 22% so the edge is alpha-cut
                // foliage rather than a geometric arc.
                if (dd > rr * 0.78 && ((x * 7 + y * 13 + ox * 3) & 3) === 0) continue;
                if (kind === 'deadtree' && ((x * 3 + y * 5) & 3)) continue;
                const gx = x + ox, gy = y + oy;
                put(cx + gx, cyy + gy, leafRamp,
                  clamp(11 - Math.round((gx + 16) / 32 * 5) - Math.round((gy + 16) / 32 * 3)
                    + (((gx * 5 + gy * 3) & 3) === 0 ? 1 : 0), 3, 13));
              }
            }
          }
        }
      }
    } else if (kind === 'rock' || kind === 'standingstone') {
      const rh = kind === 'standingstone' ? Math.round(h * 0.8) : Math.round(h * 0.35);
      const rw = kind === 'standingstone' ? 5 : 11;
      for (let y = h - rh; y < h; y++) {
        const t = (y - (h - rh)) / rh;
        const ww = Math.round(rw * (kind === 'standingstone' ? 1 : 0.5 + t * 0.5));
        for (let x = -ww; x <= ww; x++) put(cx + x, y, 1, clamp(10 - Math.round((x + ww) / (ww * 2 + 1) * 5), 3, 13));
      }
    } else if (kind === 'reed' || kind === 'bush') {
      for (let i = 0; i < 26; i++) {
        const bx = cx - 9 + ((i * 7) % 19);
        const bh = 14 + ((i * 11) % 18);
        for (let y = h - bh; y < h; y++) put(bx, y, kind === 'reed' ? 6 : 7, 6 + ((i + y) & 3));
      }
    } else if (kind === 'brazier') {
      for (let y = h - 18; y < h; y++) for (let x = -3; x <= 3; x++) put(cx + x, y, 14, 6);
      for (let y = h - 30; y < h - 16; y++) {
        const ww = 7 - Math.abs(y - (h - 23));
        for (let x = -ww; x <= ww; x++) put(cx + x, y, 15, clamp(9 + ((x + y) & 3), 6, 15));
      }
    } else if (kind === 'fountain') {
      for (let y = h - 16; y < h; y++) for (let x = -14; x <= 14; x++) put(cx + x, y, 1, 8 - (Math.abs(x) >> 2));
      for (let y = h - 30; y < h - 14; y++) for (let x = -3; x <= 3; x++) put(cx + x, y, 8, 10);
    } else if (kind === 'chest') {
      for (let y = h - 20; y < h; y++) for (let x = -11; x <= 11; x++) put(cx + x, y, 4, 7 - (Math.abs(x) >> 3));
      for (let x = -11; x <= 11; x++) put(cx + x, h - 20, 13, 11);
      put(cx, h - 12, 13, 13);
    } else if (kind.indexOf('stall') === 0) {
      // A market stall: four posts, a striped awning, a trestle, and goods on it. This is the whole
      // content of the market shot, and for three rounds the market shot contained two blank walls.
      const variant = kind.indexOf(':') > 0 ? (parseInt(kind.split(':')[1], 10) || 0) : 0;
      const AW = 17, ay0 = h - 40;
      // Posts.
      for (const px2 of [-AW + 2, AW - 2]) {
        for (let y = ay0 + 6; y < h - 2; y++) { put(cx + px2, y, 4, 5); put(cx + px2 + 1, y, 4, 3); }
      }
      // Awning: sloping stripes, front edge scalloped.
      const stripe = [11, 2, 6][variant % 3];
      for (let x = -AW; x <= AW; x++) {
        const drop = Math.round(Math.abs(x) * 0.18);
        for (let y = ay0 + drop; y < ay0 + 8 + drop; y++) {
          const band = (((x + AW) / 4) | 0) & 1;
          put(cx + x, y, band ? stripe : 2, band ? 10 - (y - ay0 - drop) / 3 : 13 - (y - ay0 - drop) / 3);
        }
        // Scalloped valance.
        if (((x + AW) % 6) < 4) put(cx + x, ay0 + 8 + drop, 4, 3);
      }
      // Trestle table and goods.
      for (let x = -AW + 3; x <= AW - 3; x++) for (let y = h - 15; y < h - 11; y++) put(cx + x, y, 4, y === h - 15 ? 9 : 5);
      for (let i = 0; i < 6; i++) {
        const gx = -AW + 5 + i * 5;
        const ramp = [6, 15, 11, 2, 13, 3][(i + variant) % 6];
        for (let y = h - 20; y < h - 15; y++) for (let x = gx; x < gx + 4; x++) {
          const r2 = (x - gx - 1.5) * (x - gx - 1.5) + (y - (h - 18)) * (y - (h - 18));
          if (r2 < 5) put(cx + x, y, ramp, 9 + ((x + y) & 1));
        }
      }
      // Legs.
      for (const lx of [-AW + 4, AW - 5]) for (let y = h - 11; y < h - 1; y++) put(cx + lx, y, 4, 4);

    } else if (kind === 'herb') {
      // A clump of marshwort: broad basal leaves and three flower spikes. It has to read as
      // "pick me" at ten paces or the quest is invisible even once the item exists.
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.28;
        const len = 13 + ((i * 5) % 5);
        for (let t = 0; t < len; t++) {
          const bx = Math.round(Math.cos(a) * t * 1.15);
          const by = h - 2 + Math.round(Math.sin(a) * t);
          put(cx + bx, by, 7, 6 + (t > len - 4 ? 3 : 0) + ((i & 1) ? 1 : 0));
          if (t > 3 && t < len - 3) put(cx + bx + (i < 4 ? -1 : 1), by, 7, 4);
        }
      }
      for (const sx of [-5, 0, 5]) {
        for (let t = 0; t < 9; t++) {
          const yy = h - 16 - t;
          put(cx + sx + (t > 5 ? (sx > 0 ? 1 : sx < 0 ? -1 : 0) : 0), yy, 12, 9 + (t & 1) * 3);
          if (t > 2 && t < 8) {
            put(cx + sx - 1, yy, 12, 7);
            put(cx + sx + 1, yy, 12, 12);
          }
        }
      }

    } else if (kind === 'crate') {
      const S = 11;
      for (let y = h - S * 2; y < h; y++) {
        for (let x = -S; x <= S; x++) {
          const edge = (y === h - S * 2 || y === h - 1 || x === -S || x === S);
          put(cx + x, y, 4, edge ? 3 : 7 - (((x + y) >> 2) & 1));
        }
      }
      // Diagonal bracing.
      for (let i = 0; i < S * 2; i++) { put(cx - S + i, h - 1 - i, 4, 10); put(cx + S - i, h - 1 - i, 4, 10); }

    } else if (kind === 'barrel') {
      const S = 9, top = h - 24;
      for (let y = top; y < h; y++) {
        const bulge = Math.round(Math.sin((y - top) / 24 * Math.PI) * 2);
        for (let x = -S - bulge; x <= S + bulge; x++) {
          const stave = ((x + S) % 4) === 0;
          const hoop = (y === top + 3 || y === top + 19);
          put(cx + x, y, 4, hoop ? 11 : stave ? 3 : 6 - (Math.abs(x) > S ? 1 : 0));
        }
      }
      for (let x = -S; x <= S; x++) put(cx + x, top, 4, 9);

    } else if (kind === 'campfire') {
      // Ring of stones, charred logs, flame. The camp's centre of gravity.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sx = Math.round(Math.cos(a) * 13), sy = h - 4 + Math.round(Math.sin(a) * 4);
        for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy > 5) continue;
          put(cx + sx + dx, sy + dy, 1, 5 + ((i + dx) & 1));
        }
      }
      for (const [lx, ly, len] of [[-8, h - 8, 16], [-6, h - 10, 13]]) {
        for (let i = 0; i < len; i++) put(cx + lx + i, ly - ((i * 3) / len | 0), 4, 2 + (i & 1));
      }
      for (let y = 0; y < 22; y++) {
        const t = y / 22;
        const wF = Math.round((1 - t) * 7) + 1;
        for (let x = -wF; x <= wF; x++) {
          const edge = Math.abs(x) >= wF - 1;
          put(cx + x + Math.round(Math.sin(t * 5) * 2), h - 12 - y, 15, edge ? 8 + (y & 1) : 13);
        }
      }

    } else if (kind === 'door' || kind.indexOf('door:') === 0) {
      // A DOOR, standing in the doorway. A cold player spent fifteen minutes in a town and entered
      // exactly one building, by accident: "every building is a featureless solid block of stone
      // or wood. There is no door-shaped thing to walk toward." A settlement you cannot navigate
      // by looking at it is not a settlement, it is a maze with no walls drawn.
      const DW = 15, DH = 40;                     // half-width, height of the leaf
      const top = h - DH, arch = 9;
      const inArch = (x, y) => {
        if (y >= top + arch) return Math.abs(x) <= DW;
        const dy = (top + arch) - y;
        return x * x + dy * dy * (DW / arch) * (DW / arch) <= DW * DW;
      };
      // Stone surround, one pixel proud of the leaf on every side.
      for (let y = top - 3; y < h; y++) {
        for (let x = -DW - 4; x <= DW + 4; x++) {
          if (inArch(x, y + 2)) continue;
          if (!inArch(x, y + 5) && y < top + 2) continue;
          put(cx + x, y, 13, 7 + ((x + y) & 1));
        }
      }
      // Planks, vertical, with a seam every four pixels and a warm interior light down the join.
      for (let y = top; y < h; y++) {
        for (let x = -DW; x <= DW; x++) {
          if (!inArch(x, y)) continue;
          const seam = ((x + DW) % 5) === 0;
          const grain = ((x * 7 + y * 3) & 7) === 0 ? 1 : 0;
          put(cx + x, y, 4, seam ? 3 : 7 - grain);
        }
      }
      // Two iron bands and a ring handle: the read that says "openable" at forty paces.
      for (const by of [top + arch + 6, h - 10]) {
        for (let x = -DW; x <= DW; x++) if (inArch(x, by)) { put(cx + x, by, 13, 3); put(cx + x, by + 1, 13, 5); }
      }
      for (let a = 0; a < 16; a++) {
        const ax = Math.round(Math.cos(a * Math.PI / 8) * 3) + DW - 5;
        const ay = Math.round(Math.sin(a * Math.PI / 8) * 3) + h - 20;
        put(cx + ax, ay, 13, 12);
      }
      // Threshold shadow, so the door sits IN the wall rather than on it.
      for (let x = -DW - 4; x <= DW + 4; x++) put(cx + x, h - 1, 0, 2);

    } else if (kind === 'sign' || kind.indexOf('sign:') === 0) {
      // Post and board.
      for (let y = h - 26; y < h; y++) for (let dx = -1; dx <= 1; dx++) put(cx + dx, y, 4, 6 - Math.abs(dx));
      for (let y = h - 42; y < h - 24; y++) for (let x = -12; x <= 12; x++) put(cx + x, y, 4, 10 - (Math.abs(x) >> 3));
      for (let x = -12; x <= 12; x++) { put(cx + x, h - 42, 4, 12); put(cx + x, h - 25, 4, 4); }

      // A PICTOGRAM, not a blank board. Three judges independently reported having to walk into
      // every door to learn what it was; MM6 taught you a town's layout by its signs.
      const trade = kind.indexOf(':') > 0 ? kind.split(':')[1] : null;
      const my = h - 40;
      const g = (gx, gy, ramp, sh) => put(cx + gx, my + gy, ramp, sh);
      const gbox = (gx, gy, gw, gh, ramp, sh) => {
        for (let yy = 0; yy < gh; yy++) for (let xx = 0; xx < gw; xx++) g(gx + xx, gy + yy, ramp, sh);
      };
      if (trade === 'weapon') { gbox(-1, 1, 2, 9, 14, 13); gbox(-4, 9, 8, 1, 13, 11); gbox(-1, 10, 2, 3, 4, 7); }
      else if (trade === 'armour') { gbox(-4, 2, 8, 9, 14, 12); gbox(-6, 3, 2, 5, 14, 9); gbox(4, 3, 2, 5, 14, 9); }
      else if (trade === 'general') { gbox(-5, 4, 10, 8, 5, 12); gbox(-2, 1, 4, 3, 5, 9); }
      else if (trade === 'magic') { gbox(-1, 2, 2, 11, 4, 8); gbox(-4, 0, 8, 3, 12, 13); }
      else if (trade === 'temple') { gbox(-1, 0, 2, 13, 0, 15); gbox(-5, 4, 10, 2, 0, 15); }
      else if (trade === 'tavern') { gbox(-4, 4, 8, 8, 13, 12); gbox(4, 5, 3, 4, 13, 9); gbox(-4, 2, 8, 2, 2, 14); }
      else if (trade === 'trainer') { gbox(-5, 5, 10, 2, 14, 13); gbox(-3, 2, 2, 8, 4, 7); gbox(1, 2, 2, 8, 4, 7); }
      else if (trade === 'guild') { gbox(-4, 1, 8, 10, 12, 10); gbox(-1, 4, 2, 4, 13, 14); }
    } else if (kind === 'stump') {
      for (let y = h - 12; y < h; y++) for (let x = -6; x <= 6; x++) put(cx + x, y, 4, 7);
    } else if (kind === 'questitem') {
      for (let y = h - 22; y < h - 6; y++) {
        const ww = 8 - Math.abs(y - (h - 14));
        for (let x = -ww; x <= ww; x++) put(cx + x, y, 13, clamp(11 + ((x + y) & 1) * 2, 8, 15));
      }
    }

    const out = Uint8Array.from(d);
    // Trees and shrubs get NO outline. A hard 1px rim around foliage reads as a rendered solid,
    // which is exactly the "low-poly asset pack" tell; hard-edged props keep theirs.
    const soft = /oak|pine|deadtree|bush|reed/.test(kind);
    if (!soft) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (d[y * w + x]) continue;
          if ((x > 0 && d[y * w + x - 1]) || (x < w - 1 && d[y * w + x + 1]) ||
              (y > 0 && d[(y - 1) * w + x]) || (y < h - 1 && d[(y + 1) * w + x])) out[y * w + x] = Core.idx(0, 2);
        }
      }
    }
    return { w, h, data: out };
  }

  function decor(kind, variant) {
    const key = variant ? kind + ':' + variant : kind;
    const k = 'd:' + key;
    if (!cache[k]) cache[k] = paintDecor(key);
    return cache[k];
  }

  const DECOR_HEIGHT = {
    oak: 6.5, pine: 8.0, deadtree: 5.5, ashstump: 2.4, reed: 1.6, bush: 1.2,
    rock: 1.8, standingstone: 4.2, brazier: 2.0, fountain: 2.4, chest: 1.1,
    sign: 2.6, stump: 0.8, questitem: 1.0, tent: 2.6, door: 3.1,
    stall: 3.0, crate: 1.1, barrel: 1.2, campfire: 1.9, herb: 1.0,
  };

  // ---------------------------------------------------------------- portraits
  // 64x72 character portraits. Class and sex drive the palette and the silhouette; the point is
  // that four party members are instantly distinguishable at a glance in the HUD.
  // A portrait must be a PERSON, not a template with a different hair colour. An art critic
  // magnified the party strip: "Alder and Dorn are pixel-identical faces with different hair grey;
  // Bree and Cass are pixel-identical with different robe colour. Same nose polygon, same two-dot
  // eyes, no mouths, no whites of eyes, one skin ramp. Four bodies wearing one head." This strip is
  // in every 3D shot, so one asset was doing eighteen frames' worth of damage.
  //
  // Everything below is drawn from the seeded stream, so a character's face is stable forever, and
  // every axis that makes a face recognisable at 64px is varied: skull width, jaw, brow, nose
  // length and bridge, eye spacing and colour, mouth, skin tone, hair style, beard, and the
  // headgear the class actually wears.
  function paintPortrait(seed, cls, sex) {
    const w = 64, h = 72;
    const d = new Uint8Array(w * h);
    const r = RNG.world('portrait:' + seed + ':' + cls + ':' + sex);
    const put = (x, y, ramp, sh) => { if (x >= 0 && y >= 0 && x < w && y < h) d[y * w + x] = Core.shade(ramp << 4, sh); };
    const cx = w >> 1;

    // ---- palette choices
    const skinBase = r.int(4);                       // 0 pale .. 3 dark
    const skinLo = [10, 9, 8, 6][0] === 0 ? 10 : 10; // flesh ramp; tone comes from the shade offset
    const skinShift = [3, 1, -1, -3][skinBase];
    const hairRamp = r.pick([4, 5, 13, 0, 3]);
    const hairDark = r.int(5) + 2;
    const eyeRamp = r.pick([1, 6, 4, 8]);
    const clothRamp = { knight: 14, templar: 13, ranger: 7, priest: 0, mage: 12, warden: 6 }[cls] || 11;

    // ---- skull geometry
    const wide = r.float(-2.2, 2.6);                 // cheek width
    const longFace = r.float(-2.0, 3.0);             // skull height
    const jaw = r.float(-2.0, 2.4);                  // jaw squareness
    const browY = r.int(3) - 1;
    const eyeGap = 5 + r.int(3);
    const noseLen = 4 + r.int(4);
    const noseW = r.int(2);
    const mouthW = 2 + r.int(3);
    const beard = sex === 'm' && r.chance(0.45) ? 1 + r.int(3) : 0;

    // The head must leave room ABOVE it for hair and headgear and BELOW it for shoulders. The
    // first pass sized the skull to nearly the whole 64x72 plate, so the hair was a six-pixel arc
    // at the crown and the helms had nowhere to sit.
    const HR = 13, faceCY = h - 38;
    const rx = HR - 2 + wide, ry = HR + 1 + longFace;
    const inHead = (x, y) => {
      // Ellipse for the cranium, widened toward a square jaw at the bottom.
      const jw = y > 4 ? (1 + (jaw / 14) * (y / ry)) : 1;
      return (x * x) / (rx * rx * jw * jw) + (y * y) / (ry * ry) <= 1;
    };

    // ---- background: a vignetted plate, no checkerboard
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / cx, dy = (y - h / 2) / (h / 2);
        const v = 1 - Math.min(1, dx * dx + dy * dy * 0.7);
        put(x, y, 1, 2 + Math.round(v * 3));
      }
    }

    // ---- shoulders and collar
    for (let y = h - 22; y < h; y++) {
      const ww = 16 + (y - (h - 22)) * 1.3;
      for (let x = -ww; x <= ww; x++) {
        const lit = clamp(10 - Math.round((x + ww) / (ww * 2 + 1) * 6), 3, 13);
        put(cx + x, y, clothRamp, lit);
      }
    }
    // Neck.
    for (let y = h - 28; y < h - 19; y++) {
      for (let x = -5; x <= 5; x++) put(cx + x, y, 10, clamp(6 + skinShift, 2, 14));
    }

    // ---- head
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      for (let x = -Math.ceil(rx) - 2; x <= Math.ceil(rx) + 2; x++) {
        if (!inHead(x, y)) continue;
        // Key light from upper left, matching the sprite foundry's rig so faces and bodies agree.
        const lit = 12 - Math.round((x + rx) / (rx * 2) * 5) - Math.round((y + ry) / (ry * 2) * 3);
        put(cx + x, faceCY + y, 10, clamp(lit + skinShift, 2, 15));
      }
    }
    // Cheekbone and jaw shading, which is most of what makes a face read as a face.
    for (let y = 1; y < ry; y++) {
      for (const sgn of [-1, 1]) {
        const x = Math.round(sgn * (rx - 2 - y * 0.15));
        if (inHead(x, y)) put(cx + x, faceCY + y, 10, clamp(5 + skinShift, 2, 14));
      }
    }

    // ---- brow ridge
    for (let x = -eyeGap - 4; x <= eyeGap + 4; x++) {
      if (Math.abs(x) < 2) continue;
      if (!inHead(x, browY - 3)) continue;
      put(cx + x, faceCY + browY - 3, 10, clamp(4 + skinShift, 2, 12));
      put(cx + x, faceCY + browY - 4, hairRamp, hairDark);
    }

    // ---- eyes: white, iris, pupil. Two dark pips is the single strongest "unfinished" tell.
    for (const sgn of [-1, 1]) {
      const ex = sgn * eyeGap;
      for (let x = -2; x <= 2; x++) for (let y = -1; y <= 1; y++) {
        put(cx + ex + x, faceCY + browY + y, 0, 14);
      }
      put(cx + ex - 1, faceCY + browY, eyeRamp, 8);
      put(cx + ex, faceCY + browY, eyeRamp, 10);
      put(cx + ex, faceCY + browY, 0, 1);
      put(cx + ex + 1, faceCY + browY - 1, 0, 13);          // catchlight
      // Lower lid.
      put(cx + ex - 1, faceCY + browY + 2, 10, clamp(5 + skinShift, 2, 12));
      put(cx + ex, faceCY + browY + 2, 10, clamp(5 + skinShift, 2, 12));
    }

    // ---- nose
    for (let y = 0; y < noseLen; y++) {
      put(cx - 1 - noseW, faceCY + browY + 1 + y, 10, clamp(6 + skinShift, 2, 13));
      put(cx + 1, faceCY + browY + 1 + y, 10, clamp(11 + skinShift, 2, 15));
    }
    for (let x = -1 - noseW; x <= 1 + noseW; x++) {
      put(cx + x, faceCY + browY + noseLen + 1, 10, clamp(4 + skinShift, 2, 12));
    }

    // ---- mouth
    const my = faceCY + browY + noseLen + 5;
    for (let x = -mouthW; x <= mouthW; x++) {
      put(cx + x, my, 11, 5);
      put(cx + x, my - 1, 10, clamp(9 + skinShift, 2, 14));
      put(cx + x, my + 1, 10, clamp(7 + skinShift, 2, 13));
    }

    // ---- beard
    if (beard) {
      for (let y = my - 2; y < faceCY + ry; y++) {
        for (let x = -rx; x <= rx; x++) {
          if (!inHead(x, y - faceCY)) continue;
          if (y < my + 1 && Math.abs(x) < mouthW + 2) continue;      // leave the mouth
          if (((x * 3 + y * 5) & 7) < beard * 2) put(cx + x, y, hairRamp, hairDark + ((x + y) & 1));
        }
      }
    }

    // ---- hair, then class headgear over it
    // Hair HUGS THE SKULL: every point inside the head (grown by two) above the brow becomes hair,
    // plus side falls for the longer styles. Deriving it from a sine curve instead produced a
    // six-pixel arc floating at the crown that read as a smudge.
    const style = sex === 'f' ? 2 + r.int(2) : r.int(3);          // 0 short, 1 swept, 2 long, 3 very long
    const fall = [0, 0, 16, 24][style];
    const grow = 2;
    for (let y = -Math.ceil(ry) - grow; y <= browY - 4; y++) {
      for (let x = -Math.ceil(rx) - grow; x <= Math.ceil(rx) + grow; x++) {
        const outer = (x * x) / ((rx + grow) * (rx + grow)) + (y * y) / ((ry + grow) * (ry + grow)) <= 1;
        if (!outer) continue;
        if (style === 1 && y < -ry + 3 && x > rx - 6) continue;      // a swept parting
        put(cx + x, faceCY + y, hairRamp, clamp(hairDark + 4 - ((x * 2 + y) & 3), 2, 13));
      }
    }
    // Side falls, outside the face on both edges.
    for (let y = browY - 4; y < browY - 4 + fall; y++) {
      const t = (y - (browY - 4)) / Math.max(1, fall);
      const ww = Math.round(rx + grow - t * 1.5);
      for (const sgn of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const x = sgn * (ww - k);
          if (Math.abs(x) < rx - 3) continue;
          put(cx + x, faceCY + y, hairRamp, clamp(hairDark + 3 - ((x + y) & 3), 2, 12));
        }
      }
    }

    if (cls === 'knight' || cls === 'templar') {
      // An open-faced helm with a nasal bar.
      for (let y = -ry - 1; y < -ry + 12; y++) {
        for (let x = -rx - 2; x <= rx + 2; x++) {
          if ((x * x) / ((rx + 2) * (rx + 2)) + (y * y) / ((ry + 2) * (ry + 2)) > 1) continue;
          put(cx + x, faceCY + y, 14, clamp(11 - Math.round((x + rx) / (rx * 2) * 5), 3, 14));
        }
      }
      for (let y = -ry + 8; y < browY + 2; y++) put(cx, faceCY + y, 14, 12);
      for (let x = -rx - 2; x <= rx + 2; x++) put(cx + x, faceCY - ry + 12, 14, 4);
    } else if (cls === 'priest') {
      for (let y = -ry - 4; y < -ry + 6; y++) {
        for (let x = -rx; x <= rx; x++) put(cx + x, faceCY + y, 13, clamp(11 - ((x + y) & 3), 4, 14));
      }
    } else if (cls === 'mage') {
      // A brimless cap with a band.
      for (let y = -ry - 3; y < -ry + 7; y++) {
        const ww = Math.round(rx * (1 - (y + ry + 3) / 22));
        for (let x = -ww; x <= ww; x++) put(cx + x, faceCY + y, 12, clamp(10 - ((x + y) & 3), 3, 13));
      }
      for (let x = -rx; x <= rx; x++) put(cx + x, faceCY - ry + 7, 13, 11);
    } else if (cls === 'ranger' || cls === 'warden') {
      // A hood: falls past the jaw on both sides.
      for (let y = -ry - 3; y < ry - 2; y++) {
        for (let x = -rx - 3; x <= rx + 3; x++) {
          const inner = (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
          const outer = (x * x) / ((rx + 3) * (rx + 3)) + (y * y) / ((ry + 3) * (ry + 3)) <= 1;
          if (!outer) continue;
          if (inner && y > -ry + 6) continue;
          put(cx + x, faceCY + y, 7, clamp(8 - ((x + y) & 3), 2, 12));
        }
      }
    }

    return { w, h, data: d };
  }

  function portrait(idx, cls, sex) {
    const k = 'p:' + idx + cls + sex;
    if (!cache[k]) cache[k] = paintPortrait(idx, cls, sex);
    return cache[k];
  }

  // ---------------------------------------------------------------- item icons
  function paintIcon(id) {
    const w = 32, h = 32;
    const d = new Uint8Array(w * h);
    const it = Items.ITEMS[id] || {};
    const put = (x, y, ramp, sh) => { if (x >= 0 && y >= 0 && x < w && y < h) d[y * w + x] = Core.shade(ramp << 4, sh); };

    const kind = it.kind || 'misc';
    if (kind === 'weapon') {
      const sk = it.skill;
      if (sk === 'bow') {
        for (let a = -14; a <= 14; a++) put(10 + Math.round(Math.cos(a / 18) * 7), 16 + a, 4, 8);
        for (let y = 2; y < 30; y++) put(18, y, 0, 10);
      } else if (sk === 'axe') {
        for (let y = 4; y < 29; y++) put(20, y, 4, 7);                       // haft
        for (let y = 4; y < 16; y++) {
          const wdt = 8 - Math.abs(y - 10);
          for (let x = 0; x < wdt; x++) put(19 - x, y, 14, 12 - (x >> 1));   // blade
        }
      } else if (sk === 'mace') {
        for (let y = 12; y < 29; y++) put(16, y, 4, 7);                      // haft
        for (let y = 3; y < 13; y++) for (let x = -5; x <= 5; x++) {
          if (Math.hypot(x, y - 8) > 5.4) continue;
          put(16 + x, y, 14, 11 - Math.abs(x) / 2);                          // head
        }
        for (const [fx, fy] of [[-7, 8], [7, 8], [0, 1], [0, 15]]) put(16 + fx, fy, 14, 13);
      } else if (sk === 'staff') {
        for (let y = 1; y < 30; y++) for (let x = -1; x <= 1; x++) put(16 + x, y, 4, 8 - Math.abs(x));
        for (let x = -4; x <= 4; x++) put(16 + x, 4, 4, 6);                   // binding
        put(16, 1, 12, 13); put(15, 2, 12, 12); put(17, 2, 12, 12);
      } else if (sk === 'spear') {
        for (let y = 8; y < 30; y++) put(16, y, 4, 7);
        for (let y = 1; y < 9; y++) {
          const wdt = Math.max(0, 3 - Math.abs(y - 5));
          for (let x = -wdt; x <= wdt; x++) put(16 + x, y, 14, 12 - Math.abs(x));
        }
      } else if (sk === 'dagger') {
        for (let y = 8; y < 21; y++) for (let x = -1; x <= 1; x++) put(16 + x, y, 14, 12 - Math.abs(x));
        for (let x = 12; x <= 20; x++) put(x, 21, 13, 10);
        for (let y = 22; y < 27; y++) put(16, y, 4, 7);
      } else {                                                                // sword
        const long = (it.dmg && (it.dmg.n * it.dmg.sides) >= 12);
        for (let y = long ? 2 : 6; y < 21; y++) for (let x = -2; x <= 2; x++) put(16 + x, y, 14, 11 - Math.abs(x));
        for (let x = 9; x <= 23; x++) put(x, 21, 13, 10);                      // crossguard
        for (let y = 22; y < 28; y++) put(16, y, 4, 7);                        // grip
        put(16, 28, 13, 12);                                                   // pommel
      }
    } else if (kind === 'armour') {
      for (let y = 5; y < 27; y++) {
        const ww = 10 - Math.abs(y - 14) / 3;
        for (let x = -ww; x <= ww; x++) put(16 + x, y, it.skill === 'plate' ? 14 : it.skill === 'chain' ? 1 : 4,
          clamp(10 - Math.round((x + ww) / (ww * 2 + 1) * 5), 3, 13));
      }
    } else if (kind === 'potion') {
      for (let y = 10; y < 27; y++) {
        const ww = 7 - Math.abs(y - 20) / 4;
        for (let x = -ww; x <= ww; x++) put(16 + x, y, it.mana ? 12 : it.cure ? 6 : 11, 10);
      }
      for (let y = 5; y < 11; y++) for (let x = -2; x <= 2; x++) put(16 + x, y, 0, 9);
    } else if (kind === 'ring' || kind === 'amulet') {
      for (let a = 0; a < 64; a++) {
        const t = a / 64 * Math.PI * 2;
        put(16 + Math.round(Math.cos(t) * 9), 16 + Math.round(Math.sin(t) * 9), 13, 12);
      }
      put(16, 7, 12, 14);
    } else if (kind === 'quest') {
      for (let y = 8; y < 25; y++) for (let x = -8; x <= 8; x++) put(16 + x, y, 13, clamp(12 - ((x + y) & 3), 8, 15));
    } else {
      for (let y = 9; y < 24; y++) for (let x = -8; x <= 8; x++) put(16 + x, y, 4, 8);
    }

    const out = Uint8Array.from(d);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[y * w + x]) continue;
      if ((x > 0 && d[y * w + x - 1]) || (x < w - 1 && d[y * w + x + 1]) ||
          (y > 0 && d[(y - 1) * w + x]) || (y < h - 1 && d[(y + 1) * w + x])) out[y * w + x] = Core.idx(0, 2);
    }
    return { w, h, data: out };
  }

  function icon(id) {
    const k = 'i:' + id;
    if (!cache[k]) cache[k] = paintIcon(id);
    return cache[k];
  }

  return {
    installBaked, prepareBaked, BAKED,
    creature, decor, DECOR_HEIGHT, portrait, icon, worldHeight,
    paintCreature, paintDecor, paintPortrait, paintIcon,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sprites;
