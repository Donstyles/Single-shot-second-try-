# r14 — the discriminator gate, first run

The gate that has been blocked since r0 finally ran. The user supplied 17 real Might & Magic VI
screenshots. They are gitignored, measurement-only, never sent to any API, never committed, and
nothing from them enters the build. No asset rips, ever.

## Method

`tools/refprep.js` crops the game window out of each reference (15 of the 17 were a 1920×1440
window letterboxed in a 3440×1440 ultrawide desktop, all at the same offset) and normalises every
one to our presented height of 390px **with its own aspect preserved**. Squashing a 4:3 reference
into our 5:3 frame would distort every texture in it and corrupt the measurement this exists to
make.

One reference was excluded from the deck and the reason is recorded in `critique/reference/EXCLUDE`:
it is a screenshot *of a web image viewer* displaying MM6, complete with nav arrows and a
"[Quelle: eigener Screenshot]" caption. A card identifiable for a reason other than its art measures
nothing. It stays on disk as reference; it is not a deck card.

Deck: **22 ours + 16 real = 38**, shuffled from a fixed seed, filenames replaced with opaque ids,
staged outside the repo so no judge could reach the answer key. Three judges, zero project context,
each given a *different* analytical lens: forensic rendering, production process, and typography.

## Result

| | Judge A (rendering) | Judge B (process) | Judge C (typography) |
|---|---|---|---|
| Accuracy | **38/38** | **38/38** | **38/38** |
| Our shots spotted | 22/22 | 22/22 | 22/22 |

**Unanimous on every single card.** Not one disagreement across 114 judgements.

`VERDICT: FAIL — the judge can tell instantly.`

This is the honest number and it is the most useful one this project has produced. Eleven rounds of
cold panels had it trending "up"; a panel scoring 4/10 and a panel scoring 5/10 cannot tell you how
far away you are. This can. **50% is the ship condition. We are at 100%.**

## The three tells

Each judge was pushed down a different path and each came back with a different primary tell. All
three are real, all three are measurable, and none of them had been named in eleven rounds of
critique.

### A — no texture filtering and no mip chain

> "every 'ours' image holds constant texel size from the party's feet to the vanishing point with
> hard nearest-neighbour edges and no filtering, while every 'real' image shows bilinear blur and a
> mip transition on floors, walls and terrain at distance."

**ACCEPTED, the largest single rendering item outstanding.** This is true and it is structural: the
renderer point-samples one mip level at every distance. It is also the reason the r12/r13 finding
about "per-pixel noise at distance" kept coming back — the ground was fixed by halving the repeat
rate, which treated the symptom.

### B — one process at one fidelity

> "in the genuine screenshots, detail density is unequal in ways that map to how the asset was made
> ... In the imitation, everything within a single screen was made by one process at one fidelity,
> so its errors are geometric rather than budgetary: identical cloned primitives, stamped window
> rectangles at regular intervals, textures with noise grain that does not attenuate with distance,
> and a night scene that is the day scene with a global darken applied rather than separately
> authored art. The 1998 game's flaws come from running out of CD space; the modern one's come from
> never having had to choose."

**ACCEPTED.** The sharpest sentence any judge has written about this project. Note that B and the
r13 art critic reached opposite conclusions from the same evidence: r13 wanted *more* coherence
(one shadow terminus), B wants *less* uniformity. Both are right — coherence of palette, variance
of authorship. Those are different axes and I had been treating them as one.

### C — the font

> "every glyph in the imitation occupies an identical fixed-width cell ... no kerning pairs, no
> optical baseline shifts, and no serif stroke modulation anywhere."

**FIXED — see `1fd325d`.** Measured before believing it, and it was worse than stated: the old 5×7
table described itself as PROPORTIONAL in a source comment while 57 of its 62 glyphs advanced by
exactly 6 pixels. `src/05a_font.js` is now a real face — hand-drawn stroke skeletons with an
explicit pen, supersampled and downsampled to genuine partial coverage, blended into the palette
through `Core.mixLut`, with optical sizes built per cap height rather than pixel-doubled.

| | before | after |
|---|---|---|
| distinct advance widths | 57 of 62 glyphs identical | 8 distinct widths |
| kerning pairs | 0 | 46 |
| ink levels per glyph | 1 | 3 |

## Secondary findings, all three judges agreeing

| Finding | Judge | Disposition |
|---|---|---|
| **Sprites are authored at a fidelity the environment never reaches** — "the goblin is genuinely well-shaded ... the door beside it is a flat tan rectangle with a single ring for a handle" | B | **ACCEPTED.** The Meshy-baked creatures are the best art in the build and they make everything they stand next to look worse. Environment must come up; the sprites must not come down. |
| **Sprite lighting has no relationship to its surroundings** — "the sprite's lighting has no relationship to the corridor's" | B | **ACCEPTED.** Sprites are lit by a fixed rig at bake time and never re-lit by the scene. |
| **Cloned primitives** — "three grey cones, two pixel-identical rats", "stamped window rectangles at regular intervals" | A, B | **ACCEPTED.** Decor picks from a small set and places it unmodified. Needs per-instance variation. |
| **Hard vertical seams where render layers meet** — "the viewport is cut into hard vertical bands where the sky/rock/tree layers change along a perfectly straight seam" | A | **ACCEPTED, and new.** Not previously reported by any panel. |
| **Terrain has no horizon fog band** on some shots | A | **ACCEPTED.** Contradicts the fog work landing in r13; needs re-measuring per shot rather than assuming. |
| **Chrome is 1px rectangles and flat fills** — "the real game's frames, gold lozenges, book spines and compass arch are each painted once with a consistent upper-left light" | C | **ACCEPTED.** The font fix addresses the type; the ornament is untouched. |
| **Disabled buttons are a programmatic dim of the same bitmap rather than a drawn inset state** | C | **PARTLY FIXED** in `1fd325d` (checker on the plate, label redrawn dimmed). The deeper point — that a real inset state is *drawn*, not computed — stands. |
| **Flat untextured tree trunks**, **flat-blob paperdolls** | A | **ACCEPTED.** Paperdoll was already queued from r12/r13. |

## Two cards that measure nothing, and stay anyway

Judge C read our title screen and named the game; every judge identified img_021 as MM6's title
plate. Those two cards are decided by *reading a word*, not by looking at art. They are worth 2 of
38 and removing them would flatter the score, so they stay. Recorded here so the number is not
mistaken for a purely visual one.

## What this changes about the loop

The four cold panels stay — they find softlocks, bad verbs and unreadable labels, which a
real/fake judge does not care about. But **the discriminator is now the ship gate and the panels
are advisory.** A panel's 4/10 and 5/10 were never comparable between rounds. 38/38 is.

Next round runs after the mip/filtering work, which is Judge A's finding and the largest remaining
rendering gap.
