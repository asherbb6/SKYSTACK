# SKYSTACK upstream asset and component catalog

This directory is the reproducible source library for the reactive-world overhaul.
It is deliberately separate from runtime game assets.

- `third_party/upstream/` contains untouched source archives or exact upstream files.
- Nothing in this directory is loaded by the game.
- Runtime-ready subsets will be extracted, renamed, pixel-normalized, and documented
  only after the corresponding visual direction is approved.
- The production `main` branch and v183 deployment remain untouched while this work
  is developed on `overhaul/reactive-world`.

## Acquisition policy

Only assets with an explicit reusable license are eligible to ship. Free and
permissive sources are preferred. Purchases, credentials, unclear terms, and
restrictive licenses require separate approval. User-supplied code with unknown
provenance is cataloged as a quarantined reference and is not copied into this
public repository.

## Kenney CC0 pixel library

The source archives below were downloaded from the official Kenney asset pages on
2026-07-23. Each directory retains the archive's bundled `License.txt` and, when
provided, the official `Preview.png`.

| Source | Local archive | SHA-256 | Bundled version | Planned SKYSTACK use |
| --- | --- | --- | --- | --- |
| [Pixel Platformer](https://kenney.nl/assets/pixel-platformer) | `upstream/kenney/pixel-platformer/pixel-platformer.zip` | `D01A196DBE3CC964E00D83BA3B987DF62F332DC9260C9F941B4FBCC9047130F4` | 1.2 | Coherent 18 px foundation for surface, forest, clouds, traversal props, and creatures |
| [Pixel Platformer Farm Expansion](https://kenney.nl/assets/pixel-platformer-farm-expansion) | `upstream/kenney/pixel-platformer-farm-expansion/pixel-platformer-farm-expansion.zip` | `72C5EE0DDA3DFA1B95FF25C74A7FF6878E58851276A7766551218CBD55DA6D61` | 1.0 | Field, farm, treetop, village, balloon cargo, and grounded wildlife details |
| [Pixel Platformer Industrial Expansion](https://kenney.nl/assets/pixel-platformer-industrial-expansion) | `upstream/kenney/pixel-platformer-industrial-expansion/pixel-platformer-industrial-expansion.zip` | `C46E8FEE3528434D1680D50A2373C77EB33B1D5DB5C7B000D495EDECC854FD3E` | 1.0 | Upper-atmosphere machinery, orbital stations, gates, warning fixtures, and admin/test styling |
| [UI Pack: Pixel Adventure](https://kenney.nl/assets/ui-pack-pixel-adventure) | `upstream/kenney/ui-pack-pixel-adventure/ui-pack-pixel-adventure.zip` | `0B0ED4802EBCFFF5E44E370F394BAA1D751862A5A4A7612AC4CE84E85FAA0627` | 2.0 | Buttons, compact panels, meters, icons, focus states, progression, pause, and admin UI |
| [Pixel Shmup](https://kenney.nl/assets/pixel-shmup) | `upstream/kenney/pixel-shmup/pixel-shmup.zip` | `E33FD626B799DE343F18C81EBAA6F3BC161772FDD717ACF3F223589CE74CF952` | 1.1 | Space craft, asteroids, hazards, projectiles, warnings, pickups, and orbital debris |
| [Particle Pack](https://kenney.nl/assets/particle-pack) | `upstream/kenney/particle-pack/particle-pack.zip` | `B631D4B07F7002549FDCF155F01141AD482F79F3440E4E301EED49CE5F1D8958` | 1.1 | Selectively resampled burst, impact, sparkle, thrust, aurora, wind, and transition effects |
| [Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) | `upstream/kenney/tiny-dungeon/tiny-dungeon.zip` | `C109438AB06F65FD80F9B2686A4CF9C7C11DC64444B47333EC71D602F8BB5FC7` | 1.0 | Cave, deep-earth, ruins, minerals, underground creatures, and environmental storytelling |
| [Kenney Fonts](https://kenney.nl/assets/kenney-fonts) | `upstream/kenney/kenney-fonts/kenney-fonts.zip` | `4E69A86EEF3CD47E9D8207413868CD08BCDDEB2DAE4047DBD10362E2A7A16BAC` | CC0 release | Readable pixel-compatible display and interface typography experiments |

All eight archives are distributed under Creative Commons CC0. Attribution is not
required, but SKYSTACK will retain this catalog and the bundled license text for
traceability.

## Magic UI source snapshot

- Official repository: <https://github.com/magicuidesign/magicui>
- Snapshot commit: `8e5e9eb7c2a7e7ac1440f413b847d7ddb9c67e0a`
- License: MIT, retained at
  `upstream/magic-ui/8e5e9eb7c2a7e7ac1440f413b847d7ddb9c67e0a/LICENSE.md`
- License SHA-256:
  `0147B84235ED916B8B4E89C1F80655351C5AFE7D211B629BE61F553A227B34BA`

Exact upstream component files retained:

- `particles.tsx`
- `meteors.tsx`
- `shine-border.tsx`
- `number-ticker.tsx`
- `light-rays.tsx`
- `aurora-text.tsx`
- `flickering-grid.tsx`
- `animated-grid-pattern.tsx`

Planned use is selective translation into the existing canvas game's own rendering
model: ambient particles, readable counters, restrained focus borders, biome-aware
light rays, aurora accents, and low-density grids for admin/orbital surfaces. These
files are reference source, not a commitment to add React or Tailwind to SKYSTACK.

## React Bits source snapshot

- Official repository: <https://github.com/DavidHDev/react-bits>
- Snapshot commit: `67140d35c5c07b9f2295784a57cdc387ac9df68e`
- License: MIT with Commons Clause, retained at
  `upstream/react-bits/67140d35c5c07b9f2295784a57cdc387ac9df68e/LICENSE.md`
- License SHA-256:
  `CE48406452C86D16998612D3D3B6EE54F5D6A6BB0941348785436EE866F625B5`

Exact upstream JSX/CSS files retained for:

- Pixel Snow
- Galaxy
- Waves
- Letter Glitch
- Faulty Terminal
- Dither
- Prismatic Burst

These components are secondary references because several introduce WebGL or other
dependencies and their Commons Clause forbids selling the component library itself.
Possible uses are pixel-weather depth, starfield motion, ocean/aurora flow, brief
glitch feedback, retro-display treatments, and high-impact transitions. Any runtime
port must be small, dependency-reviewed, performance-tested, and visually reconciled
with the game's pixel language.

## Quarantined user-supplied component references

The following ten component source files were supplied directly by the user before
the itch.io image libraries. Their ideas remain part of the overhaul. Their source
and license provenance are not yet verified, so raw contents are intentionally not
committed to this public repository and must not ship until verification succeeds.
Attachment IDs and hashes preserve an exact audit trail.

| Reference | Attachment ID | Bytes | SHA-256 | Intended evaluation |
| --- | --- | ---: | --- | --- |
| Beam Grid Background | `953ecbe7-ba91-4732-9ede-fa5ac8af34ad` | 14,373 | `6A18768F7770C6C78B5EAB28297F25436628F09EA75ECB4FFA1D301DB7DC1584` | Orbital/admin grid, targeting lanes, hazard telegraphs |
| Dot Grid Background | `2ef09fff-8da8-4190-9e79-bcd53ee73323` | 10,866 | `D61023D6DB256BE1D6EB58ECB8C2416C8BC14CCFD7196A0633595A008DC68CD4` | Interactive menus, constellation map, test mode |
| Fall Beam Background | `150b09cf-1a80-40e9-bd3a-848cf0e70f88` | 8,509 | `9617FA51BB1696CB98B8777E3AA1627671C02E47C7AEE2EE9F2418ED6C91BBD8` | Rain, meteor lanes, speed and phase transitions |
| Interactive Grid Background | `024b214a-7b02-43cb-a9c2-4a1227f976f9` | 10,431 | `C0547C39A870C912DBC8546E87C1121E9BA259929807000E9F0FDC33C7D17253` | Admin tools, level-select map, reactive orbital panels |
| Wave Background | `857d7011-3c4b-4951-b312-b34a5b02d14e` | 12,630 | `D2BFD44B8AF0F8D398245FA45DBDC745641408F13C76C6A601D366A910F1732E` | Water, wind, aurora, atmosphere, and biome flow |
| Quantum Field | `6a6d9d6a-23a9-4696-8030-b1307d02fd65` | 14,521 | `F5AAE4C6DCD7D472A7DF21E67240010134C7EC8D742B347A1342E935E27E81C0` | Deep-space field, gravity anomaly, late-game challenge |
| Cyber Hive | `92927348-7c8b-4787-89c3-915403afdeb2` | 14,833 | `32E874AE01E6CA19C12955523D337B8F20DDD373B8E71089B68133339FCD2CF5` | Alien/technology biome and boss-arena surface |
| Cosmic Singularity | `95b709b0-dad0-4ceb-a3db-7c8d8837cdf2` | 18,358 | `0FE5B3A6CB5AA8CFC79B2E2ABF08896B7B75A30FB9542708ECD1A8972C33E821` | Black-hole phase, star gate, finale, title spectacle |
| Scroll Reveal | `d8ae6d90-0d00-456f-8021-1ea5edd4976a` | 8,665 | `FA47F980F09B7BB02889B6873B73908DF4634EF2EFF2394F0DF10885EAB44415` | Sparse phase labels, progression reveals, credits |
| Shiny Text | `76243395-18d1-49a5-9732-60b1e8063f84` | 9,068 | `8CF10B93E989A58B3866635D7F9ED51244AFB321B249D26E0936CE657ED46818` | Title, rare rewards, milestone emphasis |

Licensed upstream equivalents and original in-house canvas implementations should be
preferred wherever they can achieve the same behavior. This preserves the user's
ideas without assuming that unverified code is safe to redistribute.

## Next extraction gate

Before a file moves from this library into runtime:

1. Select it for an approved full-screen game concept.
2. Extract only the required files, keeping original pixel dimensions.
3. Record source archive, internal path, modifications, palette role, biome, and
   runtime destination.
4. Verify nearest-neighbor rendering, mobile readability, reduced motion, and load
   cost.
5. Test the resulting game behavior independently from the decorative layer.
