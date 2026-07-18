# Balloon Power-Up Drift Redesign — Design Spec

Date: 2026-07-17
Status: approved by Asher (this session)

## Problem

The balloon power-up is effectively uncatchable, and reads as if balloons deliberately avoid
the player:

1. It spawns glued to the tower — always 16px outside the left/right edge of the top block
   (`maybeSpawnBalloon`, index.html ~1493). Wherever the tower is, the balloon appears beside it.
2. The catch window is exactly one drop. It spawns at `row = blocks.length + 1`; the row-distance
   check in `land()` (~1518) only passes for that row, and `afterPlace` (~1638) flags it as
   missed after one more placement, sending it accelerating upward ("they all go vertical").
3. Catching requires self-harm: the block must overhang the tower edge by ~12px (4px slack on a
   16px offset), which gets trimmed off and breaks perfect streaks.
4. It fades/drifts in over ~50 frames, roughly the time a decent player takes the single
   qualifying drop, so it is barely visible during its own catch window.

Meanwhile the badge-pickup system (`schedulePickups` / `collectPickup`) is fair: spawns ahead,
inside the corridor, collected by steering. The balloon must become equally fair while staying
mechanically distinct.

## Approved design: drift-across + any-block-contact

### Spawn & flight

- The balloon enters from the LEFT or RIGHT screen edge (random side) — no fade-in; floating in
  from off-screen is its own telegraph. The `inT` intro-rise state is removed.
- Altitude: fixed world Y at spawn time, approximately 3 rows above the current tower top
  (`GROUND_Y - (blocks.length + 3) * BH - BH/2`), inside the drop corridor's airspace.
  The existing gentle sine bob is kept.
- Horizontal drift: slow, constant, toward the far side. Crossing the full screen takes roughly
  8–12 seconds, so 3–5 drops happen while it is in play.
- Cadence unchanged in spirit: one balloon at a time, minimum row gap since the last balloon,
  spawn roll on placement, only in modes whose rules allow pickups (`canSpawnPickups` gate:
  endless, levels, time, daily).
- Drift speed, spawn altitude (rows above top), and cadence live in `BALANCE_REGISTRY.balloon`
  so tuning is one-place.

### Popping — any block contact

The balloon pops when any solid block touches it (balloons are fragile; blocks are solid):

- Mid-air snipe: each frame while a faller is dropping, a circle-vs-rect check between the
  balloon and the faller. Contact → pop.
- Tower catch: the balloon drifts into the tower silhouette — checked against the block rect at
  the balloon's altitude row (covers both "balloon drifts into tower side" and "tower grows up
  into its path"). Contact → pop.

On pop, behavior is identical to today's catch: `applyPower(balloon.type, ...)`, pop particles,
`sfx.pop()`, `runBalloons++ / runPowerups++ / stats.balloons++` — so every balloon achievement
(`pop1/pop5/pop25`) and the balloon mission keep working unchanged. Reward pool stays
`GIFT_POOL` (shield / wide / slow / aura / gold / fever).

### Missing

If the balloon crosses the whole screen untouched it floats off the far edge and despawns.
The `away` escape-upward state and its math in `balloonWorldY` are deleted, along with the
"missed — it escapes upward" line in `afterPlace`.

### Explicitly out of scope (YAGNI)

- Wind-linked drift direction (flavor; can be added later).
- Multiple simultaneous balloons.
- Tap-to-pop input (conflicts with tap-to-drop).

## Code changes (index.html)

| Site | Change |
| --- | --- |
| `maybeSpawnBalloon` (~1493) | Spawn at screen edge with drift velocity + fixed world Y; drop `inT`/`away` fields |
| `balloonWorldY` (~1505) | Fixed altitude + bob only; remove rise/escape terms |
| `land()` catch block (~1518) | Delete row-window catch (superseded by per-frame contact checks) |
| `afterPlace` (~1638) | Delete the missed→escape line |
| Per-frame update (~2205) | Drift x, contact checks (faller + tower), off-screen despawn |
| `drawBalloon` (~2390) | Remove `inT` fade; keep sway/ropes/gift art |
| `adaptToScreen` (~1944) | Keep balloon x shift/clamp (unchanged semantics) |
| `BALANCE_REGISTRY` | New `balloon` entry: drift speed, altitude rows, cadence |

## Testing

- Update balloon checks in `tests/headless.js` to the new contract: edge spawn (off-screen x,
  correct altitude), corridor crossing (x advances with dt), faller-contact pop, tower-contact
  pop, off-screen despawn, stats/achievement increments on pop, no spawn in modes without
  pickups.
- Full suite green before any push.

## Deploy

Standard rules: bump `sw.js` CACHE to `skystack-v104`, update the matching check in
`tests/headless.js`, full green suite, push `main` (deploys), hand Asher `?fresh=104`.
