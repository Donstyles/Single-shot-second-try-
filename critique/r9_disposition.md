# Round r9 — four judges, four disjoint failure classes

Four cold panels ran against builds pinned at `950c6d5` (QA, veteran) and `5aafd4e` (art, first
impression). They were given no project context and no access to `src/`, `ARCHITECTURE.md` or any
design document.

| Judge | Verdict |
|---|---|
| Art critic, round 3 | **3/10** (up from 2/10) |
| First-time player, round 2 | **Would not keep playing** |
| QA hunter | **Three unrecoverable softlocks; the game could not be won** |
| MM6 veteran, round 2 | **NO-SHIP, 4/10** |

They overlapped on almost nothing. That is the point of running them separately.

## Process failure, recorded

**I rebuilt `dist/` while the veteran was mid-session and invalidated its run.** It caught this
itself — it reloaded at the end, found a 775,048-byte file where it had started against 710,546,
noticed the party-creation screen was visibly different, and stopped rather than report findings
against a build that no longer existed. The standing rule (never rebuild `dist/` while a judge is
live) exists precisely for this and I broke it. Its findings below are treated as valid against the
r8-era build and re-verified individually against the current one; one (party creation) was already
fixed and it said so.

---

## Fixed

### Renderer

| Finding | Judge | Disposition |
|---|---|---|
| **Distance fog is a screen door.** "I can trace unbroken vertical columns of blue pixels straight across the black in s12, crossing wall, floor and void without deviating." Reported UNCHANGED for the second round running | art | **FIXED, properly this time.** Fog is now a true RGB blend toward the horizon colour, quantised to the palette through a cached LUT (17 steps × 256 colours per distinct horizon colour, built once and kept). The Bayer matrix survives only to dither the blend PARAMETER between two adjacent LUT steps so a slow gradient does not band. Two previous attempts — a threshold swap, then a shade-walk with a crossover dither — both put a lattice on the screen. |
| **The ground plane does not foreshorten.** "1-pixel vertical streaks that are the same width at the bottom of the frame as at the horizon" | art | **FIXED, and the diagnosis beat mine twice running.** The march took ONE texel per step and filled the entire vertical run with it. Each screen row now solves for its own ground distance and samples there, with per-row LOD and per-row fog. I had previously recorded this as fixed; it was not, and the code proved the judge right. |
| **The skybox leaks into sealed dungeons** — a bright pale-blue panel at the end of the barrow corridor in s12 and s13 | art | **FIXED.** The outdoor sky band was being used as both the unmarched-column fill and the fog target underground. A dungeon now resolves distance to black. |
| **The dungeon is lit by the outdoor clock** — "at 05:08 the inside of a burial barrow glows sunrise orange" | veteran | **FIXED.** The sun term is zero underground; the torch pool is the only light there is. |
| **The camera can end up under the world** — "trees hanging upside down from the top of the sky, trunks pointing up, canopies below them" | first impression | **FIXED.** The eye is clamped to at least 0.30 above the standing surface outdoors and inside the floor/ceiling gap in a dungeon. It was not the renderer coming apart; the eye was underwater. |

### Input, collision and readability

| Finding | Judge | Disposition |
|---|---|---|
| **A tap does not move the party.** "An instantaneous tap does not move you. A press held for 40 ms does... two dead taps in a row on a game's core verb is where I would have put the phone down" | first impression | **FIXED.** A press latches the movement key down for 170 ms, so one tap always buys one visible step and one visible button-down frame. Holding is unchanged. |
| **You can stand inside a wall.** "The entire viewport filled with wall texture. I genuinely could not tell if I was stuck, inside a building, or if the renderer had died" | first impression | **FIXED.** The party is a body of radius 0.26, not a point. A one-cell doorway still has 0.48 of clearance. |
| **The party bar has no numbers.** "In fifteen minutes nothing on that bar moved by a single pixel... to learn that Alder has 31/31 HP I had to open a separate full-screen sheet" | first impression | **FIXED.** HP and SP numerals over the bars, level for non-casters. |
| **The message log shows stale fragments** — "ahead. / Nothing here. A / door is 4 paces / ahead." | first impression | **FIXED.** The window fills from the newest message backwards, whole messages only. |
| **The 5px font misreads its own words** — "Alder" as `Rlder`, "Dorn" as `Durn`, "Harrowgate" as `IIarrowgate` | art | **FIXED.** A, H, M, N, U, V, W and lowercase o, w, n redrawn. The large font was fixed last round and the small one was not. |
| **Text collisions**: creation (`< Alden PC 1 >` in one rectangle), guild (three lines on one y), tavern, temple | veteran, first impression, QA | **FIXED.** Creation tabs sit above the name row and carry the four characters' names; shop gold is right-aligned in the header; guild lines are spaced and its skill buttons are drawn at readable size. |
| **The automap is a smudge.** "The entire town is a 45-pixel blob... I had to screenshot it and blow it up 6x offline" | first impression | **FIXED.** Scales to what is explored, centred on the party, with a compass rose and a needle. |
| **No compass, no facing indicator** | veteran, first impression | **FIXED.** Facing arrow on the party marker plus an N/S/E/W rose. |

### Content and systems

| Finding | Judge | Disposition |
|---|---|---|
| **Buildings have no doors.** "Every building is a featureless solid block... there is no door-shaped thing to walk toward." Entered one building in fifteen minutes, by accident | first impression | **FIXED.** Every shop and every house carries a drawn planked door with an arch, iron bands and a ring handle. |
| **Shop signs are blank boards** | veteran, art, first impression (3 rounds running) | **FIXED.** A painted pictogram per trade, beside the door rather than stacked on it. |
| **Several shots do not contain their subject** — no market, no gate arch, no coast, no camp, and "the bridge is a 60x20px grey rectangle lying flat on the grass... it reads as a doormat" | art | **FIXED at the source.** The world now records where it put its gate arches, bridges, cave mouths, market row, bandit camp, shoreline and open road, and the capture asks for the landmark instead of guessing a coordinate. A shot whose subject the world does not contain is now reported as a WORLD GAP in the capture output rather than quietly photographed as a field. Market stalls, crates, barrels, campfires and herb clumps are new procedural art. |
| **Nothing happens.** "I never met a single enemy, never fought anything, never saw a number change except the clock" | first impression | **FIXED.** The safe radius around a town dropped from 34 cells to 19 on a 128-cell region, and a picket of the region's weakest monster rings the band outside the walls. |
| **Night is unplayably black** | first impression (r8) | **FIXED.** Ambient floor raised so night is dark but navigable. |
| **A full pack destroys quest items forever and consumes the chest** — including the Ashen Key, the endgame item. "No room for Seal of the Barrow!" then "Taken: Seal of the Barrow", the item gone, the quest stuck at state 1 with no recovery | QA | **FIXED.** Acquisition is atomic. The chest stays shut, the item stays in it, and the player is told why. |
| **Buying with a full pack takes the gold and gives nothing**, unbounded | QA | **FIXED.** Room is checked before the money. Same root cause. |
| **The defeat modal is dismissible by any hotkey**, leaving four unconscious characters walking a world they cannot fight in, with no gold for the temple and a camp that does not revive them. In-game save/load did not re-arm it; only reloading the page did | QA | **FIXED, three ways.** The check no longer latches, the modal eats input, and — the actual root cause — the check now runs BEFORE update()'s open-screen early return, which is why it could neither re-arm nor stand down while it was up. A night's rest now also brings the merely unconscious round. |
| **The game cannot be won.** A full playthrough cleared all 13 dungeons, opened every chest, turned in every reachable quest; `won` never flipped | QA | **FIXED, two independent causes.** The Marshwort quest asked for four bundles of an item that existed nowhere in the world — marshwort now grows in the fens and regrows after a day. And the FINAL quest's giver was placed by walking east from the plaza in a straight line, which walks into the ring of buildings; givers are now placed on verified walkable ground. Both are asserted structurally in the campaign suite. |
| **Magic is unreachable.** "The GUILD renders the identical body to the TRAINER — the same 12 weapon/armour skill buttons. There is no magic-school skill anywhere, no spell-purchase UI, and no scroll in any loot table across all 13 cleared dungeons." Three castable spells of 99 at level 100 with 198 skill points spent | QA, veteran | **FIXED.** The guild has its own screen: the character's schools as tabs, a STUDY button that raises the school skill, and every spell of that school with its tier, SP cost, mastery requirement and price. |
| **The shop charges 6–9× the price on the label**, and the refusal prints behind the panel | veteran | **FIXED.** The buy path priced with `value()` (the whole stack) while the UI priced with `unitValue()`. This is the v1 economy bug resurfacing in the one place that takes the player's money. A systems check now asserts the two agree — and asserts they are genuinely different numbers, so the check can fail. |
| **No turn-based mode.** "MM6's defining trick is that Enter freezes the world and lets you spend everyone's turn deliberately. The WAIT/CAST/ATK buttons here promise that and don't deliver it" | veteran | **FIXED.** A TURN button in the chrome and T on a keyboard. Nothing moves on its own while it is on. Each character acts once in order; then every monster takes exactly one action and the round rolls over. Stepping is allowed and costs the round. |
| **Combat is unreadable.** "No enemy health, no enemy name on screen, no target indicator, no indication of which of your four is swinging" | veteran | **FIXED.** An enemy nameplate with a health bar and numerals, and a turn banner naming whose turn it is, which round, and who is still to act. |
| **A goblin lands three attacks a second against a 33 HP party** | veteran | **FIXED.** Cadence halved to about one swing a second, asserted in the systems suite. |
| **Equipping over an occupied slot silently no-ops** | veteran | **FIXED — as feedback.** The swap always worked, but one item left the pack and the displaced one came back, so the count did not move and nothing was printed. A silent success is indistinguishable from a silent failure. Both items are now named. |
| **The touch controls sit inside the 3D viewport.** Ranked first of five: "mobile-game grammar that did not exist in 1998... it is why nine of these shots have nowhere for the eye to go" | art (also veteran, first impression) | **FIXED.** Carved stone chrome either side of the view holds movement on the left and verbs on the right. Nothing overlaps a pixel of the world. FOV retuned to 57° horizontal so the narrower viewport keeps MM6's vertical framing. |

---

## Accepted, in flight

| Finding | Judge | Disposition |
|---|---|---|
| **Every humanoid is a hard T-pose.** "At distance the arms read as pipes" | veteran, art | **ACCEPTED — root cause found and it was mine.** The mesh prompt said "standing upright in a T-pose with arms out to the sides" AND passed `pose_mode: 't-pose'`. I chose that for rig consistency; it is what an asset looks like before it is finished, and it is in every frame. The clause is now a wary idle combat stance and `pose_mode` is gone. Regenerating one creature as a probe before committing the credits for the rest. |
| **Four portraits are two faces** — "Alder and Dorn are pixel-identical with different hair grey" | art | **ACCEPTED, queued.** |
| **The dungeon wall texture is a placeholder checkerboard** (s15 right half) | art | **ACCEPTED, queued.** |
| **Item icons are 6×14 vertical sticks; four weapons are indistinguishable** | art | **PARTIALLY DONE.** Icons follow the governing skill now; the judge still could not tell them apart at shop size. Needs redrawing, not re-keying. |
| **Sky is eight hard horizontal bands** (s22) | art | **ACCEPTED, queued.** |
| **38% of the phone screen is black bar** — 640×480 letterboxed to 520×390 inside 844×390 | veteran | **ACCEPTED, not yet actioned.** A wider framebuffer is a layout change across every screen; it is the largest remaining single win for the target device and it needs to be done deliberately rather than squeezed in. |
| **Training is a flat 10 gold for any number of levels** — level 1 → 100 in one click | QA | **ACCEPTED, queued.** |
| **One exception in draw() freezes the frame loop forever** | QA | **ACCEPTED, queued.** Harness-only to reach, but the unrecoverable freeze is the defect. |
| **The save loader accepts a non-numeric gold and `invariants()` misses it** | QA | **ACCEPTED, queued.** |
| **A spell with nothing to do is a silent no-op** | QA | **ACCEPTED, queued.** |

## Recorded as working, so it does not get refactored away

- **The death loop.** "Six wipes, six clean recoveries. This is the best-designed thing in the build."
- **Save/load.** Three explicit slots, no silent overwrite, exact restoration of position, clock, gold and hand-edited stats. The QA pass found the only diff across a full round trip was the sub-minute accumulator.
- **Item conservation.** 1,200 mixed equip/unequip/tab operations: per-item diff `{}`. 500 unequip/equip cycles: total unchanged. No duplication anywhere.
- **Quest turn-in is idempotent**; chests are one-shot for gold as well as items; quest items cannot be dropped.
- **Character creation's point curve.** Costs escalate, the cap is enforced, class switching neither refunds nor duplicates. "That is MM's curve and I liked it."
- **20,000-tap and 30,000-operation fuzz runs**: no page errors, no out-of-bounds, invariants clean at every checkpoint.
- **s16's creature** is "the only asset in 22 frames that looks hand-painted rather than generated" — the foundry pipeline working.
