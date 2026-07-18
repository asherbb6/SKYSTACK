# Balloon Difficulty — Phase 1 (v108) — Design

**Asher's ask (roadmap, DURABLE):** make balloons a difficulty pillar — "matter a lot to avoid,
get harder, some good/beneficial." Phase 1 = duds, trap balloons, speed/altitude variety, and a
golden balloon, keeping the v104 drift-and-pop mechanic. Phase 2 (hazard/physics balloons, gas
shrink-cloud) is later; the notification queue's pri-3 danger slot stays reserved for it.

**Decisions (AskUserQuestion, DURABLE):** avoidance model = HYBRID BY ALTITUDE (bad balloons spawn
high/fast so they usually drift off before the tower reaches them, but CAN pop on contact); trap
effect = a ~2s slider-speed RUSH (mirror of the SLOW power); golden = BOTH a coin jackpot AND a
guaranteed top power-up, rare; approved as v108.

## Architecture

The `balloon` object (v104: `{x, vx, wy, ph, type}`) gains a **`kind`** field:
`gift | golden | dud | trap`. `kind` drives flight params at spawn, the pop payoff, and the look.
The single-balloon-at-a-time, edge-entry, drift, and circle-vs-rect pop mechanics are unchanged.
Tunables live in `BALANCE_REGISTRY.balloon`.

## Components

### 1. Spawn selection (`maybeSpawnBalloon`, index.html ~1504)

- Keep the gates: `canSpawnPickups`, `blocks.length >= 8`, `minRowGap`, `spawnChance`, edge side.
- Pick `kind` by weighted random. Weights interpolate from a "low" table to a "high" table by a
  difficulty factor `f = clamp(blocks.length / scaleAlt, 0, 1)` — so higher climbs (and pre-stacked
  campaign levels, whose `blocks.length` starts high) get more bad balloons for free.
- Flight by kind:
  - `gift`/`golden` → **low & slow**: `altitudeRows = goodAltRows`, speed `= driftSpeed`.
  - `dud`/`trap` → **high & fast**: `altitudeRows = badAltRows`, speed `= driftSpeed * badSpeedMul`.
- `gift`/`golden` carry a `type` from `GIFT_POOL` (golden's is forced to a top power); `dud`/`trap`
  set `type` to a safe placeholder they never read for a payoff.

### 2. Pop payoffs (`popBalloon`, ~1525)

Branch on `kind`:
- `gift` — `applyPower(random GIFT_POOL)` (today's behavior). Counts toward runBalloons/stats.
- `golden` — big coin burst (`addCoins(goldenCoins)`) **and** a guaranteed top power-up
  (`gold` or `fever`). Counts toward runBalloons/stats. Gold sparkle particles.
- `dud` — a grey puff + `DUD` floater, no effect. Does NOT count toward balloon stats.
- `trap` — set `rushT = rushFrames` (~120 = 2s), `RUSH!` floater, small `shake`, `sfx.deny`-style
  cue. Recoverable; never an instant kill. Does NOT count toward balloon stats.

### 3. Trap RUSH timer (mirror of SLOW)

- New global `rushT = 0` (declared with `slowBlocks` etc. ~1055; reset in `resetRun` ~1397).
- In `update(dt)` decrement `rushT` by `dt` while `> 0`.
- In the live slider-move step (~2242) multiply the slider's step by `rushMul` while `rushT > 0`.
  This mirrors the SLOW power's 0.55× (which is drop-based); RUSH is a short time-based speed-up so
  it feels like a burst, not a whole run of fast drops.

### 4. Look (`drawBalloon`, ~2412)

Branch on `kind`, keeping the current envelope shape:
- `gift` — power-up `POW[type]` colors + `drawIcon(type)` badge (unchanged).
- `golden` — shiny gold body (`#FFE28A`/`#B8860B`), slightly larger, a coin/star badge, occasional
  sparkle particle. Clearly the jackpot.
- `dud` — muted grey (`#8A8F9C`/`#4A4F5C`), saggy/deflated silhouette, a `?` badge. Clearly worthless.
- `trap` — dark red (`#FF6B5A`/`#7A241C`), a spiky/knotted rim, a `!` badge. Clearly "don't hit."

Color plus the high-and-fast flight give two independent reads of good vs bad.

### 5. `BALANCE_REGISTRY.balloon` additions

Extend the existing entry (keep `driftSpeed, minRowGap, spawnChance, margin, hitR`; replace the
single `altitudeRows`):

```js
balloon: { driftSpeed:0.35, minRowGap:8, spawnChance:0.5, margin:14, hitR:10,
  goodAltRows:3, badAltRows:6, badSpeedMul:1.6, goldenCoins:25, rushMul:1.8, rushFrames:120,
  scaleAlt:120,
  wLow:  { gift:70, golden:6, dud:16, trap:8 },
  wHigh: { gift:42, golden:6, dud:28, trap:24 } }
```

## Fairness

- One balloon at a time (unchanged). Bad balloons always enter from a screen edge (self-telegraph),
  spawn high, and usually cross and drift off before the tower reaches them.
- Traps never instantly kill — a ~2s rush is fully recoverable.
- Practice/Pure keep zero balloons (`canSpawnPickups` gate unchanged).
- Only good pops (gift/golden) count toward the "POP N BALLOONS" mission/achievement — bad pops
  don't inflate or deflate it.

## Tests

- Spawn: forcing each `kind`, the balloon gets the right altitude (good low / bad high) and speed
  (bad = `driftSpeed*badSpeedMul`).
- Weighted selection shifts toward more dud/trap as `blocks.length` rises (compare kind
  distribution at low vs high altitude over many seeded rolls).
- Pop: `gift`→a power effect; `golden`→coins increased by `goldenCoins` AND a top power applied;
  `dud`→no state change besides removal; `trap`→`rushT === rushFrames`.
- RUSH: `rushT` decrements in `update` and zeroes out; while active the slider step is faster; a
  fresh `resetRun` clears it.
- Stats: popping gift/golden increments `runBalloons`; dud/trap do not.
- `drawBalloon` runs without throwing for all four kinds.
- Cache lockstep: `sw.js` `skystack-v108` + matching test. Full suite green before push.
