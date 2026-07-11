# Phase 2 — Continuous Anchored Backdrop Engine — Plan

> **For agentic workers:** implement inline with visual checkpoints. This is a cohesive rendering rewrite, not independent tasks — build in the three sub-steps below, screenshot after each, keep `node tests/headless.js` green.

**Goal:** Replace the cross-fading, infinitely-tiling low-world structures with objects **rooted at absolute world altitude** that you climb *past* (cave walls end at a ceiling; buildings/trees rise from the surface and have real tops). Keep the celestial bands (clouds→stars) but remap them to the new 11-tier order and stop cross-fading structures.

## Anchoring model

- `worldY(A) = GROUND_Y - A*BH - cameraY` → screen-Y of world altitude `A` (blocks). `A=0` is the tower base = cave floor.
- `SURF_A = 6` — the **surface line** (== CAVES threshold). Below it: cave interior (rock walls, dripstone ceiling with an escape hole). At it: grass/ground strip. Above it: buildings & trees rooted, rising to their tops.
- A rooted object with span `[baseA, topA]` is drawn **iff** `[worldY(topA), worldY(baseA)]` intersects `[-M, H+M]`. As you climb, `cameraY` rises, `worldY` falls, the object slides down-screen and off the bottom — you've climbed past it. No opacity fade.
- **Landmark tops line up with stage thresholds** (realizes "reach the top = clear the level"): tree canopies top out ~TREETOPS(22), building roofs ~ROOFTOPS(34); tall towers reach toward the clouds.
- **Parallax rule:** things you climb *past* (near buildings, trees, cave walls) scroll at `f=1` (truly rooted). Only the far, topless **skyline haze** may parallax (`f<1`) as atmospheric depth.

## Tier remap (new 11-tier order)

`biomeBackdrop(tier)` switch → 0 CAVES, 1 SURFACE, 2 TREETOPS, 3 ROOFTOPS = the new rooted ground world (drawn by `drawGroundWorld`, self-clipping); 4 CLOUD NINE→`drawCloudNineBg`, 5 JET STREAM→`drawJetStreamBg`, 6 STRATOSPHERE→`drawStratosphereBg`, 7 AURORA→`drawAuroraBg`, 8 SPACE→`drawSpaceBg`, 9 ORBIT→`drawOrbitBg`, 10 THE STARS→`drawStarsBg`. (Celestial art unchanged, just +2 index shift / reorder.)

`biomeSprite` and `biomeWeather` tier switches: same +2 remap (or gate the ground tiers to the new sprites in a later phase; for now remap so nothing lands on the wrong art).

## Render wiring

`drawBiomeDecor(cy)` becomes:
1. `drawGroundWorld(cy, ph)` — always called; self-clips by altitude. Draws (back→front): far skyline haze (parallax), cave walls + dripstone ceiling + hole (A∈[floor,SURF_A]), surface ground strip (A=SURF_A), rooted trees (base SURF_A), rooted near buildings (base SURF_A). Each drawn only where its altitude span is on screen — **no fade**.
2. High celestial band: `const {ti,wUp,wDn}=currentBiome(cy); if (ti>=4){ biomeBackdrop(ti,cy,1); gentle wUp/wDn blend }` — atmospheric blend is fine for sky bands (not object-popping), so keep it above the ground world only.
3. Sprites + weather (remapped tiers).

## Sub-steps (screenshot after each)

- **2a — Anchoring + caves + surface + rewire.** Add `worldY`, `SURF_A`; write `drawCaveWalls`, `drawSurfaceGround`, skeleton `drawGroundWorld`; remap `biomeBackdrop`/`biomeSprite`/`biomeWeather` to the new tiers; rewrite `drawBiomeDecor`. Buildings/trees temporarily reuse old art or blank. Verify: caves render as rock walls + ceiling/hole at low altitude; surface strip appears at A=6; no crash; celestial bands correct up high. Screenshot caves + surface.
- **2b — Rooted buildings + trees + far skyline.** New `rootedBuilding(x,w,topA,…)` and `rootedTree(x,base,topA,…)` reusing the `cityBuilding`/`forestTree`/`foliageBlob` pixel detail but anchored (base at SURF_A, real roof/canopy at topA, windows/branches tiling within the span). A deterministic instance list (fixed screen-X columns, `topA` from `bhash`) — trees top ~18–24, buildings ~26–40, a couple towers ~44–50. Far skyline = parallax haze with no tops. Verify: buildings/trees rise from the ground and you climb past their tops; canopies clear ~22, roofs ~34. Screenshot surface→rooftops→clouds.
- **2c — Handoff polish + tests + commit.** Ensure clouds read as a layer you rise into above the rooftops; remove/retire the now-unused `drawRooftopsBg`/`drawTreetopsBg` tiling (or keep only their far-skyline bits); confirm readability (nothing crosses the central play column). Update/extend headless smoke tests for the new functions (`worldY`, `drawGroundWorld` render-without-throw across the climb, determinism of the instance list). Keep suite green, bump `sw.js` v36, commit.

## Constraints

Single file; `node tests/headless.js` green at each commit; `reduceMotion` respected; central play column stays clear; deterministic hashing (reuse `bhash`) so structures are stable across frames; `sw.js` → v36.
