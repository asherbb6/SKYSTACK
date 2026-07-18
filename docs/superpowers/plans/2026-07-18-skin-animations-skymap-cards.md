# v110 — Skin Animations + Sky Map Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline — the
> session holds full context). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-contain and rework all 7 skin animation styles inside their blocks, and rebuild
the Sky Map as Extra Modes-style level cards with island miniatures.

**Architecture:** Single-file game (`index.html`); Node vm test harness (`tests/headless.js`).
Part A rewrites `drawBlock`'s finish section under one shared clip. Part B rewrites
`skyMapNodes` (centered pts), `mapTapAt` (card hit boxes), and `renderSkyMap`'s world layer
(cards replace trail/islands/badges). TDD: red tests → impl → green → commit per part.

**Tech Stack:** vanilla JS canvas, Node vm harness, PowerShell, git (never chain commit+push).

## Global Constraints
- Spec: `docs/superpowers/specs/2026-07-18-skin-animations-skymap-cards-design.md`
- Suite: `node tests/headless.js` in background, 600s timeout, ~4 min; lone S7 frame-budget
  failure = flake (quiet re-run).
- Deploy only after cache bump `skystack-v110` + matching test + full suite green on exact tree.
- Keep defined (tests require them): `mapBadge`, `mapNode3D`, `drawIsland`, `drawMapDecor`,
  `drawCloudIsland`, `liteHex`, `dkHex`, `openSkyMap`, `mapTapAt`.
- Keep source comments the v100 tests grep for: `its second line becomes the start-condition
  caption` (moves into the card loop) and the header's `the hint yields to the stars label`.
- Header (index.html:5132-5146) is UNCHANGED. Scroll/drag/wheel input is UNCHANGED.

---

### Task 1: Skin finish containment + rework

**Files:**
- Modify: `index.html:2348-2401` (drawBlock)
- Test: `tests/headless.js` — new v110 section after the v107 block (~line 1660)

**Interfaces:** `drawBlock(x, y, w, h, col, isTop, glow, style)` signature unchanged. Body
shading/bevel (2362-2369) unchanged. `glow>0` param flash (2361) unchanged.

- [ ] **Step 1: Add failing tests** (new `// ---------- v110 ----------` section):

```js
// ---------- v110: skin finish containment + rework ----------
check('v110 skin finishes never draw outside the block (all 7 styles, all sizes)', () => fresh.run(
  '(() => { const rects=[]; let clip=null, pend=null; const stack=[];' +
  'const o={fillRect:ctx.fillRect,rect:ctx.rect,clip:ctx.clip,save:ctx.save,restore:ctx.restore};' +
  'ctx.rect=(a,b,c,d)=>{pend=[a,b,c,d];};' +
  'ctx.clip=()=>{clip=pend;};' +
  'ctx.save=()=>{stack.push(clip);};' +
  'ctx.restore=()=>{clip=stack.length?stack.pop():null;};' +
  'ctx.fillRect=(a,b,c,d)=>{rects.push({a,b,c,d,clip});};' +
  'let bad=null;' +
  'try { for (const st of ["gloss","stripe","ember","facet","sparkle","shimmer","glow"])' +
  ' for (const [bw,bh] of [[96,14],[40,10],[16,9],[6,5]])' +
  ' for (let t4=0;t4<40;t4+=7) { tick=t4; rects.length=0; clip=null; stack.length=0;' +
  '  drawBlock(20,30,bw,bh,{h:200,s:80,l:56},true,0,st);' +
  '  for (const r of rects) {' +
  '   const inside = r.a>=20&&r.b>=30&&r.a+r.c<=20+bw&&r.b+r.d<=30+bh;' +
  '   const clipped = r.clip && r.clip[0]>=20&&r.clip[1]>=30&&r.clip[0]+r.clip[2]<=20+bw&&r.clip[1]+r.clip[3]<=30+bh;' +
  '   if (!inside && !clipped) bad = st+" "+bw+"x"+bh+" rect "+r.a+","+r.b+","+r.c+","+r.d; } } }' +
  'finally { ctx.fillRect=o.fillRect;ctx.rect=o.rect;ctx.clip=o.clip;ctx.save=o.save;ctx.restore=o.restore; }' +
  'return bad===null ? true : bad; })()') === true);
check('v110 finish section runs under one shared clip', () =>
  /per-skin surface finish \(v110: ONE shared clip/.test(src));
check('v110 old escapes are gone (ember above-block spark, glow outer halo)', () =>
  !/y - 1 \+ \(Math\.sin\(tick\*\.3\+ex\)\|0\)/.test(src) &&
  !/ctx\.fillRect\(x-4, y-3, w\+8, h\+6\)/.test(src));
check('v110 redesigned styles carry their markers', () =>
  /jagged magma veins/.test(src) && /cut gem/.test(src) &&
  /smooth cross twinkles/.test(src) && /neon tube/.test(src));
```

- [ ] **Step 2: Red run** (background, 600s): expect exactly the 4 new checks failing.
- [ ] **Step 3: Implement.** Delete the glow outer-halo block (2353-2360). Replace the finish
  section (2370-2399) with (whole section gated `if (on)`, one clip):

```js
  // ---- per-skin surface finish (v110: ONE shared clip — no effect may leave the block) ----
  if (on) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const hsh = ((x*7 + y*13) & 1023);                                   // stable-ish per-block hash
    if (style === 'gloss') {                                             // glossy plastic — sheen + soft travelling highlight
      ctx.globalAlpha = .55; ctx.fillStyle = '#FFF'; ctx.fillRect(x+2, y+2, w-4, 1);
      if (!reduceMotion) { const sw = x + ((tick*.9 + y*5) % (w+18)) - 9;
        ctx.globalAlpha = .07; ctx.fillRect(Math.round(sw)-1, y+1, 1, h-2); ctx.fillRect(Math.round(sw)+3, y+1, 1, h-2);
        ctx.globalAlpha = .14; ctx.fillRect(Math.round(sw), y+1, 3, h-2); }
      ctx.globalAlpha = 1;
    } else if (style === 'stripe') {                                     // satin candy — soft diagonal bands
      ctx.globalAlpha = .24; ctx.fillStyle = '#FFF'; const o = reduceMotion ? 0 : (tick*.5) % 14;
      for (let sx = x - h - 14 + o; sx < x + w; sx += 14) { ctx.beginPath(); ctx.moveTo(sx, y+h); ctx.lineTo(sx+h, y); ctx.lineTo(sx+h+5, y); ctx.lineTo(sx+5, y+h); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (style === 'ember') {                                      // molten — jagged magma veins + embers rising inside
      const vy1 = y + Math.max(2, (h/3|0)), vy2 = y + Math.min(h-3, (h*2/3|0));
      const pu = reduceMotion ? .5 : .45 + .35*Math.sin(tick*.12 + y*.3);
      const seg = Math.max(3, ((w-6)/3)|0);
      ctx.fillStyle = 'hsl(24,100%,58%)'; ctx.globalAlpha = pu;
      for (let s3 = 0; s3 < 3; s3++) { const off = (s3 + (hsh&1)) % 2 ? 1 : -1;
        ctx.fillRect(x+3 + s3*seg, vy1 + (s3%2?off:0), seg-1, 1);
        ctx.fillRect(x+3 + s3*seg, vy2 + (s3%2?0:off), seg-1, 1); }
      ctx.globalAlpha = pu*.6; ctx.fillStyle = 'hsl(46,100%,70%)'; ctx.fillRect(x+3+seg, vy1, seg-1, 1);
      ctx.globalAlpha = 1;
      if (!reduceMotion) for (let e2 = 0; e2 < 2; e2++) {                // sparks die out before the top edge
        const cyc = ((tick*.6 + e2*37 + hsh) % (h*4)) / 4;
        const ey = y + h - 2 - cyc, ex = x + 3 + ((hsh>>e2) + e2*29) % Math.max(2, w-6);
        if (ey > y) { ctx.globalAlpha = clamp((ey - y) / 3, 0, 1)*.8; ctx.fillStyle = 'hsl(40,100%,68%)';
          ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1); ctx.globalAlpha = 1; }
      }
    } else if (style === 'facet') {                                      // cut gem — diagonal wedges + travelling bevel glint
      ctx.fillStyle = '#FFF'; ctx.globalAlpha = .10;
      for (let d2 = 0; d2 < 3; d2++) ctx.fillRect(x+1, y+1+d2, Math.max(2, (w*.5|0) - d2*((w/6)|0)), 1);
      ctx.fillStyle = '#000'; ctx.globalAlpha = .12;
      for (let d2 = 0; d2 < 3; d2++) { const ww2 = Math.max(2, (w*.5|0) - d2*((w/6)|0)); ctx.fillRect(x+w-1-ww2, y+h-2-d2, ww2, 1); }
      const gp = (tick*.7 + hsh) % Math.max(1, w-6);
      ctx.fillStyle = '#FFF'; ctx.globalAlpha = reduceMotion ? .5 : .5 + .3*Math.sin(tick*.2);
      ctx.fillRect(x+2 + (reduceMotion ? ((w-6)/2|0) : Math.round(gp)), y+1, 2, 1);
      const tw2 = reduceMotion ? .4 : .2 + .3*(Math.sin(tick*.14 + y)*.5 + .5);
      ctx.globalAlpha = tw2; ctx.fillRect(x + (w*.5|0), y + (h*.5|0), 1, 1);
      ctx.globalAlpha = 1;
    } else if (style === 'sparkle') {                                    // frost — frosted rim + smooth cross twinkles
      ctx.globalAlpha = .35; ctx.fillStyle = '#FFF';
      ctx.fillRect(x+1, y+1, w-2, 1); ctx.fillRect(x+1, y+h-2, w-2, 1);
      ctx.fillRect(x+1, y+1, 1, h-2); ctx.fillRect(x+w-2, y+1, 1, h-2);
      for (let t3 = 0; t3 < 3; t3++) {
        const a3 = reduceMotion ? (t3 === 0 ? .5 : 0) : Math.pow(Math.max(0, Math.sin(tick*.07 + t3*2.1 + hsh)), 2);
        if (a3 <= .02) continue;
        const tx2 = x + 3 + ((hsh*(t3+3) + t3*41) % Math.max(1, w-6)), ty2 = y + 3 + (((hsh>>(t3+1)) + t3*17) % Math.max(1, h-6));
        ctx.globalAlpha = a3*.95; ctx.fillRect(tx2, ty2-1, 1, 3); ctx.fillRect(tx2-1, ty2, 3, 1);
      }
      ctx.globalAlpha = 1;
    } else if (style === 'shimmer') {                                    // metal — bright top + specular sweep with trailing shine
      ctx.fillStyle = C(26); ctx.fillRect(x+1, y+1, w-2, 1);
      if (!reduceMotion) { const shx = x + ((tick*1.6) % (w+22)) - 11;
        ctx.globalAlpha = .5; ctx.fillStyle = '#FFFDE8'; ctx.fillRect(Math.round(shx), y+1, 3, h-2);
        ctx.fillStyle = '#FFF'; ctx.fillRect(Math.round(shx)+1, y+1, 1, h-2);
        ctx.globalAlpha = .18; ctx.fillStyle = '#FFFDE8'; ctx.fillRect(Math.round(shx)-6, y+1, 2, h-2);
        ctx.globalAlpha = 1; }
    } else if (style === 'glow') {                                       // neon tube — four pulsing inner edges + running current
      const pu2 = reduceMotion ? .55 : .35 + .35*Math.sin(tick*.12 + y*.2);
      ctx.fillStyle = C(38); ctx.globalAlpha = pu2;
      ctx.fillRect(x+1, y+1, w-2, 1); ctx.fillRect(x+1, y+h-2, w-2, 1);
      ctx.fillRect(x+1, y+1, 1, h-2); ctx.fillRect(x+w-2, y+1, 1, h-2);
      ctx.globalAlpha = .8; ctx.fillStyle = C(32); ctx.fillRect(x+2, y+2, w-4, 1);
      if (!reduceMotion) {
        const per = 2*(w-2) + 2*(h-2), cp2 = (tick*1.2 + hsh) % per;
        const edge = d3 => { let d = (cp2 - d3 + per) % per, px2, py2;
          if (d < w-2) { px2 = x+1+d; py2 = y+1; }
          else if (d < w-2 + h-2) { px2 = x+w-2; py2 = y+1 + (d-(w-2)); }
          else if (d < 2*(w-2) + h-2) { px2 = x+w-2 - (d-(w-2)-(h-2)); py2 = y+h-2; }
          else { px2 = x+1; py2 = y+h-2 - (d-2*(w-2)-(h-2)); }
          return [Math.round(px2), Math.round(py2)]; };
        const c1 = edge(0), c2 = edge(2);
        ctx.globalAlpha = .95; ctx.fillStyle = '#FFF'; ctx.fillRect(c1[0], c1[1], 1, 1);
        ctx.globalAlpha = .45; ctx.fillRect(c2[0], c2[1], 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
```

- [ ] **Step 4: Green run** (background). Expect all v110 checks + existing style smoke
  (headless.js:666) green.
- [ ] **Step 5: Commit** `git add index.html tests/headless.js` →
  `"v110 Part A: skin finishes clipped to block + ember/facet/sparkle/glow redesigns"`.

---

### Task 2: Sky Map level cards

**Files:**
- Modify: `index.html:4606` (add MAP_CARD_H), `4624-4641` (skyMapNodes), `4651-4668`
  (mapTapAt), `5044-5130` (renderSkyMap world layer)
- Test: `tests/headless.js:117` (rewrite weave check), `:244` (rewrite empty-tap), v110 section

**Interfaces:** `skyMapNodes()` returns `{pts, start, gate, colX, colW, midX, viewTop,
viewBot}` (amp/islandW dropped — no external consumers). `MAP_CARD_H = 48`. pts[i] = card
centers (x always midX).

- [ ] **Step 1: Rewrite the two stale checks + add v110 checks:**

Line 117 replacement:
```js
check('v110 skyMapNodes: cards centered on midX (weave removed)', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.every(p => p.x === L.midX) && L.colX >= 0 && L.colX + L.colW <= W; })()'));
```

Line 244 replacement (empty tap now = the 12px gap between cards):
```js
check('map: tapping between cards changes nothing (empty tap ignored)', () => tap.run(
  '(() => { openSkyMap(); const sel0 = selLevel; const L = __C(1); __T(L.midX, Math.round((L.pts[1].y + L.pts[2].y)/2)); return skyMap === true && selLevel === sel0; })()'));
```

New v110 checks (after Task 1's):
```js
check('v110 card hit-test spans the full card width', () => tap.run(
  '(() => { const L = __C(2); __T(L.colX + 3, L.pts[2].y); return selLevel === 2 && skyMap === true; })()'));
check('v110 map cards stay inside the column and never overlap', () => fresh.run(
  '(() => { for (const [w,hh] of [[180,390],[180,520],[242,300],[320,480],[480,270]]) { W=w;H=hh;relayout();' +
  'skyMap=true; const L=skyMapNodes();' +
  'const cards=[...L.pts, L.gate].map(p=>({y0:p.y-MAP_CARD_H/2, y1:p.y+MAP_CARD_H/2}));' +
  'if (L.colX < 0 || L.colX + L.colW > W) return false;' +
  'for (let i=0;i<cards.length-1;i++) if (cards[i].y0 <= cards[i+1].y1) return false;' +
  '} skyMap=false; return true; })()'));
check('v110 sky map renders card grammar, trail and full-size islands gone from the world layer', () =>
  /Extra Modes-style level cards/.test(src) && !/winding dotted trail/.test(src) &&
  !/const wv = i => midX \+ Math\.round\(amp/.test(src));
```
Note the sweep at headless.js:1367 (v100) keeps running against the new renderer — it is the
text-overlap gate for the cards; do not modify it.

- [ ] **Step 2: Red run** (background). Expect: 117-replacement, 244-replacement, and the 4
  new checks failing; old weave check gone.
- [ ] **Step 3: Implement `skyMapNodes` + constant.** Line 4606 becomes
  `const MAP_ROW = 60, MAP_CARD_H = 48, MAP_HEAD = 38, MAP_FOOT = 10;`. Replace 4622-4641:

```js
// v110: level CARDS — every node centers on midX (the old S-curve weave is gone); y stays
// evenly spaced by altitude so scroll + progress math is unchanged
function skyMapNodes() {
  const viewTop = MAP_HEAD + 4, viewBot = H - MAP_FOOT - 4;
  const colW = Math.min(W - 8, 300), colX = Math.round((W - colW) / 2);
  const n = TIERS.length, midX = Math.round(W / 2);
  const contentH = (n + 2) * MAP_ROW;                       // ground + levels + gate
  mapScrollMax = Math.max(0, contentH - (viewBot - viewTop));
  mapScroll = clamp(mapScroll, 0, mapScrollMax);
  const base = mapScrollMax > 0
    ? viewBot - 16 + Math.round(mapScroll)
    : Math.round((viewTop + viewBot) / 2 + contentH / 2) - 16;
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: midX, y: base - (i + 1) * MAP_ROW });
  return { pts, start: { x: midX, y: base }, gate: { x: midX, y: base - (n + 1) * MAP_ROW },
           colX, colW, midX, viewTop, viewBot };
}
```

- [ ] **Step 4: Implement `mapTapAt` card hit boxes.** Replace the HITX/HITY loop body (4654-
  4667): `const inView = ...` kept; stage hit becomes
  `if (Math.abs(p.x - pt.x) <= L.colW/2 && Math.abs(p.y - pt.y) <= MAP_CARD_H/2)`; gate check
  uses the same box → `sfx.deny()`.
- [ ] **Step 5: Implement the card renderer.** Inside the existing viewport clip, KEEP
  `drawMapDecor(L, ph)`; DELETE: the mp trail-marker block, the winding dotted trail loop, the
  ground disc marker (keep a plain GROUND label), the old stage loop, and the trailing
  `drawMascot(mp...)` line. Insert:

```js
  // v110: Extra Modes-style level cards over the themed sky. v100 rule kept: while a stage
  // is SELECTED its second line becomes the start-condition caption.
  const champ = prog >= TIERS.length;
  const nextByHeight = bestHeight > 0 ? TIERS.findIndex(t => bestHeight < t.n) : -1;
  const bestCard = bestHeight <= 0 ? -1 : nextByHeight === -1 ? TIERS.length : nextByHeight;
  if (L.start.y > L.viewTop - 6 && L.start.y < L.viewBot + 12)
    txt('GROUND', L.midX, L.start.y - 3, 1, 'rgba(255,246,232,0.4)', 'center');
  for (let k = TIERS.length; k >= 0; k--) {
    const isGate = k === TIERS.length;
    const pt = isGate ? L.gate : L.pts[k];
    const cy2 = Math.round(pt.y - MAP_CARD_H/2), cx2 = L.colX, cw2 = L.colW;
    if (cy2 + MAP_CARD_H < L.viewTop - 2 || cy2 > L.viewBot + 2) continue;
    const t = isGate ? null : TIERS[k];
    const cleared = !isGate && k < prog, isNext = !isGate && k === prog, unlocked = !isGate && k <= prog;
    const sel = !isGate && selLevel === k && unlocked;
    const accent = isGate ? VISUAL_SYSTEM.palette.gold : unlocked ? t.c : 'rgba(255,246,232,0.24)';
    pixelFrame(cx2, cy2, cw2, MAP_CARD_H, sel ? uiA(.16) : 'rgba(17,17,25,0.88)', accent, sel || (isGate && champ));
    ctx.fillStyle = accent; ctx.globalAlpha = sel || isNext || isGate ? 1 : .36;
    ctx.fillRect(cx2+4, cy2+5, 2, MAP_CARD_H-10); ctx.globalAlpha = 1;
    // island + weather miniature through a clipped thumbnail window
    const thX = cx2+10, thY = cy2+8, thS = 32;
    ctx.save(); ctx.beginPath(); ctx.rect(thX, thY, thS, thS); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(thX, thY, thS, thS);
    if (isGate && !champ) {                                   // the sealed golden door, native scale
      const gx2 = thX + thS/2, gy2 = thY + thS/2 - 2;
      ctx.fillStyle = '#9A7420'; ctx.fillRect(gx2-10, gy2-9, 20, 19);
      ctx.fillStyle = '#FFD75E'; ctx.fillRect(gx2-8, gy2-7, 16, 17);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(gx2-8, gy2-7, 16, 1);
      ctx.fillStyle = '#5E4610'; ctx.fillRect(gx2-4, gy2-1, 8, 11);
      txt('?', gx2, gy2+1, 1, '#FFD75E', 'center');
    } else {                                                  // the stage island, scaled to fit (gate-champ = golden dais)
      const bob = reduceMotion ? 0 : Math.round(Math.sin(tick*.045 + k*1.3)*2);
      ctx.translate(thX + thS/2, thY + thS*0.55 + bob*0.3); ctx.scale(0.32, 0.32);
      drawIsland(isGate ? 10 : k, 0, 0);
      drawStageWeather(isGate ? 10 : k, 0, -6, ph);
    }
    ctx.restore();
    const tx0 = thX + thS + 6, txR = cx2 + cw2 - 7, dimTxt = 'rgba(255,246,232,0.45)';
    if (isGate) {
      txt(champ ? 'SKY CHAMPION' : '? ? ?', tx0, cy2+11, 1, '#FFD75E', 'left');
      txt(champ ? 'THE GATE IS OPEN' : 'SEALED - ' + TIERS[TIERS.length-1].n*METERS_PER + 'M', tx0, cy2+27, 1, 'rgba(255,246,232,0.55)', 'left');
    } else {
      txt((k+1) + '. ' + t.name, tx0, cy2+11, 1, unlocked ? t.c : dimTxt, 'left');
      txt(t.n*METERS_PER + 'M', txR, cy2+11, 1, unlocked ? 'rgba(255,246,232,0.7)' : dimTxt, 'right');
      if (sel) {
        const cp = checkpointForLevel(k);
        txt(cp.startAltitude ? cp.name.split(' ')[0]+' CP - '+(cp.scoreMultiplier+'X').replace('0.','.') : 'GROUND - FULL SCORE',
            tx0, cy2+27, 1, 'rgba(255,246,232,0.75)', 'left');
        const pw2 = 34, px2 = cx2 + cw2 - pw2 - 6;
        plate3D(px2, cy2 + MAP_CARD_H - 14, pw2, 9, playA(.8 + .12*Math.sin(tick*.1)));
        txt('PLAY', px2 + pw2/2, cy2 + MAP_CARD_H - 12, 1, '#08301F', 'center');
      } else {
        for (let s2 = 0; s2 < 3; s2++) drawStarPix(tx0 + s2*8, cy2 + 26, 1, unlocked && s2 < (levelStars[k] || 0));
        txt(cleared ? 'CLEARED' : isNext ? 'NEXT' : 'LOCKED', txR, cy2+27, 1,
            cleared ? '#62E8B5' : isNext ? t.c : dimTxt, 'right');
      }
    }
    // mascot perches on the card holding your best height (skipped while selected — the
    // PLAY pill owns that corner)
    if (bestCard === k && !sel) { ctx.save(); ctx.beginPath(); ctx.rect(cx2, cy2, cw2, MAP_CARD_H); ctx.clip();
      drawMascot(cx2 + cw2 - 16, cy2 + MAP_CARD_H - 4); ctx.restore(); }
  }
```

- [ ] **Step 6: Green run** (background). Expect all v110 + rewritten checks green, plus the
  untouched gates: v100 sweep (1367), tap tests (229-248), helper-exists (255/264).
- [ ] **Step 7: Commit** → `"v110 Part B: sky map rebuilt as level cards with island miniatures"`.

---

### Task 3: Cache bump + browser QA + deploy

- [ ] **Step 1:** Flip the cache test in headless.js to `skystack-v110`; verify red by
  inspection (sw.js still v109); bump `sw.js` CACHE to `skystack-v110`.
- [ ] **Step 2:** Full suite (background, 600s) — expect green.
- [ ] **Step 3:** Browser QA (preview :3000, `fadeT=0`, probe W first, recv.js one-shot per
  capture): (a) skins — equip LAVA/NEON/FROST/JADE in turn, render a tower, capture; verify
  veins/tube/twinkles/facets read and nothing draws outside any block edge (pixel probe the
  1px band around a block: identical to background). (b) map — open Sky Map at narrow (~180)
  and wide, capture: cards centered, thumbnails clipped, selected card shows caption + PLAY,
  gate card sealed, mascot on best card.
- [ ] **Step 4:** Commit cache bump (message file if quotes needed). Verify committed tree =
  tested tree. Push (separate command). Verify origin sw.js says skystack-v110.

### Task 4: Vault close-out

- [ ] Update CURRENT_STATE.md + CURRENT_HANDOFF.md; DECISIONS.md #57 (containment clip
  contract + card-map contract); dated session log; delete RECOVERY_CHECKPOINT.md; commit,
  push, verify. Give Asher `https://asherbb6.github.io/SKYSTACK/?fresh=110`.

## Self-review notes
- Spec coverage: Part A styles (7/7) ✓, halo removal ✓, reduceMotion ✓, containment test ✓;
  Part B geometry/cards/thumbnails/gate/mascot/header-unchanged/input ✓, sweep via kept v100
  test + new card-bounds check ✓. Cache/deploy/close-out ✓.
- Type consistency: MAP_CARD_H used in nodes/tap/render/tests; pts.x === midX everywhere.
- Known intentional behavior changes pinned by rewritten tests: weave → centered; empty-tap
  region moves to the inter-card gap.
