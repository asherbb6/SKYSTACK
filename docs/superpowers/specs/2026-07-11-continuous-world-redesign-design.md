# SKYSTACK — Continuous World Redesign (Design Spec)

**Date:** 2026-07-11
**Status:** Approved (design), pending implementation plan
**Baseline:** v34 (`skystack/index.html`, ~3061 lines, single file; `tests/headless.js` — 128 tests green)

## Goal

Replace the current "N isolated, cross-fading biome tiers" with a **single continuous, physically-anchored 2D pixel world** that the player climbs from underground caves out into daylight, up past trees and buildings, through clouds and the jet stream, into the aurora, space, orbit, and the stars. No structure ever fades in/out to "belong" to a tier — objects are rooted in world space and are simply climbed past. Add cinematic per-region entry animations, atmospheric-eerie caves, higher-quality animated wildlife, per-region block materials that affect gameplay, and sparse telegraphed hazards.

The user's core complaint about v34: the world "still isn't right" because biomes fade in/out instead of forming one coherent physical world. Visual coherence is therefore the primary deliverable; gameplay-affecting systems are sequenced last so the look ships clean first.

## What's wrong today (baseline)

- `TIERS` (`index.html:485`) defines stages purely by block count; world starts at ROOFTOPS(10). No underground.
- `currentBiome(cy)` (`~1514`) computes `wUp`/`wDn` blend weights over a `BLEND=5` band; `drawBiomeSky()` and `biomeBackdrop()` **cross-fade** each tier's sky gradient AND its backdrop structures into the neighbor. This dissolve is the "fade in/out" the user rejects.
- Backdrops are isolated per-tier functions (`drawRooftopsBg`, `drawTreetopsBg`, …), each self-contained rather than a single object rooted in the world with a real base and top.
- Campaign pre-stacks perfect blocks to the previous stage height and wins at the current stage height (`~580`). Endless is one ground-up climb.

## Confirmed decisions

| Topic | Decision |
|---|---|
| World structure | **Prepend CAVES + SURFACE** below the existing 9 sky stages → one continuous, anchored 11-stage world. |
| Campaign level start | **Short camera pan to the landmark, then start on a themed base platform** (not perfect pre-stacked blocks). |
| Block skins | **Adapt per stage** (stone / wood / glass-steel / cloud / ice / cosmic). |
| Block behavior | **Materials affect gameplay** (subtle, tunable; baseline regions keep today's exact feel). |
| World feel | **Grounded & logical** — caves under dirt, buildings/trees rooted at the surface, clouds above, thinning air into space. |
| Endless start | **Full continuous climb from the caves.** |
| Sky map | **Extend downward + rework** so the map reads as the same continuous world. |
| Foreground | **Background + thin foreground accents** that never cross the central play column. |
| Wildlife | **Ambient, high quality** (detailed multi-frame birds, bats, fireflies, balloons). Pure stacking. |
| Cave mood | **Atmospheric-eerie.** |
| Hazards | **Add obstacle events** — sparse, telegraphed, never instant-death. |
| Region intros | **Cinematic, region-specific entry animations** (new, user-added). |
| Delivery | **Phased, review at visual milestones.** |

## 1. Core model change

Remove tier cross-fading. Introduce a single world coordinate space keyed on **world altitude `A`** (in blocks). Every backdrop element is anchored to an altitude range and drawn iff it overlaps the viewport; it *ends* naturally (you climb past its top) rather than dissolving.

- **Sky:** replace the `SKY_STOPS` array-swap+blend with a continuous `skyColorAt(A)` sampler that interpolates between altitude keyframes. Each frame builds a viewport gradient by sampling `skyColorAt` at the top and bottom of the visible band → always smooth, never a hard swap.
- `atmoDark(h)` stays altitude-driven (night arrives with altitude); re-tune for the new thresholds.

## 2. Region ladder (11 stages, physically continuous)

The player stacks **upward from the cave floor**. The **surface** is a fixed world line: below it = inside the earth (rock walls + dripstone ceiling with an escape hole); at it = ground strip where trees and buildings are rooted; above it you pass their tops, then open sky.

**Order (physical correction):** TREETOPS is placed **before** ROOFTOPS — trees are shorter than skyscrapers, so canopies are cleared first, then the tallest roofs.

```
CAVES → SURFACE → TREETOPS → ROOFTOPS → CLOUD NINE → JET STREAM
→ STRATOSPHERE → AURORA → SPACE → ORBIT → THE STARS
```

Proposed thresholds (block count `n`, tunable in Phase 1):

| # | Stage | n (win height) | Notes |
|---|---|---|---|
| 0 | CAVES | ~6 | escape / break the ceiling |
| 1 | SURFACE | ~12 | emerge into daylight, grass/rock, bases of trees + buildings |
| 2 | TREETOPS | ~22 | clear the canopies |
| 3 | ROOFTOPS | ~34 | top the tallest roofs/antennas |
| 4 | CLOUD NINE | ~55 | into the clouds |
| 5 | JET STREAM | ~80 | wind corridor |
| 6 | STRATOSPHERE | ~105 | sunset / golden hour |
| 7 | AURORA | ~150 | polar night ribbons |
| 8 | SPACE | ~200 | atmosphere gone |
| 9 | ORBIT | ~300 | Earth below |
| 10 | THE STARS | ~500 | cosmic finale |

Trees and buildings are **always present** from the surface upward until climbed past — never opacity-faded.

## 3. Continuous anchored backdrop engine (the real fix)

A single render loop draws altitude-anchored *features*, generated deterministically from seeded column/altitude hashes (reuse the existing `bhash` pattern — no large arrays, stays cheap and single-file, stable across frames):

- **Cave walls** — left/right rock columns spanning the underground band; dripstone ceiling with a jagged escape hole at the surface line.
- **Buildings** — solid, asymmetric instances rooted at the surface with individual top altitudes (varied heights, detailed windows/antennas/rooftops). Drawn base→top as one object.
- **Trees** — one-piece structures rooted at the surface: trunk → branches → canopy, each with a top altitude.
- **Clouds / aurora / space fields** — banks and fields anchored at their altitudes, drifting.

Invariant: **no structure changes opacity to belong to a tier.** It is on-screen or off-screen. Neighboring regions coexist visually where they physically overlap (e.g., building facades still rise beside you above the treetops).

Readability: detail sits **behind the tower**; only thin, low-opacity **foreground accents** (cave rock lips, grass blades, drifting wisps) are allowed, and they never cross the central play column.

## 4. Caves & the emergence (atmospheric-eerie)

Deeper shadow, rock walls, dripstone, sparse light, skittering silhouettes, water drips, glinting crystals. As the tower rises through the ceiling **hole**, the walls end and daylight + a grass strip appear at the surface line — a real "climbed out of the ground" transition with no fade.

## 5. Wildlife (ambient, high quality)

Stage-appropriate, decorative, better-animated, behind the tower:
- Detailed **birds** with real multi-frame wing cycles (explicit user ask).
- Cave **bats**, fireflies, crawlies; high-altitude balloons, satellites.
- Architected as a roaming-sprite layer keyed to altitude bands. Pure decoration — no gameplay interaction.

## 6. Region entry animations (cinematic, region-specific)

A `regionIntro` overlay with its own timeline (driven by existing `tick`/`dt`), layered after the world and before the HUD, reusing the banner system. Fires the first time a region is entered in a run (Endless) or on level start (Campaign, fused with the camera pan). `reduceMotion` → reduced static title card.

| Stage | Intro moment |
|---|---|
| CAVES | black → a crystal/torch glow ignites the walls |
| SURFACE | the ceiling **shatters**, debris rains, a sunlight shaft floods in, birds scatter |
| TREETOPS | leaves burst upward through sunbeams |
| ROOFTOPS | city windows flicker on, a plane crosses |
| CLOUD NINE | punch through a cloud floor, it parts |
| JET STREAM | wind streaks / speed lines whip past |
| STRATOSPHERE | the sunset ignites in a golden bloom |
| AURORA | ribbons ripple across the sky |
| SPACE | the atmosphere falls away, stars pop into silence |
| ORBIT | Earth's limb curves below, a satellite drifts |
| THE STARS | a finale constellation burst |

Intros are brief and must not meaningfully harm stacking flow (short flourish; where play would be interrupted, keep the pause minimal and skippable).

## 7. Campaign: pan-to-landmark + themed bases

Each campaign level pans the camera up to its landmark, plays that region's intro, then starts the player on a themed **base platform**:

| Region | Base |
|---|---|
| Cave | stone ledge |
| Surface | grassy platform |
| Treetops | thick tree branch |
| Rooftops | rooftop slab |
| Clouds | cloud platform |
| Space | satellite / asteroid deck |

Win = reach that region's top (break the cave ceiling, clear the canopy, top the roof, etc.). Endless = one continuous climb from the caves all the way up.

## 8. Sky map — extended & reworked

Redraw the trail as the same continuous world: dark caves at the bottom → surface/forest/city → clouds/jet stream → aurora/space/stars at the top. Add the two new stages; keep drag-scroll, progress math, and per-level stars working.

## 9. Block materials that affect gameplay (subtle, tunable)

A `MATERIALS[region]` config with a single sway/drift hook so behavior is data-driven and testable. Baseline regions keep today's exact feel.

- **Stone (caves)** — heavy: steadier, no post-place drift.
- **Wood/brick (surface/city)** — baseline.
- **Glass/steel (upper city)** — baseline, shiny.
- **Cloud (cloud nine)** — slight wobble on the moving block.
- **Ice (aurora)** — slippery: large overhangs can slide ~1px.
- **Cosmic / anti-grav (space)** — low gravity: floaty, wider timing window.

Endless records remain valid (everyone climbs the same world). New tests per modifier; modifiers subtle so difficulty stays fair.

## 10. Obstacle events (sparse, telegraphed)

A small per-region hazard scheduler, telegraphed, never instant-death, off in early levels:
- Caves: falling pebble / drip.
- Surface / city / jet stream: wind gusts (reuse existing wind system).
- Aurora / space: drifting meteor/debris behind the tower.

## Phasing (delivery)

Review checkpoints after phases 2–7 (screenshots per region).

1. **World ladder + continuous sky sampler** — insert CAVES/SURFACE, reorder TREETOPS↔ROOFTOPS, `skyColorAt(A)`, retune thresholds & `atmoDark`. Keep tests green.
2. **Continuous anchored backdrop engine** — buildings/trees/cave-walls/clouds as rooted, non-fading, altitude-anchored objects; remove cross-fade. ← the real fix → *review*
3. **Caves + surface + emergence art** — dripstone, rock walls, the hole, grass strip, eerie mood. → *review*
4. **Wildlife + animation polish** — multi-frame birds, bats, fireflies, window flicker, tree sway, drips, contrails, aurora, meteors. → *review*
5. **Region entry animations** — the `regionIntro` cinematic system. → *review*
6. **Campaign bases + pan-to-landmark + sky-map rework.** → *review*
7. **Materials + hazards** (subtle, tunable) + **tests & per-region screenshots**; keep the 128-test suite green and extend it. → *review*

## Constraints & risks

- **Single file:** everything stays in `skystack/index.html`; no build step, no new deps. PWA (`sw.js`) + manifest unchanged except cache-busting version bumps.
- **Tests:** `tests/headless.js` must stay green; new systems (materials, thresholds, region math) get new tests.
- **Performance:** deterministic hash-based feature generation per viewport; respect `reduceMotion`; keep the falling block and tower always readable (foreground policy above).
- **Balance risk:** materials + hazards touch the core loop; sequenced last, subtle, tunable, disabled in early levels. Can be split to a follow-up if the visual redesign should ship first.
- **Records:** thresholds shift but records track max height; not reset by this redesign.

## Open items for implementation-plan stage

- Exact block-count thresholds (Phase 1 tuning pass).
- Whether region intros pause the falling block or overlay live play.
- Whether materials/hazards ship in this release or as an immediate follow-up.
