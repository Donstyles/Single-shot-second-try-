# Round r8 — first-impression disposition

Judge: a player who has never seen a Might & Magic game, fifteen minutes, phone in landscape.
Zero project context. Build pinned at `950c6d5`. **Never used the debug harness.**

**Verdict: would not keep playing.**

> "The title screen ate four taps. Tap, tap, real touch event, double-tap — nothing. The game was
> only reachable by keyboard — a thing that does not exist on the device I was told I was holding."

This is the most serious finding of the entire project. Every other defect in every other review is
downstream of a game that a real person on a real phone cannot start.

## Fixed

| # | Finding | Disposition |
|---|---|---|
| 1 | **The title screen ignores taps entirely.** Four attempts — pointer tap, real touch event, double tap — zero response, no highlight, no state change. Only Enter on a keyboard started the game | **FIXED, and it is the worst bug this project has had.** Two causes. Only `pointerdown`/`pointerup` were bound, so any context dispatching touch or plain mouse events hit nothing; all three families are now bound with de-duplication, plus a `click` fallback. And UI actions fired on RELEASE, so any hiccup in down/up pairing swallowed the input — actions now fire on PRESS. Movement is the only thing that still needs press-and-hold. |
| 2 | **In-game buttons need a ~180ms hold.** "A tap — a real, normal, human phone tap — does not move the party. Every single input for the rest of the session had to be a deliberate long-press." | **FIXED** by the same change. |
| 3 | **The clock is a runaway train.** "Roughly half an hour per real-world second… by minute eight it was 01:11 and the screen was literally black… I lost two in-game days to nothing." | **FIXED.** A day now takes 16 real minutes instead of 4. |
| 4 | **Movement fails silently.** "I pressed forward twenty-four times over two attempts and moved approximately one tile. No message, no bump, no 'you can't go that way', nothing." | **FIXED.** Blocked movement now says why — too steep, too deep, or blocked — rate-limited so it cannot spam. |
| 5 | **"Nothing here." four times in a row while the map showed doors one tile away** | **FIXED.** The interact radius was tighter than a player can plausibly stop, and the failure message taught nothing. It now names the nearest door and which way it is: "Nothing here. A door is 3 paces to your left." |
| 6 | **The spellbook opens on FIRE for a Priest who cannot use it**, so every page reads "not learned" and the player concludes magic does not work | **FIXED.** The book opens on a school the selected character actually has. |
| 7 | **The character sheet is unreadable** — "it literally reads `Might 16 +Intellect`, `Personality 10 +Endurance`. I could not read my own character's stats." | **FIXED** (also reported by the art critic). Stat columns widened. |
| 8 | **"PACK 1/30" is drawn on top of the "CASS" tab** | **FIXED.** |

## Accepted, queued

| # | Finding | Disposition |
|---|---|---|
| 9 | **Every shop sign is a blank brown rectangle.** "I stood in front of three different ones, pressed USE, and got 'Nothing here.'" | **PARTIALLY DONE.** Pictorial sign art now exists per trade (`Art.shopSign`); wiring it onto the sign sprites in-world is queued. This is the third review to report it. |
| 10 | **The map has no facing indicator.** "Knowing a door is to the left on the map is useless, because I don't know which way left is." | **QUEUED.** The party marker draws a single 1px direction pixel; it needs a real arrow, plus a compass. |
| 11 | **A quest modal appears before the player has seen the world, party or town** | **QUEUED.** The captain stands inside the spawn radius. Move the spawn, or move him. |
| 12 | **Night is unplayably black with no light source and no explanation** | **QUEUED.** Needs an ambient floor outdoors so night is dark-but-navigable, and the starting kit should include a torch that visibly does something. |
| 13 | **Got wedged inside the town wall** — "every direction was a wall of grey stone clipping through the near plane" | **QUEUED.** Needs a near-plane pushback and a wall-slide, so a corner cannot trap the camera. |
| 14 | **"1N" is never explained** (skill level 1, Novice) | **QUEUED.** Spell out "Novice" on the sheet; there is room now that the columns are wider. |
| 15 | **Equipment slots have no names or tooltips** | **QUEUED.** |

## What the judge said works

- "The title screen is the best thing in the build… I understood it instantly."
- "The presentation is competent and the world is genuinely pretty in daylight."

Both of which sharpen the verdict rather than soften it — the judge's own summary was that it
"looks like a real game that has decided not to let me in."
