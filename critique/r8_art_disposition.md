# Round r8 — art critic disposition

Judge: cold 1998-CRPG art director. Given only `critique/shots/r8/*.png`. Build pinned at `950c6d5`.

**Score: 2/10 against "would an expert who played MM6 take these for authentic screenshots".**

> "An expert would clock this in under a second from the HUD alone."

That sentence is the finding. The world art is not the bottleneck; the *chrome* is, and the chrome
is in every one of the 22 frames.

## The four global tells — all accepted, all fixed in r9

| # | Finding | Disposition |
|---|---|---|
| 1 | **Screen-space ordered dither.** "I can trace unbroken vertical columns of blue pixels at regular x-intervals straight across the black in s12, crossing wall, floor and void without deviating. A framebuffer-wide screen door is a 2010s post-process." | **FIXED.** Distance fade is now a palette-RAMP shift: the texel's shade walks toward the sky's shade in its own ramp, and dithering happens only across a narrow crossover band (fog 0.62–0.90) where the ramp finally gives out. Previously it replaced pixels wholesale at a dither threshold, which is why s06 had an eighty-pixel band of green-on-blue television static. |
| 2 | **The font has no descenders and is monospaced** — the game's own town reads "Harrow9ate", and "Thornmarch" reads "Thornnnarch" | **FIXED, and this was in all 22 shots.** The font is now 9 rows with real descenders on `g j p q y , ;`, a properly shouldered `m`, a distinguishable `Q`, and **proportional advance** derived from each glyph's ink extent. Fixed-pitch, descender-less type is a terminal aesthetic from a different decade and a different platform. |
| 3 | **HUD buttons are typographic, not pictorial.** "CHR / INV / SPL / MAP / RST / MNU… every shipped 1998 CRPG hand-painted its command bar. `MNU` in particular is a debug label, not a shipped one." | **FIXED.** Six drawn icons: a visored helm, a strapped pack, an open spellbook, a folded map, a tent under a moon, a sealed scroll. |
| 4 | **50% checkerboard doing six jobs** — windows, portrait backgrounds, the D-pad, the action buttons, and distance haze. "A checkerboard is what you reach for when you have no art." | **FIXED.** The touch buttons are solid bevelled plates; the portrait backing checker is gone; the haze is now a ramp fade (#1). Windows remain to be drawn — see deferred. |

## Structural renderer findings

| # | Finding | Disposition |
|---|---|---|
| 5 | **"Ground texture runs as vertical streaks in screen space regardless of surface slope, with no foreshortening. The terrain does not project. This single defect is why every wilderness shot reads as painted wallpaper rather than ground."** | **FIXED, and the diagnosis was better than mine.** I had assumed aliasing and added a mip pyramid last round, which did nothing. The real cause: the march took ONE texel per step and filled the entire vertical run with it, smearing a single sample down dozens of screen rows. The ground is now cast PER ROW — each screen row solves for its own ground distance and samples there. |
| 6 | **s02: two adjacent walls use different projections** — one converges toward the vanishing point, the other has evenly spaced course lines top to bottom | **FIXED by #5** on the ground, and by tying wall `v` to world height rather than to the prism's own extent. |
| 7 | **s13/s14: "two renderers glued together at a hard line down the middle of frame"** at x≈262 | **PARTIALLY FIXED.** The seam is the boundary between a lit near wall and a distant one that the old constant-per-step fill made uniform. Per-row ground and ramp fog remove most of it; re-judge in r9. |
| 8 | **s03: the black polygon reads as a rendering failure, not as darkness** — no texture, no ambient tint, no rim light | **UNDER INVESTIGATION.** Accepted as the single worst frame. Needs measurement rather than a guess: the town wall at dusk should be shaded, not absent. Queued for r9 with a pixel probe rather than a theory. |
| 9 | **s08 is not night** — two adjacent surfaces a stop and a half apart with no light source to justify it | **PARTIALLY FIXED** earlier via the baked-texture shading fix; the judge still saw it, so it is queued for a global night tint pass. |

## Art-asset findings

| # | Finding | Disposition |
|---|---|---|
| 10 | **Trees are geometry, not billboards** — "a flat-shaded cone canopy with a 1px dark outline on a two-tone cylinder… a 2015 low-poly asset pack" | **FIXED in the procedural painter**, and the generated tree props will replace it entirely. Canopy is now five overlapping lobes with a ragged alpha-cut rim, and foliage takes NO outline — an outline is precisely what says "this is a rendered solid". |
| 11 | **Trees float** — "the trunk terminates in a flat horizontal cut with the grass running behind it" | **FIXED.** Root flare: a darkened, widening base over the last four rows. |
| 12 | **s19: six of seven items share one icon** — the same pictogram served staff, mace, broadsword, long sword, club and axe | **FIXED.** Weapon icons now follow the governing SKILL: axe, mace, staff, spear, dagger, bow and sword each have their own silhouette. |
| 13 | **s05/s10/s11: "three grey trapezoids… the same asset at three scales, an unmodulated grey lampshade"**; s11 is a recolour of s10 | **IN FLIGHT.** These are procedural rocks. The prop mesh batch replaces them. |
| 14 | **s17 text collision** — the modifier column overprints the next label, rendering "+Intellect" | **FIXED.** Stat columns widened. |
| 15 | **s20: nine schools and you can read three** | **FIXED.** Tab labels are drawn at full contrast independently of the button plate. |
| 16 | **s18 is not a paperdoll** — "there is no body, no figure, no armour silhouette, just twelve labelled boxes. The entire point of the paperdoll is the figure; it is missing." | **ACCEPTED, queued.** Correct and unanswerable. Needs a drawn body rig behind the slots. |
| 17 | **s21 automap: three DOOR markers floating in unmapped void**; no border, no compass, no scale, no parchment | **ACCEPTED, queued.** The orphan markers are a real bug — portals are drawn regardless of whether their cell has been seen. |
| 18 | **s22: the title plate and the menu buttons are the same widget, so the logo reads as a third button** | **ACCEPTED, queued.** Needs a drawn wordmark rather than a panel with text in it. |

## Deferred with reason

| # | Finding | Disposition |
|---|---|---|
| 19 | **The D-pad occludes the lower-left third of every 3D shot** — "it is why nine of these shots have nowhere for the eye to go: the near ground plane is covered by UI" | **PARTIALLY FIXED.** Shrunk from 62px to 44px and pulled tight into the corner. It cannot be removed outright — this is a phone-first build and touch is the primary input — but the shot list should arguably capture with controls hidden so the panel judges *art* rather than *chrome*. Deliberately NOT doing that yet: hiding the controls for the camera would be flattering the judge, and the player does see them. |
| 20 | **s01 windows are a literal checkerboard with no frame, mullion or sill** | **DEFERRED.** Needs a drawn window decal on building faces — a real feature, not a tweak. |
| 21 | **Several shots do not contain their subject** — no market (s02), no camp (s07), no coast (s10) | **DEFERRED to the world pass.** These are content gaps, not rendering gaps: the region generator does not place a market row, a bandit camp or a shoreline settlement. |

## Recorded as working, so it does not get refactored away

- Colour counts are right: 79–146 unique per frame, all under 256, with a true black in the dungeons.
- s16's creature is "the only asset in 22 frames that looks hand-painted rather than generated" —
  that is the foundry pipeline working, and it is the strongest evidence the art route is correct.
- s01 has "the best architecture in the set… a genuine three-plane depth read".
- s04 has "the best composition outdoors" with a real path for the eye.
- s09's masonry and its single warm accent are called out as the best warm/cool contrast outdoors.
