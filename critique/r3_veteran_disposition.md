# Round r3 — MM6 veteran disposition

Judge: cold Might & Magic veteran, played MM3–MM8 on release. Given only the built artifact and a
browser. Forbidden from reading source, plan, or notes. Played the build at `4a2be43`/`48e5cbe`.

**VERDICT: NO-SHIP — 4/10.**

> "I wiped my party twice in the first ten minutes, and the second time I clicked the only button on
> screen labelled like a menu — `MNU` — and it silently overwrote my one and only save slot with the
> corpse."

This is the most valuable artifact this project has produced. Every finding below is real. Several
are things no test I would have thought to write would have caught, because they are about what
happens to a *person*, not about whether a function returns the right number.

## Fixed

| # | Finding | Disposition |
|---|---|---|
| 1 | **A party wipe is unrecoverable and destroys your only save.** No defeat screen; the unconscious party can walk, shop and sleep; rest heals nothing; potions unusable; temple unaffordable; `MNU` silently overwrote the single slot | **FIXED, and it was the worst defect in the build.** Defeat is now a terminal event: a defeat screen, no movement, and waking at the Harrowgate temple a day later minus 40% of carried gold — which is what MM6 did. `MNU` is now a real menu with **three** save slots, an explicit load list showing which slots are occupied, and a route back to the title. Saving never overwrites without the player choosing a slot. |
| 2 | **The starting party has no way to heal and no way to reliably hurt anything.** Every spell in all nine schools reads "not learned"; potions offer only EQUIP/DROP and EQUIP says "Cannot equip that." | **FIXED.** Casters now start knowing tiers 1–3 of their trained schools, with a guaranteed heal for divine casters and an attack cantrip for arcane ones. The inventory gained a **USE** verb — the game shipped with eight healing potions the party could not drink. |
| 3 | **The economy is off by an order of magnitude.** Healing Potion value 100g, shop 1050g. Starting gold 250 | **FIXED.** Root cause: `value()` multiplied by stack quantity, and shop stock carries ten potions, so shops priced the whole stack. Split into `unitValue()` and `value()`; shops quote one unit. Quest trophies that sold for 0g now have value. Temple healing re-costed so a level-1 party can afford to be revived. |
| 4 | **The message log physically cannot display a message.** "Your party arri", "The Grey Wolf m", "Cannot equip th" — clipped in every capture | **FIXED** (also found independently by the art critic). Word-wrapped to the panel width instead of hard-truncated. |
| 5 | **Dungeons have no ceiling and are lit by the outdoor sun.** Wall tops visible against open sky; interior mean brightness 80.6 at noon vs 45.0 at midnight | **ALREADY FIXED** between the judge starting and finishing — it played a build from before the r3 art-critic fixes landed. Dungeons now have ceiling geometry, a ceiling material distinct from floor and wall, and a torch pool that falls to black. Kept here because the judge is right and the fix must not regress. |
| 6 | **Silent failure is the house style.** Unaffordable shop item, temple PAY, CAST with no spells — all no-op with no message | **FIXED.** Every refusal now names the reason and the numbers: "Not enough gold — Healing Potion costs 62, you have 34." The trainer already did this correctly; the pattern is now applied everywhere. |
| 7 | **Time runs at six game-minutes per real second and never pauses.** A day every four real minutes, running through menus, the title screen and character creation — which is why the first game began at 21:47 in the dark | **FIXED.** The clock advances only during play. Menus, title and creation freeze it. |
| 8 | **HUD buttons draw over modals and stay live through them.** Clicking where `RST` sits opened Make Camp through the character sheet; the party selector was drawn underneath the panel | **FIXED.** The HUD renders non-interactive behind a modal and registers no hit regions. The per-character screens gained their own in-panel party selector, so the selector is visible where it is used. |
| 10 | **Combat has one attacker.** ATK swung only the selected character while the other three stood idle | **FIXED.** ATK commits the whole party, as MM6's Attack did. |
| 11 | **Systemic text collisions.** Rule struck through "Your gold: 250" and "PACK 3/30"; "Personality10 +0"; class blurbs broken mid-word; slot labels cut to "amule", "offha" | **FIXED.** Panel contents moved inside their rules, stat columns widened, class blurbs word-wrapped, paperdoll slots use short labels that fit. |
| 12 | **Character creation doesn't create a character.** No name, no portrait, no sex — whatever four classes you pick you get Alder, Bree, Cass and Dorn | **FIXED.** Name, sex and portrait are all cyclable per slot, with a live portrait preview. |
| 15 | **"Thornmarch booted."** — a developer boot string in the player-facing log | **FIXED.** Removed from the player log. |

## Accepted, in flight

| # | Finding | Disposition |
|---|---|---|
| 9 | **One creature sprite for every living thing.** The town Captain, the Grey Wolf and the Goblin are the same nude flesh-coloured mannequin with two dots for eyes | **IN FLIGHT.** Exactly right, and the single most damning art finding. 18 of 27 creature meshes are generated; the foundry bakes them to palette sprites next. The mannequin is the procedural stand-in it caught. |
| 13 | Blank shop signs — unmarked brown planks, so you must walk into each shop to learn what it is | **ACCEPTED, next.** Needs per-trade sign icons. |
| 14 | Automap inconsistency — dungeons fully revealed on entry, outdoors fogged to a tiny circle, unexplained yellow dots | **PARTIALLY FIXED.** The map now scales to fill its window and has a legend. Dungeon reveal-on-entry is still wrong and is queued. |

## Deferred with reason

| # | Finding | Disposition |
|---|---|---|
| — | Sky is a flat fill with no sun disc, no clouds, no dawn/dusk colour shift | **DEFERRED.** Real. Needs a painted sky dome, which is an art-generation task rather than a code one. |
| — | Every tree is the same tree — identical trunk, canopy and height, forming a flat band | **DEFERRED to the prop bake.** Scale jitter is cheap and will land with the generated props. |
| — | Four portraits are four recolours of one face, with no condition state | **DEFERRED.** Generated portraits are a planned image-gen class. |
| — | NPCs are a role word and a button: no name, no face, no topics, no hire | **DEFERRED.** A real dialogue system is a design increment, not a bug fix. |
| — | Draw-distance falloff is a stipple checkerboard | **PARTIALLY FIXED** by the art-critic pass (jitter + mips). Re-judge in r6. |

## What the veteran said is RIGHT — recorded so it does not get refactored away

- "The control scheme is correct out of the box… I didn't have to look anything up."
- "The creation math is the real thing… that's not a cosmetic imitation, that's the actual system."
- "Dungeon layouts are designed, not generated. Somebody drew that."
- "Save/load is exact… That is the hardest thing on this list to get right and it's right."
- "Rest is correct for conscious characters… 'Enemies are too close to make camp.' is exactly the right instinct."
- Terrain has real height; eye level changes walking through town.

## Harness disclosure the judge volunteered

It used `teleport`/`setTime` to cross the map and to re-light the world, and entered the Sunken
Barrow via `gotoMap` — **it never found the dungeon entrance by walking.** That is itself a finding:
the cave mouth is not discoverable. Queued.
