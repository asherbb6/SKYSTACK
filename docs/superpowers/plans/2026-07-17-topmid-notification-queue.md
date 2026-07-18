# Top-Middle Notification Queue Implementation Plan (v105)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All in-run messages flow through one top-middle priority queue (one at a time under the HUD); the modifier strip becomes a compact chip; the bottom tutorial/modifier strips are deleted.

**Architecture:** SKYSTACK is a single-file canvas game (`index.html`). A `notes` queue + `curNote` global replace the `bannerText/bannerT/toastMsg/toastT` pairs; `update(dt)` ticks dwell and promotes the highest-priority queued note; `render()` draws only `curNote` via the existing `drawNotifyStrip`. `renderModifierHUD` is rewritten as a chip at `NOTIFY_CHIP_Y`; the tutorial hint renders in the lane when idle. Tests in `tests/headless.js` (vm harness) are rewritten where they assert the old architecture.

**Tech Stack:** Vanilla JS, Node `vm` test harness (`node tests/headless.js` — takes ~4 min, run with 600s timeout or in background), GitHub Pages deploy on `main` push.

**Spec:** `docs/superpowers/specs/2026-07-17-topmid-notification-queue-design.md`

## Global Constraints

- Pushing `main` DEPLOYS. Push only in Task 3 after sw.js CACHE = `skystack-v105`, matching test, full suite green.
- Priorities: 3 danger (interrupts; RESERVED — nothing ships at 3), 2 modifier/challenge transitions, 1 progress banners, 0 flavor toasts. FIFO within a priority.
- Menu toasts (share/shop) keep working through the `toast()` shim — `update()` runs in all states, so notes tick on menus too.
- v96 copy rules hold: `drawNotifyStrip` clamps to screen width; keep its code unchanged.
- The S7 frame-budget check flakes under load — quietly re-run once on a lone S7 failure.
- Line numbers are as of v104 `f3a68a5` (+ spec commit `9a9847e`); re-locate by searching the quoted code if drifted.

---

### Task 1: Queue core + banner/toast migration

**Files:**
- Modify: `index.html` — globals (~1053, 1068-1069), `finishModifier` (~1100), `updateModifiersForPlacement` (~1109), challenge clear (~1316), `resetRun` (~1386), supernova (~1580), skybreak (~1608), tier banner (~1648-1655), `update(dt)` timers (~2166, 2173), render (~4115-4121)
- Test: `tests/headless.js` — rewrite lines 205/210/214, block 1276-1292; add v105 queue section above the sw-cache check

**Interfaces:**
- Consumes: existing `drawNotifyStrip(text, alpha, accent, yOff)`, `update(dt)`, `resetRun()`.
- Produces: globals `notes` (array of `{text, accent, pri, dur, t}`), `curNote` (same shape or null), `note(text, accent, pri, dur)`, `toast(m)` shim. Task 2 relies on `curNote` (tutorial idle check) and `note()` (activation notes).

- [ ] **Step 1: Rewrite the stale-architecture tests + add the failing v105 queue tests**

In `tests/headless.js` replace line 205:

```js
check('endless first reach of stage 1: LEVEL CLEAR banner', () => lc.run('bannerText === "LEVEL CLEAR - CAVES"'));
```

with:

```js
check('endless first reach of stage 1: LEVEL CLEAR note queued', () => lc.run(
  'notes.concat(curNote?[curNote]:[]).some(n=>n.text==="LEVEL CLEAR - CAVES")'));
```

Replace line 210:

```js
check('endless re-reaching a cleared stage: plain milestone banner', () => lc.run('bannerText === (TIERS[0].n*METERS_PER) + "M - " + TIERS[0].name'));
```

with:

```js
check('endless re-reaching a cleared stage: plain milestone note', () => lc.run(
  'notes.concat(curNote?[curNote]:[]).some(n=>n.text===(TIERS[0].n*METERS_PER)+"M - "+TIERS[0].name)'));
```

Replace line 214:

```js
check('endless reaching THE STARS first time: SKY CONQUERED banner', () => lc.run('bannerText === "SKY CONQUERED!"'));
```

with:

```js
check('endless reaching THE STARS first time: SKY CONQUERED note queued', () => lc.run(
  'notes.concat(curNote?[curNote]:[]).some(n=>n.text==="SKY CONQUERED!")'));
```

Replace the whole block from `check('v94 banner/toast render as a shared HUD notification strip below the HUD block', () =>` (line ~1276) through the end of the `banner/toast overlap fix` check (line ~1292) with:

```js
check('v105 all notifications render through one top-middle queue (no banner/toast pair)', () =>
  /function drawNotifyStrip\(/.test(src) &&
  /function note\(/.test(src) &&
  /drawNotifyStrip\(curNote\.text/.test(src) &&
  !/drawNotifyStrip\(toastMsg/.test(src) && !/drawNotifyStrip\(bannerText/.test(src));
check('v94 notification strip sits directly under the HUD block, not mid-play-column', () => fresh.run(
  '(() => { W=320;H=480;relayout(); return NOTIFY_Y >= 60 && NOTIFY_Y <= 76; })()'));
```

Then insert a new section ABOVE `check('sw.js cache bumped to v104', ...)`:

```js
// ---------- v105: top-middle notification queue ----------
const nq = makeGame();
nq.run('mode="endless"; resetRun(); state="playing";');
check('v105 queue: highest priority first, FIFO within a priority', () => nq.run(
  '(() => { notes=[]; curNote=null;' +
  ' note("A0",null,0); note("B1",null,1); note("C1",null,1); note("D0",null,0);' +
  ' const got=[]; for (let i=0;i<4;i++) { update(1); got.push(curNote.text); curNote=null; }' +
  ' return got.join(",")==="B1,C1,A0,D0"; })()'));
check('v105 queue: dwell expiry advances to the next note', () => nq.run(
  '(() => { notes=[]; curNote=null; note("SHORT",null,1,10); note("NEXT",null,0);' +
  ' update(1); if (curNote.text!=="SHORT") return "wrong first: "+curNote.text;' +
  ' update(10); update(1); return curNote!==null && curNote.text==="NEXT"; })()'));
check('v105 queue: priority-3 interrupts the showing note', () => nq.run(
  '(() => { notes=[]; curNote=null; note("CALM",null,1); update(1);' +
  ' note("DANGER",null,3); return curNote.text==="DANGER"; })()'));
check('v105 queue: cap 6 drops the oldest lowest-priority queued note', () => nq.run(
  '(() => { notes=[]; curNote={text:"HOLD",accent:"#FFF",pri:1,dur:9999,t:0};' +
  ' for (let i=0;i<6;i++) note("N"+i,null,i===0?0:1); note("LAST",null,1);' +
  ' return notes.length===6 && !notes.some(n=>n.text==="N0") && notes.some(n=>n.text==="LAST"); })()'));
check('v105 queue: resetRun clears queue and current note', () => nq.run(
  '(() => { note("X",null,1); update(1); resetRun(); return notes.length===0 && curNote===null; })()'));
check('v105: legacy banner/toast state is gone from the source', () =>
  !/bannerT/.test(src) && !/toastT/.test(src) && !/bannerText/.test(src) && !/toastMsg/.test(src));
```

- [ ] **Step 2: Run the suite — new/rewritten checks fail, everything else passes**

Run: `node tests/headless.js` (600s timeout or background)
Expected: FAIL — the three lc note checks (notes undefined), the v105 architecture check, and all six v105 queue checks. All other checks PASS.

- [ ] **Step 3: Implement the queue core**

Replace (line ~1053):

```js
let bannerText = '', bannerT = 0;
```

with:

```js
let notes = [], curNote = null;   // one-at-a-time top-middle notification queue (v105)
```

Replace (lines ~1068-1069):

```js
let toastMsg = '', toastT = 0;
function toast(m) { toastMsg = m; toastT = 1.6; }
```

with:

```js
function note(text, accent, pri, dur) {
  const n = { text: String(text), accent: accent || '#FFD75E', pri: pri || 0, dur: dur || 120, t: 0 };
  if (n.pri >= 3 && curNote) { curNote = n; return; }          // danger interrupts the showing note
  notes.push(n);
  if (notes.length > 6) {                                       // drop the oldest lowest-priority queued note
    let di = 0;
    for (let i = 1; i < notes.length; i++) if (notes[i].pri < notes[di].pri) di = i;
    notes.splice(di, 1);
  }
}
function toast(m) { if (m) note(m, 'rgba(255,246,232,0.4)', 0, 96); }
```

In `update(dt)`, replace the two timer lines (~2166 and ~2173):

```js
  if (bannerT > 0) bannerT = Math.max(0, bannerT - .006*dt);
```
```js
  if (toastT > 0) toastT = Math.max(0, toastT - .014*dt);
```

with a single block (put it where the bannerT line was; delete the toastT line):

```js
  if (curNote) { curNote.t += dt; if (curNote.t >= curNote.dur) curNote = null; }
  if (!curNote && notes.length) {
    let bi = 0;
    for (let i = 1; i < notes.length; i++) if (notes[i].pri > notes[bi].pri) bi = i;
    curNote = notes.splice(bi, 1)[0]; curNote.t = 0;
  }
```

In `render()`, replace (~4115-4121):

```js
  if (bannerT > 0) {
    const a = Math.min(1,bannerT*2.2)*(bannerT>.85?(1-bannerT)/.15:1);
    drawNotifyStrip(bannerText, Math.max(0,a), '#FFD75E');
  }
  if (toastT > 0 && toastMsg) {
    drawNotifyStrip(toastMsg, Math.min(1, toastT*2), 'rgba(255,246,232,0.4)', bannerT > 0 ? 16 : 0);
  }
```

with:

```js
  if (curNote) {
    const p = curNote.t / curNote.dur;                       // fast fade-in, hold, fade-out tail
    const a = Math.min(1, p * 8) * (p > .85 ? (1 - p) / .15 : 1);
    drawNotifyStrip(curNote.text, Math.max(0, a), curNote.accent);
  }
```

In `resetRun` (~1386), replace `bannerT = 0;` at the end of this line:

```js
  runCoins = 0; runPerfects = 0; runPowerups = 0; runFevers = 0; runBalloons = 0; runSkybreaks = 0; bannerT = 0;
```

with `notes = []; curNote = null;`:

```js
  runCoins = 0; runPerfects = 0; runPowerups = 0; runFevers = 0; runBalloons = 0; runSkybreaks = 0; notes = []; curNote = null;
```

- [ ] **Step 4: Migrate every banner call site**

`finishModifier` (~1100), replace:

```js
  bannerText=won?m.name+' CLEAR +'+paid:m.name+' ENDED'; bannerT=1;
```

with:

```js
  note(won?m.name+' CLEAR +'+paid:m.name+' ENDED', won?'#62E8B5':'rgba(255,246,232,0.4)', 2);
```

`updateModifiersForPlacement` (~1109), replace:

```js
      if (p.status!=='active') { p.status='active'; bannerText=m.name; bannerT=1; }   // rule lives in the bottom strip; name-only always fits on screen
```

with (name then rule as two sequential notes — the queue shows them one after another, so each always fits):

```js
      if (p.status!=='active') { p.status='active'; note(m.name,'#FFD75E',2); note(m.rule,'#BFE8FF',2,100); }
```

Challenge clear (~1316), replace:

```js
  bannerText='CHALLENGE CLEAR!'+(challengeReward?' +'+challengeReward:''); bannerT=1;
```

with:

```js
  note('CHALLENGE CLEAR!'+(challengeReward?' +'+challengeReward:''), '#62E8B5', 2, 140);
```

Supernova (~1580), replace:

```js
        bannerText = 'SUPERNOVA! 3X'; bannerT = 1;
```

with:

```js
        note('SUPERNOVA! 3X', '#FFD75E', 1);
```

Skybreak (~1608), replace:

```js
    bannerText = 'SKYBREAK! +50'; bannerT = 1;
```

with:

```js
    note('SKYBREAK! +50', '#FFD75E', 1);
```

Tier banner (~1648-1655) — build the text locally, enqueue once. Replace:

```js
    const t = TIERS[tier]; bannerText = t.n*METERS_PER + 'M - ' + t.name; bannerT = 1;
    let reward = 5 + tier * 3;
    if (runContext.rewardPermissions.progress && tier + 1 > prog) {
      prog = tier + 1; store.set('skystack-tiers', prog);
      bannerText = 'LEVEL CLEAR - ' + t.name; reward += 15;
      if (prog === TIERS.length) { bannerText = 'SKY CONQUERED!'; reward += 200; }   // beat the game
    }
```

with:

```js
    const t = TIERS[tier]; let bTxt = t.n*METERS_PER + 'M - ' + t.name;
    let reward = 5 + tier * 3;
    if (runContext.rewardPermissions.progress && tier + 1 > prog) {
      prog = tier + 1; store.set('skystack-tiers', prog);
      bTxt = 'LEVEL CLEAR - ' + t.name; reward += 15;
      if (prog === TIERS.length) { bTxt = 'SKY CONQUERED!'; reward += 200; }   // beat the game
    }
    note(bTxt, '#FFD75E', 1, 140);
```

- [ ] **Step 5: Run the suite**

Run: `node tests/headless.js` (600s/background)
Expected: everything passes EXCEPT checks that reference the still-unchanged modifier strip / tutorial box (`v95 tutorial hint strip...`, `v95 modifier HUD hugs the bottom...`, `v96 notification boxes carry a full 1px outline...`, `v96 modifier banners fit on screen...` regex on bannerText, `v96 in-run strips share one 0.82 backing...`) and the v105 source-purge check (renderModifierHUD/tutorial not yet touched — `bannerT` is gone but the strips remain). Confirm the queue unit checks and lc note checks now PASS. (Task 2 fixes the rest; do NOT commit yet if the suite isn't structured green — proceed straight to Task 2, the two tasks share one commit gate.)

---

### Task 2: Modifier chip + tutorial hint relocation

**Files:**
- Modify: `index.html` — globals declaration line (~1833), `relayout()` (~1837), `renderModifierHUD` (~5478-5499), tutorial block in `renderHUD` (~5573-5580)
- Test: `tests/headless.js` — rewrite v95 block (~1295-1299), v96 outline check (~1340-1342), v96 activation check (~1344-1346), v96 opacity check (~1351-1354); add chip checks to the v105 section

**Interfaces:**
- Consumes: `curNote`, `note()` from Task 1; existing `modifierRuntime`, `modifierLaneBounds`, `TUT_LESSONS`, `drawNotifyStrip`.
- Produces: `NOTIFY_CHIP_Y` layout constant (NOTIFY_Y + 16); chip renderer inside `renderModifierHUD`.

- [ ] **Step 1: Rewrite the strip-era tests + add chip tests**

Replace the v95 block (~1295-1299):

```js
check('v95 tutorial hint strip is flush with the bottom edge, not floating mid-tower', () =>
  /ctx\.fillRect\(0, H-29, W, 29\)/.test(src) &&
  !/ctx\.fillRect\(0, H-94, W, 29\)/.test(src));
check('v95 modifier HUD hugs the bottom and stacks just above an active tutorial strip', () =>
  /y=H-\(tutStep>=0\?61:31\)/.test(src));
```

with:

```js
check('v105 nothing textual renders at the screen bottom in-run: both bottom strips deleted', () =>
  !/ctx\.fillRect\(0, H-29, W, 29\)/.test(src) && !/y=H-\(tutStep>=0\?61:31\)/.test(src));
check('v105 tutorial hint renders in the top-middle lane only while no note is showing', () =>
  /tutStep >= 0 && !curNote/.test(src));
```

Replace the v96 outline check (~1340-1342):

```js
check('v96 notification boxes carry a full 1px outline, not just top/bottom lines', () =>
  /ctx\.fillRect\(x, y, 1, 14\); ctx\.fillRect\(x \+ tw - 1, y, 1, 14\)/.test(src) &&
  /ctx\.fillRect\(4,y,W-8,1\);ctx\.fillRect\(4,y\+29,W-8,1\);ctx\.fillRect\(4,y,1,30\);ctx\.fillRect\(W-5,y,1,30\)/.test(src));
```

with:

```js
check('v96 notification boxes carry a full 1px outline, not just top/bottom lines', () =>
  /ctx\.fillRect\(x, y, 1, 14\); ctx\.fillRect\(x \+ tw - 1, y, 1, 14\)/.test(src) &&
  /ctx\.fillRect\(x,y,tw,1\);ctx\.fillRect\(x,y\+12,tw,1\);ctx\.fillRect\(x,y,1,13\);ctx\.fillRect\(x\+tw-1,y,1,13\)/.test(src));
```

Replace the v96 activation check (~1344-1346):

```js
check('v96 modifier banners fit on screen: activation is name-only, telegraph has no duplicate banner', () =>
  /p\.status='active'; bannerText=m\.name; bannerT=1/.test(src) &&
  !/bannerText='UP NEXT: '/.test(src));
```

with:

```js
check('v96/v105 modifier activation enqueues name then rule; the chip carries the telegraph', () =>
  /p\.status='active'; note\(m\.name,'#FFD75E',2\); note\(m\.rule,'#BFE8FF',2,100\)/.test(src));
```

Replace the v96 opacity check (~1351-1354):

```js
check('v96 in-run strips share one 0.82 backing opacity (visibility pass)', () =>
  /rgba\(11,14,26,0\.82\)'; ctx\.fillRect\(x, y, tw, 14\)/.test(src) &&           // banner/toast strip
  /rgba\(11,14,26,0\.82\)';ctx\.fillRect\(4,y,W-8,30\)/.test(src) &&              // modifier strip
  /rgba\(11,14,26,0\.82\)'; ctx\.fillRect\(0, H-29, W, 29\)/.test(src));          // tutorial strip
```

with:

```js
check('v96 in-run surfaces share one 0.82 backing opacity (visibility pass)', () =>
  /rgba\(11,14,26,0\.82\)'; ctx\.fillRect\(x, y, tw, 14\)/.test(src) &&           // queue strip
  /rgba\(11,14,26,0\.82\)';ctx\.fillRect\(x,y,tw,13\)/.test(src));                 // modifier chip
```

Append to the v105 test section (after the source-purge check):

```js
check('v105 modifier chip: docked at NOTIFY_CHIP_Y, shifts below an active tutorial hint', () =>
  /NOTIFY_CHIP_Y = NOTIFY_Y \+ 16/.test(src) &&
  /NOTIFY_CHIP_Y\+\(tutStep>=0\?16:0\)/.test(src));
check('v105 modifier chip keeps the corridor mini-map lane bar at real screen positions', () =>
  /modifierLaneBounds\(m,active&&\(m\.family==='target'\)\)/.test(src) &&
  /ctx\.fillRect\(8,y\+15,W-16,2\)/.test(src));
```

- [ ] **Step 2: Implement — layout constant**

In the globals declaration (~1833), extend:

```js
    WIN_ROWS, FAIL_ROWS, FAIL_REV, REVIVE_BTN, NOTIFY_Y, BOOST_CARD_H, ME_PROG, SHOP_TOP, BOOST_TOP;
```

to:

```js
    WIN_ROWS, FAIL_ROWS, FAIL_REV, REVIVE_BTN, NOTIFY_Y, NOTIFY_CHIP_Y, BOOST_CARD_H, ME_PROG, SHOP_TOP, BOOST_TOP;
```

In `relayout()` (~1837), replace:

```js
  NOTIFY_Y = 74;   // directly under the full HUD column (combo lane ends 62, wind glyphs end 69)
```

with:

```js
  NOTIFY_Y = 74;   // directly under the full HUD column (combo lane ends 62, wind glyphs end 69)
  NOTIFY_CHIP_Y = NOTIFY_Y + 16;   // persistent modifier chip row, under the message lane
```

- [ ] **Step 3: Implement — rewrite renderModifierHUD as the chip**

Replace the whole function (~5478-5499) with:

```js
function renderModifierHUD(h) {
  if (!runContext||!runContext.modifierPermissions.enabled) return;
  const m=runContext.modifiers.find(x=>{const p=modifierRuntime(x);return p&&(p.status==='active'||p.status==='announced');});
  if (!m) return;
  const p=modifierRuntime(m), active=p.status==='active';
  const y=NOTIFY_CHIP_Y+(tutStep>=0?16:0);   // drop below the two-line tutorial hint when onboarding is up
  const blocksLeft=Math.max(0,m.endAltitude-h+1), inN=Math.max(0,m.startAltitude-h);
  let t=active?m.name+' - '+blocksLeft:m.name+' IN '+inN;
  if (t.length*6-1>W-40) t=m.name;
  const tw=Math.min(W-16,t.length*6-1+14), x=Math.round(W/2-tw/2);
  ctx.fillStyle='rgba(11,14,26,0.82)';ctx.fillRect(x,y,tw,13);
  ctx.fillStyle=active?'rgba(255,215,94,0.8)':'rgba(94,200,242,0.75)';   // full 1px outline
  ctx.fillRect(x,y,tw,1);ctx.fillRect(x,y+12,tw,1);ctx.fillRect(x,y,1,13);ctx.fillRect(x+tw-1,y,1,13);
  txt(t,W/2,y+3,1,active?'#FFD75E':'#BFE8FF','center');
  if (m.family==='gust' && (m.direction>0 ? x+tw+9<=W : x-9>=0))   // arrow only when it fits on screen
    txt(m.direction>0?'>':'<',m.direction>0?x+tw+4:x-4,y+3,1,'#BFE8FF',m.direction>0?'left':'right');
  const lane=modifierLaneBounds(m,active&&(m.family==='target'));   // corridor mini-map: real screen x positions
  ctx.fillStyle='rgba(255,255,255,0.15)';ctx.fillRect(8,y+15,W-16,2);
  ctx.fillStyle=active?'#62E8B5':'#BFE8FF';ctx.fillRect(Math.round(lane.left),y+15,Math.max(2,Math.round(lane.right-lane.left)),2);
}
```

- [ ] **Step 4: Implement — tutorial hint into the lane**

In `renderHUD`, replace the tutorial block (~5573-5580):

```js
  if (tutStep >= 0) {
    const lesson = TUT_LESSONS[Math.min(tutStep, TUT_LESSONS.length-1)];
    ctx.fillStyle = 'rgba(11,14,26,0.82)'; ctx.fillRect(0, H-29, W, 29);
    ctx.fillStyle = 'rgba(255,215,94,0.55)'; ctx.fillRect(0, H-29, W, 1);
    txt((m.practice ? 'PRACTICE ' : '') + lesson.title, W/2, H-23, 1, '#FFD75E', 'center');
    const lbody = (lesson.compact && lesson.body.length*6-1 > W-12) ? lesson.compact : lesson.body;
    txt(lbody, W/2, H-11, 1, '#FFF6E8', 'center');
  }
```

with (two stacked lane rows, yielding to any queued note):

```js
  if (tutStep >= 0 && !curNote) {
    const lesson = TUT_LESSONS[Math.min(tutStep, TUT_LESSONS.length-1)];
    const lbody = (lesson.compact && lesson.body.length*6-1 > W-12) ? lesson.compact : lesson.body;
    drawNotifyStrip((m.practice ? 'PRACTICE ' : '') + lesson.title, .92, 'rgba(255,215,94,0.55)');
    drawNotifyStrip(lbody, .92, 'rgba(255,246,232,0.3)', 14);
  }
```

- [ ] **Step 5: Full suite green**

Run: `node tests/headless.js` (600s/background)
Expected: ALL checks pass, including the v105 section, rewritten v94/v95/v96 checks, and the untouched v96 renderHUD overlap sweeps. (Lone S7 failure → quiet re-run.)

- [ ] **Step 6: Commit Tasks 1+2 together**

```bash
git add index.html tests/headless.js
git commit -m "v105: one top-middle notification queue - chip modifier HUD, no bottom strips"
```

---

### Task 3: Cache bump, browser verification, deploy, vault close-out

**Files:**
- Modify: `sw.js:2`, `tests/headless.js` (cache check), vault docs in `../AI-CONTEXT/PROJECTS/SKYSTACK/`

- [ ] **Step 1: Cache check red→green**

In `tests/headless.js` change `check('sw.js cache bumped to v104', () => /const CACHE = 'skystack-v104'/.test(sw));` to expect `skystack-v105`; verify red with `Select-String -Path sw.js -Pattern "skystack-v10[45]"` (still v104); then set `sw.js:2` to `const CACHE = 'skystack-v105';`.

- [ ] **Step 2: Full suite green**

Run: `node tests/headless.js` (600s/background). Expected: ALL pass.

- [ ] **Step 3: Browser smoke-check on localhost:3000**

Reload the preview. Set `paused = false` FIRST (the game auto-pauses when the pane tab is hidden). In ONE javascript_tool call: start an endless run state, enqueue two notes (`note('MILESTONE TEST','#FFD75E',1); note('TOAST TEST',null,0);`), call `update(1)` then `render()`, POST `ctx.canvas.toDataURL()` to the recv.js listener on :8124 (start it from the scratchpad first), and return only `{showing: curNote && curNote.text, queued: notes.length}`. Verify: the strip renders top-middle under the HUD, `showing === 'MILESTONE TEST'`, one message at a time, and no strip at the bottom of the frame. Read the received PNG. Never return base64 through the transcript.

- [ ] **Step 4: Commit and deploy**

```bash
git add sw.js tests/headless.js
git commit -m "Bump cache to v105"
git push origin main
```

- [ ] **Step 5: Vault close-out per CLAUDE.md**

Update `CURRENT_STATE.md` + `CURRENT_HANDOFF.md` (next action: Asher's verdict at `?fresh=105`; then balloon phase 1, then hybrid block starts — decisions recorded in the checkpoint), add a dated session log, delete `RECOVERY_CHECKPOINT.md`, commit and push AI-CONTEXT `main`. Hand Asher `https://asherbb6.github.io/SKYSTACK/?fresh=105`.
