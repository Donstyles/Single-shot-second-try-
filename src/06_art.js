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
  // 5x7, column-major, bit 0 = top row. Drawn at integer scale so it stays crisp when the 640x480
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

  const FONT = (() => {
    const parts = FONT_HEX.replace(/\s/g, '').split('|');
    const out = new Uint8Array(parts.length * 5);
    for (let i = 0; i < parts.length; i++) {
      for (let c = 0; c < 5; c++) out[i * 5 + c] = parseInt(parts[i].substr(c * 2, 2), 16) || 0;
    }
    return out;
  })();

  const CH_W = 6, CH_H = 8;   // 5px glyph + 1px gap

  function charCols(ch) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return -1;
    return (code - 32) * 5;
  }

  function text(E, x, y, str, pi, scale) {
    const s = scale || 1;
    let cx = x;
    for (let i = 0; i < str.length; i++) {
      const o = charCols(str[i]);
      if (o >= 0) {
        for (let c = 0; c < 5; c++) {
          const bits = FONT[o + c];
          for (let r = 0; r < 7; r++) {
            if (!(bits & (1 << r))) continue;
            if (s === 1) E.px(cx + c, y + r, pi);
            else E.rect(cx + c * s, y + r * s, s, s, pi);
          }
        }
      }
      cx += CH_W * s;
    }
    return cx - x;
  }

  const textWidth = (str, scale) => str.length * CH_W * (scale || 1);

  // Text with a 1px dark drop, which is what makes light type survive on a busy background.
  function textShadow(E, x, y, str, pi, scale) {
    text(E, x + (scale || 1), y + (scale || 1), str, Core.idx(0, 1), scale);
    return text(E, x, y, str, pi, scale);
  }

  function textCentred(E, cx, y, str, pi, scale) {
    return text(E, Math.round(cx - textWidth(str, scale) / 2), y, str, pi, scale);
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

  // Baked textures are indexed PNGs decoded at boot. They replace the procedural version for that
  // material and nothing else in the engine changes.
  function installBaked(mat, indices, size) {
    BAKED[mat] = indices;
    BAKED[mat].size = size;
  }

  const texSize = (t) => t.size || TS;

  // ---- the two functions the march calls in its innermost loop
  function groundTexel(mat, wx, wy, map) {
    const t = texFor(mat);
    const S = texSize(t), Mk = S - 1;
    // Ground textures repeat every 2 cells: a 1:1 mapping makes a road read as a tiled floor.
    const u = ((wx * S / 2) | 0) & Mk;
    const v = ((wy * S / 2) | 0) & Mk;
    return t[v * S + u];
  }

  function wallTexel(mat, u, v, face) {
    const t = texFor(mat);
    const S = texSize(t), Mk = S - 1;
    const ui = ((u * S) | 0) & Mk;
    const vi = ((v * S) | 0) & Mk;
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
    const base = Math.round(lerp(-5, 2, d));
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

  // The ornate outer frame: the viewport hole must stay index 0 so nothing paints over the 3D view.
  function gameFrame(E) {
    const V = E.VIEW;
    // Border band around the viewport.
    panel(E, 0, 0, E.W, V.y, 13, true);
    panel(E, 0, V.y, V.x, V.h, 13, true);
    panel(E, V.x + V.w, V.y, E.W - V.x - V.w, V.h, 13, true);
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

  // ---------------------------------------------------------------- animation
  let tick = 0;
  function step() { tick++; }

  return {
    TS, FONT, CH_W, CH_H,
    text, textShadow, textCentred, textWidth,
    makeTexture, texFor, installBaked, groundTexel, wallTexel, slopeShade,
    skyBand, sunShade, SKY_KEYS,
    panel, button, gameFrame, bar, step,
    get tick() { return tick; },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Art;
