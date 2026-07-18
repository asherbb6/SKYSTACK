# v111 — Sky Map Postcard Thumbnails + Backdrop + Professional Polish (design)

Asher's v110 verdict: "This is wayyy better" + three asks, then "Proceed with your plans,
I'll be back in an hour" — design calls below are mine, documented for his review:
1. improve the background behind the cards;
2. thumbnails become a "picture look / environment look" (not floating islands on a dark box);
3. buttons/spacing/alignment/detail/professionalism; nothing may overlap — ESPECIALLY the
   PLAY button on a selected card.

## 1. Environment-postcard thumbnails

The 32px dark box + scaled floating island becomes a framed PORTRAIT WINDOW (thW 32 × thH 38)
showing the stage's actual environment — comment marker `environment postcard`:
- **Sky**: horizontal bands sampled from `skyColor()` across the tier's real altitude range
  (top band = tier altitude, fading toward the previous tier below), so every card window
  carries its true in-game sky.
- **Stars**: for tiers above the starfield threshold (blocks > 90), 3 hashed white star
  pixels in the window's sky.
- **Terrain**: `drawIsland(k)` scaled 0.55 (up from 0.32), anchored so its SURFACE line sits
  at ~72% of the window height and its 104px native width overfills the 32px window — it
  reads as ground/scenery (cave mouth, meadow, trees, mesa, ice shards...) instead of a
  floating island. Cloud tiers (3/4/5) get their cloud bank low in the frame = cloudscape.
  `drawStageWeather` still drawn in the same transform.
- **Frame**: 1px dark inset + 1px light inner border (`rgba(255,246,232,0.18)`) — a picture
  frame, giving the "postcard" read.
- **Gate card**: sealed door now sits on a starry night-sky window (not flat dark); champion
  shows the golden-dais scene via the same postcard path (tier 10).

## 2. Background behind the cards

Keep the themed altitude sky, starfield, nebulas, veil, decor. Add:
- **Column panel**: a translucent dark band behind the whole card stack (`colX-6`, width
  `colW+12`, full viewport height, `rgba(7,8,15,0.30)`) with 1px edge lines — the cards sit
  on a consistent rail surface instead of floating over raw sky. Marker: `column panel`.
- **Progress rail**: a 2px vertical rail aligned with the cards' accent ticks (x = colX+4),
  drawn from GROUND to the gate BEFORE the cards, so it shows in the 10px gaps and stitches
  the list together — GOLD from ground up to the NEXT card (your progress), dim above.
  Marker: `progress rail`. This restores the old trail's walked-gold meaning in the card
  grammar.

## 3. Professional layout pass (cards + buttons)

- **Rhythm**: `MAP_ROW` 60 → **64**, `MAP_CARD_H` 48 → **54** (10px gaps kept). Every card
  line gets breathing room; scroll math self-adjusts (contentH = (n+2)*MAP_ROW).
- **Card grid**: thumbnail x cx2+10 (thW 32, thH 38, y cy2+8); text left margin tx0 =
  cx2+48; right margin txR = cx2+cw2-7. Line 1 (title / altitude) at cy2+11; line 2
  (stars + status, or the selected caption) at cy2+27; stars aligned to the same 27 baseline.
- **PLAY button (the overlap fix)**: selected card gets a DEDICATED bottom band — plate3D at
  y = cy2 + MAP_CARD_H - 17 (h 12, w 44, right-aligned at cw2-6-44), accent = stage color,
  label centered. Caption (line 2, y+27..34) and PLAY band (y+37..49) can no longer collide
  with each other or the frame: separate vertical bands by construction.
- **Mascot**: perches ON TOP of its card (anchor cy2 → sprite occupies the gap above), right
  side; still skipped while that card is selected. No text can collide (gap is sprite-only).
- **Close button**: the header X becomes a proper pixelFrame button (same 13px hit box).
- **GROUND** row label unchanged (small, dim, centered).

## Tests

1. Existing gates keep running: v100 text sweep (4 shapes), v110 card-bounds sweep + centered
   pts + hit tests (MAP_CARD_H symbol — they adapt to 54 automatically; the inter-card
   empty-tap gap stays ≥10px: midpoint is 32 from centers vs 27 half-card).
2. NEW v111 selected-card component check: instrument `txt` AND `plate3D`; for a selected
   fixture at [180,320,480]px widths assert the PLAY plate rect (a) sits fully inside its
   card rect and (b) intersects NO text glyph box. This is the "especially the play button"
   guarantee.
3. NEW source checks: `environment postcard`, `column panel`, `progress rail` markers;
   `MAP_ROW = 64` and `MAP_CARD_H = 54`; old flat `rgba(0,0,0,0.22)` thumb fill gone from the
   card path.
4. Suite green on the exact tree; cache bump `skystack-v111` with matching test.

## Ships as
v111: deploy + `?fresh=111` + vault close-out (decision #58).

## Out of scope
Header typography beyond the X button; endless game-over screen; hybrid checkpoint starts.
