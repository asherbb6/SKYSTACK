# v111 — Sky Map Postcards + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline — session
> holds full context). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Environment-postcard thumbnails, a column-panel + progress-rail backdrop, and a
professional spacing/button pass with a by-construction PLAY-overlap guarantee.

**Architecture:** All inside `renderSkyMap`'s card loop + the two map constants. Sky sampled
via `skyColor()`; terrain = `drawIsland` at scale 0.55 anchored so the surface line sits at
72% of a 32x38 framed window. Selected card gains a dedicated PLAY band (separate vertical
band from the caption). TDD, one suite gate before deploy.

**Tech Stack:** vanilla JS canvas, Node vm harness, PowerShell, git (never chain commit+push).

## Global Constraints
- Spec: `docs/superpowers/specs/2026-07-18-skymap-postcards-polish-design.md`
- Keep: v100 sweep comments, helper-exists functions, header layout (except the X button),
  scroll/drag input, `Extra Modes-style level cards` comment (v110 test greps it).
- vm ctx is an anyProxy — instrument only via makeGame `ctx2dOverride` or by overriding
  game FUNCTIONS (txt/plate3D are function declarations — assignable), never ctx props.

---

### Task 1: Tests first

**Files:** Test: `tests/headless.js` — new v111 section after the v110 block.

- [ ] **Step 1: Add checks:**

```js
// ---------- v111: sky map postcards + polish ----------
check('v111 map rhythm: MAP_ROW 64 / MAP_CARD_H 54', () => fresh.run('MAP_ROW === 64 && MAP_CARD_H === 54'));
check('v111 postcard/panel/rail markers present; flat thumb fill gone', () =>
  /environment postcard/.test(src) && /column panel/.test(src) && /progress rail/.test(src) &&
  !/ctx\.fillStyle = 'rgba\(0,0,0,0\.22\)'; ctx\.fillRect\(thX, thY, thS, thS\)/.test(src));
check('v111 selected PLAY plate sits inside its card and clear of every text box', () => fresh.run(
  '(() => { const W0=W,H0=H; let bad=null; try { for (const w of [180,320,480]) { W=w; H=w<300?390:480; relayout();' +
  'skyMap=true; prog=5; selLevel=5; for(let i=0;i<11;i++)levelStars[i]=2; bestHeight=230;' +
  'const L=skyMapNodes(); mapScroll=clamp(mapScroll + ((L.viewTop+L.viewBot)/2 - L.pts[5].y), 0, mapScrollMax);' +
  'const L2=skyMapNodes(); const card={x0:L2.colX,y0:L2.pts[5].y-MAP_CARD_H/2,x1:L2.colX+L2.colW,y1:L2.pts[5].y+MAP_CARD_H/2};' +
  'const texts=[]; let plate=null; const oT=txt, oP=plate3D;' +
  'txt=(t,x,y,sc,col,al)=>{sc=sc||1;t=String(t);const tw=t.length*6*sc-sc;const x0=al==="center"?x-tw/2:al==="right"?x-tw:x;if(String(col).indexOf("0,0,0")<0&&t!=="PLAY")texts.push({x0,x1:x0+tw,y0:y,y1:y+7*sc});};' +
  'plate3D=(x,y,w2,h2)=>{plate={x0:x,y0:y,x1:x+w2,y1:y+h2};};' +
  'try { renderSkyMap(); } finally { txt=oT; plate3D=oP; }' +
  'if (!plate) { bad="no plate at "+w; break; }' +
  'if (plate.x0<card.x0||plate.x1>card.x1||plate.y0<card.y0||plate.y1>card.y1) { bad="plate outside card at "+w; break; }' +
  'for (const tb of texts) if (tb.x0<plate.x1&&plate.x0<tb.x1&&tb.y0<plate.y1&&plate.y0<tb.y1) { bad="plate overlaps text at "+w; break; }' +
  'if (bad) break; } } finally { skyMap=false; prog=0; selLevel=0; for(let i=0;i<11;i++)levelStars[i]=0; bestHeight=0; W=W0;H=H0;relayout(); }' +
  'return bad||true; })()') === true);
```

- [ ] **Step 2: Red run** (background): expect rhythm + marker checks failing (plate check may
  pass pre-impl — red evidence is the other two).

### Task 2: Implementation

**Files:** Modify `index.html`: map constants line; renderSkyMap card loop (thumbnail block,
star/status baselines, PLAY band, mascot line); pre-card backdrop (panel + rail); header X.

- [ ] **Step 1: Constants** → `const MAP_ROW = 64, MAP_CARD_H = 54, MAP_HEAD = 38, MAP_FOOT = 10;`
- [ ] **Step 2: Backdrop** — immediately after `drawMapDecor(L, ph);` insert:

```js
  // v111 column panel: the card stack sits on a consistent surface, not raw sky
  ctx.fillStyle = 'rgba(7,8,15,0.30)';
  ctx.fillRect(L.colX - 6, L.viewTop, L.colW + 12, L.viewBot - L.viewTop);
  ctx.fillStyle = 'rgba(255,246,232,0.07)';
  ctx.fillRect(L.colX - 6, L.viewTop, 1, L.viewBot - L.viewTop);
  ctx.fillRect(L.colX + L.colW + 5, L.viewTop, 1, L.viewBot - L.viewTop);
  // v111 progress rail: gold up to the NEXT card, dim above (shows in the card gaps)
  const railX = L.colX + 4, nextY = L.pts[Math.min(prog, TIERS.length - 1)].y;
  const railTop = Math.max(L.viewTop, L.gate.y), railBot = Math.min(L.viewBot, L.start.y);
  if (railBot > railTop) {
    ctx.fillStyle = 'rgba(255,246,232,0.14)'; ctx.fillRect(railX, railTop, 2, railBot - railTop);
    const goldTop = Math.max(railTop, nextY);
    if (railBot > goldTop) { ctx.fillStyle = 'rgba(255,215,94,0.55)'; ctx.fillRect(railX, goldTop, 2, railBot - goldTop); }
  }
```

- [ ] **Step 3: Thumbnail → environment postcard.** Replace from `const thX = cx2+10...`
  through the `ctx.restore();` that closes the thumbnail clip with:

```js
    // island + weather framed as an environment postcard — the stage's real sky + terrain
    const thW = 32, thH = 38, thX = cx2+10, thY = cy2+8;
    ctx.save(); ctx.beginPath(); ctx.rect(thX, thY, thW, thH); ctx.clip();
    const altN = isGate ? TIERS[TIERS.length-1].n : t.n;
    const prevN = isGate ? TIERS[TIERS.length-1].n - 40 : k > 0 ? TIERS[k-1].n : 0;
    for (let b2 = 0; b2 < thH; b2 += 2) {                     // top of the window = tier altitude
      const sc2 = skyColor(prevN + (1 - b2/thH) * (altN - prevN));
      ctx.fillStyle = 'rgb('+sc2[0]+','+sc2[1]+','+sc2[2]+')';
      ctx.fillRect(thX, thY + b2, thW, 2);
    }
    if (altN > 90) { ctx.fillStyle = 'rgba(255,246,232,0.9)';  // stars once the sky darkens
      for (let s3 = 0; s3 < 3; s3++) ctx.fillRect(thX + 4 + ((k*37 + s3*11) % (thW-8)), thY + 3 + ((k*13 + s3*7) % 14), 1, 1); }
    if (isGate && !champ) {                                    // sealed door on the night sky
      const gx2 = thX + thW/2, gy2 = thY + thH/2;
      ctx.fillStyle = '#9A7420'; ctx.fillRect(gx2-10, gy2-9, 20, 19);
      ctx.fillStyle = '#FFD75E'; ctx.fillRect(gx2-8, gy2-7, 16, 17);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(gx2-8, gy2-7, 16, 1);
      ctx.fillStyle = '#5E4610'; ctx.fillRect(gx2-4, gy2-1, 8, 11);
      txt('?', gx2, gy2+1, 1, '#FFD75E', 'center');
    } else {                                                   // terrain: the island fills the frame, surface at 72%
      ctx.translate(thX + thW/2, thY + Math.round(thH*0.72)); ctx.scale(0.55, 0.55);
      drawIsland(isGate ? 10 : k, 0, 1);
      drawStageWeather(isGate ? 10 : k, 0, -6, ph);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';                        // picture-frame: dark inset...
    ctx.fillRect(thX-1, thY-1, thW+2, 1); ctx.fillRect(thX-1, thY+thH, thW+2, 1);
    ctx.fillRect(thX-1, thY, 1, thH); ctx.fillRect(thX+thW, thY, 1, thH);
    ctx.fillStyle = 'rgba(255,246,232,0.18)';                  // ...and light inner border
    ctx.fillRect(thX, thY, thW, 1); ctx.fillRect(thX, thY+thH-1, thW, 1);
    ctx.fillRect(thX, thY, 1, thH); ctx.fillRect(thX+thW-1, thY, 1, thH);
```

  and change `const tx0 = thX + thS + 6` → `const tx0 = thX + thW + 6`.
- [ ] **Step 4: Line grid + PLAY band.** Stars y → `cy2 + 27`; selected branch becomes:

```js
      if (sel) {
        const cp = checkpointForLevel(k);
        txt(cp.startAltitude ? cp.name.split(' ')[0]+' CP - '+(cp.scoreMultiplier+'X').replace('0.','.') : 'GROUND - FULL SCORE',
            tx0, cy2+27, 1, 'rgba(255,246,232,0.75)', 'left');
        const pw2 = 44, px2 = cx2 + cw2 - pw2 - 6, py2 = cy2 + MAP_CARD_H - 17;   // dedicated PLAY band
        plate3D(px2, py2, pw2, 12, playA(.8 + .12*Math.sin(tick*.1)), t.c);
        txt('PLAY', px2 + pw2/2, py2 + 3, 1, '#08301F', 'center');
      }
```

- [ ] **Step 5: Mascot perches ON TOP of its card** (gap is sprite-only, no text collision):
  replace the clipped mascot block with
  `if (bestCard === k && !sel) drawMascot(cx2 + cw2 - 16, cy2);`
- [ ] **Step 6: Header X → pixelFrame button**: replace the bare fillRect with
  `pixelFrame(W-18, 6, 13, 13, 'rgba(11,14,26,0.74)', 'rgba(255,246,232,0.26)', false);`
  (same txt 'X', same hit box).
- [ ] **Step 7: Green run** (background). Gates: v111 checks + v100 sweep + v110 card checks.
- [ ] **Step 8: Commit** → `"v111: postcard thumbnails, column panel + progress rail, PLAY band + spacing pass"`.

### Task 3: Cache bump + QA + deploy
- [ ] Flip cache test to `skystack-v111` (red by inspection), bump sw.js, full suite green.
- [ ] Browser QA on :51975 (probe W, fadeT=0): map with prog=5 — postcards show sky+terrain,
  panel/rail visible in gaps, selected card PLAY band clean; screenshot.
- [ ] Commit bump; verify tree clean; push; poll origin sw.js until `skystack-v111`.

### Task 4: Vault close-out
- [ ] CURRENT_STATE + CURRENT_HANDOFF + DECISIONS #58 + session log; delete checkpoint;
  commit, push, verify. Link `?fresh=111`.

## Self-review
- Spec coverage: postcard (sky/stars/terrain/frame/gate) ✓, panel+rail ✓, rhythm 64/54 ✓,
  PLAY band + component test ✓, mascot ✓, X button ✓, cache/QA/close-out ✓.
- Consistency: thW/thH used in thumbnail + tx0; MAP_CARD_H drives card rect + tests.
- Known changes pinned: stars baseline 27; caption stays band 27..34; plate band 37..49.
