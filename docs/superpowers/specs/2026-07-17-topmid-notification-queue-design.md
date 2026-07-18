# Top-Middle Notification Queue — Design Spec

Date: 2026-07-17
Status: approved by Asher (design approved via AskUserQuestion this session; spec review pending)

## Problem

In-run messages currently live in THREE zones: the banner/toast strip at NOTIFY_Y=74 (top-middle),
the 30px modifier strip at the screen bottom (`renderModifierHUD`, y = H-61/H-31), and the
tutorial hint strip flush with the bottom (H-29). Asher: reading the very bottom and the upper
middle at the same time is difficult — everything should pop up in ONE top-middle place, with
less clutter. (The bottom placement was v95's choice; playtesting has overruled it.)

## Approved design

### 1. One message lane, one message at a time

A single priority queue owns every transient in-run message. Exactly one note renders at a time,
in the existing `drawNotifyStrip` style, at NOTIFY_Y (top-middle, under the HUD). Nothing textual
ever appears at the bottom of the screen during play.

- API: `note(text, accent, pri, dur)` pushes `{text, accent, pri, dur}` onto a `notes` queue.
- Priorities: 3 = danger/interrupt (immediately replaces the current note), 2 = modifier and
  challenge transitions, 1 = progress banners (tier reached, SKYBREAK, SUPERNOVA, mission/
  achievement/challenge clear), 0 = flavor toasts. Equal priority = FIFO.
- Nothing ships at priority 3 today — it is the reserved slot for the upcoming hazard-balloon
  work (balance/steady warnings intentionally STAY in their existing HUD lane at y=55).
- Default dwell ~120 frames (2s) with the existing fade-in/out envelope; danger notes 150.
- Queue cap 6: when full, drop the oldest lowest-priority queued note (never the showing one).
- `resetRun()` clears the queue.

### 2. Persistent info becomes a chip, not a strip

The modifier's ongoing state (countdown / blocks left / safe-lane progress) is a compact chip
docked directly below the message lane: one 9px-tall mini-row — name + count ("GUST IN 3" /
"GUST - 4") + the existing 2px lane-progress bar underneath, drawn at ~60% the old strip's
footprint, centered. The gust wind tag arrows render inside the chip. The 30px bottom strip is
DELETED. Modifier status changes enqueue one-shot notes: announce ("UP NEXT: <name>"),
activate ("<name> - <rule>"), resolve ("<name> CLEAR +<coins>" / "<name> ENDED").

Wind indicator (y=62), combo lane (55), and balance warning stay where they are — they are HUD,
not notifications, and already live in the top column.

### 3. Tutorial hints share the same home

The practice/onboarding hint (currently a full-width bottom box, H-29) moves to the same
top-middle anchor as a two-line variant (title + compact body from the v92 phone copy). It is
step-gated, not timed: it renders in the lane whenever no queued note is showing, and yields to
any note. The bottom tutorial box is DELETED.

### 4. Clutter audit

While migrating each source, apply: a message ships only if it changes the player's next
decision or celebrates a rare milestone. Known outcomes:
- Tier banners, SKYBREAK, SUPERNOVA, challenge/mission/achievement clears: keep (rare, meaningful).
- Modifier persistent rule text: leaves the text layer entirely (chip owns it).
- Toasts that duplicate a floater already shown at the tower (e.g. power labels): cut the toast,
  keep the floater.
- Everything migrated keeps the compact-copy fallbacks from v96 (never wider than the screen).

## Code changes (index.html, sites as of v104 `f3a68a5`)

| Site | Change |
| --- | --- |
| globals ~1053/1068 | `bannerText/bannerT/toastMsg/toastT` → `notes` queue + `noteT` dwell state; `toast(m)` → `note(m, ...)` shim |
| all `bannerT = 1` sites (~1100, 1109, 1316, 1580, 1608, 1649-1654) | become `note(...)` calls with priorities per §1 |
| `update(dt)` ~2166/2173 | banner/toast timers → single queue tick (advance dwell, pop next) |
| render ~4115-4120 | draw current note only (single strip, no stacking offset) |
| `renderModifierHUD` ~5478 | rewrite as chip renderer at the lane's underside; delete the bottom strip geometry |
| tutorial strip ~5575 | delete bottom box; render two-line hint via the lane when idle |
| `relayout()` ~1837 | NOTIFY_Y unchanged (74); add chip row constant NOTIFY_CHIP_Y = NOTIFY_Y + 16 |
| `resetRun()` ~1386 | clear `notes`/`noteT` |

## Testing (`tests/headless.js`)

- Queue unit checks: priority interrupt, FIFO within priority, cap-6 drop policy, dwell expiry,
  resetRun clears.
- Source checks: no `fillRect(0, H-29` tutorial box, no `H-(tutStep>=0?61:31)` strip, no
  `bannerT` remnants.
- Re-point the v96 HUD overlap sweep at the single lane + chip row (they must not intersect each
  other or the HUD/wind/combo lanes).
- Modifier chip: announced/active states render within the chip bounds; wind tag inside chip.

## Out of scope (YAGNI)

- Notification history/log screen; sounds per priority; menu-screen toasts (unchanged).

## Deploy

sw.js CACHE → `skystack-v105`, matching test check, full suite green (~4min — background it),
push `main`, hand Asher `?fresh=105`.
