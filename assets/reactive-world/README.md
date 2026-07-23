# Reactive-world runtime asset subset

This directory contains the small, reviewed subset loaded by the private
`overhaul/reactive-world` branch. It is not a bulk export of the source packs.

## Runtime contract

- All five PNG files are exact, unmodified archive entries from official Kenney
  releases.
- Every sheet is sampled with nearest-neighbor filtering at its original tile
  grid.
- The game retains procedural fallbacks; a missing or late image cannot block
  play or change simulation.
- Props stay in authored edge/habitat lanes and never own the stacking corridor.
- `manifest.json` records the source archive, internal archive path, extracted
  hash, dimensions, and intended role.

## Source and license

Kenney distributes these releases under Creative Commons CC0 1.0. The bundled
license is retained as `KENNEY-CC0-LICENSE.txt`; the untouched source archives,
official URLs, release versions, and original archive hashes remain in
`third_party/upstream/` and `third_party/UPSTREAM_CATALOG.md`.

## Adaptation map for the first slice

- Tiny Dungeon: cave ruins, torch/fire accents, sealed chests, and edge props.
- Pixel Platformer: shared forest-scale plants, mushrooms, and small wildlife.
- Farm Expansion: richer foreground flora and wind-reactive leaf shapes.
- UI Pack Pixel Adventure: reserved for the developer preview surface after the
  environment slice proves readable.
- Pixel Shmup: space hazard bodies plus compact power-up and repair-balloon
  cargo cores. Existing procedural marks remain guarded loading/offline fallbacks.

No generated concept bitmap is used as game art. The approved concepts remain
composition and hierarchy targets only.
