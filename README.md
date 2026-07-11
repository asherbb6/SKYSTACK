# SKYSTACK

A pixel-art block-stacking game for mobile and web. One self-contained HTML file, zero dependencies, installable as a PWA with full offline support.

**Play:** live at [playskystack.netlify.app](https://playskystack.netlify.app), or deploy this repo to any static host and open `index.html` (Netlify / GitHub Pages both work as-is).

## Game

- **Stack blocks** — the block slides on its own; tap anywhere to drop it, center it for a PERFECT
- **4 modes** — ENDLESS, TIME 60, PURE (no power-ups, 1.5× points), DAILY (seeded run + streaks)
- **Skill ladder** — x7 BLAZING → x10 FEVER (2×) → x15 SUPERNOVA (3×)
- **12 skins**, 7 power-ups, missions, XP levels, achievements, coins
- **Revive** — one paid second chance per run (coins; cost scales with height) in ENDLESS, TIME and campaign levels — never in PURE or DAILY
- **SKY MAP** — a winding-trail level select: detailed floating islands (skylines, tree canopies, ice crystals, solar arrays…) that bob gently, per-stage weather (rain, snow, leaves, wind, dust), a parallax starfield + haze clouds, animated decorations (birds, balloons, plane, aurora, galaxy, moon, planet), numbered star badges, and a dotted path that glows gold up to your best height
- **Adaptive difficulty** — the pace and perfect-window quietly ease when you're struggling and tighten when you're chaining perfects, tuned by a personal skill estimate that learns across runs (ENDLESS / TIME / campaign only — PURE and DAILY stay pure)
- **Pause anytime** — top-left ❚❚ (or Escape); the run also auto-pauses when the app is backgrounded
- **Procedural chiptune** — calm menus, intense in-game, escalates with height and fever
- **10 seasonal events** — Christmas, Halloween, July 4th, Easter and more auto-activate for a 7-day window (holiday = middle day) from the device clock, each with its own UI colors, pixel decorations, free skin, themed music, and +25% coins
- **Biome-matched skies** — the in-game background changes per tier to match its SKY MAP stage: city towers at Rooftops, forest canopy at Treetops, clouds at Cloud Nine, contrails at Jet Stream, balloons at Stratosphere, aurora curtains at Aurora, and deep cosmic space with galaxies / satellites / ringed planets for Space, Orbit and The Stars (campaign levels start pre-stacked in their own biome)
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

- `index.html?event=christmas` — force any seasonal theme (ids: `newyear valentine stpatrick easter mothers fathers july4 halloween thanksgiving christmas`)
- `index.html?tour=1` — auto-cycle all 10 event themes, ~10 s each
- If an edit doesn't seem to load, unregister the service worker / clear site data (it caches for offline)

## Publishing checklist

1. **Host** — import this repo into Netlify (or enable GitHub Pages) → gives an HTTPS URL
2. **Android** — wrap the URL as a TWA with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), upload to Play Console ($25 one-time)
3. **Web portals** — optionally submit to Poki / CrazyGames for zero-cost distribution + ads
4. **Before adding ads/analytics** — update `privacy.html` first
5. **iOS** — Safari users can already Add to Home Screen; App Store wrapper later if Android proves out

© 2026 Asher Bowen. All rights reserved.
