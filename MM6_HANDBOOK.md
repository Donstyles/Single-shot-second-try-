# Might & Magic VI — single-shot handbook

Everything in one file: the prompt to hand a context-free agent, why every clause of it exists, the
full state of the existing build, the production machinery, and the scars. Self-contained — nothing
here depends on a conversation you were not part of.

**Three ways to use this document.**

- *Starting fresh, no repo:* go to §12 (the prompt), paste it, keep §13 nearby.
- *Resuming the existing build:* read §1–§2, then start at §10, "First hour of the next session".
- *Only want the lessons:* §7 (the loops), §13.1 (why the prompt is shaped this way), §11.1 (scars).

## Contents

| § | |
|---|---|
| 1 | Where the project stands |
| 2 | Repo map |
| 3 | Content inventory |
| 4 | Definition of done |
| 5 | The plan — foundry, art production, image-generation runbook |
| 6 | Heightfield terrain |
| 7 | Meta-production — the loops |
| 8 | The canonical shot list |
| 9 | The veteran reviewer charter |
| 10 | First hour of the next session · backlog |
| 11 | Honest odds · constraints & scars |
| **12** | **The prompt** |
| 13 | Notes on the prompt |

---

## 1. Where the project stands

**Vintavia** is a complete, beatable, phone-playable MM6-class party RPG in a single self-contained
`dist/index.html` — 640×480 palettised software raycaster, Canvas2D, no WebGL, no external assets.
Game doc: `VINTAVIA.md`.

| | |
|---|---|
| Tests | `test/systems.test.js` (2,808 checks) · `test/e2e.test.js` (66) · `test/campaign.test.js` (23 — beats the whole game) |
| Critique history | `critique/` — 3 specialist cycles, 2 fresh-eyes panel rounds, with written dispositions |
| Round-2 panel scores | QA 8.5 (findings fixed) · first impression 7.5 · aesthete 7.0 · veteran 6 from round 1, all findings fixed |
| Published build | https://claude.ai/code/artifact/b49a3924-9f7f-40eb-9cd2-9aa4aced5658 — private, owner must be signed in. Republish `dist/index.html` from the owning conversation, or pass that URL as `url` from any other. |

**The mandate that supersedes everything else**: screenshots that expert judges cannot tell from real
MM6 — "could pass as an unreleased MM6 expansion". The current build reads as a competent 1998
*budget* raycaster. **The gap is assets, renderer features and content volume — not systems.** The
systems are the part that is done.

## 2. Repo map

| Path | What it is |
|---|---|
| `README.md` | the original single-prompt guide (the user's document — do not restructure it) |
| `ARCHITECTURE.md` | **law.** Module map, canonical data shapes, world units, perf budgets, harness semantics |
| `VINTAVIA.md` | game design doc: classes, spells, quests, economy |
| `src/00_core.js` | RNG registry, palette (`PAL`, `palIdx`, `palDither`), `Clock`, `Bus`, `Log` |
| `src/01_rules.js` | pure rules: stats, classes, skills, hit chance, XP, economy, rest, traps |
| `src/02_spells.js` | 27 spells, 9 schools, `Spellcraft.canCast/resolve` |
| `src/03_items.js` | items, 17 monsters, loot tiers |
| `src/04_world.js` | ASCII maps, world build, portals, quests, NPCs, shop stock |
| `src/05_engine.js` | the renderer — DDA walls, floor/ceiling casting, sprites, fog, lightmap |
| `src/06_art.js` | procedural textures, sky, font, UI frame |
| `src/06b_sprites.js` | sprite/portrait/paperdoll/icon painters |
| `src/07_audio.js` | WebAudio music director + SFX |
| `src/08_ui.js` | HUD and every screen |
| `src/09_game.js` | game loop, input, turn-based combat, save/load, interaction |
| `src/10_debug.js` | boot, `?debug` overlay, `__game`/`__session` harness |
| `build.js` | concatenates `src/*.js` in sorted order → `dist/index.html` |
| `tools/foundry.js`, `tools/creatures.js` | 3D sprite foundry (see §5) |
| `tools/imagegen.js`, `tools/genspecs/` | image-gen → quantized asset pipeline (**unverified — never reached the API**, see §5.6) |
| `assets/manifest.json` | foundry output — currently the goblin only |
| `critique/SHOTLIST.md` | **the canonical shot list.** Every critique round captures exactly these |
| `critique/cycle1,2/`, `critique/panel,panel2/` | past findings + dispositions |
| `.claude/agents/mm6-veteran.md` | the durable veteran reviewer agent |
| `SINGLE_SHOT_V2.md` | the v2 single-shot prompt for a fresh, context-free agent, plus its design rationale |

**Commands**

```bash
node build.js                                    # src/*.js -> dist/index.html
node test/systems.test.js                        # pure-rules suite
node test/e2e.test.js                            # headless browser suite
node test/campaign.test.js                       # plays the game to completion
node tools/foundry.js [creatureId ...]           # render sprites -> assets/manifest.json
```

Playwright: always launch with `executablePath:'/opt/pw-browsers/chromium'`. Never run
`playwright install`.

## 3. Content inventory (and the scale gap)

Four playable 3D maps:

| Map | Size | Contents |
|---|---|---|
| `outdoor` "Vintavia Coast" | 96×96 (9,216 cells) | town, wilderness, coast, roads, camps, all 8 shop fronts, 4 wandering NPCs |
| `dun1` The Crypt | 30×16 | entered from the outdoor crypt door |
| `dun2` The Catacombs | 30×16 | mid-game |
| `dun3` The Vault | 30×8 | endgame |

Plus 8 building interiors that are **UI screens, not 3D maps**, and 6 quests (4 main, 2 side).

That is one region and three small dungeons. MM6 shipped roughly thirty outdoor regions and dozens of
dungeons. Content volume is a *third* axis of the gap, independent of renderer and art — and it is the
one the discriminator will never measure, because a screenshot cannot show how much world is behind
it. Do not let single-screenshot parity hide it.

## 4. Definition of done

"Perfect MM6" is not one goal, it is three, and they fail independently. Write the verdict for each
separately or the good axis will hide the bad one:

1. **Systems** — MM6-shaped rules that hold under abuse. *Done when*: all three suites green, the
   campaign test beats the game, a determinism diff over a scripted session is byte-identical, and the
   veteran panel reports no defect it would have phoned a tipline about.
2. **Presentation** — the screenshot axis. *Done when*: discriminator accuracy over the full shot list
   approaches chance (~50–60%), and judges' stated tells are aesthetic preferences rather than
   structural ones ("the trees repeat" is a fix; "this is a raycaster" is a failure).
3. **Volume** — how much world is behind the screenshot. *Done when*: enough regions and dungeons that
   a player can get lost. **No screenshot measures this**, which is exactly why it will be the axis
   quietly skipped. Give it a number up front and hold to it.

### Measure MM6, do not remember it

Every "MM6 was like this" claim made from memory during this project that mattered turned out to need
checking. Before the next art wave, take reference screenshots and **measure**, recording results in
`critique/MM6_REFERENCE.md`: 3D viewport pixel dimensions inside the 640×480 frame, HUD band height,
portrait size and spacing, wall texture resolution, typical sprite height in pixels at one cell and at
ten, horizon position relative to viewport centre, fog onset distance in cells, the palette's actual
ramp structure, font cap-height. Numbers, not adjectives.

**That file does not exist yet and it is the highest-leverage missing artifact in this repo**, because
every art decision downstream is currently a guess calibrated against a feeling.

Reference for measurement only — no asset rips, ever. Style parity, original content.

## 5. The plan

1. **Sprite foundry** — WORKING (`tools/foundry.js` + `tools/creatures.js`). Three.js in headless
   Chromium renders low-poly primitive-built creature models under a 1998 render-farm light rig, into
   palette-quantized multi-facing sprite frames. Goblin proven (`test/shots/foundry_goblin2.png`).
   **TODO**: model the other 16 creatures + 3 NPC kinds (parallel agents, vision-iterate each);
   integrate the manifest into the build (base64 in `build.js`, facing-aware selection in
   `05_engine.js` — pick facing from entity-vs-camera angle, mirror for 3/8ths).
2. **Renderer parity** — heightfield terrain (§6), variable building heights + pitched roofs, real
   fog, painted sky dome, 128px structured textures, exact MM6 HUD proportions.
3. **Image generation** — once network is open: OpenAI `gpt-image-1` for textures, portraits, UI
   ornament, sky. The user pastes the key; store it OUTSIDE the repo (scratchpad, `chmod 600`), never
   commit it, never put it in an environment variable. Quantize every output through the game palette
   (`palDither`).
4. **Discriminator harness** — the ship metric. ~50 real MM6 screenshots (reference only, never
   shipped) shuffled with ours; fresh vision judges label real/fake; iterate until accuracy approaches
   chance. The judges' stated tells drive each next fix wave.

### 5.1 Art production — the bill of materials

Nobody has ever counted the art this game needs, which is why "asset volume" kept being discussed as
a feeling. Counted from the current source:

| Class | Count | Source | Notes |
|---|---|---|---|
| Creature sprite frames | **~336** | foundry | 17 monsters + ~4 NPC kinds × (idle/walk/attack × 5 facings + corpse) |
| Item icons | 36 | image-gen or hand | one per entry in `ITEMS` |
| Portraits | ~30 | image-gen | 11 named NPCs + party faces + pain variants |
| Paperdoll pieces | ~15 | image-gen or foundry | must register to one body rig |
| Wall textures | 10 now → ~24 | image-gen | target 128px, structured (courses, joints, wear) |
| Floor / ceiling textures | ~12 | image-gen | tiling, per-level |
| Sky bands | ~6 | image-gen | one per time bucket |
| Decor sprites | 14 | foundry | tree, rock, tent, brazier, fountain, shrine, sign, lamp… |
| Spell sigils + school gems | ~36 | procedural or image-gen | 27 spells, 9 schools |
| UI ornament | ~30 | image-gen | frame, rosettes, buttons, tabs, crest |

**Roughly 500 discrete assets, ~340 of them foundry frames.** One creature is done. That is the real
scale of the presentation axis, and it should be planned as a production run — batched, with a
per-batch review gate — not as an open-ended polish pass.

### 5.2 Which generator makes what

Route by what each tool is actually good at, and do not mix routes within an asset class:

- **Foundry (3D → quantized frames)** — anything needing consistent lighting across many facings and
  frames: creatures, NPCs, decor props, paperdoll pieces. It is the only route that gives *coherence
  for free*, because the light rig is fixed and the geometry is the same object seen from angles.
- **Image generation** — flat, single-view surfaces where a model's eye for material beats a
  primitive-built mesh: wall and floor textures, portraits, sky, UI ornament.
- **Procedural (existing `06_art.js` code)** — anything that must animate or vary per-cell: water
  frames, fire, lightmap glow, the font. Keep it; do not regenerate what already works.

### 5.3 The consistency problem, which is the whole problem

Generating one good texture is easy and proves nothing. Generating four hundred assets that look like
they came from **one 1998 art department** is the entire difficulty, and it has exactly three levers:

1. **The palette is the great unifier.** Every asset — foundry, generated, procedural — is quantized
   through `palDither` into the same 256-index ramp structure before it enters the build. This alone
   removes most style drift, and it is non-negotiable: nothing enters the game as RGB.
2. **One style anchor per class.** Approve a single reference asset per class first (one wall, one
   portrait, one icon), commit it, and pass it as the visual reference for every sibling. Never
   generate a class's assets from independent prompts.
3. **Batch review, not per-asset review.** Judge a full contact sheet of a class side by side. Drift
   is invisible one asset at a time and obvious in a grid of twenty. The odd one out gets regenerated,
   not accepted because it is "good on its own".

Fixed prompt preamble for every generated asset: 1998 pre-rendered CRPG, 256-colour, hard warm key
light from upper-left, no modern shading, no text, no signature, flat background for masking.

### 5.4 Acceptance criteria — how an asset is allowed into the build

Reject on any of these; regeneration is cheap and drift is not:

- **Palette-legal**: every pixel is a valid index; transparency is index 0 and *only* index 0.
- **Readable at target size**: creature sprites are judged at their on-screen size at 3–10 cells, not
  zoomed. If the silhouette does not read at 40px tall, the model is wrong — no texture fixes that.
- **Silhouette test**: fill the sprite solid black. It must still be identifiable as its creature.
  This is the single best predictor of whether it reads as MM6.
- **Lighting agrees**: key from upper-left, matching the rig in `tools/foundry.js`. A generated
  texture lit from the right will fight every sprite in the frame.
- **Outlined**: 1px dark outline on sprites (the foundry already does this) — it is what separates
  1998 pre-rendered from a modern render pasted on a background.
- **Tiles cleanly**: textures checked as a 3×3 grid, with no seam and no obvious repeat feature.

### 5.5 Storage, determinism, and the size budget — read before generating anything

**Generated art is not deterministic and must never be produced at build time.** Every asset is
generated once, reviewed, quantized, and **committed to the repo** as baked data. `build.js` only
embeds what is already on disk. Break this and the build stops being reproducible, the shot list
stops being comparable between rounds, and the discriminator's measurements become meaningless.

The size budget is real and currently violated in miniature: `dist/index.html` is **241 KB**, while
`assets/manifest.json` — **one goblin** — is **273 KB** of JSON number arrays. At that rate the ~21
actors alone would add roughly 5.7 MB to a file meant to load instantly on a phone over mobile data.

So before any bulk foundry run, fix the encoding: RLE the palette bytes, or write indexed PNGs and
embed those as base64 (the browser decodes them for free). Either is a 4–8× reduction and turns the
sprite payload into something a phone loads without complaint. Set a hard ceiling — **2 MB for the
whole single-file build** is a sane target — and check it in a test, so it fails loudly rather than
being discovered on a phone at the end.

### 5.6 Image generation runbook (OpenAI)

Everything here was blocked by network policy during the first run, so **treat it as unverified
until it has run once.** `tools/imagegen.js` implements this flow and has never successfully reached
the API; expect to debug it, and verify request/response shapes against current OpenAI docs rather
than trusting this file.

**The key.** The user supplies it. Rules, in order of importance:
- Never commit it, never echo it into a log, never put it in an environment variable on the
  environment config — environment variables are visible to anyone who can open that environment.
- Store it in the session scratchpad only, `chmod 600`, outside the repo tree.
- **The scratchpad is per-session.** A new session cannot read the previous session's key — the user
  must paste it again each time. Say so up front rather than discovering it mid-run.
- Ask for a **spend-capped, project-scoped key**, and tell the user to revoke it when the run ends.

**The network.** Egress goes through the agent proxy. `api.openai.com` is only reachable if the
environment's Network access is Full or a Custom allowlist including it, and **that setting applies
to new sessions only** — an existing session cannot be un-blocked. A `403` on CONNECT is a policy
denial, not a transient error: do not retry it, do not disable TLS verification, do not unset
`HTTPS_PROXY`. Node needs the proxy CA (`/root/.ccr/ca-bundle.crt`) via `NODE_EXTRA_CA_CERTS`.

**The call.** `POST https://api.openai.com/v1/images/generations`, `Authorization: Bearer <key>`,
body `{model:'gpt-image-1', prompt, size, n}`; the response carries base64 image data. For style
consistency use the **edits** endpoint (`/v1/images/edits`, multipart, with the approved anchor image
attached) rather than a fresh generation — passing the anchor is what keeps a class of assets from
drifting, and it is the main reason to prefer this API over describing the style in words each time.

**The pipeline — generation is the first step, not the deliverable:**

1. Generate large (1024²) — models compose better at size than at 128px.
2. Downsample to the real target with area averaging (128px wall, 64px floor, portrait to its HUD
   size). Never ask the model for tiny images.
3. **Quantize through `palDither`** into palette indices. Nothing enters the build as RGB.
4. Apply class rules: 1px dark outline for sprites, seam repair for tiles.
5. **Contact-sheet the whole class and review it as a grid**, not one at a time.
6. Commit the quantized result. The raw RGB generation is a build input, not an asset — keep it out
   of `dist/`, and keep generation out of `build.js` entirely, since it is non-deterministic.

**Tiling is the known weak point.** Image models do not produce seamless tiles. Either wrap the image
by half in both axes and inpaint the visible seam cross via the edits endpoint, or generate
deliberately flat, evenly-lit material and make it seamless procedurally afterwards. Check every
texture as a 3×3 grid before accepting it — a seam that is invisible alone is a grid of scars on a
wall.

**Cost.** Roughly 150 of the ~500 assets are image-gen candidates; budget a 3× reject rate, so plan
for ~450 generations. Check current per-image pricing before starting and give the user a number
before spending their money, not after.

**Never upload reference material you do not own.** Real MM6 screenshots are for measurement and for
the discriminator only — they are not prompt inputs and never go to a third-party API.

## 6. Heightfield terrain — the outdoor-parity plan

MM6's outdoor maps (`.odm`) *are* a heightmap: a grid of terrain vertices with per-tile textures, with
buildings as separate models standing on it. Our outdoor map is a flat plane, so every outdoor
screenshot has a dead-level horizon at exactly mid-screen and zero elevation anywhere. That single
fact is the loudest "not MM6" tell we have; no amount of better wall texture fixes it.

**Approach: extend the per-column march to a heightfield (Comanche/voxel-space with per-cell
extrusion), replacing the floor caster.**

- Today `render3D` does floor/ceiling casting (`src/05_engine.js:133`) — a full 640×480 texel walk —
  then a separate DDA wall pass. The heightfield version merges both: for each screen column, step the
  ray outward through cells; at each step read terrain height `H(x,y)` (bilinear over a vertex grid),
  project the ground point to a screen y, and fill the column from the previous y down. A solid cell
  extrudes a prism from `H` to `H + wallHeight`, giving buildings *and* variable heights and roofs
  from the same loop.
- Cost is roughly a wash: ~640 columns × ~96 steps ≈ 60k steps beats the 307k texel writes the floor
  caster does now, and front-to-back with a per-column "filled-to" y lets a column early-out.
- Compositing: keep writing `zb[x]` for the nearest solid hit so existing billboard code still works,
  but sprite feet must sit at `H(x,y)` instead of a constant ground plane (touches sprite y in
  `05_engine.js` and the engine-drawn ground shadows).
- Pitch: MM6's look up/down is a horizon shear, not a real rotation. `horizon` is already a variable
  (`05_engine.js:90`, currently just head-bob) — feed a pitch term into it and free-look is nearly
  free. A heightfield makes that shear read as real terrain instead of a wobbling floor.

**Heightmap authoring** — deterministic like everything else: `RNG.world('terrain')` fbm noise, then
authored overrides. Non-negotiable constraints: building footprints and the town plaza are flat
plateaus; roads are graded ribbons that carve through hills; water is "below level"; a ridge line
frames the valley so there is always something on the horizon. The ASCII grid stays the authority for
solid/walkable; the heightmap is a parallel float array.

**Gameplay ripples** (budget for these — they are where the bugs will be): camera eye =
`H(px,py) + eyeHeight`; a max-climb-slope rule means terrain can trap the party, so
`test/campaign.test.js` is the gate plus a new reachability test that walks the quest route over the
generated heightmap. Monster spawns, camp props and corpses all need ground snapping.

**Sequencing**: terrain *before* wiring the sprite manifest into the engine, or sprite placement gets
written twice.

**Cheap fallback if terrain slips**: a painted mountain-ridge backdrop composited at the horizon with
parallax — ~10% of the work for a real fraction of the impact, and worth having anyway, since real
terrain still wants a painted far range behind it.

### 6.1 Terrain features, and the one that breaks the model

A heightfield is a *function* `h(x,y)` — one surface height per point. Most features fall straight out
of that. **Bridges do not**: a bridge deck and the ravine floor beneath it are two surfaces over the
same `(x,y)`. Decide this before writing the march loop, not after.

- **Bridges, gate arches, aqueducts, cave mouths** — all four are *one* primitive, so build it once
  and build it properly: a sparse per-cell **overhead span** `{lo, hi, tex}`, an interval of solid
  matter floating above the terrain, empty in almost every cell. The walk surface is the terrain when
  the party is below `lo`, and `hi` when above. That single rule covers everything:
  - *bridge* — walk on `hi`, ravine floor visible in the gap beneath;
  - *gate arch* — walk on terrain, pass **under** `lo`, wall solid overhead;
  - *aqueduct* — both at once: arches you walk under, water channel running along `hi`;
  - *cave mouth* — a span forming the cliff overhang above a tunnel entrance, so a dungeon portal
    reads as a dark opening in rock instead of a door standing in a field.

  The march draws the span band in the same pass as the terrain column. Front-to-back with a single
  "filled to y" marker **breaks here**, because a span can occupy screen rows above ground already
  filled — either track two fill regions per column, or draw spans back-to-front (painter's). It is
  the one place the cheap trick does not survive contact. Collision needs a headroom test under `lo`;
  the party is ~1.6 units tall. The same primitive later gives second-storey walkways and gatehouses.
- **Ravines / canyons** — carved along a spline, steep walls, flat floor. Their job is *routing*: they
  make bridges and fords load-bearing rather than decorative, and they give the vertical drama that
  makes a screenshot read as MM6 rather than as a lawn. Steep sides let the slope limit do the fencing.
- **Rivers** — carve a channel along a spline, then a water surface per segment. On a slope a river
  needs stepped pools (each with its own flat level) rather than one tilted plane; the steps read as
  small falls. Reuse the animated water tiles (`Art.tick`), plus a foam band where `|h − waterLevel|`
  is small.
- **Oceans** — a global sea level and the same water plane. The requirement is that the *map edge is
  never visible*: sea must run out into the distance haze. Vintavia is already a coast, so the
  shoreline is where the water/foam/haze stack gets proven first.
- **Mountains** — ridged fbm above a snow-line ramp. Their real function is to bound the playable
  valley with terrain instead of an invisible wall you bump into, which is a large perceived-quality
  win by itself.
- **Hills** — the fbm base layer. Roads grade over them; camps and clearings get local flattening.
- **Draw distance** — mountains only matter if the march reaches them. Grow step size with distance
  (standard voxel-space trick): ~96 steps then covers ~200 cells, far detail collapsing into haze
  exactly where we want it anyway.

Author all of it from splines + noise under `RNG.world('terrain')` — never from a generated image, or
determinism dies. Build a top-down debug heightmap view early (`?debug`): it is the artifact the
critique loop reads to catch unreachable pockets and silly landforms before they cost render time.

## 7. Meta-production — the loops

The systems were not the hard part. The hard part was *knowing what was actually wrong* while being
the same entity that built it. Everything below is machinery for that, and it is the most reusable
thing in this repo — more reusable than any of the game code.

### 7.1 The five loops

**L1 — Build fan-out.** Parallel agents writing code. The only rule that matters: **one owner per
file.** Two agents editing one file is not a merge conflict, it is silent semantic corruption — one of
them re-implements a rule the other already owns. `ARCHITECTURE.md` exists to make ownership
declarable. Fan out on *files*, never on *features*, because features cut across files; when a feature
genuinely spans owners, one agent writes the rule and the others call it.

**L2 — State-dump playtest.** The cheapest and most under-rated loop. `window.__game` drives the sim
(`teleport/gotoMap/walk/press/tap/give/gold/setTime/save/load`), `window.__session` dumps state. Script
a sequence → dump → assert → repeat. Three variants earned their keep:
- *Invariant assertions* — things that must always hold (hp in bounds, no item in two places, quest
  flags monotonic).
- *Conservation probes* — the reported "item duplication bug" was disproved by a 400-operation probe
  that counted every item in the world before and after. A probe is how you refuse to chase a ghost.
- *Determinism diffs* — run the same seeded sequence twice, diff the dumps. Any difference is a bug
  you have not found yet. This is why the RNG registry is serialized into saves.

**L3 — Screenshot critique.** Vision agents reading captures. Signal only exists if the shots are *the
same shots every round*: `critique/SHOTLIST.md`, fixed seed, fixed clock, captured from a **pinned
build**. That is what separates "we improved" from "we got a luckier frame". Round N's captures live
beside round N's findings; nothing is ever overwritten.

**L4 — Fresh-eyes panel.** Zero-context agents given the built artifact and a role (genre veteran /
first impression / QA / aesthete), who have not seen the code or the plan. Context is the enemy: an
agent that watched the thing get built grades the effort, not the result. The panel is why the round-1
veteran said 6 while the builder's self-assessment was much higher. Run at least two rounds — round 2
finds what round 1's fixes broke, and it did exactly that (the quest-item-loss fix moved the bug
rather than removing it).

The **MM6 veteran is the single most valuable seat** — harshest and most actionable review of the
project (`critique/panel/veteran.md`, 6/10, every finding real). It is now a durable agent at
`.claude/agents/mm6-veteran.md`: spawn with `Agent(subagent_type:'mm6-veteran')`. Its entire worth is
having no project context — **never brief it on intent, never let it read `src/`, `critique/`, or this
file.** The moment it knows what we meant to build, it grades effort instead of result. The other
three seats are worth promoting to definitions too.

**L5 — Discriminator.** The ship gate, not a critique. Real MM6 screenshots shuffled with ours, fresh
vision judges labelling real/fake. Ship when accuracy approaches chance. Everything else is opinion;
this is a measurement. **Build it before making more art** — without it, "better" is a feeling and
every fix wave is a guess.

### 7.2 Invariants every loop needs

1. **Pin the artifact.** Never rebuild `dist/` while judges are mid-run. Findings against a build that
   no longer exists can be neither verified nor dismissed.
2. **The grader must not be the builder.** The builder can grade *tests*; it cannot grade *wow*.
3. **Every finding gets a written disposition** — fixed, rejected-with-reason, or deferred-with-reason
   (see `critique/panel/round1_disposition.md`). Undisposed findings evaporate and return three rounds
   later.
4. **Verify the fix on screen, not in the diff.** A fix that exists only in code review is a claim.
5. **Ask for methods, not adjectives.** "Make it wow" produced nothing. "Capture these 6 shots, name
   the three specific tells that break the illusion, ranked" produced the entire fix list.
6. **Agents are wrong sometimes.** Two of the loudest reported bugs needed probes before fixing — one
   was real, one was not. Reproduce before you repair.

### 7.3 Anti-patterns, paid for in full

- **`.catch(()=>{})` in a test is a lie.** The crypt-portal softlock — a hard game-breaker — stayed
  invisible for hours because an E2E test swallowed the exact error it existed to catch. Ban silent
  catches and tolerance windows; a test that cannot fail is not one.
- **Grading in the same context that built.** Inflated scores, defensive dispositions.
- **Findings without a shot list.** Unreproducible art criticism cannot be closed.
- **Unbounded loops.** Every round costs real budget.

### 7.4 Loop economics

Budget is a design constraint, not an afterthought — this project hit a usage ceiling at 96% with work
still queued, which is *why* this file exists. Decide the round count before starting, checkpoint
(commit + push) at every round boundary, and keep this document current enough that a fresh session
loses nothing but conversation. Prefer many small verifiable rounds to one heroic pass. A round that
ends without a commit is a round that may not have happened.

### 7.5 Order of construction

Build the harness (L2) before the systems, the shot list and discriminator (L3/L5) before the art, and
the panel (L4) before believing anything is done.

---

## 8. The canonical shot list

Also lives at `critique/SHOTLIST.md`; referenced by §7.1 (loop L3) and §10.

The fixed set of captures every critique and discriminator round uses. **The shots never change.**
Same camera, same seed, same clock — so a difference between rounds is a change we made, not a
frame we got lucky with. Adding a shot is fine; editing or removing one invalidates comparison
against every earlier round, so don't.

Capture with Playwright headless Chromium (`executablePath:'/opt/pw-browsers/chromium'`), viewport
`844×390` (iPhone 14 Pro Max landscape) unless the round is explicitly desktop. Drive with the debug
harness, one shot per page load or with a settle frame between:

```js
__game.gotoMap(map, x, y); __game.teleport(x, y, ang); __game.setTime(t);
```

Write to `critique/shots/<round>/<id>.png`. Never overwrite a previous round's directory.

`ang` is radians, `0` = +X (east), `-1.5708` = north, `3.1416` = west, `1.5708` = south.
`t` is minutes since midnight (720 = noon, 1380 = 23:00).

★ marks the **core eight** — the fast subset for cheap iteration rounds. Full list for panel and
discriminator rounds.

### World shots

| id | map | x | y | ang | t | what it must prove |
|---|---|---|---|---|---|---|
| ★ s01_plaza_noon | outdoor | 41.5 | 39.5 | 0 | 720 | town plaza + fountain: facade variety, crowd, midday palette |
| s02_main_street_morn | outdoor | 33.5 | 37.5 | -1.5708 | 540 | shopfronts, hanging signs, long street perspective |
| ★ s03_gate_east_dusk | outdoor | 68.5 | 37.5 | 3.1416 | 1140 | town wall from outside at warm hour — **gate arch** shot |
| ★ s04_road_east_noon | outdoor | 75.5 | 38.5 | 0 | 720 | open wilderness. **The terrain shot.** Today: flat horizon at mid-screen. This is the one to beat. |
| ★ s05_crypt_gate | outdoor | 81.0 | 40.5 | 0 | 900 | dungeon entrance — **cave mouth** shot, braziers, cliff face |
| s06_bandit_overlook | outdoor | 70.5 | 20.5 | -1.5708 | 780 | camp at distance: tents, sprites at range, haze falloff |
| s07_shrine_south | outdoor | 51.5 | 73.5 | -1.5708 | 1020 | landmark + tree density + long sightline |
| ★ s08_town_night | outdoor | 45.5 | 42.5 | -1.5708 | 1380 | night palette, lamp and brazier glow, torch radius |
| s09_dawn_road | outdoor | 60.5 | 30.5 | 0 | 330 | dawn ramp — the light transition MM6 is remembered for |

### Dungeon shots

| id | map | x | y | ang | t | what it must prove |
|---|---|---|---|---|---|---|
| ★ s10_crypt_entry | dun1 | 3.5 | 2.5 | 0 | 720 | first indoor frame a player ever sees |
| ★ s11_crypt_corridor | dun1 | 9.5 | 9.5 | 0 | 720 | long corridor: torch falloff, wall tiling, depth |
| s12_catacomb_hall | dun2 | 8.5 | 8.5 | 0 | 720 | open hall, multiple sprites, ceiling read |
| s13_vault | dun3 | 5.5 | 2.5 | 0 | 720 | endgame room: pillars, boss door, marble |

### UI and moment shots

| id | state | what it must prove |
|---|---|---|
| ★ s14_combat | turn-based active, party mid-swing, 2+ monsters visible | the frame a screenshot judge is most likely to be shown |
| s15_charsheet | character sheet, PC 1 | stat block density and typography |
| s16_paperdoll | inventory with a fully equipped PC | paperdoll art, item icons |
| s17_shop | weapon smith, wares list open | the shop frame — heavy UI ornament |
| s18_spellbook | spellbook, fire school | school gems, sigil page art |
| s19_automap | automap outdoor, zoomed to town | map rendering |
| s20_title | title screen | first impression, vista art, logotype |

### Rules for using it

1. Capture from a **pinned build**. Note the commit SHA in the round directory.
2. Capture the whole list *before* reading any of it. Judging as you capture biases the fix list.
3. Every round's findings must name shot ids. "The outdoors feels flat" is not a finding;
   "s04: the horizon is a dead level line at exactly mid-screen" is.
4. Diff against the previous round on the **same id**, side by side, before declaring progress.

---

## 9. The veteran reviewer charter

Also lives at `.claude/agents/mm6-veteran.md`, where it is a spawnable agent
(`Agent(subagent_type:'mm6-veteran')`). Reproduced in full so a fresh project can recreate the seat
that produced the most useful review of the entire run.

You are a Might & Magic veteran. You played MM3 through MM8 on release, finished VI more times
than you can count, and you still know where the obelisks are. You review games the way you did
for a print magazine in 1998: you play, you take notes, you say whether it ships.

**You have not seen this project's code, plan, or previous reviews, and you must not go looking
for them.** Read only what a player could see. If you are handed screenshots, judge the
screenshots. If you are handed a build, play the build. Do not read `src/`, `critique/`,
`HANDOFF.md`, or any design doc — your value is that you are the only one in the room without
the builder's context, and reading it destroys the thing you were hired for.

### How to play

The build is a single self-contained `dist/index.html`. Drive it with Playwright headless
Chromium, launched with `executablePath: '/opt/pw-browsers/chromium'` — never run
`playwright install`. Play with taps and keys like a person: keyboard for movement, clicks on
UI. A debug harness exists (`window.__game`) for teleporting and time-setting when you need to
reach late content quickly — use it to *travel*, never to skip the systems you are judging.
Capture screenshots as you go and actually look at them.

Play a real session, in order: make a party by hand (never the recommended button), shop, take
the first quests, fight, rest, dungeon-crawl, die if it happens, save and reload. Push on the
loops a player lives in — combat, inventory, buying, resting, navigation — because that is where
1998 games broke.

### What to report

Write it as a review, not a bug list:

1. **VERDICT: SHIP or NO-SHIP — n/10.** Lead with it. The number is your honest read against
   the games you actually played, not against browser-homage expectations. Be hard. A 6 that is
   explained is worth more than a generous 8.
2. **Session story** — what happened to you, in order, in prose. This is the most useful part of
   the review: it surfaces defects no checklist would ask about.
3. **Ranked defects** — each with what you did, what happened, what should have happened, and
   how a 1998 player would have exploited or been blocked by it. Rank by what would have made
   you put the game down.
4. **What it gets right** — specific, so it does not get refactored away by accident.
5. **The gap to MM6** — name the concrete tells. "Feels off" is worthless; "the horizon is a
   dead level line at exactly mid-screen and no terrain ever rises above it" is the finding.

Rules of the house: reproduce before you report — a defect you cannot repeat is a note, not a
finding, and say which it is. Judge only the build in front of you; if it changes underneath
you mid-review, say so and stop. Never grade effort, intent, or difficulty of implementation.
You are the player, and the player does not care.

---

## 10. First hour of the next session

In order, before writing a line of game code. These prevent the two failure modes that actually
happened here — building on an unverified base, and grading yourself.

1. `node test/systems.test.js && node test/e2e.test.js && node test/campaign.test.js` — confirm the
   base is green before touching it. If it is red, that is the whole first task.
2. `node build.js`, then capture the full shot list into `critique/shots/r0/` with the commit SHA
   recorded. That is the "before" everything else is measured against, and it takes minutes.
3. Build `critique/MM6_REFERENCE.md` by measuring reference screenshots (§4).
4. Spawn `mm6-veteran` on the r0 build, cold, unbriefed. Read its verdict *before* choosing work — the
   plan in this file is a hypothesis and the veteran is the test of it.
5. Only now pick the work. Terrain first (it moves shots s03/s04/s05 and blocks sprite placement),
   then the foundry backlog, then image-gen textures.
6. Commit and push at every round boundary.

### 10.1 Backlog

- [ ] `critique/MM6_REFERENCE.md` — measured reference numbers (blocks all art work)
- [ ] Heightfield terrain + overhead-span primitive (§6)
- [ ] Terrain reachability test over the generated heightmap
- [ ] Sprite encoding + size budget test (see §5.5) — **do this before any bulk foundry run**
- [ ] Foundry: 16 remaining creatures + 3 NPC kinds + 14 decor props
- [ ] Manifest integration: base64 in `build.js`, facing-aware sprite selection in `05_engine.js`
- [ ] Variable building heights + pitched roofs
- [ ] Painted sky dome; 128px structured textures; MM6 HUD proportions
- [ ] Style anchors: approve one wall, one portrait, one icon before generating their classes (§5.3)
- [ ] Verify `tools/imagegen.js` against the live API (first successful call is the milestone)
- [ ] Image-gen pass for textures/portraits/ornament (needs open network + user's key re-pasted)
- [ ] Discriminator harness + first measured round
- [ ] Promote first-impression / QA / aesthete panel seats to `.claude/agents/`
- [ ] Content volume: more regions and dungeons (pick a target number first)

## 11. Honest odds

Nothing in this document guarantees a perfect MM6, and a handoff claiming otherwise would be the least
useful kind. What is here removes the *avoidable* failures: unverified bases, self-grading,
unreproducible criticism, findings that evaporate, context lost between sessions.

What remains genuinely hard, in order: **asset volume** (hundreds of textures, sprites and portraits
at consistent quality — the foundry is the answer, but it has produced one creature out of twenty),
**content volume** (four maps against MM6's dozens, invisible to every metric we have), and **the last
10% of the renderer**, where each remaining tell costs more than the one before it. Budget
accordingly, and prefer finishing one axis convincingly over advancing three halfway.

### 11.1 Constraints & scars (don't relearn these)

**Environment**
- Egress: default-Trusted blocks everything but package registries. `api.openai.com` needs the
  environment's Network access set to Full or a Custom allowlist. **Config applies to NEW sessions
  only.** A 403 on CONNECT is a policy denial — do not retry it, and never disable TLS verification or
  unset `HTTPS_PROXY`.
- Playwright: launch with `executablePath:'/opt/pw-browsers/chromium'`; never `playwright install`.
- three.js ships no UMD build — the foundry shims `three.cjs` onto `window.THREE`.
- Rebuild `dist/` only when no judge agents are mid-run against it.

**Legal**
- No MM6 asset rips, ever. Reference for measurement and comparison only; style parity with original
  content.

**Code**
- `ARCHITECTURE.md` is law: palette discipline, seeded RNG, glue-calls-rules, canonical data shapes,
  one owner per file.
- `bakePix` must keep palette index 0 verbatim. Remapping 0→240 turned the UI frame's viewport hole
  into an opaque black plate and blacked out the whole game.
- Every portal needs `tx`/`ty` landing coordinates, placed *beside* the reciprocal stairs, never on
  them. Missing coords softlock the game; landing on the return portal bounces the player. There are
  tests asserting both — keep them.
- Sprite pixel writes must clamp the shade nibble: `(pi&240)|(s<0?0:s>15?15:s)`.
- In `page.evaluate`, `const` globals are not on `window` — guard with `typeof Game!=='undefined'`.
- Quest items must sort first when looting, or mundane loot consumes the last pack slot and the quest
  item is destroyed.
- Save loading must sniff the schema *before* mutating state, and roll back on failure — a hostile
  save previously caused a 91-error crash loop.
- Turn-based combat: an order must always grant a full round, or the budget drains and recoveries
  never tick (deadlock).

**Process**
- The user's bar is the panel's verdict, not the builder's. Report ceilings honestly and early; the
  most damaging moment of this project was shipping a link that did not meet the stated bar.

---

## 12. The prompt

Hand this to an agent with **no** knowledge of this document, this repo, or any prior build. Paste
the blockquoted text verbatim; everything outside the quote is for you, not for it.

### Before you paste it
- **Environment network access must be set to Full or a Custom allowlist** if you want image
  generation. The default policy blocks everything except package registries, a `403` on CONNECT is a
  policy denial rather than a transient error, and the setting applies to *new* sessions only — an
  already-running session cannot be unblocked. Decide before starting.
- **Have the API key ready to paste, and expect to paste it again in every later session.** It is
  stored in the session scratchpad, which does not outlive the session. Use a spend-capped key and
  revoke it when the run ends.
- **Budget is the binding constraint, not capability.** A run like this consumes an enormous amount
  of output. Check your remaining allowance first; the prompt is written to checkpoint and hand off
  cleanly when it runs out, but it cannot manufacture budget.
- **Expect to be asked nothing and told the truth.** The prompt forbids the agent from grading its
  own aesthetics, and requires it to report the ceiling it actually reached rather than the one it
  was asked for.

---

### The prompt itself

> **Mission.** Build a complete, original, single-player party RPG in the mould of *Might & Magic VI:
> The Mandate of Heaven* (1998), shipping as one self-contained `dist/index.html` that runs in a
> phone browser in landscape with no network, no build step at runtime, and no external assets.
>
> **The bar is measured, not felt.** Ship when fresh vision judges, shown your screenshots shuffled
> with real MM6 screenshots, label them correctly no more often than chance. Any statement about
> quality that is not the output of a judge who did not build the thing is worthless — including
> your own. You may grade tests. You may not grade beauty.
>
> ### Order of construction — do not reorder
>
> This ordering is the single most important instruction here. Every stage exists to make the next
> one measurable.
>
> 1. **Harness first, before any game code.** A debug object on `window` that can teleport, change
>    map, set the clock, press keys, tap coordinates, grant items and gold, save, load, and dump the
>    full game state as JSON. Every later stage is driven through it. Build it first even though
>    there is nothing yet to drive.
> 2. **The judge before the art.** Write the canonical shot list — a fixed table of camera positions,
>    map, facing angle and clock time, one row per screenshot, each with a note on what that shot
>    must prove. Capture it from a pinned build into a per-round directory that is never overwritten.
>    Also stand up the discriminator: real reference screenshots shuffled with yours, judged blind by
>    a fresh agent. Without these, "better" is a feeling and every fix is a guess.
> 3. **Pure rules modules next**, with their test suite, before anything can see them: stats,
>    classes, skills, hit chance, damage, XP curve, spells, items, monsters, economy, rest, traps.
>    These are pure functions over plain data. No rendering, no DOM, no globals.
> 4. **World, engine, UI, game loop** — the glue. Glue calls rules. Glue never re-implements a
>    formula that a rules module owns; if you find yourself writing a second version of a damage
>    calculation, you have already made the mistake this line exists to prevent.
> 5. **Art production** as a planned run (see below), not an open-ended polish pass.
> 6. **Panels and discriminator rounds** until the measured bar is met or the budget is gone.
>
> ### Architecture law
>
> - **One owner per file.** If you fan work out to parallel agents, fan out on *files*, never on
>   *features* — features cut across files and two agents editing one file is not a merge conflict,
>   it is silent semantic corruption. When a feature spans owners, one agent writes the rule and the
>   others call it.
> - Write the module map, the canonical data shapes, the world units and the save schema into an
>   architecture document **before** writing the modules, and treat it as law afterwards. Every
>   ambiguity you leave in it becomes two incompatible implementations.
> - Pick one canonical shape per concept and never carry a second (one clock representation, one
>   currency field, one quest container). Duplicated state is the bug factory.
>
> ### Determinism law
>
> - All randomness comes from named, seeded streams from a central registry. World layout uses
>   layout streams; live gameplay uses persistent streams that are serialized into the save.
> - The same seed and the same input sequence must produce a byte-identical state dump. Write a test
>   that runs a scripted session twice and diffs the dumps; any difference is a bug you have not
>   found yet.
> - Nothing generated at build time may be non-deterministic. Generated art is produced once,
>   reviewed, committed as baked data, and merely embedded by the build.
>
> ### Testing law
>
> - Three suites: pure-rules unit tests; a headless-browser suite driving the real UI; and a
>   **campaign test that plays the game from character creation to the final boss and wins**, using
>   only actions a player could take — real doors, real dialogue, real purchases.
> - **A silent `catch` in a test is a lie, and so is a tolerance window.** A test that cannot fail is
>   not a test. Never swallow an error to make a suite pass; if a step can throw, the throw is the
>   finding.
> - Assert the things that softlock a player, not just the things that are easy to assert: every map
>   transition has valid destination coordinates, no destination lands on a return trigger, every
>   quest giver is reachable, no entity spawns inside geometry, every quest item survives a full
>   inventory.
>
> ### Renderer requirements
>
> A flat grid of full-height walls reads as *Wolfenstein*, not as MM6, and no amount of texture
> quality repairs that. The outdoor world must be a **heightfield**: terrain height sampled per
> point, marched per screen column, with buildings extruded from the terrain rather than standing on
> a plane. Get hills, ravines, rivers with stepped pools, a bounding mountain ridge, and an ocean
> that runs out into haze rather than showing you the edge of the map.
>
> A heightfield is single-valued, so bridges break it: a bridge deck and the ground beneath it are
> two surfaces over one point. Solve this once with a sparse per-cell **overhead span** — an interval
> of solid matter floating above the terrain — and you get bridges, gate arches, aqueducts and cave
> mouths from one primitive. Walk on the terrain when below the span, on the span when above it.
>
> Also required: variable building heights and roofs, distance fog that dissolves geometry into the
> sky, a painted sky that changes across the day, a torch radius indoors, and a horizon that shears
> for look-up/down rather than rotating.
>
> ### Art production
>
> - **Count the assets before making any.** Produce a bill of materials — every creature frame,
>   facing, portrait, icon, texture, prop and ornament the design implies. Expect several hundred.
>   Plan it as a production run with batch review gates.
> - **Creatures are pre-rendered 3D, because that is what 1998 actually did.** Build low-poly models
>   from primitives, light them with one fixed hard-key rig, render multiple facings and frames, and
>   quantize the output to the game palette. The fixed rig is what makes two hundred sprites look
>   like one art department.
> - **The palette is the great unifier.** One 256-index palette, structured as ramps so shading is
>   arithmetic on an index. Everything — rendered, generated, procedural — is quantized through it
>   before entering the build. Nothing enters as RGB.
> - **Approve one style anchor per class first** (one wall, one portrait, one icon), then generate
>   siblings against it. Never generate a class from independent prompts. Review each class as a
>   contact sheet: drift is invisible one asset at a time and obvious in a grid of twenty.
> - **Acceptance criteria — reject on any failure, regeneration is cheap and drift is not:**
>   palette-legal with transparency on exactly one index; readable at true on-screen size, not
>   zoomed; passes the silhouette test (fill it solid black — it must still be identifiable); lit
>   from the same direction as everything else; 1px dark outline on sprites; textures seamless across
>   a 3×3 tiling.
> - **If you use an image-generation API**, the key comes from the user and never touches the repo,
>   the logs, or an environment variable — a scratchpad file with tight permissions only, re-supplied
>   each session. Ask for a spend-capped key, give a cost estimate *before* spending, and tell them to
>   revoke it when you finish. Generate large and downsample; never ask for tiny images. Pass an
>   approved anchor image on every sibling request rather than re-describing the style in words —
>   that is what stops a class from drifting. Quantize every result through the palette, commit the
>   quantized data, and keep generation out of the build: it is not deterministic and the build must
>   be. Never send reference material you do not own to a third-party API.
> - **Set a hard size ceiling for the single file and test it.** Raw index arrays are enormous —
>   encode sprites (run-length or indexed PNG embedded as base64) before any bulk render run, not
>   after. Discovering the payload problem on a phone at the end costs the whole art pass.
>
> ### Review machinery
>
> - After each build round, spawn **fresh agents with zero project context** to judge it: a veteran
>   of the genre, a first-time player, a QA hunter, and an art critic. Give them the build and the
>   shot list; give them nothing about your intentions. An agent that knows what you meant to build
>   grades your effort instead of your result, which is worse than useless.
> - **Every finding gets a written disposition** — fixed, rejected with a reason, or deferred with a
>   reason. Undisposed findings evaporate and return three rounds later.
> - **Verify every fix on screen**, not in the diff. A fix that exists only in code review is a claim.
> - **Reproduce before you repair.** Agents report bugs that are not there. Write a probe that
>   measures the claim — count every item in the world before and after four hundred operations
>   before you believe an item-duplication report.
> - Run at least two panel rounds. Round two finds what round one's fixes broke, and it will.
>
> ### Definition of done — three verdicts, never one
>
> 1. **Systems**: all suites green, the campaign test wins the game, the determinism diff is clean,
>    and the veteran reports no defect that would have made them stop playing.
> 2. **Presentation**: discriminator accuracy approaches chance, and the tells judges still name are
>    aesthetic preferences rather than structural ones. "The trees repeat" is a fix; "this is a
>    raycaster" is a failure.
> 3. **Volume**: enough regions and dungeons that a player can get lost. No screenshot measures this,
>    which is exactly why it will be the axis you quietly skip. Commit to a number at the start.
>
> A single verdict lets the strong axis hide the weak one. Report all three separately, always.
>
> ### Budget and honesty
>
> - Decide your round count up front. Commit and push at every round boundary — a round that ends
>   without a commit may not have happened.
> - Maintain a handoff document from the first hour, current enough that a fresh session with no
>   memory of yours loses nothing but conversation. Include the repo map, the commands, the
>   scars you have already paid for, and the ordered backlog.
> - **When you reach a ceiling, say so plainly and early, with the measurement that shows it.** Do
>   not present a build as meeting a bar it does not meet. An honest "the systems are done, the art
>   is at roughly two-thirds, here is the judge's score and the three tells they named" is worth
>   more than a confident claim that collapses the moment someone looks at the screen.

---

## 13. Notes on the prompt

### 13.1 Why the prompt is shaped this way

**It leads with a measurement, not an adjective.** Every escalation of "make it perfect", "everything
must be wow", "10/10 on every agent" produced no change in output, because none of them told the
builder how to find out whether it had complied. "Ship when blind judges do no better than chance" is
an instruction that can be followed. This is the single highest-value edit over v1.

**It puts the harness and the judge before the game.** Both feel premature and both are the cheapest
they will ever be at that moment. The harness makes every later stage scriptable rather than
hand-driven; the shot list makes every later round comparable to the last. Building the judge after
the art means the art was made blind.

**It states the ordering as non-negotiable** because in practice the ordering *is* the method. The
temptation is always to build the exciting part first and instrument later, and the cost is that you
cannot tell whether you improved anything.

**It forbids self-grading explicitly**, because a builder cannot see its own work freshly — not from
vanity, but because it knows what everything was supposed to be and reads intent into what is
actually on screen. Zero-context judges are the only correction, and the harshest of them is worth
the most.

**It bans silent catches by name.** The worst defect in the v1 build — a portal with no destination
coordinates that softlocked the game — stayed invisible for hours because a test caught and discarded
the exact error that would have revealed it. That single line of defensive code hid a
game-breaker through an entire critique cycle.

**It counts the art before making it.** "Polish the visuals" is unboundable and therefore never
finishes. "Three hundred and forty sprite frames, twenty-four textures, thirty portraits, in batches
with a review gate per batch" is a plan with an end.

**It demands three verdicts** because presentation, systems and content volume fail independently,
and a single number always reports the best of them.

**It ends on honesty** because the most damaging moment of the v1 run was not a bug. It was handing
over a link described as finished, to someone who then looked at it. Every hour after that was spent
re-establishing trust rather than building.

### 13.2 What to realistically expect

One shot will not produce a perfect MM6, and a prompt that promised otherwise would be the problem it
claims to solve. What this prompt reliably buys, on the evidence of the v1 run plus everything above:
a complete and genuinely beatable game with sound systems, a real test suite, and an honest,
*measured* account of exactly how far short of the bar the presentation falls and why.

The parts that stay hard are not the parts prompting fixes: asset volume at consistent quality,
content volume, and the last tenth of the renderer where each remaining tell costs more than the one
before it. Plan for a second session, and make the handoff document good enough that it starts at
full speed.

### 13.3 How to intervene mid-run

- If it reports a score, ask **who judged it and whether they had context.** A high score from a
  briefed judge means nothing.
- If it says "polished" or "AAA" or "wow", ask for the shot ids and the tells. Adjectives are a
  symptom that the measurement loop has been skipped.
- If it has been building for a long time without a commit, tell it to checkpoint. Uncommitted work
  is work that may not survive.
- Do not raise the bar by repeating it louder. Change the *method* instead: ask for another judge,
  another shot, another probe.

---

*Assembled from `HANDOFF.md`, `SINGLE_SHOT_V2.md`, `critique/SHOTLIST.md` and
`.claude/agents/mm6-veteran.md` in the `single-shot-try-mm6` repo. Those files remain the live
working copies; this is the portable single-file edition. If you edit one, re-assemble the other.*
