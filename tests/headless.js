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
check('skyMapNodes: rows evenly spaced on the straight trail', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.every((p,i) => p.x === L.trailX && (i===0 ? L.start.y - p.y === MAP_ROW : L.pts[i-1].y - p.y === MAP_ROW)) && L.pts[8].y - L.gate.y === MAP_ROW; })()'));
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
check('openSkyMap pre-selects the next level (3)', () => tap.run('selLevel === 3'));
check('map tap: first tap on a cleared row selects it', () => tap.run(
  '(() => { const L = skyMapNodes(); __T(L.plateX + 20, L.pts[1].y); return selLevel === 1 && skyMap === true && state === "home"; })()'));
check('map tap: second tap on the selected row launches it', () => tap.run(
  '(() => { const L = skyMapNodes(); __T(L.plateX + 20, L.pts[1].y); return state === "playing" && runLevel === 1 && runLaunch === 10 && skyMap === false; })()'));
tap.run('gameOver("fall"); failT = 60; state = "home"; openSkyMap();');
check('map tap: locked row refuses', () => tap.run(
  '(() => { const L = skyMapNodes(); __T(L.plateX + 20, L.pts[6].y); return selLevel === 3 && skyMap === true; })()'));
check('map tap: footer PLAY launches the selection', () => tap.run(
  '(() => { __T(Math.round(W/2), H - 10); return state === "playing" && runLevel === 3 && runLaunch === 50; })()'));
tap.run('gameOver("fall"); failT = 60; state = "home"; openSkyMap();');
check('map tap: sealed gate refuses, map stays open', () => tap.run(
  '(() => { mapScroll = mapScrollMax; const L = skyMapNodes(); __T(L.plateX + 10, L.gate.y); return skyMap === true && state === "home"; })()'));
check('map tap: header tap closes the map', () => tap.run(
  '(() => { __T(Math.round(W/2), 20); return skyMap === false; })()'));
check('map drag: scrolls without selecting or launching', () => tap.run(
  '(() => { openSkyMap(); const s0 = mapScroll; const L = skyMapNodes(); __p = {x:100, y:L.pts[1].y}; pressDown({}); __p = {x:100, y:L.pts[1].y + 40}; pressMove({}); pressUp({}); return mapScroll !== s0 && selLevel === 3 && state === "home" && skyMap === true; })()'));
check('map helpers exist (mapNode3D, dkHex, openSkyMap, mapTapAt, plate3D, drawStarPix)', () => tap.run(
  '["mapNode3D","dkHex","openSkyMap","mapTapAt","plate3D","drawStarPix"].every(f => typeof globalThis[f] === "function" || eval("typeof " + f) === "function")'));
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

// ---------- static checks ----------
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('sw.js cache bumped to v28', () => /const CACHE = 'skystack-v28'/.test(sw));
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
