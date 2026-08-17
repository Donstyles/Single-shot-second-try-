// 06_art.js — procedural textures, sky, font, UI ornament, and the texel functions the renderer
// calls every step of every column.
// Owner: art. Calls Core.
//
// Everything here is generated once at boot from LAYOUT streams and cached. Baked assets from
// assets/tex override the procedural version when present, which is how the art pass upgrades the
// game without the engine changing at all.

const Art = (() => {
  'use strict';

  const { clamp, lerp, RNG, Clock } = Core;

  const TS = 64;          // procedural texture edge; baked textures may be 128
  const TMASK = TS - 1;

  // ---------------------------------------------------------------- font
  // 5x7, column-major, bit 0 = top row. Drawn at integer scale so it stays crisp when the 800x480
  // framebuffer is letterboxed onto a phone.
  const FONT_HEX =
    '0000000000|00005F0000|0007000700|147F147F14|242A7F2A12|2313086462|3649552250|0005030000|' +
    '001C224100|0041221C00|14083E0814|08083E0808|0000503000|0808080808|0000606000|2010080402|' +
    '3E5149453E|00427F4000|4261514946|2141454B31|1814127F10|2745454539|3C4A494930|0171090503|' +
    '3649494936|064949291E|0036360000|0056360000|0814224100|1414141414|0041221408|0201510906|' +
    '324979413E|7E1111117E|7F49494936|3E41414122|7F4141221C|7F49494941|7F09090901|3E4149497A|' +
    '7F0808087F|00417F4100|2040413F01|7F08142241|7F40404040|7F020C027F|7F04081  07F|3E4141413E|' +
    '7F09090906|3E4151215E|7F09192946|4649494931|01017F0101|3F4040403F|1F2040201F|3F40384 03F|' +
    '6314081463|0708700807|6151494543|007F414100|0204081020|0041417F00|0402010204|4040404040|' +
    '0001020400|2054545478|7F48444438|3844444420|384444487F|3854545418|087E090102|0C5252523E|' +
    '7F08040478|00447D4000|204044 3D00|7F10284400|00417F4000|7C04180478|7C08040478|3844444438|' +
    '7C14141408|081414187C|7C08040408|4854545420|043F444020|3C4040207C|1C2040201C|3C4030403C|' +
    '4428102844|0C5050503C|4464544C44|0008364100|00007F0000|0041360800|0804081008';

  // Glyphs that MUST descend below the baseline, written row-major because that is the only way to
  // author a descender legibly. Rows 0-6 are the body, rows 7-8 the tail.
  const DESCENDERS = {
    g: ['.....', '.....', '.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
    p: ['.....', '.....', '####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    q: ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#', '....#', '....#'],
    y: ['.....', '.....', '#...#', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
    j: ['..#..', '.....', '..#..', '..#..', '..#..', '..#..', '..#..', '#.#..', '.##..'],
    ',': ['.....', '.....', '.....', '.....', '.....', '.....', '..##.', '..#..', '.#...'],
    ';': ['.....', '.....', '..##.', '..##.', '.....', '..##.', '..##.', '..#..', '.#...'],
    // 'm' with no shoulder join reads as three separate strokes: "Thornnnarch".
    m: ['.....', '.....', '##.##', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '.....', '.....'],
    // 'Q' needs its tail to be distinguishable from 'O' at phone size.
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#', '.....', '.....'],

    // Letters the stock 5x7 table renders ambiguously at 1x, each one caught by a critic reading
    // the game's own words back wrong. The party's first character was printed "Rlder" and the
    // town "IIarrowgate": a flat-topped A with a mid-height bar IS an R at this size, and an H
    // whose crossbar shares a row with nothing else disappears into two bars.
    A: ['..#..', '.###.', '#...#', '#...#', '#####', '#...#', '#...#', '.....', '.....'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#', '.....', '.....'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#', '.....', '.....'],
    N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#', '.....', '.....'],
    // V and W squared off into U and UU; both need their diagonals to actually converge.
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..', '.....', '.....'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#', '.....', '.....'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.', '.....', '.....'],
    // Lowercase 'o' was open at the top, so "Dorn" read "Durn".
    o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.', '.....', '.....'],
    // 'w' collapsed toward 'u' — same fix as the capital.
    w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.', '.....', '.....'],
    // 'n' lost its right leg at the baseline.
    n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#', '.....', '.....'],
  };

  const GLYPH_H = 9;

  // 5 columns per glyph, 9 bits each (bit 0 = top row).
  const FONT = (() => {
    const parts = FONT_HEX.replace(/\s/g, '').split('|');
    const out = new Uint16Array(parts.length * 5);
    for (let i = 0; i < parts.length; i++) {
      for (let c = 0; c < 5; c++) out[i * 5 + c] = parseInt(parts[i].substr(c * 2, 2), 16) || 0;
    }
    // Overwrite the glyphs that need a descender or a better join.
    for (const ch of Object.keys(DESCENDERS)) {
      const idx = ch.charCodeAt(0) - 32;
      const rows = DESCENDERS[ch];
      for (let c = 0; c < 5; c++) {
        let bits = 0;
        for (let r = 0; r < GLYPH_H; r++) if (rows[r][c] === '#') bits |= (1 << r);
        out[idx * 5 + c] = bits;
      }
    }
    return out;
  })();

  // PROPORTIONAL advance per glyph: ink width plus one column of side bearing. Fixed-pitch text is
  // the other half of why the log read as a terminal rather than as a game.
  const ADVANCE = (() => {
    const adv = new Uint8Array(FONT.length / 5);
    for (let i = 0; i < adv.length; i++) {
      let last = -1;
      for (let c = 0; c < 5; c++) if (FONT[i * 5 + c]) last = c;
      // Space keeps a real width; everything else is trimmed to its ink.
      adv[i] = last < 0 ? 3 : last + 2;
    }
    return adv;
  })();

  const CH_W = 6, CH_H = 10;

  function charCols(ch) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return -1;
    return (code - 32) * 5;
  }

  function text(E, x, y, str, pi, scale) {
    const s = scale || 1;
    let cx = x;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      const gi = (code < 32 || code > 126) ? -1 : code - 32;
      if (gi >= 0) {
        const o = gi * 5;
        for (let c = 0; c < 5; c++) {
          const bits = FONT[o + c];
          if (!bits) continue;
          for (let r = 0; r < GLYPH_H; r++) {
            if (!(bits & (1 << r))) continue;
            if (s === 1) E.px(cx + c, y + r, pi);
            else E.rect(cx + c * s, y + r * s, s, s, pi);
          }
        }
        cx += ADVANCE[gi] * s;
      } else cx += 4 * s;
    }
    return cx - x;
  }

  function textWidth(str, scale) {
    const s = scale || 1;
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      w += (code < 32 || code > 126) ? 4 * s : ADVANCE[code - 32] * s;
    }
    return w;
  }

  // Text with a 1px dark drop, which is what makes light type survive on a busy background.
  function textShadow(E, x, y, str, pi, scale) {
    text(E, x + (scale || 1), y + (scale || 1), str, Core.idx(0, 1), scale);
    return text(E, x, y, str, pi, scale);
  }

  function textCentred(E, cx, y, str, pi, scale) {
    return text(E, Math.round(cx - textWidth(str, scale) / 2), y, str, pi, scale);
  }

  // Centred AND shadowed. Numerals printed over a coloured bar need both or they vanish into it.
  function textCentredShadow(E, cx, y, str, pi, scale) {
    const x = Math.round(cx - textWidth(str, scale) / 2);
    return textShadow(E, x, y, str, pi, scale);
  }

  // ---------------------------------------------------------------- textures
  const TEX = Object.create(null);
  const BAKED = Object.create(null);

  function noise2(x, y, seed) {
    return World.vnoise(x, y, seed);
  }

  // Build a 64x64 indexed texture for a material. Structure first, grain second: a wall reads as
  // masonry because of its COURSES, not because of its noise.
  function makeTexture(mat, ramp, seed) {
    const t = new Uint8Array(TS * TS);
    const r = RNG.world('tex:' + mat);
    const M = World.MAT;

    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        let shade = 8;
        const n = noise2(x / 7, y / 7, seed) * 2 - 1;
        const fine = noise2(x / 2.2, y / 2.2, seed + 91) * 2 - 1;

        if (mat === M.stonewall || mat === M.ruin || mat === M.plaza || mat === M.marble) {
          // Ashlar courses: 16px high, offset every other row, 2px mortar.
          const course = Math.floor(y / 16);
          const off = (course & 1) ? 12 : 0;
          const bx = (x + off) % 24, by = y % 16;
          const joint = bx < 2 || by < 2;
          shade = joint ? 4 : 9 + n * 2.2 + fine * 0.8;
          if (!joint && (bx === 2 || by === 2)) shade += 2;         // lit top-left chamfer
          if (!joint && (bx === 23 || by === 15)) shade -= 1.5;
          if (mat === M.marble) shade += 2 + noise2(x / 18, y / 4, seed) * 3;
        } else if (mat === M.brickwall) {
          const course = Math.floor(y / 8);
          const off = (course & 1) ? 6 : 0;
          const bx = (x + off) % 12, by = y % 8;
          const joint = bx < 1 || by < 1;
          shade = joint ? 4 : 9 + n * 1.6;
        } else if (mat === M.timberwall || mat === M.wood || mat === M.palisade) {
          // Vertical planks with a seam every 8px and long grain.
          const plank = Math.floor(x / 8);
          const seam = (x % 8) === 0;
          shade = seam ? 4 : 8 + noise2(x / 1.4, y / 14, seed + plank * 13) * 4;
        } else if (mat === M.plaster) {
          shade = 11 + n * 1.4 + fine * 0.6;
          if (y > TS - 10) shade -= 2;                              // damp at the base
        } else if (mat === M.cliff || mat === M.rock || mat === M.obsidian) {
          const b = noise2(x / 5, y / 9, seed) * 2 - 1;
          shade = 7 + b * 4 + fine * 1.2;
        } else if (mat === M.grass || mat === M.moss) {
          shade = 8 + n * 2.4 + fine * 1.6;
        } else if (mat === M.road || mat === M.dirt || mat === M.gravel) {
          shade = 8 + n * 1.8 + fine * 2.2;
        } else if (mat === M.sand) {
          shade = 11 + n * 1.2 + fine * 0.8;
        } else if (mat === M.snow || mat === M.ice) {
          shade = 13 + n * 1.6;
        } else if (mat === M.water) {
          shade = 7 + Math.sin(x / 5) * 1.2 + n * 1.6;
        } else if (mat === M.marsh) {
          shade = 6 + n * 3;
        } else if (mat === M.ash) {
          shade = 5 + n * 2.6 + fine * 1.2;
        } else if (mat === M.tile) {
          const bx = x % 16, by = y % 16;
          shade = (bx < 1 || by < 1) ? 4 : 9 + n * 1.2;
        } else {
          shade = 8 + n * 2;
        }

        t[y * TS + x] = Core.shade(ramp << 4, Math.round(shade));
      }
    }
    return t;
  }

  function texFor(mat) {
    if (BAKED[mat]) return BAKED[mat];
    let t = TEX[mat];
    if (!t) {
      const ramp = World.MAT_RAMP[mat] === undefined ? 1 : World.MAT_RAMP[mat];
      t = TEX[mat] = makeTexture(mat, ramp, Core.hashStr('m' + mat) & 0xffff);
    }
    return t;
  }

  // ---------------------------------------------------------------- mips
  // Box-filtered pyramid, built lazily per texture. Averaging PALETTE INDICES is meaningless, so
  // each level averages the RGB the indices stand for and re-quantises through the same palette.
  const MIPS = new Map();

  function mipsFor(mat) {
    let m = MIPS.get(mat);
    if (m) return m;
    const base = texFor(mat);
    const S = base.size || TS;
    m = [base];
    let cur = base, size = S;
    while (size > 8) {
      const half = size >> 1;
      const next = new Uint8Array(half * half);
      for (let y = 0; y < half; y++) {
        for (let x = 0; x < half; x++) {
          let r = 0, g = 0, b = 0;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const pi = cur[(y * 2 + dy) * size + (x * 2 + dx)];
              r += Core.PAL[pi * 3]; g += Core.PAL[pi * 3 + 1]; b += Core.PAL[pi * 3 + 2];
            }
          }
          next[y * half + x] = Core.palIdx(r >> 2, g >> 2, b >> 2);
        }
      }
      next.size = half;
      m.push(next);
      cur = next; size = half;
    }
    MIPS.set(mat, m);
    return m;
  }

  // Which mip level a sample at this distance should use. Roughly one level per doubling.
  function lodFor(dist) {
    if (dist < 6) return 0;
    if (dist < 12) return 1;
    if (dist < 24) return 2;
    if (dist < 48) return 3;
    return 4;
  }

  function levelOf(mat, lod) {
    const m = mipsFor(mat);
    return m[lod < m.length ? lod : m.length - 1];
  }

  // Baked textures are indexed PNGs decoded at boot. They REPLACE the procedural version for that
  // material and nothing else in the engine changes — which is the whole point of routing every
  // texel through texFor().
  function installBaked(mat, indices, size) {
    BAKED[mat] = indices;
    BAKED[mat].size = size;
    MIPS.delete(mat);   // a stale pyramid would keep showing the procedural texture at distance
  }

  // Decode every embedded texture. Index recovery works because the build writes the game palette
  // into each PNG's PLTE, so a decoded RGB maps back to exactly one index.
  async function installBakedTextures(blob) {
    if (!blob || !blob.tex) return 0;
    let n = 0;
    for (const name of Object.keys(blob.tex)) {
      const mat = World.MAT[name];
      if (mat === undefined) continue;
      const img = new Image();
      try {
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + blob.tex[name]; });
      } catch (e) { continue; }
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      const idx = new Uint8Array(img.width * img.height);
      for (let i = 0, p = 0; i < idx.length; i++, p += 4) idx[i] = Core.palIdx(d[p], d[p + 1], d[p + 2]);
      installBaked(mat, idx, img.width);
      n++;
    }
    return n;
  }

  const texSize = (t) => t.size || TS;

  // ---- the two functions the march calls in its innermost loop
  // Texture scale is a WORLD measurement: two tiles per cell on the ground, one per storey on a
  // wall. `lod` picks the mip so distant samples do not alias into same-scale noise.
  function groundTexel(mat, wx, wy, map, lod) {
    const t = levelOf(mat, lod || 0);
    const S = t.size || TS, Mk = S - 1;
    const u = (((wx * 2 * S) | 0) + (S << 6)) & Mk;
    const v = (((wy * 2 * S) | 0) + (S << 6)) & Mk;
    return t[v * S + u];
  }

  function wallTexel(mat, u, v, face, lod) {
    const t = levelOf(mat, lod || 0);
    const S = t.size || TS, Mk = S - 1;
    // `& Mk` on a negative value does not wrap the way a modulo would, and v goes negative above
    // the party's eye line. Bias into positive space first.
    const ui = (((u * S) | 0) + (S << 6)) & Mk;
    const vi = (((v * S) | 0) + (S << 6)) & Mk;
    return t[vi * S + ui];
  }

  // Slope shading from the terrain gradient against the key direction (upper-left, matching the
  // sprite rig). Hills read as hills because of this and almost nothing else.
  function slopeShade(map, wx, wy) {
    const h0 = World.H(map, wx, wy);
    const hx = World.H(map, wx + 0.9, wy) - h0;
    const hy = World.H(map, wx, wy + 0.9) - h0;
    return clamp(Math.round((-hx * 1.6 - hy * 1.1)), -4, 4);
  }

  // ---------------------------------------------------------------- sky
  // A vertical band per viewport row for the current hour. Regenerated only when the hour bucket
  // or horizon changes: it is a per-frame read, not a per-frame build.
  let skyCache = null, skyKey = '';

  const SKY_KEYS = {
    night:     { top: [9, 1], hor: [9, 4],  sun: -5 },
    dawn:      { top: [9, 5], hor: [15, 9], sun: -2 },
    morning:   { top: [9, 8], hor: [9, 12], sun: 0 },
    noon:      { top: [9, 10], hor: [9, 14], sun: 1 },
    afternoon: { top: [9, 9], hor: [9, 13], sun: 0 },
    dusk:      { top: [9, 4], hor: [15, 8], sun: -2 },
  };

  function skyBand(horizonOverride) {
    const E = Engine;
    const phase = Clock.phase();
    const horizon = (E.VIEW.h >> 1) + (horizonOverride || 0);
    const k = phase + ':' + horizon;
    if (skyCache && skyKey === k) return skyCache;

    const spec = SKY_KEYS[phase] || SKY_KEYS.noon;
    const band = new Uint8Array(E.VIEW.h);
    for (let y = 0; y < E.VIEW.h; y++) {
      // Gradient from zenith to horizon, then a warmer band right at the skyline.
      const t = clamp(y / Math.max(1, horizon), 0, 1);
      const ramp = t > 0.86 ? spec.hor[0] : spec.top[0];
      const a = spec.top[1], b = spec.hor[1];
      const sh = Math.round(lerp(a, b, t));
      band[y] = Core.shade(ramp << 4, sh);
    }
    skyCache = band; skyKey = k;
    return band;
  }

  // Global light contribution from the sun, as a shade delta. This is how time of day reaches every
  // surface without any asset being generated twice.
  function sunShade(mapLight) {
    const d = Clock.daylight();
    // FLOOR at -3, not -5. A first-time player hit true black at midnight with no light source and
    // could not tell a night cycle from a crash. Night should be dark and navigable — moonlight,
    // not an absence of image.
    const base = Math.round(lerp(-3, 2, d));
    return Math.round(base * (mapLight === undefined ? 1 : mapLight));
  }

  // ---------------------------------------------------------------- ui ornament
  // Bevelled panel: two-tone border plus a darker plate. Cheap, and it is what makes a 1998 UI read
  // as moulded rather than as flat rectangles.
  function panel(E, x, y, w, h, ramp, dark) {
    const r = ramp === undefined ? 4 : ramp;
    E.rect(x, y, w, h, Core.idx(r, dark ? 3 : 5));
    E.hline(x, y, w, Core.idx(r, 10));
    E.vline(x, y, h, Core.idx(r, 10));
    E.hline(x, y + h - 1, w, Core.idx(r, 2));
    E.vline(x + w - 1, y, h, Core.idx(r, 2));
    E.frameRect(x + 1, y + 1, w - 2, h - 2, Core.idx(r, dark ? 2 : 4));
  }

  // A raised button. `down` swaps the bevel, which is the entire visual language of "pressed".
  function button(E, x, y, w, h, label, down, scale) {
    const r = 13;
    E.rect(x, y, w, h, Core.idx(r, down ? 4 : 7));
    E.hline(x, y, w, Core.idx(r, down ? 3 : 12));
    E.vline(x, y, h, Core.idx(r, down ? 3 : 12));
    E.hline(x, y + h - 1, w, Core.idx(r, down ? 12 : 3));
    E.vline(x + w - 1, y, h, Core.idx(r, down ? 12 : 3));
    if (label) {
      const s = scale || 2;
      textCentred(E, x + w / 2, y + ((h - 7 * s) >> 1) + (down ? 1 : 0), label, Core.idx(0, 14), s);
    }
  }

  // Carved stone course-work, for the chrome the viewport is set into. A flat panel is a margin; a
  // coursed one is a frame, and the frame is now load-bearing — it holds the touch controls that
  // used to float over the world.
  function stonework(E, x, y, w, h) {
    // Ramp 2 (warm stone), DARK. Ramp 13 is gold/brass and at these shades it painted the chrome
    // brighter than the daylit world inside the viewport, which inverts the whole frame: the eye
    // goes to the border instead of the game. Gold is now an accent only, on the rivets.
    const COURSE = 16;
    for (let ry = 0; ry < h; ry += COURSE) {
      const row = (ry / COURSE) | 0;
      for (let sy = 0; sy < COURSE && ry + sy < h; sy++) {
        // A top-lit gradient per course, so each block has a lip and a shadow under it. The whole
        // range sits BELOW the daylit world's value: chrome brighter than the game inverts the
        // frame and the eye goes to the border instead of through it.
        const sh = sy === 0 ? 6 : sy === 1 ? 5 : sy >= COURSE - 2 ? 1 : 3 - ((sy > COURSE / 2) ? 1 : 0);
        E.hline(x, y + ry + sy, w, Core.idx(2, sh));
      }
      // Staggered vertical joint.
      const jx = x + ((row & 1) ? (w >> 1) : (w >> 2));
      for (let sy = 1; sy < COURSE - 2 && ry + sy < h; sy++) {
        E.px(jx, y + ry + sy, Core.idx(2, 0));
        E.px(jx + 1, y + ry + sy, Core.idx(2, 5));
      }
      // Weathering: a deterministic speckle keyed to position, never Math.random.
      for (let i = 0; i < 7; i++) {
        const hx = Core.hashStr('stone' + row + ':' + i) >>> 0;
        const px2 = x + 2 + (hx % Math.max(1, w - 4));
        const py2 = y + ry + 3 + ((hx >>> 8) % Math.max(1, COURSE - 6));
        if (py2 < y + h) E.px(px2, py2, Core.idx(2, (hx >>> 16) & 1 ? 1 : 5));
      }
      // A brass rivet at the course line: the one place gold belongs.
      if ((row & 1) === 0 && ry + 2 < h) {
        const rx = x + w - 7;
        E.rect(rx, y + ry + 2, 3, 3, Core.idx(13, 9));
        E.px(rx, y + ry + 2, Core.idx(13, 13));
        E.px(rx + 2, y + ry + 4, Core.idx(13, 4));
      }
    }
  }

  // Movement arrows, drawn as solid triangles. The old pad used '<' '>' '^' 'v' from the text font,
  // which a player described as "four brown squares in a diamond, each with a glyph so faint I had
  // to guess — I still don't know if < and > are turns or strafes".
  function arrowGlyph(E, cx, cy, dir, pi) {
    const R = 8;
    for (let i = 0; i < R; i++) {
      const half = R - i;
      if (dir === 'up') E.hline(cx - half, cy - (R >> 1) + i, half * 2, pi);
      else if (dir === 'down') E.hline(cx - half, cy + (R >> 1) - i, half * 2, pi);
      else if (dir === 'left') E.vline(cx - (R >> 1) + i, cy - half, half * 2, pi);
      else E.vline(cx + (R >> 1) - i, cy - half, half * 2, pi);
    }
    // Turn arrows get a curved tail so they cannot be read as strafe.
    if (dir === 'left' || dir === 'right') {
      const s = dir === 'left' ? 1 : -1;
      for (let i = 0; i < 7; i++) E.px(cx + s * (2 + i), cy - 4 + ((i * i) >> 3), pi);
    }
  }

  // The ornate outer frame: the viewport hole must stay index 0 so nothing paints over the 3D view.
  function gameFrame(E) {
    const V = E.VIEW;
    // Border band around the viewport.
    panel(E, 0, 0, E.W, V.y, 13, true);
    panel(E, 0, V.y, V.x, V.h, 13, true);
    panel(E, V.x + V.w, V.y, E.W - V.x - V.w, V.h, 13, true);
    stonework(E, 2, V.y, V.x - 4, V.h);
    stonework(E, V.x + V.w + 2, V.y, E.W - V.x - V.w - 4, V.h);
    E.frameRect(V.x - 1, V.y - 1, V.w + 2, V.h + 2, Core.idx(13, 9));
    // Corner rosettes.
    for (const [cx, cy] of [[V.x - 1, V.y - 1], [V.x + V.w - 3, V.y - 1],
      [V.x - 1, V.y + V.h - 3], [V.x + V.w - 3, V.y + V.h - 3]]) {
      E.rect(cx - 1, cy - 1, 5, 5, Core.idx(13, 11));
      E.rect(cx, cy, 3, 3, Core.idx(13, 6));
    }
  }

  function bar(E, x, y, w, h, frac, ramp) {
    E.rect(x, y, w, h, Core.idx(0, 2));
    E.frameRect(x, y, w, h, Core.idx(0, 5));
    const fw = Math.round((w - 2) * clamp(frac, 0, 1));
    if (fw > 0) {
      E.rect(x + 1, y + 1, fw, h - 2, Core.idx(ramp, 9));
      E.hline(x + 1, y + 1, fw, Core.idx(ramp, 12));
    }
  }

  // ---------------------------------------------------------------- hud icons
  // Every shipped 1998 CRPG hand-painted its command bar: a helm, a pack, a book, a map. Six
  // three-letter text labels in flat rectangles read as placeholder tooling, and "MNU" reads as a
  // debug string. These are drawn, not typed.
  function hudIcon(E, kind, x, y, s) {
    const k = s || 2;
    const px = (cx, cy, ramp, sh) => E.rect(x + cx * k, y + cy * k, k, k, Core.idx(ramp, sh));
    const box = (cx, cy, w, h, ramp, sh) => E.rect(x + cx * k, y + cy * k, w * k, h * k, Core.idx(ramp, sh));

    if (kind === 'sheet') {            // a helm, visored
      box(3, 1, 6, 2, 14, 11); box(2, 3, 8, 5, 14, 9);
      box(3, 4, 6, 2, 0, 2);           // visor slit
      box(2, 8, 8, 1, 14, 6);
      px(5, 0, 11, 12); px(6, 0, 11, 12);
    } else if (kind === 'inv') {       // a pack with straps
      box(2, 3, 8, 6, 4, 8); box(2, 2, 8, 1, 4, 11);
      box(4, 0, 4, 2, 4, 6);           // flap
      px(4, 5, 13, 12); px(7, 5, 13, 12);
    } else if (kind === 'book') {      // an open spellbook
      box(1, 2, 4, 7, 0, 13); box(7, 2, 4, 7, 0, 13);
      box(5, 1, 2, 8, 4, 5);           // spine
      px(2, 4, 12, 11); px(3, 6, 12, 11); px(8, 4, 12, 11); px(9, 6, 12, 11);
    } else if (kind === 'map') {       // a folded map
      box(1, 2, 10, 7, 2, 12);
      box(4, 2, 1, 7, 2, 8); box(8, 2, 1, 7, 2, 8);   // folds
      px(2, 4, 11, 12); px(3, 5, 11, 12); px(9, 6, 11, 12);
    } else if (kind === 'rest') {      // a tent under a moon
      for (let i = 0; i < 5; i++) box(6 - i, 4 + i, 1 + i * 2, 1, 4, 7 + (i & 1));
      box(1, 9, 11, 1, 5, 5);
      px(9, 1, 13, 14); px(10, 1, 13, 14); px(10, 2, 13, 14);
    } else if (kind === 'menu') {      // a sealed scroll
      box(2, 2, 8, 7, 2, 13);
      box(2, 2, 8, 1, 2, 9); box(2, 8, 8, 1, 2, 9);
      px(5, 5, 11, 11); px(6, 5, 11, 11); px(5, 6, 11, 11); px(6, 6, 11, 11);
    }
  }

  // A pictorial shop sign. Blank brown planks meant a player had to walk into every door to learn
  // what it was.
  function shopSign(E, kind, x, y, s) {
    const k = s || 2;
    const box = (cx, cy, w, h, ramp, sh) => E.rect(x + cx * k, y + cy * k, w * k, h * k, Core.idx(ramp, sh));
    if (kind === 'weapon') { box(5, 0, 2, 7, 14, 12); box(3, 6, 6, 1, 13, 10); box(5, 7, 2, 3, 4, 7); }
    else if (kind === 'armour') { box(3, 1, 6, 7, 14, 10); box(2, 2, 1, 4, 14, 8); box(9, 2, 1, 4, 14, 8); }
    else if (kind === 'general') { box(2, 3, 8, 6, 4, 8); box(4, 1, 4, 2, 4, 6); }
    else if (kind === 'magic') { box(5, 1, 2, 9, 4, 6); box(3, 0, 6, 2, 12, 12); }
    else if (kind === 'temple') { box(5, 0, 2, 10, 0, 14); box(2, 3, 8, 2, 0, 14); }
    else if (kind === 'tavern') { box(3, 3, 6, 6, 13, 10); box(9, 4, 2, 3, 13, 8); box(3, 2, 6, 1, 0, 13); }
    else if (kind === 'trainer') { box(2, 4, 8, 2, 14, 11); box(4, 2, 1, 6, 4, 7); box(7, 2, 1, 6, 4, 7); }
    else if (kind === 'guild') { box(3, 1, 6, 8, 12, 9); box(5, 3, 2, 4, 13, 13); }
  }

  // ---------------------------------------------------------------- animation
  let tick = 0;
  function step() { tick++; }

  return {
    TS, FONT, CH_W, CH_H, GLYPH_H, ADVANCE,
    text, textShadow, textCentred, textCentredShadow, textWidth,
    makeTexture, texFor, installBaked, installBakedTextures, groundTexel, wallTexel, slopeShade,
    mipsFor, lodFor, levelOf,
    skyBand, sunShade, SKY_KEYS,
    panel, button, gameFrame, stonework, arrowGlyph, bar, step, hudIcon, shopSign,
    get tick() { return tick; },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Art;
