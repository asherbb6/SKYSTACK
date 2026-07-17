# SKYSTACK — Home/Shop/Me Dead Space, HUD Margins, In-Run Notification Placement (Design Spec)

**Date:** 2026-07-16
**Status:** Approved (design), pending implementation plan
**Baseline:** v93 (`ac8eb0f`), `index.html` ~5310 lines, single file; `tests/headless.js` — 397 tests green

## Goal

This is sub-project 1 of a larger UI/UX pass (Asher's four-part ask: layout fixes, notification
placement, a page-by-page audit, and a world-art fine-detail pass — sequenced in that order). This
spec covers only the first two: concrete, already-identified layout bugs, plus repositioning in-run
notifications so they stop overlapping gameplay. The page-by-page audit and world-art pass are
separate future specs.

No new features, no new screens, no mechanic changes. This is a presentation-layer tightening pass,
same category as v90-v93.

## What's wrong today (confirmed by live play at `?fresh=93` + source inspection)

1. **Dead space on Home, Shop, and Me.** Each screen's content renders as a fixed-size card/cards
   top-anchored under the nav header, then leaves ~300-400px of empty background before the bottom
   nav bar on a tall-phone viewport (403x956 tested). Confirmed on:
   - Home: gap between the Extra Modes/Sky Map buttons and the Climb Orders panel.
   - Shop (Characters tab): gap below the Run Boosts card.
   - Me (Progress tab): gap below the stats card.
   This is not a new feature gap — the cards were sized for a shorter/narrower reference viewport and
   never redistributed for taller ones.

2. **In-run HUD row sits edge-to-edge.** `index.html:5191-5193` draws `GROUND`/checkpoint name at
   `x=4` (left-aligned) and the score-multiplier at `x=W-4` (right-aligned) — a 4px margin, flush
   against the screen edge. Every other framed UI element (e.g. `MISS_PANEL` on Home) uses ~7px
   internal padding. This row is the outlier.

3. **In-run notifications overlap gameplay.** Two systems:
   - `bannerText`/`bannerT` (`index.html:1052`, drawn `~3867-3872`) — used for level-up, checkpoint
     entry, "SKYBREAK!", "SUPERNOVA! 3X", "CHALLENGE CLEAR!", etc. Drawn as bare centered text at a
     fixed `y=91` with no background, zero collision-awareness with the falling stack/slider below it.
   - `toastMsg`/`toastT` (`index.html:1067`, drawn `~3873-3876`) — used for Shop feedback
     ("EQUIPPED", "NOT AVAILABLE", etc.) and share/copy confirmations. Bare centered text at fixed
     `y=153`, same problem. (Toasts mostly fire from the Shop screen, not mid-run, but the run HUD
     tutorial-lesson box already reserves bottom-of-screen chrome space at `H-94`, so toast can safely
     share the same top-strip treatment as banner for the cases where it does appear during a run.)

## Confirmed decisions

| Topic | Decision |
|---|---|
| Dead space fix strategy | Increase spacing/padding between existing elements and vertically distribute the content block across the available room, rather than adding new content or features. |
| HUD margin | Bring the top run-HUD row's side margin in line with the ~7px convention used elsewhere (e.g. `MISS_PANEL`), replacing the 4px edge-flush values. |
| Notification placement | Give `bannerText` and `toastMsg` a dedicated boxed strip near the top of the screen (translucent background bar, matching the visual language of the existing tutorial-lesson box at `H-94`) instead of bare floating text over the play column. |
| Scope boundary | World art, camera, mechanics, save data, and economy are untouched. This spec is presentation-only, same class of change as v86-v93. |
| Screens in scope | Home, Shop (both tabs), Me (both tabs), in-run HUD banner/toast. Sky Map, Extra Modes, Challenges, win/fail overlays are NOT in scope here — they're part of the separate page-by-page audit (sub-project 3). |

## 1. Home/Shop/Me dead space

**Home** (`index.html:1867-1870`): `homeRoom` is already computed as available vertical space between
the Sky Map/Extra Modes buttons and the nav bar, and `MISS_PANEL`'s y-position already uses a fraction
of `homeRoom` (`homeRoom*.48`). The panel itself is fixed at `h:40`. Fix: increase the panel's height
and internal row spacing to consume more of `homeRoom` proportionally (e.g. scale row height and
gap-between-rows off `homeRoom` instead of a flat 10px-per-row), and re-derive `missY` so the panel
centers in the remaining space rather than sitting at a fixed 48% offset with slack below it.

**Shop** (Characters/Bases tabs): the character/base carousel card and Run Boosts card are both
fixed-height. Fix: add a computed bottom margin/centering so the two cards + their gap distribute
across the available height below the tab bar, same pattern as Home.

**Me** (Progress tab): the stats card is fixed-height. Fix: same distribution approach — either grow
the card's internal padding/row height, or center the card block in the available vertical space (or
both, whichever reads better once implemented — this is a visual judgment call to make and check
against the real viewport, not something to fully nail down in prose).

Implementation will need to actually render and eyeball each screen at the locked viewport set
(390x844, 1440x900, 960x540, 180x390) rather than compute this purely from constants, since "looks
intentional, not empty" is a visual criterion.

## 2. HUD margin

Change the left/right text anchors in the campaign-HUD block (`index.html:5191-5193`, currently
`x=4` / `x=W-4`) to a consistent ~7px margin. The coins/score header row above it (`~5182-5184`) is
already inset (coin+coins start at x=22, timer at `W-24`) and does not need this change. Separately
check the power-up icon row starting at `ix=4` (line 5206-5211) and decide whether it also needs the
larger margin or is fine as-is — icons carry their own visual weight against the edge differently than
bare text does, so this is a judgment call to make while looking at the rendered HUD, not a blind
find-replace.

## 3. Notification strip

Add a shared boxed-strip renderer for banner/toast, visually consistent with the tutorial-lesson box
(`rgba(11,14,26,0.62)` fill + a thin accent top border, per `index.html:5237-5238`). Position it near
the top of the screen, below the HUD rows but above the play column's usual action area — needs a real
on-screen check to find a y that never overlaps the falling stack at any tier/camera position. Both
`bannerText` and `toastMsg` render inside this strip (mutually exclusive display is fine — they rarely
fire simultaneously; if they can overlap, stack them or let banner take priority).

## Testing

- `node tests/headless.js` must stay green throughout; bump whatever version-locked checks reference
  the touched constants (e.g. `MISS_PANEL.h`, HUD margin values) the same way v93 updated the
  `h===36` check to `h===40`.
- Add/update headless checks asserting: HUD text margin ≥ 7px from each edge; notification strip never
  overlaps the reserved play-column bounds (there's already a `guard the top blocks` headroom
  calculation at `index.html:2925` this can reuse/reference).
- Manual QA at the locked viewport set (390x844, 1440x900, 960x540, 180x390) for Home, Shop, Me, and a
  live run triggering at least one banner (e.g. a tier-cross "M - name" banner) and one toast (Shop
  equip/purchase).
- Bump `sw.js` `CACHE` to the next version per the deploy rule; do not push `main` until tests pass and
  QA is done.

## Out of scope (future specs)

- Full page-by-page audit of Sky Map, Extra Modes, Challenges, win/fail overlays, achievement
  checkboxes, map badges, Me's PROGRESS-tab contrast (already flagged in the vault's `CURRENT_HANDOFF.md`).
- World-art fine-detail pass (grass/dirt/symmetry per biome) — explicitly deferred until after the
  audit, per Asher's sequencing decision (A+B → audit → world-art pass).
- App-store packaging (Google Play via PWABuilder/Capacitor) — separate track entirely.
