# Level Result Screen Cleanup (v107) — Design

**Asher's ask (from a `?fresh=106` level-win screenshot):** the top checkpoint caption is cut off;
nothing should overlap or get cut off in any aspect ratio; add a HOME affordance (merge with SKY
MAP as a split button); `MODS 1/1 +8` is confusing; make it simpler.

**Decisions (AskUserQuestion, DURABLE):** split HOME | SKY MAP on BOTH the win and fail screens;
reword the bonus line to be short/plain showing what was completed + the reward; REMOVE the
checkpoint caption entirely; approved the design as v107. Endless game-over screen is OUT of scope.

## Scope

Two campaign result screens in `index.html`: `renderLevelWin` (~5390) and `renderLevelFail`
(~5454), plus their layout in `relayout()` (WIN_ROWS/FAIL_ROWS ~1875) and pointer handling in the
`levelwin`/`levelfail` branches of `pressDown` (~2043).

## Changes

### 1. Remove the cut-off checkpoint caption

Delete the two lines that compute `cp` and draw
`<NAME> CHECKPOINT - <x>X SCORE` / `GROUND START - FULL SCORE` (index.html ~5395-5396). This is
the line overflowing both screen edges. The 0.75x checkpoint-scoring info still lives on the Sky
Map, so no information is lost from the game.

### 2. Bonus line reworded, on its own row (win screen)

Replace the crammed `PERFECTS 16/30 - MODS 1/1 +8` single line with a small flowing stats block
(a running y-cursor, not fixed offsets, so nothing collides when the bonus row is present or
absent):

- `PERFECTS <hits>/<placed>` — kept as-is.
- Bonus row, only when `modifierResults.length > 0`:
  - all won (`modifierWins === modifierResults.length`): `BONUS DONE +<coins>` (green `#62E8B5`)
  - partial: `<won> OF <total> BONUS +<coins>` (words, not a `/` ratio; coins suffix only if >0)
- Then the coin count-up and the `NEW STAGE UNLOCKED!` / `SKY CONQUERED!` line follow on the
  cursor, keeping their existing `winT` reveal gates.

"BONUS" (not "MODS", not "CHALLENGE") matches the v106 in-run wording and avoids colliding with the
existing CHALLENGE game mode.

### 3. Split HOME | SKY MAP button (both screens)

One plate divided down the middle: left half `HOME` → main menu (`state='home'; fadeT=1`, no map);
right half `SKY MAP` → `state='home'; fadeT=1; openSkyMap()`.

- `WIN_ROWS` ids: `['next','retry','nav']` (was `['next','retry','map']`).
- `FAIL_ROWS` ids: `['retry','nav']` (was `['retry','map','home']`) — merges the old separate MAP
  and HOME rows into one split row, freeing vertical room above for the revive offer. `FAIL_REV`
  unchanged.
- Render: draw the plate, a 1px vertical divider at the row's horizontal center, `HOME` centered
  in the left half and `SKY MAP` centered in the right half; each half falls back to compact copy
  (`MAP`) if the half-width can't fit the label.
- Hit-test the `nav` row by tap x: `p.x < row.x + row.w/2` → HOME, else → SKY MAP.
- The no-pointer (keyboard/Enter, `p === null`) paths are unchanged — Enter still triggers the
  primary action (NEXT LEVEL on win, REVIVE-or-RETRY on fail).
- Primary styling unchanged: NEXT LEVEL (win) and RETRY (fail) stay the big green primary; the nav
  row is secondary.

### 4. No overlap / no cutoff at any aspect ratio

- Every text line on both screens gets a width guard: measure `len*6*sc - sc` and use a compact
  fallback (or clamp scale) when it would exceed the screen — the big tier name, `COMPLETE!`, the
  fail `REACHED xM / yM` line, and the split-button labels.
- New instrumented-txt test sweep (adapting the existing v96 renderHUD harness at
  tests/headless.js ~1296): render `renderLevelWin` and `renderLevelFail` across
  `[[180,390],[180,520],[242,300],[320,480],[480,270]]` and several fixtures (ground level,
  checkpoint level, final level; win with/without bonus; fail with/without the revive offer;
  first-clear vs replay). Fail if any captured non-shadow `txt` box has `x0<0 || x1>W`, if any two
  boxes overlap, or if any `WIN_ROWS`/`FAIL_ROWS` button row falls outside `[0,H]` or overlaps
  another row.

## Tests

- Keep the existing "runs without throwing" checks for both screens.
- Add the v107 instrumented overlap/bounds sweep above.
- Add source/behavior checks: checkpoint caption gone; `WIN_ROWS`/`FAIL_ROWS` carry a `nav` id;
  the `nav` split hit-test routes left→home / right→map; the bonus line uses `BONUS DONE` /
  `OF ... BONUS` wording and no longer contains `MODS`.
- Cache lockstep: `sw.js` `skystack-v107` + matching test. Full suite green before push.
