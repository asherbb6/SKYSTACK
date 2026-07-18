# Level Result Screen Cleanup Implementation Plan (v107)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the campaign win/fail result screens — remove the cut-off checkpoint caption, reword the confusing bonus line, add a split HOME | SKY MAP button on both screens, and guarantee no text/button overlap or cutoff at any aspect ratio.

**Architecture:** SKYSTACK is a single-file canvas game (`index.html`). Changes touch `renderLevelWin`/`renderLevelFail` (draw), `relayout()` (WIN_ROWS/FAIL_ROWS button geometry), and the `levelwin`/`levelfail` branches of `pressDown` (tap routing). A new instrumented-`txt` test sweep (adapting the v96 renderHUD harness) renders both screens across five viewports and fails on any out-of-bounds text, overlapping text, or overlapping/off-screen button row.

**Tech Stack:** Vanilla JS, Node `vm` test harness (`node tests/headless.js`, ~4 min — 600s timeout or background), GitHub Pages deploy on `main` push.

**Spec:** `docs/superpowers/specs/2026-07-18-result-screen-cleanup-design.md`

## Global Constraints

- Pushing `main` DEPLOYS. Push only in Task 4 after sw.js CACHE = `skystack-v107`, matching test, full suite green.
- Bitmap font is 6px/char; a `txt(t,x,y,sc,col,align)` box is `len*6*sc - sc` wide. Phones run at W=180 logical minimum. Every result-screen text line must stay within `[0,W]` at all tested viewports.
- Copy: use "BONUS" (matches v106 in-run wording), never "MODS" or "CHALLENGE", for the modifier result line.
- Split nav routing: left half → HOME (`state='home'; fadeT=1`, no map), right half → SKY MAP (`state='home'; fadeT=1; openSkyMap()`).
- Never `;`-chain `git commit` and `git push` in PowerShell; use `-m` single-line or `-F <file>`; confirm the intended commit landed before pushing.
- The S7 frame-budget check flakes under load — quietly re-run once on a lone S7 failure.
- Line numbers are as of `82820a5`; re-locate by searching the quoted code if drifted.

---

### Task 1: Win-screen content — remove caption, reword bonus, add the overlap sweep

**Files:**
- Modify: `index.html` — `renderLevelWin` caption (~5394-5396), stats block (~5428-5434)
- Test: `tests/headless.js` — add a v107 section after the v106 checks (~1556)

**Interfaces:**
- Consumes: existing `renderLevelWin()`, globals `runPerfects`, `blocks`, `runLaunch`, `modifierResults`, `modifierWins`, `modifierBonusCoins`, `winReward`, `winFirst`, `winT`, `prog`, `WIN_ROWS`.
- Produces: no new functions. Task 2 relies on `WIN_ROWS` still existing and the sweep harness being present.

- [ ] **Step 1: Write the failing overlap/bounds sweep for renderLevelWin**

Add after the last v106 check in `tests/headless.js` (search `v106 no modifier BONUS note loses its reward`, insert the block after that `check(...)`):

```js
// ---------- v107: result screen cleanup ----------
// txt() instrumented: every non-shadow glyph box must stay on-screen and not overlap another;
// every WIN_ROWS/FAIL_ROWS button must stay on-screen and not overlap another row.
function resultSweep(renderName, setup) {
  const overl = (a,b) => a.y < b.y+7*b.sc && b.y < a.y+7*a.sc && a.x0 < b.x1 && b.x0 < a.x1;
  for (const [w,hh] of [[180,390],[180,520],[242,300],[320,480],[480,270]]) {
    for (const fx of setup) {
      const r = makeGame();
      r.run('W='+w+';H='+hh+';');
      r.run(fx);
      const bad = r.run(
        '(() => { relayout();' +
        ' const calls=[]; const orig=txt;' +
        ' txt=(t,x,y,sc,col,al)=>{sc=sc||1;t=String(t);const tw=t.length*6*sc-sc;' +
        '  const x0=al==="center"?Math.round(x-tw/2):al==="right"?Math.round(x-tw):x;' +
        '  if(String(col).indexOf("0,0,0")<0)calls.push({x0,x1:x0+tw,y,sc});};' +
        ' try { '+renderName+'(); } finally { txt=orig; }' +
        ' for (const c of calls) if (c.x0 < 0 || c.x1 > W) return "text off screen at "+W+"x"+H;' +
        ' for (let i=0;i<calls.length;i++) for (let j=i+1;j<calls.length;j++)' +
        '   if (overl(calls[i],calls[j])) return "text overlap at "+W+"x"+H;' +
        ' const rows='+(renderName==='renderLevelWin'?'WIN_ROWS':'FAIL_ROWS')+';' +
        ' for (const rw of rows) if (rw.x<0||rw.x+rw.w>W||rw.y<0||rw.y+rw.h>H) return "button off screen at "+W+"x"+H;' +
        ' for (let i=0;i<rows.length;i++) for (let j=i+1;j<rows.length;j++)' +
        '   { const a=rows[i],b=rows[j]; if (a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h) return "button overlap at "+W+"x"+H; }' +
        ' return true; })()');
      if (bad !== true) return renderName+' '+bad;
    }
  }
  return true;
}
const winFixtures = [
  'prog=10; startLevel(0); score=500; runPerfects=TIERS[0].n; while(blocks.length<TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"}); afterPlace({x:0,w:96,col:"#fff"}, false, W/2); winT=80;',
  'prog=10; startLevel(7); score=800; runPerfects=5; while(blocks.length<TIERS[7].n) blocks.push({x:0,w:96,col:"#fff"}); afterPlace({x:0,w:96,col:"#fff"}, false, W/2); modifierResults=[{name:"X",success:true,rewardCoins:8}]; modifierWins=1; modifierBonusCoins=8; winT=80;',
  'prog=10; startLevel(TIERS.length-1); score=900; runPerfects=2; while(blocks.length<TIERS[TIERS.length-1].n) blocks.push({x:0,w:96,col:"#fff"}); afterPlace({x:0,w:96,col:"#fff"}, false, W/2); winT=80;',
];
check('v107 level-win: no text/button overlaps or leaves the screen at any aspect ratio', () =>
  resultSweep('renderLevelWin', winFixtures));
check('v107 level-win: the cut-off checkpoint caption is gone', () =>
  !/CHECKPOINT - '\+cp\.scoreMultiplier/.test(src) && !/GROUND START - FULL SCORE/.test(src));
check('v107 level-win: bonus line uses plain BONUS wording, not MODS', () =>
  /BONUS DONE/.test(src) && / OF '\+modifierResults\.length\+' BONUS/.test(src) && !/- MODS /.test(src));
```

- [ ] **Step 2: Run the suite — new checks fail on the current screen**

Run: `node tests/headless.js` (600s/background)
Expected: FAIL — the caption-gone and BONUS-wording checks (old code still there); the overlap sweep MAY fail at 180-wide on the current caption. All other checks PASS.

- [ ] **Step 3: Remove the checkpoint caption**

In `renderLevelWin`, delete these two lines (~5395-5396):

```js
  const cp=runContext&&runContext.checkpointSnapshot?runContext.checkpointSnapshot:checkpointForLevel(runLevel);
  txt(cp.startAltitude?cp.name+' CHECKPOINT - '+cp.scoreMultiplier+'X SCORE':'GROUND START - FULL SCORE',W/2,topY-10,1,'rgba(255,246,232,0.58)','center');
```

(Leave the `const topY = Math.round(H*.13);` line above them and the `LEVEL ' + num` line below them.)

- [ ] **Step 4: Reword the bonus line into a flowing stats block**

Replace the stats block (~5428-5434):

```js
  const placed = Math.max(1, blocks.length - runLaunch);
  txt('PERFECTS '+runPerfects+'/'+placed+(modifierResults.length?' - MODS '+modifierWins+'/'+modifierResults.length+' +'+modifierBonusCoins:''), W/2, starY + 18, 1, 'rgba(255,246,232,0.55)', 'center');
  if (winT > 48) {   // reward counts up
    const shown = Math.min(winReward, Math.floor((winT - 48) * 1.5));
    drawCoin(W/2 - 20, starY + 31.5);
    txt('+' + shown, W/2 - 9, starY + 31, 1, '#FFD75E', 'left');
    if (winFirst) txt(prog === TIERS.length ? 'SKY CONQUERED!' : 'NEW STAGE UNLOCKED!', W/2, starY + 44, 1, '#62E8B5', 'center');
  }
```

with (each row on its own line via a running `sy` cursor; the bonus row only appears when a bonus ran):

```js
  const placed = Math.max(1, blocks.length - runLaunch);
  let sy = starY + 18;
  txt('PERFECTS '+runPerfects+'/'+placed, W/2, sy, 1, 'rgba(255,246,232,0.55)', 'center'); sy += 11;
  if (modifierResults.length) {   // optional bonus challenge result — plain wording, own row
    const allWon = modifierWins === modifierResults.length;
    const bt = (allWon ? 'BONUS DONE' : modifierWins+' OF '+modifierResults.length+' BONUS') + (modifierBonusCoins > 0 ? ' +'+modifierBonusCoins : '');
    txt(bt, W/2, sy, 1, allWon ? '#62E8B5' : 'rgba(255,246,232,0.55)', 'center'); sy += 11;
  }
  if (winT > 48) {   // reward counts up
    const shown = Math.min(winReward, Math.floor((winT - 48) * 1.5));
    drawCoin(W/2 - 20, sy + 1.5);
    txt('+' + shown, W/2 - 9, sy + 1, 1, '#FFD75E', 'left'); sy += 13;
    if (winFirst) txt(prog === TIERS.length ? 'SKY CONQUERED!' : 'NEW STAGE UNLOCKED!', W/2, sy, 1, '#62E8B5', 'center');
  }
```

- [ ] **Step 5: Run the suite — win sweep + content checks pass**

Run: `node tests/headless.js` (600s/background)
Expected: the three v107 win checks PASS. If the sweep still reports "text off screen" at 180-wide, the offender is the tier name (scale 2) or `COMPLETE!` (scale 3); add a scale-down guard right before each: `const nsc = t.name.length*12-2 > W-8 ? 1 : 2;` and use `nsc`, and `const csc = (winT<14?3:2); const csc2 = 'COMPLETE!'.length*6*csc-csc > W-8 ? csc-1 : csc;`. Re-run. (Everything else stays green; Task 2 handles the buttons.)

- [ ] **Step 6: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v107: level-win screen - drop checkpoint caption, plain BONUS line, overlap sweep"
```

---

### Task 2: Split HOME | SKY MAP button on both screens

**Files:**
- Modify: `index.html` — `relayout()` WIN_ROWS/FAIL_ROWS (~1875-1878), a new `drawNavSplit` helper (near `renderLevelWin`, ~5350), `renderLevelWin` button loop (~5436-5443), `renderLevelFail` button loop (~5482-5487), `pressDown` levelwin branch (~2045-2050), `pressDown` levelfail branch (~2056-2062)
- Test: `tests/headless.js` — add fail-screen sweep + split-routing checks to the v107 section

**Interfaces:**
- Consumes: `WIN_ROWS`, `FAIL_ROWS`, `plate3D`, `txt`, `openSkyMap`, `startLevel`, `finalizeRun`, `inR`, `resultSweep`/`winFixtures` from Task 1.
- Produces: `drawNavSplit(rw, accent)` — draws a split HOME|SKY MAP plate. Both render loops call it for the `nav` row.

- [ ] **Step 1: Write the failing fail-screen sweep + split-routing checks**

Append to the v107 test section:

```js
const failFixtures = [
  'prog=10; startLevel(0); score=300; while(blocks.length<20) blocks.push({x:0,w:96,col:"#fff"}); gameOver("topple"); failT=80;',
  'prog=10; startLevel(7); score=300; while(blocks.length<TIERS[6].n+10) blocks.push({x:0,w:96,col:"#fff"}); gameOver("fall"); failT=80;',
];
check('v107 level-fail: no text/button overlaps or leaves the screen at any aspect ratio', () =>
  resultSweep('renderLevelFail', failFixtures));
check('v107 both result screens carry a nav split row (HOME | SKY MAP)', () => fresh.run(
  '(() => { W=320;H=480;relayout(); return WIN_ROWS.some(r=>r.id==="nav") && FAIL_ROWS.some(r=>r.id==="nav") && !WIN_ROWS.some(r=>r.id==="map") && !FAIL_ROWS.some(r=>r.id==="home"); })()'));
check('v107 nav split routes left half HOME, right half SKY MAP', () =>
  /drawNavSplit/.test(src) &&
  /state = 'home'; fadeT = 1; if \(p\.x >= rw\.x \+ rw\.w\/2\) openSkyMap\(\);/.test(src));
check('v107 win: tapping the nav row left half goes home without opening the map', () => { const g=makeGame();
  g.run('startLevel(0); while(blocks.length<TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"}); afterPlace({x:0,w:96,col:"#fff"}, false, W/2); winT=80; skyMap=false;');
  g.run('const rw=WIN_ROWS.find(r=>r.id==="nav"); pressDown({x:rw.x+4, y:rw.y+4});');
  return g.run('state==="home" && skyMap===false'); });
check('v107 win: tapping the nav row right half opens the sky map', () => { const g=makeGame();
  g.run('startLevel(0); while(blocks.length<TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"}); afterPlace({x:0,w:96,col:"#fff"}, false, W/2); winT=80; skyMap=false;');
  g.run('const rw=WIN_ROWS.find(r=>r.id==="nav"); pressDown({x:rw.x+rw.w-4, y:rw.y+4});');
  return g.run('state==="home" && skyMap===true'); });
```

- [ ] **Step 2: Run the suite — the new fail/split checks fail**

Run: `node tests/headless.js` (600s/background)
Expected: FAIL — the nav-id check (rows still `map`/`home`), the drawNavSplit source check, both routing checks; the fail sweep may pass or fail depending on current layout. Win checks from Task 1 still PASS.

- [ ] **Step 3: Change the button row ids in `relayout()`**

Replace (~1875-1878):

```js
  WIN_ROWS = ['next','retry','map'].map((id, i) =>
    ({ id, x: Math.round(W/2 - rowW/2), y: Math.round(H*.58) + i*26, w: rowW, h: 20 }));
  FAIL_ROWS = ['retry','map','home'].map((id, i) =>
    ({ id, x: Math.round(W/2 - rowW/2), y: Math.round(H*.56) + i*26, w: rowW, h: 20 }));
```

with:

```js
  WIN_ROWS = ['next','retry','nav'].map((id, i) =>
    ({ id, x: Math.round(W/2 - rowW/2), y: Math.round(H*.58) + i*26, w: rowW, h: 20 }));
  FAIL_ROWS = ['retry','nav'].map((id, i) =>
    ({ id, x: Math.round(W/2 - rowW/2), y: Math.round(H*.56) + i*26, w: rowW, h: 20 }));
```

- [ ] **Step 4: Add the `drawNavSplit` helper**

Immediately before `function renderLevelWin() {` (~5351), insert:

```js
function drawNavSplit(rw, accent) {   // one plate, two tap targets: left HOME, right SKY MAP
  plate3D(rw.x, rw.y, rw.w, rw.h, 'rgba(255,246,232,0.12)', accent);
  ctx.fillStyle = accent; ctx.fillRect(Math.round(rw.x + rw.w/2), rw.y + 3, 1, rw.h - 6);   // center divider
  const half = rw.w/2;
  txt('HOME', Math.round(rw.x + rw.w/4), rw.y + 7, 1, '#FFF6E8', 'center');
  txt(('SKY MAP'.length*6-1 > half-8) ? 'MAP' : 'SKY MAP', Math.round(rw.x + rw.w*3/4), rw.y + 7, 1, '#FFF6E8', 'center');
}
```

- [ ] **Step 5: Call `drawNavSplit` from the win button loop**

Replace the win button loop (~5436-5443):

```js
  if (winT > 24) {
    const last = runLevel + 1 >= TIERS.length;
    const labels = { next: last ? 'BACK TO MAP' : 'NEXT LEVEL', retry: 'RETRY', map: 'SKY MAP' };
    for (const rw of WIN_ROWS) {
      const main = rw.id === 'next';
      plate3D(rw.x, rw.y, rw.w, rw.h, main ? playA(.85) : 'rgba(255,246,232,0.12)', main ? null : t.c);
      txt(labels[rw.id], W/2, rw.y + 7, 1, main ? '#08301F' : '#FFF6E8', 'center');
    }
```

with:

```js
  if (winT > 24) {
    const last = runLevel + 1 >= TIERS.length;
    const labels = { next: last ? 'BACK TO MAP' : 'NEXT LEVEL', retry: 'RETRY' };
    for (const rw of WIN_ROWS) {
      if (rw.id === 'nav') { drawNavSplit(rw, t.c); continue; }
      const main = rw.id === 'next';
      plate3D(rw.x, rw.y, rw.w, rw.h, main ? playA(.85) : 'rgba(255,246,232,0.12)', main ? null : t.c);
      txt(labels[rw.id], W/2, rw.y + 7, 1, main ? '#08301F' : '#FFF6E8', 'center');
    }
```

- [ ] **Step 6: Call `drawNavSplit` from the fail button loop**

Replace the fail button loop (~5482-5487):

```js
    const labels = { retry: 'RETRY', map: 'SKY MAP', home: 'HOME' };
    for (const rw of FAIL_ROWS) {
      const main = rw.id === 'retry';
      plate3D(rw.x, rw.y, rw.w, rw.h, main ? playA(.85) : 'rgba(255,246,232,0.12)', main ? null : 'rgba(255,246,232,0.3)');
      txt(labels[rw.id], W/2, rw.y + 7, 1, main ? '#08301F' : '#FFF6E8', 'center');
    }
```

with:

```js
    for (const rw of FAIL_ROWS) {
      if (rw.id === 'nav') { drawNavSplit(rw, 'rgba(255,246,232,0.3)'); continue; }
      const main = rw.id === 'retry';
      plate3D(rw.x, rw.y, rw.w, rw.h, main ? playA(.85) : 'rgba(255,246,232,0.12)', main ? null : 'rgba(255,246,232,0.3)');
      txt('RETRY', W/2, rw.y + 7, 1, main ? '#08301F' : '#FFF6E8', 'center');
    }
```

- [ ] **Step 7: Route the win tap (pressDown levelwin)**

Replace (~2045-2050):

```js
    for (const rw of WIN_ROWS) if (inR(p, rw, 3)) {
      if (rw.id === 'next') { if (runLevel + 1 < TIERS.length) startLevel(runLevel + 1); else { state = 'home'; fadeT = 1; openSkyMap(); } }
      else if (rw.id === 'retry') startLevel(runLevel,runContext.checkpointSnapshot.id,runContext.seed);
      else { state = 'home'; fadeT = 1; openSkyMap(); }
      sfx.tap(); return;
    }
```

with:

```js
    for (const rw of WIN_ROWS) if (inR(p, rw, 3)) {
      if (rw.id === 'next') { if (runLevel + 1 < TIERS.length) startLevel(runLevel + 1); else { state = 'home'; fadeT = 1; openSkyMap(); } }
      else if (rw.id === 'retry') startLevel(runLevel,runContext.checkpointSnapshot.id,runContext.seed);
      else { state = 'home'; fadeT = 1; if (p.x >= rw.x + rw.w/2) openSkyMap(); }   // nav split: left HOME, right SKY MAP
      sfx.tap(); return;
    }
```

- [ ] **Step 8: Route the fail tap (pressDown levelfail)**

Replace (~2056-2062):

```js
    for (const rw of FAIL_ROWS) if (inR(p, rw, 3)) {
      finalizeRun();                          // walking away from the offer settles the run
      if (rw.id === 'retry') startLevel(runLevel,runContext.checkpointSnapshot.id,runContext.seed);
      else if (rw.id === 'map') { state = 'home'; fadeT = 1; openSkyMap(); }
      else { state = 'home'; fadeT = 1; }
      sfx.tap(); return;
    }
```

with:

```js
    for (const rw of FAIL_ROWS) if (inR(p, rw, 3)) {
      finalizeRun();                          // walking away from the offer settles the run
      if (rw.id === 'retry') startLevel(runLevel,runContext.checkpointSnapshot.id,runContext.seed);
      else { state = 'home'; fadeT = 1; if (p.x >= rw.x + rw.w/2) openSkyMap(); }   // nav split: left HOME, right SKY MAP
      sfx.tap(); return;
    }
```

- [ ] **Step 9: Full suite green**

Run: `node tests/headless.js` (600s/background)
Expected: ALL checks pass, including both v107 sweeps and the four split checks. (Lone S7 failure → quiet re-run.)

- [ ] **Step 10: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v107: split HOME | SKY MAP nav button on win and fail screens"
```

---

### Task 3: Cache bump + browser QA across aspect ratios + deploy

**Files:**
- Modify: `sw.js:2`, `tests/headless.js` (cache check ~1586)

- [ ] **Step 1: Cache check red→green**

In `tests/headless.js` change `check('sw.js cache bumped to v106', ...)` to expect `skystack-v107`; verify sw.js still says v106 (`Select-String -Path sw.js -Pattern "skystack-v10[67]"`), then set `sw.js:2` to `const CACHE = 'skystack-v107';`.

- [ ] **Step 2: Full suite green**

Run: `node tests/headless.js` (600s/background). Expected: ALL pass.

- [ ] **Step 3: Browser smoke-check at two aspect ratios**

Preview :3000 (launch.json `skystack`); recv.js on :8124 from scratchpad. Drive a level win in ONE javascript_tool call: `paused=false`, resize to a tall phone (`W=180;H=390;relayout()`), `startLevel(7)`, stack to the goal, `afterPlace(...)` to trigger the win, set `winT=80`, `render()`, POST `ctx.canvas.toDataURL()`, return `{winRows: WIN_ROWS.map(r=>r.id)}`. Read the PNG: confirm no cut-off text at top, the split HOME | SKY MAP button reads clearly, the bonus line (if present) says "BONUS ...". Repeat with a short-wide shape (`W=480;H=270`). Then drive a fail (`gameOver("topple"); failT=80`) and capture once. Never return base64 through the transcript.

- [ ] **Step 4: Commit and deploy**

```bash
git add sw.js tests/headless.js
git commit -m "Bump cache to v107"
git push origin main
```

---

### Task 4: Vault close-out

Update `../AI-CONTEXT/PROJECTS/SKYSTACK/CURRENT_STATE.md` + `CURRENT_HANDOFF.md` (next: Asher's verdict at `?fresh=107`, then balloon phase 1 → phase 2 → hybrid block starts), add a DECISIONS entry (#54: result-screen nav = split HOME|SKY MAP, bonus wording, no-overlap sweep contract), add a dated session log, delete `RECOVERY_CHECKPOINT.md`, commit and push AI-CONTEXT `main`. Hand Asher `https://asherbb6.github.io/SKYSTACK/?fresh=107`.
