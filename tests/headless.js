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

function makeGame(storageSeed, reducedMotion, audioEnabled) {
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
  const audioParam = () => ({ value: 0,
    setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; },
    cancelScheduledValues() {} });
  const audioNode = () => ({ gain:audioParam(), frequency:audioParam(), Q:audioParam(), type:'', buffer:null,
    connect(n) { return n || this; }, disconnect() {}, start() {}, stop() {} });
  class FakeAudioContext {
    constructor() { this.state='running'; this.currentTime=1; this.sampleRate=44100; this.destination=audioNode(); this.created=0; }
    resume() { this.state='running'; }
    createGain() { return audioNode(); }
    createOscillator() { this.created++; return audioNode(); }
    createBiquadFilter() { return audioNode(); }
    createBufferSource() { return audioNode(); }
    createBuffer(ch,len) { const d=new Float32Array(len); return { getChannelData:()=>d }; }
  }
  const sandbox = {
    console, setTimeout:audioEnabled?(fn=>{fn();return 1;}):setTimeout, clearTimeout, setInterval, clearInterval,
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
    Math, JSON, Date,
    AudioContext: audioEnabled ? FakeAudioContext : undefined,
    webkitAudioContext: audioEnabled ? FakeAudioContext : undefined
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
// read a value out of the consolidated v2 save object (all writes land there since v64)
function saved(g, k) {
  const raw = g.mem.get('skystack-save');
  if (raw === undefined) return undefined;
  return JSON.parse(raw).data[k];
}

// ---------- fresh-profile context ----------
const fresh = makeGame();
check('boots without throwing (fresh profile)', () => fresh.run('booted === true'));
check('TIERS has 11 stages', () => fresh.run('TIERS.length === 11'));
check('TIERS names are the 11-stage continuous world (no city language)', () => fresh.run(
  `JSON.stringify(TIERS.map(t=>t.name)) === JSON.stringify(['CAVES','SURFACE','TREETOPS','LOWER SKY','CLOUD NINE','JET STREAM','STRATOSPHERE','AURORA','SPACE','ORBIT','THE STARS'])`));
check('every tier has a theme color', () => fresh.run(`TIERS.every(t => /^#[0-9A-F]{6}$/i.test(t.c))`));
check('fresh profile: prog=0, no active level', () => fresh.run('prog === 0 && runLevel === -1'));
check('extras picker excludes the campaign mode', () => fresh.run(
  `EXTRAS.length === 5 && !EXTRAS.some(m => m.id === 'level') && EXTRAS.some(m => m.id === 'practice')`));
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
check('level win: stars persisted', () => lv.run('levelStars[0] === 3') && JSON.stringify(saved(lv, 'skystack-levelstars')) === '[3]');
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
check('level gameOver: stored best not polluted', () => saved(vet, 'skystack-best') === 900 ? true : 'stored: ' + saved(vet, 'skystack-best'));
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
check('prog persisted to storage', () => saved(lc, 'skystack-tiers') === 1 ? true : 'stored: ' + saved(lc, 'skystack-tiers'));
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
check('revive: coin spend persisted', () => saved(rv, 'skystack-coins') === 170 ? true : 'stored: ' + saved(rv, 'skystack-coins'));
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

// ---------- v66: no-fail PRACTICE + guided onboarding ----------
const pr = makeGame();
pr.run('mode = "practice"; loadout = {shield:true,aura:true,slow:true}; resetRun(); state = "playing";');
check('PRACTICE is no-fail, wind-free, and explicitly guided', () => pr.run(
  'curMode().practice === true && curMode().fail === false && curMode().wind === false'));
check('PRACTICE keeps maximum assist and never consumes equipped boosts', () => pr.run(
  'assist === 0.85 && shield === 0 && auraBlocks === 0 && slowBlocks === 0'));
check('PRACTICE schedules no pickups or balloons', () => pr.run(
  '(() => { schedulePickups(); maybeSpawnBalloon(); return pickups.length === 0 && balloon === null; })()'));
check('PRACTICE total miss is saved and the run continues', () => pr.run(
  '(() => { const n = blocks.length; faller = {x:W+80,y:towerTopY()-BH,w:40,col:blockCol(n),golden:false}; slider=null; state="dropping"; land(); return state === "playing" && blocks.length === n+1 && slider !== null; })()'));
check('PRACTICE auto-steadies a topple instead of ending the run', () => pr.run(
  '(() => { balance = TOPPLE*3; const top=blocks[blocks.length-1]; faller={x:top.x,y:towerTopY()-BH,w:top.w,col:blockCol(blocks.length),golden:false}; slider=null; state="dropping"; land(); return state === "playing" && Math.abs(balance) < TOPPLE && slider !== null && floaters.some(f=>f.text==="STEADIED!"); })()'));
check('PRACTICE never offers a revive', () => pr.run(
  '(() => { gameOver("quit"); return reviveOffered === false; })()'));

const prSafe = makeGame({ 'skystack-coins':'120', 'skystack-best':'900', 'skystack-height':'80', 'skystack-tiers':'2' });
prSafe.run('mode="practice"; resetRun(); state="playing"; globalThis.__ps={coins,best,bestHeight,prog,games:stats.games,blocks:stats.blocks}; addCoins(50); score=9999; while(blocks.length<40) blocks.push({x:0,w:W,col:blockCol(blocks.length)}); tier=0; afterPlace({x:0,w:W,col:blockCol(40)},false,W/2); gameOver("quit");');
check('PRACTICE cannot change coins, records, campaign unlocks, or lifetime stats', () => prSafe.run(
  'coins===__ps.coins && best===__ps.best && bestHeight===__ps.bestHeight && prog===__ps.prog && stats.games===__ps.games && stats.blocks===__ps.blocks'));

const tut = makeGame({ 'skystack-tut':'true' });
tut.run('mode="practice"; resetRun();');
check('PRACTICE replays onboarding even after the first-run tutorial was completed', () => tut.run('tutDone === true && tutStep === 0'));
check('onboarding teaches drop, perfect, fever, supernova, balance, and Skybreak', () => tut.run(
  '(() => { const s=TUT_LESSONS.map(x=>x.title+" "+x.body).join(" "); return /DROP/.test(s)&&/PERFECT/.test(s)&&/FEVER/.test(s)&&/SUPERNOVA/.test(s)&&/BALANCE/.test(s)&&/SKYBREAK/.test(s); })()'));
check('onboarding advances deterministically and persists completion', () => {
  tut.run('tutStep=1; advanceTutorial(2); advanceTutorial(3); advanceTutorial(5); advanceTutorial(8);');
  return tut.run('tutStep === -1 && tutDone === true') && saved(tut, 'skystack-tut') === true;
});
check('PRACTICE lesson HUD renders without throwing', () => { tut.run('mode="practice"; resetRun(); state="playing"; renderHUD(blocks.length)'); return true; });

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
check('skill persists to storage', () => typeof saved(sk, 'skystack-skill') === 'number' && Math.abs(saved(sk, 'skystack-skill') - sk.run('skill')) < 1e-6);
check('a higher skill means a lower starting assist', () => {
  const lo = makeGame({ 'skystack-skill': '0.1' }), hi = makeGame({ 'skystack-skill': '0.9' });
  lo.run('mode="endless"; resetRun();'); hi.run('mode="endless"; resetRun();');
  return lo.run('assist') > hi.run('assist');
});

// ---------- v67: adaptive biome/mode soundtrack + event sound design ----------
const mus = makeGame({}, false, true);
check('adaptive soundtrack defines one distinct theme per biome', () => mus.run(
  'MUSIC_THEMES.length===TIERS.length && new Set(MUSIC_THEMES.map(t=>t.name)).size===TIERS.length && new Set(MUSIC_THEMES.map(t=>t.root+":"+t.bpm)).size>=9'));
check('cave theme is an audible dark medieval-dungeon arrangement', () => mus.run(
  '(() => { const c=MUSIC_THEMES[0]; return c.name==="DUNGEON BELOW"&&c.dungeon===true&&c.gain>=1.2&&c.bpm<=70&&c.density>=.65&&c.drums>=.6&&c.pad==="sawtooth"; })()'));
check('cave uses D harmonic minor with a flat sixth and raised seventh', () => mus.run(
  '(() => { const c=musicProfileFor("play",0,"endless","calm"); return Math.abs(c.scale[5]-1.5874)<.0001&&Math.abs(c.scale[6]-1.88775)<.0001&&Math.abs(musicFreq(c,5,0)/c.root-1.5874)<.0001; })()'));
check('cave remains prominent in Practice and Supernova arrangements', () => mus.run(
  '(() => { const p=musicProfileFor("play",0,"practice","calm"),n=musicProfileFor("play",0,"endless","nova"); return p.gain>1&&n.gain>=1.28&&n.gain<=1.32; })()'));
check('every biome theme has a complete playable arrangement', () => mus.run(
  'MUSIC_THEMES.every(t=>t.root>0&&t.bpm>=58&&t.bpm<=130&&t.mel.length>=16&&t.bass.length>=4&&t.density>0&&t.drums>=0&&t.lead&&t.pad&&t.lpf>0)'));
check('menu, victory, and loss have dedicated music identities', () => mus.run(
  'MENU_THEME.name!==WIN_THEME.name && WIN_THEME.name!==LOSS_THEME.name && MENU_THEME.bpm!==LOSS_THEME.bpm'));
check('home screens receive a strong menu-only lift without changing gameplay theme gain', () => mus.run(
  '(() => { const m=musicProfileFor("menu",0,"menu","calm"),g=musicProfileFor("play",1,"endless","calm"); return m.gain===1.9&&g.gain===1&&MENU_THEME.gain>MUSIC_THEMES[0].gain; })()'));
check('Practice is calmer while Time mode is more urgent', () => mus.run(
  '(() => { const b=musicProfileFor("play",4,"endless","calm"),p=musicProfileFor("play",4,"practice","calm"),t=musicProfileFor("play",4,"time","calm"); return p.bpm<b.bpm&&p.drums<b.drums&&p.gain<b.gain&&t.bpm>b.bpm&&t.drums>=b.drums; })()'));
check('Pure and Daily keep biome identity but use different arrangements', () => mus.run(
  '(() => { const b=musicProfileFor("play",6,"endless","calm"),p=musicProfileFor("play",6,"pure","calm"),d=musicProfileFor("play",6,"daily","calm"); return p.root===b.root&&d.root===b.root&&p.bpm!==b.bpm&&JSON.stringify(d.bass)!==JSON.stringify(b.bass); })()'));
check('Fever and Supernova progressively intensify the active theme', () => mus.run(
  '(() => { const c=musicProfileFor("play",8,"endless","calm"),f=musicProfileFor("play",8,"endless","fever"),n=musicProfileFor("play",8,"endless","nova"); return f.bpm>c.bpm&&f.density>c.density&&n.bpm>f.bpm&&n.density===1&&n.shimmer===1; })()'));
check('music signatures change across biome, mode, scene, and event', () => mus.run(
  'new Set([musicSignature({sceneName:"play",biome:0,modeId:"endless",eventName:"calm"}),musicSignature({sceneName:"play",biome:1,modeId:"endless",eventName:"calm"}),musicSignature({sceneName:"play",biome:1,modeId:"time",eventName:"calm"}),musicSignature({sceneName:"play",biome:1,modeId:"time",eventName:"nova"}),musicSignature({sceneName:"win",biome:1,modeId:"time",eventName:"calm"})]).size===5'));
mus.run('audio(); state="playing"; mode="endless"; tier=0; musicStep(); globalThis.__bus0=musicBus; globalThis.__key0=musicKey;');
check('music engine creates separate master, SFX, music, and crossfade buses', () => mus.run(
  'AC&&AUDIO_MASTER&&SFX_OUT&&MUSIC_OUT&&musicBus&&musicKey==="play:0:endless:calm"'));
check('global music output is louder everywhere without raising the SFX bus', () => mus.run(
  'MUSIC_OUTPUT_LEVEL===1.05&&MUSIC_OUT.gain.value===MUSIC_OUTPUT_LEVEL&&SFX_OUT.gain.value===.9'));
check('volume mixer defaults preserve the approved v71 music and effects mix', () => mus.run(
  'musicVol===1&&sfxVol===1&&musicOutputGain()===MUSIC_OUTPUT_LEVEL'));
check('volume mixer independently updates live buses and persists v2 settings', () => {
  mus.run('setMixVolume("music",-1); setMixVolume("sfx",-1); setMixVolume("sfx",-1);');
  return mus.run('musicVol===.75&&sfxVol===.5&&MUSIC_OUT.gain.value===MUSIC_OUTPUT_LEVEL*.75&&SFX_OUT.gain.value===.9*.5') &&
    saved(mus,'skystack-musicvol')===.75 && saved(mus,'skystack-sfxvol')===.5;
});
check('volume mixer clamps to 0–100 percent in consistent 25 percent steps', () => mus.run(
  '(() => { for(let i=0;i<8;i++)setMixVolume("music",-1); const lo=musicVol; for(let i=0;i<8;i++)setMixVolume("music",1); return lo===0&&musicVol===1; })()'));
check('music scheduler produces voices ahead of playback without per-frame creation', () => mus.run(
  'AC.created>0 && musicNext>AC.currentTime && barDurCur>0'));
check('cave-only scheduler adds drone, lute, bell, and war-drum voices immediately', () => mus.run(
  '(() => { const p=musicProfileFor("play",0,"endless","calm"),before=AC.created; scheduleDungeonLayer(AC.currentTime+.1,0,240/p.bpm,p,musicBus); return AC.created-before>=9; })()'));
check('cave chain/rattle texture uses one cached buffer', () => mus.run(
  '(() => { const p=musicProfileFor("play",0,"endless","calm"); dungeonBuf=null; scheduleDungeonLayer(AC.currentTime+.1,1,240/p.bpm,p,musicBus); const first=dungeonBuf; scheduleDungeonLayer(AC.currentTime+.2,1,240/p.bpm,p,musicBus); return first&&dungeonBuf===first; })()'));
check('biome change replaces the arrangement bus through a transition', () => mus.run(
  '(() => { tier=1; AC.currentTime+=2; musicStep(); return musicBus!==__bus0&&musicKey!==__key0&&musicKey==="play:1:endless:calm"; })()'));
check('long pause recovery skips stale music scheduling backlog', () => mus.run(
  '(() => { musicNext=1; AC.currentTime=100; musicStep(); return musicNext>100&&musicNext<104; })()'));
check('new cinematic event SFX run safely through the shared SFX bus', () => {
  mus.run('sfx.supernova(); sfx.skybreak(); sfx.region(10); sfx.win();'); return true;
});
check('Supernova, Skybreak, region entry, and level win use dedicated hooks', () =>
  /sfx\.supernova\(\)/.test(src) && /sfx\.skybreak\(\)/.test(src) && /sfx\.region\(ti\)/.test(src) && /sfx\.win\(\)/.test(src));
check('music transitions use gain ramps rather than hard cuts', () =>
  /function switchMusic\([\s\S]*linearRampToValueAtTime[\s\S]*exponentialRampToValueAtTime/.test(src));

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
  '["drawBiomeSky","drawSun","atmoDark","currentBiome","rootedTree","foliageBlob"].every(f => typeof globalThis[f] === "function" || eval("typeof " + f) === "function") && Array.isArray(SKY_STOPS)'));
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
  '["drawGroundWorld","drawCaveWalls","drawSurfaceGround","rootedTree","foliageBlob"].every(f => eval("typeof "+f) === "function") && TREES.length > 0 && typeof SURF_A === "number"'));
check('every rooted tree has a top ABOVE the surface line', () => bio.run(
  'TREES.every(t => t.topA > SURF_A)'));
check('city buildings removed (no rooted towers or skyline haze)', () =>
  !/const BUILDINGS\s*=|function rootedBuilding|function drawSkylineHaze/.test(src));
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
check('cave geology deterministically provides dirt, stone, clay, and gravel', () => bio.run(
  '(() => { const a = [], b = []; for (let r = 0; r <= Math.round(SURF_A*BH/4); r++) for (const s of [0,1]) { a.push(caveWallMat(r,s)); b.push(caveWallMat(r,s)); } ' +
  'return a.join(",") === b.join(",") && new Set(a).size === 4 && a.every(m => m >= 0 && m < 4); })()'));
check('Deep Cave and Main Cave are deterministic altitude subzones with a smooth transition', () => bio.run(
  '(() => { const d=caveZoneAtA(0), mid=caveZoneAtA((CAVE_DEEP_END_A+CAVE_MAIN_FULL_A)/2), m=caveZoneAtA(SURF_A-2); ' +
  'if(d.name!=="DEEP CAVE"||d.main!==0||m.name!=="MAIN CAVE"||m.main!==1||Math.abs(mid.main-.5)>.001)return false; ' +
  'let prev=-1; for(let a=0;a<=SURF_A;a+=.25){const x=caveMainMixAtA(a);if(x<prev||x<0||x>1)return false;prev=x;} return true; })()'));
check('Main Cave chambers open broader on roomy screens (portrait lane remains separately guarded)', () => bio.run(
  '(() => { const oldW=W;try{W=420;const bw=Math.round(W*.17),limit=SURF_A*BH/4-7*BH/4;let d=0,dn=0,m=0,mn=0;for(let row=0;row<limit;row++){const lane=W-caveWallW(row,0,bw)-caveWallW(row,1,bw),mix=caveMainMixAtRow(row);if(lane<caveLaneMin()-1)return false;if(mix<.1){d+=lane;dn++;}if(mix>.9){m+=lane;mn++;}}return dn>8&&mn>8&&m/mn>d/dn+5;}finally{W=oldW;}})()'));
check('cave material atlas contains four cached original procedural textures', () => bio.run(
  'CAVE_MAT_TEX.length === 4 && CAVE_MAT_TEX.every(t => t && t.width === CAVETEX_W && t.height === CAVETEX_H)'));
check('cave detail atlases include a cached continuous fine-grain rear wall', () => bio.run(
  'caveTexBack && caveTexBack.width===CAVETEX_W && caveTexBack.height===CAVETEX_H && CAVE_GEO_W>=36'));
check('cave detail placement is deterministic and bounded', () => bio.run(
  '(() => { for (let r=-20;r<180;r++) for (const s of [0,1]) { const a=caveDetailKind(r,s), b=caveDetailKind(r,s); if (a!==b || a<0 || a>5) return false; } return true; })()'));
check('Deep/Main ledge identities are deterministic and remain surface-valid prop kinds', () => bio.run(
  '(() => { for(let r=-20;r<180;r++)for(const s of [0,1]){const a=caveDetailKindForZone(r,s),b=caveDetailKindForZone(r,s);if(a!==b||a<0||a>5)return false;}return true;})()'));
check('cave texture stamping uses varied deterministic source windows', () => bio.run(
  '(() => { const a=[], b=[]; for(let x=0;x<CAVE_STAMP_W*6;x+=CAVE_STAMP_W){a.push(caveStampSourceX(123,x));b.push(caveStampSourceX(123,x));} return a.join(",")===b.join(",") && new Set(a).size>2 && a.every(x=>x>=0&&x<=CAVETEX_W-CAVE_STAMP_W); })()'));
check('cave atlas columns stay vertically continuous instead of re-rolling every render band', () => bio.run(
  '(() => { for(let x=0;x<CAVE_STAMP_W*6;x+=CAVE_STAMP_W)if(caveStampSourceX(0,x)!==caveStampSourceX(999,x))return false;return true;})()'));
check('two-dimensional cave geology pockets are deterministic and non-flat', () => bio.run(
  '(() => { const a=[],b=[];for(let r=0;r<120;r+=3)for(let x=0;x<W;x+=CAVE_GEO_W){a.push(caveWallMatAt(r,0,x));b.push(caveWallMatAt(r,0,x));}return a.join(",")===b.join(",")&&new Set(a).size===4;})()'));
check('cave texture stamping explicitly disables image smoothing', () =>
  /function blitCaveTex[\s\S]{0,320}ctx\.imageSmoothingEnabled = false/.test(src));
check('ledge props are emitted only from detected upward-facing wall ledges', () =>
  /if \(prevW >= 0 && w > prevW \+ 3\)[\s\S]{0,700}drawCaveLedgeProp\(/.test(src));
check('torches derive their x position from the current anchored wall edge', () =>
  /wallRow = Math\.round\(\(gy - ty\) \/ 4\)[\s\S]{0,260}caveWallW\(wallRow[\s\S]{0,220}W - wallW \+ 2 : wallW - 2/.test(src));
check('Main Cave has more fixed torch slots than Deep Cave without screen-seeded placement', () => bio.run(
  '(() => { let d=0,m=0;for(let r=-100;r<100;r++){if(caveTorchPresent(r,0))d++;if(caveTorchPresent(r,1))m++;}return m>d*1.35;})()'));
// the cave walls/backdrop/ground must be WORLD-anchored like the floor: a known camera shift
// must translate every band rigidly by the same screen amount, keeping the SAME source texture
// row + width (i.e. geometry+texture come from stable world coords, not from screen slots that
// re-roll their content). Recording blitCaveTex is how we observe the real draw positions.
check('cave bands translate rigidly under a camera shift (world-anchored, not screen-anchored)', () => bio.run(
  '(() => {' +
  '  const orig = blitCaveTex;' +
  '  const cap = () => { const L = []; blitCaveTex = (x0,y,w,h,sr) => L.push(x0+"|"+w+"|"+sr+"|"+Math.round(y)); return L; };' +
  '  try {' +
  '    const d = 6, cy1 = GROUND_Y - 4*BH - (H-100), cy2 = cy1 + d;' +   // deep cave: ceiling off-screen, top=0, no clipping
  '    const L1 = cap(); cameraY = cy1; drawCave(30, 0, -999, cy1); blitCaveTex = orig;' +
  '    const L2 = cap(); cameraY = cy2; drawCave(30, 0, -999, cy2); blitCaveTex = orig;' +
  '    if (L1.length < 20 || L2.length < 20) return "too few bands recorded: " + L1.length + "/" + L2.length;' +
  '    const shifted = new Set(L2.map(k => { const p = k.split("|"); p[3] = String(Number(p[3]) + d); return p.join("|"); }));' +   // frame 2 nudged back up by d
  '    let m = 0; for (const k of L1) if (shifted.has(k)) m++;' +        // rigid + same srcRow/width => identical key
  '    return m >= L1.length * 0.7 ? true : "only " + m + "/" + L1.length + " bands translated rigidly (screen-anchored?)";' +
  '  } finally { blitCaveTex = orig; }' +
  '})()'));
check('cave wall/decor/torch/backdrop grids are ground-anchored (gy = GROUND_Y - cy), no screen-fixed grid', () =>
  /const gy = GROUND_Y - cy;/.test(src) &&
  /off4 = \(\(\(gy - top\) % 4\)/.test(src) &&      // main 4px wall bands
  /doff = \(\(\(gy - top\) % DP\)/.test(src) &&     // wall decor (mushrooms/roots/vines/stalactites/posts/cobwebs)
  /toff = \(\(\(gy - top\) % TP\)/.test(src) &&     // wall torches
  !/doff = \(\(cy % DP\)/.test(src) &&              // old screen-anchored decor grid removed
  !/toff = \(\(cy % TP\)/.test(src));               // old screen-anchored torch grid removed
check('no embedded image backdrops left (cave is fully procedural)', () =>
  !/caveBgImg|data:image\/jpeg;base64/.test(src));
// ---- foreground occlusion + layout guarantees ----
check('foreground layer + fade helpers + tuning constants exist', () => bio.run(
  '["drawCaveForeground","fgAlpha","towerScreenBox","caveMouth","mouthShaftW"].every(f => eval("typeof "+f) === "function") ' +
  '&& [LANE_MIN_F,CAVE_LANE_CLEARANCE,EXIT_MIN_F,CEIL_THICK,FG_FADE_RADIUS,FG_FADE_BAND,FG_FADE_MIN].every(n => typeof n === "number")'));
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
check('portrait cave lane clears the broad starting tower plus breathing room', () => bio.run(
  '(() => { const oldW=W; try { W=180; const baseW=Math.round(W*.17); for(let row=0;row<Math.round(SURF_A*BH/4)-8;row++){const lane=W-caveWallW(row,0,baseW)-caveWallW(row,1,baseW); if(lane<BASE_W+CAVE_LANE_CLEARANCE-1)return false;} return caveLaneMin()>=BASE_W+CAVE_LANE_CLEARANCE; } finally { W=oldW; } })()'));
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

// ---------- v65: campaign-hero home + map star total ----------
const h65 = makeGame({ 'skystack-height': '60' });
h65.run('mode = "endless"; state = "home";');
check('hero card contains the PLAY button', () => h65.run(
  'PLAY_BTN.x >= HERO_CARD.x && PLAY_BTN.y >= HERO_CARD.y && PLAY_BTN.x + PLAY_BTN.w <= HERO_CARD.x + HERO_CARD.w && PLAY_BTN.y + PLAY_BTN.h <= HERO_CARD.y + HERO_CARD.h'));
check('MAP + EXTRAS are demoted below the hero card', () => h65.run(
  'MAP_BTN.y >= HERO_CARD.y + HERO_CARD.h && MODE_BTN.y === MAP_BTN.y && MAP_BTN.x < MODE_BTN.x'));
check('tapping the hero card itself starts the next level', () => h65.run(
  '(() => { const p = {x: HERO_CARD.x + 6, y: HERO_CARD.y + 6}; pos = () => p; pressDown({}); return state === "playing" && runLevel === prog && runLaunch === TIERS[prog-1].n; })()'));
h65.run('gameOver("fall"); failT = 60; state = "home";');
check('SKY MAP button opens the map', () => h65.run(
  '(() => { const p = {x: MAP_BTN.x + 4, y: MAP_BTN.y + 4}; pos = () => p; pressDown({}); return skyMap === true && state === "home"; })()'));
h65.run('skyMap = false;');
check('EXTRA MODES button opens the picker', () => h65.run(
  '(() => { const p = {x: MODE_BTN.x + 4, y: MODE_BTN.y + 4}; pos = () => p; pressDown({}); return modePicker === true && state === "home"; })()'));
check('map header shows the campaign star total', () => {
  const g = makeGame({ 'skystack-height': '60', 'skystack-levelstars': '[3,2,1]' });
  g.run('state = "home"; openSkyMap();');
  g.run('var __mt = []; var __mt0 = txt; txt = function(t,...a){ __mt.push(String(t)); return __mt0(t,...a); };');
  g.run('renderSkyMap()');
  return g.run('__mt.some(t => t === "STARS 6/" + TIERS.length*3)');
});
check('home layout stays inside the canvas on a narrow portrait screen', () => {
  const g = makeGame();
  return g.run('(() => { const oW = W, oH = H; try { W = 242; H = 300; relayout(); return HERO_CARD.x >= 0 && HERO_CARD.x + HERO_CARD.w <= W && MODE_BTN.x + MODE_BTN.w <= W && MAP_BTN.x >= 0 && MODE_BTN.y + MODE_BTN.h < MISS_PANEL.y; } finally { W = oW; H = oH; relayout(); } })()');
});
check('five-row mode picker fits and renders on a 242x300 portrait screen', () => {
  const g = makeGame();
  return g.run('(() => { const oW=W,oH=H; try { W=242; H=300; relayout(); renderModePicker(); const last=PICK_ROWS[PICK_ROWS.length-1]; return PICK_ROWS.length===5 && PICK_ROWS.every((r,i)=>r.x>=0&&r.x+r.w<=W&&r.h>=32&&(i===0||r.y>PICK_ROWS[i-1].y+PICK_ROWS[i-1].h)) && last.y+last.h+12<=H; } finally { W=oW; H=oH; relayout(); } })()');
});
check('renderHome (hero card) runs for fresh, veteran and conquered profiles', () => {
  for (const seed of [{}, { 'skystack-height': '60' }, { 'skystack-height': '900', 'skystack-tiers': '11' }]) {
    const g = makeGame(seed);
    g.run('state = "home"; skyMap = false; renderHome()');
  }
  return true;
});
check('Me volume mixer renders and stays above navigation on narrow portrait screens', () => fresh.run(
  '(() => { state="me"; renderMe(); return MIX_ROWS.length===2&&MIX_ROWS.every(r=>r.minus.x>=0&&r.plus.x+r.plus.w<=W&&r.y+r.plus.h<NAV_Y); })()'));
check('Me volume mixer touch controls adjust the selected channel only', () => fresh.run(
  '(() => { state="me"; musicVol=1;sfxVol=1;renderMe();const r=MIX_ROWS[0].minus;canvasRect=null;pressDown({clientX:(r.x+r.w/2)/W*320,clientY:(r.y+r.h/2)/H*480});return musicVol===.75&&sfxVol===1; })()'));

// ---------- v73: Surface/Forest + Treetops/Lower Sky world identity ----------
const fw = makeGame({ 'skystack-height': '90' });
fw.run('mode = "endless"; resetRun(); state = "playing";');
check('tier 3 is player-facing LOWER SKY (no city/rooftop language in visible tables)', () => fw.run(
  'TIERS[3].name === "LOWER SKY" && MATERIALS[3].name === "BREEZE" && INTRO_TAGS[3] === "INTO OPEN AIR" && ' +
  '!TIERS.some(t => /ROOF|CITY/.test(t.name)) && !INTRO_TAGS.some(t => /CITY|ROOF/.test(t)) && !MATERIALS.some(m => /BRICK/.test(m.name))'));
check('forest helpers exist (treeline, back trunks, canopy band)', () => fw.run(
  '["drawTreeline","backTrunk","drawForestBand","drawSurfaceGround"].every(f => eval("typeof "+f) === "function") && BACK_TREES.length > 0'));
check('background trunks root at the surface and stay below the main canopy tops', () => fw.run(
  'BACK_TREES.every(t => t.topA > SURF_A && t.topA < TIERS[2].n)'));
check('canopy band spans TREETOPS and hands over to wisps before CLOUD NINE', () => fw.run(
  'CANOPY_A0 < TIERS[1].n && CANOPY_A1 === WISP_A0 && WISP_A1 >= TIERS[3].n && WISP_A1 <= TIERS[3].n + 4'));
check('forest band + treeline + trunks render across the whole climb without throwing', () => {
  fw.run('for (let a = 0; a < 130; a += 5) { cameraY = GROUND_Y - a*BH - (H-100); drawTreeline(cameraY); drawForestBand(cameraY, 40); for (const t of BACK_TREES) backTrunk(t, 5); }');
  return true;
});
check('reduced-motion forest world renders statically without throwing', () => {
  const rm2 = makeGame({ 'skystack-height': '90' }, true);
  rm2.run('mode = "endless"; for (let a = 30; a < 90; a += 6) { cameraY = GROUND_Y - a*BH - (H-100); drawGroundWorld(cameraY, 0); }');
  return true;
});
check('sky map art tables are index-aligned to all 11 tiers', () => fw.run(
  'ISLES.length === TIERS.length && !!ISLES[0].top && ISLES[3].cloud === true && ISLES[4].cloud === true && ISLES[5].cloud === true && ISLES[10].top === "#FFD75E"'));
check('the campaign landmark for LOWER SKY is a tree bough, not a slab', () =>
  /region === 2 \|\| region === 3/.test(src));
check('forest world layers are world-anchored (worldY), never parallax-decoupled', () =>
  /function drawTreeline[\s\S]{0,200}worldY\(SURF_A, cy\)/.test(src) &&
  /function drawForestBand[\s\S]{0,400}worldY\(A, cy\)/.test(src) &&
  !/function drawTreeline[\s\S]{0,600}cy \* 0?\.\d/.test(src));
check('no city imagery left in the map art (no building helper, no window grids)', () =>
  !/bldg\s*=|skyline/i.test(src.slice(src.indexOf('const ISLES'))));

// ---------- v74: Clouds + Upper Sky / Stratosphere continuity ----------
const uw = makeGame({ 'skystack-height': '300' });
uw.run('mode = "endless"; resetRun(); state = "playing";');
check('cloudDensityAt: continuous gather -> thick -> thin gradient anchored to TIERS', () => uw.run(
  '(() => { const c0=TIERS[3].n, c1=TIERS[4].n, j=TIERS[5].n, s=TIERS[6].n;' +
  'if (cloudDensityAt(c0-20) !== 0) return "not clear below the deck";' +
  'if (!(cloudDensityAt(c0) > 0.2 && cloudDensityAt(c0) < 0.6)) return "no gathering at the deck";' +
  'if (cloudDensityAt(Math.round((c0+c1)/2)) !== 1) return "middle not fully thick";' +
  'if (!(cloudDensityAt(c1) < 1 && cloudDensityAt(c1) > 0.5)) return "no thinning at the tier top";' +
  'if (!(cloudDensityAt(j) < cloudDensityAt(c1))) return "jet stream not thinner";' +
  'if (cloudDensityAt(s) !== 0 || cloudDensityAt(s+50) !== 0) return "cover not gone by aurora";' +
  'let prev = -1, rising = true;' +
  'for (let A2 = 50; A2 <= s + 10; A2++) { const d = cloudDensityAt(A2);' +
  '  if (d < 0 || d > 1) return "out of range at " + A2;' +
  '  if (rising) { if (d < prev - 1e-9) rising = false; } else if (d > prev + 1e-9) return "not unimodal at " + A2;' +
  '  prev = d; } return true; })()'));
check('screenA matches the biome reference altitude', () => uw.run(
  '(() => { const cy2 = GROUND_Y - 90*BH - (H-100); return Math.abs(screenA(cy2) - 90) < 1e-9 && currentBiome(cy2).ti === biomeTierAt(screenA(cy2)); })()'));
check('upper-sky backdrops render across their whole spans without throwing', () => {
  uw.run('for (let a2 = 60; a2 <= 230; a2 += 4) { const cy2 = GROUND_Y - a2*BH - (H-100); drawCloudNineBg(cy2, 1, 40); drawJetStreamBg(cy2, 1, 40); drawStratosphereBg(cy2, 1, 40); drawAuroraBg(cy2, 1, 40); }');
  return true;
});
check('reduced-motion upper-sky backdrops render without throwing', () => {
  const rm3 = makeGame({ 'skystack-height': '300' }, true);
  rm3.run('for (let a2 = 70; a2 <= 220; a2 += 10) { const cy2 = GROUND_Y - a2*BH - (H-100); drawCloudNineBg(cy2, 1, 0); drawJetStreamBg(cy2, 1, 0); drawStratosphereBg(cy2, 1, 0); drawAuroraBg(cy2, 1, 0); }');
  return true;
});
check('every celestial weather index (0..8) renders, including new STRATOSPHERE air', () => {
  uw.run('for (let i = 0; i <= 8; i++) biomeWeather(i, -3000, 1, 55)');
  return /tier === 4\) \{\s*\/\/ STRATOSPHERE — thin icy flecks/.test(src);
});
check('sun shafts are confined to the open-sky middle of CLOUD NINE', () =>
  /const shaft = clamp\(\(A - \(c0 \+ 4\)\) \/ 6, 0, 1\) \* clamp\(\(\(c1 - 4\) - A\) \/ 8, 0, 1\)/.test(src) &&
  /if \(shaft > 0\.02\)/.test(src));
check('clouds tint colder toward the top of CLOUD NINE', () =>
  /const cold = clamp\(\(A - \(c1 - 10\)\) \/ 14, 0, 1\)/.test(src));
check('jet stream carries thinning cloud remnants only while density remains', () =>
  /function drawJetStreamBg[\s\S]{0,220}cloudDensityAt\(A\)[\s\S]{0,120}if \(dens > 0\.05\)/.test(src));
check('stratosphere aircraft stay in the lower half of the tier', () =>
  /A < \(TIERS\[5\]\.n \+ TIERS\[6\]\.n\) \/ 2/.test(src));
check('the aurora glow dies away into space over the last blocks of the tier', () =>
  /const glow = clamp\(\(TIERS\[7\]\.n - A\) \/ 12, 0, 1\)/.test(src));

// ---------- v75: Orbit + The Stars / Final Gate continuity ----------
const fw2 = makeGame({ 'skystack-height': '600' });
fw2.run('mode = "endless"; resetRun(); state = "playing";');
check('finalJourneyAt is threshold-anchored and progresses Earth -> gold -> summit', () => fw2.run(
  '(() => { const s=TIERS[7].n,o=TIERS[8].n,t=TIERS[9].n,g=TIERS[10].n;' +
  'const a=finalJourneyAt(s), b=finalJourneyAt(o), c=finalJourneyAt(t), d=finalJourneyAt(g);' +
  'return a.earth===0 && b.earth>0.7 && c.gold>0.8 && c.summit===0 && d.summit===1 && d.gateA===g; })()'));
check('final journey factors stay deterministic and inside 0..1 across the whole final act', () => fw2.run(
  '(() => { for(let A=TIERS[7].n-20;A<=TIERS[10].n+20;A++){const q=finalJourneyAt(A),q2=finalJourneyAt(A);' +
  'if(JSON.stringify(q)!==JSON.stringify(q2)||q.earth<0||q.earth>1||q.gold<0||q.gold>1||q.summit<0||q.summit>1)return false;}return true;})()'));
check('Orbit and Stars backdrops render across the final climb without throwing', () => {
  fw2.run('for(let A=210;A<=570;A+=6){const cy2=GROUND_Y-A*BH-(H-100);drawSpaceBg(cy2,1,44);drawOrbitBg(cy2,1,44);drawStarsBg(cy2,1,44);}');
  return true;
});
check('reduced-motion final backdrops render statically without throwing', () => {
  const rm4 = makeGame({ 'skystack-height': '600' }, true);
  rm4.run('for(let A=220;A<=560;A+=12){const cy2=GROUND_Y-A*BH-(H-100);drawSpaceBg(cy2,1,0);drawOrbitBg(cy2,1,0);drawStarsBg(cy2,1,0);}');
  return true;
});
check('final gate uses the summit world coordinate and keeps its pillars on the side walls', () =>
  /function drawFinalGate[\s\S]{0,220}GROUND_Y - q\.gateA\*BH - cy/.test(src) &&
  /const lx = Math\.round\(W\*\.13\), rx = Math\.round\(W\*\.87\)/.test(src));
check('Orbit Earth no longer uses a repeating camera modulo', () =>
  !/function drawOrbitBg[\s\S]{0,240}\(cy\*\.05\) % 60/.test(src));

// ---------- save schema v2 + migration (v64) ----------
// fresh profile: a valid v2 container is created, and nothing is ever written to v1 keys
const sv = makeGame();
check('fresh boot creates a valid v2 save container', () => {
  const s = JSON.parse(sv.mem.get('skystack-save'));
  return s.version === 2 && s.data && typeof s.data === 'object';
});
check('fresh boot writes nothing to the v1 keys', () =>
  [...sv.mem.keys()].every(k => k === 'skystack-save'));
check('store.get returns independent copies (mutations cannot leak into the save)', () => sv.run(
  '(() => { store.set("skystack-modebests", {a:{score:1}}); const m1 = store.get("skystack-modebests", {}); m1.a.score = 999; const m2 = store.get("skystack-modebests", {}); return m2.a.score === 1; })()'));
check('store.set stores an independent copy (later caller mutations cannot leak in)', () => sv.run(
  '(() => { const o = {a:{score:5}}; store.set("skystack-modebests", o); o.a.score = 777; return store.get("skystack-modebests", {}).a.score === 5; })()'));

// veteran v1 profile: every key migrates once into v2, values visible in-game, v1 left as rollback backup
const V1 = {
  'skystack-coins': '345',
  'skystack-skins': '["aurora","candy","void"]',
  'skystack-skin': '"void"',
  'skystack-mode': '"pure"',
  'skystack-modebests': '{"endless":{"score":1200,"blocks":40}}',
  'skystack-daily': '{"lastPlayed":"20260713","streak":4,"best":800}',
  'skystack-stats': '{"games":58,"blocks":2100,"coins":900,"maxCombo":14,"skybreaks":2,"balloons":9,"streakBest":4}',
  'skystack-lv': '{"level":7,"xp":40}',
  'skystack-best': '4321',
  'skystack-height': '123',
  'skystack-tiers': '5',
  'skystack-levelstars': '[3,2,3,1,2]',
  'skystack-missions': '[{"key":"height","target":90,"reward":30},{"key":"perfects","target":8,"reward":25},{"key":"blocks","target":40,"reward":25}]',
  'skystack-skill': '0.62',
  'skystack-ach': '["first","m150"]',
  'skystack-tut': 'true',
  'skystack-mute': 'true',
  'skystack-music': 'false',
  'skystack-hapt': 'false'
};
const mig = makeGame(V1);
check('v1 migration: every v1 key lands in the v2 save', () => {
  const s = JSON.parse(mig.mem.get('skystack-save'));
  return s.version === 2 && Object.keys(V1).every(k => s.data[k] !== undefined);
});
check('migrated: economy + cosmetics intact', () => mig.run(
  'coins === 345 && owned.length === 3 && owned.indexOf("void") >= 0 && skinId === "void"'));
check('migrated: records + campaign intact', () => mig.run(
  'best === 4321 && bestHeight === 123 && prog === Math.max(5, TIERS.filter(t => 123 >= t.n).length) && levelStars.length === 5 && levelStars[0] === 3'));
check('migrated: mode/daily/stats/player level intact', () => mig.run(
  'mode === "pure" && daily.streak === 4 && daily.lastPlayed === "20260713" && stats.games === 58 && stats.maxCombo === 14 && lvl.level === 7 && lvl.xp === 40'));
check('migrated: skill/achievements/tutorial/settings intact', () => mig.run(
  'Math.abs(skill - 0.62) < 1e-9 && achDone.length === 2 && tutDone === true && muted === true && musicOn === false && hapticsOn === false'));
check('migrated: mode bests intact', () => mig.run(
  'bestScoreFor("endless") === 1200 && bestBlocksFor("endless") === 40'));
check('migrated: missions preserved, not regenerated', () => mig.run(
  'missions.length === 3 && missions[0].key === "height" && missions[0].target === 90'));
check('migration leaves the v1 keys untouched (v63 rollback stays safe)', () =>
  Object.keys(V1).every(k => mig.mem.get(k) === V1[k]));
check('after migration, writes go to v2 only (v1 keys frozen)', () => {
  mig.run('coins = 400; store.set("skystack-coins", coins)');
  return mig.mem.get('skystack-coins') === '345' && saved(mig, 'skystack-coins') === 400;
});

// migration runs once: an existing v2 save always wins over stale v1 keys
const dual = makeGame({
  'skystack-coins': '111',
  'skystack-save': JSON.stringify({ version: 2, data: { 'skystack-coins': 999 } })
});
check('an existing v2 save wins over stale v1 keys (migration runs once)', () => dual.run('booted === true && coins === 999'));

// resilience: corrupt saves never crash the boot
const cor1 = makeGame({ 'skystack-save': '{oops', 'skystack-coins': '77' });
check('corrupt v2 JSON: boots and re-migrates from v1', () => cor1.run('booted === true && coins === 77'));
const cor2 = makeGame({ 'skystack-save': '42', 'skystack-coins': '88' });
check('wrong-shape v2 save: boots and re-migrates from v1', () => cor2.run('booted === true && coins === 88'));
const cor3 = makeGame({ 'skystack-coins': '{bad', 'skystack-best': '555' });
check('corrupt v1 key skipped; the rest still migrate', () => cor3.run('booted === true && coins === 0 && best === 555'));

// ---------- static checks ----------
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('sw.js cache bumped to v75', () => /const CACHE = 'skystack-v75'/.test(sw));
check('sub-pixel world scroll: supersampled backing store + fractional camera translate', () =>
  /RS = Math\.max\(1, Math\.min\(3,/.test(src) && /ctx\.setTransform\(RS, 0, 0, RS, 0, 0\)/.test(src) && /cySub = Math\.round\(\(cy - cameraY\) \* RS\) \/ RS/.test(src));
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
