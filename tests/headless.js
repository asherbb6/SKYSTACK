// SKYSTACK headless check suite — stubs browser APIs, evals the game script in a vm
// context, then drives internal functions to verify the checkpoint/level system + SKY MAP.
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
check('fresh profile: prog=0, launch=-1', () => fresh.run('prog === 0 && launch === -1'));
check('skyMapNodes: 9 pts + start + gate', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.pts.length === 9 && L.start && L.gate; })()'));
check('skyMapNodes: start below first node, gate above last', () => fresh.run(
  '(() => { const L = skyMapNodes(); return L.start.y > L.pts[0].y && L.gate.y < L.pts[8].y; })()'));
check('skyMapNodes: all nodes inside canvas', () => fresh.run(
  '(() => { const L = skyMapNodes(); return [...L.pts, L.start, L.gate].every(p => p.x>=0 && p.x<=W && p.y>=0 && p.y<=H); })()'));
check('renderSkyMap runs without throwing (prog=0)', () => { fresh.run('skyMap = true; renderSkyMap()'); return true; });
check('drawStageDeco runs for all 9 stages', () => { fresh.run('for (let i=0;i<9;i++) drawStageDeco(i, 100, 100)'); return true; });
check('renderHome runs without throwing', () => { fresh.run('state="home"; skyMap=false; renderHome()'); return true; });

// ---------- veteran-profile context (bestHeight 60 blocks = 180M) ----------
const vet = makeGame({
  'skystack-height': '60',
  'skystack-best': '900',
  'skystack-launch': '5'   // stored launch beyond unlocked stages -> must clamp
});
check('prog seeded from lifetime best (60 blocks -> 3 stages)', () => vet.run('prog === 3'));
check('stored launch beyond prog clamps to -1', () => vet.run('launch === -1'));

// checkpoint run start
vet.run('mode = "endless"; launch = 1;');
vet.run('resetRun()');
check('checkpoint run: runLaunch = TREETOPS block count (25)', () => vet.run('runLaunch === 25'));
check('checkpoint run: tower pre-stacked to 25 blocks', () => vet.run('blocks.length === 25'));
check('checkpoint run: pre-stacked tiers skipped (tier=2)', () => vet.run('tier === 2'));
check('checkpoint run: pickups pushed above the pre-stack', () => vet.run('nextPickupRow >= blocks.length + 4'));
check('checkpoint run: score starts at 0', () => vet.run('score === 0'));

// records must NOT update for checkpoint runs
vet.run('score = 99999; while (blocks.length < 120) blocks.push({x:0,w:96,col:"#fff"});');
vet.run('state = "playing"; gameOver("fall")');
check('checkpoint gameOver: best score untouched', () => vet.run('best === 900'));
check('checkpoint gameOver: best height untouched', () => vet.run('bestHeight === 60'));
check('checkpoint gameOver: mode bests untouched', () => vet.run('!(modeBests.endless && modeBests.endless.blocks >= 120)'));
check('checkpoint gameOver: stored best not polluted', () => vet.mem.get('skystack-best') === '900' ? true : 'stored: ' + vet.mem.get('skystack-best'));

// afterPlace NEW BEST guard on checkpoint runs
vet.run('resetRun(); newHeight = false;');
vet.run('while (blocks.length < 70) blocks.push({x:0,w:96,col:"#fff"}); tier = 9;');
vet.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('checkpoint afterPlace: NEW BEST never fires', () => vet.run('newHeight === false'));

// ground run updates records normally
vet.run('launch = -1; resetRun()');
check('ground run: single base block', () => vet.run('blocks.length === 1 && runLaunch === 0'));
vet.run('score = 1500; while (blocks.length < 80) blocks.push({x:0,w:96,col:"#fff"});');
vet.run('state = "playing"; gameOver("fall")');
check('ground gameOver: best score updates', () => vet.run('best === 1500'));
check('ground gameOver: best height updates', () => vet.run('bestHeight === 80'));

// non-endless modes ignore the launch selection
vet.run('mode = "pure"; launch = 1; prog = 3; resetRun()');
check('PURE mode: checkpoint launch ignored', () => vet.run('runLaunch === 0 && blocks.length === 1'));
vet.run('mode = "daily"; resetRun()');
check('DAILY mode: checkpoint launch ignored', () => vet.run('runLaunch === 0 && blocks.length === 1'));
vet.run('mode = "time"; resetRun()');
check('TIME mode: checkpoint launch ignored', () => vet.run('runLaunch === 0 && blocks.length === 1'));

// ---------- level clear / win-the-game ----------
const lc = makeGame();
lc.run('mode = "endless"; launch = -1; resetRun();');
lc.run('while (blocks.length < 10) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('first reach of stage 1: LEVEL CLEAR banner', () => lc.run('bannerText === "LEVEL CLEAR - ROOFTOPS"'));
check('first reach of stage 1: prog -> 1', () => lc.run('prog === 1'));
check('prog persisted to storage', () => lc.mem.get('skystack-tiers') === '1' ? true : 'stored: ' + lc.mem.get('skystack-tiers'));
check('tier advanced past cleared stage', () => lc.run('tier === 1'));

// repeat visit: plain milestone banner, not LEVEL CLEAR
lc.run('resetRun(); while (blocks.length < 10) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('re-reaching a cleared stage: plain milestone banner', () => lc.run('bannerText === "30M - ROOFTOPS"'));
check('re-reaching a cleared stage: prog unchanged', () => lc.run('prog === 1'));

// beat the game
lc.run('prog = 8; resetRun(); tier = 8;');
lc.run('while (blocks.length < 500) blocks.push({x:0,w:96,col:"#fff"});');
lc.run('afterPlace({x:0,w:96,col:"#fff"}, false, W/2)');
check('reaching THE STARS first time: SKY CONQUERED banner', () => lc.run('bannerText === "SKY CONQUERED!"'));
check('game beaten: prog = 9 (all stages)', () => lc.run('prog === 9'));
check('renderSkyMap champion state runs (crown/gate)', () => { lc.run('renderSkyMap()'); return true; });

// ---------- map tap input ----------
const tap = makeGame({ 'skystack-height': '60' });   // prog seeds to 3
tap.run('mode = "endless"; state = "home"; skyMap = true;');
// pos() is a top-level function declaration -> reassignable on the sandbox global
tap.run('var __p = {x:0,y:0}; pos = () => __p;');
check('map tap: cleared stage selects launch pad', () => tap.run(
  '(() => { const L = skyMapNodes(); __p = {x:L.pts[1].x, y:L.pts[1].y}; pressDown({}); return launch === 1 && skyMap === true; })()'));
check('map tap: launch persisted', () => tap.mem.get('skystack-launch') === '1' ? true : 'stored: ' + tap.mem.get('skystack-launch'));
check('map tap: locked stage refused', () => tap.run(
  '(() => { const L = skyMapNodes(); __p = {x:L.pts[6].x, y:L.pts[6].y}; pressDown({}); return launch === 1; })()'));
check('map tap: START resets to ground', () => tap.run(
  '(() => { const L = skyMapNodes(); __p = {x:L.start.x, y:L.start.y}; pressDown({}); return launch === -1; })()'));
check('map tap: elsewhere closes the map', () => tap.run(
  '(() => { __p = {x:2, y:2}; pressDown({}); return skyMap === false; })()'));
check('map tap in PURE mode: tap just closes, no selection', () => tap.run(
  '(() => { mode = "pure"; skyMap = true; launch = -1; const L = skyMapNodes(); __p = {x:L.pts[1].x, y:L.pts[1].y}; pressDown({}); return skyMap === false && launch === -1; })()'));
check('map tap: label chip (toward center) also selects', () => tap.run(
  '(() => { mode = "endless"; skyMap = true; launch = -1; const L = skyMapNodes(); const side = L.pts[2].x < W/2 ? 1 : -1; __p = {x:L.pts[2].x + side*40, y:L.pts[2].y}; pressDown({}); return launch === 2 && skyMap === true; })()'));
check('map tap: outer (deco) side does not select', () => tap.run(
  '(() => { launch = -1; const L = skyMapNodes(); const side = L.pts[2].x < W/2 ? 1 : -1; __p = {x:L.pts[2].x - side*40, y:L.pts[2].y}; pressDown({}); return launch === -1 && skyMap === false; })()'));
check('3D map helpers exist (mapNode3D, mapChip, dkHex)', () => tap.run(
  'typeof mapNode3D === "function" && typeof mapChip === "function" && typeof dkHex === "function"'));
check('dkHex darkens a hex color', () => tap.run('dkHex("#FFD75E", .5) === "rgb(128,108,47)"'));

// ---------- home screen label ----------
const home = makeGame({ 'skystack-height': '60', 'skystack-launch': '1' });
check('home: LAUNCH label shows for selected checkpoint', () => {
  home.run('mode = "endless"; state = "home";');
  home.run('var __texts = []; var __txt0 = txt; txt = function(t,...a){ __texts.push(String(t)); return __txt0(t,...a); };');
  home.run('renderHome()');
  return home.run('__texts.some(t => t === "LAUNCH: TREETOPS 75M")');
});
check('home: no LAUNCH label on ground runs', () => {
  home.run('launch = -1; __texts = []; renderHome()');
  return home.run('!__texts.some(t => t.indexOf("LAUNCH:") === 0)');
});

// ---------- static checks ----------
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('sw.js cache bumped to v24', () => /const CACHE = 'skystack-v24'/.test(sw));
check('no merge conflict markers in index.html', () => !/^(<{7}|={7}|>{7})/m.test(html));
check('no stray skymap.png in repo', () => !fs.existsSync(path.join(ROOT, 'skymap.png')));
check('launch key stored under skystack-launch', () => /store\.set\('skystack-launch'/.test(src));
check('map hint text for non-endless modes', () => /CHECKPOINTS: ENDLESS ONLY/.test(src));

// ---------- report ----------
let pass = 0, fail = 0;
for (const [ok, name, detail] of results) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '   [' + detail + ']'));
}
console.log('\n' + pass + '/' + results.length + ' checks passed' + (fail ? ' — ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
