# Pop-up Copy Clarity Implementation Plan (v106)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every in-run pop-up states its unit and stake; modifier arrival is one `BONUS:` note; ENDED notes are gone; the chip gets units.

**Architecture:** SKYSTACK is a single-file canvas game (`index.html`). This is a copy pass over the v105 note queue: registry `rule` strings rewritten, six `note()`/`toast()` call sites reworded, the chip text formula gains units with the existing fit-gate fallback, one tutorial lesson rewritten. `tests/headless.js` (vm harness) updates two pinned checks and adds a v106 section.

**Tech Stack:** Vanilla JS, Node `vm` test harness (`node tests/headless.js`, ~4 min — 600s timeout or background), GitHub Pages deploy on `main` push.

**Spec:** `docs/superpowers/specs/2026-07-18-popup-copy-clarity-design.md`

## Global Constraints

- Pushing `main` DEPLOYS. Push only in Task 3 after sw.js CACHE = `skystack-v106`, matching test, full suite green.
- Copy rule: every message states unit+stake; no bare numbers; flavor names live on the chip only.
- Queue mechanics (priorities, cap 6, dwell, v105 silent-skip rule) are UNTOUCHED.
- Bitmap font is 6px/char (`len*6-1` px); phones are 180 logical px wide — rely on the existing `drawNotifyStrip` clamp and the chip fit gate, do not add new layout.
- The S7 frame-budget check flakes under load — quietly re-run once on a lone S7 failure.
- Line numbers as of `fc3e8c2`; re-locate by searching the quoted code if drifted.

---

### Task 1: Message copy + tests

**Files:**
- Modify: `index.html` — registry rules (964-975), `finishModifier` (1110), activation (1119), challenge clear (1326), `TUT_LESSONS` (1346), supernova (1590), skybreak (1618), collection toasts (2078, 2086), chip text (5499-5500)
- Test: `tests/headless.js` — rewrite 371 and 1336-1337; append a v106 section after the v105 chip checks (~1550)

**Interfaces:**
- Consumes: v105 `note(text, accent, pri, dur)`, `toast(m)`, `drawNotifyStrip`, chip fit gate.
- Produces: no new functions — copy only. Task 2 relies on the final strings verbatim.

- [ ] **Step 1: Rewrite the two pinned checks + add failing v106 checks**

In `tests/headless.js` replace (line 371, inside its `check(...)` wrapper — keep the surrounding lines):

```js
  '(() => { const s=TUT_LESSONS.map(x=>x.title+" "+x.body).join(" "); return /DROP/.test(s)&&/PERFECT/.test(s)&&/FEVER/.test(s)&&/SUPERNOVA/.test(s)&&/BALANCE/.test(s)&&/SKYBREAK/.test(s); })()'));
```

with:

```js
  '(() => { const s=TUT_LESSONS.map(x=>x.title+" "+x.body).join(" "); return /DROP/.test(s)&&/PERFECT/.test(s)&&/FEVER/.test(s)&&/BALANCE/.test(s)&&/SKYBREAK/.test(s); })()'));
```

Replace (lines 1336-1337):

```js
check('v96/v105 modifier activation enqueues name then rule; the chip carries the telegraph', () =>
  /p\.status='active'; note\(m\.name,'#FFD75E',2\); note\(m\.rule,'#BFE8FF',2,100\)/.test(src));
```

with:

```js
check('v106 modifier activation is one BONUS note with rule and reward; the chip carries the name', () =>
  /p\.status='active'; note\('BONUS: '\+m\.rule\+' \+'\+m\.rewardCoins,'#FFD75E',2,140\)/.test(src));
```

Append after the `v105 modifier chip keeps the corridor mini-map lane bar...` check (~line 1550):

```js
// ---------- v106: pop-up copy clarity ----------
check('v106 every reward pop-up names its currency or effect', () =>
  /'SUPERNOVA! SCORE X3'/.test(src) && /'SKYBREAK! \+50 COINS'/.test(src) &&
  /'CHALLENGE CLEAR! \+'\+challengeReward\+' COINS'/.test(src) &&
  !/'SUPERNOVA! 3X'/.test(src) && !/'SKYBREAK! \+50'(?! COINS)/.test(src));
check('v106 modifier win notes BONUS WON with coins; losses and expiries are silent', () =>
  /note\('BONUS WON \+'\+paid\+' COINS','#62E8B5',2\)/.test(src) &&
  !/ ENDED'/.test(src));
check('v106 registry rules are imperative and fit the BONUS note at phone width', () => fresh.run(
  'MODIFIER_REGISTRY.every(m => m.rule.length<=19 && ("BONUS: "+m.rule+" +"+m.rewardCoins).length<=31)'));
check('v106 chip states its units with a fit fallback', () =>
  /m\.name\+' '\+blocksLeft\+' LEFT'/.test(src) && /m\.name\+' IN '\+inN\+' BLOCKS'/.test(src) &&
  /if \(t\.length\*6-1>W-40\) t=active\?m\.name\+' - '\+blocksLeft:m\.name\+' IN '\+inN;/.test(src));
check('v106 collection toast names its coins', () =>
  !/'COLLECTION COMPLETE \+'/.test(src) && /'COLLECTION! \+'/.test(src));
check('v106 COMBO lesson teaches the fever threshold in plain words', () => fresh.run(
  'TUT_LESSONS.some(l => l.title==="COMBO" && l.body==="10 STRAIGHT PERFECTS = FEVER" && l.compact==="PERFECT STREAKS PAY MORE")'));
```

- [ ] **Step 2: Run the suite — new checks fail, rest passes**

Run: `node tests/headless.js` (600s timeout or background)
Expected: FAIL — the rewritten activation check and all six v106 checks. Everything else PASSES (the TUT_LESSONS check passes both before and after its edit).

- [ ] **Step 3: Implement — registry rule strings (964-975)**

Change ONLY the `rule:'...'` value in each of the 12 registry entries (leave every other field byte-identical):

| line | id | new rule |
|---|---|---|
| 964 | deep-rhythm | `rule:'3 PERFECTS IN A ROW'` |
| 965 | main-recovery | `rule:'FIX A CUT PERFECTLY'` |
| 966 | surface-gold | `rule:'PERFECTS PAY EXTRA'` |
| 967 | canopy-rhythm | `rule:'3 PERFECTS IN A ROW'` |
| 968 | lower-gust | `rule:'PLACE 7 IN THE WIND'` |
| 969 | cloud-window | `rule:'5 IN THE CLEAR LANE'` |
| 970 | jet-gust | `rule:'PLACE 8 IN THE WIND'` |
| 971 | thin-air | `rule:'MAX 1 MISS'` |
| 972 | aurora-recovery | `rule:'FIX A CUT PERFECTLY'` |
| 973 | space-target | `rule:'HIT 2 GOLD TARGETS'` |
| 974 | orbit-control | `rule:'MAX 1 MISS'` |
| 975 | summit-precision | `rule:'4 PERFECTS IN A ROW'` |

- [ ] **Step 4: Implement — note call sites**

Activation (1119), replace:

```js
      if (p.status!=='active') { p.status='active'; note(m.name,'#FFD75E',2); note(m.rule,'#BFE8FF',2,100); }   // name then rule, shown one after another — each always fits
```

with:

```js
      if (p.status!=='active') { p.status='active'; note('BONUS: '+m.rule+' +'+m.rewardCoins,'#FFD75E',2,140); }   // one self-contained pop-up: optional challenge, rule, stake
```

`finishModifier` (1110), replace:

```js
  if (wasActive) note(won?m.name+' CLEAR +'+paid:m.name+' ENDED', won?'#62E8B5':'rgba(255,246,232,0.4)', 2);
```

with (losses/expiries go silent — the chip vanishing is the signal):

```js
  if (wasActive&&won) note('BONUS WON +'+paid+' COINS','#62E8B5',2);
```

Challenge clear (1326), replace:

```js
  note('CHALLENGE CLEAR!'+(challengeReward?' +'+challengeReward:''), '#62E8B5', 2, 140);
```

with:

```js
  note('CHALLENGE CLEAR!'+(challengeReward?' +'+challengeReward+' COINS':''), '#62E8B5', 2, 140);
```

Supernova (1590): `note('SUPERNOVA! 3X', '#FFD75E', 1);` → `note('SUPERNOVA! SCORE X3', '#FFD75E', 1);`

Skybreak (1618): `note('SKYBREAK! +50', '#FFD75E', 1);` → `note('SKYBREAK! +50 COINS', '#FFD75E', 1);`

Collection toasts (2078 and 2086): in both lines change `'COLLECTION COMPLETE +'+done[0].reward` → `'COLLECTION! +'+done[0].reward+' COINS'` (keep the rest of each line unchanged).

`TUT_LESSONS` (1346), replace:

```js
  { title:'COMBO',    body:'X10 FEVER - X15 SUPERNOVA' },
```

with:

```js
  { title:'COMBO',    body:'10 STRAIGHT PERFECTS = FEVER', compact:'PERFECT STREAKS PAY MORE' },
```

- [ ] **Step 5: Implement — chip units (5499-5500)**

Replace:

```js
  let t=active?m.name+' - '+blocksLeft:m.name+' IN '+inN;
  if (t.length*6-1>W-40) t=m.name;
```

with (long form → v105 short form → name-only):

```js
  let t=active?m.name+' '+blocksLeft+' LEFT':m.name+' IN '+inN+' BLOCKS';
  if (t.length*6-1>W-40) t=active?m.name+' - '+blocksLeft:m.name+' IN '+inN;
  if (t.length*6-1>W-40) t=m.name;
```

- [ ] **Step 6: Full suite green**

Run: `node tests/headless.js` (600s/background)
Expected: ALL checks pass (lone S7 failure → quiet re-run).

- [ ] **Step 7: Commit**

```bash
git add index.html tests/headless.js
git commit -m "v106: every pop-up states its unit and stake - one BONUS note per modifier"
```

---

### Task 2: Cache bump + browser QA

**Files:**
- Modify: `sw.js:2`, `tests/headless.js` (cache check ~1586)

- [ ] **Step 1: Cache check red→green**

In `tests/headless.js` change `check('sw.js cache bumped to v105', () => /const CACHE = 'skystack-v105'/.test(sw));` to expect `skystack-v106`; verify sw.js still says v105 (`Select-String -Path sw.js -Pattern "skystack-v10[56]"`), then set `sw.js:2` to `const CACHE = 'skystack-v106';`.

- [ ] **Step 2: Full suite green**

Run: `node tests/headless.js` (600s/background). Expected: ALL pass.

- [ ] **Step 3: Browser smoke-check**

Preview :3000 (launch.json `skystack`), recv.js listener on :8124 from scratchpad. In ONE javascript_tool call: `paused=false`, start an endless run, force a modifier activation (`runContext.modifiers[0]` → set its runtime status via `updateModifiersForPlacement(m.startAltitude)` pattern or directly `note('BONUS: 3 PERFECTS IN A ROW +5','#FFD75E',2,140)`), advance `update(1)` x30, `render()`, POST `ctx.canvas.toDataURL()`, return `{showing: curNote&&curNote.text}`. Verify the BONUS note renders un-truncated top-middle and the chip (if a modifier is near) shows the `LEFT`/`BLOCKS` form. Read the PNG; never return base64 through the transcript.

- [ ] **Step 4: Commit and deploy**

```bash
git add sw.js tests/headless.js
git commit -m "Bump cache to v106"
git push origin main
```

---

### Task 3: Vault close-out

Update `../AI-CONTEXT/PROJECTS/SKYSTACK/CURRENT_STATE.md` + `CURRENT_HANDOFF.md` (next: Asher's verdict at `?fresh=106`, then balloon phase 1 → phase 2 → hybrid block starts), append the copy decisions to `DECISIONS.md` #52 or a new #53, add a dated session log, delete `RECOVERY_CHECKPOINT.md`, commit and push AI-CONTEXT `main`. Hand Asher `https://asherbb6.github.io/SKYSTACK/?fresh=106`.
