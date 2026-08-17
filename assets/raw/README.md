# Thornmarch — generated art archive

Everything in this archive was produced by paid API calls. 932 credits across 120 calls:

| what | credits | where |
|---|---|---|
| Meshy 3D mesh refine | 480 | `meshes/`, `meshes-tpose/` |
| Meshy 3D mesh preview | 245 | (the preview stage of the same meshes) |
| OpenAI `gpt-image-2` textures | 207 | `textures-source/` |

`spend-ledger.json` is the full per-call record — operation, credits, and the prompt fragment
that produced it. `generation-log.txt` is the batch runner's output.

Nothing here is derived from any existing game. Every asset was generated from a text prompt.

---

## `meshes/` — 20 GLB models, ~71 MB

The expensive part of the archive and the part that is hardest to reproduce. One textured GLB per
creature, generated from a text prompt via Meshy's text-to-3D pipeline (preview pass, then a refine
pass that adds the PBR texture).

```
ash_crown  bandit  bandit_capt  elemental  ghoul  goblin  goblin_arch  harpy
knight_ash  kobold  kobold_sham  lich  npc_captain  npc_foreman  npc_priest
npc_smith  ogre  rat  skeleton  troll  wolf  zombie
```

`probe_goblin.glb` is the calibration model — the first mesh generated, used to work out the
prompt shape and the camera rig before spending on the rest.

These open in Blender, Godot and Unity as-is. They are static meshes with a diffuse texture; there
is no rig and no animation.

## `meshes-tpose/` — the same 20 creatures in a T-pose, ~60 MB

A second generation pass constrained to an arms-out neutral pose. These are the ones to use if you
want to **rig and animate** them — an A-pose or T-pose is what a rigging tool expects, and the
`meshes/` versions are in dynamic action poses that fight any skeleton you try to fit.

## `spritesheets/` — 8-direction turnaround sheets, PNG

Each creature rendered from eight compass directions on a transparent background, laid out as one
strip. This is the intermediate product between the GLB and the game sprites: an offline renderer
put each mesh on a turntable under a fixed three-point light and captured the frames.

Useful directly as billboard sprites in any 2D or 2.5D engine.

## `silhouettes/` — the same turnarounds as pure alpha masks

Black-on-transparent shape only. These were generated as a review aid — a creature that is not
identifiable from its silhouette alone will not be identifiable at 40 pixels either — but they also
work as shadow maps or as a starting point for outline shaders.

## `sprites-png/` — the game-ready sprites, extracted

110 PNGs: 5 facings for each of 22 creatures, trimmed to their ink and quantised to the game's
16x16 palette. `index.json` gives, for every frame, its facing angle, its trimmed size, and the
`ox`/`oy` offset needed to place it back on the original canvas — plus `pxPerUnit`, which is how
many pixels tall one world unit is, so the sprite can be scaled correctly in another engine.

These were embedded in the build as base64; this directory is them unpacked into ordinary files.

## `textures-source/` — 22 generated textures at full resolution

The raw `gpt-image-2` output, before any processing:

```
ash  brickwall  cliff  dirt  grass  gravel  ice  marble  marsh  moss  obsidian
plaster  plaza  road  rock  sand  snow  stonewall  tile  timberwall  water  wood
```

Each was prompted as a seamless tiling material. `wall_anchor.png` is the style reference the
others were generated against, so the whole set shares a lighting direction and a level of wear.

The `*_raw_3x3.png` files are tiling proofs — the same texture laid out nine times, which is how
you actually see whether a seam repeats.

## `textures-game/` — 11 palettised, tile-verified textures

The subset that survived the tiling check, quantised to the game palette and edge-matched. Lower
fidelity than `textures-source/` by design; use the source versions in any engine that is not
palette-limited.

---

## Reusing these

The GLBs and the source textures carry no dependency on this project — they are ordinary assets.
The sprite PNGs and the palettised textures are quantised to a specific 256-entry palette
(16 ramps x 16 shades); if you want them at full colour, re-render from `meshes/` and re-process
from `textures-source/` rather than trying to un-quantise these.

If the next attempt is in Godot or Unity, `meshes-tpose/` is the directory that matters — real 3D
creatures you already paid for, ready to rig.
