# HANDOFF — Thornmarch: The Ashen Crown

Current enough that a fresh session with no memory of this one loses nothing but conversation.
`ARCHITECTURE.md` is the law; this file is the state.

## Commands

```bash
node build.js                                  # src/*.js -> dist/index.html (enforces 2 MB ceiling)
node test/systems.test.js                      # pure rules + encoding
node test/e2e.test.js                          # headless Chromium against the built artifact
node tools/secretguard.js                      # credential scan (also a pre-commit hook)

node tools/meshy.js balance                    # credits remaining
node tools/meshy.js probe                      # one creature mesh, end to end
node tools/meshy.js image <model> <name> [prompt]
node tools/foundry.js <id> [glb]               # mesh -> palette sprite frames
node tools/texbake.js <src.png> <id> [raw|blend|mirror]
```

Playwright: always `executablePath:'/opt/pw-browsers/chromium'`. **Never** run `playwright install`.

## Where it stands

| Axis | State |
|---|---|
| Systems | Foundations solid, **not playable**. 199 systems + 26 e2e checks green. No world, no combat loop, no campaign test. |
| Presentation | Pipelines proven on two anchors. **No world shot has ever been captured.** Nothing judged by anyone but the builder, which is worth nothing by design. |
| Volume | Committed to 1 region (128×128) + 3 dungeons. Far short of MM6's ~30 regions. Still the axis most likely to be quietly skipped. |

Built: `00_core`, `01_rules`, `02_spells`, `03_items`, `05_engine` (framebuffer only), `10_debug`
(boot + harness). Missing: `04_world`, the heightfield march, `06_art`, `06b_sprites`, `07_audio`,
`08_ui`, `09_game`.

## Credentials

Both keys live **only** in the session scratchpad at `chmod 600`, outside the repo. **The
scratchpad does not outlive the session** — a new session must ask the user to paste them again.

- `scratchpad/openai.key` — valid, but the account returns `billing_hard_limit_reached`. Unusable
  until the user adds credits or raises the cap. Do not retry; it is a policy state.
- `scratchpad/meshy.key` — **working**. This is the live art path.

`tools/secretguard.js` scans the tree and the staged diff for 8 credential patterns and runs as a
pre-commit hook. Never put a key in a shell command: the Claude Code permission cache records
command strings verbatim into `.claude/settings.local.json` (gitignored, but still).

## The art pipeline (proven, measured)

Meshy covers **both** halves, which was not obvious — it proxies image generation as well as 3D.

**Creatures / props / paperdoll** — `tools/meshy.js probe` → `tools/foundry.js`

```
GLB mesh -> fixed light rig -> 5 facings (0-180, mirror the rest) -> area downsample
         -> palette quantise -> 1px dark outline -> trim -> indexed PNG
```

- 15 credits per creature (5 preview + 10 texture). ~9 s to render 5 facings.
- **14.4 KB per creature.** 21 actors project to 0.40 MB against the 2 MB ceiling.
  (v1 stored ONE goblin as 273 KB of JSON arrays.)
- Emits a contact sheet and a silhouette sheet per creature. Judge the sheet, never one frame.

**Textures / portraits / sky / UI ornament** — `tools/meshy.js image` → `tools/texbake.js`

```
1024px generation -> area downsample -> palette quantise -> seam measure -> 3x3 proof
```

- `gpt-image-2` and `nano-banana-pro` 9 credits; `nano-banana-2` 6; `nano-banana` 3.
- The wall anchor measured seam 2.18× vertical / 1.78× horizontal against internal roughness, and
  reads continuous at 3×3. `blend` and `mirror` repair modes exist if a later texture needs them.

Credits: 3266 at last check. ~35 meshes and ~450 generations needed. **Not a constraint.**

## Decisions that cost something to learn

- **The rig is NEUTRAL, and the prompt preamble matches it.** Warmth is applied by the engine at
  draw time through ramp arithmetic. Baking a warm key into an asset bakes in a time of day, so it
  is wrong at every hour but one. Measured: warm key gave 14.6% green / 49.5% warm ramps on the
  goblin; neutral+cool gave 22.3% / 14.3%.
- **Exposure is a hue control.** The first rig ran the key at 3.1 and clipped all three channels,
  collapsing green skin to warm neutral. Total incident light must stay near 1.0.
- **The palette was innocent.** It reproduces the wall anchor to within ~4 RGB units per channel
  (source mean 83,80,66 → baked 85,76,65) and hits mid-greens correctly. Two rounds of "the
  palette is broken" were wrong; the cause was the rig both times. Measure before changing `Core`.
- **`const` in a `vm` script is not a property of the context object.** The first systems run
  destructured undefineds and every assertion passed vacuously. `test/_load.js` now fails hard if a
  module does not define its expected global.
- **Fix the cause, not the error check.** The foundry's strict "console errors are fatal" rule
  fired on `/favicon.ico`; the server now answers it rather than the check being loosened.

## Ordered backlog

1. **R2 — `04_world.js` + the heightfield march in `05_engine.js`.** Terrain, the overhead-span
   primitive (bridges / gate arches / aqueducts / cave mouths from one primitive), fog, sprite feet
   snapped to `H(x,y)`. Then `06_art`, `06b_sprites`, `08_ui`, `09_game`. Terrain lands **before**
   wiring the sprite manifest into the engine or sprite placement gets written twice.
2. **R3 — three suites green** (add `campaign` and `determinism`), capture the full shot list into
   `critique/shots/r0/` with the SHA, then spawn cold zero-context judges. Never brief them.
3. **R4 — art production run.** Style anchor approved per class first, contact-sheet review per
   class, then bulk. Wall anchor exists; portrait, icon and sky anchors do not.
4. **Discriminator harness** — the ship gate. Build before making more art.
5. **Content volume** — pick a region count and hold to it.

## Standing rules

- Commit and push at every round boundary. A round that ends without a commit may not have happened.
- Never rebuild `dist/` while a judge agent is mid-run against it.
- The builder may grade tests. The builder may not grade beauty.
- Report the three verdicts separately, always. A single number lets the strong axis hide the weak.
