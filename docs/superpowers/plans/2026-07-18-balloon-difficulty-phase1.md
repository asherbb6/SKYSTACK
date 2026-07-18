# Balloon Difficulty Phase 1 Implementation Plan (v108)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn balloons into a difficulty pillar — a `kind` field (`gift·golden·dud·trap`) gives each balloon a distinct payoff, look, and flight, with bad balloons flying high/fast (usually escaping) and a trap triggering a short slider-speed rush.

**Architecture:** SKYSTACK is a single-file canvas game (`index.html`). The v104 `balloon` object gains `kind`; three small helpers (`balloonKindWeights`, `pickBalloonKind`, `balloonFlight`) drive spawn; `popBalloon` branches on kind; a new `rushT` timer (mirror of the SLOW power) speeds the live slider; `drawBalloon` branches per kind. Tunables extend `BALANCE_REGISTRY.balloon`.

**Tech Stack:** Vanilla JS, Node `vm` test harness (`node tests/headless.js`, ~4 min — 600s timeout or background), GitHub Pages deploy on `main` push.

**Spec:** `docs/superpowers/specs/2026-07-18-balloon-difficulty-phase1-design.md`

## Global Constraints

- Pushing `main` DEPLOYS. Push only in Task 4 after sw.js CACHE = `skystack-v108`, matching test, full suite green.
- Kinds: `gift` (random good power), `golden` (coin jackpot + guaranteed top power, rare), `dud` (nothing), `trap` (~2s slider rush). Bad = dud/trap.
- Fairness: one balloon at a time; bad balloons enter high & fast; traps never instantly kill; Practice/Pure keep zero balloons (`canSpawnPickups` gate unchanged); only gift/golden count toward `runBalloons`/`stats.balloons`.
- The S7 frame-budget check flakes under load — quietly re-run once on a lone S7 failure.
- Never `;`-chain `git commit` and `git push` in PowerShell; use `-m` single-line or `-F <file>`; confirm the intended commit landed before pushing.
- Line numbers are as of `cea0330`; re-locate by searching the quoted code if drifted.

---

### Task 1: Kind model, spawn weights, flight

**Files:**
- Modify: `index.html` — `BALANCE_REGISTRY.balloon` (~923), add helpers + rewrite `maybeSpawnBalloon` (~1504-1518)
- Test: `tests/headless.js` — add a v108 section after the v107 section (search `v107 win: tapping the nav row right half`)

**Interfaces:**
- Consumes: `BALANCE_REGISTRY.balloon`, `blocks`, `rnd()`, `pick()`, `clamp()`, `GIFT_POOL`, `GROUND_Y`, `BH`, `canSpawnPickups`, `lastBalloonRow`.
- Produces: `balloonKindWeights()→{gift,golden,dud,trap}`, `pickBalloonKind()→string`, `balloonFlight(kind)→{altRows,speed}`; `balloon` objects now carry `.kind`. Task 2 (`popBalloon`) and Task 3 (`drawBalloon`) branch on `.kind`.

- [ ] **Step 1: Write the failing spawn/flight tests**

In `tests/headless.js`, after the last v107 check (the `v107 win: tapping the nav row right half opens the sky map` block), add:

```js
// ---------- v108: balloon difficulty phase 1 ----------
const bl = makeGame();
bl.run('mode="endless"; resetRun(); state="playing";');
check('v108 balloon flight: good kinds low+slow, bad kinds high+fast', () => bl.run(
  '(() => { const B=BALANCE_REGISTRY.balloon;' +
  ' const g=balloonFlight("gift"), gl=balloonFlight("golden"), d=balloonFlight("dud"), t=balloonFlight("trap");' +
  ' return g.altRows===B.goodAltRows && gl.altRows===B.goodAltRows && d.altRows===B.badAltRows && t.altRows===B.badAltRows' +
  ' && g.speed===B.driftSpeed && t.speed===B.driftSpeed*B.badSpeedMul && d.speed===B.driftSpeed*B.badSpeedMul; })()'));
check('v108 kind weights interpolate toward more bad balloons as you climb', () => bl.run(
  '(() => { const share=w=>(w.dud+w.trap)/(w.gift+w.golden+w.dud+w.trap);' +
  ' blocks.length=1; const lo=balloonKindWeights(); blocks.length=999; const hi=balloonKindWeights();' +
  ' return share(hi) > share(lo) + 0.1; })()'));
check('v108 pickBalloonKind returns only valid kinds and shifts distribution with altitude', () => bl.run(
  '(() => { const roll=(n)=>{ const c={gift:0,golden:0,dud:0,trap:0}; for(let i=0;i<n;i++){const k=pickBalloonKind(); if(!(k in c))return null; c[k]++;} return c; };' +
  ' blocks.length=1; const lo=roll(600); blocks.length=999; const hi=roll(600);' +
  ' if(!lo||!hi) return "invalid kind"; return (hi.dud+hi.trap) > (lo.dud+lo.trap); })()'));
check('v108 spawn tags the balloon with a kind and matching flight', () => bl.run(
  '(() => { balloon=null; lastBalloonRow=0; blocks.length=40; let g=0;' +
  ' while(!balloon && g++<500){ lastBalloonRow=0; maybeSpawnBalloon(); }' +
  ' if(!balloon) return "never spawned"; const B=BALANCE_REGISTRY.balloon;' +
  ' const bad=balloon.kind==="dud"||balloon.kind==="trap"; const f=balloonFlight(balloon.kind);' +
  ' const expWy=GROUND_Y-(blocks.length+f.altRows)*BH-BH/2;' +
  ' return ["gift","golden","dud","trap"].includes(balloon.kind) && balloon.wy===expWy && Math.abs(balloon.vx)===f.speed; })()'));
```

- [ ] **Step 2: Run the suite — the v108 spawn checks fail**

Run: `node tests/headless.js` (600s/background)
Expected: FAIL — all four v108 checks throw (`balloonFlight`/`balloonKindWeights`/`pickBalloonKind` not defined; balloon has no `kind`). Everything else PASSES.

- [ ] **Step 3: Extend `BALANCE_REGISTRY.balloon`**

Replace (~923):

```js
  balloon:{ driftSpeed:0.35, altitudeRows:3, minRowGap:8, spawnChance:0.5, margin:14, hitR:10 },
```

with:

```js
  balloon:{ driftSpeed:0.35, minRowGap:8, spawnChance:0.5, margin:14, hitR:10,
    goodAltRows:3, badAltRows:6, badSpeedMul:1.6, goldenCoins:25, rushMul:1.8, rushFrames:120, scaleAlt:120,
    wLow:{ gift:70, golden:6, dud:16, trap:8 }, wHigh:{ gift:42, golden:6, dud:28, trap:24 } },
```

- [ ] **Step 4: Add the kind helpers**

Immediately before `function maybeSpawnBalloon() {` (~1504), insert:

```js
function balloonKindWeights() {
  const B = BALANCE_REGISTRY.balloon, f = clamp(blocks.length / B.scaleAlt, 0, 1), w = {};
  for (const k in B.wLow) w[k] = B.wLow[k] + (B.wHigh[k] - B.wLow[k]) * f;
  return w;
}
function pickBalloonKind() {
  const w = balloonKindWeights(); let tot = 0; for (const k in w) tot += w[k];
  let r = rnd() * tot; for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'gift';
}
function balloonFlight(kind) {
  const B = BALANCE_REGISTRY.balloon, bad = kind === 'dud' || kind === 'trap';
  return { altRows: bad ? B.badAltRows : B.goodAltRows, speed: B.driftSpeed * (bad ? B.badSpeedMul : 1) };
}
```

- [ ] **Step 5: Rewrite the spawn body of `maybeSpawnBalloon`**

Replace (~1510-1517):

```js
  const side = rnd() < 0.5 ? -1 : 1;                 // floats in from a screen edge — its own telegraph
  balloon = {
    x: side < 0 ? -B.margin : W + B.margin,
    vx: side < 0 ? B.driftSpeed : -B.driftSpeed,
    wy: GROUND_Y - (blocks.length + B.altitudeRows) * BH - BH/2,
    ph: rnd() * 6.28, type: pick(GIFT_POOL)
  };
  lastBalloonRow = blocks.length;
```

with:

```js
  const side = rnd() < 0.5 ? -1 : 1;                 // floats in from a screen edge — its own telegraph
  const kind = pickBalloonKind(), f = balloonFlight(kind);
  const type = kind === 'golden' ? pick(['gold','fever']) : kind === 'gift' ? pick(GIFT_POOL) : 'coin';
  balloon = {
    x: side < 0 ? -B.margin : W + B.margin,
    vx: side < 0 ? f.speed : -f.speed,
    wy: GROUND_Y - (blocks.length + f.altRows) * BH - BH/2,
    ph: rnd() * 6.28, type, kind
  };
  lastBalloonRow = blocks.length;
```

- [ ] **Step 6: Run the suite — v108 spawn checks pass**

Run: `node tests/headless.js` (600s/background)
Expected: the four v108 checks PASS; everything else stays green. (The existing v104 balloon checks still pass — spawn shape/edge/drift are unchanged; only `type` sourcing and the new `kind` were added.)

- [ ] **Step 7: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v108: balloon kinds - weighted spawn, high-fast bad balloons, flight helpers"
```

---

### Task 2: Pop payoffs, rush timer, stats

**Files:**
- Modify: `index.html` — globals (~1055), `resetRun` (~1397), `popBalloon` (~1525-1531), `update` rush decrement (~2223 area) + live slider step (~2242)
- Test: `tests/headless.js` — add pop/rush/stats checks to the v108 section

**Interfaces:**
- Consumes: `balloon.kind`/`type`, `applyPower`, `addCoins`, `runBalloons`, `runPowerups`, `stats`, `floaters`, `particles`, `sfx`, `shake`, `slider`, `goldenNext`.
- Produces: global `rushT`; `popBalloon` payoff-by-kind. Independent of Task 3.

- [ ] **Step 1: Write the failing pop/rush/stats tests**

Append to the v108 section:

```js
check('v108 pop: golden gives the coin jackpot AND a top power-up', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing"; while(blocks.length<12) blocks.push({x:60,w:96,col:"#fff"});');
  return g.run('(() => { const B=BALANCE_REGISTRY.balloon; coins=0; goldenNext=false; combo=0;' +
    ' balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:"gold",kind:"golden"};' +
    ' const c0=coins, rb0=runBalloons; popBalloon();' +
    ' return coins-c0===B.goldenCoins && (goldenNext===true||combo>0) && runBalloons===rb0+1 && balloon===null; })()'); });
check('v108 pop: dud gives nothing and does not count as a balloon', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { coins=50; balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:"coin",kind:"dud"};' +
    ' const rb0=runBalloons, c0=coins; popBalloon();' +
    ' return coins===c0 && runBalloons===rb0 && balloon===null; })()'); });
check('v108 pop: trap triggers the ~2s slider rush and does not count as a balloon', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { const B=BALANCE_REGISTRY.balloon; rushT=0; balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:"coin",kind:"trap"};' +
    ' const rb0=runBalloons; popBalloon();' +
    ' return rushT===B.rushFrames && runBalloons===rb0 && balloon===null; })()'); });
check('v108 pop: gift applies a power and counts as a balloon', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:"shield",kind:"gift"};' +
    ' const rb0=runBalloons; shield=0; popBalloon();' +
    ' return shield===1 && runBalloons===rb0+1 && balloon===null; })()'); });
check('v108 rush timer decays in update and clears on resetRun', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { const B=BALANCE_REGISTRY.balloon; rushT=B.rushFrames; update(1); const dropped=rushT<B.rushFrames;' +
    ' update(9999); const zeroed=rushT===0; rushT=B.rushFrames; resetRun(); return dropped && zeroed && rushT===0; })()'); });
check('v108 rush speeds the live slider while active', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing"; spawnSlider();');
  return g.run('(() => { if(!slider) return "no slider"; slider.dir=1; slider.x=W/2; wind=null; fever=false;' +
    ' const x0=slider.x; rushT=0; update(1); const base=slider.x-x0;' +
    ' slider.x=x0; rushT=BALANCE_REGISTRY.balloon.rushFrames; update(1); const rushed=slider.x-x0;' +
    ' return base > 0 && rushed > base*1.3; })()'); });
check('v108 source: rushT declared, reset, and applied to the slider step', () =>
  /let rushT = 0/.test(src) && /rushT = 0;/.test(src) && /rushT > 0 \? BALANCE_REGISTRY\.balloon\.rushMul : 1/.test(src));
```

- [ ] **Step 2: Run the suite — the pop/rush checks fail**

Run: `node tests/headless.js` (600s/background)
Expected: FAIL — the seven new checks (`rushT` undefined; `popBalloon` still applies a power for every kind). Task 1 checks still PASS.

- [ ] **Step 3: Declare and reset `rushT`**

In the globals line (~1055) replace:

```js
let shield = 0, widenNext = false, slowBlocks = 0, auraBlocks = 0, goldenNext = false;
```

with:

```js
let shield = 0, widenNext = false, slowBlocks = 0, auraBlocks = 0, goldenNext = false, rushT = 0;
```

In `resetRun` (~1397) replace:

```js
  shield = 0; widenNext = false; slowBlocks = 0; auraBlocks = 0; goldenNext = false;
```

with:

```js
  shield = 0; widenNext = false; slowBlocks = 0; auraBlocks = 0; goldenNext = false; rushT = 0;
```

- [ ] **Step 4: Branch `popBalloon` by kind**

Replace the whole function (~1525-1531):

```js
function popBalloon() {
  runBalloons++; runPowerups++; stats.balloons++;
  const bx = balloon.x, by = balloonWorldY();
  applyPower(balloon.type, bx, by);
  for (let i = 0; i < 10; i++) particles.push({ x: bx, y: by, vx:(Math.random()-.5)*3, vy:(Math.random()-.5)*3, life: 1, color: POW[balloon.type].c1 });
  sfx.pop(); balloon = null;
}
```

with:

```js
function popBalloon() {
  const bx = balloon.x, by = balloonWorldY(), kind = balloon.kind || 'gift';
  if (kind === 'dud') {                                   // fake-out: a puff of nothing
    floaters.push({ text:'DUD', x:bx, y:by, vy:-.4, life:1.1, color:'rgba(200,205,214,0.9)' });
    for (let i = 0; i < 8; i++) particles.push({ x: bx, y: by, vx:(Math.random()-.5)*2.2, vy:(Math.random()-.5)*2.2, life: .7, color:'#8A8F9C' });
    sfx.pop(); balloon = null; return;
  }
  if (kind === 'trap') {                                  // ~2s slider rush — mild, recoverable
    rushT = BALANCE_REGISTRY.balloon.rushFrames;
    floaters.push({ text:'RUSH!', x:bx, y:by, vy:-.4, life:1.3, color:'#FF7E6B' });
    for (let i = 0; i < 10; i++) particles.push({ x: bx, y: by, vx:(Math.random()-.5)*3, vy:(Math.random()-.5)*3, life: 1, color:'#FF6B5A' });
    shake = Math.max(shake, reduceMotion?2:4); sfx.pop(); balloon = null; return;
  }
  runBalloons++; runPowerups++; stats.balloons++;         // gift + golden are the "good pops"
  if (kind === 'golden') {
    addCoins(BALANCE_REGISTRY.balloon.goldenCoins, bx, by);
    applyPower(balloon.type, bx, by);                     // type is a forced top power (gold/fever)
    for (let i = 0; i < 16; i++) particles.push({ x: bx, y: by, vx:(Math.random()-.5)*3.4, vy:(Math.random()-.5)*3.4, life: 1.1, color:'#FFE28A' });
  } else {
    applyPower(balloon.type, bx, by);
    for (let i = 0; i < 10; i++) particles.push({ x: bx, y: by, vx:(Math.random()-.5)*3, vy:(Math.random()-.5)*3, life: 1, color: POW[balloon.type].c1 });
  }
  sfx.pop(); balloon = null;
}
```

- [ ] **Step 5: Decrement `rushT` in `update`**

Just before the balloon-move block `if (balloon && (state === 'playing' || state === 'dropping')) {` (~2223), add:

```js
  if (rushT > 0) rushT = Math.max(0, rushT - dt);
```

- [ ] **Step 6: Apply the rush to the live slider step**

Replace the slider-move line (~2242):

```js
    slider.x += slider.dir * slider.speed * wobF * feverSlow * dt;
```

with:

```js
    slider.x += slider.dir * slider.speed * wobF * feverSlow * (rushT > 0 ? BALANCE_REGISTRY.balloon.rushMul : 1) * dt;
```

- [ ] **Step 7: Full suite green**

Run: `node tests/headless.js` (600s/background)
Expected: ALL v108 checks pass; everything else green. (Lone S7 failure → quiet re-run.)

- [ ] **Step 8: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v108: balloon pop payoffs by kind + trap slider-rush timer"
```

---

### Task 3: Rendering per kind

**Files:**
- Modify: `index.html` — `drawBalloon` (~2412-2432)
- Test: `tests/headless.js` — add a draw check to the v108 section

**Interfaces:**
- Consumes: `balloon.kind`/`type`, `POW`, `drawIcon`, `pixDisc`, `ctx`, `tick`.
- Produces: kind-specific rendering. No new exports.

- [ ] **Step 1: Write the failing draw test**

Append to the v108 section:

```js
check('v108 drawBalloon renders every kind without throwing', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  g.run('for (const k of ["gift","golden","dud","trap"]) { balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:k==="gift"?"shield":"coin",kind:k}; drawBalloon(0); }');
  return true; });
```

(This already passes if `drawBalloon` is kind-agnostic, but it locks in that no kind throws — e.g. a golden/dud/trap `type` that isn't a POW icon must not crash. Run it and if it throws, Step 3 fixes it; if it passes, Step 3 still adds the distinct looks.)

- [ ] **Step 2: Run the suite**

Run: `node tests/headless.js` (600s/background)
Expected: the draw check may THROW (dud/trap `type:"coin"` has no `drawIcon` badge case, or golden path). Confirm the failure mode, then implement.

- [ ] **Step 3: Branch `drawBalloon` by kind**

Replace the body of `drawBalloon` (~2412-2432) with a kind-aware version (keeps the gift path identical, adds golden/dud/trap looks):

```js
function drawBalloon(cy) {
  if (!balloon) return;
  const y = balloonWorldY() - cy;
  if (y < -40 || y > H + 60) return;
  const kind = balloon.kind || 'gift';
  const sway = Math.sin(tick*.05 + balloon.ph);
  const bx = Math.round(balloon.x), by = Math.round(y);
  const PAL = { gift: POW[balloon.type] || POW.coin,
                golden: { c1:'#FFE28A', c2:'#B8860B' },
                dud: { c1:'#8A8F9C', c2:'#4A4F5C' },
                trap: { c1:'#FF6B5A', c2:'#7A241C' } };
  const P = PAL[kind];
  // envelope: dark silhouette rim, bright body, sheen, taper + knot
  ctx.fillStyle = P.c2;
  ctx.fillRect(bx-5, by-7, 10, 10); ctx.fillRect(bx-6, by-6, 12, 8); ctx.fillRect(bx-4, by-8, 8, 12);
  if (kind === 'trap') { ctx.fillRect(bx-7, by-3, 2, 2); ctx.fillRect(bx+5, by-3, 2, 2); ctx.fillRect(bx-1, by-10, 2, 2); }   // spikes
  ctx.fillStyle = P.c1;
  if (kind === 'dud') { ctx.fillRect(bx-3, by-5, 6, 7); ctx.fillRect(bx-4, by-4, 8, 5); }   // saggy, smaller body
  else { ctx.fillRect(bx-4, by-7, 8, 10); ctx.fillRect(bx-5, by-6, 10, 8); ctx.fillRect(bx-3, by-8, 6, 2); }
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(bx-3, by-6, 2, 3); ctx.fillRect(bx-2, by-7, 1, 1);
  ctx.fillStyle = P.c2; ctx.fillRect(bx-2, by+3, 4, 1); ctx.fillRect(bx-1, by+4, 2, 1);
  if (kind === 'golden' && !reduceMotion && Math.floor(tick/6)%2===0)   // sparkle
    { ctx.fillStyle='#FFF6E8'; ctx.fillRect(bx+4, by-6, 1, 1); ctx.fillRect(bx-6, by-2, 1, 1); }
  // string + hanging badge
  ctx.fillStyle = 'rgba(255,246,232,0.6)';
  for (let s2 = 0; s2 < 6; s2++) ctx.fillRect(bx + Math.round(sway * s2/5 * 2), by + 5 + s2, 1, 1);
  const gx = bx + Math.round(sway * 2), gy = by + 16;
  pixDisc(gx, gy, 6, P.c2); pixDisc(gx, gy, 5, '#141022');
  if (kind === 'gift') drawIcon(balloon.type, gx-4, gy-4, true);
  else { ctx.fillStyle = P.c1; txt(kind === 'golden' ? '$' : kind === 'trap' ? '!' : '?', gx, gy-3, 1, P.c1, 'center'); }
}
```

- [ ] **Step 4: Full suite green**

Run: `node tests/headless.js` (600s/background)
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v108: distinct balloon looks per kind (golden/dud/trap)"
```

---

### Task 4: Cache bump + browser QA + deploy

**Files:**
- Modify: `sw.js:2`, `tests/headless.js` (cache check)

- [ ] **Step 1: Cache check red→green**

In `tests/headless.js` change `check('sw.js cache bumped to v107', ...)` to expect `skystack-v108`; verify sw.js still v107 (`Select-String -Path sw.js -Pattern "skystack-v10[78]"`), then set `sw.js:2` to `const CACHE = 'skystack-v108';`.

- [ ] **Step 2: Full suite green**

Run: `node tests/headless.js` (600s/background). Expected: ALL pass.

- [ ] **Step 3: Browser smoke-check — spawn each kind and read the look**

Preview :3000 (launch.json `skystack`); recv.js on :8124 from scratchpad (one-shot — restart before each capture). In one javascript_tool call per kind: `paused=false`, `resize()`, start an endless run, `while(blocks.length<12) blocks.push(...)`, set `balloon={x:W/2, wy:GROUND_Y-8*BH, ph:0, type:<t>, kind:<k>}`, `fadeT=0`, `render()`, POST `ctx.canvas.toDataURL()`. Read each PNG: gift = its power color; golden = gold + `$` badge; dud = grey + `?`; trap = red + `!`. Then pop one of each (`popBalloon()`) and confirm coins jump for golden, `rushT===rushFrames` for trap. Never return base64 through the transcript.

- [ ] **Step 4: Commit and deploy**

```bash
git add sw.js tests/headless.js
git commit -m "Bump cache to v108"
git push origin main
```

---

### Task 5: Vault close-out

Update `../AI-CONTEXT/PROJECTS/SKYSTACK/CURRENT_STATE.md` + `CURRENT_HANDOFF.md` (next: Asher's verdict at `?fresh=108`; then balloon phase 2 — hazard/physics balloons, gas shrink-cloud, pri-3 danger slot; then hybrid checkpoint block starts), add a DECISIONS entry (#55: balloon kinds + hybrid-avoid + trap rush + golden jackpot contract), add a dated session log, delete `RECOVERY_CHECKPOINT.md`, commit and push AI-CONTEXT `main`. Hand Asher `https://asherbb6.github.io/SKYSTACK/?fresh=108`.
