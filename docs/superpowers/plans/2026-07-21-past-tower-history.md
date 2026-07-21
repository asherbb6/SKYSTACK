# Past Tower History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the appearance of the perfect pre-stacked launch column with the player's own recorded tower, depth-faded as "the past", under a fresh perfect slab — without letting any of it touch gameplay.

**Architecture:** The physics column `blocks[]` is left byte-for-byte as it is today. Recorded geometry rides on those same entries as render-only fields (`gx`, `gw`, `past`, `slab`) that nothing outside the renderer reads. A new `drawPastColumn(cy)` pass draws the past *outside* the `swayX` translate so it never leans, and the main block loop skips `past` rows. History lives in its own localStorage key so no save-schema bump is needed.

**Tech Stack:** Single-file vanilla-JS canvas game (`index.html`), node headless suite (`tests/headless.js`), no build step, no dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-past-tower-history-design.md`.
- **Neutrality contract:** no code outside the render path may read `gx`, `gw`, `past`, or `slab`. Every entry in `blocks[]` keeps `w === BASE_W` and the centred `x` at reset.
- **Naming:** use `past` throughout. `ghost` is already the personal-best altitude line (`index.html:5200`) — never reuse it.
- Storage key: `skystack-history`, accessed only through the existing `store.get/set` helper (`index.html:178`).
- Record span for level `lv`: altitudes `levelStartA(lv) .. levelGoalA(lv) - 1`.
- The past column never moves with `swayX`.
- Past alpha decreases monotonically with depth below the seam.
- Run the suite from the repo root: `cd /e/Projects/SKYSTACK && node tests/headless.js`. It takes ~4 minutes under load — raise the timeout or background it. Baseline before this work: **663/663**.
- **Test trap:** the default harness ctx is `anyProxy()` whose `set` trap is a no-op. Any guard that inspects draw calls MUST use a real recording ctx via `makeGame`'s `ctx2dOverride` — the `v149rec()` pattern at `tests/headless.js:3195`. Overriding ctx methods inside `fresh.run(...)` records nothing and passes vacuously.
- **Perf trap:** never write a source guard as one regex with two bounded `[\s\S]{0,N}` wildcards over the 6800-line source — it backtracks catastrophically and hangs the suite. Use `src.includes(...)` / `indexOf`.

---

### Task 1: History storage and recording

**Files:**
- Modify: `index.html` — new block after `blockCol` (`index.html:1646`); call site in `levelComplete` (`index.html:2119`)
- Test: `tests/headless.js`

**Interfaces:**
- Produces: `PAST_KEY` (string constant), `loadPastHistory()` → `{v:1, lv:{}}`, `recordPastRun(lv)` → `void`, `pastRowsForLaunch(launch)` → `Array<{gx,gw}|null>` of length `launch`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/headless.js`, just before the results summary block:

```js
// ---------- v152 past tower history ----------
check('v152 recordPastRun stores exactly the level span', () => {
  const g = makeGame();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 7 + blocks.length, w: 40, col:"#fff"});');
  g.run('recordPastRun(0)');
  const h = JSON.parse(g.run('JSON.stringify(loadPastHistory())'));
  const rec = h.lv['0'];
  if (!rec) return 'no record written';
  const want = g.run('levelGoalA(0) - levelStartA(0)');
  return rec.a0 === g.run('levelStartA(0)') && rec.rows.length === want
    ? true : 'a0=' + rec.a0 + ' rows=' + rec.rows.length + ' want=' + want;
});
check('v152 replaying a level overwrites its record, never appends', () => {
  const g = makeGame();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 5, w: 40, col:"#fff"});');
  g.run('recordPastRun(0)');
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 9, w: 22, col:"#fff"});');
  g.run('recordPastRun(0)');
  const rec = JSON.parse(g.run('JSON.stringify(loadPastHistory())')).lv['0'];
  const want = g.run('levelGoalA(0) - levelStartA(0)');
  return rec.rows.length === want && rec.rows[1][1] === 22
    ? true : 'rows=' + rec.rows.length + ' w=' + rec.rows[1][1];
});
check('v152 pastRowsForLaunch stitches history and leaves gaps null', () => {
  const g = makeGame();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 11, w: 33, col:"#fff"});');
  g.run('recordPastRun(0)');
  const out = JSON.parse(g.run('JSON.stringify(pastRowsForLaunch(levelGoalA(0) + 6))'));
  const goal = g.run('levelGoalA(0)');
  const covered = out.slice(g.run('levelStartA(0)'), goal);
  return out.length === goal + 6 && covered.every(r => r && r.gw === 33)
    && out.slice(goal).every(r => r === null)
    ? true : 'covered=' + covered.filter(Boolean).length + ' tail=' + JSON.stringify(out.slice(goal));
});
check('v152 malformed history degrades to no past rows (never throws)', () => {
  const g = makeGame({ 'skystack-save': JSON.stringify({ v: 2, data: { 'skystack-history': 'garbage' } }) });
  const out = JSON.parse(g.run('JSON.stringify(pastRowsForLaunch(12))'));
  return out.length === 12 && out.every(r => r === null) ? true : JSON.stringify(out);
});
check('v152 a level win records the run', () => {
  const g = makeGame();
  g.run('startLevel(0)');
  g.run('score=500; while (blocks.length < levelGoalA(0)) blocks.push({x:0,w:96,col:"#fff"});');
  g.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
  if (g.run('state') !== 'levelwin') return 'level did not win';
  const rec = JSON.parse(g.run('JSON.stringify(loadPastHistory())')).lv['0'];
  return rec && rec.rows.length > 0 ? true : 'no record after win';
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep v152`
Expected: five FAIL lines, `THREW: loadPastHistory is not defined`.

- [ ] **Step 3: Implement**

Insert into `index.html` immediately after the `blockCol` line (`index.html:1646`):

```js
// ---------- v152: THE PAST TOWER ----------
// Every campaign level pre-stacks a perfect, centred column to the level's start altitude. It is
// REAL (v133 draws it) but it is not YOURS — it says nothing about the climb you actually made.
// We record the shape you really built and replay it under you as a faded past.
// NEUTRALITY IS STRUCTURAL: the recorded shape rides on the same blocks[] entries as RENDER-ONLY
// fields (gx/gw/past/slab). blocks[i].x and .w stay full-width and centred, so altitude, tier,
// scoring, objectives and pickups are mathematically identical to before this feature. Nothing
// outside the render path may ever read gx/gw — that is what makes "your old blocks cannot define
// your new level" a property of the code rather than a rule someone has to remember.
const PAST_KEY = 'skystack-history';
function loadPastHistory() {
  const h = store.get(PAST_KEY, null);
  if (!h || typeof h !== 'object' || Array.isArray(h) || h.v !== 1) return { v: 1, lv: {} };
  return (h.lv && typeof h.lv === 'object' && !Array.isArray(h.lv)) ? h : { v: 1, lv: {} };
}
// Called on a level win. Stores only the rows the player placed inside that level's own band.
function recordPastRun(lv) {
  if (!(lv >= 0)) return;
  const a0 = levelStartA(lv), a1 = levelGoalA(lv), rows = [];
  for (let i = a0; i < a1; i++) {
    const b = blocks[i];
    if (!b) break;
    rows.push([Math.round(b.x), Math.round(b.w)]);
  }
  if (!rows.length) return;
  const h = loadPastHistory();
  h.lv[lv] = { a0, rows };   // latest clear WINS — the column is your last journey, not your best one
  store.set(PAST_KEY, h);
}
// Stitch every recorded level into one bottom-up array covering altitudes 0..launch-1.
// Uncovered altitudes stay null and fall back to the plain centred column at draw time; because
// the column is already dissolving with depth, a gap reads as distance, not as missing data.
function pastRowsForLaunch(launch) {
  const out = new Array(Math.max(0, launch | 0)).fill(null);
  const h = loadPastHistory();
  for (const k in h.lv) {
    const rec = h.lv[k];
    if (!rec || !Array.isArray(rec.rows)) continue;
    const a0 = rec.a0 | 0;
    for (let j = 0; j < rec.rows.length; j++) {
      const a = a0 + j, r = rec.rows[j];
      if (a < 0 || a >= out.length || !Array.isArray(r)) continue;
      const gw = Math.round(r[1]);
      if (!(gw > 0)) continue;
      out[a] = { gx: Math.round(r[0]), gw: Math.min(gw, BASE_W) };   // recorded widths can never exceed the slab
    }
  }
  return out;
}
```

Then in `levelComplete` (`index.html:2119`), immediately after the `winFirst` / `prog` lines and before the star-record block, add:

```js
  recordPastRun(i);   // v152: your real tower becomes the past under the NEXT level
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep v152`
Expected: five PASS lines.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v152 part 1: record the player's real tower per cleared level"
```

---

### Task 2: Stitch history onto the pre-stack (neutrality contract)

**Files:**
- Modify: `index.html:1665-1666` (the `resetRun` pre-stack loop)
- Test: `tests/headless.js`

**Interfaces:**
- Consumes: `pastRowsForLaunch(launch)` from Task 1.
- Produces: `blocks[i].past === true` / `.gx` / `.gw` on pre-stacked rows; `blocks[runLaunch-1].slab === true`; global `pastDepth` (number of pre-stacked rows carrying recorded geometry).

- [ ] **Step 1: Write the failing tests**

Append to `tests/headless.js` after the Task 1 checks:

```js
check('v152 NEUTRALITY: pre-stacked blocks keep full width and centre whatever history says', () => {
  const g = makeGame();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 3, w: 18, col:"#fff"});');
  g.run('recordPastRun(0)');
  g.run('startLevel(1)');
  return g.run('(() => { const cx = (W - BASE_W) / 2;' +
    'for (let i = 0; i < runLaunch; i++) { const b = blocks[i];' +
    'if (b.w !== BASE_W) return "row " + i + " w=" + b.w;' +
    'if (b.x !== cx) return "row " + i + " x=" + b.x; } return true; })()');
});
check('v152 recorded geometry is attached as render-only fields', () => {
  const g = makeGame();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 3, w: 18, col:"#fff"});');
  g.run('recordPastRun(0)');
  g.run('startLevel(1)');
  return g.run('blocks[2].past === true && blocks[2].gw === 18 && blocks[2].gx === 3 && pastDepth > 0');
});
check('v152 the top pre-stacked row is the fresh slab, and it is not past', () => {
  const g = makeGame();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 3, w: 18, col:"#fff"});');
  g.run('recordPastRun(0)');
  g.run('startLevel(1)');
  return g.run('(() => { const t = blocks[runLaunch - 1];' +
    'return t.slab === true && !t.past && t.w === BASE_W; })()');
});
check('v152 no history: the launch column is plain, pastDepth 0, nothing marked past', () => {
  const g = makeGame();
  g.run('prog = 3; startLevel(1)');
  return g.run('pastDepth === 0 && blocks.slice(0, runLaunch - 1).every(b => !b.past)');
});
check('v152 altitude math is untouched by history', () => {
  const a = makeGame(); a.run('prog = 3; startLevel(2)');
  const b = makeGame();
  b.run('startLevel(0)');
  b.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 3, w: 18, col:"#fff"});');
  b.run('recordPastRun(0); prog = 3; startLevel(2)');
  return a.run('blocks.length') === b.run('blocks.length')
    && a.run('tier') === b.run('tier')
    && a.run('runLaunch') === b.run('runLaunch')
    && a.run('nextPickupRow') === b.run('nextPickupRow') ? true : 'run state diverged with history present';
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep v152`
Expected: the five new checks FAIL (`pastDepth is not defined`), Task 1's five still PASS.

- [ ] **Step 3: Implement**

Declare the counter next to the other run-scope render state — add to the `let` line at `index.html:1325` region by inserting a new line after `let blocks = [], slider = null, faller = null;` (`index.html:1275`):

```js
let pastDepth = 0;   // v152: how many pre-stacked rows carry RECORDED geometry (render-only)
```

Replace the pre-stack loop (`index.html:1665-1666`):

```js
  blocks = [{ x:(W-BASE_W)/2, w:BASE_W, col:blockCol(0) }];
  for (let i = 1; i < runLaunch; i++) blocks.push({ x:(W-BASE_W)/2, w:BASE_W, col: blockCol(i) });
```

with:

```js
  // v152: the pre-stack is UNCHANGED as a physics column — full width, centred, one row per
  // altitude. Recorded geometry is attached alongside it and read only by the renderer.
  const pastRows = pastRowsForLaunch(runLaunch);
  pastDepth = 0;
  blocks = [{ x:(W-BASE_W)/2, w:BASE_W, col:blockCol(0) }];
  for (let i = 1; i < runLaunch; i++) blocks.push({ x:(W-BASE_W)/2, w:BASE_W, col: blockCol(i) });
  for (let i = 0; i < runLaunch - 1; i++) {   // the TOP pre-stacked row is the fresh slab, never past
    const r = pastRows[i];
    blocks[i].past = true;
    if (r) { blocks[i].gx = r.gx; blocks[i].gw = r.gw; pastDepth++; }
  }
  if (runLaunch > 0) blocks[runLaunch - 1].slab = true;
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep v152`
Expected: ten PASS lines.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v152 part 2: attach recorded geometry to the pre-stack as render-only fields"
```

---

### Task 3: Draw the past column (locked, depth-faded, biome-tinted)

**Files:**
- Modify: `index.html` — `renderWorld` (`index.html:5194`), block loop (`index.html:5211`)
- Test: `tests/headless.js`

**Interfaces:**
- Consumes: `blocks[i].past/.gx/.gw`, `pastDepth` from Task 2.
- Produces: `pastFade(depth)` → number in `(0,1]`, strictly decreasing in `depth`; `drawPastColumn(cy)` → void.

- [ ] **Step 1: Write the failing tests**

```js
check('v152 past fade decreases monotonically with depth', () => fresh.run(
  '(() => { let prev = Infinity;' +
  'for (let d = 0; d < 40; d++) { const a = pastFade(d);' +
  'if (!(a > 0 && a <= 1)) return "alpha out of range at " + d;' +
  'if (a >= prev) return "not decreasing at depth " + d; prev = a; } return true; })()'));
check('v152 the past column is LOCKED: sway moves the live tower, never the past', () => {
  const { rec, g } = v149rec();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 20, w: 40, col:"#fff"});');
  g.run('recordPastRun(0); prog = 3; startLevel(1)');
  const grab = sway => {
    rec.rects.length = 0;
    g.run('swayX = ' + sway + '; drawPastColumn(cameraY)');
    return rec.rects.map(r => r.x).join(',');
  };
  const still = grab(0), leaned = grab(24);
  return still.length > 0 && still === leaned ? true : 'past moved with sway';
});
check('v152 past rows draw their RECORDED width, not the physics width', () => {
  const { rec, g } = v149rec();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 20, w: 37, col:"#fff"});');
  g.run('recordPastRun(0); prog = 3; startLevel(1)');
  rec.rects.length = 0;
  g.run('cameraY = GROUND_Y - runLaunch*BH - (H - 100); drawPastColumn(cameraY)');
  const widths = new Set(rec.rects.map(r => r.w));
  if (!rec.rects.length) return 'nothing drawn';
  return widths.has(37) && !widths.has(g.run('BASE_W')) ? true : 'widths=' + [...widths].join(',');
});
check('v152 the main block loop no longer draws past rows itself', () => {
  const i0 = src.indexOf('for (let i=0;i<blocks.length;i++)');
  const seg = src.slice(i0, i0 + 1400);
  return seg.includes('if (b.past) continue;') ? true : 'past rows are still drawn by the live loop';
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep v152`
Expected: the four new checks FAIL (`pastFade is not defined`).

- [ ] **Step 3: Implement**

Add above `renderWorld` (`index.html:5194`):

```js
// v152 THE PAST IS LOCKED AND FADING. Two rules live here:
// (1) drawPastColumn is called OUTSIDE the swayX translate, so the past never leans with the live
//     tower. That is not just taste — a past that does not move is a past that visibly is not
//     holding you up.
// (2) Alpha and brightness both fall with depth below the seam, so DISTANCE READS AS TIME. It also
//     means an unrecorded row (older save, skipped checkpoint) dissolves instead of announcing
//     itself as a gap.
function pastFade(depth) { return 0.62 / (1 + depth * 0.085); }
function drawPastColumn(cy) {
  if (!pastDepth) return;
  const top = blocks.length - 1;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b.past) continue;
    const y = Math.round(GROUND_Y - (i + 1) * BH - cy);
    if (y > H || y + BH < 0) continue;                       // screen-space cull: cost is viewport-bound
    const bw = b.gw === undefined ? BASE_W : b.gw;
    const bx = b.gw === undefined ? (W - BASE_W) / 2 : b.gx;
    const a = pastFade(top - i);
    ctx.globalAlpha = a;
    ctx.fillStyle = b.col;                                   // its own biome colour, dimmed by the veil below
    ctx.fillRect(Math.round(bx), y, Math.round(bw), BH);
    ctx.globalAlpha = a * 0.55;                              // desaturate toward the dark: an old block, not a lit one
    ctx.fillStyle = 'rgba(8,10,20,1)';
    ctx.fillRect(Math.round(bx), y, Math.round(bw), BH);
    ctx.globalAlpha = 1;
  }
}
```

In `renderWorld`, call it before the sway translate. Replace (`index.html:5198`):

```js
  ctx.save(); ctx.translate(Math.round(swayX * RS) / RS, 0);
```

with:

```js
  drawPastColumn(cy);   // v152: OUTSIDE the sway — the past does not lean with the live tower
  ctx.save(); ctx.translate(Math.round(swayX * RS) / RS, 0);
```

In the block loop, skip past rows. After the `toppleHideTop` guard (`index.html:5212`), insert:

```js
    if (blocks[i].past) continue;   // v152: drawn by drawPastColumn, outside the sway
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep v152`
Expected: fourteen PASS lines.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v152 part 3: draw the past column locked, depth-faded and biome-tinted"
```

---

### Task 4: The seam — a fresh slab over the past

**Files:**
- Modify: `index.html` — `drawPastColumn` (from Task 3)
- Test: `tests/headless.js`

**Interfaces:**
- Consumes: `blocks[i].slab`, `pastDepth`.
- Produces: a seam line drawn at the top of the past column.

- [ ] **Step 1: Write the failing test**

```js
check('v152 a seam line marks now-from-then, only when there is a past', () => {
  const { rec, g } = v149rec();
  const seamCount = () => {
    rec.rects.length = 0;
    g.run('cameraY = GROUND_Y - runLaunch*BH - (H - 100); drawPastColumn(cameraY)');
    return rec.rects.filter(r => String(r.style) === PAST_SEAM_HEX).length;
  };
  const PAST_SEAM_HEX = (src.match(/const PAST_SEAM = '([^']+)'/) || [])[1];
  if (!PAST_SEAM_HEX) return 'no PAST_SEAM constant';
  g.run('prog = 3; startLevel(1)');
  const without = seamCount();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 20, w: 40, col:"#fff"});');
  g.run('recordPastRun(0); prog = 3; startLevel(1)');
  const withPast = seamCount();
  return withPast > 0 && without === 0
    ? true : 'withPast=' + withPast + ' without=' + without;
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep "v152 a seam"`
Expected: FAIL, `no PAST_SEAM constant`.

- [ ] **Step 3: Implement**

Add the constant next to `pastFade` (Task 3):

```js
const PAST_SEAM = 'rgba(255,246,232,0.5)';
```

At the end of `drawPastColumn`, before the closing brace, add:

```js
  // the seam: above it is NOW, below it is THEN. Drawn under the slab row, which the live loop
  // still renders full and lit, so the fresh block reads as the thing you actually stand on.
  const si = blocks.findIndex(b => b.slab);
  if (si >= 0) {
    const sy = Math.round(GROUND_Y - si * BH - cy);
    if (sy > -2 && sy < H) {
      ctx.fillStyle = PAST_SEAM;
      ctx.fillRect(Math.round((W - BASE_W) / 2), sy, BASE_W, 1);
    }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep "v152 a seam"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v152 part 4: seam line separating the fresh slab from the past"
```

---

### Task 5: The descent glance

**Files:**
- Modify: `index.html:1695` (the existing pan-to-landmark offset)
- Test: `tests/headless.js`

**Interfaces:**
- Consumes: `pastDepth`.
- Produces: a deeper start-of-run camera offset when a past exists.

Note: this **extends the pan-to-landmark offset that already ships** rather than adding a new camera mode. The camera is a critically-damped follow with `smoothTime 1.6` (`index.html:2616`), so a larger offset gives the ease-out lift for free. Deliberate deviation from the spec: the glance does **not** block input. The existing 120px pan never has, and freezing the player for a second on every level start would be a feel regression. The camera settles under them either way.

- [ ] **Step 1: Write the failing tests**

```js
check('v152 the descent glance opens deeper when there is a past to see', () => {
  const plain = makeGame(); plain.run('prog = 3; startLevel(1)');
  const withPast = makeGame();
  withPast.run('startLevel(0)');
  withPast.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 20, w: 40, col:"#fff"});');
  withPast.run('recordPastRun(0); prog = 3; startLevel(1)');
  const dp = plain.run('cameraY - cameraTarget'), dw = withPast.run('cameraY - cameraTarget');
  return dw > dp && dp > 0 ? true : 'plain=' + dp + ' past=' + dw;
});
check('v152 the descent glance is bounded and respects reduced motion', () => {
  const rm = makeGame(null, true);
  rm.run('startLevel(0)');
  rm.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 20, w: 40, col:"#fff"});');
  rm.run('recordPastRun(0); prog = 3; startLevel(1)');
  if (rm.run('cameraY !== cameraTarget')) return 'reduced motion still pans';
  const deep = makeGame();
  deep.run('startLevel(0)');
  deep.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 20, w: 40, col:"#fff"});');
  deep.run('recordPastRun(0); prog = 3; startLevel(1)');
  return deep.run('cameraY - cameraTarget <= PAST_GLANCE_MAX') ? true : 'glance exceeded the cap';
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep "descent glance"`
Expected: both FAIL (`PAST_GLANCE_MAX is not defined`).

- [ ] **Step 3: Implement**

Add next to `pastFade`:

```js
const PAST_GLANCE_MAX = 260;   // v152: cap the descent glance — a long fall back up reads as a stall
```

Replace `index.html:1695`:

```js
  if (runLevel >= 0 && !reduceMotion) cameraY = cameraTarget + 120;   // pan-to-landmark: reveal the themed base, then settle up into play
```

with:

```js
  // v152 DESCENT GLANCE: the run opens looking DOWN your own past column and lifts to the slab.
  // The camera is a critically-damped follow (smoothTime 1.6), so the offset alone gives the
  // ease-out — no new camera mode. With no past to see we keep the shipped 120px landmark pan.
  if (runLevel >= 0 && !reduceMotion)
    cameraY = cameraTarget + (pastDepth ? clamp(120 + pastDepth * BH * 0.5, 120, PAST_GLANCE_MAX) : 120);
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep "descent glance"`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v152 part 5: descent glance — open on the past column, lift to the slab"
```

---

### Task 6: Past level-name labels

**Files:**
- Modify: `index.html` — `drawPastColumn`
- Test: `tests/headless.js`

**Interfaces:**
- Consumes: `levelName(i)`, `TIER_LEVEL`, `levelStartA(i)`, `pastFade`.
- Produces: faint level labels at past band boundaries.

This is the one piece of this feature that lands in the text layer, so it must satisfy the rules the later text/overlay audit will apply: it hides rather than collides.

- [ ] **Step 1: Write the failing tests**

```js
check('v152 past bands are labelled with their level name, fading with depth', () => {
  const { rec, g } = v149rec();
  const labels = [];
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 20, w: 40, col:"#fff"});');
  g.run('recordPastRun(0); prog = 3; startLevel(1)');
  g.run('__pastLabels = []; const _t = txt; txt = (s,x,y,sc,c,al) => { __pastLabels.push([String(s),x,y]); return _t(s,x,y,sc,c,al); };');
  g.run('cameraY = GROUND_Y - runLaunch*BH - (H - 100); drawPastColumn(cameraY)');
  const seen = JSON.parse(g.run('JSON.stringify(__pastLabels)'));
  const want = g.run('levelName(0)');
  return seen.some(l => l[0] === want) ? true : 'no "' + want + '" label, saw ' + JSON.stringify(seen);
});
check('v152 past labels never collide with the seam or each other', () => {
  const { rec, g } = v149rec();
  g.run('startLevel(0)');
  g.run('while (blocks.length < levelGoalA(0)) blocks.push({x: 20, w: 40, col:"#fff"});');
  g.run('recordPastRun(0); prog = 3; startLevel(2)');
  g.run('__pastLabels = []; const _t = txt; txt = (s,x,y,sc,c,al) => { __pastLabels.push([String(s),x,y]); return _t(s,x,y,sc,c,al); };');
  g.run('cameraY = GROUND_Y - runLaunch*BH - (H - 100); drawPastColumn(cameraY)');
  const seen = JSON.parse(g.run('JSON.stringify(__pastLabels)'));
  const ys = seen.map(l => l[2]).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i-1] < 9) return 'labels ' + ys[i-1] + '/' + ys[i] + ' overlap';
  const si = g.run('blocks.findIndex(b => b.slab)');
  const sy = g.run('Math.round(GROUND_Y - ' + si + '*BH - cameraY)');
  return ys.every(y => Math.abs(y - sy) >= 9) ? true : 'a label sits on the seam at y=' + sy;
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep "past label\|past bands"`
Expected: the first FAILs (no label drawn); the second passes vacuously with zero labels — that is expected and it becomes meaningful once labels exist.

- [ ] **Step 3: Implement**

At the end of `drawPastColumn`, after the seam block:

```js
  // v152: name the eras. Each past band gets its level's name where that band STARTS, fading on the
  // same curve as the blocks — the column becomes a readable map of the journey. TEXT RULE: it
  // hides rather than collides. A label within 9px of the seam or of the previous label is dropped.
  const si2 = blocks.findIndex(b => b.slab);
  const seamY = si2 >= 0 ? Math.round(GROUND_Y - si2 * BH - cy) : -999;
  let lastY = -999;
  for (let lv = 0; lv < LEVEL_COUNT; lv++) {
    const a = levelStartA(lv);
    if (a >= blocks.length - 1 || !blocks[a] || !blocks[a].past) continue;
    const y = Math.round(GROUND_Y - (a + 1) * BH - cy) + 2;
    if (y < 4 || y > H - 4) continue;
    if (Math.abs(y - seamY) < 9 || Math.abs(y - lastY) < 9) continue;   // hide, never collide
    const a2 = pastFade(blocks.length - 1 - a);
    ctx.globalAlpha = Math.min(1, a2 * 1.35);
    txt(levelName(lv), 4, y, 1, 'rgba(255,246,232,0.75)', 'left');
    ctx.globalAlpha = 1;
    lastY = y;
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /e/Projects/SKYSTACK && node tests/headless.js 2>&1 | grep "past label\|past bands"`
Expected: both PASS.

- [ ] **Step 5: Full suite + commit**

```bash
cd /e/Projects/SKYSTACK && node tests/headless.js
```
Expected: all checks green, total = 663 + 17 new.

```bash
git add index.html tests/headless.js
git commit -m "v152 part 6: level-name labels down the past column"
```

---

### Task 7: Browser verification and deploy

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Bump the service-worker cache version**

`sw.js` carries a cache name with a version. Bump it to `skystack-v152` so the deploy actually reaches devices.

- [ ] **Step 2: Commit and push**

```bash
git add sw.js && git commit -m "v152: bump SW cache" && git push
```

- [ ] **Step 3: Verify live**

Poll `https://asherbb6.github.io/SKYSTACK/sw.js` until it serves `skystack-v152`, then load
`https://asherbb6.github.io/SKYSTACK/?fresh=152` in the Browser pane and assert a v152 source
marker via `[...document.scripts].map(s=>s.text)`. The SW re-registers on every load — clear
registrations and caches, reload, then trust what is on screen.

- [ ] **Step 4: Prove the feature on a real frame**

Drive a level start with history present and read pixels **in the same tick** as the draw (the
game's own rAF overwrites any static probe frame). Confirm: past rows narrower than the slab,
alpha falling with depth, the seam line present, labels placed. The Browser-pane canvas is 2×
scaled — measure logical regions at 2× coords (`S = ctx.canvas.width / W`).

- [ ] **Step 5: Vault close-out**

Update `CURRENT_STATE.md`, replace `CURRENT_HANDOFF.md`, record the neutrality contract as a
decision in `DECISIONS.md`, add a session log under `SESSION_LOGS`, commit and push the vault.

---

## Self-review

**Spec coverage:** record (T1) · stitching + neutrality (T2) · locked depth-faded biome-tinted render (T3) · seam and slab (T4) · descent glance (T5) · level labels (T6) · all seven spec tests distributed across T1–T6 · deploy and close-out (T7). No spec section is unimplemented.

**Deviations from the spec, both deliberate:**
1. The descent glance does not block input (see Task 5 rationale).
2. With no past rows, the run keeps the existing 120px landmark pan rather than no pan at all — that pan already ships and is covered by existing tests; removing it would be an unrelated behaviour change.

**Type consistency:** `pastFade`, `drawPastColumn`, `pastRowsForLaunch`, `recordPastRun`, `loadPastHistory`, `pastDepth`, `PAST_KEY`, `PAST_SEAM`, `PAST_GLANCE_MAX` are spelled identically in every task. Row records are `[x, w]` pairs in storage and `{gx, gw}` objects in memory, consistently. `past` is used throughout; `ghost` is never reused.
