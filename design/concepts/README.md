# Reactive World concept review set

Generated 2026-07-23 with the built-in Image Generation workflow. These files are
review and implementation targets, not runtime game assets.

## Review set

| File | Purpose |
| --- | --- |
| `00-home-progression.png` | Simplified home/progression hierarchy with one dominant action and a continuous-world preview |
| `01-caves-vertical-slice.png` | Edge-dense, center-clear cave composition with habitat-owned creatures and localized light |
| `02-forest-wind-vertical-slice.png` | Continuous surface/forest world with gust anticipation expressed by leaves, grass, and seeds |
| `03-aurora-balloon-vertical-slice.png` | World-height aurora folds, atmosphere-to-space continuity, and a distinct repair balloon side lane |
| `04-space-asteroid-vertical-slice.png` | Detailed Earth, bounded celestial depth, and a mechanically readable fixed asteroid-gravity warning |
| `05-reactive-world-asset-board.png` | Shared biome palettes, materials, silhouettes, fauna, atmosphere, telegraphs, objects, blocks, and UI |

## What the concepts approve as a direction

- SKYSTACK remains a pixel stacker, not a generic illustrated adventure game.
- The active block, tower edge, mascot, progress, and hazard tell remain the
  highest-contrast elements.
- Identifiable objects use crisp pixel sprites and integer scaling.
- Smooth fields, gradients, rays, and glow live behind the pixel layer and remain
  restrained.
- Detail collects at the screen edges and authored world landmarks. The central
  stacking corridor stays quiet.
- Creatures, balloons, particles, and hazards belong to authored altitude ranges
  and leave those ranges with the world.
- Every biome receives a material, depth, creature, ambient, telegraph, object,
  and block-edge vocabulary without changing the shared game language.

## Runtime corrections

The images intentionally explore the upper detail bound. Implementation should:

- reduce the concept blocks' gloss by roughly one third so cut geometry stays flat
  and unambiguous;
- reduce simultaneous ambient motion to one primary and one secondary family;
- avoid decorative props inside the live block corridor;
- retain the current compact HUD rather than copying every mockup pixel literally;
- use the generated Earth as a detail/scale target, not as a bitmap to ship;
- keep major celestial objects rarer than the asset board suggests;
- preserve reduced-motion and low-detail alternatives from the first slice.

## Review gate

No generated concept bitmap is intended to be shipped as-is. The next runtime step
is to extract a small verified subset from the licensed source archives, adapt it
to the canvas renderer, and reproduce this hierarchy natively. Production v183
remains unchanged until a separate release approval.

See:

- [`../../third_party/UPSTREAM_CATALOG.md`](../../third_party/UPSTREAM_CATALOG.md)
- [`../REACTIVE_WORLD_DESIGN_SYSTEM.md`](../REACTIVE_WORLD_DESIGN_SYSTEM.md)
- [`PROMPTS.md`](PROMPTS.md)

