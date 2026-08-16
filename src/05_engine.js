// 05_engine.js — framebuffer, raster primitives, presentation, and the 3D renderer.
// Owner: engine. Calls Core and World.
//
// This round implements the framebuffer/raster/present layer, which is stable and will not change,
// plus a test card. The heightfield march (per-column terrain stepping with overhead spans) lands
// in R2 and replaces `render3D`'s placeholder body. See ARCHITECTURE.md §7 for its contract.

const Engine = (() => {
  'use strict';

  const { PAL32, shade, clamp } = Core;

  // ---------------------------------------------------------------- framebuffer
  const W = 640, H = 480;

  // One byte per pixel: a PALETTE INDEX, not a colour. Nothing in this engine ever holds RGB.
  const buf = new Uint8Array(W * H);

  // Depth per column, written by the wall/terrain pass and read by the sprite pass so billboards
  // composite correctly against geometry.
  const zb = new Float32Array(W);

  // Clip rectangle. The 3D pass clips to the viewport hole; UI clips to whatever it is drawing.
  let cx0 = 0, cy0 = 0, cx1 = W, cy1 = H;

  function clip(x, y, w, h) {
    cx0 = clamp(x, 0, W); cy0 = clamp(y, 0, H);
    cx1 = clamp(x + w, 0, W); cy1 = clamp(y + h, 0, H);
  }
  function clipReset() { cx0 = 0; cy0 = 0; cx1 = W; cy1 = H; }

  function clear(pi) { buf.fill(pi | 0); }

  function px(x, y, pi) {
    if (x < cx0 || x >= cx1 || y < cy0 || y >= cy1) return;
    buf[y * W + x] = pi;
  }

  // Unclipped, uncheked write. Only for inner loops that have already bounds-checked.
  function pxFast(x, y, pi) { buf[y * W + x] = pi; }

  function hline(x, y, len, pi) {
    if (y < cy0 || y >= cy1) return;
    let a = x < cx0 ? cx0 : x;
    let b = x + len > cx1 ? cx1 : x + len;
    if (b <= a) return;
    buf.fill(pi, y * W + a, y * W + b);
  }

  function vline(x, y, len, pi) {
    if (x < cx0 || x >= cx1) return;
    let a = y < cy0 ? cy0 : y;
    let b = y + len > cy1 ? cy1 : y + len;
    for (let yy = a; yy < b; yy++) buf[yy * W + x] = pi;
  }

  function rect(x, y, w, h, pi) {
    for (let yy = y; yy < y + h; yy++) hline(x, yy, w, pi);
  }

  function frameRect(x, y, w, h, pi) {
    hline(x, y, w, pi); hline(x, y + h - 1, w, pi);
    vline(x, y, h, pi); vline(x + w - 1, y, h, pi);
  }

  // Blit an indexed sprite. Index 0 is transparent and is the ONLY transparent index.
  // `lit` is the shade level applied through the ramp: the same arithmetic every surface uses.
  function blit(spr, dx, dy, lit) {
    const sw = spr.w, sh = spr.h, d = spr.data;
    for (let y = 0; y < sh; y++) {
      const ty = dy + y;
      if (ty < cy0 || ty >= cy1) continue;
      const row = y * sw, trow = ty * W;
      for (let x = 0; x < sw; x++) {
        const pi = d[row + x];
        if (pi === 0) continue;                       // transparent
        const tx = dx + x;
        if (tx < cx0 || tx >= cx1) continue;
        buf[trow + tx] = lit === undefined ? pi : shade(pi, (pi & 0x0f) + lit);
      }
    }
  }

  // Scaled blit with nearest sampling — how a billboard sprite reaches the screen at distance.
  function blitScaled(spr, dx, dy, dw, dh, lit, mirror) {
    if (dw <= 0 || dh <= 0) return;
    const sw = spr.w, sh = spr.h, d = spr.data;
    const xs = sw / dw, ys = sh / dh;
    const x0 = dx < cx0 ? cx0 : dx, x1 = dx + dw > cx1 ? cx1 : dx + dw;
    const y0 = dy < cy0 ? cy0 : dy, y1 = dy + dh > cy1 ? cy1 : dy + dh;
    for (let ty = y0; ty < y1; ty++) {
      const sy = ((ty - dy) * ys) | 0;
      const srow = sy * sw, trow = ty * W;
      for (let tx = x0; tx < x1; tx++) {
        let sx = ((tx - dx) * xs) | 0;
        if (mirror) sx = sw - 1 - sx;
        const pi = d[srow + sx];
        if (pi === 0) continue;
        buf[trow + tx] = lit === undefined ? pi : shade(pi, (pi & 0x0f) + lit);
      }
    }
  }

  // ---------------------------------------------------------------- presentation
  let img = null, img32 = null;

  function present(ctx) {
    if (!img) {
      img = ctx.createImageData(W, H);
      img32 = new Uint32Array(img.data.buffer);
    }
    for (let i = 0, n = W * H; i < n; i++) img32[i] = PAL32[buf[i]];
    ctx.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------- test card
  // Renders before any world exists. Its real job is to prove three things early: the palette ramps
  // are monotonic, index 0 survives the pipeline, and the letterbox scaling is integer/nearest.
  function testCard() {
    clipReset();
    clear(Core.idx(0, 1));

    // 16 ramps x 16 shades, as a grid. Any non-monotonic ramp is visible instantly here.
    const cw = 34, ch = 18, ox = 32, oy = 46;
    for (let r = 0; r < 16; r++) {
      for (let s = 0; s < 16; s++) {
        rect(ox + s * cw, oy + r * ch, cw - 1, ch - 1, (r << 4) | s);
      }
    }

    // Frame around the grid, and a marker column showing shade() clamping on ramp 0.
    frameRect(ox - 2, oy - 2, 16 * cw + 3, 16 * ch + 3, Core.idx(13, 11));

    // Alignment marks at the exact corners of the 3D viewport, so a capture can be checked for
    // off-by-one scaling without measuring pixels by eye.
    const V = VIEW;
    frameRect(V.x, V.y, V.w, V.h, Core.idx(15, 12));
    rect(V.x, V.y, 3, 3, Core.idx(0, 15));
    rect(V.x + V.w - 3, V.y + V.h - 3, 3, 3, Core.idx(0, 15));

    // HUD band boundary.
    hline(0, HUD.y, W, Core.idx(13, 8));
  }

  // ---------------------------------------------------------------- layout
  // Design decisions calibrated to the 640x480 frame. NOT measurements of MM6 — real measured
  // numbers belong in critique/MM6_REFERENCE.md, which needs reference material this build does
  // not have. See ARCHITECTURE.md §11.
  const VIEW = { x: 8, y: 8, w: 624, h: 344 };
  const HUD = { x: 0, y: 352, w: 640, h: 128 };

  // Projection scale, from the vertical FOV implied by a 70 degree horizontal FOV at VIEW's
  // aspect. Computed once; the march and the sprite pass both read it.
  const FOV_H = 70 * Math.PI / 180;
  const FOV_V = 2 * Math.atan(Math.tan(FOV_H / 2) * (VIEW.h / VIEW.w));
  const PROJ = VIEW.h / (2 * Math.tan(FOV_V / 2));

  // ---------------------------------------------------------------- 3D
  // R2 replaces this body with the per-column heightfield march described in ARCHITECTURE.md §7.
  // It is deliberately a visible placeholder rather than a silent no-op: a blank viewport in a
  // capture must be unmistakably "not implemented", not "maybe the world failed to load".
  function render3D(cam) {
    clip(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    for (let y = 0; y < VIEW.h; y++) {
      const t = y / VIEW.h;
      hline(VIEW.x, VIEW.y + y, VIEW.w, Core.idx(9, 3 + ((t * 9) | 0)));
    }
    clipReset();
  }

  return {
    W, H, buf, zb,
    clip, clipReset, clear, px, pxFast, hline, vline, rect, frameRect, blit, blitScaled,
    present, testCard, render3D,
    VIEW, HUD, FOV_H, FOV_V, PROJ,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
