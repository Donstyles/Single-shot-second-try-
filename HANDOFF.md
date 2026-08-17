# HANDOFF — Thornmarch: The Ashen Crown

Current enough that a fresh session with no memory of this one loses nothing but conversation.
`ARCHITECTURE.md` is the law; this file is the state.

## Commands

```bash
node build.js                    # src/*.js -> dist/index.html (enforces the 2 MB ceiling)
node test/systems.test.js        # pure rules, encoding, baked-art integrity
node test/e2e.test.js            # headless Chromium against the built artifact
node test/campaign.test.js       # player-legal playthrough, including the finale
node test/determinism.test.js    # save/load byte-identity, reproducible build
node tools/secretguard.js        # credential scan (also a pre-commit hook)

node tools/capture.js <round>    # 22 fixed shots -> critique/shots/<round>/ (refuses overwrite)
node tools/spend.js report       # credits spent against the hard ceiling
node tools/batch.js one <id>...  # regenerate named creature meshes
node tools/foundry.js <id>       # mesh -> palette sprite frames
```

Playwright: always `executablePath:'/opt/pw-browsers/chromium'`. **Never** run `playwright install`.

## Where it stands

| Axis | State |
|---|---|
| Systems | Playable and **provably winnable**. 458 checks green: 318 systems, 84 e2e, 43 campaign, 13 determinism. |
| Volume | 9 regions (128×128 each), 13 dungeons, 10 quests including a 5-step main chain, 99 spells across 9 schools. |
| Presentation | Judged by four independent cold panels per round. Art critic 4/10, veteran NO-SHIP 5/10 as of r11. Both trending up; neither is close to done. |
| Payload | `dist/index.html` ~820 KB, 40% of the 2 MB ceiling. |
| Credits | 932 of 1000 spent. 68 held in reserve. |

## The loop that runs this project

Every round: build → four suites → `capture.js rN` → launch four cold judges against the pinned
shots and build → write `critique/rN_disposition.md` giving **every** finding an explicit verdict
(FIXED / ACCEPTED, QUEUED / DEFERRED WITH REASON / REFUTED WITH MEASUREMENT) → fix → repeat.

The judges get no project context, no `src/`, no design documents. That is the whole value.

**Never rebuild `dist/` while a judge is mid-run.** I broke this rule once and invalidated a
four-hour veteran session; it caught the swap itself and stopped. If a rebuild is unavoidable, tell
the judge up front to record the file size at start and end.

**Findings that arrive with measurements outrank findings that arrive with adjectives** — and that
cuts both ways. A veteran reported night as "a sky recolour, geometry pixel-identical"; measuring
the frames showed night is already 48% of noon's luminance. The real defect underneath was the
absence of emissive light, and that got fixed. Measure before changing anything in Core.

## Scars — these are all real, and all cost time

- **The foundry defaulted to `probe_goblin.glb` for every creature id**, so thirteen regenerated
  sprites came back as the same goblin. Caught only by looking at a contact sheet. There is now a
  systems check that fingerprints every baked sprite and fails if two share a mesh.
- **A full pack destroyed quest items** and consumed the chest, including the endgame key.
  Acquisition is atomic now.
- **The guild rendered the trainer's screen**, so no magic school and no spell was purchasable
  anywhere — 3 castable spells out of 99 at level 100.
- **The shop charged 6–9× the displayed price** because the buy path used `value()` (whole stack)
  while the UI used `unitValue()`. The v1 economy bug, resurfacing in the one place that takes money.
- **`checkDefeat` sat below `update()`'s open-screen early return**, so the defeat modal could
  neither re-arm nor stand down.
- **USE was hidden whenever an enemy was near**, locking the player out of every building in a town
  where monsters roam. A verb that vanishes when you need it most is worse than no verb.
- **The ground sampled two texture repeats per cell**, aliasing into per-pixel noise at every
  distance — measured run length 1.20 near, 1.10 at the horizon.
- **A `rindex` on `return { w, h, data: d };` deleted `paintIcon` and `portrait`** during a scripted
  edit. Restore from git and redo; do not pattern-match on a line that appears many times.

## Credentials

Both keys live **only** in the session scratchpad at `chmod 600`, outside the repo. **The scratchpad
does not outlive the session** — a new session must ask the user to paste them again.

- `scratchpad/meshy.key` — working. Covers both 3D and image generation.
- `scratchpad/openai.key` — valid but `billing_hard_limit_reached`. Unusable; not a transient error.

`tools/secretguard.js` scans the tree and the staged diff for 8 credential patterns and runs as a
pre-commit hook. **Never put a key in a shell command** — the Claude Code permission cache records
command strings verbatim into `.claude/settings.local.json`.

## The art pipeline

```
Meshy text-to-3D  ->  GLB  ->  fixed neutral light rig (headless three.js)
                  ->  5 facings (0-180, mirror the rest)  ->  area downsample
                  ->  palette quantise  ->  1px outline  ->  trim  ->  indexed PNG
```

Coherence comes from the **fixed rig and the shared palette**, not from the generator. 15 credits
per creature, 14.4 KB per creature baked. The stance clause is a wary idle combat pose — never a
T-pose, which is what an asset looks like before it is finished and which shipped for eight rounds.

## What is blocked, and on whom

- **The discriminator ship gate** needs real MM6 screenshots in `critique/reference/` (gitignored,
  measurement-only, never sent to any API, never committed). Only the user can supply them. No asset
  rips, ever — reference is for measurement and comparison, not for shipping.
