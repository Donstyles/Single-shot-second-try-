# ARCHITECTURE — law

**Thornmarch: The Ashen Crown** — an original party RPG in the mould of *Might & Magic VI* (1998).

This document is law. It is written before the modules and is binding afterwards. If code and this
document disagree, one of them is a bug; decide which, fix it, and update the other in the same
commit. Every ambiguity left in here becomes two incompatible implementations, which is the single
most expensive class of defect in a fan-out build.

---

## 1. Product definition

One self-contained `dist/index.html`. Runs in a phone browser in landscape. No network at runtime, no
build step at runtime, no external assets, no WebGL. Canvas2D presenting a 640×480 palettised
software framebuffer.

Non-negotiables, in priority order:

1. **Deterministic.** Same seed + same input sequence ⇒ byte-identical state dump.
2. **Self-contained.** No fetch, no XHR, no external font, no CDN. Everything is baked.
3. **Beatable.** A campaign test wins the game using only player-legal actions.
4. **Phone-playable.** Touch-first input; 640×480 letterboxed into the viewport.
5. **Palettised.** Nothing enters the framebuffer as RGB.

Hard size ceiling: **2 MB** for `dist/index.html`. Enforced by `test/size.test.js`, which fails the
suite. Discovering the payload problem on a phone at the end costs the whole art pass.

---

## 2. Build model

`build.js` reads `src/*.js` in **sorted filename order**, concatenates them inside one IIFE, wraps
them in the HTML shell, and writes `dist/index.html`. That is all it does.

- The numeric filename prefix **is** the dependency order. A module may reference anything defined in
  a lower-numbered file, never a higher-numbered one, except inside a function body that runs after
  boot (all modules are loaded before `Boot.start()`).
- `build.js` embeds baked asset data that is **already on disk**. It never generates art, never calls
  a network API, never invokes a headless browser. Generation is non-deterministic; the build must
  not be.
- No bundler, no transpiler, no dependencies. Plain ES2020 that Chromium and Node both accept.

Modules attach exactly one capitalised global each (`Core`, `Rules`, `Spellcraft`, …). Nothing else
touches the top-level scope. In `page.evaluate`, `const` globals are **not** on `window` — always
guard with `typeof Game !== 'undefined'`.

---

## 3. File ownership — one owner per file

Fan out on **files**, never on **features**. Two agents editing one file is not a merge conflict, it
is silent semantic corruption: one of them re-implements a rule the other already owns. When a
feature spans owners, one owner writes the rule and the others call it.

| File | Owns | May call |
|---|---|---|
| `src/00_core.js` | RNG registry, palette, colour math, `Clock`, `Bus`, `Log`, small utils | — |
| `src/01_rules.js` | stats, classes, skills, mastery, hit/damage, XP, level-up, economy, rest, traps, conditions | `Core` |
| `src/02_spells.js` | schools, spell table, `canCast`, `resolve` | `Core`, `Rules` |
| `src/03_items.js` | item table, monster table, loot tiers, shop stock generation | `Core`, `Rules` |
| `src/04_world.js` | map sources, terrain heightfield, overhead spans, portals, quests, NPCs, spawns | `Core`, `Rules`, `Items` |
| `src/05_engine.js` | the renderer: heightfield march, spans, sprites, fog, lightmap, projection | `Core`, `World` |
| `src/06_art.js` | procedural textures, sky, font, UI frame, decode of baked assets | `Core` |
| `src/06b_sprites.js` | sprite/portrait/paperdoll/icon painters | `Core`, `Art` |
| `src/07_audio.js` | WebAudio music director + SFX | `Core` |
| `src/08_ui.js` | HUD and every screen | `Core`, `Rules`, `Spellcraft`, `Items`, `Art`, `Sprites` |
| `src/09_game.js` | game loop, input, combat orchestration, save/load, interaction | everything below |
| `src/10_debug.js` | boot, `?debug` overlay, `__game` / `__session` harness | everything |

**Glue calls rules.** `08_ui.js` and `09_game.js` never re-implement a formula that `01_rules.js`
owns. If you find yourself writing a second damage calculation, you have already made the mistake
this line exists to prevent.

---

## 4. Palette law

One palette, 256 entries, structured as **16 ramps × 16 shades**. Index = `(ramp << 4) | shade`,
where shade 0 is darkest and 15 is lightest within that ramp.

This structure is the point: **shading is arithmetic on an index**, not a colour lookup. Applying a
light level to a pixel is `(pi & 0xF0) | shade`, and every sprite, wall and floor writes through the
same operation, which is a large part of why the output reads as one 1998 art department.

```
ramp 0  key/grey     index 0 is TRANSPARENT and is the only transparent index
ramp 1  cold stone   ramp 2  warm stone    ramp 3  brick/clay
ramp 4  timber       ramp 5  earth/dirt    ramp 6  grass
ramp 7  foliage      ramp 8  water         ramp 9  sky
ramp 10 flesh        ramp 11 cloth red     ramp 12 cloth violet
ramp 13 gold/brass   ramp 14 steel         ramp 15 flame
```

Rules:

- **Index 0 is transparent, and nothing else is.** `bakePix` and every quantiser must pass index 0
  through verbatim. Remapping 0 to an opaque index once turned the UI frame's viewport hole into a
  black plate and blacked out the entire game.
- Every pixel write clamps the shade nibble: `(pi & 0xF0) | (s < 0 ? 0 : s > 15 ? 15 : s)`.
- Ramp 0 shade 0 is the transparent slot, so opaque greys use shades 1–15. `Core.shade()` clamps ramp
  0 to a minimum shade of 1.
- Nothing enters the build as RGB. Foundry output, generated art and procedural art are all quantised
  through `Core.palDither` first.

`Core.PAL` is a `Uint8Array(256*3)`. `Core.palIdx(r,g,b)` is nearest-index. `Core.palDither(rgba, w,
h)` is ordered-dither quantisation to indices.

---

## 5. Determinism law

All randomness comes from `Core.RNG`, a registry of **named seeded streams**. There is no `Math.random`
anywhere in `src/` — a test greps for it and fails.

Two classes of stream:

- **Layout streams** — `RNG.world(name)`. Derived from the world seed and the name. Reproducible from
  the seed alone, never serialised, used for terrain, map dressing, shop stock.
- **Live streams** — `RNG.live(name)`. Advance during play (combat rolls, loot, wandering monsters)
  and **are serialised into the save**. A save that does not restore stream positions is a
  determinism bug.

Every stream is a SplitMix32/xorshift with an explicit 32-bit state. `RNG.dump()` / `RNG.restore()`
round-trip the whole registry.

`test/determinism.test.js` runs a scripted session twice from the same seed and diffs
`__session.dump()`. Any difference is a bug you have not found yet.

---

## 6. World units and coordinate systems

**One cell = 1.0 world unit** in X and Y. Height (Z) is in the same units. +X is east, +Y is south,
+Z is up. Angle 0 faces +X; angle increases clockwise when viewed from above (`-π/2` = north).

| Quantity | Value | Note |
|---|---|---|
| cell | 1.0 | map grid pitch |
| terrain height range | −8.0 … +28.0 | `h(x,y)`, float |
| party eye height | 1.30 | above the walk surface |
| party body height | 1.60 | headroom test against span `lo` |
| building storey | 3.20 | a solid cell extrudes `storeys × 3.20` above its terrain |
| dungeon ceiling | 3.20 | dungeons are flat: `h ≡ 0` |
| sea level | 0.0 | water plane on the outdoor map |
| max climb slope | 0.75 per cell | steeper is impassable; this is what fences the valley |
| walk speed | 3.4 units/s | run 5.6 |
| FOV | 70° horizontal | |

### 6.1 The heightfield

The outdoor world is a **heightfield**, not a plane. `World.terrain` is a `Float32Array` of
`(W+1)×(H+1)` **vertex** heights; `World.H(x,y)` bilinearly samples it. A flat grid of full-height
walls reads as *Wolfenstein*, not as MM6, and no texture quality repairs that.

The ASCII grid remains the authority for **solid / walkable / material**. The heightfield is a
parallel float array. They are never merged.

Authored under `RNG.world('terrain')`: fbm base, ridged fbm for the bounding mountains, then
**authored overrides applied last and unconditionally** — building footprints and the town plaza are
flat plateaus, roads are graded ribbons, water is below sea level, and a ridge line frames the valley
so there is always something on the horizon.

### 6.2 Overhead spans — the one thing a heightfield cannot express

A heightfield is single-valued: one surface per `(x,y)`. A bridge deck and the ravine floor beneath it
are two. This is decided **before** the march loop is written, not after.

`World.span(x,y)` returns `{lo, hi, tex}` or `null` — a sparse per-cell interval of solid matter
floating above the terrain, empty in almost every cell. One primitive, four features:

| Feature | `lo` | `hi` | Walk surface |
|---|---|---|---|
| bridge | just under the deck | deck top | `hi` when above, ravine floor when below |
| gate arch | head clearance | wall top | terrain (you pass under) |
| aqueduct | arch clearance | channel top | both, depending on approach |
| cave mouth | overhang underside | cliff top | terrain (you walk in under it) |

Rules that fall out of it:
- Walk surface is `terrain` when the party's feet are below `lo`, `hi` when at or above `hi`.
- Collision needs a **headroom test**: moving under a span requires `lo − h(x,y) ≥ 1.60`.
- **Front-to-back with a single "filled to y" marker breaks here**, because a span can occupy screen
  rows above ground already filled. The march tracks two fill regions per column. This is the one
  place the cheap trick does not survive contact — see §7.

### 6.3 Projection

`projScale = VIEW_H / (2 · tan(fov_v / 2))`, computed once. For a world point at horizontal distance
`d` along the view axis and height `z`:

```
screenY = horizon + (eyeZ − z) / d · projScale
```

`horizon` is a **shear**, not a rotation: look-up/down moves the horizon line, which is what MM6 did
and what makes a heightfield read as terrain instead of a wobbling floor. It carries head-bob and
pitch summed. Pitch clamps to ±0.42 · VIEW_H.

---

## 7. Renderer contract

`Engine.render3D(fb, cam)` writes palette indices into the framebuffer. One pass, front to back.

For each screen column `x`:
1. Step outward along the ray in cell steps, with **step size growing with distance** so ~96 steps
   reach ~200 cells and far detail collapses into haze exactly where it should.
2. At each step sample `H(x,y)`, project to `screenY`, fill from the previous filled edge down —
   this replaces the floor caster entirely.
3. A solid cell extrudes a prism from `H` to `H + storeys·3.20`: walls, variable building heights and
   roofs all come out of the same loop.
4. Spans in that cell draw their band in the same step, into the **upper** fill region.
5. Write `zb[x]` = distance to the nearest solid hit, so billboard sprites composite unchanged.

Cost target: ~640 columns × ~96 steps ≈ 60k steps, against the 307k texel writes a full-screen floor
caster does. Budget **≤ 16 ms/frame** for the 3D pass on a mid phone; the frame is otherwise idle.

Sprite feet sit at `H(x,y)` (or span `hi` when the entity is on a span), never on a constant ground
plane. Engine-drawn ground shadows snap the same way.

Fog: geometry dissolves into the **sky colour of the current hour**, not into black — that is what
makes an ocean run out into haze instead of showing the edge of the map. Onset and density are per-map
constants in `World`.

---

## 8. Canonical data shapes

Pick one shape per concept and never carry a second. Duplicated state is the bug factory.

```js
// Time — ONE representation. Minutes since world epoch, integer.
// Derived views (hour, day, phase) are functions, never stored fields.
Clock.t              // 1440 minutes per day

// Currency — ONE field, integer copper-equivalent, named `gold`. No `gp`, no `money`.

// Vector — plain {x, y} floats in world units. Entities additionally carry z.

// Character
{ id, name, cls, sex, portrait,
  base:  {mig, int, per, end, acc, spd, lck},   // permanent
  bonus: {…},                                   // from gear + effects, recomputed, never saved
  hp, hpMax, sp, spMax, ac, xp, level, skillPts,
  skills: { sword: {lvl, mastery}, … },         // mastery: 0 none, 1 novice, 2 expert, 3 master
  cond:   { poison, disease, curse, asleep, afraid, weak, unconscious, dead },
  equip:  { weapon, offhand, bow, armour, helm, boots, cloak, gaunt, belt, amulet, ring1, ring2 },
  pack:   [ItemStack],                          // capacity 30
  recovery, quickSpell }

// ItemStack — items are values, not references. `id` indexes ITEMS.
{ id, bonus, charges, ident, stolen, qty }

// Party — ONE container for shared state
{ members:[Character×4], gold, food, x, y, z, ang, pitch, map,
  quests:{ [questId]: {state, step} },          // state: 0 unknown 1 active 2 done 3 failed
  flags:{}, autonotes:[], hirelings:[] }

// Map
{ id, name, kind:'outdoor'|'dungeon', w, h,
  cells: Uint8Array,        // material index; high bit = solid
  storeys: Uint8Array,      // extrusion count for solid cells
  terrain: Float32Array,    // (w+1)*(h+1) vertex heights; dungeons all-zero
  spans: Map<cellIndex,{lo,hi,tex}>,
  entities: [Entity], portals: [Portal], decor: [Decor], zones: [Zone] }

// Portal — tx/ty are MANDATORY and validated at build time
{ x, y, to, tx, ty, tang, kind:'door'|'stairs'|'edge', locked, key }

// Entity (monster / NPC)
{ eid, kind, x, y, z, ang, hp, hpMax, state, target, cooldown, loot, facing }
```

**Portal law**: every portal carries `tx`/`ty` landing coordinates, placed *beside* the reciprocal
portal, never on it. Missing coordinates softlock the game; landing on the return portal bounces the
player straight back. `test/systems.test.js` asserts both for every portal on every map. Keep those
tests.

**Loot law**: quest items sort **first** when looting, or mundane loot consumes the last pack slot
and the quest item is destroyed.

---

## 9. Save schema

```js
{ v: 3, seed, t, party, maps: { [mapId]: mapDelta }, rng: RNG.dump(), stamp }
```

- `mapDelta` stores only what diverged from the generated map: killed entities, opened doors, taken
  loot, changed cells. Maps are regenerated from the seed and then patched.
- **Load sniffs the schema before mutating any state, and rolls back on failure.** A hostile save once
  produced a 91-error crash loop. Validate into a scratch object, then commit atomically.
- `rng` restores every live stream position. Without it, load is not determinism-preserving.
- Saves live in `localStorage` under `thornmarch.save.<slot>`, 5 slots plus autosave.

---

## 10. Harness semantics

Built **first**, before any game code, because every later stage is driven through it.

```js
window.__game = {
  teleport(x, y, ang),        gotoMap(id, x, y, ang),
  walk(dir, cells),           face(ang),        pitch(p),
  press(key, ms),             tap(x, y),        key(name),
  give(itemId, n),            gold(n),          xp(n),
  setTime(minutesSinceMidnight),                setDay(n),
  heal(),                     kill(eid),        spawn(kind, x, y),
  save(slot),                 load(slot),       newParty(spec),
  screen(name),               closeAll(),
  seed(n),                    step(ms),         settle(frames)
}
window.__session = {
  dump(),                     // full deterministic JSON state — the determinism diff reads this
  brief(),                    // small summary for assertions
  invariants(),               // returns [] or a list of violated invariants
  census()                    // counts every item in the world — the conservation probe
}
```

Contract:
- `dump()` is **stable-ordered** — object keys sorted, arrays in canonical order. An unstable dump
  makes the determinism diff meaningless.
- `dump()` has **no side effects**. It never advances the clock or an RNG stream.
- Harness calls are player-legal by default. `give`/`gold`/`kill`/`teleport` are explicitly not, and
  the campaign test is forbidden from using them.
- `settle(n)` runs exactly `n` frames at a fixed 16 ms timestep. The harness never uses wall-clock
  time; `Clock` is driven by an injected timestep so a headless run is deterministic.

---

## 11. Screen layout and perf

Framebuffer is **640×480**, letterboxed and integer-scaled into the canvas. Phone target is
844×390 landscape (iPhone 14 Pro Max), which scales to 520×390.

| Region | Rect | Note |
|---|---|---|
| 3D viewport | `(8, 8, 624, 344)` | the frame's hole; index 0 must survive `bakePix` here |
| HUD band | `(0, 352, 640, 128)` | 4 portraits, spell/rest/quick buttons, log strip |
| portrait | 76×88, pitch 84 | first at x=14 |
| log strip | `(320, 356, 312, 60)` | 5 lines |

These are **design decisions calibrated to the 640×480 frame**, not measurements of MM6. Real
measured numbers belong in `critique/MM6_REFERENCE.md`, which requires reference screenshots this
build does not have; until it exists, every art decision downstream is a calibrated guess and must be
described that way. Reference is for measurement only — no asset rips, ever.

Budgets: 3D pass ≤ 16 ms, UI pass ≤ 4 ms, blit ≤ 3 ms. 30 fps floor on a mid phone.

---

## 12. Testing law

Four suites, all runnable with bare `node`:

| Suite | Drives |
|---|---|
| `test/systems.test.js` | pure rules, world validity, portal/quest/loot invariants |
| `test/e2e.test.js` | headless Chromium against the real UI |
| `test/campaign.test.js` | character creation → final boss → win, player-legal actions only |
| `test/determinism.test.js` | same seed twice, byte-identical dump; plus the size ceiling |

- **A silent `catch` in a test is a lie, and so is a tolerance window.** A test that cannot fail is not
  a test. The v1 crypt-portal softlock — a hard game-breaker — hid for hours behind
  `.catch(()=>{})` in the E2E suite. A lint test greps `test/` for empty catch bodies and fails.
- Assert what softlocks a player: every portal has valid destination coordinates; no destination lands
  on a return trigger; every quest giver is reachable; no entity spawns inside geometry; every quest
  item survives a full inventory; the quest route is walkable over the generated heightfield given the
  max-climb-slope rule.
- Playwright launches with `executablePath: '/opt/pw-browsers/chromium'`. **Never** run
  `playwright install`.

---

## 13. Scars carried forward

Paid for in the v1 build; do not relearn them.

- `bakePix` must keep palette index 0 verbatim.
- Every portal needs `tx`/`ty`, placed beside the reciprocal stairs, never on them.
- Sprite pixel writes clamp the shade nibble: `(pi & 0xF0) | (s < 0 ? 0 : s > 15 ? 15 : s)`.
- In `page.evaluate`, `const` globals are not on `window` — guard with `typeof X !== 'undefined'`.
- Quest items sort first when looting.
- Save loading sniffs the schema before mutating state and rolls back on failure.
- Turn-based combat: an order must always grant a full round, or the budget drains and recoveries
  never tick — deadlock.
- Encode sprite payloads (RLE / indexed PNG base64) **before** any bulk render run, not after. Raw
  index arrays are enormous: one creature as JSON number arrays was 273 KB in v1.
- Rebuild `dist/` only when no judge agent is mid-run against it.
