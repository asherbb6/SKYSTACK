# v109: Gas Balloon + Progressive Balloons + One-Lane Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the disguised poison-gas hazard balloon, gate/scale balloon kinds by campaign level, and collapse the in-run message stack to one clean lane.

**Architecture:** Extends the v108 `balloon.kind` system with a fifth kind `gas` (good-flight profile, hazard payoff: a lingering world-anchored cloud that shrinks the top block). `balloonKindWeights()` gains campaign unlock gates + difficulty-rating scaling. The tutorial collapses to one `drawNotifyStrip` line with persisted progress; the modifier chip stops dropping and its corridor bar draws only for lane-meaningful families.

**Tech Stack:** Single-file `index.html` canvas game; `tests/headless.js` vm harness (check(name, fn) pattern, `r.run('expr')` executes in game context).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-gas-balloon-progression-lane-cleanup-design.md`.
- All tuning in `BALANCE_REGISTRY.balloon`; no ad-hoc constants in functions.
- Gas can never kill by itself: shrink floor `minW`, cloud self-expires.
- Bad pops (dud/trap/gas) never count toward `runBalloons`/`runPowerups`/`stats.balloons`.
- pri-3 danger note: gas is its FIRST user; keep the v105 interrupt contract.
- Save writes only through `store`; new key `skystack-tutstep` only (practice never writes it).
- Suite green + cache lockstep before push (push deploys). Never `;`-chain commit+push.
- Full test suite: `node tests/headless.js`, ~4 min, run in background with 600s timeout.

---

### Task 1: Registry, weights gating, flight

**Files:**
- Modify: `index.html:923-925` (registry), `index.html:1506-1510` (balloonKindWeights)
- Test: `tests/headless.js` (append v109 section after the v108 section; also update the v108 kind-enumeration checks to include gas)

**Interfaces:**
- Produces: `BALANCE_REGISTRY.balloon.{unlock,gasAltBlocks,diffScale,gas}`, `balloonKindWeights()` honoring `runLevel` gates/scaling. `balloonFlight('gas')` already returns the good profile (its `bad` test is `dud||trap`) — asserted, not changed.

- [ ] **Step 1: Failing tests** — append a `// ---- v109` section:

```js
check('v109 registry: gas kind, unlock gates, difficulty scale, gas tunables', () => r.run(
  '(() => { const B=BALANCE_REGISTRY.balloon; return B.wLow.gas===0 && B.wHigh.gas>0 && ' +
  'B.unlock.dud===2 && B.unlock.trap===4 && B.unlock.gas===6 && B.gasAltBlocks>0 && ' +
  'B.diffScale.minShare>0 && B.diffScale.minShare<1 && B.gas.cloudFrames>0 && B.gas.shrinkPerFrame>0 && B.gas.minW>0 && B.gas.cloudRows>0; })()'));
check('v109 gas flies the GOOD profile (disguised low-flyer)', () => r.run(
  '(() => { const f=balloonFlight("gas"), B=BALANCE_REGISTRY.balloon; return f.altRows===B.goodAltRows && f.speed===B.driftSpeed; })()'));
check('v109 campaign unlock gates: L1 good-only, L3 duds, L7 gas', () => r.run(
  '(() => { startLevel(0); blocks.length=0; for(let i=0;i<30;i++) blocks.push({x:0,w:50,col:blockCol(i)});' +
  ' let w=balloonKindWeights(); const l1 = w.dud===0 && w.trap===0 && w.gas===0 && w.gift>0;' +
  ' runLevel=2; w=balloonKindWeights(); const l3 = w.dud>0 && w.trap===0 && w.gas===0;' +
  ' runLevel=6; w=balloonKindWeights(); const l7 = w.dud>0 && w.trap>0 && w.gas>0;' +
  ' return l1 && l3 && l7; })()'));
check('v109 bad share scales with the level difficulty rating', () => r.run(
  '(() => { runLevel=6; const a=balloonKindWeights(); runLevel=10; const b=balloonKindWeights();' +
  ' return b.dud>a.dud && b.trap>a.trap && b.gas>a.gas && Math.abs(b.gift-a.gift)<1e-9; })()'));
check('v109 endless: gas locked below gasAltBlocks, live above', () => r.run(
  '(() => { runLevel=-1; const B=BALANCE_REGISTRY.balloon; blocks.length=0;' +
  ' for(let i=0;i<B.gasAltBlocks-1;i++) blocks.push({x:0,w:50,col:blockCol(i)});' +
  ' const lo=balloonKindWeights().gas; blocks.push({x:0,w:50,col:blockCol(0)});' +
  ' const hi=balloonKindWeights().gas; return lo===0 && hi>0; })()'));
```

Also EXTEND (edit in place) the v108 checks that enumerate kinds: `pickBalloonKind returns only valid kinds...` (valid set += 'gas'), `drawBalloon renders every kind...` (kind list += 'gas' — will fail until Task 2 adds the PAL entry; acceptable red until then).

- [ ] **Step 2: Red run** — `node tests/headless.js` (background, 600s). Expect exactly the new v109 checks + edited v108 kind checks failing; everything else green.

- [ ] **Step 3: Registry** — replace lines 923-925 value with:

```js
  balloon:{ driftSpeed:0.35, minRowGap:8, spawnChance:0.5, margin:14, hitR:10,
    goodAltRows:3, badAltRows:6, badSpeedMul:1.6, goldenCoins:25, rushMul:1.8, rushFrames:120, scaleAlt:120,
    wLow:{ gift:70, golden:6, dud:16, trap:8, gas:0 }, wHigh:{ gift:42, golden:6, dud:24, trap:18, gas:10 },
    unlock:{ dud:2, trap:4, gas:6 }, gasAltBlocks:120,
    diffScale:{ minRating:3, maxRating:11, minShare:0.5 },
    gas:{ cloudFrames:360, shrinkPerFrame:0.18, minW:12, cloudRows:2.5 } },
```

- [ ] **Step 4: Weights** — replace `balloonKindWeights` body:

```js
function balloonKindWeights() {
  const B = BALANCE_REGISTRY.balloon, f = clamp(blocks.length / B.scaleAlt, 0, 1), w = {};
  for (const k in B.wLow) w[k] = B.wLow[k] + (B.wHigh[k] - B.wLow[k]) * f;
  const bad = ['dud', 'trap', 'gas'];
  if (runLevel >= 0) {                                   // campaign: unlock gates + rating share
    const D = B.diffScale, rt = LEVEL_REGISTRY[runLevel].difficultyRating;
    const s = D.minShare + (1 - D.minShare) * clamp((rt - D.minRating) / (D.maxRating - D.minRating), 0, 1);
    for (const k of bad) w[k] = runLevel < B.unlock[k] ? 0 : w[k] * s;
  } else if (blocks.length < B.gasAltBlocks) w.gas = 0;  // endless: gas only high up
  return w;
}
```

- [ ] **Step 5: Suite** (background) — v109 Task 1 checks green; the edited v108 draw check stays red until Task 2. Commit nothing yet (shared gate after Task 3).

### Task 2: Gas pop, cloud effect, rendering

**Files:**
- Modify: `index.html` — globals (~1057 `rushT` line), `resetRun` (~1399), `popBalloon` (~1543, after the trap branch), `update` (~2258, after the rushT decay), world render (~4294 balloon call site), `drawBalloon` (~2455 PAL + badge)
- Test: `tests/headless.js` v109 section

**Interfaces:**
- Consumes: Task 1 registry (`B.gas.*`).
- Produces: global `gasCloud` (`{wy,t}|null`), `drawGasCloud(cy)`.

- [ ] **Step 1: Failing tests:**

```js
check('v109 gas pop: cloud spawned, pri-3 GAS danger note, no good-pop counters', () => r.run(
  '(() => { resetRun(); state="playing"; while(blocks.length<12) blocks.push({x:(W-BASE_W)/2,w:BASE_W,col:blockCol(blocks.length)});' +
  ' balloon={x:W/2,wy:GROUND_Y-8*BH,ph:0,type:"coin",kind:"gas"}; const rb=runBalloons, sb=stats.balloons;' +
  ' curNote={text:"OLD",accent:"#fff",pri:1,dur:120,t:0}; popBalloon();' +
  ' return gasCloud && gasCloud.t===BALANCE_REGISTRY.balloon.gas.cloudFrames && balloon===null &&' +
  ' curNote.text.indexOf("GAS")>=0 && curNote.pri===3 && runBalloons===rb && stats.balloons===sb; })()'));
check('v109 gas cloud shrinks the in-band top block center-preserving to minW, then stops', () => r.run(
  '(() => { const G=BALANCE_REGISTRY.balloon.gas; resetRun(); state="playing";' +
  ' while(blocks.length<12) blocks.push({x:(W-BASE_W)/2,w:BASE_W,col:blockCol(blocks.length)});' +
  ' const top=blocks[11], w0=top.w, c0=top.x+top.w/2;' +
  ' gasCloud={wy:GROUND_Y-11.5*BH, t:G.cloudFrames}; update(1);' +
  ' const shrunk=top.w<w0 && Math.abs((top.x+top.w/2)-c0)<1e-6;' +
  ' for(let i=0;i<20000 && gasCloud;i++){ gasCloud.t=Math.max(gasCloud.t,2); if(top.w<=G.minW) break; update(1); }' +
  ' return shrunk && Math.abs(top.w-G.minW)<1e-6; })()'));
check('v109 gas cloud ignores an out-of-band top block and expires; resetRun clears it', () => r.run(
  '(() => { const G=BALANCE_REGISTRY.balloon.gas; resetRun(); state="playing";' +
  ' while(blocks.length<12) blocks.push({x:(W-BASE_W)/2,w:BASE_W,col:blockCol(blocks.length)});' +
  ' const top=blocks[11], w0=top.w;' +
  ' gasCloud={wy:GROUND_Y-(11.5+G.cloudRows+2)*BH, t:3}; update(1); const untouched=top.w===w0;' +
  ' update(1); update(1); const expired=gasCloud===null;' +
  ' gasCloud={wy:0,t:100}; resetRun(); return untouched && expired && gasCloud===null; })()'));
check('v109 drawGasCloud renders without throwing (active, fading, off-screen)', () => r.run(
  '(() => { try { gasCloud={wy:GROUND_Y-9*BH,t:300}; render(); gasCloud.t=30; render();' +
  ' gasCloud={wy:-99999,t:300}; render(); gasCloud=null; return true; } catch(e) { return false; } })()'));
```

- [ ] **Step 2: Globals + reset** — line 1057 becomes:

```js
let shield = 0, widenNext = false, slowBlocks = 0, auraBlocks = 0, goldenNext = false, rushT = 0, gasCloud = null;
```

and the resetRun line 1399 gains `gasCloud = null;` at the end.

- [ ] **Step 3: popBalloon branch** — insert after the trap branch (before the good-pop counters):

```js
  if (kind === 'gas') {                                   // hazard: lingering cloud shrinks the top block
    gasCloud = { wy: by, t: BALANCE_REGISTRY.balloon.gas.cloudFrames };
    note('GAS! CLIMB OUT', '#FF5E7E', 3, 150);
    for (let i = 0; i < 14; i++) particles.push({ x: bx, y: by, vx:(Math.random()-.5)*3, vy:(Math.random()-.5)*3, life: 1.2, color:'#9BD44A' });
    shake = Math.max(shake, reduceMotion?2:4); sfx.pop(); balloon = null; return;
  }
```

- [ ] **Step 4: update tick** — insert after `if (rushT > 0) ...` (line 2258):

```js
  if (gasCloud) {
    gasCloud.t = Math.max(0, gasCloud.t - dt);
    if (gasCloud.t <= 0) gasCloud = null;
    else if ((state === 'playing' || state === 'dropping') && blocks.length) {
      const G = BALANCE_REGISTRY.balloon.gas, top = blocks[blocks.length - 1];
      const topCy = GROUND_Y - (blocks.length - 0.5) * BH;
      if (Math.abs(topCy - gasCloud.wy) <= G.cloudRows * BH) {
        const d = Math.min(G.shrinkPerFrame * dt, Math.max(0, top.w - G.minW));
        if (d > 0) { top.w -= d; top.x += d / 2; }
      }
    }
  }
```

- [ ] **Step 5: drawGasCloud + call site** — new function next to `drawBalloon`; call it in the world layer line 4294: `... drawPow(p, cy); drawGasCloud(cy); drawBalloon(cy); }`:

```js
function drawGasCloud(cy) {
  if (!gasCloud) return;
  const G = BALANCE_REGISTRY.balloon.gas, h2 = G.cloudRows * BH;
  const y = Math.round(gasCloud.wy - cy - h2), bh = Math.round(h2 * 2), fade = Math.min(1, gasCloud.t / 60);
  if (y > H || y + bh < 0) return;
  ctx.globalAlpha = (0.14 + 0.04 * Math.sin(tick * 0.12)) * fade;
  ctx.fillStyle = '#9BD44A'; ctx.fillRect(0, y, W, bh);
  if (!reduceMotion) {                                    // drifting toxic motes
    ctx.globalAlpha = 0.3 * fade; ctx.fillStyle = '#C4E87A';
    for (let i = 0; i < 8; i++) {
      const mx = (i * 47 + tick * (0.2 + (i % 3) * 0.1)) % (W + 20) - 10;
      const my = y + 3 + ((i * 29) % Math.max(1, bh - 6));
      ctx.fillRect(Math.round(mx), Math.round(my), 2, 2);
    }
  }
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 6: drawBalloon gas look** — PAL gains `gas: { c1:'#9BD44A', c2:'#3E5A1E' }`; badge block becomes:

```js
  if (kind === 'gift') drawIcon(balloon.type, gx-4, gy-4, true);
  else if (kind === 'gas') {                              // pixel skull badge
    ctx.fillStyle='#E8F2D8';
    ctx.fillRect(gx-2,gy-3,4,3); ctx.fillRect(gx-3,gy-2,6,2); ctx.fillRect(gx-2,gy,1,2); ctx.fillRect(gx+1,gy,1,2);
    ctx.fillStyle='#141022'; ctx.fillRect(gx-2,gy-2,1,1); ctx.fillRect(gx+1,gy-2,1,1);
  }
  else txt(kind === 'golden' ? '$' : kind === 'trap' ? '!' : '?', gx, gy-3, 1, P.c1, 'center');
```

plus, next to the golden sparkle line, a gated pulse: `if (kind === 'gas' && !reduceMotion && Math.floor(tick/8)%2===0) { ctx.fillStyle='#C4E87A'; ctx.fillRect(bx-6, by-1, 1, 1); ctx.fillRect(bx+5, by-4, 1, 1); }`

- [ ] **Step 7: Suite** (background) — all v109 Task 1+2 checks and the extended v108 kind checks green.

### Task 3: One-lane cleanup (tutorial, chip, bar)

**Files:**
- Modify: `index.html:1344-1360` (TUT_LESSONS compacts + advanceTutorial), `index.html:1412` (tutStep init), `index.html:5554` (chip y), `index.html:5566-5568` (bar gate), `index.html:5643-5648` (single-strip render)
- Test: `tests/headless.js` — new v109 checks + re-anchor legacy checks at lines 373-374 (tut save), 1547-1549 (chip shift), 1570 (COMBO compact)

**Interfaces:**
- Consumes: `drawNotifyStrip` fit rule `text.length*6+16 > W-16` (index.html:4058).
- Produces: save key `skystack-tutstep`; compacts sized so `TITLE: COMPACT` ≤ 24 chars (fits W=180).

- [ ] **Step 1: Failing tests:**

```js
check('v109 tutorial is ONE strip: no second yOff-14 lesson call; merged TITLE: BODY form', () =>
  !/drawNotifyStrip\(lbody/.test(src) && /lesson\.title \+ ': ' \+ lesson\.body/.test(src));
check('v109 every lesson fits un-truncated at 180px (fit gate matches drawNotifyStrip)', () => r.run(
  '(() => { const fits = s => s.length*6+16 <= 180-16;' +
  ' return TUT_LESSONS.every(l => fits(l.title+": "+l.compact) || fits(l.compact)); })()'));
check('v109 real-run tutorial progress persists; practice never writes it', () => {
  const tp = fresh();                                     // fresh harness, empty storage
  tp.run('mode="endless"; startRun(); tutStep=1; advanceTutorial(2);');
  const savedStep = saved(tp, 'skystack-tutstep') === 2;
  tp.run('startRun();');
  const resumed = tp.run('tutStep === 2');
  tp.run('mode="practice"; startRun(); tutStep=1; advanceTutorial(2); advanceTutorial(3);');
  const practiceSilent = saved(tp, 'skystack-tutstep') === 2;   // unchanged by practice
  return savedStep && resumed && practiceSilent;
});
check('v109 chip fixed at NOTIFY_CHIP_Y (no tutorial drop)', () =>
  /const y=NOTIFY_CHIP_Y;/.test(src) && !/NOTIFY_CHIP_Y\+\(tutStep>=0\?16:0\)/.test(src));
check('v109 corridor bar only for lane-meaningful families', () =>
  /family==='gust'\|\|m\.family==='target'\|\|m\.family==='visibility'/.test(src));
```

Persistence fixture (fresh harness `tp`): real endless run → `tutStep=1; advanceTutorial(2)` → `saved(tp,'skystack-tutstep')===2`; new `startRun()` resumes `tutStep===2`; then a practice run → advance → stored value unchanged. Re-anchor legacy: line 373 fixture (completion) must run in a REAL mode for `skystack-tut` to persist — adjust the fixture's mode, keep its assertion; 1547-1549 regex → the new fixed-position form; 1570 compact → `'STREAKS PAY MORE'`.

- [ ] **Step 2: TUT_LESSONS compacts** (bodies unchanged; compacts sized for `TITLE: COMPACT` ≤ 24 chars):

```js
const TUT_LESSONS = [
  // compact: sized so 'TITLE: COMPACT' fits a 180px phone inside drawNotifyStrip's limit
  { title:'DROP',     body:'TAP WHEN THE BLOCK IS CENTERED', compact:'TAP WHEN CENTERED' },
  { title:'PERFECT',  body:'MATCH EDGES TO RESTORE WIDTH',   compact:'MATCH THE EDGES' },
  { title:'COMBO',    body:'10 STRAIGHT PERFECTS = FEVER',   compact:'STREAKS PAY MORE' },
  { title:'BALANCE',  body:'OFFSET DROPS LEAN THE TOWER',    compact:'OFFSETS TIP IT' },
  { title:'SKYBREAK', body:'GROW TO FULL WIDTH FOR +50',     compact:'FULL WIDTH +50' }
];
```

- [ ] **Step 3: advanceTutorial persistence:**

```js
function advanceTutorial(h) {
  if (tutStep < 0) return;
  const was = tutStep;
  if (tutStep === 1) tutStep = 2;
  else if (tutStep === 2 && h >= 3) tutStep = 3;
  else if (tutStep === 3 && h >= 5) tutStep = 4;
  else if (tutStep === 4 && h >= 8) { tutStep = -1; tutDone = true; }
  if (tutStep !== was && !activeMode().practice) {        // lessons persist across runs; practice is a sandbox
    if (tutDone) store.set('skystack-tut', true);
    else store.set('skystack-tutstep', tutStep);
  }
}
```

- [ ] **Step 4: tutStep init** (line 1412):

```js
  tutStep = m.practice ? 0 : (tutDone ? -1 : clamp(store.get('skystack-tutstep', 0) | 0, 0, TUT_LESSONS.length - 1));
```

- [ ] **Step 5: single-strip render** (replace 5643-5648 block):

```js
  // first-run / PRACTICE onboarding: one compact line in the shared notification lane
  if (tutStep >= 0 && !curNote) {
    const lesson = TUT_LESSONS[Math.min(tutStep, TUT_LESSONS.length-1)];
    const pre = m.practice ? 'PRACTICE ' : '';
    const fits = s => s.length * 6 + 16 <= W - 16;        // drawNotifyStrip's real limit
    let line = pre + lesson.title + ': ' + lesson.body;
    if (!fits(line)) line = pre + lesson.title + ': ' + lesson.compact;
    if (!fits(line)) line = lesson.compact;
    drawNotifyStrip(line, .92, 'rgba(255,215,94,0.55)');
  }
```

- [ ] **Step 6: chip + bar** — line 5554 → `const y=NOTIFY_CHIP_Y;   // the tutorial is one line now — the chip never drops`; wrap the lane-bar lines (5566-5568):

```js
  if (m.family==='gust'||m.family==='target'||m.family==='visibility') {   // corridor bar only where a lane means something
    const lane=modifierLaneBounds(m,active&&(m.family==='target'));
    ctx.fillStyle='rgba(255,255,255,0.15)';ctx.fillRect(8,y+15,W-16,2);
    ctx.fillStyle=active?'#62E8B5':'#BFE8FF';ctx.fillRect(Math.round(lane.left),y+15,Math.max(2,Math.round(lane.right-lane.left)),2);
  }
```

- [ ] **Step 7: Full suite green** (background, 600s) — adapt any remaining legacy check whose contract legitimately changed (document each in the commit message).

- [ ] **Step 8: Commit Tasks 1-3:** `git add index.html tests/headless.js` then commit `v109: gas hazard balloon + level-gated balloon progression + one-lane message cleanup`.

### Task 4: Cache bump + browser QA + deploy

- [ ] Flip the headless cache check to `skystack-v109`; verify sw.js still v108; set `sw.js:2` to `skystack-v109`; full suite (background).
- [ ] Browser QA (preview :3000, recv.js :8124 one-shot per capture, `fadeT=0`, `fitCanvas()/relayout()`): (1) force a gas balloon + burst → danger strip, cloud band render, top block visibly narrowing while inside; (2) tutorial lesson = single strip, no mid-word cut at W=180; (3) STONE RHYTHM chip with NO bar; a gust modifier WITH bar. Capture composite PNG proof.
- [ ] Commit `Bump cache to v109`; verify; `git push origin main` (separate command).

### Task 5: Vault close-out

- [ ] Update `../AI-CONTEXT/PROJECTS/SKYSTACK/CURRENT_STATE.md` + `CURRENT_HANDOFF.md` (next: verdict at `?fresh=109`; then remaining phase-2 physics scaling and/or hybrid checkpoint starts), DECISIONS #56 (gas contract + progression gates + one-lane rule), dated session log, delete `RECOVERY_CHECKPOINT.md`, commit + push AI-CONTEXT. Hand Asher `https://asherbb6.github.io/SKYSTACK/?fresh=109`.
