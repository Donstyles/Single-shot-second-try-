# Round r3 — art critic disposition

Judge: cold art director, 1998 CRPG background. Given only `critique/shots/r3/*.png`, forbidden
from reading source, plan or notes. Build pinned at `4a2be43`.

**Headline verdict: "it reads as a 1994 raycaster wearing a 1998 costume."** The chrome is
period-correct; the world is not.

Every finding gets a disposition. Undisposed findings evaporate and return three rounds later.

## Structural — accepted, fixed in r4

| # | Finding | Disposition |
|---|---|---|
| 1 | **s03/s05/s06/s10 do not contain their stated subject** — no gate arch, no barrow mouth, no bridge, no ravine, no coast | **FIXED.** Root cause found: overhead spans were being drawn but their band was clipped against `ybuf`, which the ground pass had already pulled above the span. A span occupies rows the ground pass has *already claimed*, so clipping against a single marker erases exactly the thing the primitive exists for. This is the failure ARCHITECTURE.md §6.2 predicted in writing and the code still got wrong. Spans now composite against their own band list, unclipped by the ground marker. |
| 2 | **s12 shows open sky down a barrow corridor; s13/s14 have no floor/ceiling separation** | **FIXED.** Dungeons had no ceiling at all — the march escaped the geometry and drew sky. Added a downward fill marker so a dungeon column is bounded top and bottom. |
| 3 | **s15 viewport mean luminance 218/255, blown white, swallows the UI at 1.2:1** | **FIXED.** Two causes. Baked textures carry arbitrary palette indices, and the shading maths was re-deriving a shade delta from the texel instead of simply shading within the texel's own ramp. Second, dungeon ambient was far too high. Dungeon light is now a torch pool falling to near-black. |
| 4 | **s08 night wall is BRIGHTER than the s01 noon wall (117 vs 114)** | **FIXED.** Same root cause as #3: the baked-texture shading term cancelled the global sun delta, so time of day stopped reaching walls. |
| 5 | **Ground textures are not perspective-foreshortened; blade strokes are the same pixel length at the horizon as in the foreground** | **FIXED.** There was no LOD, so distant ground point-sampled a high-frequency texture and aliased into same-scale noise. Added distance mip selection. |
| 6 | **White speckle is a screen-space overlay — it turns orange at dusk, proving it is applied after lighting** | **FIXED.** Correctly identified as the distance-fog dither. It was reaching the near field because the jitter term could push the threshold below zero. Fog now cannot start before its onset distance under any jitter. |
| 7 | **s01 stone wall is mirror-wrapped, forming a giant chevron at x≈235** | **FIXED.** Wall `u` was derived from the fractional cell position without accounting for which face was hit, so adjacent faces ran their texture in opposite directions. |
| 8 | **s07/s09 sprites do not receive the ambient tint; a tree renders at full noon green in a 20% scene** | **FIXED.** Decor was drawn with the outdoor sun delta only, ignoring time of day. |

## UI legibility — accepted, fixed in r4

| # | Finding | Disposition |
|---|---|---|
| 9 | Message line clipped mid-word in **all 22 shots** ("Your party arri") | **FIXED.** Log lines now word-wrap to the panel width instead of hard-truncating. |
| 10 | s17 SKILLS block rendered at half body size | **FIXED.** Set at the same scale as the rest of the sheet. |
| 11 | s18 slot labels truncated to garbage ("c nat", "ufft a") | **FIXED.** Slots now show an icon plus a short label that fits. |
| 12 | s20 eight unselected school tabs one value step off the ground, invisible | **FIXED.** Unselected tabs get real contrast; unavailable schools are hatched rather than dim. |
| 13 | s19 "Your gold" straddles the window rule | **FIXED.** Moved inside the panel. |
| 14 | s21 automap occupies ~12% of its window, no legend | **FIXED.** Map now scales to fill, with a legend. |
| 15 | s22 title advertises a spec sheet ("nine regions · thirteen dungeons") | **FIXED.** Replaced with a tagline. |

## Accepted, deferred with reason

| # | Finding | Disposition |
|---|---|---|
| 16 | **s16 player figure is an untextured primitive next to a fully-rendered ogre** | **DEFERRED — in flight.** Correct and damning. The creature mesh batch is generating all 27 actors now; the placeholder painter is what it caught. Will re-judge in r5 once baked. |
| 17 | **s11 cliff is the grass texture desaturated — same fiber stroke, same spacing** | **DEFERRED — in flight.** The generated `cliff` and `rock` textures exist; this shot predates them being baked for that material. |
| 18 | s05 "orange lozenge", s10 "three identical grey trapezoids" unidentifiable | **DEFERRED.** These are procedural decor props. The prop mesh batch replaces them. |
| 19 | s02 no occlusion band where wall meets ground | **DEFERRED to r5.** Real, and cheap, but it needs a contact-shadow pass the renderer does not have yet. |
| 20 | s06 checkerboard alpha dither where grass meets sky reads as display corruption | **PARTIALLY FIXED** by #6. Re-judge in r5; if it survives, replace the screen-door fade with a value gradient. |

## Rejected

| # | Finding | Disposition |
|---|---|---|
| 21 | "Horizon in the top 15% on s05/s06/s07/s11; the camera is pitched down into dirt" | **REJECTED as framed, ACCEPTED in substance.** The camera is not pitched down — the horizon sits at viewport centre by construction. What the judge is seeing is terrain *rising* in front of the camera and filling the frame, which is the heightfield doing its job. But the complaint that the eye has nowhere to go is fair, so the shot list keeps these cameras and the *world* gets more distant silhouette to look at. Noted for the world pass, not the renderer. |

## What the judge said works, recorded so it does not get refactored away

- The UI brown/gold family is consistent across all 22 shots "without a single drift".
- Every viewport lands between 72 and 135 unique colours — real palette discipline, nothing 24-bit.
- s03's dusk ramp is "the most convincing lighting in the set".
- s01 is the only exterior with three materials each carrying their own hue *and* value ramp.
- s04's composition earns its place: "the only exterior with a path for the eye".
- s19's greyed-out unaffordable items is "a genuinely 1998 touch".
