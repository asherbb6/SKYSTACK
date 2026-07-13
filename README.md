# SKYSTACK

A pixel-art block-stacking game for mobile and web. One self-contained HTML file, zero dependencies, installable as a PWA with full offline support.

**Play:** live at [asherbb6.github.io/SKYSTACK](https://asherbb6.github.io/SKYSTACK/) (GitHub Pages, auto-deploys from `main`), or deploy this repo to any static host and open `index.html`.

## Game

- **Stack blocks** — the block slides on its own; tap anywhere to drop it, center it for a PERFECT
- **4 modes** — ENDLESS, TIME 60, PURE (no power-ups, 1.5× points), DAILY (seeded run + streaks)
- **Skill ladder** — x7 BLAZING → x10 FEVER (2×) → x15 SUPERNOVA (3×)
- **12 skins** — each a distinct finish: glossy plastic, satin candy stripes, molten lava with cracks + embers, cut-gem facets, twinkling frost, sweeping metallic gold, neon glow, rainbow prism… all 3-D shaded and animated. Plus 7 power-ups, missions, XP levels, achievements, coins
- **Revive** — one paid second chance per run (coins; cost scales with height) in ENDLESS, TIME and campaign levels — never in PURE or DAILY
- **SKY MAP** — a winding-trail level select: detailed floating islands (skylines, tree canopies, ice crystals, solar arrays…) that bob gently, per-stage weather (rain, snow, leaves, wind, dust), a parallax starfield + haze clouds, animated decorations (birds, balloons, plane, aurora, galaxy, moon, planet), numbered star badges, and a dotted path that glows gold up to your best height
- **Adaptive difficulty** — the pace and perfect-window quietly ease when you're struggling and tighten when you're chaining perfects, tuned by a personal skill estimate that learns across runs (ENDLESS / TIME / campaign only — PURE and DAILY stay pure)
- **Pause anytime** — top-left ❚❚ (or Escape); the run also auto-pauses when the app is backgrounded
- **Procedural chiptune** — calm menus, intense in-game, escalates with height and fever
- **10 seasonal events** — Christmas, Halloween, July 4th, Easter and more auto-activate for a 7-day window (holiday = middle day) from the device clock, each with its own UI colors, pixel decorations, free skin, themed music, and +25% coins
- **A real climb through the sky** — the background is a continuous atmospheric journey with a sun that rises white and sets orange: a **sunny blue day** on the ground → **fluffy sunlit clouds** → thin deep-blue high air → a **fiery sunset** → **aurora night** → **black starry space** → a huge **Earth limb from orbit** → a **golden cosmic gate** at the summit. `atmoDark` brings the stars and moon out with the night, not with a colour band.
- **A living underground** — the opening climb is a fully **procedural, animated earthy cave** (no image backdrops): layered dirt/cobble strata stamped from a cached rock texture, asymmetric walls that funnel up to an organic surface exit, warm flickering torches, hanging vines + roots + moss + mushrooms + wooden supports + cobwebs, crawling beetles/worms/bats, drips and dust, and a soft-lit escape hole that reveals the city progressively. Near foreground rock the tower passes **behind** for real depth — and any piece that would cover the tower fades locally (`fgAlpha`) so gameplay always stays readable. Layout is derived from the viewport (guaranteed play lane + tower-fitting exit) so it holds on phone, desktop and ultrawide.
- **Living biomes** — every tier is its own animated world with parallax depth: a **solid, asymmetric daytime city** (concrete + glass towers, sky-reflecting windows, water tanks, roof beacons), **real trees** (solid bark trunks, branches carrying connected 3-D-shaded canopy, a distant forest wall, falling leaves), drifting **cloud banks + sun shafts**, racing **wind streaks + a jet trailing a contrail**, rising **weather balloons + a signalling dish**, bold **aurora curtains, ice crystals + snow**, **colour nebulae, spiral galaxies, asteroids + meteors**, orbiting **satellites over the Earth**, and a **radiant gate with giant twinkling stars + a ringed planet**. The tower and falling block always stay readable, and it all respects reduced-motion. Campaign levels start pre-stacked in their own biome.
- **Fits any screen** — logical resolution matches the device aspect exactly (portrait, desktop, ultrawide) and re-adapts live on resize/rotate; on wide screens blocks travel a centered corridor with a pixel-fade wrap instead of crossing the whole screen

## Files

| File | Purpose |
|---|---|
| `index.html` | the entire game |
| `sw.js` | service worker (network-first shell, offline fallback) |
| `manifest.webmanifest` + icons | PWA install metadata |
| `privacy.html` | privacy policy (required for store listings) |
| `gen-icons.js` | dependency-free Node script that regenerates the PNG icons |

## Development

Serve the folder from any static server, e.g. `npx http-server -p 8460 -c-1`.

- **Tests** — `node tests/headless.js` stubs the browser, evals the game in a `vm`, and drives internal functions (campaign/level system, SKY MAP, biome + cave renderers, foreground-occlusion fade, layout guarantees). Run it before every commit; it also asserts `sw.js` is version-bumped.

- `index.html?event=christmas` — force any seasonal theme (ids: `newyear valentine stpatrick easter mothers fathers july4 halloween thanksgiving christmas`)
- `index.html?tour=1` — auto-cycle all 10 event themes, ~10 s each
- If an edit doesn't seem to load, unregister the service worker / clear site data (it caches for offline)

## Publishing checklist

1. **Host** — GitHub Pages serves `main` at `/ (root)` and auto-deploys on push → [asherbb6.github.io/SKYSTACK](https://asherbb6.github.io/SKYSTACK/) (any static host works too)
2. **Android** — wrap the URL as a TWA with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), upload to Play Console ($25 one-time)
3. **Web portals** — optionally submit to Poki / CrazyGames for zero-cost distribution + ads
4. **Before adding ads/analytics** — update `privacy.html` first
5. **iOS** — Safari users can already Add to Home Screen; App Store wrapper later if Android proves out

© 2026 Asher Bowen. All rights reserved.
