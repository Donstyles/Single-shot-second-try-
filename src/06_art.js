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
    // The remaining glyphs a critic read back wrong at 1x: P without its bowl is an F, S without
    // its spine is a 3, R and B collapse into each other, and 1 without a foot is a colon.
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....', '.....', '.....'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#', '.....', '.....'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.', '.....', '.....'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.', '.....', '.....'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.', '.....', '.....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.', '.....', '.....'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####', '.....', '.....'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '.....', '.....'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..', '.....', '.....'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#', '.....', '.....'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####', '.....', '.....'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....', '.....', '.....'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.', '.....', '.....'],
    I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####', '.....', '.....'],
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.', '.....', '.....'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.', '.....', '.....'],
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

  // 1x TEXT IS ALWAYS SHADOWED, and that is not a style choice.
  //
  // The 800x480 framebuffer is presented at 650x390 on the target phone — a 0.8125 scale with
  // `image-rendering: pixelated`, which is NEAREST. Nearest downsampling at that ratio throws away
  // every fifth row and column, and a one-pixel stroke that lands on a discarded column is simply
  // gone. An art critic dumped the result: "MAP" rendered as `YY F`, "SPELLS" as `3FELLS`, "PACK"
  // as `P^CX`, "AMULET" as `FMULCT` — the A losing its crossbar, the P losing its bowl, the S
  // becoming a 3. The glyphs were never the problem; the survival of a 1px stroke was.
  //
  // A hard shadow at (+1,+1) makes every stroke two pixels thick in both axes, so a dropped column
  // leaves the other one standing. Drawn as a separate pass under the whole string, because per
  // glyph it would print over the previous glyph's ink.
  // `scale` is kept as the caller-facing unit because ninety call sites speak it, but it now
  // selects an OPTICAL SIZE rather than a pixel-doubling factor: scale 2 is a face drawn at 12px
  // cap, not a 6px face with every pixel repeated. See 05a_font.js for why that distinction is the
  // whole point.
  function capFor(scale) {
    const s = scale || 1;
    return s === 1 ? 7 : 6 * s;
  }

  // Layouts anchor on the CAP TOP — that is where the old doubled bitmap put its first inked row,
  // and it is the line the eye actually reads against. The face's own box is taller than its caps
  // (ascenders, descenders), so the block is offset up by the difference.
  function capOffset(cap) {
    const m = Font.metrics(cap);
    return m.base - m.cap;
  }

  function glyphPass(E, x, y, str, pi, s) {
    const cap = capFor(s);
    const lut = Core.mixLut(pi, 4);
    const buf = E.buf, W = E.W, H = E.H;
    const top = y - capOffset(cap);
    Font.draw(String(str), x, top, cap, (px, py, lv) => {
      if (px < 0 || py < 0 || px >= W || py >= H) return;
      const o = py * W + px;
      // Full coverage writes the ink. Partial coverage is a real blend against whatever is already
      // on the pixel — the same mechanism distance fog uses, not a dither pretending to be one.
      buf[o] = lv === 3 ? pi : lut[buf[o] * 4 + lv];
    });
    return Font.width(String(str), cap);
  }

  function text(E, x, y, str, pi, scale) {
    const s = scale || 1;
    // The smallest optical size still gets a hard drop, because at 7px cap the anti-aliasing that
    // makes it smooth also makes it faint against a busy plate.
    if (s === 1) glyphPass(E, x + 1, y + 1, str, Core.idx(0, 1), 1);
    return glyphPass(E, x, y, str, pi, s);
  }

  function textWidth(str, scale) {
    return Font.width(String(str), capFor(scale));
  }

  // Text with a 1px dark drop, which is what makes light type survive on a busy background.
  function textShadow(E, x, y, str, pi, scale) {
    const s = scale || 1;
    const d = s === 1 ? 1 : 2;
    glyphPass(E, x + d, y + d, str, Core.idx(0, 1), s);
    return glyphPass(E, x, y, str, pi, s);
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
    if (dist < 10) return 0;
    if (dist < 20) return 1;
    if (dist < 36) return 2;
    if (dist < 64) return 3;
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
  // GROUND FREQUENCY. This sampled two full texture repeats per world cell — at a 64-texel tile
  // that is 128 texels across a cell, so a cell spanning 200 screen pixels still packed sub-pixel
  // detail and the surface aliased into per-pixel noise at EVERY distance. An art critic measured
  // it: mean horizontal run length 1.20 at the camera and 1.10 at the horizon, i.e. a flat field
  // of RGB static with no scale and no perspective, "visual sandpaper" under the best sprites in
  // the set. Half a repeat per cell gives 32 texels per cell, so magnification near the camera is
  // real and the foreshortening the per-row cast computes is finally visible.
  const GROUND_REPEAT = 0.5;

  function groundTexel(mat, wx, wy, map, lod) {
    const t = levelOf(mat, lod || 0);
    const S = t.size || TS, Mk = S - 1;
    const u = (((wx * GROUND_REPEAT * S) | 0) + (S << 6)) & Mk;
    const v = (((wy * GROUND_REPEAT * S) | 0) + (S << 6)) & Mk;
    return t[v * S + u];
  }

  const BUILDING = { 17: 1, 18: 1, 19: 1, 16: 1 };   // timber, brick, plaster, stone
  const isBuilding = (mat) => !!BUILDING[mat];

  // A lit window: a framed opening with a warm interior and a mullion cross, drawn straight into
  // the framebuffer so the sun term never touches it. Which storeys are lit, and which of the two
  // window columns, comes from the cell hash — so a street has some rooms awake and some not, and
  // it is the same street every night.
  function windowTexel(u, v, seed, storeys) {
    const st = Math.floor(v);                        // which storey of this wall
    if (st < 0 || st >= (storeys || 1)) return 0;
    const fv = v - st;
    if (fv < 0.30 || fv > 0.72) return 0;
    // Two windows per cell face.
    const col = u < 0.5 ? 0 : 1;
    const fu = col ? (u - 0.5) * 2 : u * 2;
    if (fu < 0.26 || fu > 0.74) return 0;
    const bit = (seed >>> ((st * 2 + col) & 15)) & 1;
    if (!bit) return 0;                              // that room is dark
    // Frame, then glow, then a mullion cross.
    const edge = fu < 0.32 || fu > 0.68 || fv < 0.35 || fv > 0.67;
    if (edge) return Core.idx(4, 2);
    if (Math.abs(fu - 0.5) < 0.035 || Math.abs(fv - 0.51) < 0.028) return Core.idx(4, 3);
    const warm = 12 + (((u * 97 + v * 61) | 0) & 1);
    return Core.idx(15, warm);
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

    // DITHERED, and 8 pixels wide. The gradient is a lerp between two shades of one ramp, and
    // rounding it to an integer shade gives four or five values over 172 rows — which is four or
    // five FLAT RECTANGLES with razor seams. An art critic measured them: "in s10 at x=150 the sky
    // steps at y=24, y=59, y=94, y=129, exactly 35px apart, 465px wide, with zero dither at any
    // boundary. No 1998 sky ever did that." They appear in eleven of twenty-two shots.
    //
    // The band is now indexed [row * 8 + (x & 7)], so the fractional part of the shade is resolved
    // by an ordered threshold across the column: a boundary becomes a two-value checker a few rows
    // deep instead of a line. This is the legitimate use of a Bayer matrix — dithering a
    // quantisation error — as opposed to punching holes in an image with one.
    const spec = SKY_KEYS[phase] || SKY_KEYS.noon;
    const band = new Uint8Array(E.VIEW.h * 8);
    const TH = [0.0625, 0.5625, 0.1875, 0.6875, 0.4375, 0.9375, 0.3125, 0.8125];
    for (let y = 0; y < E.VIEW.h; y++) {
      const t = clamp(y / Math.max(1, horizon), 0, 1);
      const ramp = t > 0.86 ? spec.hor[0] : spec.top[0];
      const exact = lerp(spec.top[1], spec.hor[1], t);
      const lo = Math.floor(exact), frac = exact - lo;
      for (let x = 0; x < 8; x++) {
        band[y * 8 + x] = Core.shade(ramp << 4, frac > TH[(x + (y & 1) * 4) & 7] ? lo + 1 : lo);
      }
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
  //
  // `disabled` greys it the way a 1990s toolbar greyed a dead control: a checker laid on the PLATE,
  // then the label drawn OVER the checker in a dimmed entry. Drawn the other way round — the wash
  // applied last, over the finished button — its scanlines ran through the letterforms at the same
  // pitch as the font stroke and ate every second row of every glyph: WAIT read as UAII in all
  // sixteen in-game shots. The spellbook hit the identical bug (EARTH -> FARTH, BODY -> BUUY) and
  // fixed it locally; it lives here now so no third caller can rediscover it.
  function button(E, x, y, w, h, label, down, scale, disabled) {
    const r = 13;
    E.rect(x, y, w, h, Core.idx(r, down ? 4 : 7));
    E.hline(x, y, w, Core.idx(r, down ? 3 : 12));
    E.vline(x, y, h, Core.idx(r, down ? 3 : 12));
    E.hline(x, y + h - 1, w, Core.idx(r, down ? 12 : 3));
    E.vline(x + w - 1, y, h, Core.idx(r, down ? 12 : 3));
    if (disabled) {
      // Checker on absolute coordinates, so the pattern does not swim when a button moves.
      const dim = Core.idx(r, down ? 3 : 5);
      for (let yy = y + 1; yy < y + h - 1; yy++) {
        for (let xx = x + 1 + ((xx0(x, yy)) & 1); xx < x + w - 1; xx += 2) E.px(xx, yy, dim);
      }
    }
    if (label) {
      const s = scale || 2;
      textCentred(E, x + w / 2, y + ((h - 7 * s) >> 1) + (down ? 1 : 0), label,
        Core.idx(0, disabled ? 10 : 14), s);
    }
  }
  // Parity helper: keeps the checker phase tied to the framebuffer grid, not the button's corner.
  function xx0(x, y) { return (x + y) & 1; }

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
    // THE POINT GOES FIRST, and a TURN is a curve.
    //
    // Forward and back are solid triangles pointing the way they move. Left and right are ARCS with
    // an arrowhead — a rotation glyph, not a translation one. A straight horizontal arrow reads as
    // strafe, and a cold player spent an entire fifteen-minute session convinced the game had no
    // way to turn around: "I pressed left eight times and ended up in a different quarter of town
    // still facing the same direction." Measured afterwards, eight taps rotate the party 189
    // degrees and move it exactly nowhere. The button was never broken; the picture on it was, and
    // a control a player cannot identify is as good as one that does not work.
    const R = 8;
    // Sidestep: a solid triangle with a bar behind it, so it cannot be confused with the turn arc.
    if (dir === 'sideL' || dir === 'sideR') {
      const sg = dir === 'sideL' ? -1 : 1;
      for (let i = 0; i < 7; i++) E.vline(cx + sg * (1 + i), cy - (6 - i), (6 - i) * 2 + 1, pi);
      E.vline(cx - sg * 4, cy - 6, 13, pi);
      E.vline(cx - sg * 5, cy - 6, 13, pi);
      return;
    }
    if (dir === 'up' || dir === 'down') {
      for (let i = 0; i < R; i++) {
        const half = i;
        if (dir === 'up') E.hline(cx - half, cy - (R >> 1) + i, half * 2 + 1, pi);
        else E.hline(cx - half, cy + (R >> 1) - i, half * 2 + 1, pi);
      }
      return;
    }
    // A three-quarter arc, opening toward the direction of rotation.
    const sgn = dir === 'left' ? -1 : 1;
    for (let a = -140; a <= 110; a += 4) {
      const t = a * Math.PI / 180;
      const ax = Math.round(Math.cos(t) * 7) * sgn, ay = Math.round(Math.sin(t) * 7);
      E.px(cx + ax, cy + ay, pi);
      E.px(cx + ax, cy + ay + 1, pi);
      E.px(cx + ax + sgn, cy + ay, pi);
    }
    // Arrowhead at the open end, pointing around the arc.
    const hx = cx + Math.round(Math.cos(-140 * Math.PI / 180) * 7) * sgn;
    const hy = cy + Math.round(Math.sin(-140 * Math.PI / 180) * 7);
    for (let i = 0; i < 5; i++) {
      E.hline(hx - i * sgn - (sgn < 0 ? 0 : i), hy + i, i * 2 + 1, pi);
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

    if (kind === 'journal') {          // a sealed scroll with a ribbon
      box(2, 2, 8, 9, 2, 13); box(2, 2, 8, 1, 2, 15);
      for (let r = 0; r < 5; r++) box(3, 4 + r, 6, 1, 2, 8 + (r & 1));
      box(1, 10, 10, 2, 4, 6); px(5, 11, 11, 12); px(6, 11, 11, 12);
      return;
    }
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
  // A PAINTED INTERIOR behind a shop's stock list. Three separate reviews said the same thing —
  // "a door swaps the view for a menu panel", "buildings are shells", "25% content and 75% empty
  // brown box" — and named it the largest single gap to MM6. MM6's own shops are not rendered
  // rooms either: they are painted 2D interiors with a list of goods over them. So this is the
  // faithful answer rather than a substitute for one.
  function shopInterior(E, x, y, w, h, kind) {
    const px = (cx, cy, ramp, sh) => E.px(x + cx, y + cy, Core.idx(ramp, sh));
    const box = (cx, cy, bw, bh, ramp, sh) => E.rect(x + cx, y + cy, bw, bh, Core.idx(ramp, sh));

    const warm = kind === 'temple' ? 9 : kind === 'magic' ? 12 : kind === 'guild' ? 12 : 4;
    const wallRamp = kind === 'temple' || kind === 'guild' ? 1 : kind === 'magic' ? 0 : 4;

    // Back wall: coursed masonry for stone trades, planking for the rest, lit from the lamp.
    for (let ry = 0; ry < h; ry++) {
      const fall = 1 - ry / h;
      for (let rx = 0; rx < w; rx++) {
        const cx2 = Math.abs(rx - w / 2) / (w / 2);
        const lamp = Math.max(0, 1.15 - cx2 * 0.8 - fall * 0.25);
        let sh = 3 + Math.round(lamp * 5);
        if (wallRamp === 4) { if ((rx % 13) === 0) sh -= 2; }                 // plank seams
        else { if ((ry % 11) === 0 || ((rx + (((ry / 11) | 0) & 1) * 11) % 22) === 0) sh -= 2; }
        px(rx, ry, wallRamp, sh < 1 ? 1 : sh);
      }
    }

    // Floorboards, in perspective: the courses get shallower toward the back wall.
    const fy = Math.round(h * 0.62);
    let step = 3;
    for (let ry = h - 1, k = 0; ry > fy; k++) {
      const band = Math.max(2, step);
      for (let b = 0; b < band && ry > fy; b++, ry--) {
        for (let rx = 0; rx < w; rx++) {
          px(rx, ry, 5, (b === 0 ? 3 : 6) + (((rx + k * 3) % 17) === 0 ? -2 : 0));
        }
      }
      step = Math.max(2, step - 1);
    }

    // A hanging lamp with a warm pool — the one emissive thing in the room.
    const lx = Math.round(w * 0.17);
    for (let ry = 0; ry < 16; ry++) px(lx, ry, 13, 6);
    for (let ry = 16; ry < 24; ry++) {
      const ww = 9 - Math.abs(ry - 20);
      for (let rx = -ww; rx <= ww; rx++) px(lx + rx, ry, 13, ry < 20 ? 11 : 7);
    }
    for (let ry = 22; ry < 28; ry++) for (let rx = -3; rx <= 3; rx++) {
      if (rx * rx + (ry - 24) * (ry - 24) > 10) continue;
      px(lx + rx, ry, 15, 13);
    }

    // Shelves either side, stacked with trade goods.
    for (const side of [0, 1]) {
      const sx = side ? w - 96 : 12;
      for (let shelf = 0; shelf < 3; shelf++) {
        const sy = Math.round(h * 0.16) + shelf * 34;
        box(sx, sy + 22, 84, 4, 4, 3);
        box(sx, sy + 22, 84, 1, 4, 9);
        for (let g = 0; g < 5; g++) {
          const gx = sx + 5 + g * 16;
          const hsh = (Core.hashStr('goods' + kind + shelf + g + side) >>> 0);
          const gh2 = 8 + (hsh % 12);
          const ramp = kind === 'weapon' ? [14, 14, 13, 4, 14][g % 5]
            : kind === 'armour' ? [14, 1, 14, 13, 1][g % 5]
            : kind === 'magic' ? [12, 11, 6, 15, 12][g % 5]
            : kind === 'temple' ? [13, 0, 13, 9, 13][g % 5]
            : [4, 6, 11, 2, 13][g % 5];
          for (let ry = 0; ry < gh2; ry++) {
            const bw = (hsh & 1) && ry < 3 ? 4 : 9;
            for (let rx = 0; rx < bw; rx++) px(gx + rx + (9 - bw) / 2 | 0, sy + 22 - ry, ramp, 7 + ((rx + ry) & 1) * 3 - (rx > bw - 3 ? 3 : 0));
          }
        }
      }
    }

    // The counter, across the front, with the keeper behind it.
    const cy0 = Math.round(h * 0.60);
    box(0, cy0, w, 8, 4, 9);
    box(0, cy0 + 8, w, h - cy0 - 8, 4, 5);
    for (let rx = 0; rx < w; rx += 19) box(rx, cy0 + 8, 2, h - cy0 - 8, 4, 3);
    box(0, cy0, w, 2, 4, 12);

    // Keeper: shoulders, head, and an apron in the trade's colour.
    const kx = Math.round(w * 0.17), ky = cy0 - 44;
    box(kx - 22, ky + 16, 44, 30, warm, 8);
    box(kx - 22, ky + 16, 44, 2, warm, 11);
    for (let ry = 0; ry < 20; ry++) {
      for (let rx = -10; rx <= 10; rx++) {
        if ((rx * rx) / 100 + ((ry - 10) * (ry - 10)) / 110 > 1) continue;
        px(kx + rx, ky + ry - 4, 10, 11 - Math.round((rx + 10) / 20 * 4));
      }
    }
    for (let ry = -6; ry < 4; ry++) for (let rx = -11; rx <= 11; rx++) {
      if ((rx * rx) / 130 + ((ry) * (ry)) / 40 > 1) continue;
      px(kx + rx, ky + ry - 4, 4, 6 - ((rx + ry) & 1));
    }
    px(kx - 4, ky + 6, 0, 2); px(kx + 4, ky + 6, 0, 2);
    for (let rx = -3; rx <= 3; rx++) px(kx + rx, ky + 12, 11, 6);
  }

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
    text, textShadow, textCentred, textCentredShadow, textWidth, isBuilding, windowTexel,
    makeTexture, texFor, installBaked, installBakedTextures, groundTexel, wallTexel, slopeShade,
    mipsFor, lodFor, levelOf,
    skyBand, sunShade, SKY_KEYS,
    panel, button, gameFrame, stonework, arrowGlyph, bar, step, hudIcon, shopSign, shopInterior,
    get tick() { return tick; },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Art;
