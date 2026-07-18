# Drifting Balloon Power-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the uncatchable tower-edge balloon with a fair balloon that drifts horizontally across the sky and pops on any block contact.

**Architecture:** SKYSTACK is a single-file game (`index.html`, one inline `<script>`). The balloon is a single global object updated inside `update(dt)`. This plan swaps its spawn (screen edge + drift velocity + fixed world-Y altitude), replaces the one-drop row-window catch in `land()` with per-frame circle-vs-rect contact checks (faller + tower), and deletes the escape-upward miss state. Tests live in `tests/headless.js`, which evals the inline script in a Node `vm` and drives internals directly.

**Tech Stack:** Vanilla JS canvas game, Node built-in `vm` test harness (`node tests/headless.js`), GitHub Pages deploy on push to `main`.

**Spec:** `docs/superpowers/specs/2026-07-17-balloon-drift-redesign-design.md`

## Global Constraints

- Pushing `main` DEPLOYS. Only push in Task 2 after: `sw.js` CACHE bumped to `skystack-v104`, matching test updated, full suite green.
- Pop side effects must stay byte-for-byte in spirit with today's catch: `runBalloons++; runPowerups++; stats.balloons++;` then `applyPower`, 10 particles, `sfx.pop()`, `balloon = null` — achievements `pop1/pop5/pop25` and the `balloon` mission depend on `stats.balloons` / `runBalloons`.
- Spawn stays gated by `canSpawnPickups(runContext)` (endless/level/time/daily only) and `blocks.length >= 8`.
- All tunables go in `BALANCE_REGISTRY.balloon` (the registry is `deepFreeze`d — add the key at its definition, index.html:915-924).
- The S7 frame-budget check in the suite flakes under machine load — on an unrelated S7 failure, quietly re-run once.
- Line numbers below are as of commit `08b11c7` (v103 + spec); re-locate by searching the quoted code if drifted.

---

### Task 1: The drifting balloon mechanic (spawn, drift, contact pop, despawn)

One task because the old and new mechanics can't coexist: the old `land()` catch reads `balloon.row`, which the new spawn no longer creates. Test-first, then swap every site in one commit.

**Files:**
- Modify: `index.html` — `BALANCE_REGISTRY` (~line 923), `maybeSpawnBalloon`/`balloonWorldY` (~1493-1509), `land()` (~1518-1524), `afterPlace` (~1638), `update(dt)` balloon block (~2205-2212), `drawBalloon` (~2397, ~2411), `adaptToScreen` (~1944)
- Test: `tests/headless.js` — new v104 section inserted just above the `sw.js cache bumped` check (~line 1536)

**Interfaces:**
- Consumes: existing globals `balloon`, `lastBalloonRow`, `blocks`, `faller`, `state`, `W`, `BH`, `GROUND_Y`, `tick`, `clamp()`, `rnd()`, `pick()`, `GIFT_POOL`, `applyPower()`, `canSpawnPickups()`, `POW`, `sfx`, `particles`, `stats`, `runBalloons`, `runPowerups`.
- Produces: balloon object shape `{ x, vx, wy, ph, type }` (no more `row`/`inT`/`away`); new globals `balloonTouches(x, y, w, h) -> boolean` and `popBalloon() -> void`; `BALANCE_REGISTRY.balloon = { driftSpeed, altitudeRows, minRowGap, spawnChance, margin, hitR }`. Task 2 and the draw code rely on exactly these names.

- [ ] **Step 1: Write the failing tests**

In `tests/headless.js`, find the line:

```js
check('sw.js cache bumped to v103', () => /const CACHE = 'skystack-v103'/.test(sw));
```

Insert this block ABOVE it:

```js
// ---------- v104: drifting balloon power-up ----------
const bd = makeGame();
bd.run('mode="endless"; resetRun(); state="playing"; while (blocks.length < 12) blocks.push({x:60,w:96,col:blockCol(blocks.length)});');
check('v104 balloon: spawns off-screen at a side edge, drifting inward, at the registry altitude', () => bd.run(
  '(() => { let g=0; while (!balloon && g++ < 400) { lastBalloonRow = 0; maybeSpawnBalloon(); }' +
  ' if (!balloon) return "never spawned";' +
  ' const B = BALANCE_REGISTRY.balloon;' +
  ' const edgeOK = (balloon.x === -B.margin && balloon.vx === B.driftSpeed) || (balloon.x === W + B.margin && balloon.vx === -B.driftSpeed);' +
  ' const altOK = balloon.wy === GROUND_Y - (12 + B.altitudeRows) * BH - BH/2;' +
  ' return edgeOK && altOK && balloon.row === undefined && balloon.inT === undefined && balloon.away === undefined; })()'));
check('v104 balloon: drifts horizontally with dt around a fixed altitude', () => bd.run(
  '(() => { const x0 = balloon.x, wy0 = balloon.wy; update(1); update(1);' +
  ' return Math.abs(balloon.x - (x0 + balloon.vx * 2)) < 1e-9 && balloon.wy === wy0; })()'));
check('v104 balloon: a falling block pops it mid-air and applies the gift', () => bd.run(
  '(() => { balloon = { x: W/2, vx: BALANCE_REGISTRY.balloon.driftSpeed, wy: GROUND_Y - 20*BH, ph: 0, type: "shield" };' +
  ' shield = 0; const rb = runBalloons, sb = stats.balloons;' +
  ' faller = { x: W/2 - 10, y: GROUND_Y - 20*BH - BH/2, w: 40, vy: 0, col: blockCol(2), golden: false };' +
  ' state = "dropping"; update(1);' +
  ' const ok = balloon === null && shield === 1 && runBalloons === rb + 1 && stats.balloons === sb + 1;' +
  ' faller = null; state = "playing"; return ok; })()'));
check('v104 balloon: drifting into the tower pops it', () => bd.run(
  '(() => { const top = blocks[blocks.length - 1];' +
  ' balloon = { x: top.x + 4, vx: BALANCE_REGISTRY.balloon.driftSpeed, wy: GROUND_Y - (blocks.length - 1) * BH - BH/2, ph: 0, type: "gold" };' +
  ' const rb = runBalloons; update(1); return balloon === null && runBalloons === rb + 1 && goldenNext === true; })()'));
check('v104 balloon: crossing the far edge despawns it with no reward and no escape tease', () => bd.run(
  '(() => { balloon = { x: W + BALANCE_REGISTRY.balloon.margin + 1, vx: BALANCE_REGISTRY.balloon.driftSpeed, wy: GROUND_Y - 40*BH, ph: 0, type: "wide" };' +
  ' const rb = runBalloons; update(1); return balloon === null && runBalloons === rb; })()'));
check('v104 balloon: legacy escape/intro states are gone from the source', () =>
  !/balloon\.away/.test(src) && !/balloon\.inT/.test(src) && !/it escapes upward/.test(src));
```

- [ ] **Step 2: Run the suite to verify the new checks fail**

Run: `node tests/headless.js`
Expected: the six `v104 balloon:` checks FAIL (spawn puts the balloon at the tower edge with `row`/`inT` fields; `update` doesn't drift or pop; `balloon.away` still in source). All pre-existing checks still pass.

- [ ] **Step 3: Implement — registry entry**

In `index.html`, inside `BALANCE_REGISTRY` (line ~923), insert a `balloon` entry before the `seed:` line:

```js
  balloon:{ driftSpeed:0.35, altitudeRows:3, minRowGap:8, spawnChance:0.5, margin:14, hitR:10 },
  seed:{ dailyXor:0x9E3779B9 }, materials:MATERIALS
```

(`driftSpeed` 0.35 px/frame ≈ 9-10s to cross a ~200px logical screen at 60fps → 3-5 drops of reaction time.)

- [ ] **Step 4: Implement — spawn, altitude, contact and pop helpers**

Replace `maybeSpawnBalloon` and `balloonWorldY` (lines ~1493-1509) entirely with:

```js
function maybeSpawnBalloon() {
  if (!canSpawnPickups(runContext)) return;
  const B = BALANCE_REGISTRY.balloon;
  if (balloon || blocks.length < 8) return;
  if (blocks.length - lastBalloonRow < B.minRowGap) return;
  if (rnd() > B.spawnChance) { lastBalloonRow = blocks.length; return; }
  const side = rnd() < 0.5 ? -1 : 1;                 // floats in from a screen edge — its own telegraph
  balloon = {
    x: side < 0 ? -B.margin : W + B.margin,
    vx: side < 0 ? B.driftSpeed : -B.driftSpeed,
    wy: GROUND_Y - (blocks.length + B.altitudeRows) * BH - BH/2,
    ph: rnd() * 6.28, type: pick(GIFT_POOL)
  };
  lastBalloonRow = blocks.length;
}
function balloonWorldY() { return balloon.wy + Math.sin(tick * .06 + balloon.ph) * 3; }
function balloonTouches(x, y, w, h) {                // circle-vs-rect: balloons are fragile, blocks are solid
  const R = BALANCE_REGISTRY.balloon.hitR, bx = balloon.x, by = balloonWorldY();
  const cx = clamp(bx, x, x + w), cy2 = clamp(by, y, y + h);
  return (bx - cx) * (bx - cx) + (by - cy2) * (by - cy2) <= R * R;
}
function popBalloon() {
  runBalloons++; runPowerups++; stats.balloons++;
  const bx = balloon.x, by = balloonWorldY();
  applyPower(balloon.type, bx, by);
  for (let i = 0; i < 10; i++) particles.push({ x: bx, y: by, vx:(Math.random()-.5)*3, vy:(Math.random()-.5)*3, life: 1, color: POW[balloon.type].c1 });
  sfx.pop(); balloon = null;
}
```

- [ ] **Step 5: Implement — delete the old catch and escape sites**

In `land()` (lines ~1518-1524), delete this whole block:

```js
  if (balloon && !balloon.away && Math.abs((GROUND_Y - balloon.row * BH) - (towerTopY() - BH)) < BH &&
      balloon.x >= f.x - 4 && balloon.x <= f.x + f.w + 4) {
    runBalloons++; runPowerups++; stats.balloons++;
    applyPower(balloon.type, balloon.x, balloonWorldY());
    for (let i = 0; i < 10; i++) particles.push({ x: balloon.x, y: balloonWorldY(), vx:(Math.random()-.5)*3, vy:(Math.random()-.5)*3, life: 1, color: POW[balloon.type].c1 });
    sfx.pop(); balloon = null;
  }
```

In `afterPlace` (line ~1638), delete this line:

```js
  if (balloon && !balloon.away && blocks.length > balloon.row + 1) balloon.away = 0.01;   // missed — it escapes upward
```

- [ ] **Step 6: Implement — drift + contact in update(dt)**

In `update(dt)`, replace the balloon block (lines ~2205-2212):

```js
  if (balloon && (state === 'playing' || state === 'dropping')) {
    if (balloon.inT < 1) balloon.inT = Math.min(1, balloon.inT + .02*dt);
    if (balloon.away) {
      balloon.away += .014*dt;
      balloon.x += Math.sin(tick*.1 + balloon.ph) * .35 * dt;
      if (balloonWorldY() - cameraY < -40) balloon = null;
    }
  }
```

with:

```js
  if (balloon && (state === 'playing' || state === 'dropping')) {
    const B = BALANCE_REGISTRY.balloon;
    balloon.x += balloon.vx * dt;
    if ((balloon.vx > 0 && balloon.x > W + B.margin) || (balloon.vx < 0 && balloon.x < -B.margin)) balloon = null;   // missed: floats off the far side
    else {
      if (state === 'dropping' && faller && balloonTouches(faller.x, faller.y, faller.w, BH)) popBalloon();          // sniped mid-air
      if (balloon) {
        const idx = Math.floor((GROUND_Y - balloonWorldY()) / BH);                                                   // tower block at its altitude
        if (idx >= 0 && idx < blocks.length && balloonTouches(blocks[idx].x, GROUND_Y - (idx + 1) * BH, blocks[idx].w, BH)) popBalloon();
      }
    }
  }
```

- [ ] **Step 7: Implement — draw and resize touch-ups**

In `drawBalloon` (~line 2397), delete the fade-in line and its closing reset (~2411):

```js
  ctx.globalAlpha = Math.min(1, balloon.inT * 1.6);        // fades in while drifting up
```
```js
  ctx.globalAlpha = 1;
```

In `adaptToScreen` (~line 1944), replace:

```js
  if (balloon) balloon.x = clamp(balloon.x + dx, 10, W - 10);
```

with (no clamp — an entering balloon is legitimately off-screen; altitude must follow the ground shift):

```js
  if (balloon) { balloon.x += dx; balloon.wy += dgy; }
```

- [ ] **Step 8: Run the full suite**

Run: `node tests/headless.js`
Expected: ALL checks pass, including the six new `v104 balloon:` checks and the untouched `PRACTICE schedules no pickups or balloons`. (If only the S7 frame-budget check fails, re-run once — known flake under load.)

- [ ] **Step 9: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v104: balloons drift across the sky and pop on any block contact"
```

(Local commit only — no push; pushing deploys and the cache bump lands in Task 2.)

---

### Task 2: Cache bump, browser verification, deploy

**Files:**
- Modify: `sw.js:2`
- Modify: `tests/headless.js` (~line 1536, the cache check)

**Interfaces:**
- Consumes: Task 1's committed mechanic; the running dev preview at http://localhost:3000.
- Produces: deployed v104 on GitHub Pages + cache-busting link for Asher.

- [ ] **Step 1: Update the cache check (test first)**

In `tests/headless.js`, change:

```js
check('sw.js cache bumped to v103', () => /const CACHE = 'skystack-v103'/.test(sw));
```

to:

```js
check('sw.js cache bumped to v104', () => /const CACHE = 'skystack-v104'/.test(sw));
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node tests/headless.js`
Expected: exactly one failure — `sw.js cache bumped to v104` (sw.js still says v103).

- [ ] **Step 3: Bump the service worker cache**

In `sw.js` line 2, change:

```js
const CACHE = 'skystack-v103';
```

to:

```js
const CACHE = 'skystack-v104';
```

- [ ] **Step 4: Run the full suite**

Run: `node tests/headless.js`
Expected: ALL checks pass.

- [ ] **Step 5: Browser smoke-check on the dev preview**

Reload http://localhost:3000 (dev server already running). Using the browser pane's javascript_tool in ONE call per the vault QA recipe (pane screenshots time out on this PC; set state, render, export):

```js
(() => {
  mode = 'endless'; resetRun(); state = 'playing';
  while (blocks.length < 12) blocks.push({ x: 60, w: 96, col: blockCol(blocks.length) });
  fadeT = 0; regionIntro = null;
  lastBalloonRow = 0; let g = 0;
  while (!balloon && g++ < 400) { lastBalloonRow = 0; maybeSpawnBalloon(); }
  balloon.x = W / 2;                       // drag it on-screen for the shot
  cameraY = towerTopY() - (H - 100); cameraTarget = cameraY;
  render();
  fetch('http://localhost:8124/', { method: 'POST', body: ctx.canvas.toDataURL() });  // ship the PNG out-of-band
  return { spawned: !!balloon, x: balloon.x, vx: balloon.vx };
})()
```

(Start the scratchpad recv.js listener on :8124 first if it isn't running — vault QA recipe.) Read the received PNG from the scratchpad. NEVER return or hand-copy the base64 through the transcript — it corrupts. Verify: balloon visible mid-sky above the tower, no console errors. Then let `update` run a few seconds and confirm the balloon's x advances (drift) via a second javascript_tool probe: `balloon ? balloon.x : 'gone'`.

- [ ] **Step 6: Commit and deploy**

```bash
git add sw.js tests/headless.js
git commit -m "Bump cache to v104"
git push origin main
```

Expected: push succeeds; GitHub Pages redeploys.

- [ ] **Step 7: Hand over the cache-busting link**

Give Asher: `https://asherbb6.github.io/SKYSTACK/?fresh=104` — ask him to verify balloons now drift across and pop on contact.

---

### Task 3: Vault close-out (session procedure, not game code)

**Files:**
- Modify: `../AI-CONTEXT/PROJECTS/SKYSTACK/CURRENT_STATE.md`, `CURRENT_HANDOFF.md`
- Create: dated session log under `../AI-CONTEXT/PROJECTS/SKYSTACK/SESSION_LOGS/`
- Delete: `../AI-CONTEXT/PROJECTS/SKYSTACK/RECOVERY_CHECKPOINT.md`

- [ ] **Step 1: Update vault docs per CLAUDE.md close-out** — state, handoff (next action: Asher's verdict at `?fresh=104`), session log, remove the recovery checkpoint.

- [ ] **Step 2: Commit and push the vault**

```bash
git -C ../AI-CONTEXT add -A PROJECTS/SKYSTACK
git -C ../AI-CONTEXT commit -m "SKYSTACK: v104 drifting balloon shipped - close-out"
git -C ../AI-CONTEXT push origin main
```

Expected: push confirmed. Do not claim the handoff is saved until it is.
