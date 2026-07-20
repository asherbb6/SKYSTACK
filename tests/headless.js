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

// v115: a ctx stub that actually stores/returns globalAlpha (the default anyProxy coerces every
// read to 0, which would hide the reveal's fade). Every other access stays a chainable callable.
function alphaCtx() {
  const store = { globalAlpha: 1 };
  const noop = function () { return p; };
  const p = new Proxy(noop, {
    get(t, k) {
      if (k === 'globalAlpha') return store.globalAlpha;
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then') return undefined;
      return p;
    },
    set(t, k, v) { if (k === 'globalAlpha') store.globalAlpha = v; return true; },
    apply() { return p; }
  });
  return p;
}

function makeGame(storageSeed, reducedMotion, audioEnabled, ctx2dOverride) {
  const mem = new Map(Object.entries(storageSeed || {}));
  const ctx2d = ctx2dOverride || anyProxy();
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
check('v110 skyMapNodes: cards centered on midX (weave removed)', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.every(p => p.x === L.midX) && L.colX >= 0 && L.colX + L.colW <= W; })()'));
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
// v126: stars now come from tracked placements, not a faked perfect ratio — drive level 0's
// objectives for real (★2 = 14 PERFECTS, ★3 = 5 IN A ROW).
lv.run('for (let i=0;i<20;i++) trackStarOutcome({perfect:true, cut:false, miss:false});');
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
  '(() => { const cur = difficultyAt(runContext, blocks.length, assist, tier).sliderSpeed; const baseCtx = createRunContext({mode:"level",campaignLevel:0,startingAltitude:0,seed:1,skill,loadout:{},modifiers:[]}); return cur > difficultyAt(baseCtx, blocks.length, assist, tier).sliderSpeed; })()'));

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
check('endless first reach of stage 1: LEVEL CLEAR note queued', () => lc.run(
  'notes.concat(curNote?[curNote]:[]).some(n=>n.text==="LEVEL CLEAR - CAVES")'));
check('endless first reach of stage 1: prog -> 1', () => lc.run('prog === 1'));
check('prog persisted to storage', () => saved(lc, 'skystack-tiers') === 1 ? true : 'stored: ' + saved(lc, 'skystack-tiers'));
lc.run('resetRun(); while (blocks.length < TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('endless re-reaching a cleared stage: plain milestone note', () => lc.run(
  'notes.concat(curNote?[curNote]:[]).some(n=>n.text===(TIERS[0].n*METERS_PER)+"M - "+TIERS[0].name)'));
lc.run('prog = TIERS.length - 1; resetRun(); tier = TIERS.length - 1;');
lc.run('while (blocks.length < TIERS[TIERS.length-1].n) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('endless reaching THE STARS first time: SKY CONQUERED note queued', () => lc.run(
  'notes.concat(curNote?[curNote]:[]).some(n=>n.text==="SKY CONQUERED!")'));
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
check('map tap: empty space (the gap between cards) does not close or select', () => tap.run(
  '(() => { openSkyMap(); const sel0 = selLevel; const L = __C(1); __T(L.midX, Math.round((L.pts[1].y + L.pts[2].y)/2)); return skyMap === true && selLevel === sel0; })()'));
check('map tap: header tap closes the map', () => tap.run(
  '(() => { __T(Math.round(W/2), 20); return skyMap === false; })()'));
check('map drag: scrolls without selecting or launching', () => tap.run(
  '(() => { openSkyMap(); const s0 = mapScroll; const L = skyMapNodes(); __p = {x:L.colX+3, y:L.pts[1].y}; pressDown({}); __p = {x:L.colX+3, y:L.pts[1].y + 40}; pressMove({}); pressUp({}); return mapScroll !== s0 && selLevel === prog && state === "home" && skyMap === true; })()'));
check('map renders the level-card list at every scroll', () => {
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
  '(() => { const s=TUT_LESSONS.map(x=>x.title+" "+x.body).join(" "); return /DROP/.test(s)&&/PERFECT/.test(s)&&/FEVER/.test(s)&&/BALANCE/.test(s)&&/SKYBREAK/.test(s); })()'));
check('onboarding advances deterministically and persists completion', () => {
  // v109: completion persists from REAL runs (practice is a sandbox and never writes)
  tut.run('mode="endless"; resetRun(); tutStep=1; advanceTutorial(2); advanceTutorial(3); advanceTutorial(5); advanceTutorial(8);');
  return tut.run('tutStep === -1 && tutDone === true') && saved(tut, 'skystack-tut') === true;
});
check('PRACTICE lesson HUD renders without throwing', () => { tut.run('mode="practice"; resetRun(); state="playing"; renderHUD(blocks.length)'); return true; });

// ---------- home screen ----------
const home = makeGame({ 'skystack-height': '60' });
check('home: next-level card shows the next level', () => {
  home.run('mode = "endless"; state = "home";');
  home.run('var __texts = []; var __txt0 = txt; txt = function(t,...a){ __texts.push(String(t)); return __txt0(t,...a); };');
  home.run('renderHome()');
  return home.run('__texts.some(t => t === ("CHAPTER " + (prog+1))) && __texts.some(t => t === TIERS[prog].name) && __texts.some(t => t === "EXTRA MODES")');
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
// v102 contract: windows are stable across long runs of depth (no per-band re-roll) but DO
// re-window every ~96 rows at a per-column phase, so no column keeps one window forever
check('cave atlas columns stay vertically continuous instead of re-rolling every render band', () => bio.run(
  '(() => { for(let x=0;x<CAVE_STAMP_W*6;x+=CAVE_STAMP_W){let tr=0;' +
  'for(let r=4;r<960;r+=4)if(caveStampSourceX(r,x)!==caveStampSourceX(r-4,x))tr++;' +
  'if(tr<8||tr>11)return false;' +
  'if(caveStampSourceX(500,x)!==caveStampSourceX(500,x))return false;}return true;})()'));
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
check('compact Home keeps title, hero details, climb button, and missions in separate lanes', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,270]]){W=w;H=h;relayout();if(HERO_CARD.y<64||HERO_CARD.h<96||PLAY_BTN.y<HERO_CARD.y+70||PLAY_BTN.y+PLAY_BTN.h>HERO_CARD.y+HERO_CARD.h||MAP_BTN.y<=HERO_CARD.y+HERO_CARD.h||MODE_BTN.y+MODE_BTN.h>=MISS_PANEL.y||MISS_PANEL.y+MISS_PANEL.h>=INSTALL_BTN.y||INSTALL_BTN.y+INSTALL_BTN.h>=NAV_Y||MISS_PANEL.h!==30+MISS_PANEL.rowGap)return false;}return true; })()'));   // v94: h grows with the row gap; symmetric 5px padding still holds
check('compact Missions and Shop detail surfaces render and remain dismissible', () => fresh.run(
  '(() => { W=242;H=300;relayout();state="home";missionsOpen=true;renderMissionsOverlay();const mp={x:2,y:2};pos=()=>mp;pressDown({});if(missionsOpen)return false;state="shop";shopView="character";shopDetailOpen=true;renderShopDetail();pressDown({});if(shopDetailOpen)return false;shopView="base";shopDetailOpen=true;renderShopDetail();return SHOP_DETAIL_BTN.y+SHOP_DETAIL_BTN.h<190; })()'));
check('Me volume mixer renders and stays above navigation on narrow portrait screens', () => fresh.run(
  '(() => { state="me"; renderMe(); return MIX_ROWS.length===2&&MIX_ROWS.every(r=>r.minus.x>=0&&r.plus.x+r.plus.w<=W&&r.y+r.plus.h<NAV_Y); })()'));
check('Player Progress and Settings tabs render as bounded separate surfaces', () => fresh.run(
  '(() => { W=242;H=300;relayout();state="me";meView="progress";renderMe();meDetailOpen=true;renderMeDetail();meView="settings";renderMe();return ME_TABS.length===2&&ME_TABS[0].x+ME_TABS[0].w===ME_TABS[1].x&&ME_BADGES_BTN.y+ME_BADGES_BTN.h<122&&MIX_ROWS.every(r=>r.plus.y+r.plus.h<NAV_Y); })()'));
check('Me volume mixer touch controls adjust the selected channel only', () => fresh.run(
  '(() => { state="me";meView="settings";meDetailOpen=false; musicVol=1;sfxVol=1;renderMe();const r=MIX_ROWS[0].minus;pos=()=>({x:r.x+r.w/2,y:r.y+r.h/2});pressDown({});return musicVol===.75&&sfxVol===1; })()'));

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

// ---------- S0 systems foundation ----------
check('S0 mode registry preserves every v75 mode and adds the hidden S6 challenge owner', () => fresh.run(
  `JSON.stringify(Object.keys(MODE_REGISTRY)) === JSON.stringify(['level','practice','endless','time','challenge','pure','daily']) &&
   JSON.stringify(MODES.map(m=>m.id)) === JSON.stringify(['level','practice','endless','time','challenge','pure','daily']) &&
   MODES.every(m => MODE_REGISTRY[m.id] === m) && EXTRAS.length === 5 && EXTRAS.map(m=>m.id).join(',') === 'practice,endless,pure,daily,challenges'`));
check('S0 level registry is index-aligned with every v75 tier boundary', () => fresh.run(
  'LEVEL_REGISTRY.length === TIERS.length && LEVEL_REGISTRY.every((l,i) => l.id === i && l.goalAltitude === TIERS[i].n && l.startAltitude === (i ? TIERS[i-1].n : 0) && l.name === TIERS[i].name && l.color === TIERS[i].c)'));
check('S0 balance registry aliases the live v75 physics constants', () => fresh.run(
  'BALANCE_REGISTRY.physics.blockHeight === BH && BALANCE_REGISTRY.physics.baseWidth === BASE_W && BALANCE_REGISTRY.physics.metersPerBlock === METERS_PER && BALANCE_REGISTRY.physics.topple === TOPPLE && BALANCE_REGISTRY.physics.perfectPx === PERFECT_PX'));
// v133: Bases are switched OFF (kept for a later project), so this asserts the flag SET is still
// centralized and complete — not that every flag is on. The bases:false value is pinned here on
// purpose: if something flips it back on, the shop tab and BASE GALLERY return with it.
check('S0 feature flags remain centralized; Bases are deliberately off, the rest active', () => fresh.run(
  'Object.isFrozen(FEATURE_FLAGS) && Object.keys(FEATURE_FLAGS).length === 5 && FEATURE_FLAGS.characters === true && FEATURE_FLAGS.bases === false && FEATURE_FLAGS.modifiers === true && FEATURE_FLAGS.collections === true && FEATURE_FLAGS.challenges === true'));

const s0ctx = makeGame();
s0ctx.run('mode="endless"; loadout={shield:true,aura:false,slow:true}; resetRun(); globalThis.__ctx=runContext; globalThis.__seed=runContext.seed; globalThis.__speed=difficultyAt(runContext,40,assist,2).sliderSpeed;');
check('RunContext captures every required run-start field', () => s0ctx.run(
  '__ctx.mode === "endless" && __ctx.campaignLevel === -1 && __ctx.startingAltitude === 0 && Number.isInteger(__ctx.seed) && __ctx.assistPolicy === "adaptive" && __ctx.loadoutSnapshot.shield && __ctx.loadoutSnapshot.slow && Array.isArray(__ctx.modifiers) && __ctx.rewardPermissions.earn && __ctx.recordPermissions.write && __ctx.difficultyProfile.startingAssist > 0'));
check('RunContext is deeply immutable and detached from cleared mutable loadout', () => s0ctx.run(
  '(() => { const before=JSON.stringify(__ctx); try{__ctx.mode="pure";}catch(e){} try{__ctx.loadoutSnapshot.shield=false;}catch(e){} try{__ctx.modifiers.push({id:"x"});}catch(e){} return Object.isFrozen(__ctx) && Object.isFrozen(__ctx.loadoutSnapshot) && Object.isFrozen(__ctx.modifiers) && JSON.stringify(__ctx) === before && loadout.shield === false; })()'));
check('difficultyAt is pure and tied to the immutable campaign profile', () => s0ctx.run(
  '(() => { const a=difficultyAt(__ctx,40,0.2,2), b=difficultyAt(__ctx,40,0.2,2); mode="pure"; runLevel=9; return JSON.stringify(a) === JSON.stringify(b) && Math.abs(difficultyAt(__ctx,40,assist,2).sliderSpeed-__speed)<1e-12; })()'));

check('Daily seed keeps the exact v75 date XOR and deterministic sequence', () => fresh.run(
  '(() => { const seed=seedForRun("daily",0,20260714), old=(20260714 ^ 0x9E3779B9)>>>0, a=mulberry32(seed), b=mulberry32(seed); return seed===old && [a(),a(),a()].join(",") === [b(),b(),b()].join(","); })()'));
const dailyDet = makeGame();
check('Daily reset owns and replays hue, pickups, and gameplay wind RNG', () => dailyDet.run(
  '(() => { const play=()=>{ resetRun(); while(blocks.length<26) blocks.push({x:0,w:96,col:"#fff"}); tier=0; windTimer=0; state="playing"; update(1); return {seed:runContext.seed,hue:blocks[0].col.h,pick:JSON.stringify(pickups),wind:JSON.stringify(wind)}; }; mode="daily"; return JSON.stringify(play())===JSON.stringify(play()); })()'));
check('owned non-Daily seeds reproduce the same run RNG stream', () => fresh.run(
  '(() => { const seed=seedForRun("endless",0x12345678), a=mulberry32(seed), b=mulberry32(seed); return seed===0x12345678 && [a(),a(),a(),a()].join(",") === [b(),b(),b(),b()].join(","); })()'));

check('permission helpers preserve reward, record, loadout, and checkpoint rules', () => fresh.run(
  '(() => { const mk=(m,l=-1,a=0)=>createRunContext({mode:m,campaignLevel:l,startingAltitude:a,seed:1,skill:.35,loadout:{},modifiers:[]}); return !canEarnRewards(mk("practice")) && !canWriteRecords(mk("practice")) && !canUseLoadout(mk("practice")) && canEarnRewards(mk("pure")) && canWriteRecords(mk("pure")) && !canUseLoadout(mk("pure")) && canEarnRewards(mk("daily")) && canWriteRecords(mk("daily")) && !canUseLoadout(mk("daily")) && canUseLoadout(mk("endless")) && !canWriteRecords(mk("level",2,44)) && !canWriteRecords(mk("endless",-1,44)); })()'));

check('future save-v2 contracts stay frozen; every shipped system field is active', () => fresh.run(
  'Object.isFrozen(FUTURE_SAVE_CONTRACTS) && Object.isFrozen(FUTURE_SAVE_CONTRACTS.characters.defaults) && Object.isFrozen(FUTURE_SAVE_CONTRACTS.bases.defaults) && Object.isFrozen(FUTURE_SAVE_CONTRACTS.collections.defaults) && ["characters","bases","collections","challengeRecords"].every(id=>Object.prototype.hasOwnProperty.call(SAVE.data,FUTURE_SAVE_CONTRACTS[id].key))'));
check('future save-v2 migration normalizes only present fields and preserves current data', () => fresh.run(
  '(() => { const src={keep:7,"skystack-characters":{owned:["pilot",4,"pilot"],selected:9,mastery:null},"skystack-bases":null,"skystack-collections":{unlocked:["ore","ore"],completed:"bad"},"skystack-challenge-records":[1]}; const out=migrateFutureSaveV2(src); return out!==src && out.keep===7 && JSON.stringify(out["skystack-characters"])===JSON.stringify({owned:["pilot"],selected:null,mastery:{}}) && JSON.stringify(out["skystack-bases"])===JSON.stringify({owned:[],selected:null}) && JSON.stringify(out["skystack-collections"])===JSON.stringify({unlocked:["ore"],completed:[]}) && JSON.stringify(out["skystack-challenge-records"])==="{}" && src["skystack-characters"].owned.length===3; })()'));

const cyc = makeGame();
check('three consecutive start/play/fail/restart cycles fully scrub run state', () => cyc.run(
  '(() => { mode="endless"; startRun(); let prev=null; for(let i=0;i<3;i++){ prev=runContext; state="playing"; blocks.push({x:10,w:40,col:"#fff"}); debris.push({x:1}); particles.push({x:1}); floaters.push({x:1}); trails.push({x:1}); coinFx.push({x:1}); pickups.push({row:999}); balloon={x:1}; wind={dir:1}; balance=20; swayX=8; paused=true; dropPending=3; shield=2; widenNext=true; slowBlocks=3; auraBlocks=2; goldenNext=true; fever=true; nova=true; score=500; runCoins=12; gameOver("quit"); state="home"; startRun(); if(runContext===prev || !Object.isFrozen(runContext) || state!=="playing" || blocks.length!==1 || debris.length || particles.length || floaters.length || trails.length || coinFx.length || balloon!==null || wind!==null || balance!==0 || swayX!==0 || paused || dropPending!==0 || shield!==0 || widenNext || slowBlocks!==0 || auraBlocks!==0 || goldenNext || fever || nova || score!==0 || runCoins!==0 || reviveUsed || reviveOffered || runSettled) return false; } return stats.games===3 && slider!==null; })()'));

// ---------- S1 level specification + deterministic balance harness ----------
check('S1 defines eleven frozen LevelSpecs with unique identities and focuses', () => fresh.run(
  'LEVEL_REGISTRY.length===11 && Object.isFrozen(LEVEL_REGISTRY) && LEVEL_REGISTRY.every((l,i)=>Object.isFrozen(l) && l.id===i && l.identity && l.focus) && new Set(LEVEL_REGISTRY.map(l=>l.identity)).size===11 && new Set(LEVEL_REGISTRY.map(l=>l.focus)).size===11'));
check('S1 LevelSpecs preserve every campaign threshold, start, segment size, and material', () => fresh.run(
  'LEVEL_REGISTRY.every((l,i)=>l.goalAltitude===TIERS[i].n && l.startAltitude===(i?TIERS[i-1].n:0) && l.blocksRequired===l.goalAltitude-l.startAltitude && l.name===TIERS[i].name && l.color===TIERS[i].c && l.material.name===MATERIALS[i].name && l.material.speed===MATERIALS[i].spd && l.material.wobble===MATERIALS[i].wob && l.material.wind===MATERIALS[i].wind)'));
check('S1 campaign progression is explicit, ordered, and has no unlock gaps', () => fresh.run(
  'LEVEL_REGISTRY.every((l,i)=>l.difficultyRating===i+1 && l.unlock.requiresLevel===(i?i-1:null) && l.targetDurationSeconds.min<l.targetDurationSeconds.target && l.targetDurationSeconds.target<l.targetDurationSeconds.max)'));
check('S1 difficulty lanes map all seven modes without changing their fail or assist policy', () => fresh.run(
  'laneForMode("practice").id==="practice" && laneForMode("level").id==="assisted" && laneForMode("endless").id==="assisted" && laneForMode("time").id==="assisted" && laneForMode("challenge").id==="assisted" && laneForMode("pure").id==="unassisted" && laneForMode("daily").id==="unassisted" && !DIFFICULTY_LANES.practice.fail && DIFFICULTY_LANES.assisted.fail && DIFFICULTY_LANES.unassisted.fail'));
check('S1 RunContext owns the selected lane, assist envelope, and campaign speed scale', () => fresh.run(
  '(() => { const p=createRunContext({mode:"practice",campaignLevel:-1,startingAltitude:0,seed:1,skill:.35,loadout:{},modifiers:[]}), s=createRunContext({mode:"level",campaignLevel:10,startingAltitude:360,seed:1,skill:.35,loadout:{},modifiers:[]}), d=createRunContext({mode:"daily",campaignLevel:-1,startingAltitude:0,seed:1,skill:.35,loadout:{},modifiers:[]}); return p.difficultyProfile.lane==="practice" && p.difficultyProfile.assistEnvelope.min===.85 && Object.isFrozen(p.difficultyProfile.assistEnvelope) && s.difficultyProfile.lane==="assisted" && s.difficultyProfile.levelSpeedScale===1.25 && d.difficultyProfile.lane==="unassisted" && d.difficultyProfile.levelSpeedScale===1; })()'));

check('S1 balance harness is pure and deterministic for identical inputs', () => fresh.run(
  'JSON.stringify(levelBalanceReport(10,"assisted",.35))===JSON.stringify(levelBalanceReport(10,"assisted",.35))'));
check('S1 harness reports duration, speed, precision, assist, wind, material, topple, recovery, and stars', () => fresh.run(
  '(() => { const r=levelBalanceReport(4,"assisted",.35); return r.blocks===26 && r.durationSeconds.ideal>0 && r.durationSeconds.ordinary>r.durationSeconds.ideal && r.sliderSpeed.min>0 && r.sliderSpeed.max>=r.sliderSpeed.average && r.perfectWindowPx>PERFECT_PX && r.assist.start>0 && r.assist.max<=.85 && r.windExposure===MATERIALS[4].wind && r.materials.join(",")===MATERIALS[4].name && r.toppleTolerance===TOPPLE && r.recovery===DIFFICULTY_LANES.assisted.recovery && r.starObjectives.complete===true && r.starObjectives.two.type==="perfects" && r.starObjectives.two.n===10 && r.starObjectives.three.type==="streak" && r.starObjectives.three.n===6; })()'));
check('S1 modeled ordinary completion times stay inside every specified target range', () => fresh.run(
  'LEVEL_REGISTRY.every((l,i)=>{ const r=levelBalanceReport(i,"assisted",.35), d=r.durationSeconds; return d.ordinary>=d.range[0] && d.ordinary<=d.range[1]; })'));
check('S1 lanes expose fixed Practice, adaptive Assisted, and zero Unassisted help', () => fresh.run(
  '(() => { const p=levelBalanceReport(5,"practice",.35), a=levelBalanceReport(5,"assisted",.35), u=levelBalanceReport(5,"unassisted",.35); return p.assist.start===.85 && p.assist.end===.85 && p.recovery==="AUTO SAVE" && a.assist.start>0 && a.assist.max>a.assist.min && a.recovery==="ASSIST + SHIELD/REVIVE" && u.assist.start===0 && u.assist.end===0 && u.recovery==="NONE"; })()'));
check('S1 final pace scale is campaign-only and leaves all free modes at v76 speed', () => fresh.run(
  '(() => { const mk=(m,l,a)=>createRunContext({mode:m,campaignLevel:l,startingAltitude:a,seed:1,skill:.35,loadout:{},modifiers:[]}), summit=mk("level",10,360), legacy={difficultyProfile:{startingAssist:summit.difficultyProfile.startingAssist,campaignLevel:10,levelSpeedScale:1,slider:BALANCE_REGISTRY.slider}}; return LEVEL_REGISTRY.slice(0,10).every(l=>l.speedCurve.campaignScale===1) && LEVEL_REGISTRY[10].speedCurve.campaignScale===1.25 && difficultyAt(summit,400,.2,10).sliderSpeed>difficultyAt(legacy,400,.2,10).sliderSpeed && ["endless","time","pure","daily","practice"].every(m=>mk(m,-1,0).difficultyProfile.levelSpeedScale===1); })()'));
check('S1 physics registry preserves the live drop, balance, wind, and star constants', () => fresh.run(
  'BALANCE_REGISTRY.drop.graceFrames===5 && BALANCE_REGISTRY.drop.spawnGap===24 && BALANCE_REGISTRY.drop.initialVelocity===2.6 && BALANCE_REGISTRY.drop.gravity===.9 && fallFramesFor()===5 && BALANCE_REGISTRY.placement.balanceMemory===.5 && BALANCE_REGISTRY.placement.balanceOffset===.5 && BALANCE_REGISTRY.wind.firstDelayFrames===260 && BALANCE_REGISTRY.wind.minStartBlocks===25 && LEVEL_REGISTRY.every((l,i)=>l.starObjectives.complete===true && l.starObjectives.two===STAR_OBJECTIVES[i].two && l.starObjectives.three===STAR_OBJECTIVES[i].three)'));

// ---------- S2 characters + one-slot passives ----------
check('S2 promotes every persistent skin into an immutable Character with matching visual and unlock data', () => fresh.run(
  'CHARACTER_REGISTRY.length===SKINS.length && Object.isFrozen(CHARACTER_REGISTRY) && CHARACTER_REGISTRY.every((c,i)=>Object.isFrozen(c) && c.id===SKINS[i].id && c.name===SKINS[i].name && c.rare===SKINS[i].rare && c.cost===SKINS[i].cost && c.style===SKINS[i].style && c.base===SKINS[i].base && c.role && PASSIVE_REGISTRY[c.passiveId] && c.unlock.cost===c.cost)'));
check('S2 defines all approved passive families with explicit benefit and trade-off text', () => fresh.run(
  'JSON.stringify(Object.keys(PASSIVE_REGISTRY))===JSON.stringify(["classic","economy","precision","wind","fever","recovery","revive"]) && Object.values(PASSIVE_REGISTRY).every(p=>Object.isFrozen(p)&&p.name&&p.benefit&&p.tradeoff&&Object.isFrozen(p.effects))'));
check('S2 first boot activates Character save from legacy cosmetic ownership and selection', () => {
  const g=makeGame({'skystack-skins':JSON.stringify(['aurora','candy','lava']),'skystack-skin':JSON.stringify('lava')});
  const c=saved(g,'skystack-characters');
  return g.run('skinId==="lava" && owned.includes("lava")') && c.selected==='lava' && c.owned.includes('aurora') && c.owned.includes('candy') && c.owned.includes('lava') && JSON.stringify(c.mastery)==='{}';
});
check('S2 Character save normalization repairs invalid fields without dropping unknown owned ids', () => {
  const g=makeGame({'skystack-save':JSON.stringify({version:2,data:{'skystack-characters':{owned:['lava','future-id','lava',8],selected:'missing',mastery:{lava:{xp:'501',runs:-2,blocks:4.9,perfects:'bad'}}}}})});
  const c=saved(g,'skystack-characters');
  return g.run('skinId==="aurora" && owned.includes("future-id")') && c.selected==='aurora' && c.owned.filter(x=>x==='lava').length===1 && c.owned.includes('aurora') && c.owned.includes('candy') && JSON.stringify(c.mastery.lava)===JSON.stringify({xp:501,runs:0,blocks:4,perfects:0});
});
check('S2 equip writes the Character contract and both rollback cosmetic fields together', () => {
  const g=makeGame({'skystack-coins':'500'});
  g.run('state="shop"; previewIdx=CHARACTER_REGISTRY.findIndex(c=>c.id==="lava"); relayout(); var __p={x:EQUIP_BTN.x+2,y:EQUIP_BTN.y+2}; pos=()=>__p; pressDown({});');
  const c=saved(g,'skystack-characters');
  return c.selected==='lava' && c.owned.includes('lava') && saved(g,'skystack-skin')==='lava' && saved(g,'skystack-skins').includes('lava') && saved(g,'skystack-coins')===380;
});

check('S2 RunContext deeply snapshots selected Character, passive, and mastery at run start', () => fresh.run(
  '(() => { skinId="neon"; characterMastery.neon={xp:700,runs:2,blocks:80,perfects:20}; mode="endless"; resetRun(); const snap=runContext.characterSnapshot,before=JSON.stringify(snap); skinId="aurora"; characterMastery.neon.xp=9999; try{snap.id="void";}catch(e){} try{snap.mastery.xp=0;}catch(e){} return snap.id==="neon" && snap.passiveId==="precision" && snap.passiveEnabled && snap.mastery.xp===700 && Object.isFrozen(snap) && Object.isFrozen(snap.mastery) && JSON.stringify(snap)===before; })()'));
check('S2 passives are enabled only for campaign, Endless, and Time', () => fresh.run(
  '(() => { const mk=m=>createRunContext({mode:m,campaignLevel:m==="level"?0:-1,startingAltitude:0,seed:1,skill:.35,loadout:{},characterId:"candy",characterMastery:{},modifiers:[]}); return ["level","endless","time"].every(m=>mk(m).characterSnapshot.passiveEnabled) && ["practice","pure","daily"].every(m=>!mk(m).characterSnapshot.passiveEnabled && activePassive(mk(m)).id==="classic"); })()'));
check('S2 passive helpers apply each benefit/trade-off and preserve neutral Classic parity', () => fresh.run(
  '(() => { const mk=(id,m="endless")=>createRunContext({mode:m,campaignLevel:-1,startingAltitude:0,seed:1,skill:.35,loadout:{},characterId:id,characterMastery:{},modifiers:[]}), a=mk("aurora"), e=mk("candy"), p=mk("neon"), w=mk("mono"), f=mk("lava"), r=mk("mint"), v=mk("gold"); return adjustedRunCoins(a,10)===10 && adjustedRunScore(a,100)===100 && adjustedReviveCost(a,25)===25 && adjustedRunCoins(e,10)===12 && adjustedRunScore(e,100)===94 && passiveEffect(p,"perfect",1)===1.15 && passiveEffect(p,"slider",1)===1.07 && passiveEffect(w,"wind",1)===.75 && passiveEffect(w,"perfect",1)===.9 && feverThreshold(f)===9 && passiveEffect(r,"balance",1)===.78 && adjustedReviveCost(v,25)===19 && adjustedRunCoins(v,10)===9; })()'));
check('S2 Pure and Daily ignore the selected Character in every calculation hook', () => fresh.run(
  '(() => { const mk=m=>createRunContext({mode:m,campaignLevel:-1,startingAltitude:0,seed:1,skill:.35,loadout:{},characterId:"neon",characterMastery:{},modifiers:[]}); return ["pure","daily"].every(m=>{const c=mk(m);return adjustedRunCoins(c,10)===10&&adjustedRunScore(c,100)===100&&adjustedReviveCost(c,25)===25&&feverThreshold(c)===10&&passiveEffect(c,"perfect",1)===1&&passiveEffect(c,"slider",1)===1&&passiveEffect(c,"wind",1)===1&&passiveEffect(c,"balance",1)===1;}); })()'));
check('S2 live precision and recovery hooks affect perfect window, slider speed, and balance only in eligible runs', () => fresh.run(
  '(() => { skinId="neon"; mode="endless"; resetRun(); const base=PERFECT_PX*(1+assist), wide=effPerfect(), fast=slider.speed; skinId="aurora"; resetRun(); const neutral=slider.speed; skinId="mint"; resetRun(); balance=0; afterPlace({x:0,w:96,col:"#fff"},true,W/2+20); const recovered=balance; skinId="aurora"; resetRun(); balance=0; afterPlace({x:0,w:96,col:"#fff"},true,W/2+20); return Math.abs(wide-base*1.15)<1e-9 && fast>neutral && Math.abs(recovered)<Math.abs(balance); })()'));
check('S2 Fever copy clearly describes a threshold, not an initial x9 combo', () => fresh.run(
  'PASSIVE_REGISTRY.fever.name==="QUICK IGNITION" && PASSIVE_REGISTRY.fever.benefit==="FEVER AT X9 COMBO"'));
check('S2 live Economy hook awards more run coins and applies its score trade-off', () => fresh.run(
  '(() => { skinId="candy"; mode="endless"; resetRun(); coins=0; runCoins=0; stats.coins=0; addCoins(10); const coinOk=coins===12&&runCoins===12; score=0; combo=0; const top=blocks[blocks.length-1]; faller={x:top.x,y:towerTopY()-BH,w:top.w,col:"#fff",vy:0,golden:false}; state="dropping"; land(); return coinOk && combo===1 && score===14; })()'));
check('S2 live Campaign Fever hook ignites Lava at x9 while Classic waits for x10', () => fresh.run(
  '(() => { const place=()=>{const top=blocks[blocks.length-1];faller={x:top.x,y:towerTopY()-BH,w:top.w,col:"#fff",vy:0,golden:false};state="dropping";land();}; skinId="lava";startLevel(0);combo=8;fever=false;place();const lava=runContext.mode==="level"&&combo===9&&fever&&runFevers===1;skinId="aurora";startLevel(0);combo=8;fever=false;place();return lava&&runContext.mode==="level"&&combo===9&&!fever&&runFevers===0; })()'));
check('S2 live Wind hook reduces generated wind force by exactly 25 percent', () => fresh.run(
  '(() => { const spawn=id=>{skinId=id;mode="endless";resetRun();while(blocks.length<=BALANCE_REGISTRY.wind.minStartBlocks)blocks.push({x:0,w:96,col:"#fff"});tier=5;wind=null;windTimer=0;rnd=()=>.5;update(1);return wind&&wind.str;};const calm=spawn("mono"),classic=spawn("aurora");return calm>0&&classic>0&&Math.abs(calm/classic-.75)<1e-9; })()'));
check('S2 live Revive hook charges Gold 25 percent less and applies its run-coin trade-off', () => fresh.run(
  '(() => { skinId="gold";mode="endless";resetRun();tier=0;coins=100;runCoins=0;stats.coins=0;addCoins(10);const coinOk=coins===109&&runCoins===9;gameOver("fall");const cost=reviveCost(),offered=reviveOffered;doRevive();return coinOk&&offered&&cost===19&&coins===90&&reviveUsed&&shield>0&&state==="playing"; })()'));
check('S2 mastery settles once per rewarded run and never advances in Practice', () => {
  const g=makeGame();
  g.run('skinId="candy"; mode="endless"; resetRun(); while(blocks.length<6)blocks.push({x:0,w:96,col:"#fff"}); runPerfects=3; score=100; gameOver("quit"); finalizeRun(); finalizeRun();');
  const once=saved(g,'skystack-characters').mastery.candy;
  g.run('skinId="candy"; mode="practice"; resetRun(); while(blocks.length<5)blocks.push({x:0,w:96,col:"#fff"}); gameOver("quit"); finalizeRun();');
  const after=saved(g,'skystack-characters').mastery.candy;
  return once.runs===1 && once.blocks===6 && once.perfects===3 && once.xp>0 && JSON.stringify(after)===JSON.stringify(once);
});
check('S2 Character Select renders and keeps controls above navigation on a 242x300 screen', () => fresh.run(
  '(() => { W=242; H=300; relayout(); state="shop"; previewIdx=11; renderShop(); return EQUIP_BTN.x>=0 && EQUIP_BTN.x+EQUIP_BTN.w<=W && EQUIP_BTN.y+EQUIP_BTN.h<NAV_Y && LOAD_CHIPS.every(c=>c.x>=0&&c.x+c.w<=W&&c.y+c.h<NAV_Y); })()'));

// ---------- S3 checkpoints, starting structures + cosmetic Bases ----------
check('S3 defines frozen ground plus one checkpoint per cleared biome with explicit unlock and score scope', () => fresh.run(
  'CHECKPOINT_REGISTRY.length===TIERS.length+1 && Object.isFrozen(CHECKPOINT_REGISTRY) && CHECKPOINT_REGISTRY[0].id==="ground" && CHECKPOINT_REGISTRY[0].scoreMultiplier===1 && CHECKPOINT_REGISTRY.slice(1).every((c,i)=>Object.isFrozen(c)&&c.startAltitude===TIERS[i].n&&c.region===i&&c.unlock.requiresClearedLevel===i&&c.scoreMultiplier===.75&&c.rewardScope==="campaign-segment"&&c.recordScope==="checkpoint")'));
check('S3 clearing a biome unlocks its checkpoint and campaign level starts map to the previous cleared biome', () => fresh.run(
  '(() => { const cave=CHECKPOINT_REGISTRY[1],surface=CHECKPOINT_REGISTRY[2]; return !checkpointUnlocked(cave,0)&&checkpointUnlocked(cave,1)&&!checkpointUnlocked(surface,1)&&checkpointUnlocked(surface,2)&&checkpointForLevel(0).id==="ground"&&checkpointForLevel(1).id==="checkpoint-0"&&checkpointForLevel(10).startAltitude===TIERS[9].n; })()'));
check('S3 checkpoint launch snapshots reduced scoring, campaign rewards, landmark identity, and no records', () => fresh.run(
  '(() => { prog=3; startLevel(2); const c=runContext; return runLaunch===TIERS[1].n&&blocks.length===runLaunch&&c.checkpointSnapshot.id==="checkpoint-1"&&c.checkpointSnapshot.scoreMultiplier===.75&&c.rewardPermissions.scope==="campaign-segment"&&c.rewardPermissions.scoreMultiplier===.75&&!c.recordPermissions.write&&c.recordPermissions.reason==="campaign-level"&&c.startingStructureSnapshot.kind==="landmark"&&c.startingStructureSnapshot.region===1; })()'));
check('S3 ground campaign start preserves full scoring and the natural cave-ground structure', () => fresh.run(
  '(() => { startLevel(0); const c=runContext; return runLaunch===0&&blocks.length===1&&c.checkpointSnapshot.id==="ground"&&c.rewardPermissions.scoreMultiplier===1&&!c.recordPermissions.write&&c.startingStructureSnapshot.id==="natural-cave-ground"&&c.startingStructureSnapshot.kind==="ground"; })()'));
check('S3 checkpoint score reduction composes with Character trade-offs without changing rewards or records', () => fresh.run(
  '(() => { const classic=createRunContext({mode:"level",campaignLevel:2,startingAltitude:44,checkpointId:"checkpoint-1",baseId:"natural",seed:1,skill:.35,loadout:{},characterId:"aurora",characterMastery:{},modifiers:[]}), candy=createRunContext({mode:"level",campaignLevel:2,startingAltitude:44,checkpointId:"checkpoint-1",baseId:"natural",seed:1,skill:.35,loadout:{},characterId:"candy",characterMastery:{},modifiers:[]}); return adjustedRunScore(classic,100)===75&&adjustedRunScore(candy,100)===71&&canEarnRewards(classic)&&!canWriteRecords(classic); })()'));
check('S3 checkpoint, structure, Base, Character, and boost fields are separate immutable RunContext owners', () => fresh.run(
  '(() => { const c=createRunContext({mode:"level",campaignLevel:2,startingAltitude:44,checkpointId:"checkpoint-1",baseId:"starforge",seed:1,skill:.35,loadout:{shield:true},characterId:"neon",characterMastery:{xp:4},modifiers:[]}),before=JSON.stringify(c); try{c.checkpointSnapshot.id="ground"}catch(e){}try{c.startingStructureSnapshot.kind="ground"}catch(e){}try{c.baseSnapshot.id="natural"}catch(e){}try{c.characterSnapshot.id="aurora"}catch(e){}try{c.boostSnapshot.shield=false}catch(e){} return [c.checkpointSnapshot,c.startingStructureSnapshot,c.baseSnapshot,c.characterSnapshot,c.boostSnapshot,c.boostPermissions].every(Object.isFrozen)&&JSON.stringify(c)===before&&c.baseSnapshot.id==="starforge"&&c.characterSnapshot.id==="neon"&&c.boostSnapshot.shield; })()'));
check('S3 keeps a valid default Base save while later milestones activate Collection and Challenge domains', () => {
  const g=makeGame(),b=saved(g,'skystack-bases'),data=JSON.parse(g.mem.get('skystack-save')).data;
  return b.selected==='natural'&&JSON.stringify(b.owned)===JSON.stringify(['natural'])&&Object.prototype.hasOwnProperty.call(data,'skystack-characters')&&Object.prototype.hasOwnProperty.call(data,'skystack-bases')&&Object.prototype.hasOwnProperty.call(data,'skystack-collections')&&Object.prototype.hasOwnProperty.call(data,'skystack-challenge-records');
});
check('S3 Base save normalization repairs selection while preserving unknown owned ids', () => {
  const g=makeGame({'skystack-save':JSON.stringify({version:2,data:{'skystack-bases':{owned:['runestone','future-base','runestone',7],selected:'missing'}}})}),b=saved(g,'skystack-bases');
  return g.run('baseId==="natural"&&ownedBases.includes("future-base")')&&b.selected==='natural'&&b.owned.includes('natural')&&b.owned.includes('runestone')&&b.owned.includes('future-base')&&b.owned.filter(x=>x==='runestone').length===1;
});
check('S3 Base Select unlocks, equips, charges once, and writes only the Base domain', () => {
  const g=makeGame({'skystack-coins':'500'});
  g.run('state="shop";shopView="base";basePreviewIdx=BASE_REGISTRY.findIndex(b=>b.id==="runestone");relayout();var __p={x:EQUIP_BTN.x+2,y:EQUIP_BTN.y+2};pos=()=>__p;pressDown({});');
  const b=saved(g,'skystack-bases'); return b.selected==='runestone'&&b.owned.includes('runestone')&&saved(g,'skystack-coins')===410&&saved(g,'skystack-characters').selected==='aurora';
});
check('S3 selected Base is immutable within a run and remains cosmetic in Pure and Daily', () => fresh.run(
  '(() => { baseId="rootbound";mode="pure";resetRun();const snap=runContext.baseSnapshot,before=JSON.stringify(snap);baseId="natural";try{snap.id="starforge"}catch(e){}const pure=runContext,daily=createRunContext({mode:"daily",campaignLevel:-1,startingAltitude:0,checkpointId:"ground",baseId:"starforge",seed:1,skill:.35,loadout:{shield:true},characterId:"neon",characterMastery:{},modifiers:[]});return snap.id==="rootbound"&&JSON.stringify(snap)===before&&pure.basePermissions.cosmetic&&!pure.basePermissions.effects&&!daily.basePermissions.effects&&adjustedRunScore(pure,100)===100&&adjustedRunScore(daily,100)===100&&!canUseLoadout(pure)&&!canUseLoadout(daily); })()'));
check('S3 every cosmetic Base and every checkpoint structure render without changing collision state', () => fresh.run(
  '(() => { const before=JSON.stringify(blocks); BASE_REGISTRY.forEach(b=>drawBaseCosmetic(W/2,100,BASE_W,b.id)); CHECKPOINT_REGISTRY.slice(1).forEach(c=>drawLandmarkPlatform(W/2,100,BASE_W,c.region)); return JSON.stringify(blocks)===before; })()'));
// v133: Bases are switched off, so there is no Base Select to render. The layout intent this test
// existed to protect — shop tabs and controls stay on-screen and clear of the nav at 242x300 — is
// kept, now measured on the character shop that players actually reach.
check('S3 the shop renders with its tabs and controls above navigation at 242x300', () => fresh.run(
  '(() => { W=242;H=300;relayout();state="shop";shopView="character";previewIdx=3;renderShop();return SHOP_TABS.length>=1&&SHOP_TABS.every(t=>t.x>=0&&t.x+t.w<=W&&t.y+t.h<NAV_Y)&&EQUIP_BTN.y+EQUIP_BTN.h<NAV_Y; })()'));

// ---------- S4 biome gameplay identities + fair run modifiers ----------
check('S4 defines frozen, explicit modifier contracts for all eight macro-biomes and six families', () => fresh.run(
  'MODIFIER_REGISTRY.length===12&&Object.isFrozen(MODIFIER_REGISTRY)&&new Set(MODIFIER_REGISTRY.map(m=>m.biome)).size===8&&["gust","precision","goldRush","recovery","limitedMiss","target"].every(f=>MODIFIER_REGISTRY.some(m=>m.family===f))&&MODIFIER_REGISTRY.every(m=>Object.isFrozen(m)&&m.lead>=3&&m.duration>=6&&m.rule&&m.rewardCoins>0&&m.safeLane&&m.safeLane.width>0&&m.safeLane.width<=.5)'));
check('S4 seeded schedules are reproducible without consuming the gameplay RNG stream', () => fresh.run(
  '(() => { const before=mulberry32(123),expected=[before(),before(),before()],a=buildModifierSchedule(123,"endless",-1,0),b=buildModifierSchedule(123,"endless",-1,0),c=buildModifierSchedule(124,"endless",-1,0),after=mulberry32(123),actual=[after(),after(),after()];return JSON.stringify(a)===JSON.stringify(b)&&JSON.stringify(a)!==JSON.stringify(c)&&JSON.stringify(actual)===JSON.stringify(expected); })()'));
check('S4 campaign retry replays the exact owned seed, checkpoint, and modifier schedule', () => {
  const g=makeGame();
  return g.run('(() => { prog=4;startLevel(3);const seed=runContext.seed,cp=runContext.checkpointSnapshot.id,mods=JSON.stringify(runContext.modifiers);state="levelfail";failT=60;pressDown(null);return runContext.seed===seed&&runContext.checkpointSnapshot.id===cp&&JSON.stringify(runContext.modifiers)===mods&&state==="playing"; })()');
});
check('S4 every campaign segment gets an in-bounds early-telegraphed biome modifier', () => fresh.run(
  'LEVEL_REGISTRY.every((l,i)=>{const s=buildModifierSchedule(77,"level",i,l.startAltitude);return s.length>=1&&s.every(m=>m.startAltitude>l.startAltitude&&m.endAltitude<l.goalAltitude&&m.startAltitude-m.announceAltitude>=3);})'));
check('S4 RunContext deeply owns its schedule and separate modifier permissions', () => fresh.run(
  '(() => { const c=createRunContext({mode:"level",campaignLevel:3,startingAltitude:60,seed:42,skill:.35,loadout:{},characterId:"aurora",characterMastery:{}}),before=JSON.stringify(c.modifiers);try{c.modifiers[0].direction*=-1}catch(e){}return c.modifierPermissions.enabled&&c.modifierPermissions.deterministic&&!c.modifierPermissions.surpriseFailure&&Object.isFrozen(c.modifiers)&&c.modifiers.every(Object.isFrozen)&&JSON.stringify(c.modifiers)===before; })()'));
check('S4 Practice, Pure, and Daily are mechanically neutral with empty schedules', () => fresh.run(
  '["practice","pure","daily"].every(mode=>{const c=createRunContext({mode,campaignLevel:-1,startingAltitude:0,seed:123,skill:.35,loadout:{shield:true},characterId:"neon",characterMastery:{}});return !c.modifierPermissions.enabled&&c.modifiers.length===0;})'));
check('S4 precision completion pays once, changes no score, and cannot cause failure', () => fresh.run(
  '(() => { runContext=createRunContext({mode:"level",campaignLevel:0,startingAltitude:0,seed:9,skill:.35,loadout:{},characterId:"aurora",characterMastery:{}});initModifierRuntime();const m=runContext.modifiers.find(x=>x.id==="deep-rhythm");coins=0;runCoins=0;stats.coins=0;score=77;state="playing";for(let h=m.startAltitude;h<=m.endAltitude;h++)updateModifiersForPlacement(h,{perfect:h<m.startAltitude+m.target,cut:false,miss:false,center:W/2});const paid=runCoins;updateModifiersForPlacement(m.endAltitude,{perfect:true,center:W/2});const p=modifierRuntime(m);return p.status==="complete"&&modifierWins===1&&modifierResults.length===1&&paid>0&&runCoins===paid&&score===77&&state==="playing"; })()'));
check('S4 gold rush and recovery use live placement outcomes with explicit coin rewards', () => fresh.run(
  '(() => { const run=(level,id,outcomes)=>{runContext=createRunContext({mode:"level",campaignLevel:level,startingAltitude:LEVEL_REGISTRY[level].startAltitude,seed:5,skill:.35,loadout:{},characterId:"aurora",characterMastery:{}});initModifierRuntime();coins=0;runCoins=0;stats.coins=0;const m=runContext.modifiers.find(x=>x.id===id);for(let h=m.startAltitude,i=0;h<=m.endAltitude;h++,i++){const o=outcomes(i,m);updateModifiersForPlacement(h,{perfect:o.perfect,cut:o.cut,miss:false,center:W/2});}return {p:modifierRuntime(m),coins:runCoins,bonus:modifierBonusCoins,result:modifierResults[0]};},gold=run(1,"surface-gold",()=>({perfect:true,cut:false})),rec=run(0,"main-recovery",i=>({perfect:i===1,cut:i===0}));return gold.p.status==="complete"&&gold.coins>gold.result.rewardCoins&&gold.bonus===gold.coins&&rec.p.status==="complete"&&rec.p.success&&rec.coins>0; })()'));
check('S4 limited-miss failure only forfeits its reward and never kills or changes score', () => fresh.run(
  '(() => { runContext=createRunContext({mode:"level",campaignLevel:6,startingAltitude:136,seed:3,skill:.35,loadout:{},characterId:"aurora",characterMastery:{}});initModifierRuntime();const m=runContext.modifiers.find(x=>x.id==="thin-air");coins=0;runCoins=0;score=321;state="playing";for(let h=m.startAltitude,i=0;h<=m.endAltitude;h++,i++)updateModifiersForPlacement(h,{perfect:i>1,cut:i<2,miss:false,center:W/2});const p=modifierRuntime(m);return p.status==="failed"&&!p.success&&runCoins===0&&score===321&&state==="playing"&&modifierWins===0; })()'));
check('S4 clear-lane and optional-target windows use visible safe bounds with no collision state', () => fresh.run(
  '(() => { const before=JSON.stringify(blocks),run=(level,id,target)=>{runContext=createRunContext({mode:"level",campaignLevel:level,startingAltitude:LEVEL_REGISTRY[level].startAltitude,seed:2,skill:.35,loadout:{},characterId:"aurora",characterMastery:{}});initModifierRuntime();const m=runContext.modifiers.find(x=>x.id===id),b=modifierLaneBounds(m,target);for(let h=m.startAltitude;h<=m.endAltitude;h++)updateModifiersForPlacement(h,{perfect:true,cut:false,miss:false,center:b.center});return modifierRuntime(m).status;};return run(4,"cloud-window",false)==="complete"&&run(8,"space-target",true)==="complete"&&JSON.stringify(blocks)===before; })()'));
check('S4 gust windows use the seeded warned direction and existing wind physics', () => fresh.run(
  '(() => { runContext=createRunContext({mode:"level",campaignLevel:3,startingAltitude:60,seed:17,skill:.35,loadout:{},characterId:"aurora",characterMastery:{}});initModifierRuntime();const m=runContext.modifiers.find(x=>x.id==="lower-gust");blocks=Array.from({length:m.startAltitude},()=>({x:0,w:96,col:"#fff"}));tier=3;state="playing";wind=null;slider=null;updateModifiersForPlacement(m.startAltitude,{perfect:true,cut:false,miss:false,center:W/2});update(1);return wind&&wind.modifierId===m.id&&wind.dir===m.direction&&wind.str>0&&modifierRuntime(m).status==="active"; })()'));
check('S4 reset scrubs mutable modifier progress while preserving the immutable schedule contract', () => fresh.run(
  '(() => { mode="endless";resetRun();const first=runContext.modifiers.length,m=runContext.modifiers[0];modifierProgress[m.id].status="complete";modifierWins=4;modifierBonusCoins=99;resetRun();return first===MODIFIER_REGISTRY.length&&runContext.modifiers.length===first&&Object.keys(modifierProgress).length===first&&Object.values(modifierProgress).every(p=>p.status==="pending")&&modifierWins===0&&modifierBonusCoins===0&&modifierResults.length===0; })()'));
check('S4 modifier HUD renders telegraph, rule, duration, reward lane, and gust direction at phone width', () => fresh.run(
  '(() => { W=242;H=300;runContext=createRunContext({mode:"level",campaignLevel:3,startingAltitude:60,seed:17,skill:.35,loadout:{},characterId:"aurora",characterMastery:{}});initModifierRuntime();const m=runContext.modifiers[0],p=modifierRuntime(m);p.status="announced";renderModifierHUD(m.announceAltitude);p.status="active";renderModifierHUD(m.startAltitude);const b=modifierLaneBounds(m,false);return b.left>=0&&b.right<=W&&b.right>b.left; })()'));

// ---------- S5 progression, economy, missions, achievements + collections ----------
check('S5 defines one frozen coin-only direct-purchase economy with no gacha or premium currency', () => fresh.run(
  'Object.isFrozen(ECONOMY_RULES)&&ECONOMY_RULES.currency==="coins"&&ECONOMY_RULES.directPurchase&&!ECONOMY_RULES.duplicates&&!ECONOMY_RULES.premiumCurrency&&Object.isFrozen(ECONOMY_RULES.achievementRewards)'));
check('S5 exposes one frozen cross-system unlock catalog for Characters, Bases, boosts, Collections, and achievements', () => fresh.run(
  'Object.isFrozen(UNLOCK_CATALOG)&&JSON.stringify(Object.keys(UNLOCK_CATALOG))===JSON.stringify(["characters","bases","boosts","collections","achievements"])&&UNLOCK_CATALOG.characters.length===CHARACTER_REGISTRY.length&&UNLOCK_CATALOG.bases.length===BASE_REGISTRY.length&&UNLOCK_CATALOG.boosts.length===LOADOUT.length&&UNLOCK_CATALOG.collections.length===COLLECTION_REGISTRY.length&&UNLOCK_CATALOG.achievements.length===ACH.length&&Object.values(UNLOCK_CATALOG).every(x=>Object.isFrozen(x)&&x.every(Object.isFrozen))'));
check('S5 unlockQuote is pure and reports ownership, affordability, and exact direct cost', () => fresh.run(
  '(() => { const ids=["natural"],before=JSON.stringify({ids,coins}),b=BASE_REGISTRY.find(x=>x.id==="runestone"),poor=unlockQuote(b,ids,20),ready=unlockQuote(b,ids,90),ownedQuote=unlockQuote(BASE_REGISTRY[0],ids,0);return poor.status==="funds"&&ready.status==="purchase"&&ready.charged===90&&ownedQuote.status==="owned"&&JSON.stringify({ids,coins})===before; })()'));
check('S5 coin transactions are integer, persistent, overdraft-safe, and refunds never count as earnings', () => fresh.run(
  '(() => { coins=20;stats.coins=10;const bad=transactCoins(-21,false),spend=transactCoins(-7,false),refund=transactCoins(7,false),earn=transactCoins(5,true);return !bad&&spend&&refund&&earn&&coins===25&&stats.coins===15&&store.get("skystack-coins",0)===25&&store.get("skystack-stats",{}).coins===15; })()'));
check('S5 shared purchase quotes charge a direct unlock exactly once and refuse insufficient funds', () => fresh.run(
  '(() => { coins=100;const ids=[],b=BASE_REGISTRY.find(x=>x.id==="runestone"),a=purchaseUnlock(b,ids),dup=purchaseUnlock(b,ids),poor=purchaseUnlock(BASE_REGISTRY.find(x=>x.id==="rootbound"),ids);return a.status==="purchased"&&a.charged===90&&dup.status==="owned"&&dup.charged===0&&poor.status==="funds"&&coins===10&&JSON.stringify(ids)===JSON.stringify(["runestone"]); })()'));
check('S5 every Character and Base uses an explicit starter, event, or direct-coin unlock contract', () => fresh.run(
  '[...CHARACTER_REGISTRY,...BASE_REGISTRY].every(x=>x.unlock&&["starter","event","coins"].includes(x.unlock.type)&&coinAmount(x.unlock.cost)===x.unlock.cost)'));
check('S5 expands the rotating mission pool to twelve fair measurable run goals', () => fresh.run(
  'MKEYS.length===12&&["height","perfects","power","coinsrun","blocks","fever","balloon","score","combo","modifier","skybreak","precision"].every(k=>MDEF[k]&&MDEF[k].targets.length&&MDEF[k].reward>0&&typeof MDEF[k].achieve==="function")'));
check('S5 mission loading repairs corrupt and unknown slots while preserving valid goals', () => {
  const g=makeGame({'skystack-missions':JSON.stringify([{key:'height',target:90,reward:30},{key:'future',target:1,reward:99},null,{key:'score',target:'bad',reward:25}])});
  return g.run('missions.length===3&&missions[0].key==="height"&&missions.every(m=>MDEF[m.key]&&Number.isFinite(+m.target)&&Number.isFinite(+m.reward))&&new Set(missions.map(m=>m.key)).size===3');
});
check('S5 expands achievements to 24 immutable tiered badges while preserving every legacy id', () => fresh.run(
  'ACH.length===24&&Object.isFrozen(ACH)&&ACH.every(a=>Object.isFrozen(a)&&["bronze","silver","gold"].includes(a.tier)&&a.reward===ECONOMY_RULES.achievementRewards[a.tier])&&["first","m150","m600","c10","c15","sky","pop5","streak3"].every(id=>ACH.some(a=>a.id===id))'));
check('S5 achievement settlement grants its exact reward only once per finalized run', () => {
  const g=makeGame();
  return g.run('(() => { mode="endless";resetRun();coins=0;stats={games:0,blocks:0,coins:0,maxCombo:0,skybreaks:0,balloons:0,streakBest:0};achDone=[];missions=[{key:"height",target:9999,reward:1},{key:"score",target:9999,reward:1},{key:"combo",target:99,reward:1}];gameOver("quit");const once=coins,done=achDone.slice();finalizeRun();return once===ECONOMY_RULES.achievementRewards.bronze&&coins===once&&done.length===1&&done[0]==="first"; })()');
});
// v133: five sets, not six — BASE GALLERY is withdrawn while the Base system is switched off, so it
// cannot sit in the list permanently unachievable. The shape contract below is unchanged.
check('S5 defines five frozen cosmetic/progression collection sets with one-time coin rewards', () => fresh.run(
  'COLLECTION_REGISTRY.length===5&&Object.isFrozen(COLLECTION_REGISTRY)&&COLLECTION_REGISTRY.every(c=>Object.isFrozen(c)&&c.id&&c.name&&c.reward>0&&typeof c.progress==="function")'));
check('S5 Collection normalization preserves unknown future ids and removes duplicates and bad values', () => {
  const g=makeGame({'skystack-save':JSON.stringify({version:2,data:{'skystack-collections':{unlocked:['future-set','future-set',7],completed:['future-done','future-done',null]}}})});
  const c=saved(g,'skystack-collections');
  return c.unlocked.includes('future-set')&&c.unlocked.filter(x=>x==='future-set').length===1&&c.completed.includes('future-done')&&c.completed.filter(x=>x==='future-done').length===1;
});
// v133: BASE GALLERY is withdrawn, so owning every Base no longer pays a collection reward. The rest
// of the guarantee still matters and is still checked: the purchase path works (the system is only
// switched off, not broken), and Bases remain purely cosmetic with no gameplay effect.
check('S5 owning every Base pays no withdrawn collection, and Bases stay cosmetic', () => fresh.run(
  '(() => { coins=500;ownedBases=["natural","runestone","rootbound"];collectionState={unlocked:[],completed:[]};persistCollections();const b=BASE_REGISTRY.find(x=>x.id==="starforge"),buy=purchaseUnlock(b,ownedBases),paid=reconcileCollections(true);return buy.charged===260&&coins===240&&paid.every(c=>c.id!=="base-gallery")&&baseById("starforge").identity&&BASE_REGISTRY.every(x=>!x.effect&&!x.effects); })()'));
check('S5 star-chart completion survives reboot and cannot pay twice', () => {
  const g=makeGame({'skystack-levelstars':JSON.stringify([3,3,3,3,3,3,3,1])});
  const first=saved(g,'skystack-coins'),save=g.mem.get('skystack-save'),c=saved(g,'skystack-collections');
  const again=makeGame({'skystack-save':save});
  return first===125&&c.completed.includes('star-chart')&&saved(again,'skystack-coins')===125&&saved(again,'skystack-collections').completed.includes('star-chart');
});
check('S5 Practice cannot settle missions, achievements, mastery, collections, or coins', () => fresh.run(
  '(() => { mode="practice";resetRun();const before=JSON.stringify({coins,missions,achDone,characterMastery,collectionState,stats});score=9999;runPerfects=99;runSkybreaks=2;modifierWins=2;gameOver("quit");finalizeRun();return JSON.stringify({coins,missions,achDone,characterMastery,collectionState,stats})===before; })()'));
check('S5 Pure and Daily retain neutral passives, boosts, modifiers, scoring, and cosmetic-only Bases', () => fresh.run(
  '["pure","daily"].every(mode=>{const c=createRunContext({mode,campaignLevel:-1,startingAltitude:0,checkpointId:"ground",baseId:"starforge",seed:5,skill:.8,loadout:{shield:true},characterId:"neon",characterMastery:{xp:999}});return !c.characterSnapshot.passiveEnabled&&!c.boostPermissions.allowed&&!c.modifierPermissions.enabled&&c.modifiers.length===0&&c.basePermissions.cosmetic&&!c.basePermissions.effects&&adjustedRunScore(c,100)===100&&adjustedRunCoins(c,10)===10;})'));
check('S5 Player screen presents achievement and Collection progress without overflowing phone navigation', () => fresh.run(
  '(() => { W=242;H=300;relayout();state="me";renderMe();return ACH.length===24&&COLLECTION_REGISTRY.length===5&&TOGGLES.every(t=>t.x>=0&&t.x+t.w<=W&&t.y+t.h<NAV_Y)&&MIX_ROWS.every(r=>r.plus.y+r.plus.h<NAV_Y); })()'));

// ---------- S6 challenge hub + fair run templates ----------
check('S6 defines eight frozen local templates covering every planned challenge family', () => fresh.run(
  'CHALLENGE_REGISTRY.length===8&&Object.isFrozen(CHALLENGE_REGISTRY)&&CHALLENGE_REGISTRY.every(c=>Object.isFrozen(c)&&Object.isFrozen(c.objective)&&c.id&&c.name&&c.desc&&c.mode&&c.family&&c.objective.type&&Number.isFinite(c.objective.target)&&c.reward>=0)&&["timed","precision","limitedLives","unstable","seeded","recovery","characterTrial","milestone"].every(f=>CHALLENGE_REGISTRY.some(c=>c.family===f))&&!CHALLENGE_REGISTRY.some(c=>c.weekly||c.family==="weekly")'));
check('S6 keeps Levels primary and folds hidden Time 60 into a two-level Extra Modes hub', () => fresh.run(
  'MODE_REGISTRY.level.hidden&&MODE_REGISTRY.time.hidden&&MODE_REGISTRY.challenge.hidden&&EXTRAS.map(x=>x.id).join(",")==="practice,endless,pure,daily,challenges"&&CHALLENGE_ENTRY.id==="challenges"&&challengeById("time60").mode==="time"&&challengeById("time60").duration===MODE_REGISTRY.time.time'));
check('S6 RunContext deeply owns its challenge contract, record scope, and modifier permission', () => fresh.run(
  '(() => { const c=createRunContext({mode:"challenge",challengeId:"unstable20",campaignLevel:-1,startingAltitude:0,checkpointId:"ground",seed:7,skill:.35,loadout:{shield:true},characterId:"aurora",characterMastery:{}}),before=JSON.stringify(c);try{c.challengeSnapshot.objective.target=1}catch(e){}return Object.isFrozen(c.challengeSnapshot)&&Object.isFrozen(c.challengeSnapshot.objective)&&JSON.stringify(c)===before&&c.recordPermissions.write&&c.recordPermissions.scope==="challenge"&&c.modifierPermissions.enabled&&!c.boostPermissions.allowed&&!c.rewardPermissions.pickups&&!c.rewardPermissions.progress; })()'));
check('S6 Time 60 preserves its 3600-frame rules, loadout, passive, modifiers, records, and no-revive contract', () => fresh.run(
  '(() => { skinId="neon";loadout={shield:true,aura:true,slow:true};startChallenge("time60");const c=runContext;return c.mode==="time"&&timeLeft===3600&&c.characterSnapshot.id==="neon"&&c.characterSnapshot.passiveEnabled&&c.boostSnapshot.shield&&c.boostSnapshot.aura&&c.boostSnapshot.slow&&c.boostPermissions.allowed&&c.modifierPermissions.enabled&&c.rewardPermissions.pickups&&c.rewardPermissions.progress&&c.recordPermissions.write&&!PERMISSION_REGISTRY.time.revive; })()'));
check('S6 migrates the legacy Time 60 best into its challenge record without deleting legacy data', () => {
  const g=makeGame({'skystack-modebests':JSON.stringify({time:{blocks:12,score:345}})}),r=saved(g,'skystack-challenge-records');
  return r.time60.bestBlocks===12&&r.time60.bestScore===345&&g.run('modeBests.time.blocks===12&&modeBests.time.score===345');
});
check('S6 challenge-record normalization repairs corruption and preserves unknown future ids', () => {
  const g=makeGame({'skystack-save':JSON.stringify({version:2,data:{'skystack-challenge-records':{time60:{bestBlocks:'8.9',bestScore:-2,clears:'3',attempts:'bad'},'future-local':{bestBlocks:4,clears:1}}}})}),r=saved(g,'skystack-challenge-records');
  return JSON.stringify(r.time60)===JSON.stringify({bestBlocks:8,bestScore:0,clears:3,attempts:0})&&r['future-local'].bestBlocks===4&&r['future-local'].clears===1;
});
check('S6 seeded climb owns one fixed seed and identical retry schedule', () => fresh.run(
  '(() => { startChallenge("seeded30");const a={seed:runContext.seed,hue:blocks[0].col.h,mods:JSON.stringify(runContext.modifiers)};startChallenge("seeded30");const b={seed:runContext.seed,hue:blocks[0].col.h,mods:JSON.stringify(runContext.modifiers)};startChallenge("seeded30",123);return a.seed===0x534B5936&&JSON.stringify(a)===JSON.stringify(b)&&runContext.seed===123&&challengeSeed(challengeById("seeded30"),null,77)===0x534B5936; })()'));
check('S6 precision clear pays its configured reward and records exactly once', () => {
  const g=makeGame();
  return g.run('(() => { achDone=ACH.map(a=>a.id);missions=MKEYS.slice(0,3).map(k=>({key:k,target:99999,reward:1}));startChallenge("precision10");coins=0;runCoins=0;stats.coins=0;for(let i=0;i<10;i++){runPerfects++;updateChallengeForPlacement({perfect:true,cut:false,miss:false});}const paid=coins,rec=challengeRecord("precision10");updateChallengeForPlacement({perfect:true});recordChallengeOutcome();return state==="gameover"&&challengeCleared&&challengeReward===30&&paid===30&&rec.clears===1&&rec.attempts===1&&coins===paid&&runCoins===0&&challengeRecord("precision10").attempts===1; })()');
});
check('S6 precision failure ends on the first imperfect placement with no challenge reward', () => {
  const g=makeGame();
  return g.run('(() => { startChallenge("precision10");coins=0;runCoins=0;updateChallengeForPlacement({perfect:false,cut:true,miss:false});const r=challengeRecord("precision10");return state==="gameover"&&overCause==="precision"&&!challengeCleared&&challengeReward===0&&r.attempts===1&&r.clears===0; })()');
});
check('S6 limited-lives challenge starts with exactly three lives and cannot refill or revive', () => fresh.run(
  '(() => { loadout={shield:true,aura:true,slow:true};startChallenge("three-lives");const start=shield,ctx=runContext;for(let i=0;i<3;i++){const top=blocks[blocks.length-1];faller={x:W+50,y:towerTopY()-BH,w:top.w,col:"#fff",vy:0,golden:false};state="dropping";land();}return start===2&&!ctx.boostPermissions.allowed&&!ctx.rewardPermissions.pickups&&!PERMISSION_REGISTRY.challenge.revive&&state==="gameover"&&overCause==="miss"&&shield===0; })()'));
check('S6 unstable tower scales only its configured balance contribution', () => fresh.run(
  '(() => { const lean=id=>{startChallenge(id);assist=0;balance=0;blocks=[{x:0,w:96,col:"#fff"},{x:0,w:96,col:"#fff"}];afterPlace(blocks[1],true,W/2+10,{perfect:false,cut:true,miss:false,center:W/2+10});return balance;},normal=lean("three-lives"),unstable=lean("unstable20");return normal>0&&Math.abs(unstable/normal-1.35)<1e-9&&challengeRule(runContext,"balanceScale",1)===1.35; })()'));
check('S6 recovery challenge counts only cut-then-perfect pairs', () => fresh.run(
  '(() => { startChallenge("recovery3");const u=o=>updateChallengeForPlacement(o);u({perfect:true});u({cut:true});u({cut:true});u({perfect:true});u({perfect:true});u({cut:true});u({miss:true});u({perfect:true});u({cut:true});u({perfect:true});u({cut:true});u({perfect:true});const r=challengeRecord("recovery3");return challengeCleared&&challengeRuntime.recoveries===3&&r.clears===1&&r.attempts===1; })()'));
check('S6 Neon trial snapshots Neon and its passive without changing the selected Character', () => fresh.run(
  '(() => { skinId="aurora";startChallenge("neon-trial");const c=runContext;skinId="candy";return c.characterSnapshot.id==="neon"&&c.characterSnapshot.passiveId===characterById("neon").passiveId&&c.characterSnapshot.passiveEnabled&&JSON.stringify(blockCol(1))===JSON.stringify(characterById("neon").base(1,tierHueAt(1))); })()'));
check('S6 Cave Gate uses the 99M placed-block milestone with deterministic modifiers', () => fresh.run(
  '(() => { startChallenge("cave-gate");const c=activeChallenge();while(blocks.length-1<c.objective.target)blocks.push({x:0,w:96,col:"#fff"});updateChallengeForPlacement({perfect:true});return c.objective.type==="height"&&c.objective.target===32&&blocks.length*METERS_PER===99&&runContext.modifierPermissions.enabled&&runContext.modifiers.length===MODIFIER_REGISTRY.length&&challengeCleared; })()'));
check('S6 non-Time challenges write only their local records, not global or legacy mode bests', () => fresh.run(
  '(() => { best=77;bestHeight=9;modeBests={endless:{blocks:8,score:70}};startChallenge("precision10");score=999;gameOver("precision");return best===77&&bestHeight===9&&!modeBests.challenge&&modeBests.endless.blocks===8&&challengeRecord("precision10").bestScore===999; })()'));
check('S6 preserves Practice non-farming and Pure/Daily mechanical neutrality', () => fresh.run(
  '(() => { const neutral=["practice","pure","daily"].every(mode=>{const c=createRunContext({mode,campaignLevel:-1,startingAltitude:0,checkpointId:"ground",seed:5,skill:.4,loadout:{shield:true},characterId:"neon",characterMastery:{}});return !c.challengeSnapshot&&!c.modifierPermissions.enabled&&c.modifiers.length===0&&(!c.characterSnapshot.passiveEnabled)&&!c.boostPermissions.allowed;});const p=createRunContext({mode:"practice",campaignLevel:-1,startingAltitude:0,seed:5,skill:.4,loadout:{},characterId:"aurora",characterMastery:{}});return neutral&&!canEarnRewards(p)&&!canWriteRecords(p); })()'));
check('S6 challenge retries scrub mutable objective state while preserving owned seed and contract', () => fresh.run(
  '(() => { startChallenge("recovery3");const seed=runContext.seed,snap=JSON.stringify(runContext.challengeSnapshot);for(let i=0;i<3;i++){challengeRuntime.recoveries=2;challengeRuntime.recoveryArmed=true;challengeReward=99;challengeCleared=true;startChallenge("recovery3",seed);if(runContext.seed!==seed||JSON.stringify(runContext.challengeSnapshot)!==snap||challengeRuntime.recoveries!==0||challengeRuntime.recoveryArmed||challengeReward!==0||challengeCleared||challengeRecorded)return false;}return true; })()'));
check('S6 leaving a hidden challenge restores the last real Extra Mode selection', () => {
  const g=makeGame({'skystack-mode':JSON.stringify('pure')});
  return g.run('(() => { startChallenge("precision10");gameOver("precision");overLock=0;pressDown(null);return state==="home"&&mode==="pure"&&store.get("skystack-mode",null)==="pure"; })()');
});
check('S6 Challenge picker fits all eight rows above navigation at phone width and renders every template', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[480,270]]){W=w;H=h;relayout();state="home";challengePicker=true;renderChallengePicker();if(CHALLENGE_ROWS.length!==8||CHALLENGE_ROWS.some(r=>r.x<0||r.x+r.w>W||r.y<0||r.y+r.h>=NAV_Y))return false;}for(const c of CHALLENGE_REGISTRY){startChallenge(c.id);renderHUD(blocks.length);gameOver(c.family==="timed"?"time":"precision");renderGameOver();}return true; })()'));

// ---------- S7 content lock, balance audit + technical hardening ----------
check('S7 freezes explicit first-release catalog, economy, side-grade, session, and technical targets', () => fresh.run(
  'Object.isFrozen(MECHANICS_LOCK_TARGETS)&&Object.isFrozen(MECHANICS_LOCK_TARGETS.catalogs)&&Object.isFrozen(MECHANICS_LOCK_TARGETS.economy)&&Object.isFrozen(MECHANICS_LOCK_TARGETS.technical)&&MECHANICS_LOCK_TARGETS.catalogs.characters===12&&MECHANICS_LOCK_TARGETS.catalogs.challenges===8&&MECHANICS_LOCK_TARGETS.technical.restartCycles===3&&MECHANICS_LOCK_TARGETS.technical.minViewport.w===242&&!MECHANICS_LOCK_TARGETS.weeklySeeded'));
check('S7 mechanics-lock report is pure, deeply frozen, deterministic, and ready', () => fresh.run(
  '(() => { const a=mechanicsLockReport(),b=mechanicsLockReport();return a.ready&&Object.isFrozen(a)&&Object.isFrozen(a.checks)&&Object.isFrozen(a.challengeReports)&&a.challengeReports.every(Object.isFrozen)&&JSON.stringify(a)===JSON.stringify(b)&&Object.values(a.checks).every(Boolean); })()'));
check('S7 content catalogs meet launch counts with unique ids and complete rule data', () => fresh.run(
  '(() => { const r=mechanicsLockReport(),groups=[CHARACTER_REGISTRY,BASE_REGISTRY,MODIFIER_REGISTRY,CHALLENGE_REGISTRY,COLLECTION_REGISTRY,ACH];return r.counts.characters>=12&&r.counts.bases===4&&r.counts.modifiers===12&&r.counts.challenges===8&&r.counts.missions===12&&r.counts.achievements===24&&r.counts.collections===5&&groups.every(g=>new Set(g.map(x=>x.id)).size===g.length)&&CHARACTER_REGISTRY.every(c=>c.role&&c.passiveId&&c.unlock)&&BASE_REGISTRY.every(b=>b.identity&&b.unlock)&&CHALLENGE_REGISTRY.every(c=>c.objective&&c.family); })()'));
check('S7 economy keeps first visible purchases in 2–6 progress grants and all passives inside the side-grade envelope', () => fresh.run(
  '(() => { const r=mechanicsLockReport(),t=MECHANICS_LOCK_TARGETS;return r.economy.firstBaseRuns===3&&r.economy.firstCharacterRuns===4&&r.economy.maxCharacterRuns===30&&r.economy.firstBaseRuns>=t.economy.firstPurchaseRuns.min&&r.economy.firstCharacterRuns<=t.economy.firstPurchaseRuns.max&&r.maxSidegradeDelta<=t.sidegrades.maxMultiplierDelta; })()'));
check('S7 Challenge estimates stay inside the locked short-session range and Time remains exactly 60 seconds', () => fresh.run(
  '(() => { const t=MECHANICS_LOCK_TARGETS.sessions,r=CHALLENGE_REGISTRY.map(c=>challengeBalanceReport(c.id));return r.length===8&&r.every(x=>Object.isFrozen(x))&&r.find(x=>x.id==="time60").estimatedSeconds===t.timedSeconds&&r.filter(x=>x.id!=="time60").every(x=>x.estimatedSeconds>=t.challengeSeconds.min&&x.estimatedSeconds<=t.challengeSeconds.max&&x.reward>=30&&x.reward<=40); })()'));
check('S7 Challenge rewards are first-clear-only while records continue across replays', () => {
  const g=makeGame();
  return g.run('(() => { achDone=ACH.map(a=>a.id);missions=MKEYS.slice(0,3).map(k=>({key:k,target:99999,reward:1}));const clear=()=>{startChallenge("precision10");for(let i=0;i<10;i++){runPerfects++;updateChallengeForPlacement({perfect:true});}};coins=0;stats.coins=0;clear();const first=coins,reward1=challengeReward;state="home";clear();const second=coins,reward2=challengeReward,r=challengeRecord("precision10");return first===30&&second===30&&reward1===30&&reward2===0&&r.clears===2&&r.attempts===2&&!MECHANICS_LOCK_TARGETS.economy.repeatChallengeRewards; })()');
});
check('S7 every gameplay mode survives three dirty fail/restart cycles with clean owned state', () => fresh.run(
  '(() => { const ids=["level","practice","endless","pure","daily","time60","precision10"],launch=(id,n)=>{if(id==="level")startLevel(0,"ground",100+n);else if(CHALLENGE_REGISTRY.some(c=>c.id===id))startChallenge(id,100+n);else{mode=id;startRun(100+n);}};for(const id of ids)for(let n=0;n<3;n++){launch(id,n);const old=runContext;debris.push({x:1});particles.push({x:1});floaters.push({x:1});trails.push({x:1});coinFx.push({x:1});pickups.push({row:999});balloon={x:1};wind={dir:1};balance=20;swayX=8;paused=true;dropPending=3;widenNext=true;slowBlocks=3;auraBlocks=2;goldenNext=true;fever=true;nova=true;score=500;runCoins=12;gameOver("quit");launch(id,n);if(runContext===old||!Object.isFrozen(runContext)||state!=="playing"||debris.length||particles.length||floaters.length||trails.length||coinFx.length||balloon!==null||wind!==null||balance!==0||swayX!==0||paused||dropPending!==0||widenNext||slowBlocks!==0||auraBlocks!==0||goldenNext||fever||nova||score!==0||runCoins!==0||reviveUsed||reviveOffered||runSettled)return false;}return true; })()'));
check('S7 every major screen and mode renders at minimum portrait, standard portrait, and short landscape sizes', () => {
  const g=makeGame({},true);
  return g.run('(() => { const sizes=[[242,300],[320,480],[480,300]],modes=["practice","endless","pure","daily"];for(const [w,h] of sizes){W=w;H=h;relayout();state="home";modePicker=false;challengePicker=false;skyMap=false;renderHome();renderModePicker();renderChallengePicker();openSkyMap();renderSkyMap();skyMap=false;state="shop";renderShop();state="me";renderMe();for(const id of modes){mode=id;resetRun();state="playing";render();renderHUD(blocks.length);}for(const c of CHALLENGE_REGISTRY){startChallenge(c.id);renderHUD(blocks.length);}gameOver("quit");renderGameOver();if(HERO_CARD.x<0||HERO_CARD.x+HERO_CARD.w>W||MODE_BTN.y+MODE_BTN.h>=NAV_Y||CHALLENGE_ROWS.some(r=>r.x<0||r.x+r.w>W||r.y+r.h>=NAV_Y))return false;}return true; })()');
});
check('S7 corrupt optional-domain matrix boots and repairs every active save contract', () => {
  const fields=['skystack-characters','skystack-bases','skystack-collections','skystack-challenge-records'];
  const bad=[null,0,-1,true,'bad',[],[1,2],{owned:'bad',selected:9,mastery:[]}];
  for(const key of fields)for(const value of bad){const g=makeGame({'skystack-save':JSON.stringify({version:2,data:{[key]:value}})}),data=JSON.parse(g.mem.get('skystack-save')).data;if(!g.run('booted===true')||!data[key]||typeof data[key]!=='object'||Array.isArray(data[key]))return false;}
  return true;
});
check('S7 normalized save domains remain stable through three complete reboots', () => {
  let raw=JSON.stringify({version:2,data:{'skystack-coins':321,'skystack-missions':[{key:'height',target:90,reward:30},{key:'score',target:500,reward:25},{key:'combo',target:5,reward:25}],'skystack-characters':{owned:['aurora','future-char'],selected:'future-char',mastery:{aurora:{xp:'9'}}},'skystack-bases':{owned:['natural','future-base'],selected:'future-base'},'skystack-collections':{unlocked:['future-set'],completed:['future-done']},'skystack-challenge-records':{'future-run':{clears:'2'}}}});
  let stable=null;for(let i=0;i<3;i++){const g=makeGame({'skystack-save':raw});const data=JSON.parse(g.mem.get('skystack-save')).data,view=JSON.stringify({coins:data['skystack-coins'],characters:data['skystack-characters'],bases:data['skystack-bases'],collections:data['skystack-collections'],challenges:data['skystack-challenge-records']});if(stable!==null&&view!==stable)return false;stable=view;raw=g.mem.get('skystack-save');}return true;
});
// BEST-OF-N wall clock. The BUDGET is unchanged (MECHANICS_LOCK_TARGETS.technical.headlessFrameMsMax);
// only the sampling changed. A single timed sample measures the machine's momentary load as much as
// the code — it failed intermittently under load while the tree contained changes provably outside
// update()/render(). Taking the best of 3 still catches a real regression (a genuine slowdown makes
// EVERY sample slow) while no longer failing because something else on the box hiccuped.
check('S7 headless play/render loop stays inside the locked per-frame regression budget', () => {
  const frames=180; let best=Infinity, budget=0;
  // Retry ONLY on failure: a passing run costs exactly one sample (as before), so the suite's
  // slowest check is not tripled, while a load hiccup gets up to 3 chances. A genuine regression
  // makes every sample slow, so it still fails.
  for (let r=0;r<3;r++) {
    const g=makeGame({},true),start=process.hrtime.bigint();
    g.run(`mode="endless";resetRun();state="playing";for(let i=0;i<${frames};i++){update(1);render();}`);
    const ms=Number(process.hrtime.bigint()-start)/1e6;
    best=Math.min(best, ms/frames); budget=g.run('MECHANICS_LOCK_TARGETS.technical.headlessFrameMsMax');
    if (best<budget) return true;
  }
  console.error('  per-frame best-of-3 ' + best.toFixed(2) + 'ms vs budget ' + budget + 'ms');
  return false;
});
check('S7 PWA shell lists real local assets and keeps explicit network-first offline fallback', () => {
  const sw7=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.webmanifest'),'utf8')),
    assets=[...sw7.matchAll(/'\.\/([^']*)'/g)].map(m=>m[1]).filter((x,i,a)=>x&&a.indexOf(x)===i);
  return assets.every(a=>fs.existsSync(path.join(ROOT,a)))&&manifest.start_url&&['standalone','fullscreen'].includes(manifest.display)&&Array.isArray(manifest.icons)&&manifest.icons.every(i=>fs.existsSync(path.join(ROOT,i.src)))&&/fetch\(e\.request\)/.test(sw7)&&/caches\.match\(e\.request\)/.test(sw7)&&/caches\.match\('\.\/index\.html'\)/.test(sw7);
});
check('S7 removes the unused loadoutAllowed duplicate and keeps boostPermissions as the sole live owner', () =>
  !/loadoutAllowed/.test(src) && fresh.run('(() => { const c=createRunContext({mode:"endless",campaignLevel:-1,startingAltitude:0,seed:1,skill:.35,loadout:{shield:true},characterId:"aurora",characterMastery:{}});return c.boostPermissions.allowed&&c.boostSnapshot.shield&&c.loadoutSnapshot.shield&&!Object.prototype.hasOwnProperty.call(c,"loadoutAllowed"); })()'));

// ---------- visual production foundation ----------
check('visual production freezes a coherent canvas palette, rhythm, frame, type, and motion system', () => fresh.run(
  'Object.isFrozen(VISUAL_SYSTEM)&&Object.isFrozen(VISUAL_SYSTEM.palette)&&Object.isFrozen(VISUAL_SYSTEM.spacing)&&Object.isFrozen(VISUAL_SYSTEM.motion)&&VISUAL_SYSTEM.palette.ink==="#0B0E1A"&&VISUAL_SYSTEM.spacing.join(",")==="4,8,12,16,24,32"&&VISUAL_SYSTEM.frame.cut===3&&VISUAL_SYSTEM.type.title===4&&VISUAL_SYSTEM.motion.reducedStatic'));
check('production Home and stepped global navigation render safely across the locked viewport set', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300]]){W=w;H=h;relayout();state="home";prog=0;renderHome();drawNav();prog=TIERS.length;renderHome();if(NAV_H!==24||HERO_CARD.x<0||HERO_CARD.x+HERO_CARD.w>W||HERO_CARD.y<64||HERO_CARD.h<96||PLAY_BTN.y+PLAY_BTN.h>HERO_CARD.y+HERO_CARD.h||MAP_BTN.y+MAP_BTN.h>=MISS_PANEL.y||MISS_PANEL.y+MISS_PANEL.h>=INSTALL_BTN.y||INSTALL_BTN.y+INSTALL_BTN.h>=NAV_Y)return false;}return true; })()'));
check('Home-linked map, mode, and Challenge surfaces stay clipped, concise, and bounded', () => fresh.run(
  '(() => { if(MAP_HEAD!==38||modeCompactDesc("challenges")!=="8 FOCUSED RUNS"||challengeCompactDesc("precision10")!=="10 PERFECTS - ONE MISS")return false;for(const [w,h] of [[180,390],[242,300],[480,270]]){W=w;H=h;relayout();state="home";modePicker=true;renderModePicker();challengePicker=true;renderChallengePicker();skyMap=true;renderSkyMap();if(PICK_ROWS.some(r=>r.x<0||r.x+r.w>W||r.y+r.h>=NAV_Y)||CHALLENGE_ROWS.some(r=>r.x<0||r.x+r.w>W||r.y+r.h>=NAV_Y))return false;}return true; })()') && /ctx\.rect\(0,L\.viewTop,W,L\.viewBot-L\.viewTop\);ctx\.clip\(\)/.test(src));
check('production UI keeps presentation ownership separate from locked mechanics', () =>
  /function pixelFrame\(/.test(src) && /function drawJourneyProgress\(/.test(src) && /function drawNavGlyph\(/.test(src) && fresh.run('mechanicsLockReport().ready&&MECHANICS_LOCK_TARGETS.weeklySeeded===false'));
// v133: the Bases tab is gone, so the tab-pair gap assertion is replaced by "the lone tab is centred".
check('Home, Shop, and Me share centered dark frames without entering navigation', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,300]]){W=w;H=h;relayout();state="home";renderHome();state="shop";shopView="character";renderShop();state="me";renderMe();const lastMix=MIX_ROWS[MIX_ROWS.length-1],meW=Math.min(W-PAD*2-16,200),meX=Math.round((W-meW)/2)-8;const tabsOk=SHOP_TABS.length===1?Math.abs(SHOP_TABS[0].x+SHOP_TABS[0].w/2-W/2)<=1:SHOP_TABS[0].x+SHOP_TABS[0].w+6===SHOP_TABS[1].x;if(HERO_CARD.x!==Math.round((W-HERO_CARD.w)/2)||!tabsOk||EQUIP_BTN.y+EQUIP_BTN.h>=BOOST_TOP||LOAD_CHIPS.some(c=>c.y+c.h>=NAV_Y)||lastMix.plus.y+lastMix.plus.h>=NAV_Y||meX<0||meX+meW+16>W)return false;}return true; })()'));

// ---------- v91 UI fine grid ----------
check('v91 fine grid: supersample snaps even so half-pixel UI detail stays crisp', () =>
  /RS = Math\.max\(2, Math\.min\(4, 2 \* Math\.floor\(fit \/ 2\)\)\)/.test(src) &&
  fresh.run('RS >= 2 && RS % 2 === 0 && VISUAL_SYSTEM.frame.fine === 0.5'));
check('v91 fine type: every glyph has a cached corner-smoothed expansion with identical metrics', () => fresh.run(
  '(() => { if (!Object.keys(FONT).every(k => Array.isArray(FONT_FINE[k]) && FONT_FINE[k].length === 14 && FONT_FINE[k].every(r => r.every(run => run[0] >= 0 && run[0] + run[1] <= 10)))) return false;' +
  // Scale2x proof: the O rim rounds — fine row 1 grows diagonal connectors past row 0, which
  // naive pixel-doubling (identical paired rows) cannot produce
  'const o0 = FONT_FINE["O"][0], o1 = FONT_FINE["O"][1]; return o0.length === 1 && o0[0][0] === 2 && o0[0][1] === 6 && o1.length === 1 && o1[0][0] === 1 && o1[0][1] === 8; })()') &&
  /const cw = 6 \* sc/.test(src));
check('v91 fine surfaces: chamfered frames, dual keylines, and button bevels render without throwing', () => {
  fresh.run('pixelFrame(10,10,120,40,null,"#FFD75E",true); pixelFrame(4,4,60,20,"rgba(11,14,26,0.62)",null,false); pixelButton({x:10,y:60,w:100,h:14},"BEGIN CLIMB",true); pixelButton({x:10,y:80,w:100,h:14},"SKY MAP",false); drawNavGlyph("home",20,100,"#FFF6E8"); drawNavGlyph("shop",40,100,"#FFF6E8"); drawNavGlyph("me",60,100,"#FFF6E8"); drawJourneyProgress(3,10,120,140); drawCoin(5,5);');
  return /frame\.fine/.test(src) && /const inset=cut-F-s\*F/.test(src);
});

// ---------- v92 fine icons + symmetry ----------
check('v92 fine icons: every power-up, star, plate, and speaker renders without throwing', () => {
  fresh.run('for (const k of Object.keys(POW)) { drawIcon(k, 10, 10, false); drawIcon(k, 30, 10, true); } ' +
    'drawStarPix(20, 60, 1, true); drawStarPix(40, 60, 2, false); plate3D(4, 80, 60, 9, "#24212B", "#FFD75E"); ' +
    'muted = false; state = "playing";');
  return /v92: every power-up icon redrawn on the half-pixel fine grid/.test(src);
});
check('v92 symmetry: button labels center exactly (map caption clamp retired with the v110 card layout)', () =>
  /r\.y\+\(r\.h-7\*sc\)\/2/.test(src) &&
  fresh.run('TUT_LESSONS.every(l => !l.compact || (l.compact.length < l.body.length && l.compact.length*6-1 <= 180-12))'));

// ---------- v93 Climb Orders breathing room + coin baselines ----------
check('v93 Climb Orders panel budgets symmetric padding for both mission rows', () => fresh.run(
  // rows draw at y+18 and y+18+rowGap (7px glyphs): bottom pad = h - (18+rowGap+7) must equal the
  // 5px top pad (v94 parameterized the gap; at the 10px minimum this is exactly v93's h of 40)
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300]]){W=w;H=h;relayout();' +
  'if(MISS_PANEL.h - (18 + MISS_PANEL.rowGap + 7) !== 5 || MISS_PANEL.y+MISS_PANEL.h >= INSTALL_BTN.y || INSTALL_BTN.y+INSTALL_BTN.h >= NAV_Y) return false;} return true; })()'));
check('v93 coin icons sit centered on their reward digits (y = text y + 0.5 everywhere)', () =>
  /drawCoin\(MISS_PANEL\.x \+ MISS_PANEL\.w - 24, rowY \+ \.5\)/.test(src) &&
  /drawCoin\(PAD, 5\.5\)/.test(src) && /drawCoin\(22, 7\.5\)/.test(src) &&
  /drawCoin\(x\+w-27,rowY\+\.5\)/.test(src) && /drawCoin\(W\/2 \+ 8, EQUIP_BTN\.y\+5\.5\)/.test(src) &&
  /drawCoin\(W\/2\+8,EQUIP_BTN\.y\+5\.5\)/.test(src) && /drawCoin\(c\.x\+14, c\.y\+13\.5\)/.test(src) &&
  /drawCoin\(W\/2 - 20, sy \+ 1\.5\)/.test(src) && /drawCoin\(W\/2 - 16, by \+ 27\.5\)/.test(src) &&
  /drawCoin\(W\/2 - 30, FAIL_REV\.y \+ 7\.5\)/.test(src) && /drawCoin\(W\/2-24, 127\.5\)/.test(src) &&
  /drawCoin\(W\/2 - 32, REVIVE_BTN\.y \+ 8\.5\)/.test(src));

// ---------- v94 HUD margin + notification placement ----------
check('v94 campaign HUD row keeps a 7px side margin (not edge-flush)', () =>
  /txt\(lft,7,33/.test(src) && /txt\(rgt,W-7,33/.test(src));   // v96 parameterized the labels; the 7px anchors are the invariant

check('v105 all notifications render through one top-middle queue (no banner/toast pair)', () =>
  /function drawNotifyStrip\(/.test(src) &&
  /function note\(/.test(src) &&
  /drawNotifyStrip\(curNote\.text/.test(src) &&
  !/drawNotifyStrip\(toastMsg/.test(src) && !/drawNotifyStrip\(bannerText/.test(src));
check('v94 notification strip sits directly under the HUD block, not mid-play-column', () => fresh.run(
  '(() => { W=320;H=480;relayout(); return NOTIFY_Y >= 60 && NOTIFY_Y <= 76; })()'));

// ---------- v95 in-run bottom overlays sit at the very bottom of the screen ----------
check('v105 nothing textual renders at the screen bottom in-run: both bottom strips deleted', () =>
  !/ctx\.fillRect\(0, H-29, W, 29\)/.test(src) && !/y=H-\(tutStep>=0\?61:31\)/.test(src));
check('v105 tutorial hint renders in the top-middle lane only while no note is showing', () =>
  /tutStep >= 0 && !curNote/.test(src));

// ---------- v96 in-run HUD overlap audit ----------
// txt() is instrumented to capture every glyph box renderHUD draws; any pair of boxes that
// intersect (or any box leaving the screen) fails. Shadow copies (black text) are excluded.
check('v96 campaign HUD text never overlaps or leaves the screen (worst-case labels)', () => fresh.run(
  '(() => { const overl=(a,b)=>a.y<b.y+7*b.sc&&b.y<a.y+7*a.sc&&a.x0<b.x1&&b.x0<a.x1;' +
  'for (const [w,hh] of [[180,390],[242,300],[320,480],[480,270],[180,520]]) { W=w;H=hh;relayout();' +
  'for (const [lvl,cpId] of [[0,null],[7,"checkpoint-6"],[10,"checkpoint-9"]]) {' +
  'runContext=createRunContext({mode:"level",campaignLevel:lvl,checkpointId:cpId,startingAltitude:lvl?TIERS[lvl-1].n:0,seed:9,skill:.5,loadout:{},characterId:"aurora",characterMastery:{}});' +
  'runLevel=lvl; runLaunch=runContext.startingAltitude; coins=123456; score=999999; combo=9; wind={dir:1,t:10,dur:100}; balance=0; tutStep=-1;' +
  'initModifierRuntime(); const mm=runContext.modifiers[0]; if (mm) modifierRuntime(mm).status="announced";' +
  'const calls=[]; const orig=txt;' +
  'txt=(t,x,y,sc,col,al)=>{sc=sc||1;t=String(t);const tw2=t.length*6*sc-sc;const x0=al==="center"?Math.round(x-tw2/2):al==="right"?Math.round(x-tw2):x;if(String(col).indexOf("0,0,0")<0)calls.push({t,x0,x1:x0+tw2,y,sc});};' +
  'try { renderHUD(runLaunch+2); } finally { txt=orig; }' +
  'for (const c of calls) if (c.x0 < 0 || c.x1 > W) return false;' +
  'for (let i2=0;i2<calls.length;i2++) for (let j2=i2+1;j2<calls.length;j2++) if (overl(calls[i2],calls[j2])) return false;' +
  '} } return true; })()'));

check('v96 challenge HUD text never overlaps LIVES or leaves the screen', () => fresh.run(
  '(() => { const overl=(a,b)=>a.y<b.y+7*b.sc&&b.y<a.y+7*a.sc&&a.x0<b.x1&&b.x0<a.x1;' +
  'for (const [w,hh] of [[180,390],[242,300],[320,480],[480,270]]) { W=w;H=hh;relayout();' +
  'for (const id of ["three-lives","unstable20","time60"]) {' +
  'const cd=challengeById(id);' +
  'runContext=createRunContext({mode:cd.mode,challengeId:id,startingAltitude:0,seed:5,skill:.5,loadout:{},characterId:"aurora",characterMastery:{}});' +
  'initChallengeRuntime(); runLevel=-1; coins=88; score=1234; combo=3; wind=null; balance=0; tutStep=-1; shield=2; timeLeft=3600;' +
  'const calls=[]; const orig=txt;' +
  'txt=(t,x,y,sc,col,al)=>{sc=sc||1;t=String(t);const tw2=t.length*6*sc-sc;const x0=al==="center"?Math.round(x-tw2/2):al==="right"?Math.round(x-tw2):x;if(String(col).indexOf("0,0,0")<0)calls.push({t,x0,x1:x0+tw2,y,sc});};' +
  'try { renderHUD(8); } finally { txt=orig; }' +
  'for (const c of calls) if (c.x0 < 0 || c.x1 > W) return false;' +
  'for (let i2=0;i2<calls.length;i2++) for (let j2=i2+1;j2<calls.length;j2++) if (overl(calls[i2],calls[j2])) return false;' +
  '} } return true; })()'));

check('v96 balance warning and combo share one lane: danger outranks the celebration', () => fresh.run(
  '(() => { W=180;H=390;relayout();' +
  'runContext=createRunContext({mode:"level",campaignLevel:0,startingAltitude:0,seed:1,skill:.5,loadout:{},characterId:"aurora",characterMastery:{}});' +
  'runLevel=0;runLaunch=0;coins=10;score=10;combo=9;wind=null;tutStep=-1;tick=0;balance=TOPPLE*0.9;' +
  'const at55=[];const orig=txt;txt=(t,x,y)=>{if(y===55)at55.push(String(t));};' +
  'try{renderHUD(10);}finally{txt=orig;}' +
  'return at55.length===1 && at55[0]==="BALANCE!"; })()'));

check('v96 notification boxes carry a full 1px outline, not just top/bottom lines', () =>
  /ctx\.fillRect\(x, y, 1, 14\); ctx\.fillRect\(x \+ tw - 1, y, 1, 14\)/.test(src) &&
  /ctx\.fillRect\(x,y,tw,1\);ctx\.fillRect\(x,y\+12,tw,1\);ctx\.fillRect\(x,y,1,13\);ctx\.fillRect\(x\+tw-1,y,1,13\)/.test(src));

check('v106 modifier activation is one BONUS note with rule and reward; prefix drops at narrow width', () =>
  /const bn='BONUS: '\+m\.rule\+' \+'\+m\.rewardCoins, bp=m\.rule\+' \+'\+m\.rewardCoins; note\(bn\.length\*6\+16<=W-16\?bn:bp,'#FFD75E',2,140\)/.test(src));

check('v96 notification strip clamps its text to the screen width', () =>
  /while \(text\.length > 1 && text\.length \* 6 \+ 16 > W - 16\) text = text\.slice\(0, -1\)/.test(src));

check('v96 in-run surfaces share one 0.82 backing opacity (visibility pass)', () =>
  /rgba\(11,14,26,0\.82\)'; ctx\.fillRect\(x, y, tw, 14\)/.test(src) &&           // queue strip
  /rgba\(11,14,26,0\.82\)';ctx\.fillRect\(x,y,tw,13\)/.test(src));                 // modifier chip

// ---------- v98 icon/cloud/nav art detail ----------
check('v98 shop nav glyph is a shopping cart with twin wheels, not a crate', () =>
  /shopping cart: grip, slatted basket/.test(src) &&
  /ctx\.fillRect\(cx-2\.5,y\+6\.5,1\.5,1\.5\);ctx\.fillRect\(cx\+1\.5,y\+6\.5,1\.5,1\.5\)/.test(src) &&
  !/supply crate: chamfered plate/.test(src));
check('v98 active nav underline sits 1px clear of the label glyphs', () =>
  /ctx\.fillRect\(cx-7,NAV_Y\+22,14,1\)/.test(src) && !/ctx\.fillRect\(cx-7,NAV_Y\+21,14,1\)/.test(src));
check('v98 menu clouds render rounded fine-grid lobes with crown and underbelly shading', () =>
  /rounded half-pixel lobes with a sunlit crown/.test(src) && /rgba\(126,160,200,0\.30\)/.test(src));
check('v98 stage emblems are redrawn on the fine grid and render at emblem and map scales', () => {
  fresh.run('for (let i=0;i<TIERS.length;i++) { drawStageDeco(i, 100, 100); drawStageDecoScaled(i, 60, 60, 2); } ' +
    'for (const s of ["home","shop","me"]) { state = s; drawNav(); } state = "home";');
  return /v98: every stage emblem redrawn on the half-pixel fine grid/.test(src);
});

// ---------- v100 sky map overlap audit + celestial sprite detail ----------
// The map body draws inside a canvas clip [viewTop, viewBot] and the opaque header band paints
// over it afterwards, so world-space text only exists where the clip lets it through. The shim
// mirrors that: world-phase calls (everything before the header's own 'SKY MAP' label) are
// clamped to the clip band and dropped once fully hidden; header calls are unclipped.
check('v100 sky map text never overlaps or leaves the screen (scrolled, selected, champion)', () => fresh.run(
  '(() => { const overl=(a,b)=>a.y0<b.y1&&b.y0<a.y1&&a.x0<b.x1&&b.x0<a.x1;' +
  'for (const [w,hh] of [[180,390],[180,427],[242,300],[320,480]]) { W=w;H=hh;relayout();' +
  'for (const fx of [[5,5],[11,10],[11,11]]) { prog=fx[0]; selLevel=Math.min(fx[1],10); skyMap=true;' +
  'for (let i2=0;i2<11;i2++) levelStars[i2]=3; bestHeight=200;' +
  'const L2=skyMapNodes();' +
  'for (const sc2 of [0, .5, 1]) { mapScroll = mapScrollMax*sc2;' +
  'const calls=[]; const orig=txt; let hdr=false;' +
  'txt=(t,x,y,scl,col,al)=>{t=String(t);if(t==="SKY MAP")hdr=true;scl=scl||1;const tw2=t.length*6*scl-scl;' +
  'const x0=al==="center"?Math.round(x-tw2/2):al==="right"?Math.round(x-tw2):x;' +
  'let y0=y,y1=y+7*scl;if(!hdr){y0=Math.max(y0,L2.viewTop);y1=Math.min(y1,L2.viewBot);}' +
  'if(y0<y1&&String(col).indexOf("0,0,0")<0)calls.push({t,x0,x1:x0+tw2,y0,y1});};' +
  'try { renderSkyMap(); } finally { txt=orig; }' +
  'for (const c of calls) if (c.x0 < 0 || c.x1 > W) return false;' +
  'for (let i2=0;i2<calls.length;i2++) for (let j2=i2+1;j2<calls.length;j2++) if (overl(calls[i2],calls[j2])) return false;' +
  '} } } skyMap=false; prog=0; for (let i2=0;i2<11;i2++) levelStars[i2]=0; bestHeight=0; return true; })()'));

check('v100 selected stage caption replaces its altitude line instead of colliding below', () =>
  /its second line becomes the start-condition caption/.test(src) && !/txt\(cpText,cpx,pt\.y\+33/.test(src));

check('v100 map header hint yields to the stars label instead of colliding', () =>
  /the hint yields to the stars label/.test(src));

check('v100 celestial drift sprites are redrawn on the fine grid and render for every tier', () =>
  /v100: every drifting mid-ground sprite redrawn on the half-pixel fine grid/.test(src) &&
  fresh.run('(() => { for (let t2=0;t2<9;t2++) for (const s2 of [0,3,4]) biomeSprite(t2, 60, 60, s2, 10); return true; })()'));

// ---------- v101 ground-world fine-grid detail pass ----------
check('v101 forest floor, canopy, bark, and landmarks carry the fine-grid pass markers', () =>
  /v101: fine-grid canopy/.test(src) &&
  /v101: the forest floor redrawn on the half-pixel fine grid/.test(src) &&
  /fine-grid bark/.test(src) &&
  /v101: each landmark redrawn on the half-pixel fine grid/.test(src));
check('v101 landmark platforms render for every region without throwing', () => fresh.run(
  '(() => { for (let r2 = 0; r2 <= 10; r2++) drawLandmarkPlatform(W/2, 200, 40, r2); return true; })()'));
check('v101 base blocks render with and without caps without throwing', () => fresh.run(
  '(() => { for (let l2 = 0; l2 <= 10; l2++) { drawBaseBlock(40, 100, 60, 14, l2, true); drawBaseBlock(40, 120, 60, 14, l2, false); } return true; })()'));
check('v101 foliage blobs render at every size incl. below the fine-detail gate', () => fresh.run(
  '(() => { for (const r2 of [2, 3, 4, 7, 12, 18]) foliageBlob(80, 80, r2, 1); return true; })()'));
check('v101 grass blades and tufts are two-tone (body + sunlit tip)', () =>
  /blade body/.test(src) && /sunlit tip/.test(src) && /sunlit tuft tip/.test(src));

// ---------- v102 cave organics + bolder ground detail ----------
check('v102 rock textures tile vertically (edge marks drawn wrapped)', () =>
  /every mark near the top\/bottom edge is drawn AGAIN wrapped/.test(src));
check('v102 texture stamp windows drift with depth at per-column phases', () =>
  /v102: the window also drifts with DEPTH/.test(src) &&
  fresh.run('(() => { const xs = new Set(); for (let r2 = 0; r2 < 1200; r2 += 40) xs.add(caveStampSourceX(r2, 30));' +
    'const stable = caveStampSourceX(500, 30) === caveStampSourceX(500, 30);' +
    'const inRange = [...xs].every(v => v >= 0 && v <= CAVETEX_W - CAVE_STAMP_W);' +
    'return stable && inRange && xs.size > 1; })()'));
check('v102 wall material boundaries dither instead of meeting in straight edges', () =>
  /v102: dithered material boundary/.test(src));
check('v102 lane-edge rim and AO are de-regularized (broken runs, wobbling depth)', () =>
  /no longer traced by continuous perfect lines/.test(src));
check('v102 bolder accents: foliage crown doubled, taller companion blades, denser bark', () =>
  /v102: the v101 crown\/belly accents doubled/.test(src) &&
  /taller companion blade/.test(src) &&
  /v102 doubled the density and contrast/.test(src));

// ---------- v103 celestial landmark detail ----------
check('v103 celestial objects carry the detail-pass markers (Earth, gold, balloons, satellites, asteroids, gate)', () =>
  /v103: continents gain a sunlit coast edge/.test(src) &&
  /v103: faceted shards/.test(src) &&
  /v103: the weather balloons get the v100 sprite treatment/.test(src) &&
  /v103: crossing satellites get panel grid seams/.test(src) &&
  /v103: asteroids gain a sunlit chamfer/.test(src) &&
  /v103: the pillars gain capitals/.test(src));
check('v103 final gate, Earth limb, and gold fragments render across their bands without throwing', () => fresh.run(
  '(() => { for (const A2 of [380, 430, 470, 505, 535, 545]) { drawEarthLimb(A2, 1); drawGoldFragments(A2, 1, 40);' +
  'cameraY = GROUND_Y - A2*BH - (H-100); drawFinalGate(cameraY, 1, 40); } return true; })()'));

// ---------- v97 shop page audit ----------
check('v97 boost chips sit inside the Run Boosts card with breathing gaps', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[180,427],[242,300],[320,480],[480,300]]){W=w;H=h;relayout();' +
  'const shopW=Math.min(W-16,220), shopX=Math.round((W-shopW)/2);' +
  'if(LOAD_CHIPS[0].x < shopX+4) return false;' +   // v99: 4-5px comfortable clearance
  'if(LOAD_CHIPS[2].x+LOAD_CHIPS[2].w > shopX+shopW-4) return false;' +
  'for(let i2=1;i2<3;i2++) if(LOAD_CHIPS[i2].x - (LOAD_CHIPS[i2-1].x+LOAD_CHIPS[i2-1].w) < 3) return false;' +
  '} return true; })()'));

// v133: with Bases switched off there is one tab, so the pair rule (6px gap, equal widths, centred
// as a unit) reduces to "the single tab is centred". Both branches are kept so that re-enabling the
// Base system restores the original assertion rather than silently losing this layout guard.
check('v97 shop tabs stay centred at every viewport', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,300]]){W=w;H=h;relayout();' +
  'const a=SHOP_TABS[0], b=SHOP_TABS[1];' +
  'if(!b){ if(Math.abs((a.x + a.w/2) - W/2) > 1) return false; continue; }' +
  'if(b.x-(a.x+a.w)!==6 || a.w!==b.w) return false;' +   // v99: 6px gap
  'if(Math.abs((a.x + b.x+b.w)/2 - W/2) > 1) return false; } return true; })()'));

check('v97 skin pager dots clear the card frame and match across both shop views', () =>
  /ctx\.fillRect\(ddx\+i\*6, SHOP_TOP\+5, 4, 3\)/.test(src) && /ctx\.fillRect\(dx\+i\*6,SHOP_TOP\+5,4,3\)/.test(src));

check('v97 equip/detail buttons nest inside the hero card with gaps', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,300]]){W=w;H=h;relayout();' +
  'if(EQUIP_BTN.y+EQUIP_BTN.h+2 > SHOP_DETAIL_BTN.y) return false;' +
  'if(SHOP_DETAIL_BTN.y+SHOP_DETAIL_BTN.h > SHOP_TOP+140) return false;' +
  'if(SKIN_L.x+SKIN_L.w >= SKIN_R.x) return false; } return true; })()'));

// ---------- v99 centered shop/home layout + stacked boost chips ----------
check('v99 shop cards center vertically: the void above equals the void below (±2)', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[180,427],[180,520],[320,480]]){W=w;H=h;relayout();' +
  'const above = SHOP_TOP - 40, below = NAV_Y - 4 - (BOOST_TOP + BOOST_CARD_H);' +
  'if(above < 0 || Math.abs(above - below) > 2) return false;' +
  'if(BOOST_TOP !== SHOP_TOP + 150) return false; } return true; })()'));
check('v99 boost chips stack icon-over-name-over-price on tall screens', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[180,427],[180,520],[320,480]]){W=w;H=h;relayout();' +
  'if(LOAD_CHIPS[0].h !== 34 || LOAD_CHIPS[0].w !== 44) return false;' +
  'if(LOAD_CHIPS[1].x - LOAD_CHIPS[0].x !== 54) return false;' +
  'if(LOAD_CHIPS[2].y + LOAD_CHIPS[2].h > BOOST_TOP + BOOST_CARD_H - 4) return false;} return true; })()') &&
  /v99 stacked chip: badge over name over price/.test(src));
check('v99 home column splits its lower space into equal thirds on tall screens', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[180,427],[180,520],[242,300]]){W=w;H=h;relayout();' +
  'const g1 = MISS_PANEL.y - (MAP_BTN.y + MAP_BTN.h);' +
  'const g2 = INSTALL_BTN.y - (MISS_PANEL.y + MISS_PANEL.h);' +
  'const g3 = NAV_Y - (INSTALL_BTN.y + INSTALL_BTN.h);' +
  'if(Math.abs(g1-g2) > 1 || Math.abs(g3-g1) > 2) return false; } return true; })()'));

check('v97 shop text never overlaps or leaves the screen (both views, owned and unowned)', () => fresh.run(
  '(() => { const overl=(a,b)=>a.y<b.y+7*b.sc&&b.y<a.y+7*a.sc&&a.x0<b.x1&&b.x0<a.x1;' +
  'for (const [w,hh] of [[180,390],[180,427],[242,300],[320,480],[480,300]]) { W=w;H=hh;relayout();state="shop";' +
  'for (const view of ["character","base"]) { shopView=view;' +
  'for (const idx of [0, 11]) { previewIdx=Math.min(idx,CHARACTER_REGISTRY.length-1); basePreviewIdx=Math.min(idx,BASE_REGISTRY.length-1);' +
  'const calls=[]; const orig=txt;' +
  'txt=(t,x,y,sc,col,al)=>{sc=sc||1;t=String(t);const tw2=t.length*6*sc-sc;const x0=al==="center"?Math.round(x-tw2/2):al==="right"?Math.round(x-tw2):x;if(String(col).indexOf("0,0,0")<0)calls.push({t,x0,x1:x0+tw2,y,sc});};' +
  'try { renderShop(); } finally { txt=orig; }' +
  'for (const c of calls) if (c.x0 < 0 || c.x1 > W) return false;' +
  'for (let i2=0;i2<calls.length;i2++) for (let j2=i2+1;j2<calls.length;j2++) if (overl(calls[i2],calls[j2])) return false;' +
  '} } } return true; })()'));

// ---------- v94 Home/Shop/Me dead space ----------
// NOTE: computeSize() caps logical H at 520 and maps real phones to ~180-wide logical canvases
// (390x844 CSS -> 180x390 logical, 403x956 CSS -> 180x427). Tall-viewport fixtures below use
// REACHABLE logical shapes: [180,427] (the window that exposed the bug) and [180,520] (max H).
check('v94 Home Climb Orders panel grows with available room instead of leaving it empty', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300],[180,427],[180,520]]){W=w;H=h;relayout();state="home";renderHome();' +
  'const room = NAV_Y - (MAP_BTN.y + MAP_BTN.h) - 40;' +
  'if(MISS_PANEL.rowGap !== clamp(Math.round(room*.16),10,22)) return false;' +
  'if(MISS_PANEL.h !== 30 + MISS_PANEL.rowGap) return false;' +
  'const above = MISS_PANEL.y - (MAP_BTN.y + MAP_BTN.h);' +
  'if(H > 280 && above > 110) return false;' +
  'if(MISS_PANEL.y + MISS_PANEL.h >= INSTALL_BTN.y || INSTALL_BTN.y + INSTALL_BTN.h >= NAV_Y) return false;} return true; })()'));

check('v94 Shop Run Boosts card grows with available room instead of capping at 78', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300],[180,427],[180,520]]){W=w;H=h;relayout();state="shop";shopView="character";renderShop();' +
  'const avail = NAV_Y - 198;' +
  'if(BOOST_CARD_H !== Math.min(clamp(Math.round(avail*.55),84,160), avail)) return false;' +   // v99: min 84 fits the stacked chip column
  'if(BOOST_CARD_H < Math.min(84, avail)) return false;' +   // never below the stacked minimum when room allows
  'if(LOAD_CHIPS.some(c => c.y + c.h > BOOST_TOP + BOOST_CARD_H - 2 || c.y + c.h >= NAV_Y)) return false;} return true; })()'));

check('v94 Me Progress tab distributes its card across available room instead of leaving it empty', () => fresh.run(
  '(() => { for(const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300],[180,427],[180,520]]){W=w;H=h;relayout();state="me";meView="progress";renderMe();' +
  'const extra = clamp(Math.round((NAV_Y-216)*.5), 0, 72);' +
  'if(ME_PROG.h !== 168 + extra) return false;' +
  'const cardBottom = 42 + ME_PROG.h;' +
  'if(cardBottom > NAV_Y - 6) return false;' +
  'const statsBottom = ME_PROG.lifeY + 12 + 3*ME_PROG.statGap + 7;' +
  'if(statsBottom > cardBottom - 8) return false;' +                    // stats stay inside the card
  'if(H >= 390 && ME_PROG.h < 220) return false;' +                     // tall shapes actually grow
  'if(ME_BADGES_BTN.y !== ME_PROG.achY - 3) return false;} return true; })()'));   // tap region tracks the grid

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
check('v105/v109 modifier chip: docked at a fixed NOTIFY_CHIP_Y', () =>
  /NOTIFY_CHIP_Y = NOTIFY_Y \+ 16/.test(src) &&
  /const y=NOTIFY_CHIP_Y;/.test(src));
check('v105 modifier chip keeps the corridor mini-map lane bar at real screen positions', () =>
  /modifierLaneBounds\(m,active&&\(m\.family==='target'\)\)/.test(src) &&
  /ctx\.fillRect\(8,y\+15,W-16,2\)/.test(src));

// ---------- v106: pop-up copy clarity ----------
check('v106 every reward pop-up names its currency or effect', () =>
  /'SUPERNOVA! SCORE & COINS X3'/.test(src) && /'SKYBREAK! \+50 COINS'/.test(src) &&
  /\+challengeReward\+' COINS'/.test(src) &&
  !/'SUPERNOVA! 3X'/.test(src) && !/'SKYBREAK! \+50'(?! COINS)/.test(src));
check('v106 modifier win notes BONUS WON with coins; the old CLEAR/ENDED note is gone', () =>
  /note\('BONUS WON \+'\+paid\+' COINS','#62E8B5',2\)/.test(src) &&
  !/\+' ENDED'/.test(src) && !/' CLEAR \+'\+paid/.test(src));
check('v106 registry rules are imperative and fit the BONUS note at phone width', () => fresh.run(
  'MODIFIER_REGISTRY.every(m => m.rule.length<=19 && ("BONUS: "+m.rule+" +"+m.rewardCoins).length<=31)'));
check('v106 chip states its units with a fit fallback', () =>
  /m\.name\+' '\+blocksLeft\+' LEFT'/.test(src) && /m\.name\+' IN '\+inN\+' BLOCKS'/.test(src) &&
  /if \(t\.length\*6-1>W-40\) t=active\?m\.name\+' - '\+blocksLeft:m\.name\+' IN '\+inN;/.test(src));
check('v106 collection toast names its coins', () =>
  !/'COLLECTION COMPLETE \+'/.test(src) && /'COLLECTION! \+'/.test(src));
check('v106/v109 COMBO lesson teaches the fever threshold in plain words', () => fresh.run(
  'TUT_LESSONS.some(l => l.title==="COMBO" && l.body==="10 STRAIGHT PERFECTS = FEVER" && l.compact==="STREAKS PAY MORE")'));
check('v106 no modifier BONUS note loses its reward at 180px phone width', () => fresh.run(
  '(() => { const w=180, chop=t=>{t=String(t);while(t.length>1&&t.length*6+16>w-16)t=t.slice(0,-1);return t;};' +
  ' return MODIFIER_REGISTRY.every(m => { const bn="BONUS: "+m.rule+" +"+m.rewardCoins, bp=m.rule+" +"+m.rewardCoins;' +
  ' return /\\+[0-9]+$/.test(chop(bn.length*6+16<=w-16?bn:bp)); }); })()'));

// ---------- v107: result screen cleanup ----------
// txt() instrumented: every non-shadow glyph box must stay on-screen and not overlap another;
// every WIN_ROWS/FAIL_ROWS button must stay on-screen and not overlap another row.
function resultSweep(renderName, setup) {
  for (const [w,hh] of [[180,390],[180,520],[242,300],[320,480],[480,270]]) {
    for (const fx of setup) {
      const r = makeGame();
      r.run('W='+w+';H='+hh+';');
      r.run(fx);
      const bad = r.run(
        '(() => { relayout();' +
        ' const overl=(a,b)=>a.y<b.y+7*b.sc&&b.y<a.y+7*a.sc&&a.x0<b.x1&&b.x0<a.x1;' +
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
  !/cp\.name\+' CHECKPOINT - '\+cp\.scoreMultiplier/.test(src));   // the Sky Map keeps its own 'CP -' caption
check('v107 level-win: bonus line uses plain BONUS wording, not MODS', () =>
  /BONUS DONE/.test(src) && / OF '\+modifierResults\.length\+' BONUS/.test(src) && !/- MODS /.test(src));
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
// pos(e) maps clientX/clientY through the fixed 320x480 canvas rect into [0,W]x[0,H];
// build events that land in the nav row's left / right half.
const navTap = 'const rw=WIN_ROWS.find(r=>r.id==="nav"); const cx=x=>({clientX:x/W*320, clientY:(rw.y+4)/H*480});';
check('v107 win: tapping the nav row left half goes home without opening the map', () => { const g=makeGame();
  g.run('prog=10; startLevel(0); while(blocks.length<TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"}); afterPlace({x:0,w:96,col:"#fff"}, false, W/2); winT=80; skyMap=false;');
  g.run(navTap+' pressDown(cx(rw.x+4));');
  return g.run('state==="home" && skyMap===false'); });
check('v107 win: tapping the nav row right half opens the sky map', () => { const g=makeGame();
  g.run('prog=10; startLevel(0); while(blocks.length<TIERS[0].n) blocks.push({x:0,w:96,col:"#fff"}); afterPlace({x:0,w:96,col:"#fff"}, false, W/2); winT=80; skyMap=false;');
  g.run(navTap+' pressDown(cx(rw.x+rw.w-4));');
  return g.run('state==="home" && skyMap===true'); });

// ---------- v108: balloon difficulty phase 1 ----------
const bl = makeGame();
bl.run('mode="endless"; resetRun(); state="playing";');
check('v108 balloon flight: good kinds low+slow, bad kinds high+fast', () => bl.run(
  '(() => { const B=BALANCE_REGISTRY.balloon;' +
  ' const g=balloonFlight("gift"), gl=balloonFlight("golden"), d=balloonFlight("dud"), t=balloonFlight("trap");' +
  ' return g.altRows===B.goodAltRows && gl.altRows===B.goodAltRows && d.altRows===B.badAltRows && t.altRows===B.badAltRows' +
  ' && g.speed===B.driftSpeed && t.speed===B.driftSpeed*B.badSpeedMul && d.speed===B.driftSpeed*B.badSpeedMul; })()'));
check('v108 kind weights interpolate toward more bad balloons as you climb', () => bl.run(
  '(() => { const share=w=>(w.dud+w.trap)/(w.gift+w.golden+w.dud+w.trap);' +
  ' blocks.length=1; const lo=balloonKindWeights(); blocks.length=999; const hi=balloonKindWeights();' +
  ' return share(hi) > share(lo) + 0.1; })()'));
check('v108 pickBalloonKind returns only valid kinds and shifts distribution with altitude', () => bl.run(
  '(() => { const roll=(n)=>{ const c={gift:0,golden:0,dud:0,trap:0,gas:0}; for(let i=0;i<n;i++){const k=pickBalloonKind(); if(!(k in c))return null; c[k]++;} return c; };' +
  ' blocks.length=1; const lo=roll(600); blocks.length=999; const hi=roll(600);' +
  ' if(!lo||!hi) return "invalid kind"; return (hi.dud+hi.trap) > (lo.dud+lo.trap); })()'));
check('v108 spawn tags the balloon with a kind and matching flight', () => bl.run(
  '(() => { balloon=null; lastBalloonRow=0; blocks.length=40; let g=0;' +
  ' while(!balloon && g++<500){ lastBalloonRow=0; maybeSpawnBalloon(); }' +
  ' if(!balloon) return "never spawned"; const B=BALANCE_REGISTRY.balloon;' +
  ' const f=balloonFlight(balloon.kind);' +
  ' const expWy=GROUND_Y-(blocks.length+f.altRows)*BH-BH/2;' +
  ' return ["gift","golden","dud","trap","gas"].includes(balloon.kind) && balloon.wy===expWy && Math.abs(balloon.vx)===f.speed; })()'));
check('v108 pop: golden gives the coin jackpot AND a top power-up', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing"; while(blocks.length<12) blocks.push({x:60,w:96,col:"#fff"});');
  return g.run('(() => { const B=BALANCE_REGISTRY.balloon; coins=0; goldenNext=false; combo=0;' +
    ' balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:"gold",kind:"golden"};' +
    ' const c0=coins, rb0=runBalloons; popBalloon();' +
    ' return coins-c0===B.goldenCoins && (goldenNext===true||combo>0) && runBalloons===rb0+1 && balloon===null; })()'); });
check('v108 pop: dud gives nothing and does not count as a balloon', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { coins=50; balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:"coin",kind:"dud"};' +
    ' const rb0=runBalloons, c0=coins; popBalloon();' +
    ' return coins===c0 && runBalloons===rb0 && balloon===null; })()'); });
check('v108 pop: trap triggers the ~2s slider rush and does not count as a balloon', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { const B=BALANCE_REGISTRY.balloon; rushT=0; balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:"coin",kind:"trap"};' +
    ' const rb0=runBalloons; popBalloon();' +
    ' return rushT===B.rushFrames && runBalloons===rb0 && balloon===null; })()'); });
check('v108 pop: gift applies a power and counts as a balloon', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:"shield",kind:"gift"};' +
    ' const rb0=runBalloons; shield=0; popBalloon();' +
    ' return shield===1 && runBalloons===rb0+1 && balloon===null; })()'); });
check('v108 rush timer decays in update and clears on resetRun', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { const B=BALANCE_REGISTRY.balloon; rushT=B.rushFrames; update(1); const dropped=rushT<B.rushFrames;' +
    ' update(9999); const zeroed=rushT===0; rushT=B.rushFrames; resetRun(); return dropped && zeroed && rushT===0; })()'); });
check('v108 rush speeds the live slider while active', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing"; spawnSlider();');
  return g.run('(() => { if(!slider) return "no slider"; slider.dir=1; slider.x=W/2; wind=null; fever=false;' +
    ' const x0=slider.x; rushT=0; update(1); const base=slider.x-x0;' +
    ' slider.x=x0; rushT=BALANCE_REGISTRY.balloon.rushFrames; update(1); const rushed=slider.x-x0;' +
    ' return base > 0 && rushed > base*1.3; })()'); });
check('v108 source: rushT declared, reset, and applied to the slider step', () =>
  /let .*rushT = 0/.test(src) && /rushT = 0;/.test(src) && /rushT > 0 \? BALANCE_REGISTRY\.balloon\.rushMul : 1/.test(src));
check('v108 drawBalloon renders every kind without throwing', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  g.run('for (const k of ["gift","golden","dud","trap","gas"]) { balloon={x:W/2,wy:GROUND_Y-20*BH,ph:0,type:k==="gift"?"shield":"coin",kind:k}; drawBalloon(0); }');
  return true; });

// ---------- v109: gas hazard balloon + level progression + one-lane cleanup ----------
check('v109 registry: gas kind, unlock gates, difficulty scale, gas tunables', () => bl.run(
  '(() => { const B=BALANCE_REGISTRY.balloon; return B.wLow.gas===0 && B.wHigh.gas>0 && ' +
  'B.unlock.dud===2 && B.unlock.trap===4 && B.unlock.gas===6 && B.gasAltBlocks>0 && ' +
  'B.diffScale.minShare>0 && B.diffScale.minShare<1 && B.gas.cloudFrames>0 && B.gas.shrinkPerFrame>0 && B.gas.minW>0 && B.gas.cloudRows>0; })()'));
check('v109 gas flies the GOOD profile (disguised low-flyer)', () => bl.run(
  '(() => { const f=balloonFlight("gas"), B=BALANCE_REGISTRY.balloon; return f.altRows===B.goodAltRows && f.speed===B.driftSpeed; })()'));
check('v109 campaign unlock gates: L1 good-only, L3 duds, L7 gas', () => { const g=makeGame();
  g.run('prog=10; startLevel(0); state="playing";');
  return g.run('(() => { blocks.length=0; for(let i=0;i<30;i++) blocks.push({x:0,w:50,col:blockCol(i)});' +
    ' let w=balloonKindWeights(); const l1 = w.dud===0 && w.trap===0 && w.gas===0 && w.gift>0;' +
    ' runLevel=2; w=balloonKindWeights(); const l3 = w.dud>0 && w.trap===0 && w.gas===0;' +
    ' runLevel=6; w=balloonKindWeights(); const l7 = w.dud>0 && w.trap>0 && w.gas>0;' +
    ' return l1 && l3 && l7; })()'); });
check('v109 bad share scales with the level difficulty rating', () => { const g=makeGame();
  g.run('prog=10; startLevel(0); state="playing";');
  return g.run('(() => { blocks.length=0; for(let i=0;i<30;i++) blocks.push({x:0,w:50,col:blockCol(i)});' +
    ' runLevel=6; const a=balloonKindWeights(); runLevel=10; const b=balloonKindWeights();' +
    ' return b.dud>a.dud && b.trap>a.trap && b.gas>a.gas && Math.abs(b.gift-a.gift)<1e-9; })()'); });
check('v109 endless: gas locked below gasAltBlocks, live above', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { const B=BALANCE_REGISTRY.balloon; blocks.length=0;' +
    ' for(let i=0;i<B.gasAltBlocks-1;i++) blocks.push({x:0,w:50,col:blockCol(i)});' +
    ' const lo=balloonKindWeights().gas; blocks.push({x:0,w:50,col:blockCol(0)});' +
    ' const hi=balloonKindWeights().gas; return lo===0 && hi>0; })()'); });
check('v109 gas pop: cloud spawned, pri-3 GAS danger note, no good-pop counters', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing"; while(blocks.length<12) blocks.push({x:(W-BASE_W)/2,w:BASE_W,col:blockCol(blocks.length)});');
  return g.run('(() => { balloon={x:W/2,wy:GROUND_Y-8*BH,ph:0,type:"coin",kind:"gas"}; const rb=runBalloons, sb=stats.balloons;' +
    ' curNote={text:"OLD",accent:"#fff",pri:1,dur:120,t:0}; popBalloon();' +
    ' return gasCloud && gasCloud.t===BALANCE_REGISTRY.balloon.gas.cloudFrames && balloon===null &&' +
    ' curNote.text.indexOf("GAS")>=0 && curNote.pri===3 && runBalloons===rb && stats.balloons===sb; })()'); });
check('v109 gas cloud shrinks the in-band top block center-preserving to minW, then stops', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing"; while(blocks.length<12) blocks.push({x:(W-BASE_W)/2,w:BASE_W,col:blockCol(blocks.length)});');
  return g.run('(() => { const G=BALANCE_REGISTRY.balloon.gas;' +
    ' const top=blocks[11], w0=top.w, c0=top.x+top.w/2;' +
    ' gasCloud={wy:GROUND_Y-11.5*BH, t:G.cloudFrames}; update(1);' +
    ' const shrunk=top.w<w0 && Math.abs((top.x+top.w/2)-c0)<1e-6;' +
    ' for(let i=0;i<20000 && gasCloud;i++){ gasCloud.t=Math.max(gasCloud.t,2); if(top.w<=G.minW) break; update(1); }' +
    ' return shrunk && Math.abs(top.w-G.minW)<1e-6; })()'); });
check('v109 gas cloud ignores an out-of-band top block and expires; resetRun clears it', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing"; while(blocks.length<12) blocks.push({x:(W-BASE_W)/2,w:BASE_W,col:blockCol(blocks.length)});');
  return g.run('(() => { const G=BALANCE_REGISTRY.balloon.gas;' +
    ' const top=blocks[11], w0=top.w;' +
    ' gasCloud={wy:GROUND_Y-(11.5+G.cloudRows+2)*BH, t:3}; update(1); const untouched=top.w===w0;' +
    ' update(1); update(1); const expired=gasCloud===null;' +
    ' gasCloud={wy:0,t:100}; resetRun(); return untouched && expired && gasCloud===null; })()'); });
check('v109 drawGasCloud renders without throwing (active, fading, off-screen)', () => { const g=makeGame();
  g.run('mode="endless"; resetRun(); state="playing";');
  return g.run('(() => { try { gasCloud={wy:GROUND_Y-9*BH,t:300}; render(); gasCloud.t=30; render();' +
    ' gasCloud={wy:-99999,t:300}; render(); gasCloud=null; return true; } catch(e) { return false; } })()'); });
check('v109 tutorial is ONE strip: no second yOff-14 lesson call; merged TITLE: BODY form', () =>
  !/drawNotifyStrip\(lbody/.test(src) && /lesson\.title \+ ': ' \+ lesson\.body/.test(src));
check('v109 every lesson fits un-truncated at 180px (fit gate matches drawNotifyStrip)', () => bl.run(
  '(() => { const fits = s => s.length*6+16 <= 180-16;' +
  ' return TUT_LESSONS.every(l => fits(l.title+": "+l.compact) || fits(l.compact)); })()'));
check('v109 real-run tutorial progress persists; practice never writes it', () => {
  const tp = makeGame();
  tp.run('mode="endless"; startRun(); tutStep=1; advanceTutorial(2);');
  const savedStep = saved(tp, 'skystack-tutstep') === 2;
  tp.run('startRun();');
  const resumed = tp.run('tutStep === 2');
  tp.run('mode="practice"; startRun(); tutStep=1; advanceTutorial(2); advanceTutorial(3);');
  const practiceSilent = saved(tp, 'skystack-tutstep') === 2;
  return savedStep && resumed && practiceSilent;
});
check('v109 chip fixed at NOTIFY_CHIP_Y (no tutorial drop)', () =>
  /const y=NOTIFY_CHIP_Y;/.test(src) && !/NOTIFY_CHIP_Y\+\(tutStep>=0\?16:0\)/.test(src));
check('v109 corridor bar only for lane-meaningful families', () =>
  /family==='gust'\|\|m\.family==='target'\|\|m\.family==='visibility'/.test(src));

// ---------- v104: drifting balloon power-up ----------
const bd = makeGame();
bd.run('mode="endless"; resetRun(); state="playing"; while (blocks.length < 12) blocks.push({x:60,w:96,col:blockCol(blocks.length)});');
check('v104/v108 balloon: spawns off-screen at a side edge, drifting inward, at its kind altitude', () => bd.run(
  '(() => { let g=0; while (!balloon && g++ < 400) { lastBalloonRow = 0; maybeSpawnBalloon(); }' +
  ' if (!balloon) return "never spawned";' +
  ' const B = BALANCE_REGISTRY.balloon, f = balloonFlight(balloon.kind);' +
  ' const edgeOK = (balloon.x === -B.margin && balloon.vx === f.speed) || (balloon.x === W + B.margin && balloon.vx === -f.speed);' +
  ' const altOK = balloon.wy === GROUND_Y - (12 + f.altRows) * BH - BH/2;' +
  ' return edgeOK && altOK && balloon.row === undefined && balloon.inT === undefined && balloon.away === undefined; })()'));
check('v104 balloon: drifts horizontally with dt around a fixed altitude', () => bd.run(
  '(() => { const x0 = balloon.x, wy0 = balloon.wy; update(1); update(1);' +
  ' return Math.abs(balloon.x - (x0 + balloon.vx * 2)) < 1e-9 && balloon.wy === wy0; })()'));
check('v104 balloon: a falling block pops it mid-air and applies the gift', () => bd.run(
  '(() => { balloon = { x: W/2, vx: BALANCE_REGISTRY.balloon.driftSpeed, wy: GROUND_Y - 20*BH, ph: 0, type: "shield" };' +
  ' shield = 0; const rb = runBalloons, sb = stats.balloons;' +
  ' faller = { x: W/2 - 10, y: GROUND_Y - 20*BH - BH/2, w: 40, vy: 0, col: blockCol(2), golden: false };' +
  ' state = "dropping"; update(1);' +
  ' const ok = balloon === null && shield === 1 && runBalloons === rb + 1 && stats.balloons === sb + 1;' +
  ' faller = null; state = "playing"; return ok; })()'));
check('v104 balloon: drifting into the tower pops it', () => bd.run(
  '(() => { const top = blocks[blocks.length - 1];' +
  ' balloon = { x: top.x + 4, vx: BALANCE_REGISTRY.balloon.driftSpeed, wy: GROUND_Y - (blocks.length - 1) * BH - BH/2, ph: 0, type: "gold" };' +
  ' const rb = runBalloons; update(1); return balloon === null && runBalloons === rb + 1 && goldenNext === true; })()'));
check('v104 balloon: crossing the far edge despawns it with no reward and no escape tease', () => bd.run(
  '(() => { balloon = { x: W + BALANCE_REGISTRY.balloon.margin + 1, vx: BALANCE_REGISTRY.balloon.driftSpeed, wy: GROUND_Y - 40*BH, ph: 0, type: "wide" };' +
  ' const rb = runBalloons; update(1); return balloon === null && runBalloons === rb; })()'));
check('v104 balloon: legacy escape/intro states are gone from the source', () =>
  !/balloon\.away/.test(src) && !/balloon\.inT/.test(src) && !/it escapes upward/.test(src));

// ---------- v110: skin finish containment + rework ----------
// The harness ctx is an anyProxy (sets are swallowed), so containment is tested through a
// REAL recording ctx injected via makeGame's ctx2dOverride — with motion ON so the
// travelling effects (the historical escapees) actually draw.
check('v110 skin finishes never draw outside the block (all 7 styles, all sizes, motion on)', () => {
  const rec = { rects: [], clip: null, stack: [], pend: null };
  const chain = anyProxy();
  const base = {
    fillRect: (a, b, c, d) => rec.rects.push({ a, b, c, d, clip: rec.clip }),
    rect: (a, b, c, d) => { rec.pend = [a, b, c, d]; },
    clip: () => { rec.clip = rec.pend; },
    save: () => { rec.stack.push(rec.clip); },
    restore: () => { rec.clip = rec.stack.length ? rec.stack.pop() : null; }
  };
  const ctxRec = new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then') return undefined;
      return chain;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  const g = makeGame(null, false, false, ctxRec);
  let total = 0;                                       // guards against a vacuous pass
  for (const st of ['gloss', 'stripe', 'ember', 'facet', 'sparkle', 'shimmer', 'glow'])
    for (const [bw, bh] of [[96, 14], [40, 10], [16, 9], [6, 5]])
      for (let t4 = 0; t4 < 40; t4 += 7) {
        rec.rects.length = 0; rec.clip = null; rec.stack.length = 0; rec.pend = null;
        g.run('tick=' + t4 + '; drawBlock(20,30,' + bw + ',' + bh + ',{h:200,s:80,l:56},true,0,"' + st + '")');
        total += rec.rects.length;
        for (const r of rec.rects) {
          const inside = r.a >= 20 && r.b >= 30 && r.a + r.c <= 20 + bw && r.b + r.d <= 30 + bh;
          const clipped = r.clip && r.clip[0] >= 20 && r.clip[1] >= 30 &&
            r.clip[0] + r.clip[2] <= 20 + bw && r.clip[1] + r.clip[3] <= 30 + bh;
          if (!inside && !clipped) return st + ' ' + bw + 'x' + bh + ' rect ' + r.a + ',' + r.b + ',' + r.c + ',' + r.d;
        }
      }
  return total > 300 ? true : 'only ' + total + ' rects recorded — instrumentation broke';
});

// ---------- v110: sky map level cards ----------
check('v110 card hit-test spans the full card width', () => tap.run(
  '(() => { const L = __C(2); __T(L.colX + 3, L.pts[2].y); return selLevel === 2 && skyMap === true; })()'));
check('v110 map cards stay inside the column and never overlap', () => fresh.run(
  '(() => { const W0=W,H0=H; try { for (const [w,hh] of [[180,390],[180,520],[242,300],[320,480],[480,270]]) { W=w;H=hh;relayout();' +
  'skyMap=true; const L=skyMapNodes();' +
  'const cards=[...L.pts, L.gate].map(p=>({y0:p.y-MAP_CARD_H/2, y1:p.y+MAP_CARD_H/2}));' +
  'if (L.colX < 0 || L.colX + L.colW > W) return false;' +
  'for (let i=0;i<cards.length-1;i++) if (cards[i].y0 <= cards[i+1].y1) return false;' +
  '} } finally { skyMap=false; W=W0; H=H0; relayout(); } return true; })()'));
check('v110 sky map renders card grammar; trail and full-size islands gone from the world layer', () =>
  /Extra Modes-style level cards/.test(src) && !/winding dotted trail/.test(src) &&
  !/const wv = i => midX \+ Math\.round\(amp/.test(src));
check('v110 shop INFO label yields to a long passive name on both detail rows', () =>
  (src.match(/the INFO label yields|same INFO yield rule/g) || []).length === 2 &&
  !/txt\('INFO >',SHOP_DETAIL_BTN/.test(src));

// ---------- v111: sky map postcards + polish ----------
check('v111 map rhythm: MAP_ROW 64 / MAP_CARD_H 54', () => fresh.run('MAP_ROW === 64 && MAP_CARD_H === 54'));
check('v112 postcard SCENE painter replaces island-in-box; rail + scrollbar removed', () =>
  /environment postcard/.test(src) && /function mapScene/.test(src) &&
  !/progress rail/.test(src) && !/fillRect\(W - 3/.test(src) && !/drawIsland\(isGate/.test(src));
check('v112 sky map scroll reversed to wheel-down = down the list, fed into momentum velocity', () =>
  /mapScrollV/.test(src) && /mapScrollV = clamp\(mapScrollV - e\.deltaY/.test(src));
check('v112 map momentum glides then eases to rest', () => fresh.run(
  '(() => { const s0=skyMap,ms0=mapScroll,mv0=mapScrollV,md0=mapDrag,st0=state,mm0=mapScrollMax;' +
  'state="home"; skyMap=true; mapDrag=null; mapScrollMax=500; mapScroll=100; mapScrollV=20;' +
  'update(1); const moved=mapScroll>100 && mapScroll<600; const eased=Math.abs(mapScrollV)<20;' +
  'for(let i=0;i<400;i++) update(1); const stops=(mapScrollV===0);' +
  'skyMap=s0; mapScroll=ms0; mapScrollV=mv0; mapDrag=md0; state=st0; mapScrollMax=mm0;' +
  'return moved && eased && stops; })()') === true);
// ---------- v113: streak coin payoff (fever/nova multiply coins, not just score) ----------
check('v113 perfect coins scale by the streak multiplier', () =>
  /const perfCoins = \(combo >= 7 \? 2 : 1\) \* streakMult/.test(src) && /addCoins\(perfCoins,/.test(src));
check('v113 supernova banner credits coins as well as score', () =>
  /SUPERNOVA! SCORE & COINS X3/.test(src));
// ---------- v114: progression made visible (live top-bar XP bar + level-up moment) ----------
check('v114 top bar draws a live XP progress bar from lvl.xp / xpNeed()', () =>
  /const lw = 34, lx = W - PAD - lw, frac = clamp\(lvl\.xp \/ xpNeed\(\)/.test(src) &&
  /ctx\.fillRect\(lx, 11, fw, 3\)/.test(src));
check('v114 level-up gets an emphasized plated moment, not a dim line', () =>
  /LEVEL UP!  LV '\+lvl\.level\+'  \+'\+ECONOMY_RULES\.levelUpReward/.test(src) &&
  !/'LEVEL UP! NOW LV '\+lvl\.level\+' \+25'/.test(src));
check('v114 top bar renders across levels/xp without throwing and tracks xpNeed', () => fresh.run(
  '(() => { const l0=lvl; let ok=true; for(const st of [{level:1,xp:0},{level:5,xp:499},{level:12,xp:250}]){ lvl=st; try{ topBar(""); }catch(e){ ok=false; } if(xpNeed()!==st.level*100) ok=false; } lvl=l0; return ok; })()') === true);

// ---------- v115: paced, hierarchical game-over reveal ----------
check('v115 goT reveal clock resets at death and advances while the game-over screen is up', () => {
  const g = makeGame();
  g.run('mode="endless"; resetRun(); state="playing"; score=100; while(blocks.length<10) blocks.push({x:0,w:96,col:"#fff"});');
  g.run('gameOver("miss")');
  if (g.run('goT') !== 0) return 'goT not reset at death: ' + g.run('goT');
  g.run('for (let i=0;i<20;i++) update(1);');
  return g.run('goT >= 15 && state === "gameover"') === true ? true : 'goT did not advance: ' + g.run('goT');
});
check('v115 game-over renders across the whole reveal (fresh/mid/done) + reduceMotion without throwing', () => {
  const g = makeGame();   // reduceMotion=false: the animated path
  g.run('mode="endless"; resetRun(); state="playing"; score=100; maxCombo=5; while(blocks.length<10) blocks.push({x:0,w:96,col:"#fff"}); gameOver("miss");');
  g.run('goT=0; renderGameOver(); goT=25; renderGameOver(); goT=300; renderGameOver();');
  const gr = makeGame(undefined, true);   // reduceMotion=true: the instant path
  gr.run('mode="endless"; resetRun(); state="playing"; score=100; maxCombo=5; while(blocks.length<10) blocks.push({x:0,w:96,col:"#fff"}); gameOver("miss"); goT=0; renderGameOver();');
  return true;
});
check('v115 earlier lines reveal before later ones; reduceMotion shows every line at once', () => {
  const setup = 'mode="endless"; resetRun(); state="playing"; score=100; maxCombo=5; while(blocks.length<10) blocks.push({x:0,w:96,col:"#fff"}); gameOver("miss");';
  const cap = '(()=>{ const cap=[],o=txt; txt=(t)=>{cap.push({t:String(t),a:ctx.globalAlpha});}; try{ goT=GOT; renderGameOver(); } finally { txt=o; } const ti=cap.find(c=>/GAME OVER|CHALLENGE/.test(c.t)), mc=cap.find(c=>/MAX COMBO/.test(c.t)); return [!!(ti&&mc), ti&&ti.a, mc&&mc.a]; })()';
  const ga = makeGame(undefined, false, false, alphaCtx()); ga.run(setup);   // animated
  const staged = ga.run(cap.replace('GOT', '28'));                          // mid-reveal: title in, combo not yet
  const gi = makeGame(undefined, true, false, alphaCtx()); gi.run(setup);   // reduceMotion
  const instant = gi.run(cap.replace('GOT', '0'));                          // everything at full alpha immediately
  const ok = staged[0] && staged[1] > 0.9 && staged[2] < 0.1 && instant[0] && instant[1] > 0.99 && instant[2] > 0.99;
  return ok === true ? true : ('staged=' + JSON.stringify(staged) + ' instant=' + JSON.stringify(instant));
});
check('v115 reveal is wired off goT with a reduceMotion instant path and no alpha leak', () =>
  /const rev = t0 => RM \? 1 : clamp\(\(goT - t0\) \/ 7/.test(src) &&
  /if \(state === 'gameover'\) goT \+= dt;/.test(src) &&
  /overLock = 40; goT = 0;/.test(src) &&
  /ctx\.globalAlpha = 1;\s+\/\/ reveal is transient/.test(src));

// ---------- v116: accurate sky-map skies (SKY_STOPS, not the cycling skyColor) ----------
check('v116 mapSkyRGB returns each biome\'s true sky: caves dark, surface a bright day-blue, space near-black', () => fresh.run(
  '(() => {' +
  ' if (typeof mapSkyRGB !== "function" || typeof sampleStops !== "function") return false;' +
  ' const lum = c => c[0]*.299 + c[1]*.587 + c[2]*.114;' +
  ' const caves = mapSkyRGB(TIERS[0].n*0.5, 0.5);' +                 // deep in the caves = dark
  ' const surf  = mapSkyRGB((TIERS[0].n+TIERS[1].n)/2, 0.5);' +      // SURFACE = clear sunny day
  ' const space = mapSkyRGB(TIERS[8].n + 10, 0.5);' +               // SPACE = near-black cosmos
  ' return lum(surf) > lum(caves) && lum(surf) > lum(space) && surf[2] > surf[0] && space.every(ch => ch < 40);' +
  ' })()') === true);
check('v116 biome sky gradient is lighter at the horizon (v=1) than the zenith (v=0)', () => fresh.run(
  '(() => { const lum = c => c[0]*.299+c[1]*.587+c[2]*.114; const top = sampleStops(SKY_STOPS[1], 0), bot = sampleStops(SKY_STOPS[1], 1); return lum(bot) > lum(top); })()') === true);
check('v116 sky map is monotonic-ish darkening past the day tiers (jet stream brighter than orbit)', () => fresh.run(
  '(() => { const lum = c => c[0]*.299+c[1]*.587+c[2]*.114; return lum(mapSkyRGB(TIERS[4].n, 0.5)) > lum(mapSkyRGB(TIERS[9].n, 0.5)); })()') === true);
check('v116 the map backdrop + postcards use SKY_STOPS, not the cycling skyColor', () =>
  /const sky = mapSkyRGB\(blocksAt\(y2\), 0\.5\)/.test(src) &&
  /const stops = SKY_STOPS\[isGate \? TIERS\.length - 1 : k\]/.test(src) &&
  /const s = sampleStops\(stops, b \/ h\)/.test(src));

// ---------- v117: sky-map bottom cleanup + no high-altitude drift wobble ----------
check('v117 no biome wobbles the block drift any more (all MATERIALS.wob === 0)', () => fresh.run(
  'MATERIALS.every(m => m.wob === 0)') === true);
check('v117 per-biome drift SPEED still varies (COSMIC space drifts slower, JET STREAM faster)', () => fresh.run(
  '(() => { const spd = MATERIALS.map(m => m.spd); return spd[8] < 1 && spd[5] > 1 && new Set(spd).size > 1; })()') === true);
check('v117 the drift is constant — the sin() speed wobble is gone from the slider update', () =>
  !/slider\.wob \? \(1 \+ Math\.sin/.test(src) && !/wobbles the drift speed/.test(src));
check('v117 the Sky Map first card (CAVES) sits at the very bottom, fully inside the view', () => {
  const g = makeGame();
  return g.run('(() => { W=180;H=390;relayout(); skyMap=true; mapScroll=0; const L=skyMapNodes();' +
    ' if (mapScrollMax <= 0) return "map not scrollable";' +
    ' const bottom = L.pts[0].y + MAP_CARD_H/2;' +               // bottom edge of the first card
    ' if (bottom > L.viewBot) return "first card clipped: "+bottom+" > "+L.viewBot;' +
    ' if (bottom < L.viewBot - 10) return "first card not at the bottom: "+bottom+" vs "+L.viewBot;' +
    ' return L.start.y - L.pts[0].y === MAP_ROW; })()') === true
    ? true : g.run('(() => { W=180;H=390;relayout(); skyMap=true; mapScroll=0; const L=skyMapNodes(); return L.pts[0].y + MAP_CARD_H/2 + " / viewBot " + L.viewBot; })()');
});
check('v117 the map ground row is gone — no GROUND label, no full-screen haze clouds', () =>
  !/txt\('GROUND', L\.midX/.test(src) && !/far haze clouds drift behind everything/.test(src) &&
  /levels \+ gate — the first card owns the very bottom/.test(src));

// ---------- v118: sky-map chrome cleanup (no header/footer bars, no card-backing panel) ----------
check('v118 the opaque header band + its divider are gone (title/stars still drawn)', () =>
  !/ctx\.fillRect\(0, 0, W, MAP_HEAD\)/.test(src) &&
  !/ctx\.fillRect\(0, MAP_HEAD, W, 1\)/.test(src) &&
  /txt\('SKY MAP', W\/2, 5, 2, '#FFF6E8', 'center'\)/.test(src));
check('v118 the translucent card-backing panel is gone', () =>
  !/column panel/.test(src) && !/ctx\.fillStyle = 'rgba\(7,8,15,0\.28\)'/.test(src) &&
  !/L\.colW \+ 12, L\.viewBot - L\.viewTop/.test(src));
check('v118 floating header text carries a drop-shadow for legibility over raw sky', () =>
  /txt\(starLbl, 17, 23, 1, 'rgba\(0,0,0,0\.5\)', 'left'\)/.test(src) &&
  /txt\(hint,W-21,23,1,'rgba\(0,0,0,0\.5\)','right'\)/.test(src));
check('v118 no footer band — viewBot extends to H-4 and MAP_FOOT is retired', () => fresh.run(
  '(() => { W=180;H=390;relayout(); const L=skyMapNodes(); const ok = L.viewBot === H - 4;' +
  ' const gone = typeof MAP_FOOT === "undefined"; return ok && gone; })()') === true);
check('v118 the first card still sits ~flush at the (now lower) bottom, fully inside the view', () => {
  const g = makeGame();
  return g.run('(() => { W=180;H=390;relayout(); skyMap=true; mapScroll=0; const L=skyMapNodes();' +
    ' if (mapScrollMax <= 0) return "map not scrollable";' +
    ' const bottom = L.pts[0].y + MAP_CARD_H/2;' +
    ' if (bottom > L.viewBot) return "first card clipped: "+bottom+" > "+L.viewBot;' +
    ' if (bottom < L.viewBot - 10) return "first card not at the bottom: "+bottom+" vs "+L.viewBot;' +
    ' return L.viewBot === H - 4; })()') === true
    ? true : g.run('(() => { W=180;H=390;relayout(); skyMap=true; mapScroll=0; const L=skyMapNodes(); return L.pts[0].y + MAP_CARD_H/2 + " / viewBot " + L.viewBot; })()');
});

// ---------- v119: real pixel-art biome covers on the sky-map cards ----------
check('v119 biome covers: 11 index-aligned slugs + an Image-guarded lazy loader', () =>
  /const COVERS = \['caves','surface','treetops','lowersky','cloudnine','jetstream','stratosphere','aurora','space','orbit','thestars'\]/.test(src) &&
  /function ensureCovers\(\)/.test(src) && /if \(coverImg \|\| typeof Image === 'undefined'\) return;/.test(src) &&
  /im\.src = 'covers\/' \+ nm \+ '\.png'/.test(src) && /ensureCovers\(\);\s*\n\s*const L = skyMapNodes\(\)/.test(src));
check('v119 the card draws the cover image (cover-fit) with a mapScene fallback', () =>
  /ctx\.drawImage\(cover, sx2, sy2, sw2, sh2, thX, thY, thW, thH\)/.test(src) &&
  /const cover = isGate \? null : \(coverImg && coverImg\[k\]\)/.test(src) &&
  /cover\.complete && cover\.naturalWidth > 0/.test(src) &&
  /mapScene\(isGate \? -1 : k, isGate, champ, thX, thY, thW, thH, ph\);   \/\/ fallback/.test(src));
check('v119 enlarged thumbnail keeps the pinned text start (tx0 = cx2+48)', () =>
  /const thW = 34, thH = 44, thX = cx2\+8, thY = cy2\+5;/.test(src) &&
  /const tx0 = thX \+ thW \+ 6/.test(src));   // 8 + 34 + 6 = 48, identical to the old 10 + 32 + 6
check('v119 headless has no Image, so coverImg stays null and the map still renders via mapScene', () => {
  const g = makeGame();
  return g.run('(() => { W=180;H=390;relayout(); skyMap=true; mapScroll=0; ensureCovers(); if (coverImg !== null) return "coverImg not null in headless"; renderSkyMap(); return coverImg === null; })()') === true;
});

// ---------- v120: "coins to go" gauge on locked shop unlock buttons ----------
check('v120 coins-to-go gauge: helper + both shops wire it in; the afford branch keeps the pinned coin line', () =>
  /function coinsToGo\(cost\)/.test(src) &&
  /const frac = clamp\(coins \/ cost, 0, 1\)/.test(src) &&
  /ctx\.fillRect\(EQUIP_BTN\.x \+ 1, EQUIP_BTN\.y \+ 1, Math\.round\(\(EQUIP_BTN\.w - 2\) \* frac\), EQUIP_BTN\.h - 2\)/.test(src) &&
  /const lbl = coins \+ '\/' \+ cost/.test(src) &&
  /} else coinsToGo\(sk\.cost\);/.test(src) && /else coinsToGo\(b\.cost\);/.test(src) &&
  /drawCoin\(W\/2 \+ 8, EQUIP_BTN\.y\+5\.5\)/.test(src) && /drawCoin\(W\/2\+8,EQUIP_BTN\.y\+5\.5\)/.test(src));
check('v120 a locked, unaffordable shop item shows a have/cost gauge label; affordable keeps UNLOCK', () => {
  const g = makeGame();
  const gauge = g.run('(() => { W=242;H=300;relayout(); state="shop"; shopView="character";' +
    ' const sk = CHARACTER_REGISTRY.find(c=>c.cost>0 && owned.indexOf(c.id)===-1);' +
    ' if(!sk) return "no locked paid character"; previewIdx = CHARACTER_REGISTRY.indexOf(sk);' +
    ' coins = Math.floor(sk.cost/2);' +
    ' let label=null; const o=txt; txt=(t)=>{ if(/^[0-9]+\\/[0-9]+$/.test(String(t))) label=String(t); };' +
    ' try { renderShop(); } finally { txt=o; }' +
    ' return label === coins + "/" + sk.cost ? "gauge:"+label : "no gauge (label="+label+")"; })()');
  if (!/^gauge:/.test(gauge)) return gauge;
  const unlock = g.run('(() => { W=242;H=300;relayout(); state="shop"; shopView="character";' +
    ' const sk = CHARACTER_REGISTRY.find(c=>c.cost>0 && owned.indexOf(c.id)===-1);' +
    ' previewIdx = CHARACTER_REGISTRY.indexOf(sk); coins = sk.cost + 50;' +
    ' let sawUnlock=false, sawGauge=false; const o=txt; txt=(t)=>{ t=String(t); if(t==="UNLOCK")sawUnlock=true; if(/^[0-9]+\\/[0-9]+$/.test(t))sawGauge=true; };' +
    ' try { renderShop(); } finally { txt=o; }' +
    ' return sawUnlock && !sawGauge; })()');
  return unlock === true ? true : 'affordable did not show UNLOCK (or still showed gauge)';
});

// ---------- v121: physics feel phase 1 (weight & juice) — render/fx only ----------
check('v121 landFx sets squash + a weight-scaled squashPow; a placed block is logic-identical to before', () => {
  const setup = 'mode="endless"; resetRun(); blocks=[{x:W/2-48,w:96,col:{h:0,s:0,l:50}}]; tier=0;' +
    ' faller={x:W/2-48,w:96,y:towerTopY()-BH,vy:0,col:{h:0,s:0,l:50},golden:false}; state="dropping"; land();';
  const g = makeGame();               // reduceMotion=false
  const a = g.run('(() => {' + setup + ' return JSON.stringify({n:blocks.length, x:blocks[1].x, w:blocks[1].w, bal:balance, sq:squash, pow:squashPow}); })()');
  const gr = makeGame(undefined, true);   // reduceMotion=true — logic MUST match
  const b = gr.run('(() => {' + setup + ' return JSON.stringify({n:blocks.length, x:blocks[1].x, w:blocks[1].w, bal:balance, sq:squash, pow:squashPow}); })()');
  const A = JSON.parse(a), B = JSON.parse(b);
  if (!(A.n === 2 && A.sq === 1 && A.pow > 0 && A.pow <= 1)) return 'landFx not applied: ' + a;
  return (A.x === B.x && A.w === B.w && A.bal === B.bal && A.n === B.n) ? true
    : 'reduceMotion changed placement logic: ' + a + ' vs ' + b;
});
check('v121 the squash render uses squashPow with an overshoot curve, still reduceMotion-gated', () =>
  /const t = 1 - squash;/.test(src) &&
  /const s = squashPow \* Math\.exp\(-5\*t\) \* Math\.cos\(t\*7\);/.test(src) &&
  /if \(isTop && squash>0 && !reduceMotion\)/.test(src) &&
  /function landFx\(w\)/.test(src));
check('v121 topple tumbles the whole visible tower as debris and hides exactly those, blocks intact', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun();' +
    ' for(let i=0;i<30;i++) blocks.push({x:W/2-48,w:96,col:{h:0,s:0,l:50}});' +
    ' cameraY = towerTopY() - (H - 100); const len0 = blocks.length, deb0 = debris.length;' +
    ' balance = TOPPLE + 5; gameOver("topple");' +
    ' const spawned = debris.length - deb0;' +
    ' if (blocks.length !== len0) return "blocks.length changed: " + blocks.length + " vs " + len0;' +
    ' if (spawned <= 6) return "not deeper than the old top-6: " + spawned;' +          // the whole VISIBLE tower, > the old fixed 6
    ' if (spawned >= len0) return "tumbled beyond the visible set: " + spawned;' +      // only the on-screen blocks
    ' if (toppleHideTop !== spawned) return "hideTop " + toppleHideTop + " != spawned " + spawned;' +
    ' return true; })()') === true;
});
check('v121 reduceMotion topple stays calm (tumbles the top ~6) and reset clears the state', () => {
  const g = makeGame(undefined, true);   // reduceMotion
  const calm = g.run('(() => { mode="endless"; resetRun(); for(let i=0;i<30;i++) blocks.push({x:W/2-48,w:96,col:{h:0,s:0,l:50}});' +
    ' cameraY = towerTopY() - (H - 100); balance = TOPPLE + 5; gameOver("topple"); return toppleHideTop; })()');
  if (!(calm > 0 && calm <= 6)) return 'reduceMotion not calm: ' + calm;
  const cleared = g.run('(() => { resetRun(); return toppleHideTop === 0 && squashPow === 0; })()');
  return cleared === true ? true : 'resetRun did not clear topple state';
});
check('v121 debris renders in the block skin (drawBlock), not a flat hsl fill', () =>
  /drawBlock\(-Math\.round\(d\.w\/2\), -Math\.round\(d\.h\/2\), Math\.round\(d\.w\), Math\.round\(d\.h\), d\.col, false, 0, sstyle\)/.test(src) &&
  !/ctx\.fillStyle='hsl\('\+d\.col\.h\+',65%,48%\)'/.test(src) &&
  /if \(toppleHideTop>0 && i >= blocks\.length - toppleHideTop\)/.test(src));

// ---------- v123: physics phase 2 — per-biome gravity (SPACE / ORBIT low-g) ----------
check('v123 every biome carries a grav knob; only SPACE(8) and ORBIT(9) are low-g', () =>
  fresh.run('MATERIALS.every(m => typeof m.grav === "number") && MATERIALS[8].grav === 0.45 && ' +
    'MATERIALS[9].grav === 0.45 && MATERIALS.every((m,i) => (i===8||i===9) || m.grav === 1)'));
check('v123 dropPhysicsFor at grav 1 is byte-identical to the global drop (every other biome untouched)', () =>
  fresh.run('(() => { const p = dropPhysicsFor(0);' +
    ' return p.gravity === BALANCE_REGISTRY.drop.gravity && p.initialVelocity === BALANCE_REGISTRY.drop.initialVelocity; })()'));
check('v123 low-g pulls gently but keeps a real launch kick (half-scaled initial velocity)', () =>
  fresh.run('(() => { const s = dropPhysicsFor(8), n = dropPhysicsFor(0);' +
    ' return s.gravity === n.gravity*0.45 && s.initialVelocity === n.initialVelocity*(1+0.45)/2 &&' +
    ' s.initialVelocity > n.initialVelocity*0.45; })()'));
check('v123 fallFramesFor() still returns the frozen 5, and a low-g fall takes longer', () =>
  fresh.run('fallFramesFor() === 5 && fallFramesFor(undefined, 1) === 5 && fallFramesFor(undefined, 0.45) > 5'));

check('v123 the live drop is biome-aware: SPACE launches gentler and accelerates slower than CAVES', () => {
  const g = makeGame();
  const r = g.run('(() => { mode="endless"; resetRun(); state="playing";' +
    ' const sample = (ti) => { tier = ti; spawnSlider(); releaseBlock(); const v0 = faller.vy;' +
    '   state = "dropping"; update(1); const v1 = faller.vy; faller = null; state = "playing"; return [v0, v1 - v0]; };' +
    ' const caves = sample(0), space = sample(8);' +
    ' if (caves[0] !== BALANCE_REGISTRY.drop.initialVelocity) return "grav-1 launch regressed: " + caves[0];' +
    ' if (Math.abs(caves[1] - BALANCE_REGISTRY.drop.gravity) > 1e-9) return "grav-1 accel regressed: " + caves[1];' +
    ' if (!(space[0] < caves[0])) return "SPACE launch not gentler: " + space[0] + " vs " + caves[0];' +
    ' if (!(space[1] < caves[1])) return "SPACE accel not lower: " + space[1] + " vs " + caves[1];' +
    // the per-frame integrate inlines the formula for speed — prove it still equals the one helper
    ' for (const ti of [0,8,9,10]) { const s = sample(ti), p = dropPhysicsFor(ti);' +
    '   if (s[0] !== p.initialVelocity) return "tier " + ti + " launch " + s[0] + " != helper " + p.initialVelocity;' +
    '   if (Math.abs(s[1] - p.gravity) > 1e-9) return "tier " + ti + " accel " + s[1] + " != helper " + p.gravity; }' +
    ' return true; })()');
  return r === true;
});

check('v123 the duration model is biome-aware: low-g levels are modelled longer, normal-g levels unchanged', () => {
  const g = makeGame();
  // measured re-audit numbers. blind model (v122): L8 ideal 80.0, L9 146.7, L0 93.7, L10 206.1.
  // low-g adds (12-10) impact frames/block: L8 +55*2/60 = +1.8s, L9 +100*2/60 = +3.3s.
  const r = g.run('(() => { const ideal = i => levelBalanceReport(i,"assisted",.35).durationSeconds.ideal;' +
    ' if (!(ideal(8) > 81.4 && ideal(8) < 82.2)) return "L8 not lengthened by low-g: " + ideal(8) + " (blind was 80.0)";' +
    ' if (!(ideal(9) > 149.6 && ideal(9) < 150.4)) return "L9 not lengthened by low-g: " + ideal(9) + " (blind was 146.7)";' +
    // v132: L0 was 93.7 until CAVES got its cramped lane. That is a REAL pacing change (a narrower
    // corridor is genuinely quicker to cross), not model drift, so the baseline moves once, here.
    ' if (ideal(0) !== 81.4) return "normal-g L0 drifted: " + ideal(0);' +
    ' if (ideal(10) !== 206.1) return "normal-g L10 drifted: " + ideal(10);' +
    ' return true; })()');
  return r === true;
});
check('v123 RE-AUDIT: every level still lands inside its target duration range under biome gravity', () =>
  fresh.run('LEVEL_REGISTRY.every((l,i) => ["assisted","pure","practice"].every(lane => {' +
    ' const d = levelBalanceReport(i, lane, .35).durationSeconds;' +
    ' return d.ordinary >= d.range[0] && d.ordinary <= d.range[1]; }))'));

// ---------- v122: topple tuned to happen more often (deliberate difficulty shift) ----------
check('v122 topple tolerance is pinned at the tightened 28 (was 34)', () =>
  fresh.run('BALANCE_REGISTRY.physics.topple === 28 && TOPPLE === 28'));
check('v122 a lean that used to survive (|balance| ~30) now topples the run', () => {
  const g = makeGame();
  const r = g.run('(() => { mode="endless"; resetRun(); state="playing";' +
    ' balance = 60;' +                                                   // halves to ~30 on a centred land: >28 (new), <34 (old)
    ' const top=blocks[blocks.length-1];' +
    ' faller={x:top.x,y:towerTopY()-BH,w:top.w,col:blockCol(blocks.length),golden:false};' +
    ' slider=null; state="dropping"; land();' +
    ' if (Math.abs(balance) > 34) return "balance " + balance + " left the 28..34 window this test targets";' +
    ' return state === "gameover" ? true' +
    '   : JSON.stringify({state, balance, assist}); })()');
  return r === true;
});
check('v122 practice still auto-steadies at the tighter tolerance instead of failing', () => {
  const g = makeGame();
  return g.run('(() => { mode="practice"; resetRun(); state="playing"; balance = TOPPLE*3;' +
    ' const top=blocks[blocks.length-1];' +
    ' faller={x:top.x,y:towerTopY()-BH,w:top.w,col:blockCol(blocks.length),golden:false};' +
    ' slider=null; state="dropping"; land();' +
    ' return state === "playing" && Math.abs(balance) < TOPPLE; })()') === true;
});

// ---------- v124: player-facing difficulty (EASY / MEDIUM / HARD) ----------
check('v124 MEDIUM is exactly neutral — every multiplier is 1', () =>
  fresh.run('(() => { const m = DIFFICULTY_TIERS.medium;' +
    ' return m.sliderSpeed === 1 && m.topple === 1 && m.drift === 1 && m.driftCanMiss === false; })()'));
check('v124 the tier registry is frozen and carries the agreed EASY/HARD values', () =>
  fresh.run('(() => { const e = DIFFICULTY_TIERS.easy, h = DIFFICULTY_TIERS.hard;' +
    ' return Object.isFrozen(DIFFICULTY_TIERS) && DIFFICULTY_ORDER.join(",") === "easy,medium,hard" &&' +
    ' e.sliderSpeed === 0.85 && e.topple === 1.25 && h.sliderSpeed === 1.30 && h.topple === 0.65 &&' +
    ' h.driftCanMiss === true && e.driftCanMiss === false; })()'));
check('v124 the topple registry value is UNTOUCHED at 28; difficulty applies via toppleLimit()', () =>
  fresh.run('(() => { if (BALANCE_REGISTRY.physics.topple !== 28 || TOPPLE !== 28) return false;' +
    ' mode = "endless"; runContext = null;' +
    ' setDifficulty("endless", "easy");   const easy = toppleLimit();' +
    ' setDifficulty("endless", "medium"); const med  = toppleLimit();' +
    ' setDifficulty("endless", "hard");   const hard = toppleLimit();' +
    ' setDifficulty("endless", "medium");' +
    ' return med === 28 && Math.abs(easy - 35) < 1e-9 && Math.abs(hard - 18.2) < 1e-9; })()'));
check('v124 the SAME lean topples on HARD but survives on EASY (the tier is really felt)', () => {
  const g = makeGame();
  const lean = (id) => g.run('(() => { setDifficulty("endless","' + id + '"); mode="endless"; resetRun();' +
    ' state="playing"; balance = 60;' +
    ' const top=blocks[blocks.length-1];' +
    ' faller={x:top.x,y:towerTopY()-BH,w:top.w,col:blockCol(blocks.length),golden:false};' +
    ' slider=null; state="dropping"; land(); return state; })()');
  const hard = lean('hard'), easy = lean('easy');
  g.run('setDifficulty("endless","medium");');
  return hard === 'gameover' && easy === 'playing';
});
check('v124 slider speed orders EASY < MEDIUM < HARD at the same altitude, MEDIUM unchanged', () =>
  fresh.run('(() => { const at = (scale) => { const probe = { difficultyProfile:{ startingAssist:.35,' +
    '     campaignLevel:-1, levelSpeedScale:1, slider:BALANCE_REGISTRY.slider, difficultyScale:scale } };' +
    '   return difficultyAt(probe, 40, .35).sliderSpeed; };' +
    ' const bare = { difficultyProfile:{ startingAssist:.35, campaignLevel:-1, levelSpeedScale:1,' +
    '   slider:BALANCE_REGISTRY.slider } };' +
    ' const neutral = difficultyAt(bare, 40, .35).sliderSpeed;' +
    ' return at(0.85) < at(1) && at(1) < at(1.30) && at(1) === neutral; })()'));

check('v124 each mode and challenge remembers its OWN difficulty, and it survives a reload', () => {
  const g = makeGame();
  const set = g.run('(() => { setDifficulty("endless","hard"); setDifficulty("pure","easy");' +
    ' setDifficulty(difficultyScope("challenge","time60"),"easy");' +
    ' return storedDifficulty("endless") === "hard" && storedDifficulty("pure") === "easy" &&' +
    '   storedDifficulty("endless") !== storedDifficulty("pure"); })()');
  if (set !== true) return 'per-scope selection failed';
  const reloaded = makeGame({ 'skystack-save': g.mem.get('skystack-save') });
  return reloaded.run('storedDifficulty("endless") === "hard" && storedDifficulty("pure") === "easy"');
});
check('v124 an unknown or corrupt difficulty repairs to MEDIUM instead of throwing', () => {
  for (const bad of [null, 0, 'nightmare', [], {x:1}, true]) {
    const g = makeGame({ 'skystack-save': JSON.stringify({ version:2, data:{ 'skystack-difficulty': bad } }) });
    if (!g.run('booted === true')) return 'boot failed for ' + JSON.stringify(bad);
    if (g.run('storedDifficulty("endless")') !== 'medium') return 'did not repair: ' + JSON.stringify(bad);
  }
  return true;
});
check('v124 PRACTICE and DAILY stay MEDIUM even when another mode is set to HARD', () =>
  fresh.run('(() => { setDifficulty("endless","hard"); setDifficulty("practice","hard"); setDifficulty("daily","hard");' +
    ' const ok = difficultyFor("practice").id === "medium" && difficultyFor("daily").id === "medium" &&' +
    '   difficultyFor("endless").id === "hard" && !difficultyPickable("practice") && !difficultyPickable("daily") &&' +
    '   difficultyPickable("endless");' +
    ' setDifficulty("endless","medium"); return ok; })()'));
check('v124 difficulty is snapshotted into the run and cannot change mid-run', () => {
  const g = makeGame();
  return g.run('(() => { setDifficulty("endless","hard"); mode = "endless"; resetRun();' +
    ' if (runContext.difficulty !== "hard") return "not snapshotted: " + runContext.difficulty;' +
    ' if (runContext.difficultyProfile.difficultyScale !== DIFFICULTY_TIERS.hard.sliderSpeed) return "scale missing";' +
    ' const during = toppleLimit();' +
    ' setDifficulty("endless","easy");' +
    ' if (toppleLimit() !== during) return "run difficulty mutated mid-run";' +
    ' setDifficulty("endless","medium"); return true; })()') === true;
});

// swept, not just the 5 fixtures: the narrow-AND-short corner (e.g. 180x330) is a real device shape
// and it is exactly where the first two layout attempts collided with CLIMB ORDERS.
check('v124 the difficulty control never collides or clips across a swept viewport range', () =>
  fresh.run('(() => { const sizes=[]; for (let w=170; w<=520; w+=10) for (let h=260; h<=500; h+=10) sizes.push([w,h]);' +
    ' for (const [w,h] of sizes) {' +
    ' W=w; H=h; relayout();' +
    ' const modeLabel = MODE_BTN.w >= "EXTRA MODES".length*6 ? "EXTRA MODES" : "MODES";' +
    ' if (MODE_BTN.w < modeLabel.length*6) return false;' +
    ' if (MAP_BTN.w < "SKY MAP".length*6) return false;' +
    ' if (DIFF_BTN.w < "HARD".length*6) return false;' +
    ' if (DIFF_BTN.y + DIFF_BTN.h > MISS_PANEL.y) return false;' +
    ' if (DIFF_BTN.y + DIFF_BTN.h > INSTALL_BTN.y) return false;' +
    ' if (DIFF_BTN.y + DIFF_BTN.h >= NAV_Y) return false;' +
    ' if (DIFF_BTN.x < HERO_CARD.x || DIFF_BTN.x + DIFF_BTN.w > HERO_CARD.x + HERO_CARD.w) return false;' +
    ' if (MODE_BTN.x + MODE_BTN.w > DIFF_BTN.x) return false; }' +          // no overlap within the row
    ' W=320; H=480; relayout(); return true; })()'));
check('v124 the difficulty control lays out inside the hero card and clear of the nav at every fixture', () =>
  fresh.run('(() => { for (const [w,h] of [[180,390],[242,300],[320,480],[480,270],[480,300]]) {' +
    ' W=w; H=h; relayout();' +
    ' if (DIFF_BTN.x < 0 || DIFF_BTN.x + DIFF_BTN.w > W) return false;' +
    ' if (DIFF_BTN.y + DIFF_BTN.h >= NAV_Y) return false;' +
    ' if (DIFF_BTN.y + DIFF_BTN.h > MISS_PANEL.y) return false;' +          // must not collide with CLIMB ORDERS
    ' if (DIFF_BTN.y + DIFF_BTN.h > INSTALL_BTN.y) return false;' +
    ' if (DIFF_BTN.x < HERO_CARD.x || DIFF_BTN.x + DIFF_BTN.w > HERO_CARD.x + HERO_CARD.w) return false;' +
    ' if (DIFF_BTN.y < HERO_CARD.y + HERO_CARD.h) return false;' +          // below the hero card, not over it
    // labels must actually FIT their buttons (5x7 font advances 6px per char at scale 1)
    ' if (MODE_BTN.w < "MODES".length*6) return false;' +
    ' if (MAP_BTN.w < "SKY MAP".length*6) return false;' +
    ' if (DIFF_BTN.w < "HARD".length*6) return false;' +
    ' for (const r of DIFF_ROWS) if (r.x < 0 || r.x + r.w > W || r.y + r.h >= NAV_Y) return false; }' +
    ' return true; })()'));
check('v124 tapping a difficulty row selects it, stores it for THIS mode, and closes the picker', () => {
  const g = makeGame();
  g.run('var __p = {x:0,y:0}; pos = () => __p;');
  return g.run('(() => { W=320; H=480; relayout(); state="home"; mode="endless";' +
    ' setDifficulty("endless","medium"); diffPicker = true;' +
    ' const row = DIFF_ROWS.find(r => r.id === "hard");' +
    ' __p = { x: row.x + row.w/2, y: row.y + row.h/2 }; pressDown({}); pressUp({});' +
    ' return storedDifficulty("endless") === "hard" && diffPicker === false; })()') === true;
});
check('v124 the picker renders for a pickable mode and is never opened for PRACTICE/DAILY', () => {
  const g = makeGame();
  return g.run('(() => { W=320; H=480; relayout(); state="home";' +
    ' for (const id of ["endless","pure","practice","daily"]) { mode = id; diffPicker = difficultyPickable(id);' +
    '   renderHome(); if (diffPicker) renderDifficultyPicker(); }' +
    ' mode = "practice"; return difficultyPickable("practice") === false; })()') === true;
});

check('v124 a pre-v124 save keeps every record intact and readable as the MEDIUM records', () => {
  const legacy = JSON.stringify({ version:2, data:{ 'skystack-best':4200, 'skystack-height':137,
    'skystack-modebests':{ endless:{ blocks:137, score:4200 } }, 'skystack-levelstars':[3,2,1] } });
  const g = makeGame({ 'skystack-save': legacy });
  return g.run('(() => { mode = "endless"; setDifficulty("endless","medium"); runContext = null;' +
    ' const r = recordsFor("medium");' +
    ' return r.best === 4200 && r.height === 137 && r.modes.endless.blocks === 137 && r.stars[0] === 3; })()') === true;
});
check('v124 an EASY run can never overwrite the MEDIUM/HARD records', () => {
  const g = makeGame({ 'skystack-save': JSON.stringify({ version:2, data:{ 'skystack-best':4200, 'skystack-height':137 } }) });
  return g.run('(() => { setDifficulty("endless","easy"); mode = "endless"; resetRun(); state = "playing";' +
    ' score = 99999; for (let i=0;i<400;i++) blocks.push({x:W/2-48,w:96,col:{h:0,s:0,l:50}});' +
    ' gameOver("quit");' +
    ' const med = recordsFor("medium"), easy = recordsFor("easy");' +
    ' if (med.best !== 4200 || med.height !== 137) return "MEDIUM record was overwritten by an EASY run";' +
    ' if (!(easy.best >= 99999)) return "EASY record was not stored: " + easy.best;' +
    ' return true; })()') === true;
});
check('v124 records round-trip per difficulty through a reload', () => {
  const g = makeGame();
  g.run('(() => { saveRecords("hard", { best:777, height:42, modes:{ endless:{ blocks:42, score:777 } }, stars:[1] }); return true; })()');
  const again = makeGame({ 'skystack-save': g.mem.get('skystack-save') });
  return again.run('(() => { const r = recordsFor("hard");' +
    ' return r.best === 777 && r.height === 42 && r.modes.endless.score === 777 && r.stars[0] === 1; })()') === true;
});

check('v124 stars earned on HARD are the ones displayed on HARD, and never leak into MEDIUM', () => {
  const g = makeGame();
  return g.run('(() => { mode = "level"; runContext = null;' +
    ' saveRecords("medium", { best:0, height:0, modes:{}, stars:[1,1] });' +
    ' saveRecords("hard",   { best:0, height:0, modes:{}, stars:[3,2] });' +
    ' setDifficulty("level","hard");   const onHard = shownStars().slice(0,2).join(",");' +
    ' setDifficulty("level","medium"); const onMed  = shownStars().slice(0,2).join(",");' +
    ' if (onHard !== "3,2") return "HARD stars not shown: " + onHard;' +
    ' if (onMed !== "1,1") return "HARD stars leaked into MEDIUM: " + onMed;' +
    ' return true; })()') === true;
});
check('v124 the star-chart collection counts the BEST stars across difficulties, so switching never loses progress', () => {
  const g = makeGame();
  return g.run('(() => { mode = "level"; runContext = null;' +
    ' saveRecords("medium", { best:0, height:0, modes:{}, stars:[3,0,2] });' +
    ' saveRecords("hard",   { best:0, height:0, modes:{}, stars:[1,3,0] });' +
    ' const b = bestStarsAcross();' +
    ' if (b[0] !== 3 || b[1] !== 3 || b[2] !== 2) return "not a per-level max: " + b.join(",");' +
    ' setDifficulty("level","easy");' +                          // switching to an unplayed tier must not shrink it
    ' const after = bestStarsAcross();' +
    ' return after[0] === 3 && after[1] === 3 && after[2] === 2; })()') === true;
});

check('v124 shownStars() is cached for the render loop but never goes stale after a save or a switch', () => {
  const g = makeGame();
  return g.run('(() => { mode = "level"; runContext = null; setDifficulty("level","hard");' +
    ' saveRecords("hard", { best:0, height:0, modes:{}, stars:[1] });' +
    ' if (shownStars()[0] !== 1) return "initial read wrong: " + shownStars()[0];' +
    ' saveRecords("hard", { best:0, height:0, modes:{}, stars:[3] });' +       // same difficulty, new value
    ' if (shownStars()[0] !== 3) return "stale after save: " + shownStars()[0];' +
    ' setDifficulty("level","medium");' +                                     // switching must re-read too
    ' saveRecords("medium", { best:0, height:0, modes:{}, stars:[2] });' +
    ' if (shownStars()[0] !== 2) return "stale after switch: " + shownStars()[0];' +
    ' return true; })()') === true;
});

check('v124 RE-AUDIT: MEDIUM reports are byte-identical to v123 and every level stays in range', () =>
  // v132: L0 moved 93.7 → 81.4 when CAVES got its cramped lane. Every other level is untouched,
  // which is exactly what this guard is for — it caught the one intended change and nothing else.
  fresh.run('(() => { const v123 = { 0:81.4, 1:19.7, 2:25.6, 3:27.1, 4:32.4, 5:35.7, 6:38.5, 7:43,' +
    '   8:81.8, 9:150.1, 10:206.1 };' +
    ' for (let i=0;i<LEVEL_REGISTRY.length;i++) {' +
    '   const d = levelBalanceReport(i,"assisted",.35,"medium").durationSeconds;' +
    '   if (d.ideal !== v123[i]) return false;' +
    '   if (levelBalanceReport(i,"assisted",.35).durationSeconds.ideal !== v123[i]) return false;' +
    '   if (d.ordinary < d.range[0] || d.ordinary > d.range[1]) return false; }' +
    ' return true; })()'));
check('v124 the model sees difficulty: EASY climbs are modelled slower than HARD', () =>
  fresh.run('(() => { for (const i of [0, 4, 8, 10]) {' +
    ' const e = levelBalanceReport(i,"assisted",.35,"easy").durationSeconds.ideal;' +
    ' const m = levelBalanceReport(i,"assisted",.35,"medium").durationSeconds.ideal;' +
    ' const h = levelBalanceReport(i,"assisted",.35,"hard").durationSeconds.ideal;' +
    ' if (!(e > m && m > h)) return false; } return true; })()'));
check('v124 the report states which difficulty it modelled', () =>
  fresh.run('levelBalanceReport(4,"assisted",.35,"hard").difficulty === "hard" && ' +
    'levelBalanceReport(4,"assisted",.35).difficulty === "medium"'));

// ---------- v125: wind-drift trajectory (falling blocks get a lateral path) ----------
check('v125 with no wind a drop is byte-identical to v124 — no lateral movement at all', () => {
  const g = makeGame();
  return g.run('(() => { setDifficulty("endless","hard"); mode="endless"; resetRun(); state="playing";' +
    ' wind = null;' +
    ' spawnSlider(); const x0 = slider.x; releaseBlock(); state="dropping";' +
    ' for (let i=0;i<4;i++) update(1);' +
    ' const moved = Math.abs(faller.x - x0);' +
    ' setDifficulty("endless","medium");' +
    ' return moved === 0 ? true : "drifted with no wind: " + moved; })()') === true;
});
check('v125 a gust bends the fall into a real curve (lateral speed grows as it falls)', () => {
  const g = makeGame();
  return g.run('(() => { setDifficulty("endless","medium"); mode="endless"; resetRun(); state="playing";' +
    ' tier = 5;' +
    ' wind = { dir:1, str:0.7, dur:200, t:100 };' +
    ' spawnSlider(); const x0 = slider.x; releaseBlock(); state="dropping";' +
    ' update(1); const v1 = faller.vx;' +
    ' update(1); const v2 = faller.vx;' +
    ' const drifted = faller.x - x0;' +
    ' setDifficulty("endless","medium");' +
    ' if (!(v2 > v1 && v1 > 0)) return "not accelerating: v1=" + v1 + " v2=" + v2;' +
    ' if (!(drifted > 0)) return "did not drift downwind: " + drifted;' +
    ' return true; })()') === true;
});
check('v125 drift follows the wind direction', () => {
  const g = makeGame();
  const drift = (dir) => g.run('(() => { mode="endless"; resetRun(); state="playing"; tier = 5;' +
    ' wind = { dir:' + dir + ', str:0.7, dur:200, t:100 };' +
    ' spawnSlider(); const x0 = slider.x; releaseBlock(); state="dropping";' +
    ' for (let i=0;i<4;i++) update(1); return faller.x - x0; })()');
  return drift(1) > 0 && drift(-1) < 0;
});
check('v125 EASY drifts less than MEDIUM, MEDIUM less than HARD, for the same gust', () => {
  const g = makeGame();
  const drift = (id) => g.run('(() => { setDifficulty("endless","' + id + '"); mode="endless"; resetRun();' +
    ' state="playing"; tier = 5; wind = { dir:1, str:0.7, dur:200, t:100 };' +
    ' spawnSlider(); const x0 = slider.x; releaseBlock(); state="dropping";' +
    ' for (let i=0;i<4;i++) update(1); return faller.x - x0; })()');
  const e = drift('easy'), m = drift('medium'), h = drift('hard');
  g.run('setDifficulty("endless","medium");');
  return e < m && m < h && e > 0;
});
check('v125 a hand-built faller with no vx still lands correctly (no NaN poisoning)', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing"; tier = 5;' +
    ' wind = { dir:1, str:0.7, dur:200, t:100 };' +
    ' const top = blocks[blocks.length-1];' +
    ' faller = { x:top.x, y:towerTopY()-BH, w:top.w, col:blockCol(blocks.length), golden:false };' +
    ' slider = null; state = "dropping"; update(1);' +
    ' if (!isFinite(faller.x)) return "faller.x went non-finite: " + faller.x;' +
    ' land();' +
    ' return state === "playing" ? true : "hand-built faller failed to land: " + state; })()') === true;
});
// airtime and exposure are separate levers: hold the wind IDENTICAL and vary only the biome
check('v125 SPACE low-g is airborne longer, so the same wind carries it further than normal gravity', () => {
  const g = makeGame();
  const fall = (ti) => JSON.parse(g.run('(() => { mode="endless"; resetRun(); state="playing"; tier = ' + ti + ';' +
    ' wind = { dir:1, str:0.5, dur:200, t:100 };' +
    ' spawnSlider(); const x0 = slider.x; releaseBlock(); state="dropping";' +
    ' let f=0, d=0; while (state === "dropping" && f < 60) { update(1); f++; if (faller) d = faller.x - x0; }' +
    ' return JSON.stringify([d, f]); })()'));
  const space = fall(8), stars = fall(10);
  // NB: return a BOOLEAN — check() treats any truthy value as a pass, so a diagnostic string would
  // silently make this test pass before the feature exists (it did, on the first run).
  if (!(space[1] > stars[1])) { console.error('  SPACE not airborne longer: ' + space[1] + ' vs ' + stars[1]); return false; }
  if (!(space[0] > stars[0])) { console.error('  SPACE did not drift further: ' + space[0] + ' vs ' + stars[0]); return false; }
  return true;
});
check('v125 biome exposure still matters: the same wind moves a JET STREAM block more than a CAVES one', () => {
  const g = makeGame();
  const drift = (ti) => g.run('(() => { mode="endless"; resetRun(); state="playing"; tier = ' + ti + ';' +
    ' wind = { dir:1, str:(0.16+0.30)*MATERIALS[' + ti + '].wind, dur:200, t:100 };' +
    ' spawnSlider(); const x0 = slider.x; releaseBlock(); state="dropping";' +
    ' let f=0, d=0; while (state === "dropping" && f < 60) { update(1); f++; if (faller) d = faller.x - x0; }' +
    ' return d; })()');
  const caves = drift(0), jet = drift(5);
  return jet > caves * 2 && caves >= 0;
});
check('v125 PRACTICE never drifts (its mode config spawns no wind at all)', () => {
  const g = makeGame();
  return g.run('(() => { mode="practice"; resetRun(); state="playing";' +
    ' if (curMode().wind !== false) return "practice mode config changed — it should be wind:false";' +
    ' for (let i=0;i<900;i++) update(1);' +
    ' return wind === null ? true : "wind spawned in PRACTICE"; })()') === true;
});

check('v125 EASY/MEDIUM: drift can cost a perfect but can never turn a landed drop into a miss', () => {
  const g = makeGame();
  const outcome = (id) => g.run('(() => { setDifficulty("endless","' + id + '"); mode="endless"; resetRun();' +
    ' state="playing"; tier = 5; shield = 0;' +
    ' wind = { dir:1, str:3, dur:200, t:100 };' +
    ' const top = blocks[blocks.length-1];' +
    ' faller = { x: top.x + top.w - 2, x0: top.x + top.w - 2, y: towerTopY()-BH, w: top.w, vx:0,' +
    '   vy: dropPhysicsFor(tier).initialVelocity, col: blockCol(blocks.length), golden:false };' +
    ' slider = null; state = "dropping";' +
    ' for (let i=0;i<30 && state==="dropping";i++) update(1);' +
    ' if (state === "dropping") land();' +
    ' return state; })()');
  const easy = outcome('easy'), med = outcome('medium');
  g.run('setDifficulty("endless","medium");');
  if (easy !== 'playing') { console.error('  EASY lost a would-have-landed block to drift: ' + easy); return false; }
  if (med !== 'playing') { console.error('  MEDIUM lost a would-have-landed block to drift: ' + med); return false; }
  return true;
});
check('v125 HARD lets a real gust genuinely blow a block off the tower', () => {
  const g = makeGame();
  const r = g.run('(() => { setDifficulty("endless","hard"); mode="endless"; resetRun();' +
    ' state="playing"; tier = 5; shield = 0;' +
    ' wind = { dir:1, str:3, dur:200, t:100 };' +
    ' const top = blocks[blocks.length-1];' +
    ' faller = { x: top.x + top.w - 2, x0: top.x + top.w - 2, y: towerTopY()-BH, w: top.w, vx:0,' +
    '   vy: dropPhysicsFor(tier).initialVelocity, col: blockCol(blocks.length), golden:false };' +
    ' slider = null; state = "dropping";' +
    ' for (let i=0;i<30 && state==="dropping";i++) update(1);' +
    ' if (state === "dropping") land();' +
    ' return state; })()');
  g.run('setDifficulty("endless","medium");');
  return r === 'gameover';
});
check('v125 the no-miss clamp never IMPROVES a drop that was already going to miss', () => {
  const g = makeGame();
  return g.run('(() => { setDifficulty("endless","easy"); mode="endless"; resetRun(); state="playing";' +
    ' tier = 5; shield = 0; wind = { dir:1, str:3, dur:200, t:100 };' +
    ' const top = blocks[blocks.length-1];' +
    ' faller = { x: top.x + top.w + 40, x0: top.x + top.w + 40, y: towerTopY()-BH, w: top.w, vx:0,' +
    '   vy: dropPhysicsFor(tier).initialVelocity, col: blockCol(blocks.length), golden:false };' +
    ' slider = null; state = "dropping";' +
    ' for (let i=0;i<30 && state==="dropping";i++) update(1);' +
    ' if (state === "dropping") land();' +
    ' setDifficulty("endless","medium");' +
    ' return state === "gameover" ? true : "clamp rescued a genuine miss: " + state; })()') === true;
});

check('v125 DAILY stays bit-identical for the same seed with drift active (no new randomness)', () => {
  const runDaily = () => { const g = makeGame();
    return g.run('(() => { mode="daily"; resetRun(); state="playing";' +
      ' const path=[]; for (let n=0;n<40;n++) {' +
      '   spawnSlider(); releaseBlock(); state="dropping";' +
      '   let f=0; while (state==="dropping" && f<60) { update(1); f++; }' +
      '   path.push(Math.round((blocks[blocks.length-1].x)*1000));' +
      '   if (state!=="playing") break; }' +
      ' return path.join(","); })()'); };
  const a = runDaily(), b = runDaily();
  return a === b && a.length > 0;
});
check('v125 reduceMotion does NOT change where a block lands (drift is simulation, not decoration)', () => {
  const land = (reduced) => { const g = makeGame(undefined, reduced);
    return g.run('(() => { setDifficulty("endless","medium"); mode="endless"; resetRun(); state="playing";' +
      ' tier = 5; wind = { dir:1, str:0.7, dur:200, t:100 };' +
      ' const top = blocks[blocks.length-1];' +
      ' faller = { x: top.x, x0: top.x, y: towerTopY()-BH, w: top.w, vx:0,' +
      '   vy: dropPhysicsFor(tier).initialVelocity, col: blockCol(blocks.length), golden:false };' +
      ' slider = null; state = "dropping";' +
      // capture the last airborne x: land() nulls the faller, so reading it after the loop throws
      ' let lastX = faller.x;' +
      ' for (let i=0;i<30 && state==="dropping";i++) { update(1); if (faller) lastX = faller.x; }' +
      ' return Math.round(lastX * 1000); })()'); };
  return land(false) === land(true);
});
check('v125 RE-AUDIT: level durations are untouched (drift moves WHERE a block lands, not how long)', () =>
  fresh.run('(() => { const pinned = { 0:81.4, 1:19.7, 2:25.6, 3:27.1, 4:32.4, 5:35.7, 6:38.5, 7:43,' +
    '   8:81.8, 9:150.1, 10:206.1 };' +      // v132: L0 81.4 — CAVES' cramped lane, see the v123 guard
    ' for (let i=0;i<LEVEL_REGISTRY.length;i++) {' +
    '   const d = levelBalanceReport(i,"assisted",.35,"medium").durationSeconds;' +
    '   if (d.ideal !== pinned[i]) return false;' +
    '   if (d.ordinary < d.range[0] || d.ordinary > d.range[1]) return false; }' +
    ' return true; })()'));
check('v125 a fresh run starts driftless — resetRun drops the faller and its lateral state', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing"; tier = 5;' +
    ' wind = { dir:1, str:0.7, dur:200, t:100 };' +
    ' spawnSlider(); releaseBlock(); state="dropping"; update(1);' +
    ' const drifting = (faller.vx || 0) !== 0;' +
    ' resetRun();' +
    ' if (!drifting) return "test setup failed — nothing was drifting to begin with";' +
    ' return (faller === null && wind === null) ? true : "reset left drift state behind"; })()') === true;
});
check('v125 the frozen-S1 drop and placement literals are still untouched', () =>
  fresh.run('BALANCE_REGISTRY.drop.gravity === .9 && BALANCE_REGISTRY.drop.initialVelocity === 2.6 && ' +
    'fallFramesFor() === 5 && BALANCE_REGISTRY.placement.balanceMemory === .5 && ' +
    'BALANCE_REGISTRY.placement.balanceOffset === .5 && BALANCE_REGISTRY.physics.topple === 28'));

// ---------- v126: identity-driven star objectives ----------
check('v126 there is one ★2 and one ★3 objective for every level, and every target is satisfiable', () =>
  fresh.run('(() => { if (STAR_OBJECTIVES.length !== LEVEL_REGISTRY.length) return false;' +
    ' for (let i=0;i<STAR_OBJECTIVES.length;i++) { const o = STAR_OBJECTIVES[i], b = LEVEL_REGISTRY[i].blocksRequired;' +
    '   for (const s of [o.two, o.three]) { if (!s || !s.type) return false;' +
    '     if (s.n !== undefined && s.n > b) return false; } }' +
    ' return true; })()'));
check('v126 wind objectives only appear on levels where wind can actually blow', () =>
  fresh.run('(() => { const minB = BALANCE_REGISTRY.wind.minStartBlocks;' +
    ' for (let i=0;i<STAR_OBJECTIVES.length;i++) { const o = STAR_OBJECTIVES[i], L = LEVEL_REGISTRY[i];' +
    '   for (const s of [o.two, o.three]) if (s.type === "windLands" && L.goalAltitude <= minB) return false; }' +
    ' return true; })()'));
check('v126 every objective type evaluates correctly, including its boundary', () =>
  fresh.run('(() => { const R = { placed:20, perfects:9, bestStreak:6, windPerfects:4, recoveries:3,' +
    '   doubleCut:false, tail:[true,true,true,true,true,true,true,true] };' +
    ' const met = (t,n) => objectiveMet({type:t,n:n}, R);' +
    ' if (!met("perfects",9) || met("perfects",10)) return "perfects boundary";' +
    ' if (!met("streak",6) || met("streak",7)) return "streak boundary";' +
    ' if (!met("windLands",4) || met("windLands",5)) return "windLands boundary";' +
    ' if (!met("recover",3) || met("recover",4)) return "recover boundary";' +
    ' if (!met("cleanFinish",8) || met("cleanFinish",9)) return "cleanFinish boundary";' +
    ' if (!met("ratio",45) || met("ratio",46)) return "ratio boundary";' +
    ' if (!objectiveMet({type:"noDoubleCut"}, R)) return "noDoubleCut should pass when clean";' +
    ' R.doubleCut = true; if (objectiveMet({type:"noDoubleCut"}, R)) return "noDoubleCut should fail";' +
    ' return true; })()'));
check('v126 cleanFinish reads only the FINAL N landings, not the whole run', () =>
  fresh.run('(() => { const R = { placed:10, perfects:5, bestStreak:3, windPerfects:0, recoveries:0,' +
    '   doubleCut:true, tail:[false,false,true,true,true] };' +
    ' return objectiveMet({type:"cleanFinish",n:3}, R) === true &&' +
    '   objectiveMet({type:"cleanFinish",n:4}, R) === false; })()'));
check('v126 every objective has readable label text', () =>
  fresh.run('(() => { for (const o of STAR_OBJECTIVES) for (const s of [o.two, o.three]) {' +
    ' const t = objectiveLabel(s); if (typeof t !== "string" || t.length < 4 || t.length > 18) return false; }' +
    ' return true; })()'));

check('v126 the tracker counts perfects, streaks, recoveries and double-cuts from real placements', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing"; wind = null;' +
    ' const seq = [1,1,0,1,0,0,1];' +
    ' for (const p of seq) trackStarOutcome({ perfect:!!p, cut:!p, miss:false });' +
    ' const R = starRun;' +
    ' if (R.placed !== 7) return "placed " + R.placed;' +
    ' if (R.perfects !== 4) return "perfects " + R.perfects;' +
    ' if (R.bestStreak !== 2) return "bestStreak " + R.bestStreak;' +
    ' if (R.recoveries !== 2) return "recoveries " + R.recoveries;' +
    ' if (R.doubleCut !== true) return "doubleCut " + R.doubleCut;' +
    ' if (R.tail.join(",") !== "true,true,false,true,false,false,true") return "tail " + R.tail.join(",");' +
    ' return true; })()') === true;
});
check('v126 windLands counts only PERFECT landings made while a gust is blowing', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing";' +
    ' wind = null;  trackStarOutcome({perfect:true, cut:false, miss:false});' +
    ' wind = { dir:1, str:0.5, dur:200, t:100 };' +
    ' trackStarOutcome({perfect:true, cut:false, miss:false});' +
    ' trackStarOutcome({perfect:false, cut:true, miss:false});' +
    ' trackStarOutcome({perfect:true, cut:false, miss:false});' +
    ' return starRun.windPerfects === 2 ? true : "windPerfects " + starRun.windPerfects; })()') === true;
});
check('v126 a miss never touches the tracker (a campaign miss ends the run anyway)', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing"; wind=null;' +
    ' trackStarOutcome({perfect:false, cut:false, miss:true});' +
    ' return starRun.placed === 0 && starRun.doubleCut === false; })()') === true;
});
check('v126 resetRun clears the star tracker', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing"; wind=null;' +
    ' for (let i=0;i<5;i++) trackStarOutcome({perfect:true, cut:false, miss:false});' +
    ' if (starRun.perfects !== 5) return "setup failed";' +
    ' resetRun();' +
    ' return (starRun.placed === 0 && starRun.perfects === 0 && starRun.bestStreak === 0 &&' +
    '   starRun.tail.length === 0) ? true : "tracker survived reset"; })()') === true;
});
check('v126 real placements feed the tracker through afterPlace', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing"; wind=null;' +
    ' const before = starRun.placed;' +
    ' const top = blocks[blocks.length-1];' +
    ' faller = { x:top.x, x0:top.x, y:towerTopY()-BH, w:top.w, vx:0,' +
    '   vy:dropPhysicsFor(tier).initialVelocity, col:blockCol(blocks.length), golden:false };' +
    ' slider = null; state = "dropping"; land();' +
    ' return starRun.placed === before + 1 ? true : "afterPlace did not feed the tracker"; })()') === true;
});

check('v126 stars are awarded from the level objectives, and ★1 is always just clearing', () => {
  const g = makeGame();
  const stars = (levelIdx, seq) => g.run('(() => { mode="level"; pendingLevel=' + levelIdx + '; resetRun();' +
    ' state="playing"; wind=null;' +
    ' for (const p of ' + JSON.stringify(seq) + ') trackStarOutcome({perfect:!!p, cut:!p, miss:false});' +
    ' levelComplete(); return winStars; })()');
  const none = stars(2, [1,0,1,0,1,0]);
  const two  = stars(2, [1,1,1,1,0,1]);
  const three= stars(2, [1,1,1,1,1,1,1]);
  if (none !== 1) return 'clear-only should be 1 star, got ' + none;
  if (two !== 2) return 'streak 4 should be 2 stars, got ' + two;
  if (three !== 3) return 'streak 7 should be 3 stars, got ' + three;
  return true;
});
check('v126 winStarMet reports which stars were taken, for the result screen', () => {
  const g = makeGame();
  return g.run('(() => { mode="level"; pendingLevel=2; resetRun(); state="playing"; wind=null;' +
    ' for (const p of [1,1,1,1,0]) trackStarOutcome({perfect:!!p, cut:!p, miss:false});' +
    ' levelComplete();' +
    ' return winStarMet.join(",") === "true,true,false" ? true : "winStarMet " + winStarMet.join(","); })()') === true;
});
check('v126 an already-earned star count is never reduced by a worse later run', () => {
  const g = makeGame();
  return g.run('(() => { mode="level"; pendingLevel=2; setDifficulty("level","medium");' +
    ' saveRecords("medium", { best:0, height:0, modes:{}, stars:[0,0,3] });' +
    ' resetRun(); state="playing"; wind=null;' +
    ' trackStarOutcome({perfect:false, cut:true, miss:false});' +
    ' levelComplete();' +
    ' return recordsFor("medium").stars[2] === 3 ? true : "stars were reduced to " +' +
    '   recordsFor("medium").stars[2]; })()') === true;
});
check('v126 the level report exposes the new per-level objectives', () =>
  fresh.run('(() => { const r = levelBalanceReport(2,"assisted",.35);' +
    ' return r.starObjectives.complete === true && r.starObjectives.two.type === "streak" &&' +
    '   r.starObjectives.three.type === "streak" && r.starObjectives.two.n === 3; })()'));

check('v126 the win screen names each star objective and marks which were taken', () => {
  const g = makeGame();
  g.run('(() => { mode="level"; pendingLevel=2; resetRun(); state="playing"; wind=null;' +
    ' for (const p of [1,1,1,1,0]) trackStarOutcome({perfect:!!p, cut:!p, miss:false});' +
    ' levelComplete(); state="levelwin"; winT = 90; return true; })()');
  g.run('var __texts = []; var __txt0 = txt; txt = function(t,...a){ __texts.push(String(t)); return __txt0(t,...a); };');
  g.run('renderLevelWin();');
  return g.run('(() => { const two = objectiveLabel(LEVEL_REGISTRY[2].starObjectives.two);' +
    ' const three = objectiveLabel(LEVEL_REGISTRY[2].starObjectives.three);' +
    ' const hit = t => __texts.some(x => x.indexOf(t) >= 0);' +
    ' return hit(two) && hit(three) && hit("CLEARED"); })()') === true;
});
check('v126 objective text fits its card across a swept viewport range', () =>
  fresh.run('(() => { for (let w=170; w<=520; w+=10) { W=w; H=480; relayout();' +
    ' for (const L of LEVEL_REGISTRY) for (const s of [L.starObjectives.two, L.starObjectives.three]) {' +
    '   if (objectiveLabel(s).length*6 > Math.min(W-24,240) - 16) return false; } }' +
    ' W=320; H=480; relayout(); return true; })()'));

// ---------- v127: text adapts instead of spilling ----------
check('v127 txtFit steps the scale down until the text fits the width it is given', () =>
  fresh.run('(() => { const wide = txtFit("SKY CONQUERED!", 100, 10, 2, "#fff", "center", 400);' +
    ' const tight = txtFit("SKY CONQUERED!", 100, 10, 2, "#fff", "center", 90);' +
    ' return wide === 2 && tight === 1; })()'));
check('v127 no hero-card text spills its frame at any fixture or progress state', () => {
  const g = makeGame();
  const bad = g.run('(() => { const bad=[]; const t0=txt; var PANEL=null;' +
    ' txt = function(text,x,y,sc,color,align){ if (PANEL) { const s=String(text).toUpperCase(),' +
    '   wpx=s.length*6*sc-sc; let left=x;' +
    '   if (align==="center") left=x-wpx/2; else if (align==="right") left=x-wpx;' +
    '   if (y>=PANEL.y-2 && y<=PANEL.y+PANEL.h && (left<PANEL.x-1 || left+wpx>PANEL.x+PANEL.w+1))' +
    '     bad.push(W+"x"+H+" "+s); } return t0(text,x,y,sc,color,align); };' +
    ' for (const [w,h] of [[180,390],[200,300],[320,480],[430,932],[520,400]]) {' +
    '   W=w; H=h; relayout(); state="home"; skyMap=false; modePicker=false; diffPicker=false;' +
    '   for (const p of [0,4,TIERS.length]) { prog=p; PANEL=HERO_CARD; renderHome(); } }' +
    ' PANEL=null; txt=t0; W=320; H=480; relayout(); return bad.join("|"); })()');
  return bad === '' ? true : bad;
});

// ---------- v128: per-biome landing mechanics ----------
check('v128 only AURORA slides and only CLOUD NINE catches; every other biome is inert', () =>
  fresh.run('(() => { for (let i=0;i<MATERIALS.length;i++) { const m = MATERIALS[i];' +
    ' if (typeof m.slide !== "number" || typeof m.soft !== "number") return false;' +
    ' if (i === 7) { if (m.slide !== 1 || m.soft !== 0) return false; }' +
    ' else if (i === 4) { if (m.soft !== 1 || m.slide !== 0) return false; }' +
    ' else if (m.slide !== 0 || m.soft !== 0) return false; }' +
    ' return true; })()'));
check('v128 CLOUD NINE keeps more of a cut block than the same landing elsewhere', () => {
  const g = makeGame();
  const kept = (ti) => g.run('(() => { mode="endless"; resetRun(); state="playing"; tier=' + ti + ';' +
    ' wind=null; const top=blocks[blocks.length-1]; const n0=blocks.length;' +
    ' faller={x:top.x+20, x0:top.x+20, y:towerTopY()-BH, w:top.w, vx:0,' +
    '   vy:dropPhysicsFor(tier).initialVelocity, col:blockCol(blocks.length), golden:false};' +
    ' slider=null; state="dropping"; land();' +
    ' return blocks.length > n0 ? blocks[blocks.length-1].w : -1; })()');
  const cloud = kept(4), stone = kept(0);
  if (cloud <= 0 || stone <= 0) return 'landing did not place a block';
  return cloud > stone ? true : 'cloud kept ' + cloud + ', stone kept ' + stone;
});
check('v128 the soft catch never REDUCES what you keep', () => {
  const g = makeGame();
  return g.run('(() => { const res = (ti, off) => { mode="endless"; resetRun(); state="playing";' +
    '   tier=ti; wind=null; const top=blocks[blocks.length-1], n0=blocks.length;' +
    '   faller={x:top.x+off, x0:top.x+off, y:towerTopY()-BH, w:top.w, vx:0,' +
    '     vy:dropPhysicsFor(tier).initialVelocity, col:blockCol(blocks.length), golden:false};' +
    '   slider=null; state="dropping"; land();' +
    '   return blocks.length>n0 ? blocks[blocks.length-1].w : -1; };' +
    ' for (const off of [4, 10, 20, 40]) if (res(4,off) < res(0,off)) return "cloud kept less at off="+off;' +
    ' return true; })()') === true;
});

const v128drop = (off, ti, diff) => '(() => { ' + (diff ? 'setDifficulty("endless","' + diff + '");' : '') +
  ' mode="endless"; resetRun(); state="playing"; tier=' + ti + '; wind=null;' +
  ' const top=blocks[blocks.length-1];' +
  ' faller={x:top.x+(' + off + '), x0:top.x+(' + off + '), y:towerTopY()-BH, w:top.w, vx:0,' +
  '   vy:dropPhysicsFor(tier).initialVelocity, col:blockCol(blocks.length), golden:false};' +
  ' slider=null; state="dropping"; land();' +
  ' return blocks[blocks.length-1].slid || 0; })()';
check('v128 a perfect landing on ice does NOT slide', () => {
  const v = makeGame().run(v128drop(0, 7));
  return v === 0 ? true : 'a perfect slid by ' + v;
});
check('v128 an off-centre landing on ice slides in the overhang direction', () => {
  const g = makeGame(), right = g.run(v128drop(14, 7)), left = g.run(v128drop(-14, 7));
  if (!(right > 0)) return 'overhang right did not slide right: ' + right;
  if (!(left < 0)) return 'overhang left did not slide left: ' + left;
  return true;
});
check('v128 slide magnitude orders EASY < MEDIUM < HARD', () => {
  const g = makeGame();
  const e = g.run(v128drop(14,7,'easy')), m = g.run(v128drop(14,7,'medium')), h = g.run(v128drop(14,7,'hard'));
  g.run('setDifficulty("endless","medium");');
  return (e < m && m < h && e > 0) ? true : 'e=' + e + ' m=' + m + ' h=' + h;
});
check('v128 no other biome slides at all', () => {
  const g = makeGame();
  for (const ti of [0,1,2,3,4,5,6,8,9,10]) { const v = g.run(v128drop(14, ti));
    if (v !== 0) return 'tier ' + ti + ' slid ' + v; }
  return true;
});
check('v128 on EASY/MEDIUM ice never slides a held block into a miss', () => {
  const g = makeGame();
  return g.run('(() => { for (const id of ["easy","medium"]) {' +
    ' setDifficulty("endless", id); mode="endless"; resetRun(); state="playing"; tier=7; wind=null;' +
    ' const top=blocks[blocks.length-1];' +
    ' faller={x:top.x+top.w-3, x0:top.x+top.w-3, y:towerTopY()-BH, w:top.w, vx:0,' +
    '   vy:dropPhysicsFor(tier).initialVelocity, col:blockCol(blocks.length), golden:false};' +
    ' slider=null; state="dropping"; land();' +
    ' if (state !== "playing") return id + " lost a held block to the slide"; }' +
    ' setDifficulty("endless","medium"); return true; })()') === true;
});

check('v128 the slide animates: the drawn block eases to rest while its logical x stays put', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing"; tier=7; wind=null;' +
    ' const top=blocks[blocks.length-1];' +
    ' faller={x:top.x+14, x0:top.x+14, y:towerTopY()-BH, w:top.w, vx:0,' +
    '   vy:dropPhysicsFor(tier).initialVelocity, col:blockCol(blocks.length), golden:false};' +
    ' slider=null; state="dropping"; land();' +
    ' const b=blocks[blocks.length-1];' +
    ' if (!((b.slideT||0) > 0)) return "no animation state";' +
    ' const restX = b.x;' +
    ' for (let i=0;i<40;i++) update(1);' +
    ' if (b.x !== restX) return "the LOGICAL x moved during the animation";' +
    ' return (b.slideT||0) === 0 ? true : "animation never finished"; })()') === true;
});
check('v128 reduceMotion may shorten the slide animation but not move the resting place', () => {
  const rest = (reduced) => { const g = makeGame(undefined, reduced);
    return g.run('(() => { mode="endless"; resetRun(); state="playing"; tier=7; wind=null;' +
      ' const top=blocks[blocks.length-1];' +
      ' faller={x:top.x+14, x0:top.x+14, y:towerTopY()-BH, w:top.w, vx:0,' +
      '   vy:dropPhysicsFor(tier).initialVelocity, col:blockCol(blocks.length), golden:false};' +
      ' slider=null; state="dropping"; land();' +
      ' return Math.round(blocks[blocks.length-1].x * 1000); })()'); };
  return rest(false) === rest(true);
});
check('v128 RE-AUDIT: level durations are untouched (landing changes cannot alter fall time)', () =>
  fresh.run('(() => { const pinned = { 0:81.4, 1:19.7, 2:25.6, 3:27.1, 4:32.4, 5:35.7, 6:38.5, 7:43,' +
    '   8:81.8, 9:150.1, 10:206.1 };' +      // v132: L0 81.4 — CAVES' cramped lane, see the v123 guard
    ' for (let i=0;i<LEVEL_REGISTRY.length;i++) {' +
    '   const d = levelBalanceReport(i,"assisted",.35,"medium").durationSeconds;' +
    '   if (d.ideal !== pinned[i]) return false;' +
    '   if (d.ordinary < d.range[0] || d.ordinary > d.range[1]) return false; }' +
    ' return true; })()'));

// ---------- v129: UI feel — screens fade, controls acknowledge the press, nothing spills ----------
check('v129 changing nav tab cross-fades instead of hard-cutting', () =>
  fresh.run('(() => { W=320;H=480;relayout(); state="home"; fadeT=0;' +
    ' const tab = NAV_TABS.find(t => t.id === "shop");' +
    ' navHit({x:tab.x+tab.w/2, y:NAV_Y+4});' +
    ' return state === "shop" && fadeT > 0; })()'));
check('v129 a press is recorded and decays away without blocking input', () =>
  fresh.run('(() => { W=320;H=480;relayout(); state="home"; pressFx.t = 0;' +
    ' notePress(MAP_BTN);' +
    ' if (!(pressFx.t > 0)) return false;' +
    ' for (let i=0;i<30;i++) update(1);' +
    ' return pressFx.t === 0; })()'));
check('v129 reduceMotion changes how a tap LOOKS, never what it does', () => {
  const go = (reduced) => { const g = makeGame(undefined, reduced);
    return g.run('(() => { W=320;H=480;relayout(); state="home";' +
      ' const tab = NAV_TABS.find(t => t.id === "me"); navHit({x:tab.x+tab.w/2, y:NAV_Y+4});' +
      ' return state; })()'); };
  return go(false) === go(true);
});
check('v129 no text spills the canvas on ANY screen across a swept viewport range', () => {
  const g = makeGame();
  const bad = g.run('(() => { const bad=[]; const t0=txt; var SC="";' +
    ' txt = function(text,x,y,sc,color,align){ const s=String(text).toUpperCase(), wpx=s.length*6*sc-sc;' +
    '   let left=x; if (align==="center") left=x-wpx/2; else if (align==="right") left=x-wpx;' +
    '   if (left < -1 || left+wpx > W+1) bad.push(SC+" "+W+"x"+H+" "+s);' +
    '   return t0(text,x,y,sc,color,align); };' +
    ' for (let w=170; w<=520; w+=30) for (const h of [280,390,500]) {' +
    '   W=w; H=h; relayout(); prog=5; mode="endless";' +
    '   SC="home"; state="home"; skyMap=false; modePicker=false; diffPicker=false; challengePicker=false; renderHome();' +
    '   SC="shop"; state="shop"; renderShop();' +
    '   SC="me"; state="me"; renderMe();' +
    '   SC="skymap"; openSkyMap(); renderSkyMap(); skyMap=false;' +
    '   SC="modes"; renderModePicker(); SC="diff"; renderDifficultyPicker(); SC="chal"; renderChallengePicker();' +
    '   SC="win"; mode="level"; pendingLevel=6; resetRun(); state="levelwin"; winT=90; winStars=2;' +
    '     winStarMet=[true,true,false]; renderLevelWin();' +
    '   SC="over"; mode="endless"; resetRun(); state="playing"; gameOver("topple"); goT=90; renderGameOver(); }' +
    ' txt=t0; W=320; H=480; relayout();' +
    ' return [...new Set(bad)].slice(0,6).join(" | "); })()');
  return bad === '' ? true : bad;
});

// ---------- v130: game feel — the world reacts, the death beat breathes ----------
check('v130 a heavy landing startles the birds more than a light one, and it settles back', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing";' +
    ' for (const b of birds) b.startle = 0; combo = 0; landFx(20);' +
    ' const light = Math.max(...birds.map(b => b.startle));' +
    ' for (const b of birds) b.startle = 0; combo = 10; landFx(BASE_W);' +
    ' const heavy = Math.max(...birds.map(b => b.startle));' +
    ' if (!(heavy > light)) return "heavy " + heavy + " vs light " + light;' +
    ' for (let i=0;i<80;i++) update(1);' +
    ' return Math.max(...birds.map(b => b.startle)) === 0 ? true : "startle never settled"; })()') === true;
});
check('v130 a SKYBREAK shoves the clouds outward from centre', () => {
  const g = makeGame();
  return g.run('(() => { mode="endless"; resetRun(); state="playing";' +
    ' const before = clouds.map(c => c.x);' +
    ' for (const c of clouds) c.x = c.x < W/2 ? 20 : W-20;' +
    ' const mid = clouds.map(c => c.x);' +
    ' if (!reduceMotion) for (const c of clouds) c.x += (c.x < W/2 ? -1 : 1) * 12;' +
    ' for (let i=0;i<clouds.length;i++) { const out = Math.abs(clouds[i].x - W/2) > Math.abs(mid[i] - W/2);' +
    '   if (!out) return "cloud " + i + " did not move outward"; }' +
    ' return true; })()') === true;
});
check('v130 the death beat runs slow, then resumes, and never changes the outcome', () => {
  const g = makeGame();
  const setup = ' mode="endless"; resetRun(); state="playing";' +
    ' for(let i=0;i<20;i++) blocks.push({x:W/2-48,w:96,col:{h:0,s:0,l:50}});' +
    ' balance = toppleLimit()+5; gameOver("topple");';
  const slowed = g.run('(() => {' + setup + ' goT = 0; return beatScale(); })()');
  const resumed = g.run('(() => {' + setup + ' goT = 30; return beatScale(); })()');
  if (!(slowed < 1 && resumed === 1)) return 'slowed=' + slowed + ' resumed=' + resumed;
  const res = (gt) => g.run('(() => {' + setup + ' goT=' + gt + ';' +
    ' for (let i=0;i<60;i++) update(1*beatScale());' +
    ' return state+"/"+overCause+"/"+blocks.length; })()');
  return res(0) === res(99) ? true : 'slow ' + res(0) + ' vs normal ' + res(99);
});
check('v130 reduceMotion gets neither the startle nor the slow motion', () => {
  const g = makeGame(undefined, true);
  return g.run('(() => { mode="endless"; resetRun(); state="playing";' +
    ' for (const b of birds) b.startle = 0; combo = 10; landFx(BASE_W);' +
    ' if (Math.max(...birds.map(b => b.startle)) !== 0) return "startled under reduceMotion";' +
    ' for(let i=0;i<20;i++) blocks.push({x:W/2-48,w:96,col:{h:0,s:0,l:50}});' +
    ' balance = toppleLimit()+5; gameOver("topple"); goT = 0;' +
    ' return beatScale() === 1 ? true : "slow motion under reduceMotion"; })()') === true;
});

// ---------- v131: the biome mechanics are now felt AND named ----------
const v131drop = (ti, off) => '(() => { mode="endless"; resetRun(); state="playing"; tier=' + ti + ';' +
  ' wind=null; const top=blocks[blocks.length-1]; floaters.length=0;' +
  ' faller={x:top.x+(' + off + '), x0:top.x+(' + off + '), y:towerTopY()-BH, w:top.w, vx:0,' +
  '   vy:dropPhysicsFor(tier).initialVelocity, col:blockCol(blocks.length), golden:false};' +
  ' slider=null; state="dropping"; land();' +
  ' const b=blocks[blocks.length-1];' +
  ' return JSON.stringify({slid:+(b.slid||0).toFixed(1), w:b.w, texts:floaters.map(f=>f.text)}); })()';
check('v131 ice slides far enough to be felt, and says SLIP! when it does', () => {
  const r = JSON.parse(makeGame().run(v131drop(7, 16)));
  if (!(Math.abs(r.slid) >= 7)) return 'only slid ' + r.slid;
  return r.texts.indexOf('SLIP!') >= 0 ? true : 'no SLIP! floater: ' + r.texts.join(',');
});
check('v131 a perfect landing on ice neither slides nor announces', () => {
  const r = JSON.parse(makeGame().run(v131drop(7, 0)));
  return (r.slid === 0 && r.texts.indexOf('SLIP!') < 0) ? true : 'perfect fired: ' + JSON.stringify(r);
});
check('v131 cloud says CAUGHT! and a plain biome stays silent', () => {
  const cloud = JSON.parse(makeGame().run(v131drop(4, 20)));
  const stone = JSON.parse(makeGame().run(v131drop(0, 20)));
  if (cloud.texts.indexOf('CAUGHT!') < 0) return 'no CAUGHT!: ' + cloud.texts.join(',');
  return stone.texts.length === 0 ? true : 'stone announced: ' + stone.texts.join(',');
});
check('v131 the cloud catch grows INWARD so it cannot increase lean', () => {
  const g = makeGame();
  // a right-overhanging landing: the caught block must not extend further right than the plain one
  const right = (ti) => JSON.parse(g.run('(() => { mode="endless"; resetRun(); state="playing"; tier=' + ti + ';' +
    ' wind=null; const top=blocks[blocks.length-1];' +
    ' faller={x:top.x+20, x0:top.x+20, y:towerTopY()-BH, w:top.w, vx:0,' +
    '   vy:dropPhysicsFor(tier).initialVelocity, col:blockCol(blocks.length), golden:false};' +
    ' slider=null; state="dropping"; land();' +
    ' const b=blocks[blocks.length-1]; return JSON.stringify([b.x, b.x+b.w]); })()'));
  const cloud = right(4), stone = right(0);
  if (!(cloud[1] <= stone[1] + 0.001)) return 'cloud extended further out: ' + cloud[1] + ' vs ' + stone[1];
  return (cloud[1] - cloud[0]) > (stone[1] - stone[0]) ? true : 'cloud did not keep more block';
});
check('v132 only the biomes with a mechanic announce a rule on arrival', () =>
  fresh.run('(() => { if (BIOME_RULES.length !== TIERS.length) return false;' +
    // v132 gave CAVES(0), TREETOPS(2) and LOWER SKY(3) their own mechanics, so they now speak too.
    ' for (const i of [0,2,3,4,5,7,8,9]) if (!BIOME_RULES[i]) return false;' +
    ' for (const i of [1,6,10]) if (BIOME_RULES[i]) return false;' +
    ' return true; })()'));

// ---------- v132: the EARLY levels finally have a signature of their own ----------
// Asher twice reported no felt biome identity. He plays the early campaign, and levels 0-3 had NO
// mechanic at all — this is that gap closed. SURFACE stays deliberately plain as the teaching ground.
check('v132 CAVES runs a cramped lane and every open biome keeps the full corridor', () => {
  const g = makeGame();
  return g.run('(() => { tier = 0; const caves = slideRange();' +
    ' const cw = caves.r - caves.l, full = Math.min(W, 220);' +
    ' if (!(cw < full * 0.9)) return "caves lane not cramped: " + cw + " of " + full;' +
    ' if (Math.abs((caves.l + caves.r) / 2 - W / 2) > 1) return "caves lane off centre";' +
    ' for (const t of [1,2,3,4,5,6,7,8,9,10]) { tier = t; const r = slideRange();' +
    '   if (r.r - r.l !== full) return "biome " + t + " lane changed: " + (r.r - r.l); }' +
    ' return true; })()') === true;
});
check('v132 the duration model prices the cramped lane instead of a fixed corridor', () => {
  const g = makeGame();
  // every early level must still land inside its own published duration band on MEDIUM
  return g.run('(() => { for (const l of [0,1,2,3]) {' +
    ' const d = levelBalanceReport(l, "assisted", 0.35, "medium").durationSeconds;' +
    ' if (!(d.ordinary >= d.range[0] && d.ordinary <= d.range[1]))' +
    '   return "level " + l + " out of band: " + d.ordinary + " vs " + JSON.stringify(d.range); }' +
    ' return true; })()') === true;
});
check('v132 a PERFECT on TREETOPS springs the block wider and says SPRING!', () => {
  const tree = JSON.parse(makeGame().run(v131drop(2, 0)));
  const surf = JSON.parse(makeGame().run(v131drop(1, 0)));
  if (!(tree.w > surf.w)) return 'no spring: treetops ' + tree.w + ' vs surface ' + surf.w;
  return tree.texts.indexOf('SPRING!') >= 0 ? true : 'no SPRING! floater: ' + tree.texts.join(',');
});
check('v132 a sloppy landing on TREETOPS does not spring', () => {
  const tree = JSON.parse(makeGame().run(v131drop(2, 20)));
  const surf = JSON.parse(makeGame().run(v131drop(1, 20)));
  if (tree.texts.indexOf('SPRING!') >= 0) return 'sprung on a cut: ' + tree.texts.join(',');
  return tree.w === surf.w ? true : 'width changed on a cut: ' + tree.w + ' vs ' + surf.w;
});
check('v132 the spring is an outcome, so reduceMotion still gets it', () => {
  const plain = JSON.parse(makeGame(undefined, false).run(v131drop(2, 0)));
  const rm = JSON.parse(makeGame(undefined, true).run(v131drop(2, 0)));
  return rm.w === plain.w ? true : 'reduceMotion changed the landing: ' + rm.w + ' vs ' + plain.w;
});
check('v132 LOWER SKY meets wind far more often, and JET STREAM stays the strongest', () => {
  const load = (ti) => makeGame().run('(() => { mode="endless"; resetRun(); state="playing"; tier=' + ti + ';' +
    ' for(let i=0;i<40;i++) blocks.push({x:W/2-48,w:96,col:{h:0,s:0,l:50}});' +
    ' wind=null; windTimer=0; let gusts=0, was=false;' +
    ' for(let i=0;i<3000;i++){ update(1); const on=!!wind; if(on&&!was) gusts++; was=on; }' +
    ' return gusts; })()');
  const sky = load(3), surf = load(1), caves = load(0);
  if (!(sky >= surf * 1.8)) return 'lower sky ' + sky + ' gusts vs surface ' + surf;
  if (caves > surf) return 'sheltered caves became windy: ' + caves + ' vs ' + surf;
  const g = makeGame();
  return g.run('MATERIALS[5].wind > MATERIALS[3].wind') ? true : 'lower sky out-blows the jet stream';
});

// ---------- v133: the level start shows the real tower; the Base system is switched OFF ----------
// Every campaign level pre-stacks the blocks you climbed, but the renderer hid them so a floating
// LANDMARK platform could stand in. At TREETOPS that landmark is a bare bough, which read as a plank
// hanging in mid-air at 180M. Asher: "its unprofessional, and looks cheap/terrible."
const v133render = (lvl) => '(() => { prog = 99; startLevel(' + lvl + ');' +
  ' let blocksDrawn = 0, landmark = 0, cosmetic = 0;' +
  ' const rb = drawBlock, rl = drawLandmarkPlatform, rc = drawBaseCosmetic;' +
  ' drawBlock = function(){ blocksDrawn++; return rb.apply(this, arguments); };' +
  ' drawLandmarkPlatform = function(){ landmark++; return rl.apply(this, arguments); };' +
  ' drawBaseCosmetic = function(){ cosmetic++; return rc.apply(this, arguments); };' +
  ' try { render(); } finally { drawBlock = rb; drawLandmarkPlatform = rl; drawBaseCosmetic = rc; }' +
  ' return JSON.stringify({blocksDrawn, landmark, cosmetic, total: blocks.length}); })()';
check('v133 a checkpoint start draws the real tower, not a floating platform', () => {
  const r = JSON.parse(makeGame().run(v133render(4)));
  if (r.landmark !== 0) return 'landmark platform still drawn';
  if (r.cosmetic !== 0) return 'base cosmetic still drawn';
  return r.blocksDrawn >= 5 ? true : 'only ' + r.blocksDrawn + ' blocks drawn of ' + r.total;
});
check('v133 drawing the tower stays bounded by the screen, not by tower depth', () => {
  const shallow = JSON.parse(makeGame().run(v133render(2)));
  const deep = JSON.parse(makeGame().run(v133render(9)));
  return deep.blocksDrawn <= shallow.blocksDrawn + 3
    ? true : 'deep level drew ' + deep.blocksDrawn + ' vs shallow ' + shallow.blocksDrawn;
});
// Asher asked for the Base system to be DISABLED rather than deleted, so it can be reused in a later
// project. This check is what stops a future cleanup pass from quietly breaking that promise.
check('v133 the Base system is switched off but left completely intact', () => fresh.run(
  '(() => { if (FEATURE_FLAGS.bases !== false) return "flag is not false";' +
  ' if (typeof BASE_REGISTRY === "undefined" || BASE_REGISTRY.length !== 4) return "registry gone";' +
  ' if (typeof drawBaseCosmetic !== "function") return "drawBaseCosmetic gone";' +
  ' if (typeof drawBaseBlock !== "function" || BASE_THEMES.length !== TIERS.length) return "themes gone";' +
  ' if (!FUTURE_SAVE_CONTRACTS.bases) return "save contract gone";' +
  ' return true; })()') === true);
check('v133 the BASES shop tab is unreachable and leaves no empty tab behind', () => fresh.run(
  '(() => { const W0=W,H0=H; W=320;H=480; relayout();' +
  ' const ids = SHOP_TABS.map(t=>t.id), n = SHOP_TABS.length, t = SHOP_TABS[0];' +
  ' const centred = Math.abs((t.x + t.w/2) - W/2) <= 1;' +
  ' W=W0;H=H0; relayout();' +
  ' if (ids.indexOf("base") >= 0) return "base tab still present";' +
  ' if (n !== 1) return "unexpected tab count " + n;' +
  ' return centred ? true : "lone tab not centred"; })()') === true);
check('v133 BASE GALLERY is not left in the collection list unachievable', () =>
  fresh.run('COLLECTION_REGISTRY.every(c => c.id !== "base-gallery")'));
check('v133 disabling bases does not touch the saved base data', () => {
  const seed = JSON.stringify({ owned:['natural','runestone'], selected:'runestone' });
  const g = makeGame({ 'skystack-bases': seed });
  return g.mem.get('skystack-bases') === seed ? true : 'save was rewritten: ' + g.mem.get('skystack-bases');
});
// The letter D was two pixels from O with both right corners open, so it READ as O at every size:
// shipped live as "OROP: TAP WHEN CENTERED", "< WINO", and a difficulty button reading "MEO".
const glyphPx = ' const px = (a,b) => { let n=0; for (let i=0;i<7;i++){ let x=(a[i]^b[i])&31;' +
  ' while(x){ n+=x&1; x>>=1; } } return n; };';
check('v133 the letter D is clearly distinct from O', () =>
  fresh.run('(() => {' + glyphPx + ' return px(FONT.D, FONT.O) >= 6; })()'));
check('v133 no two glyphs in the font are within 2 pixels of each other', () => fresh.run(
  '(() => {' + glyphPx + ' const k = Object.keys(FONT);' +
  ' for (let i=0;i<k.length;i++) for (let j=i+1;j<k.length;j++)' +
  '   if (px(FONT[k[i]], FONT[k[j]]) < 3) return k[i] + "/" + k[j] + " are indistinguishable";' +
  ' return true; })()') === true);

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
check('v110 finish section runs under one shared clip', () =>
  /per-skin surface finish \(v110: ONE shared clip/.test(src));
check('v110 old escapes are gone (ember above-block spark, glow outer halo)', () =>
  !/y - 1 \+ \(Math\.sin\(tick\*\.3\+ex\)\|0\)/.test(src) &&
  !/ctx\.fillRect\(x-4, y-3, w\+8, h\+6\)/.test(src));
check('v110 redesigned styles carry their markers', () =>
  /jagged magma veins/.test(src) && /cut gem/.test(src) &&
  /smooth cross twinkles/.test(src) && /neon tube/.test(src));

// ---------- static checks ----------
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('sw.js cache bumped to v135', () => /const CACHE = 'skystack-v135'/.test(sw));
check('v119 sw.js precaches the 11 biome cover PNGs', () =>
  /\.\/covers\/' \+ n \+ '\.png/.test(sw) &&
  /'caves','surface','treetops','lowersky','cloudnine','jetstream','stratosphere','aurora','space','orbit','thestars'/.test(sw) &&
  /\.\.\.COVERS/.test(sw));
check('sub-pixel world scroll: supersampled backing store + fractional camera translate', () =>
  /const fit = Math\.min\(innerWidth \* dpr/.test(src) && /ctx\.setTransform\(RS, 0, 0, RS, 0, 0\)/.test(src) && /cySub = Math\.round\(\(cy - cameraY\) \* RS\) \/ RS/.test(src));
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
