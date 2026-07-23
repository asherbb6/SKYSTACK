# SKYSTACK Reactive World design system

Status: concept-complete; runtime extraction and implementation gated behind
review of `design/concepts/`.

## 1. Non-negotiable hierarchy

At any instant the player should read, in this order:

1. moving or falling block;
2. tower top and cut edge;
3. real force/hazard telegraph;
4. progress and immediate goal;
5. biome atmosphere and world story.

An effect that reverses this order is either reduced, moved to an edge lane, or
removed.

## 2. Rendering language

- Identifiable and interactive content: crisp pixel art, nearest-neighbor
  sampling, integer source scaling.
- Atmosphere: gradients, alpha fields, rays, and limited blur behind the pixel
  layer only.
- Tower: current readable horizontal slabs, with less specular gloss than the
  concepts and one consistent shared edge language.
- UI: dark navy pixel frames, warm ivory type, mint primary action, amber warning,
  cyan progress, biome accent only where it carries meaning.
- Text: short labels in fixed safe zones. No simultaneous level card, rule card,
  bonus card, and phase card.

## 3. Composition grid

- Top safe zone: pause/coin, height/score, goal/progress.
- Upper-middle: moving block and its path.
- Center: protected gameplay corridor.
- Lower-middle: live tower and mascot.
- Edge habitat lanes: terrain, creatures, balloons, props, and landmarks.
- Far layer: skyline, atmosphere, celestial bodies, and parallax depth.

Every decorative system declares whether it owns an edge lane, far layer, or
short event burst. None own the protected corridor.

## 4. Effect director

### Ambient channel

One primary family and at most one secondary family at full quality:

- cave dust plus rare crystal sparkle;
- forest leaves plus sparse insects;
- sky cloud drift plus wind seeds;
- aurora folds plus ice crystals;
- space stars plus one bounded nebula or debris family.

### Telegraph channel

Reserved colors and shapes:

- wind: tapered cyan/white stream with world reaction leading the force;
- danger path: amber dotted or segmented route;
- pull: amber curved grid with inward arrow;
- repair: mint/teal circle or balloon emblem;
- shield: cyan ring;
- pulse/reversal: gold countdown and radial line.

Telegraphs begin before force, stay locked to the authored route or target, and
end when the force ends.

### Event channel

Short local events only: impact dust, perfect-cut sparkle, pickup burst, repair
stitch, shield crack, phase entrance, and final-gate resonance. Event effects
cannot become permanent ambience.

## 5. Motion budgets

| Tier | Ambient movers | Active telegraphs | Event bursts | Notes |
| --- | ---: | ---: | ---: | --- |
| Full | 2 families | 1 primary + 1 minor | 1 | Designed phone target |
| Reduced detail | 1 family | 1 primary | 1 small | Lower particle counts, same mechanics |
| Reduced motion | static poses | static/stepped tell | 1 frame or short fade | Identical simulation and outcomes |

## 6. Source-to-system map

### Kenney

- Pixel Platformer: shared terrain edges, readable small creatures, collectibles,
  and base sprite scale.
- Farm Expansion: forest plants, signs, fences, grounded wildlife, and balloon
  cargo vocabulary.
- Industrial Expansion: orbital stations, warning fixtures, gates, machinery,
  and developer lab surfaces.
- UI Pack Pixel Adventure: frame anatomy, compact buttons, meters, icons, and
  focus states.
- Pixel Shmup: authored space craft, asteroids, projectiles, pickups, and debris.
- Tiny Dungeon: cave props, ruins, minerals, and underground silhouettes.
- Particle Pack: a small resampled subset for impacts and rare event bursts only.
- Kenney Fonts: experiments for labels and counters; retain the current font if
  the replacement loses clarity.

### Licensed component source

- Magic UI particles/meteors: native canvas emitters and locked trajectory plans.
- Magic UI shine border: rare focus/selection state, never all cards at once.
- Magic UI number ticker: result and reward counts, not live per-frame HUD.
- Magic UI light rays: cave/forest localized rays with biome masks.
- Magic UI aurora text: palette/motion study for aurora accents, not constant
  animated game text.
- Magic UI grids: developer lab, orbital targeting, and map surfaces at low
  density.
- React Bits Pixel Snow: stratosphere ice/snow depth study.
- React Bits Galaxy/Waves: star and aurora flow studies with dependency-free
  canvas ports.
- React Bits Letter Glitch/Faulty Terminal/Dither/Prismatic Burst: rare developer,
  damage, anomaly, and finale treatments only.

### Earlier user-supplied components

These ideas remain explicitly mapped even while their raw source stays
quarantined:

- Beam Grid Background: orbital targeting lanes and fixed hazard routes.
- Dot Grid Background: map constellation and developer controls.
- Fall Beam Background: meteor/rain/speed corridors.
- Interactive Grid Background: developer biome/effect preview surface.
- Wave Background: wind, water, and aurora flow.
- Quantum Field: gravity anomaly and late-space mechanic.
- Cyber Hive: optional technological/alien encounter family.
- Cosmic Singularity: final-gate or post-game set piece.
- Scroll Reveal: sparse area and progression reveals.
- Shiny Text: title or rare milestone emphasis only.

## 7. Biome kit contract

Every biome implementation supplies:

- palette;
- shared block/material variant;
- near/middle/far layers;
- one landmark;
- one primary and optional secondary ambient family;
- habitat-owned creature set;
- prop/object family;
- real mechanic telegraph;
- entry and exit transition;
- full, reduced-detail, and reduced-motion render paths.

## 8. First implementation slice

The first runtime slice should prove the system without touching every biome:

1. build a source manifest and extract a small cave/forest/UI subset;
2. create a nearest-neighbor sprite atlas with guarded procedural fallback;
3. add one shared edge-habitat renderer and one effect-director budget;
4. upgrade CAVES and THE FOREST while preserving their current physics;
5. connect leaves to real wind and preserve creature altitude ownership;
6. add a developer preview surface for layer/effect toggles;
7. test at minimum phone, tall phone, and landscape sizes;
8. compare final captures with `01-caves-vertical-slice.png` and
   `02-forest-wind-vertical-slice.png` before expanding upward.

Home, aurora, balloon, and space integration follows after the shared slice proves
clarity, performance, and fallback behavior.

