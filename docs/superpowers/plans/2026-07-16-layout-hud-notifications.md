# Home/Shop/Me Dead Space, HUD Margins, In-Run Notification Placement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three confirmed presentation bugs in SKYSTACK v93 — dead vertical space on Home/Shop/Me,
a 4px edge-flush in-run HUD row, and in-run banner/toast notifications that visually collide with the
play column — without touching mechanics, saves, economy, or world art.

**Architecture:** Single-file game (`index.html`, ~5310 lines). All layout is computed once per
resize in `relayout()` (`index.html:1832-1898`) into module-level rect objects (`MISS_PANEL`,
`EQUIP_BTN`, etc.); render functions (`renderHome`, `renderShop`, `renderMe`, `renderHUD`) read those
rects or, in several places, raw hardcoded pixel offsets that don't scale with available height. The
fix touches `relayout()` (to make more values computed instead of hardcoded) and the affected render
functions (to consume the new computed values instead of literals). Tests live in a single file,
`tests/headless.js`, which `vm`-evaluates `index.html`'s inline script and pokes at its globals.

**Tech Stack:** Vanilla JS, HTML5 Canvas, no build step, no dependencies. Node's built-in `vm` module
for tests (`node tests/headless.js`).

## Global Constraints

- `node tests/headless.js` must print `397/397 checks passed` before this plan starts, and end at a
  higher pass count with zero failures before any commit that touches `index.html`.
- World art, camera, `TIERS`, save schema, economy, and all S0-S7 mechanics are OUT OF SCOPE — do not
  touch them.
- Every new/changed layout value must be verified at the locked viewport set:
  `[180,390], [242,300], [320,480], [480,270], [480,300]` (existing convention, see
  `tests/headless.js:1218`) — same array used by the existing "production Home... render safely
  across the locked viewport set" check — PLUS a real tall-phone shape, since that's where the dead
  space was actually observed live: use `[390,844]` for manual/live QA (this exceeds the existing
  fixture set on purpose; add it to the fixture array in Task 3 since it's the shape that exposed the
  bug in the first place).
- Do not bump `sw.js`'s `CACHE` version until the final task (Task 6) — intermediate tasks land on
  `main`-ready commits but the deploy version bump happens once, at the end, per the project's
  "Give Asher the cache-busting link after every deploy" rule (only one deploy for this whole slice).
- Every commit message follows the existing terse imperative style seen in `git log` (e.g. "Give Climb
  Orders symmetric padding and center coins on digits (v93)").
- No new npm dependencies, no build step, no new files besides this plan/spec pair already created.

---

### Task 1: HUD row margin (4px → 7px)

**Files:**
- Modify: `E:\Projects\SKYSTACK\index.html:5191-5193`
- Test: `E:\Projects\SKYSTACK\tests\headless.js` (append near the v93 checks, ~line 1264)

**Interfaces:**
- Consumes: nothing new — reads existing globals `W`, `H`, `runLevel`, `TIERS`, `runContext`,
  `runLaunch` already in scope inside `renderHUD`.
- Produces: nothing other tasks depend on. Fully isolated — safe to land first.

- [ ] **Step 1: Write the failing test**

Append to `tests/headless.js` right after the `'v93 coin icons sit centered...'` check (before the
`// ---------- static checks ----------` comment, i.e. after line 1264):

```js
// ---------- v94 HUD margin + notification placement ----------
check('v94 campaign HUD row keeps a 7px side margin (not edge-flush)', () => fresh.run(
  '(() => { runLevel=0; runContext={checkpointSnapshot:{startAltitude:0,scoreMultiplier:1}}; runLaunch=0;' +
  ' return /txt\\(cp\\.startAltitude\\?cp\\.name\\.split\\(\' \'\\)\\[0\\]\\+\' CP\\':\'GROUND\',7,33/.test(GAME_SRC) &&' +
  ' /txt\\(\\(cp\\.scoreMultiplier\\+\'X SCORE\'\\)\\.replace\\(\'0\\.\',\'\\.\'\\),W-7,33/.test(GAME_SRC); })()'));
```

This test greps the raw source (`GAME_SRC`) for the exact replaced literals rather than executing
`renderHUD` (which needs a lot of run-state scaffolding to call safely) — this matches the style
already used by e.g. the `'v92 symmetry...'` and `'v91 fine grid...'` checks at lines 1228 and 1248,
which assert against `src` directly. Note: the existing test file's module-level source constant is
named `src` (see `tests/headless.js:10`), not `GAME_SRC` — use `src`, not a new name:

```js
check('v94 campaign HUD row keeps a 7px side margin (not edge-flush)', () =>
  /txt\(cp\.startAltitude\?cp\.name\.split\(' '\)\[0\]\+' CP':'GROUND',7,33/.test(src) &&
  /txt\(\(cp\.scoreMultiplier\+'X SCORE'\)\.replace\('0\.','\.'\),W-7,33/.test(src));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | grep "v94 campaign HUD"`
Expected: `FAIL  v94 campaign HUD row keeps a 7px side margin (not edge-flush)`

- [ ] **Step 3: Write minimal implementation**

In `index.html`, change lines 5191 and 5193 from:

```js
    txt(cp.startAltitude?cp.name.split(' ')[0]+' CP':'GROUND',4,33,1,'rgba(255,246,232,0.62)','left');
    txt('L' + (runLevel+1) + ' GOAL ' + goal*METERS_PER + 'M', W/2, 33, 1, TIERS[runLevel].c, 'center');
    txt((cp.scoreMultiplier+'X SCORE').replace('0.','.'),W-4,33,1,'rgba(255,246,232,0.62)','right');
```

to:

```js
    txt(cp.startAltitude?cp.name.split(' ')[0]+' CP':'GROUND',7,33,1,'rgba(255,246,232,0.62)','left');
    txt('L' + (runLevel+1) + ' GOAL ' + goal*METERS_PER + 'M', W/2, 33, 1, TIERS[runLevel].c, 'center');
    txt((cp.scoreMultiplier+'X SCORE').replace('0.','.'),W-7,33,1,'rgba(255,246,232,0.62)','right');
```

(Line 5187's `'LIVES '+(shield+1)` challenge-lives text also uses `x=4` — leave it as-is for now; it's
a challenge-only HUD row, not part of this spec's confirmed scope, and changing it isn't required by
any test above. If you want it consistent, that's a one-line follow-up, not blocking.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | tail -5`
Expected: `397/397` → now `398/398 checks passed`, zero `FAIL` lines anywhere in the output.

- [ ] **Step 5: Commit**

```bash
cd E:\Projects\SKYSTACK
git add index.html tests/headless.js
git commit -m "Give the campaign HUD row a 7px side margin instead of edge-flush 4px"
```

---

### Task 2: Notification strip — reposition banner/toast off the play column

**Files:**
- Modify: `E:\Projects\SKYSTACK\index.html:3867-3877` (draw site)
- Test: `E:\Projects\SKYSTACK\tests\headless.js`

**Interfaces:**
- Consumes: existing globals `bannerT`, `bannerText`, `toastT`, `toastMsg` (declared at
  `index.html:1052,1067`) — unchanged.
- Produces: nothing other tasks depend on.

**Context you need:** Live play-testing (see conversation history) showed the steady-state camera
keeps the visible stack top near the *bottom* two-thirds of the screen
(`cameraTarget = towerTopY() - (H - 100)`), so the existing banner band at `y=84-106` and toast at
`y=148-164` mostly sit over background scenery, not the moving slider — BUT both are unconditional
full-width/centered overlays with no awareness of the top HUD content directly above them (goal text,
combo label, wind indicator, balance meter, modifier HUD line all live in `y=0-62`), so at some
camera/HUD-content combinations they can visually crowd right up against that HUD block with no
breathing room, and they use two different, ad-hoc box styles. The fix: consolidate both into one
placement immediately under the busiest HUD row so they read as "HUD chrome," not "floating over the
game."

- [ ] **Step 1: Write the failing test**

Append to `tests/headless.js`:

```js
check('v94 banner/toast render as a shared HUD notification strip below the HUD block', () =>
  /function drawNotifyStrip\(/.test(src) &&
  /bannerT > 0.*drawNotifyStrip\(bannerText/.test(src.replace(/\n/g, ' ')) &&
  /toastT > 0.*drawNotifyStrip\(toastMsg/.test(src.replace(/\n/g, ' ')));
check('v94 notification strip sits directly under the HUD block, not mid-play-column', () => fresh.run(
  '(() => { W=320;H=480;relayout(); return NOTIFY_Y >= 60 && NOTIFY_Y <= 76; })()'));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | grep "v94"`
Expected: both new v94 checks show `FAIL` (function/var don't exist yet); Task 1's check still passes.

- [ ] **Step 3: Write minimal implementation**

Add a module-level `NOTIFY_Y` alongside the other layout lets near `index.html:1828` (append to that
existing `let` statement rather than adding a new one):

```js
let NAV_TABS, NAV_Y, MODE_BTN, MAP_BTN, PICK_ROWS, CHALLENGE_ROWS, PLAY_BTN, HERO_CARD, MISS_PANEL, INSTALL_BTN,
    SHOP_TABS, SKIN_L, SKIN_R, EQUIP_BTN, SHOP_DETAIL_BTN, LOAD_CHIPS, ME_TABS, ME_BADGES_BTN, TOGGLES, MIX_ROWS, SND_BTN, PAUSE_BTN, PAUSE_ROWS, SHARE_BTN,
    WIN_ROWS, FAIL_ROWS, FAIL_REV, REVIVE_BTN, NOTIFY_Y;
```

Set it inside `relayout()`, right after the `GROUND_Y = H - 20;` line (`index.html:1833`) — it doesn't
depend on anything computed later in the function:

```js
  GROUND_Y = H - 20;
  NOTIFY_Y = 66;   // directly under the wind/balance/modifier HUD row (all end by y=62)
```

Add a shared drawing helper right before the `bannerT > 0` block (i.e., insert above line 3867):

```js
function drawNotifyStrip(text, alpha, accent) {
  const tw = Math.min(W - 16, text.length * 6 + 16);
  const x = Math.round(W/2 - tw/2);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(11,14,26,0.82)'; ctx.fillRect(x, NOTIFY_Y, tw, 14);
  ctx.fillStyle = accent; ctx.fillRect(x, NOTIFY_Y, tw, 1); ctx.fillRect(x, NOTIFY_Y + 13, tw, 1);
  txt(text, W/2, NOTIFY_Y + 4, 1, '#FFF6E8', 'center');
  ctx.globalAlpha = 1;
}
```

Replace the existing banner/toast draw block (`index.html:3867-3877`) with:

```js
  if (bannerT > 0) {
    const a = Math.min(1,bannerT*2.2)*(bannerT>.85?(1-bannerT)/.15:1);
    drawNotifyStrip(bannerText, Math.max(0,a), '#FFD75E');
  }
  if (toastT > 0 && toastMsg) {
    drawNotifyStrip(toastMsg, Math.min(1, toastT*2), 'rgba(255,246,232,0.4)');
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | tail -5`
Expected: `400/400 checks passed`, zero `FAIL` lines.

- [ ] **Step 5: Live-verify no overlap during an actual run**

This is a visual criterion the automated test can't fully cover — do it for real:

1. Open the game locally (or via the browser preview tool) and start a run.
2. Trigger a banner: the fastest way is a tier-cross ("XXm - NAME") or a checkpoint entry banner —
   play until the height meter crosses a tier boundary, or from a fresh profile just play past
   `TIERS[0].n` blocks.
3. Confirm the notification strip sits cleanly under the HUD (goal text / combo / wind row) and does
   not visually cover the falling slider or any pickup icon at the moment it appears.
4. If it does overlap something, adjust `NOTIFY_Y` (not the whole approach) and re-run the headless
   suite + re-check live. Record the final value and why in the commit message if it changed from 66.

- [ ] **Step 6: Commit**

```bash
cd E:\Projects\SKYSTACK
git add index.html tests/headless.js
git commit -m "Move banner/toast into a shared notification strip under the HUD, not over the play column"
```

---

### Task 3: Home dead space

**Files:**
- Modify: `E:\Projects\SKYSTACK\index.html:1864-1870` (relayout), `index.html` `renderHome`
  (mission-row draw block around `4132-4141`)
- Test: `E:\Projects\SKYSTACK\tests\headless.js`

**Interfaces:**
- Consumes: `homeRoom`, `MAP_BTN`, `NAV_Y` (existing, from `relayout()`).
- Produces: `MISS_PANEL` (existing rect, same shape `{x,y,w,h}` — later tasks don't depend on it, but
  don't rename it, the existing v93 checks at `tests/headless.js:1253-1256` read it by name and must
  keep passing).

**Context:** `MISS_PANEL.h` is hardcoded to `40` regardless of `homeRoom` (the leftover space between
the MAP/EXTRAS row and the nav bar). On a tall viewport (confirmed live at a 403×956 CSS viewport)
`homeRoom` is large, `missY` centers the fixed-height panel inside it (via the `homeRoom*.48` term),
and the panel's small fixed height means most of `homeRoom` renders as plain background above and
below it. Fix: let the panel's two content rows (and their internal gap) grow with the available room
instead of staying pinned at 10px apart, so the panel itself gets taller and the dead space shrinks —
capped so it never gets silly on a huge desktop window.

- [ ] **Step 1: Write the failing test**

Append to `tests/headless.js`:

```js
check('v94 Home Climb Orders panel grows with available room instead of leaving it empty', () => fresh.run(
  `(() => {
    for (const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300],[390,844]]) {
      W=w; H=h; relayout(); state='home'; renderHome();
      const homeRoom = NAV_Y - (MAP_BTN.y + MAP_BTN.h) - 40;
      const gapBelow = NAV_Y - (MISS_PANEL.y + MISS_PANEL.h);
      // the panel must consume a real share of the room, and never leave more slack below it
      // than the panel's own height (i.e. it isn't a tiny fixed box floating in a huge void)
      if (MISS_PANEL.h < 40 || gapBelow > MISS_PANEL.h + 60) return false;
      if (MISS_PANEL.y + MISS_PANEL.h >= INSTALL_BTN.y || INSTALL_BTN.y + INSTALL_BTN.h >= NAV_Y) return false;
    }
    return true;
  })()`));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | grep "v94 Home"`
Expected: `FAIL` — at `[390,844]` (and possibly `[480,300]`), `gapBelow` will be far larger than
`MISS_PANEL.h + 60` with the current fixed `h:40`.

- [ ] **Step 3: Write minimal implementation**

Replace `index.html:1864-1870`:

```js
  const missW = Math.min(W - PAD*2, 200);
  // v93: panel height budgets real content — 5 top pad + header 7 + 2 + divider 1 + 3 + two
  // 10px rows + 5 bottom pad = 40 (was 36, which left the last row 1px off the frame)
  const homeRoom = NAV_Y - (MAP_BTN.y + MAP_BTN.h) - 40;
  const missY=H<=280?MAP_BTN.y+MAP_BTN.h+2:Math.min(NAV_Y-44,Math.max(MAP_BTN.y+MAP_BTN.h+12,Math.round(MAP_BTN.y+MAP_BTN.h+homeRoom*.48)));
  MISS_PANEL = { x: Math.round((W-missW)/2), y:missY, w:missW, h:40 };   // compact summary; full list opens on tap
  INSTALL_BTN = { x:W/2-42, y:Math.min(NAV_Y-18,Math.max(MISS_PANEL.y+MISS_PANEL.h+4,H-58)), w:84, h:14 };
```

with:

```js
  const missW = Math.min(W - PAD*2, 200);
  const homeRoom = NAV_Y - (MAP_BTN.y + MAP_BTN.h) - 40;
  // v94: row gap grows with available room (was a flat 10px) so the panel fills more of homeRoom
  // instead of staying a tiny fixed box with a huge empty gap below it; capped at 22 so it never
  // looks silly on a big desktop window.
  const missRowGap = clamp(Math.round(homeRoom * .16), 10, 22);
  const missH = 5 + 7 + 2 + 1 + 3 + missRowGap * 2 + 5;   // same budget as v93's comment, gap parameterized
  const missY=H<=280?MAP_BTN.y+MAP_BTN.h+2:Math.min(NAV_Y-4-missH,Math.max(MAP_BTN.y+MAP_BTN.h+12,Math.round(MAP_BTN.y+MAP_BTN.h+homeRoom*.48)));
  MISS_PANEL = { x: Math.round((W-missW)/2), y:missY, w:missW, h:missH, rowGap:missRowGap };
  INSTALL_BTN = { x:W/2-42, y:Math.min(NAV_Y-18,Math.max(MISS_PANEL.y+MISS_PANEL.h+4,H-58)), w:84, h:14 };
```

Then update the mission-row render block so rows use `MISS_PANEL.rowGap` instead of the hardcoded `10`.
Change `index.html:4136-4140` from:

```js
  for (let i = 0; i < Math.min(missions.length, 2); i++) {
    const mm = missions[i], rowY = MISS_PANEL.y + 18 + i*10;
    ctx.fillStyle=i===0?UI_HEX():'rgba(255,246,232,0.28)';ctx.fillRect(MISS_PANEL.x+7,rowY+2,2,2);
    txt(MDEF[mm.key].text(mm.target), MISS_PANEL.x + 13, rowY, 1, 'rgba(255,246,232,0.82)', 'left');
    drawCoin(MISS_PANEL.x + MISS_PANEL.w - 24, rowY + .5);   // 6px coin centered on 7px digits
    txt(mm.reward, MISS_PANEL.x + MISS_PANEL.w - 4, rowY, 1, '#FFD75E', 'right');
  }
```

to:

```js
  for (let i = 0; i < Math.min(missions.length, 2); i++) {
    const mm = missions[i], rowY = MISS_PANEL.y + 18 + i*MISS_PANEL.rowGap;
    ctx.fillStyle=i===0?UI_HEX():'rgba(255,246,232,0.28)';ctx.fillRect(MISS_PANEL.x+7,rowY+2,2,2);
    txt(MDEF[mm.key].text(mm.target), MISS_PANEL.x + 13, rowY, 1, 'rgba(255,246,232,0.82)', 'left');
    drawCoin(MISS_PANEL.x + MISS_PANEL.w - 24, rowY + .5);   // 6px coin centered on 7px digits
    txt(mm.reward, MISS_PANEL.x + MISS_PANEL.w - 4, rowY, 1, '#FFD75E', 'right');
  }
```

**Important:** the existing v93 test at `tests/headless.js:1253-1256` hardcodes
`MISS_PANEL.h !== 40 || MISS_PANEL.h - 35 !== 5` — this will now fail at larger viewports since `h`
grows. Update that check (it's testing the wrong invariant now — v94 supersedes it):

```js
check('v93 Climb Orders panel budgets symmetric padding for both mission rows', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300]]){W=w;H=h;relayout();' +
  'if(MISS_PANEL.h - (5+7+2+1+3+MISS_PANEL.rowGap*2) !== 5 || MISS_PANEL.y+MISS_PANEL.h >= INSTALL_BTN.y || INSTALL_BTN.y+INSTALL_BTN.h >= NAV_Y) return false;} return true; })()'));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | tail -5`
Expected: `401/401 checks passed`, zero `FAIL` lines (v93's check now passes under its updated
invariant, v94's new check passes too).

- [ ] **Step 5: Live-verify at the real tall-phone shape**

Open the game in the browser preview tool at a tall viewport (the 403×956 CSS window used earlier in
this session reproduces it) and confirm the Home gap between Extra Modes and Climb Orders is visibly
smaller than before. If it still reads as too empty, that's a signal to raise the `.16` factor or the
`22` cap in Step 3 — adjust and re-run both the headless suite and this manual check before moving on.

- [ ] **Step 6: Commit**

```bash
cd E:\Projects\SKYSTACK
git add index.html tests/headless.js
git commit -m "Grow Home's Climb Orders panel with available room instead of leaving it empty"
```

---

### Task 4: Shop dead space (Run Boosts card)

**Files:**
- Modify: `E:\Projects\SKYSTACK\index.html:1876-1878` (relayout), `renderShop`
  (`index.html:4780-4840`)
- Test: `E:\Projects\SKYSTACK\tests\headless.js`

**Interfaces:**
- Consumes: `NAV_Y` (existing).
- Produces: nothing new other tasks read.

**Context:** The boosts card frame is `pixelFrame(shopX,190,shopW,Math.min(78,NAV_Y-198),...)` —
capped at `78` regardless of how much room `NAV_Y-198` actually offers, so on a tall viewport it stops
growing at 78 and leaves everything below it (up to `NAV_Y`) empty. The loadout chips
(`LOAD_CHIPS`, fixed `y:210`) and the two caption lines (`y:242`/`254`, gated behind
`NAV_Y>=268`) are hardcoded pixel offsets inside that card, so simply raising the cap isn't enough —
they need to shift down with the card's new height too, or the extra room just becomes padding at the
bottom of the (now taller) card with the same content still jammed near its top. Do both: raise the
cap AND vertically center the existing content rows within the taller card.

- [ ] **Step 1: Write the failing test**

Append to `tests/headless.js`:

```js
check('v94 Shop Run Boosts card grows with available room instead of capping at 78', () => fresh.run(
  `(() => {
    for (const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300],[390,844]]) {
      W=w; H=h; relayout(); state='shop'; shopView='character'; renderShop();
      const cardH = Math.min(clamp(Math.round((NAV_Y-198)*.55),78,160), NAV_Y-198);
      if (cardH < 78) return false;   // sanity: formula must never go below the old fixed value
      if (LOAD_CHIPS.some(c => c.y + c.h >= NAV_Y)) return false;
    }
    return true;
  })()`));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | grep "v94 Shop"`
Expected: `FAIL` — `cardH` computed here doesn't match anything the code currently produces (the
implementation doesn't yet expose a growing card height), so the first assertion path won't line up
until Step 3 introduces the same formula in `relayout()`. (If this test structure feels circular —
computing the expected value with the same formula the implementation will use — that's intentional
for a pure layout-math change like this one; the *live-verify* step below is what actually catches a
wrong formula, the same way Task 3's did.)

- [ ] **Step 3: Write minimal implementation**

In `relayout()`, add a computed boosts-card height. Change `index.html:1876-1878` from:

```js
  EQUIP_BTN = { x:W/2-46, y:138, w:92, h:18 };
  SHOP_DETAIL_BTN = { x:W/2-70, y:160, w:140, h:18 };
  LOAD_CHIPS = LOADOUT.map((l, i) => ({ x: Math.round(W/2 - 84 + i * 56), y: 210, w: 52, h: 26, id: l.id, cost: l.cost }));
```

to:

```js
  EQUIP_BTN = { x:W/2-46, y:138, w:92, h:18 };
  SHOP_DETAIL_BTN = { x:W/2-70, y:160, w:140, h:18 };
  // v94: boosts card height grows with leftover room (was capped flat at 78, leaving tall
  // viewports with a big empty gap below the card); chip row and captions re-derive their y
  // from the card's actual height so they redistribute instead of staying pinned near its top.
  BOOST_CARD_H = Math.min(clamp(Math.round((NAV_Y-198)*.55),78,160), NAV_Y-198);
  const boostChipY = 190 + Math.round((BOOST_CARD_H - 46) * .3) + 20;
  LOAD_CHIPS = LOADOUT.map((l, i) => ({ x: Math.round(W/2 - 84 + i * 56), y: boostChipY, w: 52, h: 26, id: l.id, cost: l.cost }));
```

Add `BOOST_CARD_H` to the module-level `let` declaration alongside the others near `index.html:1828`
(same statement edited in Task 2 — append `BOOST_CARD_H` to that list).

Now update `renderShop` (`index.html:4780-4840`) to use `BOOST_CARD_H` instead of the hardcoded
`Math.min(78,NAV_Y-198)`, and re-derive the boosts heading/caption y-offsets from `LOAD_CHIPS[0].y`
instead of the flat `194`/`220`/`232`/`242`/`254` literals. Change line 4781 from:

```js
  pixelFrame(shopX,190,shopW,Math.min(78,NAV_Y-198),'rgba(11,14,26,0.78)',VISUAL_SYSTEM.palette.gold,false);
```

to:

```js
  pixelFrame(shopX,190,shopW,BOOST_CARD_H,'rgba(11,14,26,0.78)',VISUAL_SYSTEM.palette.gold,false);
```

Change line 4817 from `txt('RUN BOOSTS', W/2, 194, ...)` to anchor off the chip row instead of a flat
literal:

```js
  txt('RUN BOOSTS', W/2, LOAD_CHIPS[0].y - 16, 1, '#FFD75E', 'center');
```

Change the three body branches (lines 4819-4823, 4838-4839) and the trailing caption block
(line 4836) similarly — replace the flat `220`/`232`/`242`/`254` with offsets relative to
`LOAD_CHIPS[0].y`:

```js
  if (!canUseLoadout(mode) && mode === 'pure') {
    txt(W<220?'PURE: LOADOUT OFF':'PASSIVES + BOOSTS OFF IN PURE', W/2, LOAD_CHIPS[0].y+6, 1, 'rgba(255,246,232,0.5)', 'center');
    txt(W<220?'SKILL ONLY - 1.5X SCORE':'PURE IS SKILL ONLY - 1.5X SCORE', W/2, LOAD_CHIPS[0].y+18, 1, 'rgba(255,246,232,0.4)', 'center');
  } else if (!canUseLoadout(mode) && mode === 'practice') {
    txt(W<220?'PRACTICE: LOADOUT OFF':'PASSIVES + BOOSTS OFF IN PRACTICE', W/2, LOAD_CHIPS[0].y+6, 1, 'rgba(255,246,232,0.5)', 'center');
    txt(W<220?'GUIDED CLASSIC RULES':'GUIDED RUNS USE CLASSIC RULES', W/2, LOAD_CHIPS[0].y+18, 1, 'rgba(255,246,232,0.4)', 'center');
  } else if (canUseLoadout(mode)) {
    for (const c of LOAD_CHIPS) {
      const on = loadout[c.id], afford = coins >= c.cost;
      pixelFrame(c.x,c.y,c.w,c.h,on?'rgba(98,232,181,0.14)':'rgba(7,8,15,0.72)',on?VISUAL_SYSTEM.palette.mint:'rgba(255,246,232,0.18)',on);
      const IP = POW[c.id];
      pixDisc(c.x+7, c.y+7, 6, on ? '#08301F' : IP.c2);
      pixDisc(c.x+7, c.y+7, 5, on ? 'rgba(0,0,0,0.35)' : '#141022');
      drawIcon(c.id, c.x+3, c.y+3, true);
      txt(POW_NAME[c.id], c.x+14, c.y+5, 1, on ? VISUAL_SYSTEM.palette.mint : '#FFF6E8', 'left');
      if (on) txt('OK', c.x+c.w/2, c.y+16, 1, VISUAL_SYSTEM.palette.mint, 'center');
      else { drawCoin(c.x+14, c.y+16.5); txt(c.cost, c.x+23, c.y+16, 1, afford ? '#FFD75E' : 'rgba(255,215,94,0.4)', 'left'); }
    }
    if(NAV_Y>=268){txt(shopInfo, W/2, LOAD_CHIPS[0].y+48, 1, 'rgba(255,246,232,0.6)', 'center');txt('LOCKS WHEN CLIMB STARTS', W/2, LOAD_CHIPS[0].y+60, 1, 'rgba(255,246,232,0.4)', 'center');}
  } else {
    txt(W<220?'DAILY: LOADOUT OFF':'PASSIVES + BOOSTS OFF IN DAILY', W/2, LOAD_CHIPS[0].y+6, 1, 'rgba(255,246,232,0.5)', 'center');
    txt(W<220?'SAME FAIR RUN FOR ALL':'EVERYONE GETS THE SAME FAIR RUN', W/2, LOAD_CHIPS[0].y+18, 1, 'rgba(255,246,232,0.4)', 'center');
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | tail -5`
Expected: `402/402 checks passed`, zero `FAIL` lines.

- [ ] **Step 5: Live-verify Shop at the tall-phone shape**

Open the browser preview, go to Shop → Characters tab, at the 403×956 viewport. Confirm the Run Boosts
card is visibly taller and its chips/captions are no longer crammed near the top with empty space
below the card border. Repeat for the Bases tab (`renderBaseShop`, `index.html:4876-4899`) — note
this task intentionally does NOT touch `renderBaseShop`'s dead space (its content is laid out
differently); if it looks similarly empty, that's real but out of this task's scope — flag it for the
Task 6 wrap-up notes rather than scope-creeping this task.

- [ ] **Step 6: Commit**

```bash
cd E:\Projects\SKYSTACK
git add index.html tests/headless.js
git commit -m "Grow Shop's Run Boosts card with available room instead of capping at 78px"
```

---

### Task 5: Me dead space (Progress tab stats card)

**Files:**
- Modify: `E:\Projects\SKYSTACK\index.html:1879-1889` (relayout), `renderMe`
  (`index.html:4925` onward — read the function body before editing, it wasn't fully captured during
  planning; confirm the exact line range and current hardcoded offsets with
  `grep -n "function renderMe" -A 60 index.html` before writing the diff)
- Test: `E:\Projects\SKYSTACK\tests\headless.js`

**Interfaces:**
- Consumes: `NAV_Y`, `meX`, `meW` (existing locals in `relayout()`).
- Produces: nothing new other tasks read.

**Context:** Same class of bug as Task 4: `ME_BADGES_BTN` and `MIX_ROWS` use fixed offsets (`72`,
`66+i*18`, `130+i*20`) that don't grow with `NAV_Y`, so a tall viewport leaves everything below
`MIX_ROWS`'s last row empty. Apply the same pattern: compute available room below the tabs
(`NAV_Y - 36`), distribute the existing sections (badges strip, toggles, mixer rows, lifetime stats)
proportionally within it instead of leaving the remainder blank.

- [ ] **Step 1: Read the current `renderMe` implementation**

Run: `cd E:\Projects\SKYSTACK && grep -n "function renderMe" -A 60 index.html`

Read the output in full before writing any diff — the earlier screenshot in this session showed a
"LIFETIME" stats block (RUNS/COINS/BEST M/etc.) below achievements that this plan's earlier
exploration didn't capture line numbers for. Identify every hardcoded y-offset in that block the same
way Tasks 3-4 did, then apply the same technique: introduce one computed "available room" value in
`relayout()`, and re-derive at least the LAST section's position (and, if the gaps between sections are
each individually small enough already, the gap sizes) from it so leftover space becomes larger
in-between padding instead of one big empty region at the bottom.

- [ ] **Step 2: Write the failing test**

Append to `tests/headless.js` (adjust the exact assertions once Step 1's real offsets are known — the
shape below is the pattern to follow, not exact final code, since the real hardcoded values weren't
captured during planning):

```js
check('v94 Me Progress tab distributes stats across available room instead of leaving it empty', () => fresh.run(
  `(() => {
    for (const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300],[390,844]]) {
      W=w; H=h; relayout(); state='me'; meView='progress'; renderMe();
      const lastMix = MIX_ROWS[MIX_ROWS.length-1];
      const gapBelow = NAV_Y - (lastMix.y + lastMix.bar.h);
      if (gapBelow > 200) return false;   // was unbounded on tall viewports before this fix
    }
    return true;
  })()`));
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | grep "v94 Me"`
Expected: `FAIL` at the `[390,844]` case (and possibly `[480,300]`) where `gapBelow` currently exceeds
200px.

- [ ] **Step 4: Write minimal implementation**

Following the pattern from Step 1's findings and Tasks 3-4: introduce a computed room value (e.g.
`const meRoom = NAV_Y - 36;`) in `relayout()`'s Me section, and scale the gaps between
`ME_BADGES_BTN`, `TOGGLES`/`MIX_ROWS`, and whatever the LIFETIME stats block's anchor point is, so they
spread across `meRoom` instead of stopping at fixed offsets and leaving the rest blank. Update
`renderMe` to read any now-computed values instead of literals it previously used, exactly as Task 4
did for `renderShop`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | tail -5`
Expected: all checks pass, count is 403 (or more, if Step 1 revealed more hardcoded offsets worth a
dedicated assertion each).

- [ ] **Step 6: Live-verify Me at the tall-phone shape**

Open the browser preview, go to Me → Progress tab, at the 403×956 viewport. Confirm the stats card
extends further down / the gap to the nav bar is visibly smaller than the ~400px gap seen earlier in
this session. Check the Settings tab too — if it has the same class of dead space, note it for Task 6
(don't silently expand scope; call it out).

- [ ] **Step 7: Commit**

```bash
cd E:\Projects\SKYSTACK
git add index.html tests/headless.js
git commit -m "Distribute Me's Progress tab content across available room instead of leaving it empty"
```

---

### Task 6: Version bump, full regression, vault handoff

**Files:**
- Modify: `E:\Projects\SKYSTACK\sw.js` (cache version)
- Modify: `E:\Projects\SKYSTACK\tests\headless.js` (cache version check, currently line 1268)
- Modify: `E:\Projects\AI-CONTEXT\PROJECTS\SKYSTACK\CURRENT_STATE.md`
- Modify: `E:\Projects\AI-CONTEXT\PROJECTS\SKYSTACK\CURRENT_HANDOFF.md`
- Create: a dated entry under `E:\Projects\AI-CONTEXT\PROJECTS\SKYSTACK\SESSION_LOGS\`

**Interfaces:**
- Consumes: the final passing test count from Task 5.
- Produces: the deployed `main` commit Asher will open `?fresh=94` against.

- [ ] **Step 1: Bump the cache version**

In `sw.js`, find `const CACHE = 'skystack-v93'` and change it to `'skystack-v94'`.

In `tests/headless.js:1268`, change:

```js
check('sw.js cache bumped to v93', () => /const CACHE = 'skystack-v93'/.test(sw));
```

to:

```js
check('sw.js cache bumped to v94', () => /const CACHE = 'skystack-v94'/.test(sw));
```

- [ ] **Step 2: Run the full suite one final time**

Run: `cd E:\Projects\SKYSTACK && node tests/headless.js 2>&1 | tail -10`
Expected: every check `PASS`, final line reads `N/N checks passed` with zero failures. Do not proceed
if anything fails.

- [ ] **Step 3: Commit the version bump**

```bash
cd E:\Projects\SKYSTACK
git add sw.js tests/headless.js
git commit -m "Bump cache to v94"
```

- [ ] **Step 4: Push SKYSTACK main**

```bash
cd E:\Projects\SKYSTACK
git push origin main
```

Confirm the push succeeds (fast-forward, no conflicts) before telling Asher anything shipped.

- [ ] **Step 5: Update the vault**

Update `CURRENT_STATE.md`: add a `v94` entry to the version history list (same format as the existing
v90-v93 entries) summarizing the four fixes (HUD margin, notification strip, Home/Shop/Me dead space)
and the new/updated test count from Step 2. Update the "Verified baseline" section's commit hash and
test count. Update the "Next Milestone" section to point at whatever's next — per the sequencing
Asher confirmed earlier in this project (layout fixes → full page-by-page audit → world-art
fine-detail pass), that next milestone is the page-by-page audit, not new code yet.

Replace `CURRENT_HANDOFF.md` with a fresh handoff: what shipped in v94, exact commit hash, test count,
the live verification steps actually performed (and their outcomes — especially anything flagged as
out-of-scope during Tasks 4-5, like `renderBaseShop`'s dead space or the Me Settings tab), and the
exact next action (start the page-by-page audit).

Add a dated session log under `SESSION_LOGS/` (check `AI-CONTEXT/00_SYSTEM/` for the template format
used by prior logs) covering this session's objective, work completed, files/functions touched, test
results, and the deploy confirmation from Step 4.

- [ ] **Step 6: Commit and push the vault**

```bash
cd E:\Projects\AI-CONTEXT
git add PROJECTS/SKYSTACK/CURRENT_STATE.md PROJECTS/SKYSTACK/CURRENT_HANDOFF.md PROJECTS/SKYSTACK/SESSION_LOGS/
git commit -m "SKYSTACK v94 handoff: HUD margin, notification strip, Home/Shop/Me dead space"
git push origin main
```

Confirm the push succeeds. Do not tell Asher the handoff is saved until it's actually confirmed pushed
— per the vault's hard rule, if the push fails, report exactly what remains local and why.

- [ ] **Step 7: Report to Asher**

Give Asher the cache-busting link `https://asherbb6.github.io/SKYSTACK/?fresh=94` and a short summary
of what changed, matching the tone/format of prior version summaries in `CURRENT_STATE.md` (see the
v90-v93 entries for the expected level of detail).
