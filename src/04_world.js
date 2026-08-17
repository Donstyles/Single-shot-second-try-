// 04_world.js — nine connected regions, their heightfields, dungeons, portals and quests.
// Owner: world. Calls Core, Rules, Items.
//
// Everything here is generated from LAYOUT streams (RNG.world), so a region is reproducible from
// the seed alone and is never serialised — only the delta from play is saved. Authored overrides
// are applied LAST and unconditionally, because a town plaza that is flat only when the noise
// happens to cooperate is not a town plaza.

const World = (() => {
  'use strict';

  const { clamp, lerp, smooth, RNG } = Core;

  // ---------------------------------------------------------------- materials
  const SOLID = 128;
  const MAT = {
    grass: 0, road: 1, dirt: 2, sand: 3, rock: 4, snow: 5, marsh: 6, ash: 7,
    water: 8, plaza: 9, wood: 10, tile: 11, moss: 12, gravel: 13,
    // solid (drawn as extruded walls)
    stonewall: 16, timberwall: 17, brickwall: 18, plaster: 19, cliff: 20, ice: 21, obsidian: 22,
    ruin: 23, palisade: 24, marble: 25,
  };
  const isSolid = (c) => (c & SOLID) !== 0;
  const matOf = (c) => c & 0x7f;

  // Which palette ramp a material paints with. The engine shades by arithmetic on the index, so a
  // material is a ramp plus a base shade, not a colour.
  const MAT_RAMP = {
    0: 6, 1: 5, 2: 5, 3: 2, 4: 1, 5: 0, 6: 7, 7: 0, 8: 8, 9: 1, 10: 4, 11: 2, 12: 7, 13: 1,
    16: 1, 17: 4, 18: 3, 19: 2, 20: 1, 21: 8, 22: 0, 23: 1, 24: 4, 25: 0,
  };

  // ---------------------------------------------------------------- noise
  // Position-hashed value noise: deterministic in (x, y, seed) with no call-order dependence, which
  // a stream would have. Terrain must be identical whether generated first or ninth.
  function hash2(x, y, seed) {
    let h = (x * 374761393) ^ (y * 668265263) ^ (seed * 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  }

  function fbm(x, y, seed, oct, lac, gain) {
    let f = 1, a = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += vnoise(x * f, y * f, seed + i * 7919) * a;
      norm += a;
      f *= lac || 2.0; a *= gain === undefined ? 0.5 : gain;
    }
    return sum / norm;
  }

  // Ridged noise makes mountains that look eroded rather than lumpy.
  function ridged(x, y, seed, oct) {
    let f = 1, a = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      const n = 1 - Math.abs(vnoise(x * f, y * f, seed + i * 1543) * 2 - 1);
      sum += n * n * a; norm += a;
      f *= 2.07; a *= 0.5;
    }
    return sum / norm;
  }

  // ---------------------------------------------------------------- regions
  // A 3x3 world. Adjacent regions connect at their shared edge, so the map is a real graph the
  // player walks rather than a menu of teleports.
  //
  //        frostmere    greyhollow    emberpeak
  //        ashencoast   HARROWGATE    thornfens
  //        duskwood     barrowfields  ashkeep
  const RW = 128, RH = 128;  // cells per region — SHOTLIST.md specifies this and is the spec

  const REGIONS = {
    harrowgate: {
      name: 'Harrowgate Vale', gx: 1, gy: 1, biome: 'temperate', level: 1,
      sea: -3.5, hilly: 3.2, town: 'Harrowgate', townSize: 'city',
      spawn: ['rat', 'goblin', 'wolf'], desc: 'Green valley, the road hub, and the only city.',
    },
    ashencoast: {
      name: 'The Ashen Coast', gx: 0, gy: 1, biome: 'coast', level: 3,
      sea: 0.6, hilly: 2.0, town: 'Saltmoor', townSize: 'village',
      spawn: ['goblin', 'goblin_arch', 'harpy'], desc: 'Ocean running out into haze, cliffs and a fishing village.',
    },
    greyhollow: {
      name: 'Greyhollow', gx: 1, gy: 0, biome: 'highland', level: 5,
      sea: -8, hilly: 6.5, town: 'Pickhaven', townSize: 'village',
      spawn: ['kobold', 'kobold_sham', 'spider'], desc: 'Mine country: spoil heaps, cut terraces, headframes.',
    },
    emberpeak: {
      name: 'Emberpeak', gx: 2, gy: 0, biome: 'volcanic', level: 9,
      sea: -12, hilly: 11.0, town: null,
      spawn: ['elemental', 'ogre', 'troll'], desc: 'Ash slopes and lava scars under a bruised sky.',
    },
    thornfens: {
      name: 'The Thornfens', gx: 2, gy: 1, biome: 'marsh', level: 6,
      sea: 0.2, hilly: 1.2, town: 'Reedwatch', townSize: 'hamlet',
      spawn: ['spider', 'troll', 'zombie'], desc: 'Standing water, reed banks, causeways on piles.',
    },
    frostmere: {
      name: 'Frostmere', gx: 0, gy: 0, biome: 'snow', level: 8,
      sea: -2, hilly: 7.0, town: 'Coldharbour', townSize: 'hamlet',
      spawn: ['wolf', 'ogre', 'skeleton'], desc: 'Snowline, frozen lake, a ruined watchtower.',
    },
    duskwood: {
      name: 'Duskwood', gx: 0, gy: 2, biome: 'forest', level: 4,
      sea: -4, hilly: 3.8, town: 'Ellerby', townSize: 'village',
      spawn: ['wolf', 'bandit', 'harpy'], desc: 'Old forest, bandit country, a shrine in a clearing.',
    },
    barrowfields: {
      name: 'The Barrowfields', gx: 1, gy: 2, biome: 'barrow', level: 7,
      sea: -5, hilly: 2.6, town: 'Mournhill', townSize: 'hamlet',
      spawn: ['skeleton', 'zombie', 'ghoul', 'wraith'], desc: 'Grave mounds, standing stones, wrong-coloured grass.',
    },
    ashkeep: {
      name: 'The Ashen Reach', gx: 2, gy: 2, biome: 'blighted', level: 12,
      sea: -6, hilly: 5.0, town: null, gated: 'ash_key',
      spawn: ['knight_ash', 'lich', 'elemental'], desc: 'Dead ground before the Keep. The road ends here.',
    },
  };
  const REGION_IDS = Object.keys(REGIONS);

  // Which regions touch, derived from the grid so the graph cannot drift from the layout.
  function neighbours(id) {
    const r = REGIONS[id];
    const out = [];
    for (const oid of REGION_IDS) {
      if (oid === id) continue;
      const o = REGIONS[oid];
      const dx = o.gx - r.gx, dy = o.gy - r.gy;
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      out.push({ id: oid, dir: dx === 1 ? 'e' : dx === -1 ? 'w' : dy === 1 ? 's' : 'n' });
    }
    return out;
  }

  // ---------------------------------------------------------------- dungeons
  const DUNGEONS = {
    barrow:     { name: 'The Sunken Barrow',   region: 'harrowgate',   w: 34, h: 26, level: 2,  theme: 'crypt',  boss: 'ghoul', ex: 102, ey: 52 },
    smugglers:  { name: "Smuggler's Cut",      region: 'ashencoast',   w: 30, h: 22, level: 3,  theme: 'cave',   boss: 'bandit_capt' },
    seacave:    { name: 'The Drowned Chapel',  region: 'ashencoast',   w: 32, h: 24, level: 4,  theme: 'crypt',  boss: 'wraith' },
    mine:       { name: 'Greyhollow Deep',     region: 'greyhollow',   w: 40, h: 28, level: 5,  theme: 'mine',   boss: 'kobold_sham' },
    minelow:    { name: 'The Lower Cut',       region: 'greyhollow',   w: 36, h: 26, level: 6,  theme: 'mine',   boss: 'ogre' },
    forge:      { name: 'The Ember Forge',     region: 'emberpeak',    w: 38, h: 28, level: 10, theme: 'forge',  boss: 'elemental' },
    fenhold:    { name: 'Reedwatch Hold',      region: 'thornfens',    w: 32, h: 24, level: 6,  theme: 'cave',   boss: 'troll' },
    icetomb:    { name: 'The Frozen Tomb',     region: 'frostmere',    w: 34, h: 26, level: 8,  theme: 'ice',    boss: 'skeleton' },
    banditden:  { name: 'The Rookery',         region: 'duskwood',     w: 30, h: 22, level: 4,  theme: 'cave',   boss: 'bandit_capt' },
    grove:      { name: 'The Sunken Grove',    region: 'duskwood',     w: 28, h: 22, level: 5,  theme: 'cave',   boss: 'harpy' },
    barrowdeep: { name: 'The Barrow Deep',     region: 'barrowfields', w: 40, h: 30, level: 9,  theme: 'crypt',  boss: 'lich' },
    stonecircle:{ name: 'Under the Stones',    region: 'barrowfields', w: 30, h: 24, level: 7,  theme: 'crypt',  boss: 'wraith' },
    keep:       { name: 'The Ashen Keep',      region: 'ashkeep',      w: 44, h: 32, level: 14, theme: 'keep',   boss: 'ash_crown', final: true },
  };
  const DUNGEON_IDS = Object.keys(DUNGEONS);

  // ---------------------------------------------------------------- quests
  // state: 0 unknown, 1 active, 2 done, 3 failed
  const QUESTS = {
    q_missing:   { name: 'The Missing Watch',    region: 'harrowgate', giver: 'captain', main: true, step: 1,
                   text: 'Harrowgate lost a patrol to the Sunken Barrow. Find their seal and bring it back.',
                   need: 'barrow_seal', xp: 900, gold: 300, next: 'q_ledger' },
    q_ledger:    { name: "The Foreman's Ledger", region: 'greyhollow', giver: 'foreman', main: true, step: 2,
                   text: 'Greyhollow Deep flooded with kobolds. Recover the ledger from the foreman office.',
                   need: 'mine_ledger', xp: 2200, gold: 700, next: 'q_shards' },
    q_shards:    { name: 'Shards of the Crown',  region: 'barrowfields', giver: 'archivist', main: true, step: 3,
                   text: 'Three shards of the Ashen Crown lie in the deep barrows. Bring all three.',
                   need: 'crown_shard', count: 3, xp: 6000, gold: 1800, next: 'q_key' },
    q_key:       { name: 'The Ashen Key',        region: 'emberpeak', giver: 'smith', main: true, step: 4,
                   text: 'The Ember Forge can reforge the shards into a key. The forge is not unattended.',
                   need: 'ash_key', xp: 9000, gold: 2500, next: 'q_crown' },
    q_crown:     { name: 'The Ashen Crown',      region: 'ashkeep', giver: 'captain', main: true, step: 5,
                   text: 'The road ends at the Keep. End what wears the Crown.',
                   kill: 'ash_crown', xp: 20000, gold: 6000, final: true },

    q_wolves:    { name: 'Grey Wolf Bounty',     region: 'duskwood', giver: 'hunter',
                   text: 'Wolves are taking stock on the Ellerby road. Six pelts, and the bounty is yours.',
                   need: 'wolf_pelt', count: 6, xp: 700, gold: 400 },
    q_herbs:     { name: 'Marshwort',            region: 'thornfens', giver: 'herbalist',
                   text: 'Marshwort grows only where the fen is deepest. Four bundles.',
                   need: 'herb_bundle', count: 4, xp: 900, gold: 500 },
    q_rookery:   { name: 'Clear the Rookery',    region: 'duskwood', giver: 'captain',
                   text: 'The Rookery bandits have a captain. Remove him.',
                   kill: 'bandit_capt', xp: 1400, gold: 800 },
    q_tomb:      { name: 'The Frozen Tomb',      region: 'frostmere', giver: 'archivist',
                   text: 'Something walks in the Frozen Tomb that should be lying down.',
                   kill: 'skeleton', killIn: 'icetomb', xp: 2600, gold: 1200 },
    q_chapel:    { name: 'The Drowned Chapel',   region: 'ashencoast', giver: 'priest',
                   text: 'The tide took the chapel and left something behind. Put it to rest.',
                   kill: 'wraith', killIn: 'seacave', xp: 2000, gold: 1000 },
  };
  const QUEST_IDS = Object.keys(QUESTS);

  // ---------------------------------------------------------------- shops
  const SHOP_KINDS = ['weapon', 'armour', 'general', 'magic', 'temple', 'tavern', 'trainer', 'guild'];

  // ---------------------------------------------------------------- heightfield
  // Vertex grid, (w+1) x (h+1). Bilinear sampled. Dungeons are flat and skip all of this.
  function makeTerrain(regionId, w, h) {
    const r = REGIONS[regionId];
    const seed = RNG.world('terrain:' + regionId).int(0x7fffffff);
    const T = new Float32Array((w + 1) * (h + 1));

    for (let y = 0; y <= h; y++) {
      for (let x = 0; x <= w; x++) {
        const nx = x / 26, ny = y / 26;
        let hgt = (fbm(nx, ny, seed, 5) - 0.42) * r.hilly * 3.4;

        // A ridge frames every valley, so there is always something on the horizon rather than a
        // dead level line. This is the single loudest "not MM6" tell if it is missing.
        const edgeX = Math.min(x, w - x) / w, edgeY = Math.min(y, h - y) / h;
        const edge = Math.min(edgeX, edgeY);
        const rim = clamp(1 - edge / 0.26, 0, 1);
        const mount = ridged(nx * 0.62, ny * 0.62, seed + 4441, 4);
        hgt += rim * rim * (7 + mount * 22) * (r.biome === 'coast' ? 0.35 : 1);

        // Biome shaping.
        if (r.biome === 'marsh') hgt = hgt * 0.35 - 0.4;
        if (r.biome === 'volcanic') hgt += ridged(nx * 1.3, ny * 1.3, seed + 77, 3) * 9 - 2;
        if (r.biome === 'barrow') {
          // Grave mounds: a lattice of low domes. Reads as deliberate rather than lumpy.
          const mx = Math.abs(((x % 17) / 17) - 0.5), my = Math.abs(((y % 19) / 19) - 0.5);
          const d = Math.sqrt(mx * mx + my * my);
          hgt += Math.max(0, 1 - d * 3.6) * 2.6;
        }
        T[y * (w + 1) + x] = hgt;
      }
    }
    return T;
  }

  // ---------------------------------------------------------------- map assembly
  function key(x, y) { return y * 4096 + x; }

  function blankMap(id, name, kind, w, h) {
    return {
      id, name, kind, w, h,
      cells: new Uint8Array(w * h),
      storeys: new Uint8Array(w * h),
      terrain: new Float32Array((w + 1) * (h + 1)),
      spans: new Map(),
      entities: [], portals: [], decor: [], zones: [], npcs: [],
      sea: -999, light: 1, fogStart: 14, fogEnd: 56,
    };
  }

  const inb = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
  const cellAt = (m, x, y) => (inb(m, x, y) ? m.cells[y * m.w + x] : (MAT.cliff | SOLID));
  const setCell = (m, x, y, c) => { if (inb(m, x, y)) m.cells[y * m.w + x] = c; };
  const setStoreys = (m, x, y, n) => { if (inb(m, x, y)) m.storeys[y * m.w + x] = n; };

  // Bilinear terrain sample. THE function the renderer and every entity's feet call.
  function H(m, x, y) {
    if (m.kind !== 'outdoor') return 0;
    const w = m.w;
    let fx = clamp(x, 0, m.w - 0.001), fy = clamp(y, 0, m.h - 0.001);
    const xi = Math.floor(fx), yi = Math.floor(fy);
    const tx = fx - xi, ty = fy - yi;
    const T = m.terrain, s = w + 1;
    const a = T[yi * s + xi], b = T[yi * s + xi + 1];
    const c = T[(yi + 1) * s + xi], d = T[(yi + 1) * s + xi + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }

  // Flatten an area to a fixed height. Applied AFTER noise and unconditionally: a plaza that is
  // level only when the noise cooperates is not a plaza.
  function flatten(m, cx, cy, rx, ry, height, falloff) {
    const s = m.w + 1;
    const fo = falloff === undefined ? 3 : falloff;
    for (let y = Math.max(0, cy - ry - fo); y <= Math.min(m.h, cy + ry + fo); y++) {
      for (let x = Math.max(0, cx - rx - fo); x <= Math.min(m.w, cx + rx + fo); x++) {
        const dx = Math.max(0, Math.abs(x - cx) - rx), dy = Math.max(0, Math.abs(y - cy) - ry);
        const d = Math.max(dx, dy);
        if (d > fo) continue;
        const t = 1 - d / (fo + 0.0001);
        const i = y * s + x;
        m.terrain[i] = lerp(m.terrain[i], height, t * t);
      }
    }
  }

  // Grade a road along a polyline: carve it level-ish and paint the surface.
  function road(m, pts, width, mat) {
    const s = m.w + 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) * 2));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const px = lerp(x0, x1, t), py = lerp(y0, y1, t);
        const hh = H(m, px, py);
        for (let dy = -width; dy <= width; dy++) {
          for (let dx = -width; dx <= width; dx++) {
            const cx = Math.round(px + dx), cy = Math.round(py + dy);
            if (!inb(m, cx, cy)) continue;
            const d = Math.hypot(dx, dy);
            if (d > width + 0.5) continue;
            if (!isSolid(m.cells[cy * m.w + cx])) {
              m.cells[cy * m.w + cx] = mat === undefined ? MAT.road : mat;
            }
            // Grade the surface so a road reads as cut into the hill rather than painted on it.
            const wgt = clamp(1 - d / (width + 1.2), 0, 1);
            const vi = cy * s + cx;
            m.terrain[vi] = lerp(m.terrain[vi], hh, wgt * 0.85);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- spans
  // The one thing a heightfield cannot express: two surfaces over one (x,y). ONE primitive gives
  // bridges, gate arches, aqueducts and cave mouths.
  function addSpan(m, x, y, lo, hi, tex) {
    if (!inb(m, x, y)) return;
    m.spans.set(key(x, y), { lo, hi, tex: tex === undefined ? MAT.stonewall : tex });
  }
  function spanAt(m, x, y) {
    return m.spans.get(key(x, y)) || null;
  }

  // A bridge over a carved ravine: deck at a fixed height, ravine floor visible in the gap.
  function bridge(m, x0, y0, x1, y1, deckH) {
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = Math.round(lerp(x0, x1, t)), y = Math.round(lerp(y0, y1, t));
      for (let w = -1; w <= 1; w++) {
        addSpan(m, x + (y0 === y1 ? 0 : w), y + (y0 === y1 ? w : 0), deckH - 0.55, deckH, MAT.stonewall);
      }
    }
  }

  // A gate arch: solid overhead, walkable underneath. `lo` must leave the party's 1.6 headroom.
  function gateArch(m, x, y, dir, groundH) {
    const lo = groundH + 2.6, hi = groundH + 6.4;
    for (let w = -1; w <= 1; w++) {
      addSpan(m, x + (dir === 'ns' ? w : 0), y + (dir === 'ns' ? 0 : w), lo, hi, MAT.stonewall);
    }
  }

  // A cave mouth: an overhang above a tunnel entrance, so a dungeon portal reads as a dark opening
  // in rock instead of a door standing in a field.
  function caveMouth(m, x, y, groundH) {
    for (let dy = -2; dy <= 0; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        addSpan(m, x + dx, y + dy, groundH + 2.4, groundH + 9 + Math.abs(dx), MAT.cliff);
      }
    }
  }

  // ---------------------------------------------------------------- settlements
  function building(m, x, y, w, h, storeys, wallMat, rng) {
    const gh = H(m, x + w / 2, y + h / 2);
    flatten(m, Math.round(x + w / 2), Math.round(y + h / 2), Math.ceil(w / 2) + 1, Math.ceil(h / 2) + 1, gh, 2);
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        if (!inb(m, cx, cy)) continue;
        const edge = cx === x || cy === y || cx === x + w - 1 || cy === y + h - 1;
        if (edge) {
          m.cells[cy * m.w + cx] = wallMat | SOLID;
          m.storeys[cy * m.w + cx] = storeys;
        } else {
          m.cells[cy * m.w + cx] = MAT.wood;
        }
      }
    }
    return { x, y, w, h, storeys, gh };
  }

  // Lay out a settlement: plaza, ring of buildings, shop fronts, wall and gates for a city.
  function settlement(m, cx, cy, size, regionId, rng) {
    const plazaR = size === 'city' ? 6 : size === 'village' ? 4 : 3;
    const gh = H(m, cx, cy);
    flatten(m, cx, cy, plazaR + 2, plazaR + 2, gh, 5);

    for (let y = cy - plazaR; y <= cy + plazaR; y++) {
      for (let x = cx - plazaR; x <= cx + plazaR; x++) {
        if (inb(m, x, y)) m.cells[y * m.w + x] = MAT.plaza;
      }
    }
    m.decor.push({ kind: 'fountain', x: cx + 0.5, y: cy + 0.5, z: gh });

    const nShops = size === 'city' ? 8 : size === 'village' ? 5 : 3;
    const shops = [];
    const ring = plazaR + 4;
    for (let i = 0; i < nShops; i++) {
      const a = (i / nShops) * Math.PI * 2 + rng.float(-0.12, 0.12);
      const bx = Math.round(cx + Math.cos(a) * (ring + rng.int(3)));
      const by = Math.round(cy + Math.sin(a) * (ring + rng.int(3)));
      const bw = 5 + rng.int(3), bh = 4 + rng.int(3);
      // Storey variation is what stops a town reading as a grid of identical boxes.
      const st = size === 'city' ? 1 + rng.int(3) : 1 + rng.int(2);
      const mat = rng.pick([MAT.timberwall, MAT.plaster, MAT.brickwall, MAT.stonewall]);
      const b = building(m, bx - (bw >> 1), by - (bh >> 1), bw, bh, st, mat, rng);
      const kind = SHOP_KINDS[i % SHOP_KINDS.length];
      shops.push({ kind, x: bx, y: by, b });
      // A door cell facing the plaza, with a sign.
      const dx = Math.sign(cx - bx), dy = Math.sign(cy - by);
      const doorX = bx + (Math.abs(dx) > Math.abs(dy) ? dx * ((bw >> 1)) : 0);
      const doorY = by + (Math.abs(dx) > Math.abs(dy) ? 0 : dy * ((bh >> 1)));
      m.portals.push({
        x: doorX, y: doorY, to: 'shop:' + kind, kind: 'door',
        tx: doorX + dx, ty: doorY + dy, tang: 0, shop: kind, region: regionId,
      });
      m.decor.push({ kind: 'sign', x: doorX + 0.5, y: doorY + 0.5, z: b.gh + 2.2, shop: kind });
      setCell(m, doorX, doorY, MAT.wood);
    }

    // Houses that are pure dressing: a settlement of only shops reads as a strip mall.
    const nHouses = size === 'city' ? 16 : size === 'village' ? 8 : 4;
    for (let i = 0; i < nHouses; i++) {
      const a = rng.float(0, Math.PI * 2), d = ring + 2 + rng.int(Math.max(1, (size === 'city' ? 2 : 14)));
      const bx = Math.round(cx + Math.cos(a) * d), by = Math.round(cy + Math.sin(a) * d);
      if (!inb(m, bx - 3, by - 3) || !inb(m, bx + 4, by + 4)) continue;
      let clear = true;
      for (let y = by - 4; y <= by + 4 && clear; y++) {
        for (let x = bx - 4; x <= bx + 4; x++) if (isSolid(cellAt(m, x, y))) { clear = false; break; }
      }
      if (!clear) continue;
      building(m, bx - 2, by - 2, 4 + rng.int(3), 4 + rng.int(2), 1 + rng.int(2),
        rng.pick([MAT.timberwall, MAT.plaster]), rng);
    }

    // City wall with gate arches. The gates are the s03 shot.
    if (size === 'city') {
      const wr = ring + 4;   // gate lands at x = cx + 14, which is what s03/s04 are framed against
      for (let y = cy - wr; y <= cy + wr; y++) {
        for (let x = cx - wr; x <= cx + wr; x++) {
          if (!inb(m, x, y)) continue;
          const onEdge = Math.abs(Math.abs(x - cx) - wr) < 1 || Math.abs(Math.abs(y - cy) - wr) < 1;
          const inside = Math.abs(x - cx) <= wr && Math.abs(y - cy) <= wr;
          if (onEdge && inside) {
            m.cells[y * m.w + x] = MAT.stonewall | SOLID;
            m.storeys[y * m.w + x] = 2;
          }
        }
      }
      // Four gates, each an ARCH: walk under, wall solid overhead.
      const gates = [[cx + wr, cy, 'ns'], [cx - wr, cy, 'ns'], [cx, cy + wr, 'ew'], [cx, cy - wr, 'ew']];
      for (const [gx, gy, dir] of gates) {
        for (let w = -1; w <= 1; w++) {
          const px = gx + (dir === 'ns' ? 0 : w), py = gy + (dir === 'ns' ? w : 0);
          setCell(m, px, py, MAT.road);
          setStoreys(m, px, py, 0);
        }
        gateArch(m, gx, gy, dir, H(m, gx, gy));
        m.decor.push({ kind: 'brazier', x: gx + 0.5, y: gy + 0.5, z: H(m, gx, gy) });
      }
      m.gates = gates.map(([x, y]) => ({ x, y }));
    }

    return { cx, cy, shops, plazaR };
  }

  // ---------------------------------------------------------------- outdoor region
  function buildRegion(id) {
    const r = REGIONS[id];
    const rng = RNG.world('region:' + id);
    const m = blankMap(id, r.name, 'outdoor', RW, RH);
    m.region = id;
    m.terrain = makeTerrain(id, RW, RH);
    m.sea = r.sea;
    m.level = r.level;
    m.biome = r.biome;
    m.spawnTable = r.spawn.slice();

    // Ground material from height and biome. Water is "below level", never a painted tile.
    const base = { temperate: MAT.grass, coast: MAT.sand, highland: MAT.gravel, volcanic: MAT.ash,
      marsh: MAT.marsh, snow: MAT.snow, forest: MAT.moss, barrow: MAT.grass, blighted: MAT.ash }[r.biome];
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        const h = H(m, x + 0.5, y + 0.5);
        let mat = base;
        if (h < r.sea) mat = MAT.water;
        else if (h < r.sea + 1.2 && (r.biome === 'coast' || r.biome === 'marsh')) mat = MAT.sand;
        else if (h > 16) mat = r.biome === 'snow' || r.biome === 'highland' ? MAT.snow : MAT.rock;
        else if (h > 9) mat = MAT.rock;
        m.cells[y * RW + x] = mat;
      }
    }

    // Cliff walls where the slope is impassable: terrain fences the valley instead of an invisible
    // wall the player bumps into.
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        const h = H(m, x + 0.5, y + 0.5);
        const hx = Math.abs(H(m, x + 1.5, y + 0.5) - h);
        const hy = Math.abs(H(m, x + 0.5, y + 1.5) - h);
        if (Math.max(hx, hy) > MAX_CLIMB * 2.2 && h > r.sea) {
          m.cells[y * RW + x] = MAT.cliff | SOLID;
          m.storeys[y * RW + x] = 1;
        }
      }
    }

    // Edge exits to neighbouring regions, at the middle of each shared edge.
    const nb = neighbours(id);
    const exits = [];
    for (const n of nb) {
      const p = n.dir === 'e' ? [RW - 2, RH >> 1] : n.dir === 'w' ? [1, RH >> 1]
        : n.dir === 's' ? [RW >> 1, RH - 2] : [RW >> 1, 1];
      const back = { e: 'w', w: 'e', n: 's', s: 'n' }[n.dir];
      const tp = back === 'e' ? [RW - 5, RH >> 1] : back === 'w' ? [4, RH >> 1]
        : back === 's' ? [RW >> 1, RH - 5] : [RW >> 1, 4];
      // Carve a pass through the rim so the exit is reachable.
      flatten(m, p[0], p[1], 3, 3, Math.min(H(m, p[0], p[1]), 2.0), 7);
      exits.push({ dir: n.dir, x: p[0], y: p[1], to: n.id, tx: tp[0], ty: tp[1] });
      m.portals.push({
        x: p[0], y: p[1], to: n.id, kind: 'edge',
        tx: tp[0], ty: tp[1], tang: n.dir === 'e' ? 0 : n.dir === 'w' ? Math.PI : n.dir === 's' ? Math.PI / 2 : -Math.PI / 2,
        locked: REGIONS[n.id].gated || null,
      });
    }

    // Settlement, then roads from it to every exit.
    let town = null;
    if (r.town) {
      town = settlement(m, RW >> 1, RH >> 1, r.townSize, id, rng);
      m.town = { name: r.town, x: town.cx, y: town.cy, size: r.townSize, shops: town.shops };
      for (const e of exits) road(m, [[town.cx, town.cy], [e.x, e.y]], r.townSize === 'city' ? 2 : 1);
    } else {
      // No town: still connect the exits to each other so the region is traversable.
      for (let i = 0; i < exits.length; i++) {
        road(m, [[exits[i].x, exits[i].y], [RW >> 1, RH >> 1]], 1);
      }
    }

    // Dungeon entrances, each a cave mouth in a cliff face.
    const mine = DUNGEON_IDS.filter((d) => DUNGEONS[d].region === id);
    m.dungeons = [];
    mine.forEach((did, i) => {
      const spec = DUNGEONS[did];
      const a = (i / Math.max(1, mine.length)) * Math.PI * 2 + 0.7;
      const dist = 38 + rng.int(14);
      const dx = spec.ex !== undefined ? spec.ex : clamp(Math.round((RW >> 1) + Math.cos(a) * dist), 8, RW - 9);
      const dy = spec.ey !== undefined ? spec.ey : clamp(Math.round((RH >> 1) + Math.sin(a) * dist), 8, RH - 9);
      const gh = H(m, dx, dy);
      flatten(m, dx, dy, 3, 3, gh, 4);
      for (let y = dy - 1; y <= dy + 1; y++) for (let x = dx - 2; x <= dx + 2; x++) setCell(m, x, y, MAT.gravel);
      caveMouth(m, dx, dy, gh);
      m.portals.push({ x: dx, y: dy, to: did, kind: 'stairs', tx: 3, ty: 3, tang: 0 });
      m.decor.push({ kind: 'brazier', x: dx - 1.5, y: dy + 0.5, z: gh });
      m.decor.push({ kind: 'brazier', x: dx + 2.5, y: dy + 0.5, z: gh });
      m.dungeons.push({ id: did, x: dx, y: dy });
      if (town) road(m, [[town.cx, town.cy], [dx, dy]], 1, MAT.dirt);
    });

    // A ravine with a bridge over it. The s06 shot, and the thing that makes a heightfield
    // demonstrably more than a hill generator.
    if (r.biome !== 'marsh' && r.biome !== 'coast') {
      const ry = (RH >> 1) - 8;   // s06 looks north from y=62.5 onto this
      const s = RW + 1;
      // The ravine spans only x 66..90 and TAPERS at both ends. A ravine that crosses the whole
      // map would swallow s04's wilderness camera, and a ravine that stops dead reads as a bug.
      const RX0 = 66, RX1 = 90;
      for (let x = RX0; x <= RX1; x++) {
        const edge = Math.min(x - RX0, RX1 - x) / 9;
        const taper = clamp(edge, 0, 1);
        if (taper <= 0.01) continue;
        for (let dy = -4; dy <= 4; dy++) {
          const y = ry + dy;
          if (y < 1 || y >= RH) continue;
          const t = 1 - Math.abs(dy) / 4.5;
          const vi = y * s + x;
          m.terrain[vi] = lerp(m.terrain[vi], -7.5, t * t * taper);
          if (Math.abs(dy) <= 2 && taper > 0.5) m.cells[y * RW + x] = MAT.rock;
        }
      }
      const bx = 84;   // s06 stands at x=84.5
      bridge(m, bx, ry - 5, bx, ry + 5, 1.2);
      m.bridge = { x: bx, y: ry };
    }

    // Scatter decor by biome. Density is what makes a region feel inhabited rather than empty.
    const treeKind = { forest: 'pine', temperate: 'oak', snow: 'deadtree', marsh: 'reed',
      volcanic: 'ashstump', barrow: 'standingstone', coast: 'rock', highland: 'rock', blighted: 'deadtree' }[r.biome];
    const nDecor = 460;
    for (let i = 0; i < nDecor; i++) {
      const x = rng.float(2, RW - 2), y = rng.float(2, RH - 2);
      const cx = Math.floor(x), cy = Math.floor(y);
      const c = m.cells[cy * RW + cx];
      if (isSolid(c)) continue;
      const mt = matOf(c);
      if (mt === MAT.water || mt === MAT.road || mt === MAT.plaza || mt === MAT.wood) continue;
      const h = H(m, x, y);
      if (h < r.sea + 0.3) continue;
      m.decor.push({ kind: rng.chance(0.82) ? treeKind : rng.pick(['rock', 'bush', 'stump']), x, y, z: h });
    }

    // Monster spawn points, kept off roads and away from the settlement.
    const nSpawn = 40 + r.level * 2;
    for (let i = 0; i < nSpawn; i++) {
      const x = rng.float(4, RW - 4), y = rng.float(4, RH - 4);
      const cx = Math.floor(x), cy = Math.floor(y);
      if (isSolid(m.cells[cy * RW + cx])) continue;
      if (matOf(m.cells[cy * RW + cx]) === MAT.water) continue;
      if (town && Math.hypot(x - town.cx, y - town.cy) < 34) continue;
      m.entities.push({
        eid: 'e' + id + '_' + i, kind: rng.pick(r.spawn), x, y, z: H(m, x, y),
        ang: rng.float(0, Math.PI * 2), state: 'idle', home: { x, y },
      });
    }

    m.fogStart = r.biome === 'marsh' ? 8 : 16;
    m.fogEnd = r.biome === 'marsh' ? 34 : 62;
    return m;
  }

  const MAX_CLIMB = 0.75;

  // ---------------------------------------------------------------- dungeons
  // Rooms joined by corridors, then a guaranteed path check. A dungeon whose boss room is not
  // reachable is a softlock, so connectivity is asserted, not hoped for.
  function buildDungeon(did) {
    const d = DUNGEONS[did];
    const rng = RNG.world('dungeon:' + did);
    const m = blankMap(did, d.name, 'dungeon', d.w, d.h);
    m.level = d.level;
    m.theme = d.theme;
    m.region = d.region;
    m.light = 0.12;
    m.fogStart = 4; m.fogEnd = 15;

    const wallMat = { crypt: MAT.stonewall, cave: MAT.cliff, mine: MAT.timberwall,
      forge: MAT.obsidian, ice: MAT.ice, keep: MAT.marble }[d.theme] || MAT.stonewall;
    const floorMat = { crypt: MAT.tile, cave: MAT.gravel, mine: MAT.dirt,
      forge: MAT.ash, ice: MAT.snow, keep: MAT.marble }[d.theme] || MAT.tile;
    // A ceiling distinct from BOTH floor and wall. Without three separable values a corridor is a
    // grey rectangle with no silhouette at all.
    m.ceilMat = { crypt: MAT.obsidian, cave: MAT.obsidian, mine: MAT.timberwall,
      forge: MAT.obsidian, ice: MAT.ice, keep: MAT.obsidian }[d.theme] || MAT.obsidian;

    m.cells.fill(wallMat | SOLID);
    m.storeys.fill(1);

    const rooms = [];
    const tries = 90;
    for (let i = 0; i < tries && rooms.length < 12; i++) {
      const rw = 4 + rng.int(6), rh = 4 + rng.int(5);
      const rx = 1 + rng.int(d.w - rw - 2), ry = 1 + rng.int(d.h - rh - 2);
      let overlap = false;
      for (const o of rooms) {
        if (rx < o.x + o.w + 1 && rx + rw + 1 > o.x && ry < o.y + o.h + 1 && ry + rh + 1 > o.y) { overlap = true; break; }
      }
      if (overlap) continue;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
    }

    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) m.cells[y * d.w + x] = floorMat;
      }
    }

    // Corridors: connect every room to the previous one, so the graph is a guaranteed chain, then
    // add a few extra links for loops.
    const carve = (x0, y0, x1, y1) => {
      let x = x0, y = y0;
      while (x !== x1) { m.cells[y * d.w + x] = floorMat; x += Math.sign(x1 - x); }
      while (y !== y1) { m.cells[y * d.w + x] = floorMat; y += Math.sign(y1 - y); }
      m.cells[y * d.w + x] = floorMat;
    };
    // A SPINE corridor along y=9, entrance to far wall. Two reasons: a dungeon of rooms joined by
    // dogleg corridors has no long sightline anywhere, which is why s13 framed a wall two cells
    // from the camera; and a spine is simply better dungeon design than a shapeless mesh.
    const SPINE_Y = 9;
    for (let x = 2; x < d.w - 2; x++) m.cells[SPINE_Y * d.w + x] = floorMat;
    for (const r of rooms) {
      // Every room hangs off the spine, so nothing is reachable only through a chain of others.
      let y = r.cy;
      const step = Math.sign(SPINE_Y - r.cy);
      while (y !== SPINE_Y) { m.cells[y * d.w + r.cx] = floorMat; y += step; }
    }
    for (let i = 1; i < rooms.length; i++) carve(rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
    for (let i = 0; i < 3 && rooms.length > 3; i++) {
      const a = rng.pick(rooms), b = rng.pick(rooms);
      if (a !== b) carve(a.cx, a.cy, b.cx, b.cy);
    }

    // Entrance in room 0, beside the stairs rather than on them.
    const first = rooms[0];
    m.entry = { x: first.cx, y: first.cy };
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) m.cells[y * d.w + x] = floorMat;
    carve(2, 2, first.cx, first.cy);
    m.portals.push({
      x: 2, y: 2, to: d.region, kind: 'stairs',
      // Landing coordinates are MANDATORY and sit BESIDE the reciprocal portal, never on it:
      // missing coords softlock, and landing on the return trigger bounces the player straight back.
      tx: 0, ty: 0, tang: 0, exitToRegion: true, dungeon: did,
    });

    // Boss room is the one furthest from the entrance.
    let boss = rooms[rooms.length - 1], bestD = -1;
    for (const r of rooms) {
      const dd = Math.hypot(r.cx - 2, r.cy - 2);
      if (dd > bestD) { bestD = dd; boss = r; }
    }
    m.bossRoom = boss;
    m.entities.push({
      eid: did + '_boss', kind: d.boss, x: boss.cx + 0.5, y: boss.cy + 0.5, z: 0,
      ang: 0, state: 'idle', boss: true, home: { x: boss.cx, y: boss.cy },
    });

    // Populate. Density scales with dungeon level.
    const pop = 8 + Math.round(d.level * 1.3);
    const table = REGIONS[d.region].spawn;
    for (let i = 0; i < pop; i++) {
      const r = rng.pick(rooms);
      if (r === rooms[0]) continue;
      m.entities.push({
        eid: did + '_e' + i, kind: rng.pick(table),
        x: r.x + 0.5 + rng.int(r.w), y: r.y + 0.5 + rng.int(r.h), z: 0,
        ang: rng.float(0, Math.PI * 2), state: 'idle', home: { x: r.cx, y: r.cy },
      });
    }

    // Chests, and the quest item if this dungeon holds one.
    for (let i = 0; i < 3 + rng.int(4); i++) {
      const r = rng.pick(rooms);
      m.decor.push({ kind: 'chest', x: r.x + 0.5 + rng.int(r.w), y: r.y + 0.5 + rng.int(r.h), z: 0,
        tier: clamp(Math.round(d.level / 3), 1, 5), opened: false, id: did + '_c' + i });
    }
    for (let i = 0; i < 4 + rng.int(5); i++) {
      const r = rng.pick(rooms);
      m.decor.push({ kind: 'brazier', x: r.x + 0.5 + rng.int(r.w), y: r.y + 0.5 + rng.int(r.h), z: 0 });
    }

    m.rooms = rooms;
    return m;
  }

  // Quest items live in specific dungeons, placed on the boss room floor so the main chain is
  // always completable by playing rather than by luck.
  const QUEST_ITEM_SITES = {
    barrow_seal: ['barrow'],
    mine_ledger: ['mine'],
    crown_shard: ['barrowdeep', 'stonecircle', 'icetomb'],
    ash_key: ['forge'],
  };

  // ---------------------------------------------------------------- assembly
  function build(seed) {
    RNG.setSeed(seed === undefined ? 7 : seed);
    const maps = {};
    for (const id of REGION_IDS) maps[id] = buildRegion(id);
    for (const id of DUNGEON_IDS) maps[id] = buildDungeon(id);

    // Wire dungeon exits back to the cave mouth they came from, BESIDE it, never on it.
    for (const did of DUNGEON_IDS) {
      const d = DUNGEONS[did];
      const rm = maps[d.region];
      const site = rm.dungeons.find((x) => x.id === did);
      const p = maps[did].portals.find((x) => x.exitToRegion);
      if (site && p) { p.tx = site.x; p.ty = site.y + 2; p.tang = Math.PI / 2; }
    }

    // Place quest items.
    for (const item of Object.keys(QUEST_ITEM_SITES)) {
      for (const did of QUEST_ITEM_SITES[item]) {
        const m = maps[did];
        if (!m || !m.bossRoom) continue;
        m.decor.push({
          kind: 'questitem', item, id: did + '_q_' + item,
          x: m.bossRoom.cx + 0.5, y: m.bossRoom.cy + 1.5, z: 0, taken: false,
        });
      }
    }

    // NPCs: quest givers in their region's settlement, plus wanderers.
    for (const qid of QUEST_IDS) {
      const q = QUESTS[qid];
      const m = maps[q.region];
      if (!m || !m.town) {
        // A region with no town puts its giver at the regional landmark instead of nowhere.
        const host = maps.harrowgate;
        host.npcs.push({ id: 'npc_' + qid, role: q.giver, quest: qid,
          x: host.town.x + 2.5 + host.npcs.length, y: host.town.y + 3.5, z: H(host, host.town.x, host.town.y) });
        continue;
      }
      // Ring the plaza rather than crowding the spawn point. A giver standing inside the party's
      // interact radius fired a quest modal before the player had seen the world at all.
      const a = (m.npcs.length / 6) * Math.PI * 2 + 0.4;
      const nx = m.town.x + Math.cos(a) * 5.5, ny = m.town.y + Math.sin(a) * 5.5;
      m.npcs.push({ id: 'npc_' + qid, role: q.giver, quest: qid, x: nx, y: ny, z: H(m, nx, ny) });
    }

    return { seed: RNG.seed, maps, regions: REGIONS, dungeons: DUNGEONS, quests: QUESTS };
  }

  // ---------------------------------------------------------------- queries
  // The walk surface at a point: terrain, or a span's top when the party is on it.
  function walkHeight(m, x, y, currentZ) {
    const g = H(m, x, y);
    const s = spanAt(m, Math.floor(x), Math.floor(y));
    if (!s) return g;
    // On the deck if already at or above it; otherwise underneath on the ground.
    if (currentZ !== undefined && currentZ >= s.hi - 0.9) return s.hi;
    return g;
  }

  // Can the party stand at (x,y) coming from height z? Blocks solids, deep water, cliffs that are
  // too steep, and anything without headroom under a span.
  function passable(m, x, y, fromZ) {
    if (x < 0.4 || y < 0.4 || x > m.w - 0.4 || y > m.h - 0.4) return false;
    const cx = Math.floor(x), cy = Math.floor(y);
    const c = cellAt(m, cx, cy);
    const s = spanAt(m, cx, cy);
    const onDeck = s && fromZ !== undefined && fromZ >= s.hi - 0.9;
    if (isSolid(c) && !onDeck) return false;
    if (m.kind === 'dungeon') return true;
    const h = H(m, x, y);
    if (!onDeck) {
      if (h < m.sea - 0.6) return false;                       // deep water
      if (fromZ !== undefined && h - fromZ > MAX_CLIMB) return false;   // too steep to climb
      // Headroom: moving UNDER a span needs the party's full height.
      if (s && s.lo - h < 1.6) return false;
    }
    return true;
  }

  return {
    MAT, SOLID, isSolid, matOf, MAT_RAMP, MAX_CLIMB,
    REGIONS, REGION_IDS, DUNGEONS, DUNGEON_IDS, QUESTS, QUEST_IDS, SHOP_KINDS,
    RW, RH, neighbours,
    hash2, vnoise, fbm, ridged,
    blankMap, cellAt, setCell, H, flatten, road, addSpan, spanAt, bridge, gateArch, caveMouth,
    buildRegion, buildDungeon, build, walkHeight, passable, QUEST_ITEM_SITES,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = World;
