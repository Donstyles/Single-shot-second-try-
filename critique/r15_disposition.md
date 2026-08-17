# Round r15 — three live-play judges on a frozen build

Build frozen at `ceb919a`, **873,095 bytes**. All three judges checked the size at the start and
the end of their sessions and all three reported it unchanged. The r12 process failure — rebuilding
`dist/` four times under a reviewer — did not recur.

| Judge | Verdict |
|---|---|
| MM6 veteran | **NO-SHIP 5/10** — "the skeleton of a real Might & Magic is in this box" |
| QA hunter | **3 run-enders**, 1 exploit, 1 corruption class |
| First impression | **would not keep playing** — put it down at "Enemies are too close to make camp" |

The first-impression player's summary is the sentence that organised most of this round:

> "Every single one of those is the game refusing to tell me the outcome of an input."

---

## Run-enders — all three the same mistake

Every one is the bug r12 already fixed: **a gate asking the party's pockets instead of asking the
world what has happened.** r12 applied the lesson in exactly one place and left the rest standing.

The rule now applied everywhere: *progress is a fact about the world, recorded when it happens.*
Quests are allowed to take things away. Nothing already achieved may become un-achieved because the
player did what the journal told them to do.

| Finding | Disposition |
|---|---|
| **Turning in "Shards of the Crown" bricks the endgame.** Turn-in consumes all three shards; the Ember Forge needs three *in hand* to wake; exactly three exist and they are in no loot table. Turn the quest in first and the Ashen Key is unmakeable, both Ashkeep gates stay barred, `won` is unreachable. **The journal instructs the player to do this.** | **FIXED.** The world records that the set was ever gathered. |
| **My own r12 fix covered one of two orderings.** It recorded the road open when the *gate* was used; turning the key in to the Smith first consumed it with the road shut. The Smith is in Harrowgate, the gates are two regions away — fetch-key-then-walk-home is the *natural* route and it paid 9,000 XP for bricking the run. | **FIXED.** Acquisition is recorded, not just use. |
| **Kill credit only counted while the quest was open, and nothing respawns.** Killing a unique target before accepting made the quest permanently uncompletable — including `q_crown`, whose target is the single crown in the keep. | **FIXED.** Kill counts come from the world's own dead records, so kill quests are order-independent exactly as item-fetch quests already were. |

---

## Exploits and corruption

| Finding | Disposition |
|---|---|
| **The inn bed was an unlimited in-combat full heal.** Panels stop the world. The shop door refused at 3.2 cells, camping refused at 14 — an eleven-cell band where 1 HP became 31/18/12/21 for ten gold while the wolf stood still. | **FIXED.** The bed obeys the camp rule; one rule answers both. |
| **Five purchasable spells could never be cast** — `target:'item'`/`'world'` fell through to "No target." 29,020 gold of dead purchases, Town Portal and Lloyd's Beacon among them. | **FIXED.** All eight scoped spells do real work. Unblocking them exposed a crash in `enchant_item` (non-finite power indexing the enchant table); guarded. |
| **`giveStack` merged past the cap and `load()` clamped the surplus away.** 68 potions in, 50 out — 28 items destroyed per save/load. Unreachable in play today because nothing grants a bundle. | **FIXED.** Overflows into new stacks; every item survives. |
| **Nothing in the game could be sold.** Eight shops, one-way. "A lie the game tells you eight times." | **FIXED.** BUY/SELL tabs. The cause was a classification error: pelts and herb bundles were flagged `quest` alongside the four unique items, but they are *renewable*. They are trade goods now; the four one-shots are still unsellable. |

---

## Refusing to tell the player what happened

| Finding | Disposition |
|---|---|
| **"A door is 12 steps to your right" while a door filled the screen.** Two bugs: USE required a portal within a flat 3.0 cells (a door filling a quarter of the frame is 3–4 out), and the hint then ranked doors by *raw distance* while USE ranks by *facing*. "I read that message three times." | **FIXED.** Facing buys reach; the hint uses the same scoring. |
| **The hint counted UP.** "5 steps to your right", walk five, "6 steps to your right." | **FIXED.** A step count toward something you are not pointed at does not shrink when you walk. If it is not ahead, the instruction is to turn. |
| **Eight forward taps into total silence.** `sayBlocked` existed but sat behind a 700 ms cooldown — measured, **20 blocked taps produced 6 messages**. | **FIXED.** Every blocked press kicks the horizon on half a sine. The message stays rate-limited; the bump is not. |
| **"Enemies are too close to make camp" in an empty walled town, at full HP, twice.** | **FIXED.** Not a broken check: 14 cells reaches through a row of buildings. Radius 10, line of sight required, and the refusal names the monster. |
| **CAST answered "No such spell."** Every HUD verb registered its own id as its click payload and the cast handler reads a string payload as a spell id — so CAST tried to cast a spell called `"cast"`. | **FIXED.** |
| **USE opened the wrong NPC** — 1.02 cells from the captain, 2.7 from the smith, got the smith, twice. | **FIXED.** Scored by distance and facing. |
| **The Priest's SPIRIT tab listed fire spells.** `bookSchool` persisted across characters while the tabs listed only what the class could use. | **FIXED.** The pane resolves against its own tab strip, so the disagreement cannot be constructed. |
| **"Thornmarch booted." was the first line of in-fiction text in a new game.** | **FIXED.** It is a debug line; it goes to the console. |
| **The journal printed "Kill ash_crown"** — an internal id, in the one screen whose job is to say in English what the game wants. | **FIXED.** It asks the bestiary for the name and the world for the region. |

---

## The font — my own regression, found by reading the game's words back wrong

The veteran reported `Thornmarch` → **Thommarch**, `Dorn` → **Dom** in four places, `Harrowgate` →
**Hanowgate**, `arrives` → **anives**. One defect: `r` painting its shoulder inside the next letter.

I authored the advances by eye in font units and never checked them against the rasterised ink.
**Measured at cap 12: forty glyphs painted outside their own advance box.** `r` overran by 2px on an
advance of 6 — a 33% overrun, exactly enough to turn `rn` into `m`.

A type designer does not guess bearings; they fit them to the outline. So does the face now: find
the ink, seat it a bearing in from the pen, make the advance the ink plus a bearing each side.
Overruns **40 → 0**. Widths still come from the drawings, so narrow letters stay narrow.

Also fixed: the UI writes an **em dash** that was not in the face, so five screens rendered `?` where
the separator belonged. And `5` had a bowl sweeping nearly the full circle — `53g` read as 59g and
`165g` as `16'5g` in the armourer's, the one string in a shop that must be unambiguous.

---

## Refuted, with measurement

| Claim | Measurement |
|---|---|
| **"The sky is missing in a third of outdoor camera angles… pitching up extends it."** | Sky-ramp share of the top quarter of the viewport across five pitches: **43.7 / 60.8 / 77.5 / 90.0 / 96.4 %** as the camera rises. Pitching up reveals *more* sky, correctly. The grey mass is terrain, occluding the sky because it is in front of it. What is true underneath the report is that distant terrain and decor read as untextured primitives — a different finding, accepted below. |

---

## Accepted, queued

| Finding | Note |
|---|---|
| **The world outside the starting town is untextured primitives.** Standing stones are smooth grey cylinders; Ashencoast is three tan cubes; the Stonecircle golem is a cylinder body with a sphere head — standing three feet from the Ghoul, which is genuinely good. "One frame contains both, and that frame is the whole argument." | The single largest presentation gap. Same axis as the discriminator panel's process judge. |
| **Chests have no sprite.** You open an invisible object and read a line of text. | |
| **Item icons are placeholders where the player lives.** Six armour items share two icons; Torch and Rations share one; the quest-critical Seal shares one with the Wolf Pelt. | |
| **The paperdoll is byte-identical for all four characters** regardless of sex, class or equipment, at 175×300 on a screen opened constantly. | Queued since r12. |
| **The economy pays 2.9 gold a kill against 300 a quest.** One Healing Potion = 26 rats. | Selling now exists, which changes the arithmetic; needs re-measuring before retuning. |
| **Standing still halves incoming damage** — the clock advances with movement and enemy attacks are scheduled on game time. Reproducible: 11 damage standing, 21–22 moving. | A real exploit a player finds within an hour. |
| **Five strings truncated mid-word** — `The Sunken`, `UNARME`, `LEATHE`, `Protection from F`, `UNCON`. Trainer overlaps `TRAIN 10g` on `SKILL POINTS: 0`. | Font metrics changed since; needs re-capture before fixing. |
| **23% of a landscape phone is black bar**, and the 3D view gets 39.8% of the screen against MM6's 53.6%. | "Widen the framebuffer to the device aspect and scale by an integer and you fix the black bars, the view size, and half the font problem in one change." |
| **Smuggler's Cut is gated behind Water Walk with no signposting** — a legal party of four knights can never enter it. | Only unreachable interest point in a full BFS of all 22 maps. |
| **A save missing `cond` loads as success**, then `invariants()` and `brief()` throw. | Game keeps running; introspection does not. |
| **No sound at all.** | Still the loudest remaining tell. |

---

## Recorded as working, so it does not get refactored away

- **Character creation is MM6, not an homage to it** — 50-point pool, floor of 7 with refunds, escalating cost above 15, per-class voice. "I built four characters by hand and enjoyed it."
- **Turn-based mode**, with round counter and per-character pips. "The world holds its breath."
- **The spellbook**, including what it says when opened on a Knight: "better UX than MM6 had."
- **Skill point costs that scale with skill level** — "the MM6 rule and almost nobody gets it right."
- **USE distance hints** — "the single best piece of design in the build and the only reason I ever found a shop."
- **Day/night with lit windows** — "the best-looking thing in the game."
- **Terrain that rises.** "If a previous reviewer told you the horizon was a dead level line, that is fixed and comprehensively so."
- **The creatures.** The Ghoul, the Goblin, the captain — "would not embarrass MM6."
- **Zero console errors across ~2 hours of hard use**, three deaths, every screen.
- **QA negatives, counted not guessed:** 300 save/load cycles, 400 equip sweeps, 500 repeat turn-ins — zero duplication. 28 hostile save mutations, all rejected or clamped, zero page errors. Full BFS reachability over all 22 maps. 6,000 random taps, zero errors.

---

## Process

Two failures of mine this round, both recorded because they cost time:

1. **My first reproduction of the movement bug was invalid.** `newParty()` builds a party but leaves
   the title screen up, and `update()` early-returns there — so every scripted key press was a no-op
   against a menu. The probe showed 25 taps with no movement and no messages, which looks exactly
   like the bug it was hunting. I would have "fixed" something that was not broken. The harness has
   `beginGame()` now.

2. **A test was lying.** "four character turns damage the enemy" could be defeated by four missed
   attack rolls — it failed on the dice roughly one run in three, and I nearly went hunting a combat
   regression that did not exist. It swings enough times now that a miss streak cannot decide it.

**496 checks green**, up from 463.
