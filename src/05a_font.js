// 05a_font.js — the display face: hand-authored serif skeletons, rasterised with real coverage.
// Owner: art. Calls Core only.
//
// WHY THIS EXISTS
//
// A cold discriminator panel was shown 38 screenshots — 16 from the real 1998 game, 22 from this
// one — and told only that some were real. It scored 38/38. Asked what the tell was, it did not
// say "the terrain" or "the monsters". It said:
//
//   "every glyph in the imitation occupies an identical fixed-width cell ... no kerning pairs, no
//    optical baseline shifts, and no serif stroke modulation anywhere, whereas the 1998 game uses
//    an anti-aliased italic serif display face with genuine thick/thin contrast."
//
// I measured before believing it, because that is the rule. It was right, and worse than it knew:
// the old 5x7 table advertised itself in a comment as PROPORTIONAL, and 57 of its 62 glyphs
// advanced by exactly 6 pixels. "PARTY", "MAGIC", "WAIT" and "Harrowgate" were all precisely
// fixed-pitch. The comment was aspirational; nobody had ever measured it.
//
// So this is a real face, and it is built the way 1998 built one: draw big, downsample, keep the
// grey levels. Each glyph is a SKELETON of strokes and arcs in font units with an explicit pen
// weight. Vertical stems are heavy, horizontal bars are light, and terminals get slab serifs —
// that is what "thick/thin contrast" physically is. The skeleton is rasterised at 4x and box-
// downsampled, which produces genuine partial coverage at every curve and diagonal.
//
// Anti-aliasing in a palettised framebuffer is not alpha. Coverage picks an intermediate PALETTE
// ENTRY between what is already on the pixel and the ink colour, via a cached blend LUT — the same
// trick the renderer's distance fog uses, for the same reason: it is a real colour blend rather
// than a dither pretending to be one.
//
// Two optical sizes are baked from the SAME skeletons, because scaling one size to the other is
// exactly the "algorithmically derived" quality the panel identified. Small is not large shrunk;
// it is the same drawing rasterised at different metrics, with the pen kept proportionally heavier
// so it does not go spindly — which is what an optical size IS.

const Font = (() => {
  'use strict';

  // ------------------------------------------------------------------ units
  // Font units, y-UP from the baseline. One em is 40 units of cap height.
  const CAP = 40;   // cap height
  const XH = 28;    // x-height
  const DESC = 12;  // depth below baseline
  const ASC = 44;   // cell top above baseline (accents and the taller ascenders live here)

  const STEM = 6;   // vertical stroke weight  — the THICK
  const HAIR = 4;   // horizontal stroke weight — the THIN
  const SEX = 6;    // serif extension either side of a stem centre
  const SET = 3;    // serif slab thickness

  const SS = 4;     // supersample factor per axis; 16 samples per output pixel
  const PADPX = 2;  // raster padding either side, so overhanging serifs are not clipped away

  // ------------------------------------------------------------------ ops
  // s: stroke      x0 y0 x1 y1 w        (square-capped line of width w)
  // r: rect        x0 y0 x1 y1          (axis aligned)
  // a: arc         cx cy rx ry w a0 a1  (elliptical ring segment, degrees, ccw, 0 = east)
  // t: stem        x y0 y1 flags        (vertical stem plus slab serifs; 1 top, 2 bottom, 3 both)
  // b: bar         x0 x1 y              (horizontal hairline bar, centred on y)
  const s = (x0, y0, x1, y1, w) => ['s', x0, y0, x1, y1, w === undefined ? STEM : w];
  const r = (x0, y0, x1, y1) => ['r', x0, y0, x1, y1];
  const a = (cx, cy, rx, ry, a0, a1, w) => ['a', cx, cy, rx, ry, w === undefined ? STEM : w, a0, a1];
  const t = (x, y0, y1, f) => ['t', x, y0, y1, f === undefined ? 3 : f];
  const b = (x0, x1, y) => ['r', x0, y - HAIR / 2, x1, y + HAIR / 2];

  // A stem's serif slabs, expanded at raster time so SEX/SET stay tunable in one place.
  function expandStem(op, out) {
    const [, x, y0, y1, f] = op;
    out.push(['s', x, y0, x, y1, STEM]);
    if (f & 1) out.push(['r', x - SEX, y1 - SET, x + SEX, y1]);
    if (f & 2) out.push(['r', x - SEX, y0, x + SEX, y0 + SET]);
  }

  // ------------------------------------------------------------------ glyphs
  // adv = advance width in font units. Widths are drawn from the shapes, not from a grid: I is
  // narrow, M and W are wide, and the round letters overshoot the flat ones top and bottom because
  // a circle that stops exactly on the cap line reads short. That overshoot is why this cannot be
  // a fixed cell.
  const G = {};
  const def = (ch, adv, ops) => { G[ch] = { adv, ops }; };

  const OV = 1.5; // round-letter overshoot

  // ---- uppercase
  def('A', 32, [s(16, CAP, 5, 0, STEM), s(16, CAP, 27, 0, STEM), b(9, 23, 13),
    r(1, 0, 11, SET), r(21, 0, 31, SET)]);
  def('B', 31, [t(7, 0, CAP, 3), b(7, 20, CAP - HAIR / 2), b(7, 19, XH - 4), b(7, 21, HAIR / 2),
    a(19, CAP - 8, 8, 8, -90, 90), a(19, 9, 10, 9, -90, 90)]);
  def('C', 31, [a(17, 20, 12, 20 + OV, 35, 325)]);
  def('D', 33, [t(7, 0, CAP, 3), b(7, 18, CAP - HAIR / 2), b(7, 18, HAIR / 2),
    a(18, 20, 11, 20, -90, 90)]);
  def('E', 29, [t(7, 0, CAP, 3), b(7, 26, CAP - HAIR / 2), b(7, 21, 20), b(7, 27, HAIR / 2)]);
  def('F', 28, [t(7, 0, CAP, 3), b(7, 26, CAP - HAIR / 2), b(7, 21, 20)]);
  def('G', 33, [a(17, 20, 12, 20 + OV, 35, 325), r(20, 16, 30, 16 + HAIR), s(28, 16, 28, 2, STEM)]);
  def('H', 34, [t(7, 0, CAP, 3), t(27, 0, CAP, 3), b(7, 27, 20)]);
  def('I', 18, [t(9, 0, CAP, 3)]);
  def('J', 22, [s(15, CAP, 15, 10, STEM), a(9, 10, 6, 10, 180, 340), r(9, CAP - SET, 21, CAP)]);
  def('K', 33, [t(7, 0, CAP, 3), s(9, 18, 29, CAP, STEM - 1), s(14, 22, 30, 0, STEM),
    r(23, CAP - SET, 33, CAP), r(23, 0, 33, SET)]);
  def('L', 28, [t(7, 0, CAP, 1), b(7, 26, HAIR / 2)]);
  def('M', 40, [t(6, 0, CAP, 2), t(34, 0, CAP, 2), s(6, CAP, 20, 12, STEM - 1),
    s(34, CAP, 20, 12, STEM - 1), r(0, CAP - SET, 12, CAP), r(28, CAP - SET, 40, CAP)]);
  def('N', 35, [t(7, 0, CAP, 2), t(28, 0, CAP, 2), s(7, CAP, 28, 0, STEM),
    r(1, CAP - SET, 13, CAP), r(22, CAP - SET, 34, CAP)]);
  def('O', 35, [a(17, 20, 12, 20 + OV, 0, 360)]);
  def('P', 30, [t(7, 0, CAP, 3), b(7, 19, CAP - HAIR / 2), b(7, 19, 20),
    a(19, CAP - 10, 9, 10, -90, 90)]);
  def('Q', 35, [a(17, 20, 12, 20 + OV, 0, 360), s(20, 10, 30, -4, STEM)]);
  def('R', 32, [t(7, 0, CAP, 3), b(7, 19, CAP - HAIR / 2), b(7, 19, 20),
    a(19, CAP - 10, 9, 10, -90, 90), s(19, 20, 30, 0, STEM), r(24, 0, 34, SET)]);
  def('S', 29, [a(15, 30, 9, 9, 20, 250), a(15, 11, 10, 11, 200, 430)]);
  def('T', 30, [t(15, 0, CAP, 0), r(9, 0, 21, SET), r(1, CAP - HAIR, 29, CAP)]);
  def('U', 34, [s(7, CAP, 7, 12, STEM), s(27, CAP, 27, 12, STEM), a(17, 12, 10, 12, 180, 360),
    r(1, CAP - SET, 13, CAP), r(21, CAP - SET, 33, CAP)]);
  def('V', 32, [s(16, 0, 5, CAP, STEM), s(16, 0, 27, CAP, STEM),
    r(-1, CAP - SET, 11, CAP), r(21, CAP - SET, 33, CAP)]);
  def('W', 46, [s(12, 0, 4, CAP, STEM), s(12, 0, 23, CAP - 12, STEM),
    s(34, 0, 23, CAP - 12, STEM), s(34, 0, 42, CAP, STEM),
    r(-2, CAP - SET, 10, CAP), r(36, CAP - SET, 48, CAP)]);
  def('X', 32, [s(5, 0, 27, CAP, STEM), s(27, 0, 5, CAP, STEM),
    r(-1, CAP - SET, 11, CAP), r(21, CAP - SET, 33, CAP), r(-1, 0, 11, SET), r(21, 0, 33, SET)]);
  def('Y', 32, [s(16, 18, 5, CAP, STEM), s(16, 18, 27, CAP, STEM), t(16, 0, 20, 2),
    r(-1, CAP - SET, 11, CAP), r(21, CAP - SET, 33, CAP)]);
  def('Z', 30, [b(5, 25, CAP - HAIR / 2), b(4, 26, HAIR / 2), s(24, CAP - HAIR, 6, HAIR, STEM)]);

  // ---- lowercase. Bowls are built to the x-height, not to half of it: the first cut put every
  // round lowercase at 18 units against an x-height of 28, so "a" came out a small circle with a
  // tail and read as "q" in every word on screen.
  const XR = XH / 2;            // bowl radius for o/b/d/p/q — a true x-height round
  def('a', 27, [a(12, 8, 8, 8, 0, 360), s(21, 0, 21, 25, STEM),
    a(12, 19, 9, 8, 15, 165), r(15, 0, 26, SET)]);
  def('b', 28, [t(6, 0, ASC - 4, 1), a(15, XR, XR - 1, XR - 1, -100, 100),
    b(6, 15, XH - HAIR / 2), b(6, 15, HAIR / 2)]);
  def('c', 25, [a(13, XR, XR - 1, XR - 1, 35, 325)]);
  def('d', 28, [t(22, 0, ASC - 4, 1), a(13, XR, XR - 1, XR - 1, 80, 280),
    b(13, 22, XH - HAIR / 2), b(13, 22, HAIR / 2)]);
  def('e', 26, [a(13, XR, XR - 1, XR - 1, 0, 320), b(2, 24, XR + 1)]);
  def('f', 19, [s(13, 0, 13, ASC - 8, STEM), a(19, ASC - 8, 6, 6, 90, 200),
    r(3, XH - HAIR, 23, XH), r(7, 0, 19, SET)]);
  def('g', 27, [a(13, XR, XR - 1, XR - 1, 0, 360), s(22, XH, 22, -4, STEM),
    a(16, -4, 6, 6, 185, 350)]);
  def('h', 28, [t(6, 0, ASC - 4, 1), a(15, XH - 13, 9, 13, 0, 180), t(24, 0, XH - 13, 2),
    b(6, 15, HAIR / 2)]);
  def('i', 15, [t(8, 0, XH, 3), r(4, XH + 7, 12, XH + 14)]);
  def('j', 15, [s(8, XH, 8, -6, STEM), a(2, -6, 6, 6, 190, 350), r(4, XH + 7, 12, XH + 14),
    r(2, XH - SET, 14, XH)]);
  def('k', 26, [t(6, 0, ASC - 4, 1), s(8, 9, 24, XH, STEM - 1), s(12, 12, 25, 0, STEM),
    b(6, 12, HAIR / 2), r(18, 0, 28, SET)]);
  def('l', 15, [t(8, 0, ASC - 4, 1), r(2, 0, 14, SET)]);
  def('m', 42, [t(6, 0, XH, 2), a(15, XH - 13, 9, 13, 0, 180), t(24, 0, XH - 13, 2),
    a(33, XH - 13, 9, 13, 0, 180), t(42, 0, XH - 13, 2), b(0, 12, HAIR / 2)]);
  def('n', 28, [t(6, 0, XH, 2), a(15, XH - 13, 9, 13, 0, 180), t(24, 0, XH - 13, 2),
    b(0, 12, HAIR / 2)]);
  def('o', 27, [a(13, XR, XR - 1, XR - 1, 0, 360)]);
  def('p', 28, [t(6, -DESC + 2, XH, 2), a(15, XR, XR - 1, XR - 1, -100, 100),
    b(6, 15, XH - HAIR / 2), b(6, 15, HAIR / 2)]);
  def('q', 28, [t(22, -DESC + 2, XH, 2), a(13, XR, XR - 1, XR - 1, 80, 280),
    b(13, 22, XH - HAIR / 2), b(13, 22, HAIR / 2)]);
  def('r', 21, [t(6, 0, XH, 2), a(16, XH - 11, 10, 11, 25, 165), b(0, 12, HAIR / 2)]);
  def('s', 23, [a(12, XH - 7, 7, 7, 15, 250), a(12, 7, 7.5, 7, 200, 430)]);
  def('t', 19, [s(9, 4, 9, ASC - 10, STEM), s(9, 3, 16, 6, STEM - 2),
    r(1, XH - HAIR, 19, XH)]);
  def('u', 28, [t(6, 13, XH, 1), a(15, 13, 9, 13, 180, 360), t(24, 0, XH, 1),
    b(18, 30, HAIR / 2)]);
  def('v', 26, [s(13, 0, 4, XH, STEM), s(13, 0, 22, XH, STEM), r(-1, XH - SET, 9, XH),
    r(17, XH - SET, 27, XH)]);
  def('w', 38, [s(10, 0, 3, XH, STEM), s(10, 0, 19, XH - 11, STEM),
    s(28, 0, 19, XH - 11, STEM), s(28, 0, 35, XH, STEM),
    r(-2, XH - SET, 8, XH), r(30, XH - SET, 40, XH)]);
  def('x', 26, [s(4, 0, 22, XH, STEM), s(22, 0, 4, XH, STEM), r(-1, XH - SET, 9, XH),
    r(17, XH - SET, 27, XH), r(-1, 0, 9, SET), r(17, 0, 27, SET)]);
  def('y', 26, [s(13, -1, 4, XH, STEM), s(22, XH, 9, -DESC + 2, STEM),
    r(-1, XH - SET, 9, XH), r(17, XH - SET, 27, XH)]);
  def('z', 24, [b(4, 20, XH - HAIR / 2), b(3, 21, HAIR / 2), s(19, XH - HAIR, 5, HAIR, STEM)]);

  // ---- digits. Lining figures, cap height, and 1 is NOT the same width as 0 — a table of
  // numbers that all advance identically is the single loudest fixed-pitch tell in a stat screen.
  def('0', 30, [a(15, 20, 10, 20 + OV, 0, 360)]);
  def('1', 22, [t(13, 0, CAP, 2), s(13, CAP, 5, CAP - 9, STEM - 1), r(3, 0, 23, SET)]);
  def('2', 28, [a(14, 28, 10, 10, -20, 200), s(24, 26, 4, HAIR, STEM), b(4, 25, HAIR / 2)]);
  def('3', 28, [a(13, 30, 9, 9, -50, 200), a(13, 10, 10, 10, 200, 480)]);
  def('4', 30, [s(20, 0, 20, CAP, STEM), s(20, CAP, 3, 12, STEM - 1), b(3, 28, 12),
    r(13, 0, 27, SET)]);
  // '5' had a bowl sweeping nearly the full circle, which read as an S at a glance and as a 6 in a
  // price. A veteran read "53g" as 59g and "165g" as "16'5g" in the armourer's — the one string in
  // a shop that has to be unambiguous. The bowl is open at the upper left now, the way a 5 is.
  def('5', 28, [r(6, CAP - HAIR, 26, CAP), s(8, CAP, 8, 23, STEM), r(8, 21, 17, 25),
    a(15, 12, 11, 12, -168, 82)]);
  def('6', 28, [a(14, 11, 11, 11, 0, 360), a(18, 26, 13, 15, 60, 170)]);
  def('7', 27, [r(3, CAP - HAIR, 26, CAP), s(24, CAP, 10, 0, STEM), r(4, 0, 16, SET)]);
  def('8', 29, [a(14, 30, 9, 9, 0, 360), a(14, 10, 11, 11, 0, 360)]);
  def('9', 28, [a(15, 29, 11, 11, 0, 360), a(11, 14, 13, 15, 240, 350)]);

  // ---- punctuation
  def(' ', 14, []);
  def('.', 14, [r(4, 0, 11, 6)]);
  def(',', 14, [r(4, 0, 11, 6), s(9, 3, 4, -8, 5)]);
  def(':', 14, [r(4, 0, 11, 6), r(4, XH - 8, 11, XH - 2)]);
  def(';', 14, [r(4, XH - 8, 11, XH - 2), r(4, 0, 11, 6), s(9, 3, 4, -8, 5)]);
  def('!', 15, [s(8, 16, 8, CAP, STEM), r(3, 0, 13, 6)]);
  def('?', 25, [a(13, 29, 9, 9, -30, 220), s(13, 20, 13, 12, STEM - 1), r(9, 0, 17, 7)]);
  def("'", 12, [s(6, CAP - 12, 6, CAP, 5)]);
  def('"', 19, [s(6, CAP - 12, 6, CAP, 5), s(14, CAP - 12, 14, CAP, 5)]);
  def('-', 20, [r(3, 18, 18, 22)]);
  // The UI writes an EM DASH — "MAP — HARROWGATE VALE", "Rest the night — 10 gold". It was not in
  // the face, so five separate screens rendered a '?' where the separator belonged.
  def('\u2014', 34, [r(1, 18, 33, 22)]);
  def('\u2013', 24, [r(1, 18, 23, 22)]);
  def('/', 24, [s(3, -3, 21, CAP + 3, STEM - 1)]);
  def('(', 16, [a(17, 19, 13, 23, 126, 234, STEM + 1)]);
  def(')', 16, [a(-1, 19, 13, 23, -54, 54, STEM + 1)]);
  def('+', 26, [r(2, 18, 25, 23), r(10, 8, 17, 33)]);
  def('=', 26, [r(2, 24, 25, 28), r(2, 13, 25, 17)]);
  def('%', 42, [a(11, 31, 7, 7, 0, 360, HAIR), a(31, 9, 7, 7, 0, 360, HAIR),
    s(6, 0, 36, CAP, HAIR)]);
  def('&', 34, [a(13, 31, 8, 8, 30, 340, STEM - 1), a(14, 11, 11, 11, 20, 300),
    s(11, 23, 32, 0, STEM - 1)]);
  def('*', 22, [s(11, CAP - 14, 11, CAP, 4), s(4, CAP - 12, 18, CAP - 2, 4),
    s(18, CAP - 12, 4, CAP - 2, 4)]);
  def('<', 26, [s(21, 30, 4, 19, HAIR + 1), s(4, 19, 21, 8, HAIR + 1)]);
  def('>', 26, [s(5, 30, 22, 19, HAIR + 1), s(22, 19, 5, 8, HAIR + 1)]);

  // ------------------------------------------------------------------ raster
  // Distance-field fill at SS resolution, then a box downsample. Every curve and every diagonal
  // comes out with real partial coverage; nothing here dithers.
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const L = dx * dx + dy * dy;
    let u = L === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / L;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = x0 + u * dx - px, qy = y0 + u * dy - py;
    return Math.sqrt(qx * qx + qy * qy);
  }

  function inArc(px, py, cx, cy, rx, ry, w, a0, a1) {
    const dx = px - cx, dy = py - cy;
    // Elliptical radius, converted back to an approximate distance in pixels so the pen keeps a
    // constant weight around the curve instead of thinning at the flat of the ellipse.
    const nx = dx / rx, ny = dy / ry;
    const rr = Math.sqrt(nx * nx + ny * ny);
    if (rr === 0) return false;
    const grad = Math.sqrt((nx / rx) * (nx / rx) + (ny / ry) * (ny / ry));
    const dist = Math.abs(rr - 1) / (grad || 1e-6);
    if (dist > w / 2) return false;
    let ang = Math.atan2(dy, dx) * 180 / Math.PI;
    if (ang < 0) ang += 360;
    let lo = a0, hi = a1;
    while (hi < lo) hi += 360;
    for (let k = -360; k <= 720; k += 360) {
      if (ang + k >= lo && ang + k <= hi) return true;
    }
    return false;
  }

  // Rasterise one glyph at a given unit scale. `scale` maps font units to output pixels.
  function raster(glyph, scale, weight, ss, cap) {
    const advPx = Math.max(1, Math.round(glyph.adv * scale));
    const top = ASC, bot = -DESC;
    const rows = Math.ceil((top - bot) * scale);
    // Glyphs legitimately paint outside their advance: serif slabs on V, W, X and Y overhang both
    // sides, and the round letters overshoot. Padding the raster and recording the bearing keeps
    // that ink instead of shaving it flat, which is what turns a drawn V back into a triangle.
    const W = advPx + PADPX * 2, H = rows;
    const cov = new Uint8Array(W * H);

    // Expand stems into their primitives once.
    const ops = [];
    for (const op of glyph.ops) {
      if (op[0] === 't') expandStem(op, ops); else ops.push(op);
    }
    if (!ops.length) return { w: advPx, h: H, adv: advPx, cov, cw: W, lsb: -PADPX };

    const inv = 1 / (scale * ss);
    const padU = PADPX / scale;
    const nsamp = ss * ss;
    for (let py = 0; py < H * ss; py++) {
      // y-up font units at this subsample row centre
      const fy = top - (py + 0.5) * inv;
      for (let px = 0; px < W * ss; px++) {
        const fx = (px + 0.5) * inv - padU;
        let hitv = false;
        for (let i = 0; i < ops.length && !hitv; i++) {
          const o = ops[i];
          if (o[0] === 's') {
            if (segDist(fx, fy, o[1], o[2], o[3], o[4]) <= (o[5] * weight) / 2) hitv = true;
          } else if (o[0] === 'r') {
            if (fx >= o[1] && fx <= o[3] && fy >= o[2] && fy <= o[4]) hitv = true;
          } else if (o[0] === 'a') {
            if (inArc(fx, fy, o[1], o[2], o[3], o[4], o[5] * weight, o[6], o[7])) hitv = true;
          }
        }
        if (hitv) cov[((py / ss) | 0) * W + ((px / ss) | 0)]++;
      }
    }
    // AUTO-FIT THE SPACING TO THE DRAWING.
    //
    // The advances above were authored by eye in font units and never checked against the
    // rasterised ink. Measured at cap 12, FORTY glyphs painted outside their own advance box —
    // 'r' by 2px on an advance of 6, a 33% overrun, so its shoulder landed inside the next letter
    // and "Thornmarch" read "Thommarch", "Dorn" read "Dom", "Harrowgate" read "Hanowgate". A
    // veteran found all three by reading the game's own words back wrong.
    //
    // A type designer does not guess bearings; they fit them to the outline. So does this: find
    // the ink, seat it a bearing in from the pen, and make the advance the ink plus a bearing each
    // side. Narrow letters stay narrow and wide letters stay wide, because the width comes from
    // the drawing. Only the spacing is normalised, and it can no longer disagree with the shapes.
    let inkL = W, inkR = -1;
    for (let yy = 0; yy < H; yy++) {
      for (let xx = 0; xx < W; xx++) {
        if (cov[yy * W + xx] > 0) { if (xx < inkL) inkL = xx; if (xx > inkR) inkR = xx; }
      }
    }
    if (inkR < 0) return { w: advPx, h: H, adv: advPx, cov, cw: W, lsb: -PADPX, nsamp };
    const bear = Math.max(1, Math.round(cap * 0.10));
    const fitted = bear + (inkR - inkL + 1) + bear;
    return { w: fitted, h: H, adv: fitted, cov, cw: W, lsb: bear - inkL, nsamp };
  }

  // ------------------------------------------------------------------ faces
  // A face is built for a requested CAP HEIGHT IN PIXELS, lazily, and cached. Because every size
  // comes off the same skeletons, a heading is not a body glyph scaled up — it is the same drawing
  // rasterised at heading size, with its curves resolved at that size. Scaling one bitmap to make
  // another is precisely the "algorithmically derived" quality the panel named.
  //
  // The pen gets proportionally heavier as the face gets smaller. A stem that is right at 12px is
  // a single grey row at 7px and the whole face turns to mist; this is what an optical size is.
  const FACES = new Map();

  function weightFor(capPx) {
    return capPx <= 7 ? 1.12 : capPx <= 9 ? 1.06 : capPx >= 24 ? 0.94 : 1.0;
  }

  function face(capPx) {
    const cap = Math.max(5, Math.round(capPx || 12));
    let f = FACES.get(cap);
    if (f) return f;
    const scale = cap / CAP;
    const weight = weightFor(cap);
    // Big faces do not need 16 samples per pixel to resolve a curve, and at title size the full
    // supersample is seconds of work for one string.
    const ss = cap >= 20 ? 2 : SS;
    f = {
      glyphs: {}, scale, cap,
      rows: Math.ceil((ASC + DESC) * scale),
      base: Math.ceil(ASC * scale),
    };
    for (const ch of Object.keys(G)) f.glyphs[ch] = raster(G[ch], scale, weight, ss, cap);
    FACES.set(cap, f);
    return f;
  }

  // Kerning. Not a full pair table — the handful of pairs that visibly gap in a serif face, which
  // is exactly what "no kerning pairs" was pointing at.
  const KERN = {
    'AV': -3, 'AW': -3, 'AY': -3, 'AT': -2, 'VA': -3, 'WA': -3, 'YA': -3, 'TA': -2,
    'LT': -3, 'LV': -3, 'LY': -3, 'LW': -3, 'PA': -2, 'FA': -2, 'RT': -1, 'RV': -1, 'RY': -1,
    'To': -3, 'Tr': -2, 'Ta': -3, 'Te': -3, 'Tu': -2, 'Ty': -2, 'Ts': -2,
    'Vo': -2, 'Ve': -2, 'Va': -2, 'Wa': -2, 'We': -2, 'Wo': -2, 'Ya': -3, 'Yo': -2, 'Ye': -2,
    'r.': -2, 'y.': -2, 'w.': -2, 'v.': -2, 'r,': -2, 'y,': -2,
    'f.': -1, 'P.': -2, 'F.': -2, 'L ': -1, 'ov': -1, 'ow': -1, 'oy': -1,
  };

  function kern(f, prev, ch) {
    if (!prev) return 0;
    const k = KERN[prev + ch];
    if (!k) return 0;
    // Kern values are in font units; at small sizes a 3-unit pull rounds to zero rather than
    // closing the gap entirely.
    return Math.round(k * f.scale);
  }

  function width(str, capPx) {
    const f = face(capPx);
    let w = 0, prev = '';
    for (const ch of String(str)) {
      const g = f.glyphs[ch] || f.glyphs['?'];
      w += kern(f, prev, ch) + g.adv;
      prev = ch;
    }
    return w;
  }

  // Draw. `put(x, y, level)` receives coverage level 1..3; the caller decides how to turn that
  // into a palette index, because only the caller knows whether it is drawing ink or a shadow.
  function draw(str, x, y, capPx, put) {
    const f = face(capPx);
    let cx = Math.round(x);
    let prev = '';
    for (const ch of String(str)) {
      const g = f.glyphs[ch] || f.glyphs['?'];
      cx += kern(f, prev, ch);
      const { cov, cw } = g;
      for (let ry = 0; ry < g.h; ry++) {
        for (let rx = 0; rx < cw; rx++) {
          const c = cov[ry * cw + rx];
          if (!c) continue;
          // 16 subsamples -> 3 ink levels. Anything under a fifth of a pixel is not ink.
          const lv = c >= g.nsamp * 0.72 ? 3 : c >= g.nsamp * 0.38 ? 2 : c >= g.nsamp * 0.16 ? 1 : 0;
          if (lv) put(cx + g.lsb + rx, y + ry, lv);
        }
      }
      cx += g.adv;
      prev = ch;
    }
    return cx - Math.round(x);
  }

  function metrics(capPx) {
    const f = face(capPx);
    return { rows: f.rows, base: f.base, cap: f.cap, scale: f.scale };
  }

  return { draw, width, metrics, face };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Font;
