# Past Tower History — design

Date: 2026-07-21 · Status: approved by Asher, ready for planning

## The problem

When a campaign level (or any checkpoint jump) starts above ground, `resetRun()`
pre-stacks the tower with `runLaunch` copies of a full-width, perfectly centred block
(`index.html:1666`). The player launches from a flawless factory column that has nothing to
do with how they actually got there. It reads as filler, and it wastes the best story the
game already owns: the tower the player really built.

## The idea

Replace the *appearance* of that pre-stack with the player's own recorded tower from the
levels they cleared, drawn as a darker, translucent "past". The player still starts on a
fresh, perfect slab, and the recorded shape never touches gameplay.

## Core rule — neutrality by construction

**`blocks[]` does not change.** It stays exactly what it is today: one full-width, centred
entry per altitude below the launch line. Altitude (`blocks.length`), `tier` selection,
scoring, `runLaunch` subtraction, objectives, and `nextPickupRow` are all untouched.

The recorded shape rides along as **render-only fields** on those same entries:

- `gx` — recorded left edge for that row
- `gw` — recorded width for that row
- `past: true` — marks the row as history
- the topmost pre-stacked row instead gets `slab: true`

No physics, collision, scoring, or objective code ever reads `gx`/`gw`/`past`. The solid
column the game simulates is still the perfect one; the player simply never sees it. This
makes "old blocks do not define new gameplay" a structural guarantee rather than a rule
someone has to remember.

Recorded widths are always `<= BASE_W` (blocks only ever shrink), so a ghost row can never
overhang the slab.

## Data — the record

New localStorage key `skystack-history`, read/written through the existing `store` helper.
Deliberately a **separate key** from `SAVE_KEY`, so it needs no save-schema bump and a
corrupt/absent history degrades to the current behaviour.

Shape:

```
{ v: 1, lv: { <levelIndex>: { a0: <startAltitude>, rows: [[x, w], ...] } } }
```

- Written in `levelComplete()` (`index.html:2119`) for the level just cleared.
- `rows` covers only the altitudes the player actually placed during that level:
  `levelStartA(lv) .. levelGoalA(lv) - 1`.
- `x` and `w` are rounded to whole pixels.
- **Latest clear overwrites** the previous record — the column is "your last journey", not
  your best one. (Alternative considered: keep the best-starred run. Rejected: the point is
  recency and honesty, including the ugly runs.)
- Ten levels of campaign is on the order of 600 rows, a few KB of JSON. Acceptable.
- Writes are wrapped so a quota failure never breaks a level win.

## Stitching

At `resetRun()`, for each pre-stacked altitude `i` in `0 .. runLaunch - 1`:

1. Find the level band containing altitude `i` (`TIER_LEVEL` / `LEVEL_BANDS`).
2. If `skystack-history` has a record for that level covering `i`, attach its `gx`/`gw`.
3. Otherwise leave `gx`/`gw` unset — that row falls back to the plain centred column.

Because the column is already dissolving with depth, unrecorded rows read as distance
rather than as missing data. No special-casing needed for a fresh save, a checkpoint the
player skipped to, or a level cleared before this feature shipped.

Scope: **any run that starts above ground** — campaign levels and checkpoint jumps alike.
Wherever the game pre-stacks today, it shows history instead.

## Rendering

A new draw pass in `renderWorld` (`index.html:5194`), before the real block loop so real
blocks always occlude the past.

- **Locked, never sways.** The past pass is drawn *outside* the
  `ctx.translate(swayX...)` at `index.html:5198`. The past does not lean with the tower —
  which also reinforces visually that it is not load-bearing.
- **Depth-graded memory fade.** Alpha and brightness both fall monotonically with depth
  below the seam: the topmost past band is clearly readable, the bottom dissolves into
  dark. Distance reads as time.
- **Biome tint retained.** Each row takes a desaturated hint of the colour its own biome
  would give it (`blockCol(i)` desaturated toward the dark), so the CAVES band and the
  GROUND band still read as different eras.
- **The seam.** The `slab: true` row draws as the fresh block: full width, clean, lit, with
  a thin bright line and a little settling dust beneath it. Above the seam is now; below is
  then.

### Naming conflict

`ghost` is already taken in `renderWorld` for the personal-best altitude line
(`index.html:5200`). This feature uses **`past`** throughout — `pastAlpha`, `drawPastColumn`,
`b.past` — never `ghost`.

## Descent glance

On entering a run that has any past rows, the camera opens looking down the past column and
lifts to the slab over roughly one second, easing out, before control is handed to the
player. Input is ignored until it settles, and it is skipped entirely when there are no past
rows (no glance at a plain column — that would advertise the filler).

## Level names down the column

At each past level boundary, a faint label of that level's name (`levelName`) is drawn
against the column, fading with the same depth curve as the blocks. It turns the column into
a readable map of the journey.

This is the one piece that touches the text layer, so it must satisfy the rules the wider
text/overlay audit will later apply: never overlap the slider, the mascot, the HUD, or the
seam label; and it hides itself rather than colliding when there is not room. Overlap
avoidance is a test, not a hope.

## Testing

Headless guards in `tests/`:

1. **Neutrality contract** — after a `resetRun()` at a launch altitude, every entry in
   `blocks[]` still has `w === BASE_W` and the centred `x`, regardless of what history says.
2. **Record span** — `levelComplete()` writes rows covering exactly
   `levelStartA(lv) .. levelGoalA(lv) - 1`.
3. **Overwrite** — replaying a cleared level replaces its record rather than appending.
4. **Fallback** — absent, empty, malformed, and partial history all reset cleanly and leave
   the plain column for the uncovered rows.
5. **Monotonic fade** — past alpha strictly decreases with depth below the seam.
6. **Locked past** — a nonzero `swayX` moves the real blocks and does not move the past
   column.
7. **Label safety** — level labels never overlap the seam, the HUD, or each other.

Guards must use a real recording ctx via `makeGame`'s `ctx2dOverride` — the default harness
ctx is `anyProxy()` whose `set` trap is a no-op, so overriding ctx methods inside
`fresh.run(...)` records nothing and the guard passes vacuously (v149 test trap).

## Out of scope

- A rival-ghost echo of a previous *endless* attempt (discussed, deferred — that is a
  different feature).
- Perfect-landing glints and drifting motes on the past column (nice, not now).
- The wider text/overlay/mission/pop-up audit, which is its own job after the biome art
  passes are done.
