# v110 — Skin Animation Overhaul + Sky Map Level Cards (design)

Approved by Asher 2026-07-18 ("Sounds good. Proceed." — executing autonomously through deploy).
AskUserQuestion decisions: (1) skins = full redesign for the weak styles AND polish+contain for
the rest; (2) map = Extra Modes-style level cards over the themed sky; (3) islands/weather/
mascot/gate = miniatures INSIDE the cards.

## Part A — skin animations: hard containment + per-style work

### Containment rule (the point of the feature)
The entire per-skin surface-finish section of `drawBlock` (currently index.html:2370-2399) is
wrapped in ONE clip to the block's exact rect: `ctx.save(); ctx.beginPath();
ctx.rect(x,y,w,h); ctx.clip();` ... `ctx.restore()`. No skin effect can draw outside its block.
Known escapes this kills: gloss's unclipped travelling highlight (enters from x-9), ember's
rising spark at `y-1`.

The `glow` STYLE's outer halo (2354-2359, x-4..x+w+4) is REMOVED — its light moves inside the
block (neon-tube redesign below). The `glow > 0` PARAM flash at 2361 (power-up pickup feedback,
2px halo) is NOT a skin animation and stays as-is. The body shading/bevel section is untouched.

### Polished styles (identity kept)
- **gloss** (AURORA, OCEAN, PASTEL, BLOOM, HARVEST): sheen kept; travelling
  highlight now clipped, softened to a 3px core (alpha .14) with 1px feather each side
  (alpha .07), sweep speed ~tick*0.9.
- **stripe** (CANDY, ROYAL, CUPID, LIBERTY, MERRY): bands unchanged; its private clip is
  removed in favor of the shared section clip; band speed kept.
- **shimmer** (GOLD, PRISM): specular sweep kept (shared clip now); add a faint trailing
  second shine 6px behind the main bar (2px wide, alpha .18).

### Redesigned styles (the cheap-looking ones)
- **ember** (LAVA, SPOOKY): drop the L-shaped crack + above-block spark. New: two jagged
  horizontal magma veins (each 3 short segments stepping ±1px) at ~h/3 and ~2h/3, pulsing
  warm (hsl 24-46) with smooth sine alpha .35±.35; two ember sparks rise INSIDE the block
  (x from a per-block hash, y cycles bottom→top) and fade to alpha 0 across the top 3px so
  they extinguish before the edge.
- **facet** (JADE, SAKURA, LUCKY, STEEL): drop the thin vertical lines. New cut-gem look:
  a stepped light wedge from the top-left (white, alpha .10) and a stepped dark wedge from
  the bottom-right (black, alpha .12) forming diagonal facets; a glint pixel travels along
  the top bevel (alpha .5+.3·sin); one facet-intersection sparkle twinkles with sine alpha.
- **sparkle** (FROST, SPARKLE): drop the frame-chopped blink. New: frosted 1px inner rim
  (alpha .35) on all four edges; up to 3 cross-shaped (3x3) twinkles at hashed positions,
  each fading smoothly with `max(0, sin(tick*.07+phase))^2` — no more pop-in/pop-out.
- **glow** (NEON, VOID): outer halo removed. New neon tube: 1px inner outline on ALL FOUR
  edges pulsing smoothly (alpha .35±.35, sine ~tick*.12+y); a bright 2px "current" pixel with
  a 1px trail runs clockwise around the inner border (position = tick*1.2 mod perimeter).

### reduceMotion
Every style keeps a clean static variant: fixed mid-alpha, no travelling parts (highlight/
current/embers/twinkles pinned or omitted), veins/rims/wedges drawn at constant alpha.

All 22 skins (12 SKINS + 10 event) share these 7 styles, so every skin, the shop demo tower,
and the main-menu mini tower are covered by the same fix.

### Tests (Part A)
1. **Containment (behavioral, the keeper):** in the vm, stub ctx with a recorder tracking
   fillRect calls plus clip state (record `rect()` args at `clip()` time; `restore()` clears).
   Call `drawBlock` for each of the 7 styles at sizes 96x14, 40x10, 16x9, 6x5 across a tick
   sweep, `glow` param = 0. Assert every fillRect either lies fully inside the block rect or
   occurs under an active clip rect that is ⊆ the block rect.
2. **Source checks:** finish section wrapped in the shared clip; old ember `y - 1` spark gone;
   glow style's `x-4` halo gone.
3. Existing per-style smoke test (headless.js:666) keeps passing.

## Part B — Sky Map as level cards (Extra Modes style, but better)

### Geometry (`skyMapNodes` keeps its API shape)
Returns `{pts, start, gate, colX, colW, midX, viewTop, viewBot}` as today, same MAP_ROW=60
spacing and scroll math — but every `pts[i].x = midX` (cards are centered; the S-curve
`wv()`/`amp` weave goes away). Card width `colW = min(W-8, 300)` (unchanged), card height
CARD_H = 48, vertically centered on each pts[i].y. Order preserved: bottom-up (ground lowest,
gate highest) so drag-to-climb and the altitude sky mapping stay.

### Rendering (`renderSkyMap`)
KEEP the atmosphere: altitude sky gradient, nebulas, starfield, night veil, shooting stars,
side vignette, `drawMapDecor` ambience (birds/plane/moon — background scenery behind cards).
REMOVE: dotted trail, floating full-size islands, scattered labels, ground disc.
- **Stage card i** (Extra Modes row grammar): `pixelFrame(cardX, cardY, colW, CARD_H,
  selected ? uiA(.16) : 'rgba(17,17,25,0.88)', accent, selected)` with a 2px accent tick at
  the left edge (like PICK_ROWS). Accent = `TIERS[i].c` (dimmed when locked).
  - Left: a 30x30 clipped thumbnail — `drawIsland(i, ...)` + `drawStageWeather(i, ...)`
    drawn 1:1 inside the clip (bob kept, ±2px stays inside the box).
  - Title `'1. MEADOW'` in accent; right-aligned altitude `'90M'`.
  - Second line: 3 stars (drawStarPix) + status: `CLEARED` / `NEXT` (accent, gentle pulse) /
    `LOCKED` (dim, card content at ~45% alpha).
  - SELECTED card: second line becomes the checkpoint caption (v100 rule: `CLOUD CP - .75X`
    or `GROUND START - FULL SCORE`) + a PLAY pill inside the card's right side; second tap
    anywhere on the card launches (existing behavior).
- **Ground row:** small dim `GROUND` label row at `start` (no card).
- **Gate card:** final card — sealed: gold accent, `? ? ?` title, `SEALED - 3000M`; champion:
  `SKY CHAMPION`, `THE GATE IS OPEN`.
- **Mascot:** perches at the right edge of the card holding your best height (clipped to the
  card so it cannot overlap neighbors).
- **Header:** Extra Modes typography inside the existing MAP_HEAD bar: `SKY MAP` (size 2,
  shadow) + `CHOOSE YOUR PATH` subtitle; `STARS n/33` left; close X kept. Narrow screens keep
  the v100 yield rule (hint yields to stars label).
- Scrollbar kept.

### Input (`mapTapAt`)
Hit test becomes the full card rect (|dx| ≤ colW/2, |dy| ≤ CARD_H/2 around pts[i]) — bigger,
simpler targets. Locked card and gate tap → deny. Header/X closes. Drag scrolling unchanged.

### Tests (Part B)
1. Rewrite `skyMapNodes` trail-weave check → all pts centered on midX (`Set(xs).size === 1`).
2. Existing tap tests (select, launch, locked-deny, gate-deny, drag-guard) keep passing —
   pts are card centers, so their coordinates land on the cards.
3. Rewrite the map sweep (headless.js ~1370) for card geometry: across the v107 fixture
   shapes (180x390, 180x520, 242x300, 320x480, 569x320), every card, star row, and text sits
   inside `[0,W]x[viewTop,viewBot]`, no two cards overlap, header text fits.
4. Source checks: `wv(`/`amp` weave gone from skyMapNodes; card hit-test present.

## Ships as
v110: cache bump `skystack-v110` + matching test, full suite green on the exact tree, deploy,
`?fresh=110` link, vault close-out. Tuning knobs (CARD_H, thumbnail size, alphas) are plain
constants — one-line tunes.

## Out of scope
Base skins (rock pebble field — static, no animation), endless game-over screen, balloon
phase 2, hybrid checkpoint starts.
