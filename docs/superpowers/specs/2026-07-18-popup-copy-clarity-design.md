# Pop-up Copy Clarity (v106) — Design

**Asher's ask (v105 verdict):** "better but can you change/make all of the pop-ups make sense?"
Clarified via AskUserQuestion: BOTH cut noise and rewrite survivors ("Both"); approved cuts =
modifier ENDED note + the separate name announcement ("Cut those two"); approved the copy system
below ("Yes, build it").

## The one rule

Every in-run message states its unit and its stake: what you got (`+N COINS`, `SCORE X3`) or
what to do and what it pays. No bare numbers, no unexplained flavor names in the message lane.

## Changes

### 1. Modifier arrival: one `BONUS:` pop-up (replaces name + rule pair)

`updateModifiersForPlacement` activation enqueues ONE pri-2 note, dur 140:
`'BONUS: ' + m.rule + ' +' + m.rewardCoins`. "BONUS" tells the player it's an optional coin
challenge, not a threat. The flavor name (STONE RHYTHM etc.) appears only on the chip.

Registry `rule` strings are rewritten to imperative, self-contained forms (mechanics untouched;
rule text is copy, per the v96 precedent):

| id | new rule | arrival note (worst width) |
|---|---|---|
| deep-rhythm | `3 PERFECTS IN A ROW` | `BONUS: 3 PERFECTS IN A ROW +5` |
| main-recovery | `FIX A CUT PERFECTLY` | `BONUS: FIX A CUT PERFECTLY +6` |
| surface-gold | `PERFECTS PAY EXTRA` | `BONUS: PERFECTS PAY EXTRA +5` |
| canopy-rhythm | `3 PERFECTS IN A ROW` | `BONUS: 3 PERFECTS IN A ROW +6` |
| lower-gust | `PLACE 7 IN THE WIND` | `BONUS: PLACE 7 IN THE WIND +7` |
| cloud-window | `5 IN THE CLEAR LANE` | `BONUS: 5 IN THE CLEAR LANE +7` |
| jet-gust | `PLACE 8 IN THE WIND` | `BONUS: PLACE 8 IN THE WIND +8` |
| thin-air | `MAX 1 MISS` | `BONUS: MAX 1 MISS +8` |
| aurora-recovery | `FIX A CUT PERFECTLY` | `BONUS: FIX A CUT PERFECTLY +8` |
| space-target | `HIT 2 GOLD TARGETS` | `BONUS: HIT 2 GOLD TARGETS +9` |
| orbit-control | `MAX 1 MISS` | `BONUS: MAX 1 MISS +10` |
| summit-precision | `4 PERFECTS IN A ROW` | `BONUS: 4 PERFECTS IN A ROW +12` |

Width: rules are ≤19 chars so the longest note is 31 chars (`BONUS: 4 PERFECTS IN A ROW +12`).
`drawNotifyStrip`'s v96 clamp guard handles the 180-wide extreme; if visual QA shows truncation
there, the fit fallback drops the `BONUS: ` prefix (rule + reward carry the meaning), not the
reward.

### 2. Modifier resolution

- Win: `BONUS WON +<paid> COINS` (pri 2, accent green). No flavor name needed — the chip that
  just vanished carried it.
- Loss/expiry: NO note (cut). The chip disappearing is the signal. `modifierResults` still
  records both outcomes; the v105 silent-skip rule is unchanged.

### 3. Chip gains units

`renderModifierHUD` text: active `NAME <n> LEFT`, announced `NAME IN <n> BLOCKS`.
Existing fit gate keeps working: if the long form exceeds `W-40`, fall back to the current
short forms (`NAME - n` / `NAME IN n`), then name-only. Mini-map lane bar unchanged.

### 4. Rewards name their currency

- `SUPERNOVA! 3X` → `SUPERNOVA! SCORE X3` (it is a 3x score state)
- `SKYBREAK! +50` → `SKYBREAK! +50 COINS`
- `CHALLENGE CLEAR! +30` → `CHALLENGE CLEAR! +30 COINS`
- Shop toasts `COLLECTION COMPLETE +N` → `COLLECTION! +N COINS` (fits 180-wide)

### 5. Tutorial COMBO lesson

`{ title:'COMBO', body:'10 STRAIGHT PERFECTS = FEVER', compact:'PERFECT STREAKS PAY MORE' }`.
Other lessons unchanged. The lesson-coverage test drops its SUPERNOVA word requirement
(supernova is taught by its own in-run note now).

### 6. Unchanged

Milestone banners (`99M - CAVES`, `LEVEL CLEAR - CAVES`, `SKY CONQUERED!`), all other menu
toasts (`EQUIPPED`, `NEED MORE COINS`, `COPIED!` …), queue mechanics (priorities, cap, dwell),
`modifierProgressText` (in-chip family progress copy already has units).

## Tests

- Rewrite `v96/v105 modifier activation` check → single `BONUS:` note pattern.
- Update the TUT_LESSONS coverage check (drop SUPERNOVA requirement).
- Registry contract check (`m.rule && …`) still passes — field kept, text changed.
- New v106 checks: activation note carries `BONUS:` + reward; no `' ENDED'` note in source;
  `SCORE X3` / `+50 COINS` / `CHALLENGE CLEAR! +` `COINS` literals present, bare `'SUPERNOVA! 3X'`
  / `'SKYBREAK! +50'` absent; chip renders `LEFT`/`IN n BLOCKS` forms with fit fallback.
- Cache lockstep: sw.js `skystack-v106` + matching test. Full suite green before push.
