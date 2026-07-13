// SKYSTACK headless check suite — stubs browser APIs, evals the game script in a vm
// context, then drives internal functions to verify the campaign level system + SKY MAP.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const src = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

// universal callable proxy: any property access / call returns another one
function anyProxy() {
  const fn = function () { return p; };
  const p = new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then') return undefined;
      return p;
    },
    set() { return true; },
    apply() { return p; }
  });
  return p;
}

function makeGame(storageSeed, reducedMotion) {
  const mem = new Map(Object.entries(storageSeed || {}));
  const ctx2d = anyProxy();
  const canvas = {
    width: 0, height: 0, style: {},
    getContext: () => ctx2d,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 480 }),
    toBlob: (cb) => cb(null),
    addEventListener: () => {}, removeEventListener: () => {},
    setPointerCapture: () => {}, releasePointerCapture: () => {}
  };
  const noop = () => {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: noop,
    innerWidth: 320, innerHeight: 480,
    addEventListener: noop, removeEventListener: noop,
    matchMedia: () => ({ matches: !!reducedMotion, addEventListener: noop }),
    document: {
      getElementById: () => canvas,
      addEventListener: noop, hidden: false,
      documentElement: {}, fullscreenElement: null,
      createElement: () => canvas
    },
    navigator: {},
    location: { protocol: 'file:', href: 'file:///skystack', search: '' },
    URLSearchParams, URL, Blob: class {}, FileReader: class {},
    localStorage: {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => mem.delete(k)
    },
    Math, JSON, Date
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(src, context, { filename: 'skystack-inline.js' });
  return { context, mem, run: code => vm.runInContext(code, context) };
}

const results = [];
function check(name, fn) {
  try {
    const v = fn();
    results.push([!!v, name, v === true ? '' : String(v)]);
  } catch (e) {
    results.push([false, name, 'THREW: ' + e.message]);
  }
}

// ---------- fresh-profile context ----------
const fresh = makeGame();
check('boots without throwing (fresh profile)', () => fresh.run('booted === true'));
check('TIERS has 11 stages', () => fresh.run('TIERS.length === 11'));
check('TIERS names are the 11-stage continuous world', () => fresh.run(
  `JSON.stringify(TIERS.map(t=>t.name)) === JSON.stringify(['CAVES','SURFACE','TREETOPS','ROOFTOPS','CLOUD NINE','JET STREAM','STRATOSPHERE','AURORA','SPACE','ORBIT','THE STARS'])`));
check('every tier has a theme color', () => fresh.run(`TIERS.every(t => /^#[0-9A-F]{6}$/i.test(t.c))`));
check('fresh profile: prog=0, no active level', () => fresh.run('prog === 0 && runLevel === -1'));
check('extras picker excludes the campaign mode', () => fresh.run(
  `EXTRAS.length === 4 && !EXTRAS.some(m => m.id === 'level')`));
check('skyMapNodes: 11 pts + start + gate', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.length === 11 && L.start && L.gate; })()'));
check('skyMapNodes: badge rows evenly spaced in altitude', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.every((p,i) => (i===0 ? L.start.y - p.y === MAP_ROW : L.pts[i-1].y - p.y === MAP_ROW)) && L.gate.y === L.pts[10].y - MAP_ROW; })()'));
check('skyMapNodes: trail weaves left/right but stays inside the column', () => fresh.run(
  '(() => { const L = skyMapNodes(); const xs = L.pts.map(p=>p.x); return xs.every(x => x >= L.colX && x <= L.colX + L.colW) && new Set(xs).size > 1; })()'));
check('skyMapNodes: column centered and inside canvas', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.colX >= 0 && L.colX + L.colW <= W && Math.abs((L.colX) - (W - L.colX - L.colW)) <= 1; })()'));
check('openSkyMap clamps scroll and selects the next level', () => fresh.run(
  '(() => { openSkyMap(); return skyMap === true && mapScroll >= 0 && mapScroll <= mapScrollMax && selLevel === 0; })()'));
check('renderSkyMap runs without throwing (prog=0)', () => { fresh.run('renderSkyMap()'); return true; });
check('drawStageDeco runs for all 11 stages', () => { fresh.run('for (let i=0;i<TIERS.length;i++) drawStageDeco(i, 100, 100)'); return true; });
check('renderHome runs without throwing', () => { fresh.run('state="home"; skyMap=false; renderHome()'); return true; });

// ---------- campaign level runs ----------
const lv = makeGame();
lv.run('startLevel(0)');
check('level 1 starts on the ground', () => lv.run('state === "playing" && runLevel === 0 && runLaunch === 0 && blocks.length === 1'));
lv.run('score = 500; runPerfects = TIERS[0].n; while (blocks.length < TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"});');
lv.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('reaching the goal wins the level', () => lv.run('state === "levelwin"'));
check('level win: stage unlocked (prog=1)', () => lv.run('prog === 1 && winFirst === true'));
check('level win: 3 stars for a near-perfect run', () => lv.run('winStars === 3'));
check('level win: stars persisted', () => lv.run('levelStars[0] === 3') && lv.mem.get('skystack-levelstars') === '[3]');
check('level win: coins rewarded', () => lv.run('winReward > 0 && coins >= winReward'));
check('level win: no endless records written', () => lv.run('best === 0 && bestHeight === 0'));
check('renderLevelWin runs without throwing', () => { lv.run('winT = 60; renderLevelWin()'); return true; });
check('win screen NEXT starts the next level', () => lv.run(
  '(() => { winT = 60; relayout(); pressDown(null); return state === "playing" && runLevel === 1 && runLaunch === TIERS[0].n && blocks.length === TIERS[0].n; })()'));
check('a campaign level slider carries the per-level speed bump', () => lv.run(
  '(() => { const cur = slider.speed; const rl = runLevel; runLevel = 0; spawnSlider(); const base = slider.speed; runLevel = rl; return cur > base; })()'));

// fail path
lv.run('score = 300; while (blocks.length < 20) blocks.push({x:0,w:96,col:"#fff"});');
lv.run('gameOver("topple")');
check('failing a level shows the fail screen', () => lv.run('state === "levelfail"'));
check('level fail: records still untouched', () => lv.run('best === 0 && bestHeight === 0'));
check('renderLevelFail runs without throwing', () => { lv.run('failT = 60; renderLevelFail()'); return true; });
check('fail screen RETRY restarts the same level', () => lv.run(
  '(() => { failT = 60; pressDown(null); return state === "playing" && runLevel === 1 && blocks.length === TIERS[0].n; })()'));
lv.run('gameOver("fall"); failT = 60; state = "home";');

// second visit is not a first clear
lv.run('startLevel(0); while (blocks.length < TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"}); runPerfects = 0;');
lv.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('replaying a level: no new unlock, 1 star floor', () => lv.run('winFirst === false && winStars === 1'));
check('replaying a level: best stars kept', () => lv.run('levelStars[0] === 3'));

// ---------- veteran-profile context (bestHeight 60 blocks = 180M) ----------
const vet = makeGame({
  'skystack-height': '60',
  'skystack-best': '900'
});
check('prog seeded from lifetime best (60 blocks)', () => vet.run('prog === TIERS.filter(t => 60 >= t.n).length'));

// level runs pre-stack to the previous stage
vet.run('startLevel(2)');
check('level 3 pre-stacks to the previous stage', () => vet.run('runLaunch === TIERS[1].n && blocks.length === TIERS[1].n'));
check('level 3 skips pre-stacked tiers (tier=2)', () => vet.run('tier === 2'));
check('level run: pickups pushed above the pre-stack', () => vet.run('nextPickupRow >= blocks.length + 4'));
check('level run: score starts at 0', () => vet.run('score === 0'));

// records must NOT update for level attempts
vet.run('score = 99999; while (blocks.length < 45) blocks.push({x:0,w:96,col:"#fff"});');
vet.run('gameOver("fall")');
check('level gameOver: best score untouched', () => vet.run('best === 900'));
check('level gameOver: best height untouched', () => vet.run('bestHeight === 60'));
check('level gameOver: stored best not polluted', () => vet.mem.get('skystack-best') === '900' ? true : 'stored: ' + vet.mem.get('skystack-best'));
check('level gameOver: lands on the fail screen', () => vet.run('state === "levelfail"'));

// free modes: ground runs update records normally
vet.run('state = "home"; mode = "endless"; resetRun(); state = "playing";');
check('endless run: single base block, no level', () => vet.run('blocks.length === 1 && runLaunch === 0 && runLevel === -1'));
vet.run('score = 1500; while (blocks.length < 80) blocks.push({x:0,w:96,col:"#fff"});');
vet.run('gameOver("fall")');
check('endless gameOver: best score updates', () => vet.run('best === 1500'));
check('endless gameOver: best height updates', () => vet.run('bestHeight === 80'));
check('endless gameOver: normal game over screen', () => vet.run('state === "gameover"'));

// extras never pre-stack
vet.run('mode = "pure"; pendingLevel = 3; resetRun()');
check('PURE mode: never pre-stacked', () => vet.run('runLaunch === 0 && runLevel === -1 && blocks.length === 1'));
vet.run('mode = "daily"; resetRun()');
check('DAILY mode: never pre-stacked', () => vet.run('runLaunch === 0 && blocks.length === 1'));
vet.run('mode = "time"; resetRun()');
check('TIME mode: never pre-stacked', () => vet.run('runLaunch === 0 && blocks.length === 1'));

// ---------- endless milestone banners still unlock stages ----------
const lc = makeGame();
lc.run('mode = "endless"; resetRun();');
lc.run('while (blocks.length < TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('endless first reach of stage 1: LEVEL CLEAR banner', () => lc.run('bannerText === "LEVEL CLEAR - CAVES"'));
check('endless first reach of stage 1: prog -> 1', () => lc.run('prog === 1'));
check('prog persisted to storage', () => lc.mem.get('skystack-tiers') === '1' ? true : 'stored: ' + lc.mem.get('skystack-tiers'));
lc.run('resetRun(); while (blocks.length < TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('endless re-reaching a cleared stage: plain milestone banner', () => lc.run('bannerText === (TIERS[0].n*METERS_PER) + "M - " + TIERS[0].name'));
lc.run('prog = TIERS.length - 1; resetRun(); tier = TIERS.length - 1;');
lc.run('while (blocks.length < TIERS[TIERS.length-1].n) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('endless reaching THE STARS first time: SKY CONQUERED banner', () => lc.run('bannerText === "SKY CONQUERED!"'));
check('game beaten: prog = all stages', () => lc.run('prog === TIERS.length'));
check('renderSkyMap champion state runs (crown/gate)', () => { lc.run('renderSkyMap()'); return true; });
check('renderHome conquered state runs', () => { lc.run('state = "home"; renderHome()'); return true; });

// ---------- map tap + drag input (taps resolve on release) ----------
const tap = makeGame({ 'skystack-height': '60' });   // prog seeds to 3
tap.run('mode = "endless"; state = "home"; openSkyMap();');
// pos() is a top-level function declaration -> reassignable on the sandbox global
tap.run('var __p = {x:0,y:0}; pos = () => __p;');
tap.run('var __T = (x, y) => { __p = {x:x, y:y}; pressDown({}); pressUp({}); };');
// center a badge row in the viewport before tapping it (as dragging would)
tap.run('var __C = (i) => { let L = skyMapNodes(); mapScroll = clamp(mapScroll + ((L.viewTop+L.viewBot)/2 - L.pts[i].y), 0, mapScrollMax); return skyMapNodes(); };');
check('openSkyMap pre-selects the next level', () => tap.run('selLevel === prog'));
check('map tap: first tap on a cleared badge selects it', () => tap.run(
  '(() => { const L = __C(1); __T(L.pts[1].x, L.pts[1].y); return selLevel === 1 && skyMap === true && state === "home"; })()'));
check('map tap: second tap on the selected badge launches it', () => tap.run(
  '(() => { const L = __C(1); __T(L.pts[1].x, L.pts[1].y); return state === "playing" && runLevel === 1 && runLaunch === TIERS[0].n && skyMap === false; })()'));
tap.run('gameOver("fall"); failT = 60; state = "home"; openSkyMap();');
check('map tap: locked badge refuses', () => tap.run(
  '(() => { const li = TIERS.length - 2; const L = __C(li); __T(L.pts[li].x, L.pts[li].y); return selLevel === prog && skyMap === true; })()'));
check('map tap: tapping the pre-selected next badge plays it', () => tap.run(
  '(() => { const L = __C(prog); __T(L.pts[prog].x, L.pts[prog].y); return state === "playing" && runLevel === prog && runLaunch === TIERS[prog-1].n; })()'));
tap.run('gameOver("fall"); failT = 60; state = "home"; openSkyMap();');
check('map tap: sealed gate refuses, map stays open', () => tap.run(
  '(() => { mapScroll = mapScrollMax; const L = skyMapNodes(); __T(L.gate.x, L.gate.y); return skyMap === true && state === "home"; })()'));
check('map tap: empty space does not close or select', () => tap.run(
  '(() => { openSkyMap(); const sel0 = selLevel; const L = skyMapNodes(); __T(L.colX + 2, Math.round((L.viewTop + L.viewBot)/2)); return skyMap === true && selLevel === sel0; })()'));
check('map tap: header tap closes the map', () => tap.run(
  '(() => { __T(Math.round(W/2), 20); return skyMap === false; })()'));
check('map drag: scrolls without selecting or launching', () => tap.run(
  '(() => { openSkyMap(); const s0 = mapScroll; const L = skyMapNodes(); __p = {x:L.colX+3, y:L.pts[1].y}; pressDown({}); __p = {x:L.colX+3, y:L.pts[1].y + 40}; pressMove({}); pressUp({}); return mapScroll !== s0 && selLevel === prog && state === "home" && skyMap === true; })()'));
check('map renders the redesigned winding trail at every scroll', () => {
  const r = makeGame({ 'skystack-height': '900', 'skystack-tiers': '11' });   // champion: gate open
  r.run('state = "home"; openSkyMap();');
  r.run('for (let s = 0; s <= mapScrollMax; s += 40) { mapScroll = s; renderSkyMap(); }');
  return true;
});
check('map art helpers exist (drawIsland, drawCloudIsland, drawMapDecor, liteHex)', () => tap.run(
  '["drawIsland","drawCloudIsland","drawMapDecor","liteHex"].every(f => typeof globalThis[f] === "function" || eval("typeof " + f) === "function")'));
check('liteHex lightens a hex color toward white', () => tap.run('liteHex("#000000", .5) === "rgb(128,128,128)" && liteHex("#3F9E4C", 0) === "rgb(63,158,76)"'));
check('drawMapDecor + drawIsland run for every stage without throwing', () => {
  const r = makeGame({ 'skystack-height': '200', 'skystack-tiers': '6' });
  r.run('state = "home"; openSkyMap();');
  r.run('const L = skyMapNodes(); drawMapDecor(L, 100); for (let i = 0; i < TIERS.length; i++) drawIsland(i, W/2, 100 + i);');
  return true;
});
check('map helpers exist (mapNode3D, dkHex, openSkyMap, mapTapAt, drawIsland, mapBadge)', () => tap.run(
  '["mapNode3D","dkHex","openSkyMap","mapTapAt","drawIsland","mapBadge"].every(f => typeof globalThis[f] === "function" || eval("typeof " + f) === "function")'));
check('dkHex darkens a hex color', () => tap.run('dkHex("#FFD75E", .5) === "rgb(128,108,47)"'));

// ---------- revive: one paid second chance per run ----------
const rv = makeGame({ 'skystack-coins': '200' });
rv.run('mode = "endless"; resetRun(); state = "playing";');
rv.run('score = 200; while (blocks.length < 12) blocks.push({x:0,w:96,col:"#fff"}); tier = 1;');
rv.run('gameOver("topple")');
check('endless death offers a revive, settlement deferred', () => rv.run(
  'state === "gameover" && reviveOffered === true && runSettled === false && stats.games === 0'));
check('revive cost scales with stage (25 + tier*5)', () => rv.run('reviveCost() === 30'));
check('records still write at the first death', () => rv.run('best === 200 && bestHeight === 12'));
check('renderGameOver with the offer runs without throwing', () => { rv.run('renderGameOver()'); return true; });
rv.run('var __c0 = coins; doRevive()');
check('revive: coins spent, run resumes, shield granted', () => rv.run(
  'state === "playing" && coins === __c0 - 30 && shield >= 1 && reviveUsed === true'));
check('revive: coin spend persisted', () => rv.mem.get('skystack-coins') === '170' ? true : 'stored: ' + rv.mem.get('skystack-coins'));
check('revive: death state scrubbed, new block sliding', () => rv.run(
  'balance === 0 && debris.length === 0 && faller === null && slider !== null && overCause === ""'));
rv.run('score = 500; while (blocks.length < 20) blocks.push({x:0,w:96,col:"#fff"});');
rv.run('gameOver("miss")');
check('second death: no second revive, run settles', () => rv.run('reviveOffered === false && runSettled === true'));
check('second death: final records include post-revive climb', () => rv.run('best === 500 && bestHeight === 20'));
check('revived run counts as exactly one game', () => rv.run('stats.games === 1'));
check('doRevive after settling is refused', () => rv.run('(() => { const c = coins; doRevive(); return coins === c && state === "gameover"; })()'));

// game-over REVIVE button + decline flow
const dc = makeGame({ 'skystack-coins': '10' });
dc.run('mode = "endless"; resetRun(); state = "playing"; score = 50; gameOver("miss"); overLock = 0;');
check('too poor: offer still shows (NEED label), button refuses', () => dc.run(
  '(() => { if (!(reviveOffered && coins < reviveCost())) return false; doRevive(); return state === "gameover" && reviveUsed === false && coins === 10; })()'));
dc.run('pos = () => ({x: -999, y: -999}); pressDown({})');
check('declining the offer settles in place, screen stays', () => dc.run(
  'state === "gameover" && runSettled === true && reviveOffered === false && stats.games === 1'));
check('tap after declining goes home', () => dc.run('(() => { pressDown({}); return state === "home"; })()'));
const bt = makeGame({ 'skystack-coins': '100' });
bt.run('mode = "endless"; resetRun(); state = "playing"; gameOver("miss"); overLock = 0;');
bt.run('pos = () => ({x: REVIVE_BTN.x + 5, y: REVIVE_BTN.y + 5}); pressDown({})');
check('game-over REVIVE button tap revives', () => bt.run('state === "playing" && reviveUsed === true'));

// campaign level revive: resumes the climb, leaderboard stays protected
const lr = makeGame({ 'skystack-height': '60', 'skystack-best': '900', 'skystack-coins': '300' });
lr.run('startLevel(2)');
lr.run('score = 100; gameOver("topple"); failT = 60;');
check('level fail offers a revive row', () => lr.run('state === "levelfail" && reviveOffered === true'));
check('renderLevelFail with the offer runs without throwing', () => { lr.run('renderLevelFail()'); return true; });
lr.run('pos = () => ({x: FAIL_REV.x + 5, y: FAIL_REV.y + 5}); pressDown({})');
check('level-fail REVIVE row tap resumes the level', () => lr.run(
  'state === "playing" && runLevel === 2 && reviveUsed === true'));
lr.run('score = 88888; gameOver("miss"); failT = 60;');
check('revived level run: records still untouched', () => lr.run(
  'best === 900 && bestHeight === 60 && state === "levelfail" && reviveOffered === false'));
check('fail RETRY starts a fresh run with the revive back', () => lr.run(
  '(() => { pos = () => ({x:0,y:0}); pressDown(null); return state === "playing" && reviveUsed === false && runSettled === false; })()'));

// ---------- stage clear celebration screen ----------
const cel = makeGame();
cel.run('winStars = 3; winReward = 40; winFirst = true; runLaunch = 0; runPerfects = 5; state = "levelwin";');
check('themed win screen renders for all 11 stages at every phase', () => {
  cel.run('for (let i = 0; i < TIERS.length; i++) { runLevel = i; for (const t of [5, 20, 40, 70, 120]) { winT = t; renderLevelWin(); } }');
  return true;
});
check('drawStageDecoScaled helper exists', () => cel.run('typeof drawStageDecoScaled === "function"'));
check('level win leaves the mascot celebrating', () => {
  const lw = makeGame();
  lw.run('startLevel(0); while (blocks.length < TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"});');
  lw.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
  return lw.run('state === "levelwin" && mascot.expr === "happy"');
});

// modes/causes that never offer one
const nx = makeGame({ 'skystack-coins': '500' });
nx.run('mode = "pure"; resetRun(); state = "playing"; gameOver("miss")');
check('PURE mode never offers revive, settles at once', () => nx.run('reviveOffered === false && runSettled === true'));
nx.run('state = "home"; mode = "daily"; resetRun(); state = "playing"; gameOver("miss")');
check('DAILY mode never offers revive', () => nx.run('reviveOffered === false'));
nx.run('state = "home"; mode = "time"; resetRun(); state = "playing"; gameOver("time")');
check('running out of time never offers revive', () => nx.run('reviveOffered === false'));
nx.run('state = "home"; mode = "endless"; resetRun(); state = "playing"; gameOver("quit")');
check('quitting never offers revive', () => nx.run('reviveOffered === false'));

// ---------- home screen ----------
const home = makeGame({ 'skystack-height': '60' });
check('home: next-level card shows the next level', () => {
  home.run('mode = "endless"; state = "home";');
  home.run('var __texts = []; var __txt0 = txt; txt = function(t,...a){ __texts.push(String(t)); return __txt0(t,...a); };');
  home.run('renderHome()');
  return home.run('__texts.some(t => t === ("LEVEL " + (prog+1) + " - " + TIERS[prog].name)) && __texts.some(t => t === "EXTRA MODES")');
});
check('home PLAY starts the next level', () => home.run(
  '(() => { const p = {x: PLAY_BTN.x + 5, y: PLAY_BTN.y + 5}; pos = () => p; pressDown({}); return state === "playing" && runLevel === prog && runLaunch === TIERS[prog-1].n; })()'));

// ---------- dynamic difficulty (skill-adaptive assist) ----------
const dd = makeGame();   // fresh profile: skill defaults to 0.35
dd.run('mode = "endless"; resetRun();');
check('endless run seeds assist from skill (>0 for a new player)', () => dd.run('assist > 0 && assist <= 0.5'));
check('assist widens the perfect window; assist 0 == base window', () => dd.run(
  '(() => { const base = PERFECT_PX*(auraBlocks>0?2:1); assist = 0.5; const wide = effPerfect(); assist = 0; const norm = effPerfect(); return wide > norm && Math.abs(norm - base) < 1e-9; })()'));
check('assist slows the slider vs no assist', () => dd.run(
  '(() => { assist = 0; spawnSlider(); const fast = slider.speed; assist = 0.5; spawnSlider(); const slow = slider.speed; return slow < fast; })()'));
check('assistFloor stays within [0,0.5]', () => dd.run('assistFloor() >= 0 && assistFloor() <= 0.5'));
check('drawStageWeather runs for all 11 stages without throwing', () => { dd.run('for (let i=0;i<TIERS.length;i++) drawStageWeather(i, W/2, 100, 50)'); return true; });
dd.run('mode = "pure"; resetRun();');
check('PURE mode runs with no assist', () => dd.run('assist === 0'));
dd.run('mode = "daily"; resetRun();');
check('DAILY mode runs with no assist', () => dd.run('assist === 0'));

const sk = makeGame();   // skill adapts when the run finalizes (revive declined) and persists
sk.run('mode = "endless"; resetRun(); state = "playing"; globalThis.__s0 = skill;');
sk.run('maxCombo = 12; score = 800; while (blocks.length < 40) blocks.push({x:0,w:96,col:"#fff"});');
sk.run('gameOver("fall"); finalizeRun();');   // die, then decline the revive -> settle
check('a strong run raises the personal skill estimate', () => sk.run('skill > __s0'));
check('skill persists to storage', () => sk.mem.has('skystack-skill') && Math.abs(parseFloat(sk.mem.get('skystack-skill')) - sk.run('skill')) < 1e-6);
check('a higher skill means a lower starting assist', () => {
  const lo = makeGame({ 'skystack-skill': '0.1' }), hi = makeGame({ 'skystack-skill': '0.9' });
  lo.run('mode="endless"; resetRun();'); hi.run('mode="endless"; resetRun();');
  return lo.run('assist') > hi.run('assist');
});

// ---------- in-game biome backdrop (matches the map per tier) ----------
const bio = makeGame({ 'skystack-height': '300' });
bio.run('mode = "endless"; resetRun(); state = "playing";');
check('biome helpers exist (drawBiomeDecor, biomeSprite)', () => bio.run(
  'typeof drawBiomeDecor === "function" && typeof biomeSprite === "function"'));
check('layered biome helpers exist (biomeBackdrop, biomeWeather, skyWash, biomeTierAt, bhash)', () => bio.run(
  '["biomeBackdrop","biomeWeather","skyWash","biomeTierAt","bhash","ringFrame"].every(f => typeof globalThis[f] === "function" || eval("typeof " + f) === "function")'));
check('biomeSprite renders for all 11 tiers without throwing', () => { bio.run('for (let i=0;i<TIERS.length;i++) biomeSprite(i, 50, 100, i, 40)'); return true; });
check('biomeBackdrop renders every tier at full + faded alpha without throwing', () => {
  bio.run('for (let i=0;i<TIERS.length;i++) { biomeBackdrop(i, -1000, 1); biomeBackdrop(i, -6000, 0.4); }'); return true; });
check('biomeWeather runs for every tier without throwing', () => {
  bio.run('for (let i=0;i<TIERS.length;i++) biomeWeather(i, -2000, 1, 40)'); return true; });
check('biomeTierAt maps altitude to the SKY MAP stage', () => bio.run(
  'biomeTierAt(0) === 0 && biomeTierAt(TIERS[0].n - 1) === 0 && biomeTierAt(TIERS[0].n) === 1 && biomeTierAt(TIERS[1].n) === 2 && biomeTierAt(TIERS[7].n - 1) === 7 && biomeTierAt(TIERS[10].n - 1) === 10 && biomeTierAt(9999) === 10'));
check('bhash is deterministic and in [0,1)', () => bio.run(
  'bhash(7) === bhash(7) && bhash(7) >= 0 && bhash(7) < 1 && bhash(7) !== bhash(8)'));
check('drawBiomeDecor runs across the whole climb without throwing', () => {
  bio.run('for (let a = 0; a < 520; a += 30) { drawBiomeDecor(GROUND_Y - a*BH - (H-100)); }');
  return true;
});
// ---- realistic atmosphere (day -> sunset -> night -> space) ----
check('sky helpers exist (drawBiomeSky, drawSun, atmoDark, currentBiome, SKY_STOPS)', () => bio.run(
  '["drawBiomeSky","drawSun","atmoDark","currentBiome","rootedBuilding","rootedTree","foliageBlob"].every(f => typeof globalThis[f] === "function" || eval("typeof " + f) === "function") && Array.isArray(SKY_STOPS)'));
check('SKY_STOPS has a gradient (>=2 stops) for every tier', () => bio.run(
  'SKY_STOPS.length === 11 && SKY_STOPS.every(g => Array.isArray(g) && g.length >= 2 && g.every(st => st.length === 2))'));
check('SKY_STOPS is index-aligned to the 11 stages', () => bio.run('SKY_STOPS.length === 11'));
check('stageFloat blends smoothly across whole stages', () => bio.run(
  'typeof stageFloat === "function" && stageFloat(0) === 0 && stageFloat(TIERS[0].n/2) === 0.5 && stageFloat(TIERS[0].n) === 1 && stageFloat(TIERS[2].n) > stageFloat(TIERS[1].n) && stageFloat(9999) === TIERS.length - 1'));
check('atmoDark rises from a bright day to a dark space', () => bio.run(
  'atmoDark(5) < 0.2 && atmoDark(300) > 0.9 && atmoDark(90) > atmoDark(40)'));
check('currentBiome returns tier + cross-fade weights in [0,1]', () => bio.run(
  '(() => { const b = currentBiome(GROUND_Y - 40*BH - (H-100)); return b.ti >= 0 && b.ti < TIERS.length && b.wUp >= 0 && b.wUp <= 1 && b.wDn >= 0 && b.wDn <= 1; })()'));
check('drawBiomeSky + drawSun render across the whole climb without throwing', () => {
  bio.run('for (let a = 0; a < 520; a += 24) { drawBiomeSky(GROUND_Y - a*BH - (H-100), a); drawSun(a); }');
  return true;
});
// ---- Phase 2: continuous anchored world ----
check('worldY maps altitude to screen-y (higher A sits higher on screen)', () => bio.run(
  'typeof worldY === "function" && worldY(10, 0) < worldY(0, 0) && (worldY(0,0) - worldY(1,0)) === BH'));
check('anchored ground-world helpers exist + instance lists non-empty', () => bio.run(
  '["drawGroundWorld","drawCaveWalls","drawSurfaceGround","rootedBuilding","rootedTree","foliageBlob"].every(f => eval("typeof "+f) === "function") && BUILDINGS.length > 0 && TREES.length > 0 && typeof SURF_A === "number"'));
check('every rooted building/tree has a top ABOVE the surface line', () => bio.run(
  'BUILDINGS.every(b => b.topA > SURF_A) && TREES.every(t => t.topA > SURF_A)'));
check('drawGroundWorld renders across the whole climb without throwing', () => {
  bio.run('for (let a = 0; a < 520; a += 20) { cameraY = GROUND_Y - a*BH - (H-100); drawGroundWorld(cameraY, 40); }');
  return true;
});
// ---- Phase 4: wildlife ----
check('wildlife helpers + herds exist', () => bio.run(
  '["drawBird","drawBat","drawCaveCreatures"].every(f => eval("typeof "+f) === "function") && birds.length > 0 && bats.length > 0 && beetles.length > 0 && worms.length > 0'));
check('cave wildlife is anchored to cave altitudes (below the surface line)', () => bio.run(
  'bats.every(b => b.a < SURF_A) && beetles.every(b => b.a < SURF_A) && worms.every(w => w.a < SURF_A)'));
check('drawBird/drawBat/drawCaveCreatures render across the climb without throwing', () => {
  bio.run('for (let p = 0; p < 6.3; p += 1.2) { drawBird(50, 80, 1, p, "#000"); drawBat(60, 90, p); }');
  bio.run('for (let a = 0; a < 60; a += 8) { cameraY = GROUND_Y - a*BH - (H-100); drawCaveCreatures(cameraY, 30); }');
  return true;
});
// ---- living procedural cave (Level 1) ----
check('cave renderer suite exists (backdrop/walls/ground/torch/weather/ceiling/orchestrator)', () => bio.run(
  '["drawCave","drawCaveBackdrop","drawCaveWalls","drawCaveGround","drawCaveTorchLight","drawCaveWeather","drawCaveCeiling"].every(f => eval("typeof "+f) === "function")'));
check('cave suite renders across the whole underground without throwing', () => {
  bio.run('for (let a = 0; a < SURF_A + 6; a += 4) { cameraY = GROUND_Y - a*BH - (H-100); const yc = GROUND_Y - SURF_A*BH - cameraY; drawCave(30, Math.max(0, Math.min(yc, H)), yc, cameraY); }');
  return true;
});
check('no embedded image backdrops left (cave is fully procedural)', () =>
  !/caveBgImg|data:image\/jpeg;base64/.test(src));
// ---- foreground occlusion + layout guarantees ----
check('foreground layer + fade helpers + tuning constants exist', () => bio.run(
  '["drawCaveForeground","fgAlpha","towerScreenBox","caveMouth","mouthShaftW"].every(f => eval("typeof "+f) === "function") ' +
  '&& [LANE_MIN_F,EXIT_MIN_F,CEIL_THICK,FG_FADE_RADIUS,FG_FADE_BAND,FG_FADE_MIN].every(n => typeof n === "number")'));
check('drawCaveForeground renders across the cave + exit without throwing', () => {
  bio.run('for (let a = 0; a < SURF_A + 8; a += 3) { cameraY = GROUND_Y - a*BH - (H-100); drawCaveForeground(cameraY, 30); }');
  return true;
});
check('fgAlpha: full when no tower, drops to the floor over the tower, restores far away, monotonic', () => bio.run(
  '(() => { fgTowerBox = null; if (fgAlpha(0,0,4,4) !== 1) return false; ' +
  'fgTowerBox = {x0:100,x1:160,y0:100,y1:200}; ' +
  'const over = fgAlpha(120,140,128,148), far = fgAlpha(400,140,404,148); ' +
  'const near = fgAlpha(160 + FG_FADE_RADIUS*0.5, 150, 164 + FG_FADE_RADIUS*0.5, 156); ' +
  'return Math.abs(over - FG_FADE_MIN) < 0.001 && far === 1 && near > over && near < far; })()'));
check('the play lane never drops below LANE_MIN_F at any depth (both walls capped)', () => bio.run(
  '(() => { const baseW = Math.round(W * 0.17); for (let row = 0; row < Math.round(SURF_A*BH/4) - 8; row++) { ' +
  'const lane = W - caveWallW(row, 0, baseW) - caveWallW(row, 1, baseW); if (lane < W * LANE_MIN_F - 1) return false; } return true; })()'));
check('the surface exit is always wide enough for a tower + clearance (never a choke point)', () => bio.run(
  '(() => { const m = caveMouth(); return (m.cxR - m.cxL) >= BASE_W + EXIT_CLEARANCE - 1; })()'));
check('walls funnel to MEET the mouth right under the surface (no flat columns detached from the hole)', () => bio.run(
  '(() => { const baseW = Math.round(W * 0.17), surfRow = Math.floor(SURF_A*BH/4), m = caveMouth(); ' +
  'const nearL = caveWallW(surfRow, 0, baseW), nearR = caveWallW(surfRow, 1, baseW); ' +          // both walls land on the hole edges
  'const deepL = caveWallW(surfRow - 40, 0, baseW); ' +                                             // deep wall is untapered noise, not the mouth
  'return Math.abs(nearL - m.cxL) <= 3 && Math.abs(nearR - (W - m.cxR)) <= 3 && nearL !== deepL; })()'));
check('reduced-motion: full cave + foreground still render without throwing', () => {
  const rm = makeGame({ 'skystack-height': '80' }, true);
  if (!rm.run('reduceMotion === true')) return false;
  rm.run('mode = "endless"; for (let a = 0; a < SURF_A + 8; a += 4) { cameraY = GROUND_Y - a*BH - (H-100); const yc = GROUND_Y - SURF_A*BH - cameraY; drawCave(0, Math.max(0, Math.min(yc, H)), yc, cameraY); drawCaveForeground(cameraY, 0); }');
  return true;
});
// ---- Phase 5: region entry cinematics ----
check('region intro system exists, one tag per stage, arms on entry', () => bio.run(
  '(() => { regionIntro = null; return typeof startRegionIntro === "function" && typeof renderRegionIntro === "function" && INTRO_TAGS.length === TIERS.length && (startRegionIntro(0), regionIntro !== null && regionIntro.ti === 0 && regionIntro.dur > 0); })()'));
check('startRegionIntro ignores out-of-range tiers', () => bio.run(
  '(() => { regionIntro = null; startRegionIntro(-1); startRegionIntro(TIERS.length); return regionIntro === null; })()'));
check('renderRegionIntro renders every region at every phase without throwing', () => {
  bio.run('for (let i = 0; i < TIERS.length; i++) { for (const tt of [2, 45, 96]) { regionIntro = {ti:i, t:tt, dur:100}; renderRegionIntro(); } } regionIntro = null;');
  return true;
});
check('a fresh run arms the starting region intro', () => {
  const ri = makeGame();
  ri.run('mode = "endless"; startRun();');
  return ri.run('regionIntro !== null && regionIntro.ti === 0');
});
// ---- Phase 6: themed campaign bases ----
check('themed-base helper exists, one theme per stage', () => bio.run(
  'typeof drawBaseBlock === "function" && BASE_THEMES.length === TIERS.length'));
check('drawBaseBlock renders every region base (cap + body) without throwing', () => {
  bio.run('for (let i = 0; i < TIERS.length; i++) { drawBaseBlock(10, 10, 96, 14, i, true); drawBaseBlock(10, 30, 96, 14, i, false); }');
  return true;
});
check('landmark-platform helper renders every region without throwing', () => bio.run(
  '(() => { if (typeof drawLandmarkPlatform !== "function") return false; for (let i = 0; i < TIERS.length; i++) drawLandmarkPlatform(W/2, 100, 96, i); return true; })()'));
// ---- Phase 7: region materials + wind ----
check('materials: one per stage with tunable fields', () => bio.run(
  'MATERIALS.length === TIERS.length && MATERIALS.every(m => typeof m.spd === "number" && typeof m.wob === "number" && typeof m.wind === "number" && typeof m.name === "string")'));
check('matAt clamps to a valid material', () => bio.run(
  'matAt(0) === MATERIALS[0] && matAt(-5) === MATERIALS[0] && matAt(999) === MATERIALS[MATERIALS.length-1]'));
check('slick ice slider is quicker than heavy stone at the same height', () => bio.run(
  '(() => { while (blocks.length < 40) blocks.push({x:0,w:96,col:"#fff"}); runLevel = -1; assist = 0; slowBlocks = 0; auraBlocks = 0; tier = 0; spawnSlider(); const stone = slider.speed; tier = 7; spawnSlider(); const ice = slider.speed; return stone > 0 && ice > stone; })()'));
check('caves are more sheltered from wind than the jet stream', () => bio.run('matAt(0).wind < matAt(5).wind'));
check('drawBlock renders every skin style without throwing', () => {
  bio.run('for (const st of ["gloss","stripe","ember","facet","sparkle","shimmer","glow"]) { drawBlock(10, 10, 96, 14, {h:200,s:80,l:56}, true, 0.4, st); drawBlock(10, 10, 6, 5, {h:40,s:90,l:60}, false, 0, st); }');
  return true;
});
check('every skin base() yields a valid HSL colour drawBlock can use', () => bio.run(
  'SKINS.every(sk => { const c = sk.base(3, 120); return typeof c.h === "number" && c.s >= 0 && c.s <= 100 && c.l >= 0 && c.l <= 100; })'));
check('a campaign level starts in its tier biome (level 8 -> AURORA band)', () => {
  const bl = makeGame({ 'skystack-height': '900' });   // everything unlocked
  bl.run('startLevel(7)');   // level 8 = AURORA (index 7)
  return bl.run('(() => { const A = blocks.length; const ti = TIERS.findIndex(t => A < t.n); return TIERS[ti].name === "AURORA"; })()');
});

// ---------- static checks ----------
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('sw.js cache bumped to v48', () => /const CACHE = 'skystack-v48'/.test(sw));
check('no merge conflict markers in index.html', () => !/^(<{7}|={7}|>{7})/m.test(html));
check('level stars stored under skystack-levelstars', () => /store\.set\('skystack-levelstars'/.test(src));
check('no dead skystack-launch key left', () => !/skystack-launch/.test(src));

// ---------- report ----------
let pass = 0, fail = 0;
for (const [ok, name, detail] of results) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '   [' + detail + ']'));
}
console.log('\n' + pass + '/' + results.length + ' checks passed' + (fail ? ' — ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
