# Phase 1 — World Ladder + Continuous Sky — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 9-stage block-count ladder into the 11-stage continuous world (prepend CAVES + SURFACE, reorder TREETOPS before ROOFTOPS) and replace the discrete boundary-band sky swap with a sky that blends smoothly across every full stage.

**Architecture:** All stage data lives in the `TIERS` array and `SKY_STOPS` array in the inline `<script>` of `skystack/index.html`; `biomeTierAt`, `skyMapNodes`, campaign start heights, and unlock seeding all derive from `TIERS`, so extending it cascades automatically. The sky changes are localized to a new `stageFloat(A)` helper and a rewrite of `drawBiomeSky`; the structure/backdrop layer (`currentBiome` / `biomeBackdrop`) is deliberately left untouched — de-fading structures is Phase 2.

**Tech Stack:** Single-file vanilla JS + Canvas 2D. No build step, no deps. Tests: `node tests/headless.js` (custom `check()` runner in a `vm` sandbox). PWA cache in `sw.js`.

## Global Constraints

- Everything stays in `skystack/index.html` — no new files (except plan/spec docs), no build step, no dependencies.
- `node tests/headless.js` must print `N/N checks passed` with zero failures at every commit boundary.
- Bump the `sw.js` cache version when `index.html` ships changes (v34 → v35 this phase).
- Do not touch the structure/backdrop cross-fade (`currentBiome`, `biomeBackdrop`, `biomeWeather`, `wUp`/`wDn`) — that is Phase 2.
- Preserve `reduceMotion` handling and existing readability (nothing new in the play column).
- Region ladder order is fixed: `CAVES, SURFACE, TREETOPS, ROOFTOPS, CLOUD NINE, JET STREAM, STRATOSPHERE, AURORA, SPACE, ORBIT, THE STARS`.
- Thresholds (block count `n`): 6, 12, 22, 34, 55, 80, 105, 150, 200, 300, 500.

---

## File Structure

- `skystack/index.html` — modify `TIERS` (~line 485), `SKY_STOPS` (~1494), add `stageFloat` + rewrite `drawBiomeSky` (~1521), retune `atmoDark` (~1506).
- `skystack/tests/headless.js` — update TIERS/skyMap/biomeTierAt/campaign assertions; add `stageFloat` + `SKY_STOPS` length assertions; bump sw.js version check.
- `skystack/sw.js` — bump `CACHE` to `skystack-v35`.

---

### Task 1: The 11-stage ladder (data + all TIERS-derived tests)

Changing `TIERS` and `SKY_STOPS` together, plus every test that hard-codes the 9-stage shape, in one commit so the suite stays green. `biomeTierAt`, `skyMapNodes`, `levelStartN`, and unlock seeding are all data-derived and need no code edits.

**Files:**
- Modify: `skystack/index.html:485-495` (`TIERS`)
- Modify: `skystack/index.html:1494-1504` (`SKY_STOPS`)
- Test: `skystack/tests/headless.js:83-85, 90-93, 369-370, 396-399`

**Interfaces:**
- Consumes: nothing (foundational).
- Produces: `TIERS` = 11 objects `{ n:number, name:string, c:'#RRGGBB' }` in the fixed order; `SKY_STOPS` = 11 gradient-stop arrays, index-aligned to `TIERS`. Later tasks rely on `TIERS.length === 11` and `SKY_STOPS.length === 11`.

- [ ] **Step 1: Update the ladder tests to the 11-stage shape (expect red)**

In `skystack/tests/headless.js`, replace the two TIERS checks (lines 83-85):

```javascript
check('TIERS has 11 stages', () => fresh.run('TIERS.length === 11'));
check('TIERS names are the 11-stage continuous world', () => fresh.run(
  `JSON.stringify(TIERS.map(t=>t.name)) === JSON.stringify(['CAVES','SURFACE','TREETOPS','ROOFTOPS','CLOUD NINE','JET STREAM','STRATOSPHERE','AURORA','SPACE','ORBIT','THE STARS'])`));
```

Replace the skyMap count + spacing checks (lines 90-93):

```javascript
check('skyMapNodes: 11 pts + start + gate', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.length === 11 && L.start && L.gate; })()'));
check('skyMapNodes: badge rows evenly spaced in altitude', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.every((p,i) => (i===0 ? L.start.y - p.y === MAP_ROW : L.pts[i-1].y - p.y === MAP_ROW)) && L.gate.y === L.pts[10].y - MAP_ROW; })()'));
```

Replace the `biomeTierAt` mapping check (lines 369-370):

```javascript
check('biomeTierAt maps altitude to the SKY MAP stage', () => bio.run(
  'biomeTierAt(0) === 0 && biomeTierAt(5) === 0 && biomeTierAt(6) === 1 && biomeTierAt(12) === 2 && biomeTierAt(22) === 3 && biomeTierAt(149) === 7 && biomeTierAt(499) === 10 && biomeTierAt(9999) === 10'));
```

Retarget the campaign-tier check (lines 396-399) — AURORA is now index 7:

```javascript
check('a campaign level starts in its tier biome (level 8 -> AURORA band)', () => {
  const bl = makeGame({ 'skystack-height': '900' });   // everything unlocked
  bl.run('startLevel(7)');   // level 8 = AURORA (index 7)
  return bl.run('(() => { const A = blocks.length; const ti = TIERS.findIndex(t => A < t.n); return TIERS[ti].name === "AURORA"; })()');
});
```

- [ ] **Step 2: Run tests to verify the new assertions fail**

Run: `node tests/headless.js`
Expected: FAIL on `TIERS has 11 stages`, the names check, both skyMap checks, `biomeTierAt maps...`, and the campaign-tier check (code still has 9 stages).

- [ ] **Step 3: Replace `TIERS` with the 11-stage ladder**

In `skystack/index.html`, replace lines 485-495:

```javascript
const TIERS = [
  { n:6,   name:'CAVES',        c:'#7A8595' },
  { n:12,  name:'SURFACE',      c:'#8FD46A' },
  { n:22,  name:'TREETOPS',     c:'#62E8B5' },
  { n:34,  name:'ROOFTOPS',     c:'#FF9E5E' },
  { n:55,  name:'CLOUD NINE',   c:'#BFE8FF' },
  { n:80,  name:'JET STREAM',   c:'#5EC8F2' },
  { n:105, name:'STRATOSPHERE', c:'#C77EFF' },
  { n:150, name:'AURORA',       c:'#7EF2C5' },
  { n:200, name:'SPACE',        c:'#8FA8FF' },
  { n:300, name:'ORBIT',        c:'#FFD75E' },
  { n:500, name:'THE STARS',    c:'#FFF6E8' }
];
```

- [ ] **Step 4: Extend `SKY_STOPS` to 11 index-aligned entries**

In `skystack/index.html`, replace the `SKY_STOPS` array (lines 1494-1504). CAVES gets a dark-earth wash (walls will be drawn over it in Phase 3); SURFACE and ROOFTOPS are bright day, TREETOPS a green-horizoned afternoon between them:

```javascript
const SKY_STOPS = [
  [[0,'#241C22'],[0.5,'#3A2E33'],[1,'#5A4A48']],                                   // 0 CAVES        — dark earth (walls overpaint in P3)
  [[0,'#3E92DA'],[0.55,'#79BEEC'],[1,'#C6E9FB']],                                  // 1 SURFACE      — clear sunny day
  [[0,'#4A93D6'],[0.5,'#84C2E8'],[1,'#DCEFDE']],                                   // 2 TREETOPS     — green-horizon afternoon
  [[0,'#3E92DA'],[0.55,'#79BEEC'],[1,'#C6E9FB']],                                  // 3 ROOFTOPS     — bright day over the city
  [[0,'#6FB0E8'],[0.5,'#A6D2F2'],[1,'#EBF7FF']],                                   // 4 CLOUD NINE   — bright, sunlit high
  [[0,'#1C56AA'],[0.55,'#3E86D0'],[1,'#93C4EC']],                                  // 5 JET STREAM   — deep thin-air blue
  [[0,'#141A4E'],[0.42,'#5A3A86'],[0.7,'#C85E7A'],[0.87,'#F0904E'],[1,'#FFC46A']], // 6 STRATOSPHERE — sunset / golden hour
  [[0,'#04081C'],[0.6,'#08152A'],[1,'#0E2740']],                                   // 7 AURORA       — polar night
  [[0,'#03050F'],[1,'#080E26']],                                                   // 8 SPACE        — deep cosmos
  [[0,'#02040C'],[1,'#060B20']],                                                   // 9 ORBIT        — black, Earth below
  [[0,'#0A0620'],[1,'#150B2E']]                                                    // 10 THE STARS   — cosmic summit
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tests/headless.js`
Expected: all previously-failing checks now PASS; total `N/N checks passed`, zero failures.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/headless.js
git commit -m "feat(world): 11-stage continuous ladder (prepend caves+surface, treetops before rooftops)"
```

---

### Task 2: Continuous sky sampler + atmosphere retune

Replace the boundary-band sky blend with one that transitions across the full stage span, via a new `stageFloat(A)` helper; retune `atmoDark` for the new thresholds. Structures still use `currentBiome` (Phase 2 territory).

**Files:**
- Modify: `skystack/index.html:1506-1512` (`atmoDark`)
- Modify: `skystack/index.html:1521-1528` (add `stageFloat`, rewrite `drawBiomeSky`)
- Test: `skystack/tests/headless.js` (add a `stageFloat` check and a `SKY_STOPS` length check near line 379)

**Interfaces:**
- Consumes: `TIERS` (11 stages), `SKY_STOPS` (11 entries), existing globals `GROUND_Y`, `BH`, `H`, `clamp`, `skyWash`, `drawSun`.
- Produces: `stageFloat(A:number) -> number` in `[0, TIERS.length-1]`, monotonically non-decreasing in `A`; `drawBiomeSky(cy, h)` now sky-blends via `stageFloat`.

- [ ] **Step 1: Add the `stageFloat` + `SKY_STOPS`-length tests (expect red)**

In `skystack/tests/headless.js`, immediately after the `sky helpers exist ...` check (line 379), add:

```javascript
check('SKY_STOPS is index-aligned to the 11 stages', () => bio.run('SKY_STOPS.length === 11'));
check('stageFloat blends smoothly across whole stages', () => bio.run(
  'typeof stageFloat === "function" && stageFloat(0) === 0 && stageFloat(3) === 0.5 && stageFloat(6) === 1 && stageFloat(60) > stageFloat(40) && stageFloat(9999) === TIERS.length - 1'));
```

- [ ] **Step 2: Run tests to verify the `stageFloat` check fails**

Run: `node tests/headless.js`
Expected: FAIL on `stageFloat blends smoothly across whole stages` (`stageFloat is not defined`). The `SKY_STOPS is index-aligned` check already PASSES (Task 1 made it 11).

- [ ] **Step 3: Add `stageFloat` and rewrite `drawBiomeSky`**

In `skystack/index.html`, replace `drawBiomeSky` (lines 1521-1528) with the helper + rewrite:

```javascript
// altitude (in blocks) -> fractional stage index in [0, TIERS.length-1]. Unlike the old
// boundary-band blend, this ramps 0->1 across an ENTIRE stage span, so the sky is always in
// gentle transition and never hard-swaps between stages.
function stageFloat(A) {
  for (let i = 0; i < TIERS.length - 1; i++) {
    const up = TIERS[i].n, dn = i ? TIERS[i - 1].n : 0;
    if (A < up) return i + (A - dn) / (up - dn);
  }
  return TIERS.length - 1;
}
// the atmospheric backdrop gradient (+ sun): the base stage sky, with the next stage's sky
// washing in continuously as you climb through the stage — painted early so stars/clouds/
// structures sit on top.
function drawBiomeSky(cy, h) {
  const centerA = (GROUND_Y - cy - (H - 100)) / BH;
  const sf = clamp(stageFloat(centerA), 0, TIERS.length - 1);
  const i = Math.min(sf | 0, TIERS.length - 2), f = sf - i;
  skyWash(SKY_STOPS[i], 1);
  if (f > 0) skyWash(SKY_STOPS[i + 1], f);
  drawSun(h);
}
```

- [ ] **Step 4: Retune `atmoDark` for the new thresholds**

In `skystack/index.html`, replace `atmoDark` (lines 1506-1512). Day holds bright through ROOFTOPS(34); night ramps in toward SPACE. (Cave darkness is handled by wall overpaint in Phase 3, not here.)

```javascript
function atmoDark(h) {
  if (h < 34)  return 0.10;
  if (h < 55)  return 0.10 + (h - 34) / 21 * 0.13;
  if (h < 105) return 0.23 + (h - 55) / 50 * 0.42;
  if (h < 150) return 0.65 + (h - 105) / 45 * 0.28;
  return 0.95;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tests/headless.js`
Expected: `stageFloat blends smoothly across whole stages` PASSES; `atmoDark rises from a bright day to a dark space` (existing, line 382-383) still PASSES; `drawBiomeSky + drawSun render across the whole climb without throwing` (line 386) still PASSES; total `N/N checks passed`.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/headless.js
git commit -m "feat(sky): continuous whole-stage sky blend via stageFloat; retune atmoDark for new ladder"
```

---

### Task 3: Ship the phase — cache bump + full-suite gate

**Files:**
- Modify: `skystack/sw.js` (bump `CACHE`)
- Test: `skystack/tests/headless.js:404` (version assertion)

**Interfaces:**
- Consumes: nothing.
- Produces: `sw.js` cache `skystack-v35`.

- [ ] **Step 1: Update the version assertion (expect red)**

In `skystack/tests/headless.js`, line 404:

```javascript
check('sw.js cache bumped to v35', () => /const CACHE = 'skystack-v35'/.test(sw));
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `node tests/headless.js`
Expected: FAIL on `sw.js cache bumped to v35` (sw.js still says v34).

- [ ] **Step 3: Bump the service-worker cache**

In `skystack/sw.js`, change the cache constant:

```javascript
const CACHE = 'skystack-v35';
```

- [ ] **Step 4: Run the full suite green**

Run: `node tests/headless.js`
Expected: `N/N checks passed`, zero failures.

- [ ] **Step 5: Commit**

```bash
git add sw.js tests/headless.js
git commit -m "chore(pwa): bump service-worker cache to v35 for Phase 1 world ladder"
```

---

## Manual visual verification (Phase 1 review checkpoint)

Automated tests can't see the sky. After Task 3, open `skystack/index.html` in the in-app browser and confirm:
- The climb now begins at CAVES (dark) and reads SURFACE → TREETOPS → ROOFTOPS as you ascend (the ladder order is correct).
- The sky transitions are **smooth and continuous** through each stage — no hard color swap at boundaries.
- No regression: sun still rises/sets, HUD/stars still legible, no console errors.

Structures (buildings/trees/cave walls) are still the old faded per-tier art — that is expected; Phase 2 replaces them with the rooted, non-fading engine.

---

## Self-Review

**Spec coverage (Phase 1 scope only):** ✅ prepend CAVES+SURFACE (Task 1) · ✅ reorder TREETOPS↔ROOFTOPS (Task 1) · ✅ retune thresholds (Task 1) · ✅ `skyColorAt`/continuous sky = `stageFloat` + `drawBiomeSky` rewrite (Task 2) · ✅ retune `atmoDark` (Task 2) · ✅ tests green + cache bump (Task 3). Out of Phase 1 scope by design: structure de-fade (Phase 2), cave art (Phase 3), wildlife (Phase 4), intros (Phase 5), bases/map-rework (Phase 6), materials/hazards (Phase 7).

**Placeholder scan:** No TBD/TODO; every code step shows complete literal code.

**Type consistency:** `stageFloat` returns a number consumed by `drawBiomeSky` via `sf | 0` + `f`; `TIERS`/`SKY_STOPS` are both length 11 and index-aligned; `biomeTierAt` expected values match the thresholds (A=149→index 7 AURORA since 149<150; A=499→index 10 since 499<500). Campaign test uses `startLevel(7)` → pre-stacks to `levelStartN(7)=TIERS[6].n=105` → `findIndex(A<n)` at 105 → 105<150 → index 7 = AURORA. ✅
