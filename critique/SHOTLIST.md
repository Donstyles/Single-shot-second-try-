# The canonical shot list

The fixed set of captures every critique and discriminator round uses.

**The shots never change.** Same camera, same seed, same clock — so a difference between rounds is a
change we made, not a frame we got lucky with. Adding a shot is fine. **Editing or removing one
invalidates comparison against every earlier round**, so don't.

This file is written *before* the world exists, which makes it a **specification**: the map must be
authored so that every camera below stands somewhere real and sees what the "must prove" column
claims. A shot that cannot be taken is a world bug, not a shot-list bug.

## Capture procedure

Playwright headless Chromium, `executablePath: '/opt/pw-browsers/chromium'`. Never run
`playwright install`.

Viewport `844×390` (iPhone 14 Pro Max landscape) unless the round is explicitly desktop. Fixed seed
`?seed=7`. One shot per page load, or `__game.settle(4)` between shots so transient state (fades,
head-bob) has settled.

```js
__game.seed(7);
__game.gotoMap(map, x, y, ang);
__game.setTime(t);
__game.settle(4);
```

Write to `critique/shots/<round>/<id>.png`. **Never overwrite a previous round's directory.**

`ang` is radians: `0` = +X (east), `-1.5708` = north, `3.1416` = west, `1.5708` = south.
`t` is minutes since midnight (720 = noon, 1380 = 23:00).

★ marks the **core eight** — the fast subset for cheap iteration rounds. The full list is used for
panel and discriminator rounds.

## Maps

| id | name | kind | size |
|---|---|---|---|
| `vale` | Thornmarch Vale | outdoor | 128×128 |
| `barrow` | The Sunken Barrow | dungeon | 32×24 |
| `mine` | Greyhollow Mine | dungeon | 40×28 |
| `keep` | The Ashen Keep | dungeon | 36×24 |

## World shots

| id | map | x | y | ang | t | what it must prove |
|---|---|---|---|---|---|---|
| ★ s01_plaza_noon | vale | 58.5 | 56.5 | 0 | 720 | Harrowgate plaza + fountain: facade variety, building height variation, crowd, midday palette |
| s02_market_row_morn | vale | 50.5 | 60.5 | -1.5708 | 540 | shopfronts, hanging signs, long street perspective, morning light rake |
| ★ s03_gate_east_dusk | vale | 78.5 | 57.5 | 3.1416 | 1140 | town wall from outside at the warm hour — **the gate-arch shot** (overhead span, walk under) |
| ★ s04_road_east_noon | vale | 88.5 | 57.5 | 0 | 720 | open wilderness. **THE TERRAIN SHOT.** A dead-level horizon at mid-screen here is total failure |
| ★ s05_barrow_mouth | vale | 101.5 | 52.5 | 0 | 900 | dungeon entrance — **the cave-mouth shot**: span overhang, cliff face, braziers. Must read as a hole in rock, not a door in a field |
| ★ s06_bridge_ravine | vale | 84.5 | 62.5 | -1.5708 | 660 | **the overhead-span shot**: bridge deck with ravine floor visible in the gap beneath it. The one thing a heightfield cannot express on its own |
| s07_bandit_camp | vale | 92.5 | 34.5 | -1.5708 | 780 | camp at distance: tents, sprites at range, haze falloff, sprite feet snapped to terrain |
| ★ s08_town_night | vale | 58.5 | 59.5 | -1.5708 | 1380 | night palette, lamp and brazier glow, torch radius, warm/cool separation |
| s09_dawn_road | vale | 70.5 | 50.5 | 0 | 330 | the dawn ramp — the light transition MM6 is remembered for |
| s10_coast_west | vale | 18.5 | 58.5 | 3.1416 | 1020 | ocean running out into haze. **The map edge must never be visible** |
| s11_ridge_north | vale | 60.5 | 22.5 | -1.5708 | 840 | the bounding mountain ridge: terrain fencing the valley instead of an invisible wall |

## Dungeon shots

| id | map | x | y | ang | t | what it must prove |
|---|---|---|---|---|---|---|
| ★ s12_barrow_entry | barrow | 3.5 | 2.5 | 0 | 720 | the first indoor frame a player ever sees |
| s13_barrow_corridor | barrow | 9.5 | 9.5 | 0 | 720 | long corridor: torch falloff, wall tiling, depth cueing |
| s14_mine_hall | mine | 8.5 | 8.5 | 0 | 720 | open hall, multiple sprites, ceiling read |
| s15_keep_vault | keep | 5.5 | 2.5 | 0 | 720 | endgame room: pillars, boss door, marble |

## UI and moment shots

| id | state | what it must prove |
|---|---|---|
| ★ s16_combat | turn-based active, party mid-swing, 2+ monsters visible | the frame a screenshot judge is most likely to be shown |
| s17_charsheet | character sheet, PC 1 | stat block density and typography |
| s18_paperdoll | inventory, fully equipped PC | paperdoll art, item icons |
| s19_shop | weapon smith, wares list open | the shop frame — heavy UI ornament |
| s20_spellbook | spellbook, fire school | school gems, sigil page art |
| s21_automap | automap on `vale`, zoomed to town | map rendering |
| s22_title | title screen | first impression, vista art, logotype |

## Rules for using it

1. Capture from a **pinned build**. Record the commit SHA in the round directory as `SHA`.
2. Capture the whole list **before reading any of it**. Judging as you capture biases the fix list.
3. Every finding must name a shot id. "The outdoors feels flat" is not a finding;
   "s04: the horizon is a dead level line at exactly mid-screen" is.
4. Diff against the previous round on the **same id**, side by side, before declaring progress.
5. Never rebuild `dist/` while a judge is mid-run against it.

## Round log

| round | SHA | what changed since the last round |
|---|---|---|
| r0 | `327027c` | palette test card only — no world yet. Baseline for the presentation axis is deliberately empty; `_palette_testcard.png` proves the capture path and the palette ramps, nothing more. |
