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

function makeGame(storageSeed) {
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
    matchMedia: () => ({ matches: false, addEventListener: noop }),
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
check('TIERS has 9 stages', () => fresh.run('TIERS.length === 9'));
check('TIERS names are the 9-stage ladder', () => fresh.run(
  `JSON.stringify(TIERS.map(t=>t.name)) === JSON.stringify(['ROOFTOPS','TREETOPS','CLOUD NINE','JET STREAM','STRATOSPHERE','AURORA','SPACE','ORBIT','THE STARS'])`));
check('every tier has a theme color', () => fresh.run(`TIERS.every(t => /^#[0-9A-F]{6}$/i.test(t.c))`));
check('fresh profile: prog=0, no active level', () => fresh.run('prog === 0 && runLevel === -1'));
check('extras picker excludes the campaign mode', () => fresh.run(
  `EXTRAS.length === 4 && !EXTRAS.some(m => m.id === 'level')`));
check('skyMapNodes: 9 pts + start + gate', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.length === 9 && L.start && L.gate; })()'));
check('skyMapNodes: badge rows evenly spaced in altitude', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.every((p,i) => (i===0 ? L.start.y - p.y === MAP_ROW : L.pts[i-1].y - p.y === MAP_ROW)) && L.gate.y === L.pts[8].y - MAP_ROW; })()'));
check('skyMapNodes: trail weaves left/right but stays inside the column', () => fresh.run(
  '(() => { const L = skyMapNodes(); const xs = L.pts.map(p=>p.x); return xs.every(x => x >= L.colX && x <= L.colX + L.colW) && new Set(xs).size > 1; })()'));
check('skyMapNodes: column centered and inside canvas', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.colX >= 0 && L.colX + L.colW <= W && Math.abs((L.colX) - (W - L.colX - L.colW)) <= 1; })()'));
check('openSkyMap clamps scroll and selects the next level', () => fresh.run(
  '(() => { openSkyMap(); return skyMap === true && mapScroll >= 0 && mapScroll <= mapScrollMax && selLevel === 0; })()'));
check('renderSkyMap runs without throwing (prog=0)', () => { fresh.run('renderSkyMap()'); return true; });
check('drawStageDeco runs for all 9 stages', () => { fresh.run('for (let i=0;i<9;i++) drawStageDeco(i, 100, 100)'); return true; });
check('renderHome runs without throwing', () => { fresh.run('state="home"; skyMap=false; renderHome()'); return true; });

// ---------- campaign level runs ----------
const lv = makeGame();
lv.run('startLevel(0)');
check('level 1 starts on the ground', () => lv.run('state === "playing" && runLevel === 0 && runLaunch === 0 && blocks.length === 1'));
lv.run('score = 500; runPerfects = 9; while (blocks.length < 10) blocks.push({x:0,w:96,col:"#fff"});');
lv.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('reaching the goal wins the level', () => lv.run('state === "levelwin"'));
check('level win: stage unlocked (prog=1)', () => lv.run('prog === 1 && winFirst === true'));
check('level win: 3 stars for a near-perfect run', () => lv.run('winStars === 3'));
check('level win: stars persisted', () => lv.run('levelStars[0] === 3') && lv.mem.get('skystack-levelstars') === '[3]');
check('level win: coins rewarded', () => lv.run('winReward > 0 && coins >= winReward'));
check('level win: no endless records written', () => lv.run('best === 0 && bestHeight === 0'));
check('renderLevelWin runs without throwing', () => { lv.run('winT = 60; renderLevelWin()'); return true; });
check('win screen NEXT starts the next level', () => lv.run(
  '(() => { winT = 60; relayout(); pressDown(null); return state === "playing" && runLevel === 1 && runLaunch === 10 && blocks.length === 10; })()'));
check('level 2 slider is faster than level 0 base', () => lv.run('slider.speed > 1.15'));

// fail path
lv.run('score = 300; while (blocks.length < 20) blocks.push({x:0,w:96,col:"#fff"});');
lv.run('gameOver("topple")');
check('failing a level shows the fail screen', () => lv.run('state === "levelfail"'));
check('level fail: records still untouched', () => lv.run('best === 0 && bestHeight === 0'));
check('renderLevelFail runs without throwing', () => { lv.run('failT = 60; renderLevelFail()'); return true; });
check('fail screen RETRY restarts the same level', () => lv.run(
  '(() => { failT = 60; pressDown(null); return state === "playing" && runLevel === 1 && blocks.length === 10; })()'));
lv.run('gameOver("fall"); failT = 60; state = "home";');

// second visit is not a first clear
lv.run('startLevel(0); while (blocks.length < 10) blocks.push({x:0,w:96,col:"#fff"}); runPerfects = 0;');
lv.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('replaying a level: no new unlock, 1 star floor', () => lv.run('winFirst === false && winStars === 1'));
check('replaying a level: best stars kept', () => lv.run('levelStars[0] === 3'));

// ---------- veteran-profile context (bestHeight 60 blocks = 180M) ----------
const vet = makeGame({
  'skystack-height': '60',
  'skystack-best': '900'
});
check('prog seeded from lifetime best (60 blocks -> 3 levels)', () => vet.run('prog === 3'));

// level runs pre-stack to the previous stage
vet.run('startLevel(2)');
check('level 3 pre-stacks to TREETOPS (25 blocks)', () => vet.run('runLaunch === 25 && blocks.length === 25'));
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
lc.run('while (blocks.length < 10) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('endless first reach of stage 1: LEVEL CLEAR banner', () => lc.run('bannerText === "LEVEL CLEAR - ROOFTOPS"'));
check('endless first reach of stage 1: prog -> 1', () => lc.run('prog === 1'));
check('prog persisted to storage', () => lc.mem.get('skystack-tiers') === '1' ? true : 'stored: ' + lc.mem.get('skystack-tiers'));
lc.run('resetRun(); while (blocks.length < 10) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('endless re-reaching a cleared stage: plain milestone banner', () => lc.run('bannerText === "30M - ROOFTOPS"'));
lc.run('prog = 8; resetRun(); tier = 8;');
lc.run('while (blocks.length < 500) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('endless reaching THE STARS first time: SKY CONQUERED banner', () => lc.run('bannerText === "SKY CONQUERED!"'));
check('game beaten: prog = 9 (all stages)', () => lc.run('prog === 9'));
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
check('openSkyMap pre-selects the next level (3)', () => tap.run('selLevel === 3'));
check('map tap: first tap on a cleared badge selects it', () => tap.run(
  '(() => { const L = __C(1); __T(L.pts[1].x, L.pts[1].y); return selLevel === 1 && skyMap === true && state === "home"; })()'));
check('map tap: second tap on the selected badge launches it', () => tap.run(
  '(() => { const L = __C(1); __T(L.pts[1].x, L.pts[1].y); return state === "playing" && runLevel === 1 && runLaunch === 10 && skyMap === false; })()'));
tap.run('gameOver("fall"); failT = 60; state = "home"; openSkyMap();');
check('map tap: locked badge refuses', () => tap.run(
  '(() => { const L = __C(6); __T(L.pts[6].x, L.pts[6].y); return selLevel === 3 && skyMap === true; })()'));
check('map tap: tapping the pre-selected next badge plays it', () => tap.run(
  '(() => { const L = __C(3); __T(L.pts[3].x, L.pts[3].y); return state === "playing" && runLevel === 3 && runLaunch === 50; })()'));
tap.run('gameOver("fall"); failT = 60; state = "home"; openSkyMap();');
check('map tap: sealed gate refuses, map stays open', () => tap.run(
  '(() => { mapScroll = mapScrollMax; const L = skyMapNodes(); __T(L.gate.x, L.gate.y); return skyMap === true && state === "home"; })()'));
check('map tap: empty space does not close or select', () => tap.run(
  '(() => { openSkyMap(); const sel0 = selLevel; const L = skyMapNodes(); __T(L.colX + 2, Math.round((L.viewTop + L.viewBot)/2)); return skyMap === true && selLevel === sel0; })()'));
check('map tap: header tap closes the map', () => tap.run(
  '(() => { __T(Math.round(W/2), 20); return skyMap === false; })()'));
check('map drag: scrolls without selecting or launching', () => tap.run(
  '(() => { openSkyMap(); const s0 = mapScroll; const L = skyMapNodes(); __p = {x:L.colX+3, y:L.pts[1].y}; pressDown({}); __p = {x:L.colX+3, y:L.pts[1].y + 40}; pressMove({}); pressUp({}); return mapScroll !== s0 && selLevel === 3 && state === "home" && skyMap === true; })()'));
check('map renders the redesigned winding trail at every scroll', () => {
  const r = makeGame({ 'skystack-height': '900', 'skystack-tiers': '9' });   // champion: gate open
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
  r.run('const L = skyMapNodes(); drawMapDecor(L, 100); for (let i = 0; i < 9; i++) drawIsland(i, W/2, 100 + i);');
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
check('themed win screen renders for all 9 stages at every phase', () => {
  cel.run('for (let i = 0; i < 9; i++) { runLevel = i; for (const t of [5, 20, 40, 70, 120]) { winT = t; renderLevelWin(); } }');
  return true;
});
check('drawStageDecoScaled helper exists', () => cel.run('typeof drawStageDecoScaled === "function"'));
check('level win leaves the mascot celebrating', () => {
  const lw = makeGame();
  lw.run('startLevel(0); while (blocks.length < 10) blocks.push({x:0,w:96,col:"#fff"});');
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
check('home: next-level card shows LEVEL 4', () => {
  home.run('mode = "endless"; state = "home";');
  home.run('var __texts = []; var __txt0 = txt; txt = function(t,...a){ __texts.push(String(t)); return __txt0(t,...a); };');
  home.run('renderHome()');
  return home.run('__texts.some(t => t === "LEVEL 4 - JET STREAM") && __texts.some(t => t === "EXTRA MODES")');
});
check('home PLAY starts the next level', () => home.run(
  '(() => { const p = {x: PLAY_BTN.x + 5, y: PLAY_BTN.y + 5}; pos = () => p; pressDown({}); return state === "playing" && runLevel === 3 && runLaunch === 50; })()'));

// ---------- dynamic difficulty (skill-adaptive assist) ----------
const dd = makeGame();   // fresh profile: skill defaults to 0.35
dd.run('mode = "endless"; resetRun();');
check('endless run seeds assist from skill (>0 for a new player)', () => dd.run('assist > 0 && assist <= 0.5'));
check('assist widens the perfect window; assist 0 == base window', () => dd.run(
  '(() => { const base = PERFECT_PX*(auraBlocks>0?2:1); assist = 0.5; const wide = effPerfect(); assist = 0; const norm = effPerfect(); return wide > norm && Math.abs(norm - base) < 1e-9; })()'));
check('assist slows the slider vs no assist', () => dd.run(
  '(() => { assist = 0; spawnSlider(); const fast = slider.speed; assist = 0.5; spawnSlider(); const slow = slider.speed; return slow < fast; })()'));
check('assistFloor stays within [0,0.5]', () => dd.run('assistFloor() >= 0 && assistFloor() <= 0.5'));
check('drawStageWeather runs for all 9 stages without throwing', () => { dd.run('for (let i=0;i<9;i++) drawStageWeather(i, W/2, 100, 50)'); return true; });
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
check('biomeSprite renders for all 9 tiers without throwing', () => { bio.run('for (let i=0;i<9;i++) biomeSprite(i, 50, 100, i, 40)'); return true; });
check('biomeBackdrop renders every tier at full + faded alpha without throwing', () => {
  bio.run('for (let i=0;i<9;i++) { biomeBackdrop(i, -1000, 1); biomeBackdrop(i, -6000, 0.4); }'); return true; });
check('biomeWeather runs for every tier without throwing', () => {
  bio.run('for (let i=0;i<9;i++) biomeWeather(i, -2000, 1, 40)'); return true; });
check('biomeTierAt maps altitude to the SKY MAP stage', () => bio.run(
  'biomeTierAt(0) === 0 && biomeTierAt(9) === 0 && biomeTierAt(10) === 1 && biomeTierAt(149) === 5 && biomeTierAt(499) === 8 && biomeTierAt(9999) === 8'));
check('bhash is deterministic and in [0,1)', () => bio.run(
  'bhash(7) === bhash(7) && bhash(7) >= 0 && bhash(7) < 1 && bhash(7) !== bhash(8)'));
check('drawBiomeDecor runs across the whole climb without throwing', () => {
  bio.run('for (let a = 0; a < 520; a += 30) { drawBiomeDecor(GROUND_Y - a*BH - (H-100)); }');
  return true;
});
check('a campaign level starts in its tier biome (level 6 -> AURORA band)', () => {
  const bl = makeGame({ 'skystack-height': '900' });   // everything unlocked
  bl.run('startLevel(5)');   // level 6 = AURORA (index 5)
  return bl.run('(() => { const A = blocks.length; const ti = TIERS.findIndex(t => A < t.n); return TIERS[ti].name === "AURORA"; })()');
});

// ---------- static checks ----------
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('sw.js cache bumped to v33', () => /const CACHE = 'skystack-v33'/.test(sw));
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
