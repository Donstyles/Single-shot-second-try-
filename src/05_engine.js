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
  // The 3D view is INSET, with carved chrome to its left and right that holds the touch controls.
  // Three separate reviews reported the same thing and the art critic ranked it first of five:
  // "get the movement D-pad and the USE/ATK/CST buttons out of the 3D viewport — translucent
  // buttons floating inside the world is mobile-game grammar that did not exist in 1998, and it is
  // why nine of these shots have nowhere for the eye to go: the near ground plane is covered by
  // UI." It also costs nothing in art. The world gets narrower; it stops being a phone game.
  const CHROME_W = 88;
  const VIEW = { x: CHROME_W + 8, y: 8, w: 640 - 2 * (CHROME_W + 8), h: 344 };
  const CHROME_L = { x: 0, y: 0, w: CHROME_W, h: 352 };
  const CHROME_R = { x: 640 - CHROME_W, y: 0, w: CHROME_W, h: 352 };
  const HUD = { x: 0, y: 352, w: 640, h: 128 };

  // Projection scale, from the vertical FOV implied by a 70 degree horizontal FOV at VIEW's
  // aspect. Computed once; the march and the sprite pass both read it.
  // 57 degrees horizontal on the new 448x344 viewport gives ~46 degrees VERTICAL, which is what
  // MM6 framed with. Vertical FOV is the one that decides how much ground and sky a screenshot
  // holds; keeping 70 on a squarer view would have widened it to 56 and fish-eyed every frame.
  const FOV_H = 57 * Math.PI / 180;
  const FOV_V = 2 * Math.atan(Math.tan(FOV_H / 2) * (VIEW.h / VIEW.w));
  const PROJ = VIEW.h / (2 * Math.tan(FOV_V / 2));

  // ================================================================ the 3D pass
  // A per-column heightfield march. This REPLACES the floor caster rather than sitting beside it:
  // one loop produces terrain, buildings, roofs and spans, because they are all the same thing —
  // an interval of solid matter over a cell.
  //
  // A flat grid of full-height walls reads as Wolfenstein, not MM6, and no texture quality repairs
  // that. Everything below exists to make the ground itself have shape.

  const STOREY = 3.20;
  const CEIL = 3.20;          // dungeon ceiling height
  const EYE = 1.30;
  const MAX_STEPS = 150;

  // Ordered-dither fog. Palette indices cannot be blended arithmetically across ramps, so distance
  // fade is a dithered REPLACEMENT with the sky index — which is exactly what 1998 did, and why
  // fog dissolves geometry into the sky instead of into black.
  const FOG_BAYER = [
    0.0078, 0.5078, 0.1328, 0.6328, 0.0391, 0.5391, 0.1641, 0.6641,
    0.7578, 0.2578, 0.8828, 0.3828, 0.7891, 0.2891, 0.9141, 0.4141,
    0.1953, 0.6953, 0.0703, 0.5703, 0.2266, 0.7266, 0.1016, 0.6016,
    0.9453, 0.4453, 0.8203, 0.3203, 0.9766, 0.4766, 0.8516, 0.3516,
    0.0547, 0.5547, 0.1797, 0.6797, 0.0234, 0.5234, 0.1484, 0.6484,
    0.8047, 0.3047, 0.9297, 0.4297, 0.7734, 0.2734, 0.8984, 0.3984,
    0.2422, 0.7422, 0.1172, 0.6172, 0.2109, 0.7109, 0.0859, 0.5859,
    0.9922, 0.4922, 0.8672, 0.3672, 0.9609, 0.4609, 0.8359, 0.3359,
  ];

  // Per-column span bands already drawn, so a bridge deck can occupy rows ABOVE ground that is
  // already filled. Front-to-back with a single "filled to y" marker breaks exactly here; this is
  // the one place the cheap trick does not survive contact.
  const bandY0 = new Int16Array(16);
  const bandY1 = new Int16Array(16);

  // ------------------------------------------------------------------ fog
  // Fog is a TRUE COLOUR BLEND toward the horizon, quantised to the palette afterwards — not a
  // stencil. Every previous attempt (threshold-swap, then shade-walk plus a crossover dither) put
  // an ordered lattice on the screen, and three separate cold reviews called it out by name: "I
  // can trace unbroken vertical columns of blue pixels straight across the black, crossing wall,
  // floor and void without deviating." A framebuffer-wide screen door is a post-process from a
  // different decade. So: lerp RGB, find the nearest palette entry, cache the answer.
  //
  // The cache is what makes this affordable. 17 fog steps x 256 source colours per target colour,
  // built once per distinct horizon colour and kept for the life of the page. A sky band holds
  // only a handful of distinct indices, so the whole day cycle costs a few dozen tables.
  const FOG_STEPS = 17;
  const fogLuts = new Map();

  function fogLut(target) {
    let lut = fogLuts.get(target);
    if (lut) return lut;
    lut = new Uint8Array(256 * FOG_STEPS);
    const tr = Core.PAL[target * 3], tg = Core.PAL[target * 3 + 1], tb = Core.PAL[target * 3 + 2];
    for (let i = 0; i < 256; i++) {
      const r = Core.PAL[i * 3], g = Core.PAL[i * 3 + 1], b = Core.PAL[i * 3 + 2];
      for (let q = 0; q < FOG_STEPS; q++) {
        const t = q / (FOG_STEPS - 1);
        lut[i * FOG_STEPS + q] = Core.palIdx(
          Math.round(r + (tr - r) * t), Math.round(g + (tg - g) * t), Math.round(b + (tb - b) * t));
      }
    }
    fogLuts.set(target, lut);
    return lut;
  }

  // The one legitimate use of the Bayer matrix that survives: dithering the fog PARAMETER between
  // two adjacent LUT steps, so a slow gradient does not band. This dithers the blend; it does not
  // punch holes in the image.
  function fogShade(texel, light, fog, band, y, fogRow, fogJit) {
    const pi = Core.shade(texel & 0xf0, (texel & 0x0f) + light);
    if (!band || fog <= 0.01) return pi;
    const target = band[y - VIEW.y];
    if (fog >= 0.999) return target;
    let q = fog * (FOG_STEPS - 1) + (FOG_BAYER[fogRow + (y & 7)] + fogJit) - 0.5;
    q = q < 0 ? 0 : (q > FOG_STEPS - 1 ? FOG_STEPS - 1 : q) | 0;
    return fogLut(target)[pi * FOG_STEPS + q];
  }

  // A dungeon has no sky. Distance in a sealed corridor resolves to BLACK, and the unmarched part
  // of a column is void, not daylight. Feeding the outdoor sky band to both put a bright pale-blue
  // panel at the end of every barrow corridor — an art critic reported it as "the skybox is
  // leaking into a sealed dungeon", which is exactly what it was.
  let voidBandCache = null;
  function voidBand() {
    if (!voidBandCache || voidBandCache.length !== VIEW.h) {
      voidBandCache = new Uint8Array(VIEW.h);          // index 0 is true black
    }
    return voidBandCache;
  }

  function render3D(cam, world) {
    const map = cam.map;
    if (!map) { testCard(); return; }

    clip(VIEW.x, VIEW.y, VIEW.w, VIEW.h);

    const dungeon = map.kind === 'dungeon';
    const horizon = VIEW.y + (VIEW.h >> 1) + (cam.horizon || 0);
    // The camera may never sit at or below the surface it stands on. When it did, the ground
    // projected ABOVE the horizon and the entire frame turned inside out — a first-time player
    // reported "trees hanging upside down from the top of the sky, trunks pointing up, canopies
    // below them" and concluded the renderer had come apart. It had not; the eye was underwater.
    let eyeZ = cam.z + EYE;
    if (dungeon) {
      if (eyeZ > CEIL - 0.25) eyeZ = CEIL - 0.25;
      if (eyeZ < 0.35) eyeZ = 0.35;
    } else {
      const standing = World.H(map, cam.x, cam.y);
      const floorZ = (standing > map.sea ? standing : map.sea) + 0.30;
      if (eyeZ < floorZ) eyeZ = floorZ;
    }
    const cosA = Math.cos(cam.ang), sinA = Math.sin(cam.ang);
    const halfFov = Math.tan(FOV_H / 2);

    const skyBand = dungeon ? voidBand() : (Art.skyBand ? Art.skyBand() : null);
    const light = map.light === undefined ? 1 : map.light;
    // NO SUN UNDERGROUND. A sealed barrow was being tinted by the outdoor clock, so at 05:08 the
    // inside of a burial mound glowed sunrise orange: "MM6 dungeons have their own lighting; that's
    // what makes inside feel like inside." Indoors the torch pool is the only light there is.
    const sun = dungeon ? 0 : (Art.sunShade ? Art.sunShade(light) : 0);
    const fogStart = map.fogStart, fogEnd = map.fogEnd;

    for (let sx = 0; sx < VIEW.w; sx++) {
      const px = VIEW.x + sx;

      // Sky first: everything the march does not cover stays sky, so a column that reaches the
      // horizon needs no separate pass.
      if (skyBand) {
        for (let y = 0; y < VIEW.h; y++) buf[(VIEW.y + y) * W + px] = skyBand[y];
      } else {
        for (let y = 0; y < VIEW.h; y++) buf[(VIEW.y + y) * W + px] = Core.idx(0, 1);
      }

      const camX = ((sx + 0.5) / VIEW.w) * 2 - 1;
      const rdx = cosA - sinA * camX * halfFov;
      const rdy = sinA + cosA * camX * halfFov;
      const rl = Math.hypot(rdx, rdy);
      const dx = rdx / rl, dy = rdy / rl;

      let ybuf = VIEW.y + VIEW.h;       // filled upward from the bottom of the viewport
      let ytop = VIEW.y;                // and DOWNWARD from the top, for dungeon ceilings
      let nBands = 0;
      let dist = 0.30;
      let step = dungeon ? 0.035 : 0.055;
      zb[px] = 1e9;

      for (let s = 0; s < MAX_STEPS && ybuf > ytop; s++) {
        // Step size grows with distance: ~150 steps then reach ~200 cells, and far detail collapses
        // into haze exactly where we want it anyway.
        dist += step;
        step *= dungeon ? 1.020 : 1.028;
        if (dist > fogEnd + 12) break;

        const wx = cam.x + dx * dist, wy = cam.y + dy * dist;
        const cx = Math.floor(wx), cy = Math.floor(wy);
        if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) break;

        const ci = cy * map.w + cx;
        const cell = map.cells[ci];
        const solid = (cell & 128) !== 0;
        const mat = cell & 0x7f;

        const gh = dungeon ? 0 : World.H(map, wx, wy);
        const invD = PROJ / dist;

        // Fog: how much of this sample is eaten by distance.
        const fog = clamp((dist - fogStart) / Math.max(1, fogEnd - fogStart), 0, 1);
        const fogRow = (sx & 7) * 8;
        // Break the Bayer lattice: without this the threshold is periodic in screen space and a
        // large evenly-fogged face reads as a visible grid rather than as haze.
        const fogJit = (((sx * 1103515245 + s * 12345) >>> 16) & 31) / 512;

        // ---- ground / water surface
        const isWater = mat === World.MAT.water;
        const surfH = isWater ? map.sea : gh;
        const yG = (horizon + (eyeZ - gh) * invD) | 0;
        if (!solid && yG < ybuf) {
          const yS = isWater ? ((horizon + (eyeZ - surfH) * invD) | 0) : yG;
          const top = yS < VIEW.y ? VIEW.y : yS;
          if (top < ybuf) {
            // PER-ROW ground cast. This is the defect an art critic diagnosed better than I did:
            // "the ground plane is 1-pixel vertical streaks that are the same width at the bottom
            // of the frame as at the horizon, so nothing foreshortens." The march took ONE texel
            // per step and filled the whole vertical run with it, smearing a single sample down
            // dozens of screen rows. A plane rendered that way is wallpaper, not ground.
            //
            // Each screen row below the horizon sees the ground at its OWN distance:
            //     y = horizon + (eyeZ - h) * PROJ / d   =>   d = (eyeZ - h) * PROJ / (y - horizon)
            // so solve per row and sample there. Near rows advance slowly in world space (large
            // texels), rows near the horizon advance fast (small texels). That IS perspective.
            const slope = dungeon ? 0 : Art.slopeShade(map, wx, wy);
            const baseLight = sun + slope + (dungeon ? dungeonLight(cam, wx, wy, map) + 2 : 0);
            const rise = eyeZ - surfH;
            const fogSpan = Math.max(1, fogEnd - fogStart);
            for (let y = top; y < ybuf; y++) {
              const rows = y - horizon;
              // Ground above eye level projects ABOVE the horizon, where the row-to-distance
              // solve flips sign; fall back to the march distance rather than mirroring the world.
              let rd = dist;
              if (rows > 0 && rise > 0.02) {
                rd = rise * PROJ / rows;
                if (rd < 0.30) rd = 0.30; else if (rd > dist + 6) rd = dist + 6;
              }
              const rx = cam.x + dx * rd, ry = cam.y + dy * rd;
              // Distance LOD, now genuinely per row: the far ground would otherwise point-sample a
              // high-frequency texture and alias into noise at the SAME apparent scale as the
              // foreground, which is the other half of why it read as a vertical curtain.
              const texel = Art.groundTexel(mat, rx, ry, map, Art.lodFor(rd));
              const rfog = clamp((rd - fogStart) / fogSpan, 0, 1);
              buf[y * W + px] = fogShade(texel, baseLight, rfog, skyBand, y, fogRow, fogJit);
            }
            ybuf = top;
          }

          // Dungeon ceiling, filled DOWNWARD from the top of the column.
          if (dungeon) {
            const yC = (horizon + (eyeZ - CEIL) * invD) | 0;
            const bot = yC > ybuf ? ybuf : yC;
            if (bot > ytop) {
              const ct = Art.groundTexel(map.ceilMat === undefined ? mat : map.ceilMat, wx, wy, map, Art.lodFor(dist));
              const light = dungeonLight(cam, wx, wy, map) - 4;
              for (let y = ytop; y < bot; y++) buf[y * W + px] = fogShade(ct, light, fog, skyBand, y, fogRow, fogJit);
              ytop = bot;
            }
          }
        }

        // ---- solid cell: extrude a prism from the terrain. Buildings, cliffs, dungeon walls and
        // variable storey heights all come out of this one branch.
        if (solid) {
          const storeys = map.storeys[ci] || 1;
          const topH = gh + storeys * STOREY;
          const yT = (horizon + (eyeZ - topH) * invD) | 0;
          const top = yT < VIEW.y ? VIEW.y : yT;
          if (top < ybuf) {
            // Wall u from whichever axis this face is more aligned to.
            // u must run the same way on both faces of an axis, or adjacent walls mirror into a
            // chevron. Flip on the far side so the texture reads continuously around a corner.
            const face = Math.abs(dx) > Math.abs(dy) ? 1 : 0;
            let u = face ? (wy - cy) : (wx - cx);
            if (face ? dx > 0 : dy < 0) u = 1 - u;
            const lightDelta = sun - (face ? 1 : 0) + (dungeon ? dungeonLight(cam, wx, wy, map) : 0);
            const lod = Art.lodFor(dist);
            for (let y = top; y < ybuf; y++) {
              // v from the screen row back to world height, so texture does not swim with distance.
              const wh = eyeZ - (y - horizon) / invD;
              const v = (topH - wh) / STOREY;
              const tx = Art.wallTexel(mat, u, v, face, lod);
              // Shade WITHIN the texel's own ramp. Re-deriving a delta from a reference texel
              // cancelled the global sun term, which is why night came out brighter than noon.
              buf[y * W + px] = fogShade(tx, lightDelta, fog, skyBand, y, fogRow, fogJit);
            }
            ybuf = top;
          }
          if (zb[px] > dist) zb[px] = dist;
          // A solid prism occludes everything lower behind it; keep marching only for taller
          // terrain and spans above.
        }

        // ---- overhead spans: bridges, gate arches, aqueducts, cave mouths. ONE primitive.
        const sp = map.spans.get(cy * 4096 + cx);
        if (sp) {
          const yHi = (horizon + (eyeZ - sp.hi) * invD) | 0;
          const yLo = (horizon + (eyeZ - sp.lo) * invD) | 0;
          let a = yHi < VIEW.y ? VIEW.y : yHi;
          let b = yLo > VIEW.y + VIEW.h ? VIEW.y + VIEW.h : yLo;
          // NOT clipped to ybuf. A bridge deck or a gate arch sits in rows the ground pass has
          // already filled, and clipping to the ground marker erases exactly the thing overhead
          // spans exist to draw. ARCHITECTURE.md §6.2 predicted this in writing.
          if (b > a) {
            const spanLight = sun - 1 + (dungeon ? dungeonLight(cam, wx, wy, map) : 0);
            const spanLod = Art.lodFor(dist);
            for (let y = a; y < b; y++) {
              // Skip rows an earlier, nearer band already claimed.
              let taken = false;
              for (let k = 0; k < nBands; k++) if (y >= bandY0[k] && y < bandY1[k]) { taken = true; break; }
              if (taken) continue;
              const wh = eyeZ - (y - horizon) / invD;
              const stx = Art.wallTexel(sp.tex, (wx - cx), (sp.hi - wh) / STOREY, 0, spanLod);
              buf[y * W + px] = fogShade(stx, spanLight, fog, skyBand, y, fogRow, fogJit);
            }
            if (nBands < 16) { bandY0[nBands] = a; bandY1[nBands] = b; nBands++; }
            if (zb[px] > dist) zb[px] = dist;
          }
        }
      }
    }

    clipReset();
  }

  // Torch radius indoors. A dungeon lit by a global ambient reads as a lit room with the lights
  // off; the falloff around the party is most of what makes a corridor feel like a corridor.
  function dungeonLight(cam, wx, wy, map) {
    const d = Math.hypot(wx - cam.x, wy - cam.y);
    const radius = cam.torch || 7.5;
    // A torch POOL: bright at the party's feet, near black at the edge of the radius. The previous
    // curve floored at -2, which left a whole dungeon evenly lit and blew s15 to 218/255 mean.
    const t = clamp(1 - d / radius, 0, 1);
    return Math.round(t * t * 14) - 14;
  }

  // ---------------------------------------------------------------- sprites
  // Billboards composited against zb. Feet sit at the WALK SURFACE — terrain height, or a span's
  // deck when the entity is on one — never a constant ground plane.
  function drawSprite(cam, spr, wx, wy, wz, hWorld, opts) {
    const dxw = wx - cam.x, dyw = wy - cam.y;
    const cosA = Math.cos(-cam.ang), sinA = Math.sin(-cam.ang);
    const tx = dxw * cosA - dyw * sinA;
    const ty = dxw * sinA + dyw * cosA;
    if (tx < 0.25) return null;                         // behind the camera

    const halfFov = Math.tan(FOV_H / 2);
    const sx = VIEW.x + (VIEW.w / 2) * (1 + (ty / tx) / halfFov);
    const invD = PROJ / tx;
    const horizon = VIEW.y + (VIEW.h >> 1) + (cam.horizon || 0);
    const eyeZ = cam.z + EYE;

    const hPix = hWorld * invD;
    const wPix = hPix * (spr.w / spr.h);
    const yFeet = horizon + (eyeZ - wz) * invD;
    const x0 = Math.round(sx - wPix / 2), y0 = Math.round(yFeet - hPix);

    if (x0 + wPix < VIEW.x || x0 > VIEW.x + VIEW.w) return null;

    // Column-wise depth test so a sprite half-behind a wall is half-drawn, not all or nothing.
    clip(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    const lit = opts && opts.lit !== undefined ? opts.lit : 0;
    const mirror = opts && opts.mirror;
    const xs = spr.w / Math.max(1, wPix), ys = spr.h / Math.max(1, hPix);
    const xa = Math.max(VIEW.x, x0), xb = Math.min(VIEW.x + VIEW.w, Math.round(x0 + wPix));
    const ya = Math.max(VIEW.y, y0), yb = Math.min(VIEW.y + VIEW.h, Math.round(y0 + hPix));

    for (let x = xa; x < xb; x++) {
      if (zb[x] < tx) continue;                          // occluded by geometry in this column
      let sxi = ((x - x0) * xs) | 0;
      if (mirror) sxi = spr.w - 1 - sxi;
      if (sxi < 0 || sxi >= spr.w) continue;
      for (let y = ya; y < yb; y++) {
        const syi = ((y - y0) * ys) | 0;
        if (syi < 0 || syi >= spr.h) continue;
        const pi = spr.data[syi * spr.w + sxi];
        if (pi === 0) continue;
        buf[y * W + x] = Core.shade(pi & 0xf0, (pi & 0x0f) + lit);
      }
    }
    clipReset();
    return { x: x0, y: y0, w: wPix, h: hPix, dist: tx };
  }

  // Which of the 8 facings to draw, and whether to mirror. Sprites are baked for 0..180 only;
  // the other three eighths are the same frames flipped, exactly as 1998 sprite sheets did.
  function facingFor(entAng, camX, camY, entX, entY, nFacings) {
    const toCam = Math.atan2(camY - entY, camX - entX);
    let rel = toCam - entAng;
    while (rel < -Math.PI) rel += Math.PI * 2;
    while (rel > Math.PI) rel -= Math.PI * 2;
    const mirror = rel < 0;
    const a = Math.abs(rel) / Math.PI;
    return { index: clamp(Math.round(a * (nFacings - 1)), 0, nFacings - 1), mirror };
  }

  return {
    W, H, buf, zb,
    clip, clipReset, clear, px, pxFast, hline, vline, rect, frameRect, blit, blitScaled,
    present, testCard, render3D, drawSprite, facingFor, dungeonLight,
    VIEW, CHROME_L, CHROME_R, HUD, FOV_H, FOV_V, PROJ, STOREY, EYE,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
