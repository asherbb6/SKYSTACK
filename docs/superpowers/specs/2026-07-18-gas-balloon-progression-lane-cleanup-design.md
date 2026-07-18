# v109 — Gas balloon, progressive balloon system, one-lane cleanup (design)

Date: 2026-07-18 · Approved by Asher ("nah looks good. proceed") after AskUserQuestion:
gas = **disguised low-flyer**; progression = **unlocks + scaling**; tutorial = **one line +
stop repeating**. Screenshot complaints driving part 3: three stacked pop-ups, truncated
"OFFSET DROPS LEAN THE TO", meaningless corridor bar under the chip.

## 1. Poison-gas balloon (new kind `gas`)

A true hazard balloon, disguised among the good ones. First user of the reserved pri-3
danger notification (v105 contract).

**Flight** — `balloonFlight('gas')` returns the GOOD profile (low `goodAltRows`, normal
`driftSpeed`). The only tell is the look.

**Look** (`drawBalloon`) — sickly toxic green (`c1:'#9BD44A', c2:'#3E5A1E'`), same envelope
as other kinds, badge = tiny pixel SKULL drawn on the badge disc (not a font glyph). A subtle
pulse (existing `tick`-based pattern, reduced-motion-gated like the golden sparkle).

**Burst** (`popBalloon` branch, before the good-kind path):
- `gasCloud = { wy: balloonWorldY(), t: B.gas.cloudFrames }` (module global, reset in `resetRun`).
- `note('GAS! CLIMB OUT', '#FF5E7E', 3, 150)` — danger priority interrupts the current note.
- Green particle burst + `shake` (same magnitudes as trap), `sfx.pop()`, `balloon = null`.
- Does NOT count toward `runBalloons`/`runPowerups`/`stats.balloons` (bad pop, same as dud/trap).

**Cloud effect** (`update`, only in `playing`/`dropping`):
- `gasCloud.t -= dt`; expires to `null` at 0.
- The band spans `gasCloud.wy ± B.gas.cloudRows*BH` (world y). While the TOP block's center
  (`GROUND_Y - (blocks.length-0.5)*BH`) is inside the band, the top block shrinks from both
  edges, center-preserving: `d = min(B.gas.shrinkPerFrame*dt, top.w - B.gas.minW)`;
  `top.w -= d; top.x += d/2`.
- Fairness rails: floor at `minW` (never zero — pressure, not a kill), cloud self-expires,
  PERFECT growth (land() combo grow) still applies on later placements, Practice/Pure
  unaffected (no balloons there).

**Render** — translucent sickly-green band at the cloud's screen y (height
`2*cloudRows*BH`), alpha ~0.16 with a soft per-frame flicker, drawn in the world layer near
the balloon draw; fades out over the final 60 frames of `t`. A few drifting green particle
motes inside the band (skip when `reduceMotion`).

## 2. Progressive balloon system

All in `BALANCE_REGISTRY.balloon` (one-line tunable):

```
wLow:  { gift:70, golden:6, dud:16, trap:8,  gas:0  }
wHigh: { gift:42, golden:6, dud:24, trap:18, gas:10 }
unlock: { dud:2, trap:4, gas:6 }        // campaign level INDEX gates: L3, L5, L7
gasAltBlocks: 120                        // endless: gas needs blocks.length >= 120 (240m)
diffScale: { minRating:3, maxRating:11, minShare:0.5 }   // bad-weight scale by level rating
gas: { cloudFrames:360, shrinkPerFrame:0.18, minW:12, cloudRows:2.5 }
```

`balloonKindWeights()` (existing altitude lerp stays) adds:
- **Campaign** (`runLevel >= 0`): any kind `k` with `runLevel < unlock[k]` gets weight 0.
  Bad kinds (dud/trap/gas) are scaled by
  `minShare + (1-minShare) * clamp((rating - minRating)/(maxRating - minRating), 0, 1)`
  where `rating = LEVEL_REGISTRY[runLevel].difficultyRating` — early levels stay gentle even
  where kinds are unlocked; SUMMIT RUN gets the full mix.
- **Endless** (`runLevel < 0`): dud/trap available as today (altitude lerp only); `gas`
  weight is 0 until `blocks.length >= gasAltBlocks`.

`maybeSpawnBalloon`: gas uses `type:'coin'` (unused) like dud/trap.

## 3. One clean lane (screenshot fixes)

1. **Tutorial = ONE strip.** `renderHUD`'s lesson block draws a single
   `drawNotifyStrip('TITLE: BODY')`; fit fallback to `'TITLE: COMPACT'`, then `COMPACT`
   alone — using the strip's REAL limit (`len*6+16 > W-16`), killing the mid-word
   truncation bug (the old gate used `len*6-1 > W-12`). The second strip (yOff 14) is gone.
2. **Lessons stop repeating.** New save key `skystack-tutstep` (int, via `store`): real-mode
   runs resume `tutStep` from it and `advanceTutorial` persists progress; completion still
   sets `skystack-tut`. PRACTICE runs always start at 0 and never write either key.
3. **Chip stops dropping.** `renderModifierHUD`'s `(tutStep>=0?16:0)` offset is deleted —
   the tutorial is one line now, so the chip sits at `NOTIFY_CHIP_Y` always.
4. **Corridor bar only when it means something.** The mini-map bar draws only for
   `m.family` in `gust | target | visibility` (real corridors/lanes). Precision/goldRush/
   recovery/limitedMiss modifiers get the chip only.

Worst case on screen: one strip + one chip (+bar only when meaningful) — was four boxes.

## Tests (481→~495 expected)

- Registry: gas entries + unlock/diffScale/gasAltBlocks present; kinds tables include gas.
- `balloonFlight('gas')` = good profile. Extend the v108 kind-validity + draw-all-kinds
  checks to include gas.
- Campaign gating: runLevel 0 → dud/trap/gas weight 0; runLevel 2 → dud>0 trap 0;
  runLevel 6 → gas>0. Rating scale: same altitude, higher-rating level → strictly larger
  bad share.
- Endless: gas 0 below gasAltBlocks, >0 at it.
- Gas pop: gasCloud created, pri-3 GAS note (danger interrupt), no good-pop counters.
- Cloud: top block in band shrinks center-preserving to exactly minW and stops; out-of-band
  top unaffected; cloud expires; resetRun clears gasCloud.
- Tutorial: one-strip source check (no yOff-14 second call in the tut block); behavioral —
  at W=180 every lesson's rendered text is never cut mid-word (instrumented txt);
  persistence — advance in real mode writes skystack-tutstep and a new run resumes there;
  practice does not write.
- Chip: fixed at NOTIFY_CHIP_Y (offset source check updated).
- Bar: renders for a gust modifier, absent for a precision modifier (instrumented fillRect
  or source-form check).

## Ships as

v109: cache `skystack-v109` lockstep, full suite green, browser QA (gas burst + cloud
shrink live, tutorial single line, chip without bar on STONE RHYTHM), deploy, vault
close-out with `?fresh=109`.

## Out of scope

Phase-2's broader physics scaling beyond gas; endless game-over screen; any layout change
beyond the notification lane (standing rule: consult Asher first).
