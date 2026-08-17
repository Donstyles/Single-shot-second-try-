// 00_core.js — RNG registry, palette, clock, bus, log, small utils.
// Owner: core. Depends on nothing.
//
// Two things in this file are load-bearing for the entire project:
//   1. The palette is 16 ramps x 16 shades, so shading is ARITHMETIC on an index. Every wall,
//      sprite and floor shades through the same operation, which is most of why the output reads
//      as one art department rather than a pile of separate assets.
//   2. Every random number in the game comes from a NAMED SEEDED STREAM here. There is no
//      Math.random in src/ and a test greps for it.

const Core = (() => {
  'use strict';

  // ---------------------------------------------------------------- utils
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  // FNV-1a. Used to derive stream seeds from names, so a stream's identity is its name.
  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // ---------------------------------------------------------------- RNG
  // SplitMix32. Explicit 32-bit state so a stream can be dumped and restored exactly.
  function Stream(seed) {
    this.s = seed >>> 0;
  }
  Stream.prototype.next = function () {
    this.s = (this.s + 0x9e3779b9) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 4294967296;
  };
  // int in [0, n)
  Stream.prototype.int = function (n) { return Math.floor(this.next() * n); };
  // int in [lo, hi] inclusive
  Stream.prototype.range = function (lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); };
  Stream.prototype.float = function (lo, hi) { return lo + this.next() * (hi - lo); };
  Stream.prototype.chance = function (p) { return this.next() < p; };
  Stream.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  // Fisher-Yates, in place, deterministic.
  Stream.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  // Sum of n uniforms - the bell curve 1998 RPGs actually used for damage spread.
  Stream.prototype.dice = function (n, sides) {
    let v = 0;
    for (let i = 0; i < n; i++) v += 1 + Math.floor(this.next() * sides);
    return v;
  };

  const RNG = {
    seed: 1,
    _world: Object.create(null),   // layout streams: derived from seed, NEVER serialised
    _live: Object.create(null),    // live streams: advance in play, ALWAYS serialised

    setSeed(n) {
      this.seed = n >>> 0;
      this._world = Object.create(null);
      this._live = Object.create(null);
    },

    // Layout randomness. Reproducible from the seed alone, so it is rebuilt on load rather
    // than stored. Terrain, map dressing, shop stock.
    world(name) {
      let s = this._world[name];
      if (!s) s = this._world[name] = new Stream((this.seed ^ hashStr('w:' + name)) >>> 0);
      return s;
    },

    // Live randomness. Combat rolls, loot, wandering spawns. Position is part of the save;
    // a save that does not restore these is a determinism bug.
    live(name) {
      let s = this._live[name];
      if (!s) s = this._live[name] = new Stream((this.seed ^ hashStr('l:' + name)) >>> 0);
      return s;
    },

    // Stable key order so the dump is diffable.
    dump() {
      const out = { seed: this.seed, live: {} };
      for (const k of Object.keys(this._live).sort()) out.live[k] = this._live[k].s;
      return out;
    },

    restore(d) {
      this.setSeed(d.seed);
      for (const k of Object.keys(d.live || {})) this._live[k] = new Stream(d.live[k] >>> 0);
    },
  };

  // ---------------------------------------------------------------- palette
  // 16 ramps x 16 shades. index = (ramp << 4) | shade. Shade 0 darkest, 15 lightest.
  // INDEX 0 IS TRANSPARENT AND IS THE ONLY TRANSPARENT INDEX. Every quantiser and every
  // bake step passes it through verbatim; remapping it once turned the UI frame's viewport
  // hole into an opaque black plate and blacked out the whole game.
  const TRANSPARENT = 0;

  // [dark, light] or [dark, mid, light]. Mid lets a ramp bend through a hue (flame through
  // orange) instead of interpolating straight to white.
  const RAMPS = [
    [[8, 8, 10], [128, 130, 136], [248, 248, 252]],       //  0 key / grey   (0 = transparent)
    [[24, 26, 34], [110, 118, 134], [198, 206, 220]],      //  1 cold stone
    [[34, 28, 20], [148, 128, 96], [234, 216, 180]],       //  2 warm stone / sandstone
    [[30, 14, 10], [140, 68, 48], [216, 130, 96]],         //  3 brick / clay
    [[24, 15, 8], [116, 80, 44], [190, 146, 94]],          //  4 timber
    [[22, 17, 11], [104, 84, 58], [176, 148, 108]],        //  5 earth / dirt
    [[13, 23, 11], [74, 112, 50], [156, 194, 104]],        //  6 grass
    [[6, 14, 9], [40, 78, 40], [92, 146, 78]],             //  7 foliage
    [[5, 13, 26], [40, 92, 130], [130, 190, 222]],         //  8 water
    [[20, 28, 50], [96, 134, 186], [204, 226, 248]],       //  9 sky
    [[32, 19, 14], [150, 104, 78], [242, 210, 180]],       // 10 flesh
    [[28, 7, 9], [132, 34, 34], [220, 92, 82]],            // 11 cloth red
    [[17, 10, 32], [84, 58, 132], [164, 132, 224]],        // 12 cloth violet
    [[30, 20, 5], [148, 112, 32], [250, 216, 116]],        // 13 gold / brass
    [[16, 18, 24], [112, 124, 142], [216, 226, 238]],      // 14 steel
    [[38, 10, 2], [198, 84, 12], [255, 236, 156]],         // 15 flame
  ];

  const PAL = new Uint8Array(256 * 3);
  // ONE SHADOW TERMINUS for the whole palette.
  //
  // Every ramp used to end at its own saturated near-black: sixteen of them, luminance 11 to 29,
  // saturation 0.08 to 0.95. An art critic measured the consequence twice over. First, "five
  // mutually incompatible families of near-black in circulation across the set, fifteen distinct
  // values below L=32 — a 256-colour art department in 1998 shared one shadow terminus so that
  // shadows in the mine and shadows in the barrow sat on the same floor." Second, and worse: night
  // came out MORE saturated than day (viewport saturation ratio 1.399, sky +64%), because shading
  // a colour DOWN its ramp drove it toward a highly saturated dark point. A night pass that raises
  // chroma as it lowers luminance is backwards, and no amount of tinting on top repairs it.
  //
  // Blending each ramp's dark end most of the way to a shared cool near-black fixes both at the
  // source, and gives dungeons somewhere to recede INTO rather than a flat hole.
  const TERMINUS = [13, 13, 14];
  const TERMINUS_PULL = 0.72;

  (function buildPalette() {
    for (let r = 0; r < 16; r++) {
      const spec = RAMPS[r];
      const dark = spec[0];
      const mid = spec.length === 3 ? spec[1] : null;
      const light = spec[spec.length - 1];
      for (let s = 0; s < 16; s++) {
        const t = s / 15;
        let c;
        if (mid) {
          // Two-segment interpolation through the mid colour at t = 0.5.
          c = t < 0.5
            ? [lerp(dark[0], mid[0], t * 2), lerp(dark[1], mid[1], t * 2), lerp(dark[2], mid[2], t * 2)]
            : [lerp(mid[0], light[0], (t - 0.5) * 2), lerp(mid[1], light[1], (t - 0.5) * 2), lerp(mid[2], light[2], (t - 0.5) * 2)];
        } else {
          c = [lerp(dark[0], light[0], t), lerp(dark[1], light[1], t), lerp(dark[2], light[2], t)];
        }
        // Pull the WHOLE dark half toward the shared terminus, strongest at the bottom and gone by
        // the midpoint. Doing it only at shade 0 left the saturation inversion intact, because
        // night lands in the lower MIDDLE of a ramp, which is exactly where chroma peaks.
        // Across the WHOLE ramp, strongest at the bottom. Confining it to the dark half left the
        // inversion intact: relative saturation is (max-min)/max, so as luminance falls the same
        // absolute chroma reads as MORE saturated. Only pulling actual chroma out of the lower two
        // thirds of every ramp turns that around, and the highlights keep their colour because the
        // curve has fallen to almost nothing by the time it reaches them.
        const k = TERMINUS_PULL * Math.pow(1 - t, 2.0);
        c = [lerp(c[0], TERMINUS[0], k), lerp(c[1], TERMINUS[1], k), lerp(c[2], TERMINUS[2], k)];
        const i = ((r << 4) | s) * 3;
        PAL[i] = c[0] | 0; PAL[i + 1] = c[1] | 0; PAL[i + 2] = c[2] | 0;
      }
    }
    // Index 0 is the transparent slot. Its RGB is never drawn, but keep it black rather than
    // leaving it as ramp 0's darkest so a bug that draws it is obvious rather than subtle.
    PAL[0] = 0; PAL[1] = 0; PAL[2] = 0;
  })();

  // RGBA bytes for the whole palette, for fast framebuffer expansion.
  const PAL32 = new Uint32Array(256);
  (function buildPal32() {
    for (let i = 0; i < 256; i++) {
      PAL32[i] = (255 << 24) | (PAL[i * 3 + 2] << 16) | (PAL[i * 3 + 1] << 8) | PAL[i * 3];
    }
  })();

  // Apply a light level to a palette index. THE central operation of the renderer.
  // Ramp 0 clamps to shade 1 because shade 0 of ramp 0 is the transparent slot.
  function shade(pi, s) {
    const ramp = pi & 0xf0;
    const lo = ramp === 0 ? 1 : 0;
    return ramp | (s < lo ? lo : s > 15 ? 15 : s);
  }

  // Darken/brighten by a delta, preserving ramp.
  function shadeBy(pi, d) { return shade(pi, (pi & 0x0f) + d); }

  const rampOf = (pi) => (pi >> 4) & 0x0f;
  const shadeOf = (pi) => pi & 0x0f;
  const idx = (ramp, s) => shade(ramp << 4, s);

  // Nearest palette index for an RGB triple. Weighted for perceived luminance, which matters
  // because an unweighted match sends skin tones into the steel ramp.
  function palIdx(r, g, b) {
    let best = 1, bestD = Infinity;
    for (let i = 1; i < 256; i++) {
      const dr = r - PAL[i * 3], dg = g - PAL[i * 3 + 1], db = b - PAL[i * 3 + 2];
      const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // 4x4 ordered dither matrix (Bayer). Values centred on zero.
  const BAYER4 = [
    -0.5000, 0.0000, -0.3750, 0.1250,
    0.2500, -0.2500, 0.3750, -0.1250,
    -0.3125, 0.1875, -0.4375, 0.0625,
    0.4375, -0.0625, 0.3125, -0.1875,
  ];

  // Quantise RGBA bytes to palette indices with ordered dithering.
  // NOTHING enters the build as RGB: foundry output, generated art and procedural art all
  // come through here. `alphaCut` below which a pixel becomes index 0 (transparent).
  function palDither(rgba, w, h, alphaCut) {
    const cut = alphaCut === undefined ? 128 : alphaCut;
    const out = new Uint8Array(w * h);
    const cache = new Map();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        if (rgba[p + 3] < cut) { out[y * w + x] = TRANSPARENT; continue; }
        const d = BAYER4[(y & 3) * 4 + (x & 3)] * 18;
        const r = clamp(rgba[p] + d, 0, 255) | 0;
        const g = clamp(rgba[p + 1] + d, 0, 255) | 0;
        const b = clamp(rgba[p + 2] + d, 0, 255) | 0;
        // Cache on a coarse key: exact lookup is 255 comparisons per pixel otherwise.
        const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
        let pi = cache.get(key);
        if (pi === undefined) { pi = palIdx(r, g, b); cache.set(key, pi); }
        out[y * w + x] = pi;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- clock
  // ONE time representation: integer game minutes since the world epoch. Hour, day and phase
  // are derived by function and are never stored as fields.
  //
  // Advanced by integer milliseconds through an accumulator kept in integer "micro-minutes",
  // so a scripted session at a fixed timestep is exact rather than nearly-exact.
  const MIN_PER_DAY = 1440;
  // A full day in 16 real minutes. At the previous rate (a day every four minutes) a player lost
  // two in-game days to walking across a town, and the screen went black at minute eight.
  const GAME_MIN_PER_REAL_SEC = 1.5;

  const Clock = {
    t: 9 * 60,        // world starts at 09:00 on day 0
    micro: 0,
    paused: false,

    advance(dtMs) {
      if (this.paused) return 0;
      this.micro += Math.round((dtMs | 0) * GAME_MIN_PER_REAL_SEC * 2);
      const add = (this.micro / 2000) | 0;
      if (add > 0) { this.micro -= add * 2000; this.t += add; }
      return add;
    },

    // Jump forward by whole game minutes (resting, travel).
    skip(minutes) { this.t += minutes | 0; return this.t; },

    get day() { return (this.t / MIN_PER_DAY) | 0; },
    get tod() { return this.t % MIN_PER_DAY; },          // minutes since midnight
    get hour() { return (this.tod / 60) | 0; },
    get minute() { return this.tod % 60; },

    // Set time of day, preserving the day number. Used by the shot list so every capture is
    // at exactly the stated hour.
    setTod(minutes) {
      const m = ((minutes | 0) % MIN_PER_DAY + MIN_PER_DAY) % MIN_PER_DAY;
      this.t = this.day * MIN_PER_DAY + m;
      this.micro = 0;
      return this.t;
    },

    // Named phase, used by the sky, the lightmap and the music director.
    phase() {
      const m = this.tod;
      if (m < 270) return 'night';
      if (m < 390) return 'dawn';
      if (m < 660) return 'morning';
      if (m < 900) return 'noon';
      if (m < 1080) return 'afternoon';
      if (m < 1200) return 'dusk';
      return 'night';
    },

    // 0 at midnight, 1 at noon. Drives ambient light and sky blending.
    daylight() {
      const m = this.tod;
      const x = Math.cos(((m - 720) / MIN_PER_DAY) * Math.PI * 2);
      return clamp((x + 0.25) / 1.15, 0, 1);
    },

    hhmm() {
      const h = this.hour, m = this.minute;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },

    dump() { return { t: this.t, micro: this.micro }; },
    restore(d) { this.t = d.t | 0; this.micro = d.micro | 0; this.paused = false; },
  };

  // ---------------------------------------------------------------- bus
  const Bus = {
    _h: Object.create(null),
    on(ev, fn) { (this._h[ev] || (this._h[ev] = [])).push(fn); return fn; },
    off(ev, fn) {
      const a = this._h[ev]; if (!a) return;
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    },
    emit(ev, arg) {
      const a = this._h[ev]; if (!a) return;
      for (let i = 0; i < a.length; i++) a[i](arg);
    },
    clear() { this._h = Object.create(null); },
  };

  // ---------------------------------------------------------------- log
  // Ring buffer of player-facing messages. `kind` drives colour in the HUD strip.
  const Log = {
    lines: [],
    max: 200,
    push(text, kind) {
      this.lines.push({ text: String(text), kind: kind || 'info', t: Clock.t });
      if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
      Bus.emit('log', text);
    },
    tail(n) { return this.lines.slice(-n); },
    clear() { this.lines.length = 0; },
  };

  return {
    clamp, lerp, smooth, hashStr,
    Stream, RNG,
    PAL, PAL32, RAMPS, TRANSPARENT,
    shade, shadeBy, rampOf, shadeOf, idx, palIdx, palDither,
    Clock, MIN_PER_DAY, Bus, Log,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Core;
