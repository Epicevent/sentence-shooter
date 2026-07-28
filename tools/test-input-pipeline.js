const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const repo = path.join(__dirname, '..');
// SHOOTER_REV=HEAD is useful as a known-bad control while this change is uncommitted.
const html = process.env.SHOOTER_REV
  ? childProcess.execFileSync('git', ['show', process.env.SHOOTER_REV + ':index.html'], { cwd: repo, encoding: 'utf8' })
  : fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const viewport = { w:800, h:600 };
function element(id){
  const classes = new Set(id === 'start' ? [] : ['hidden']);
  return {
    id, style: {}, textContent: '', innerHTML: '', offsetWidth: 800,
    classList: {
      add: (...xs) => xs.forEach(x => classes.add(x)),
      remove: (...xs) => xs.forEach(x => classes.delete(x)),
      contains: x => classes.has(x),
    },
    addEventListener(){}, appendChild(){}, remove(){},
    getBoundingClientRect(){ return { left: 0, top: 0,
      width: id === 'wrap' ? viewport.w : 800, height: id === 'wrap' ? viewport.h : 600 }; },
  };
}

const elements = new Map();
const canvasContext = new Proxy({
  measureText: text => ({ width: String(text).length * 9 }),
  createLinearGradient: () => ({ addColorStop(){} }),
}, { get: (target, key) => key in target ? target[key] : () => {} });

function getElement(id){
  if (!elements.has(id)) elements.set(id, element(id));
  const el = elements.get(id);
  if (id === 'cv') el.getContext = () => canvasContext;
  return el;
}

const storage = new Map();
const fetchCalls = [];
const windowHandlers = {};
const sandbox = {
  console, performance,
  Math, Date, JSON, Object, Array, String, Number, RegExp, Set, Map, TextEncoder,
  setTimeout: () => 0, clearTimeout(){}, requestAnimationFrame(){},
  getComputedStyle: () => ({ opacity: '1' }),
  fetch: async (...args) => { fetchCalls.push(args); return { ok: true }; },
  localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)) },
  navigator: { userAgent: 'pipeline-test', vibrate(){} },
  document: {
    getElementById: getElement,
    createElement: id => element(id),
    addEventListener(){},
  },
};
sandbox.window = sandbox;
sandbox.window.addEventListener = (type, fn) => { windowHandlers[type] = fn; };
sandbox.window.devicePixelRatio = 1;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'index.html' });

function run(code){ return vm.runInContext(code, sandbox); }

run(`
  startGame('type');
  globalThis.initialStockEvent = TRACE.events.find(e => e.type === 'item_stock');
  W = 800; H = 600; g.speed = 0; g.tabs = 2; g.shields = 0;
  g.sentence = ['Alpha', 'Bravo']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  const makeWord = (text, order, x) => {
    const hp = sigLen(text);
    return { text, order, x, y: 180 + order*55, w: 100, h: 32, hp, maxhp: hp,
      flash: 0, consumed: 0, committed: 0, resolved: false, resolvedAt: 0,
      settled: false, pts: 0, row: Math.floor(order/3), col: order%3 };
  };
  g.words.push(makeWord('Alpha', 0, 100), makeWord('Bravo', 1, 300));
  g.t0 = performance.now(); TRACE.events.length = 0;
`);
assert.deepStrictEqual(Array.from(run(`[initialStockEvent.tabs, initialStockEvent.shields]`)), [2, 1],
  'each trace must begin with the item stock granted to the player');

run(`traceSample(34);`);
assert.strictEqual(run('TRACE.meta.pipeline'), 4, 'replay-complete scene telemetry must use pipeline 4');
assert.strictEqual(run('TRACE.samples[0].scene.words.length'), 2,
  'each dynamic sample must retain every word in the current scene');
assert.strictEqual(run('TRACE.samples[0].scene.words[0].length'), 17,
  'word scene rows must retain render/logical x/y geometry, combat, visibility, occlusion, alpha, and recoil fields');
assert.strictEqual(run('TRACE.samples[0].scene.words[0][9] & 4'), 4,
  'the current target must remain identifiable in the dynamic scene');

run(`handleKey('A'); handleTab();`);
assert.strictEqual(run('g.idx'), 1, 'Tab must open the next word without waiting for a missile impact');
assert.strictEqual(run('g.tabs'), 1, 'one Tab consumes exactly one charge');
assert.deepStrictEqual(Array.from(run(`{
  const e = TRACE.events.find(e => e.type === 'tab');
  [e.at, e.left, Number.isFinite(e.d)];
}`)), [1, 1, true], 'Tab telemetry must show started progress, remaining stock, and threat distance');
assert.strictEqual(run(`TRACE.events.find(e => e.type === 'key_input').scene.words.length`), 2,
  'each key event must retain the exact full scene visible at input time');
assert.strictEqual(run(`TRACE.events.find(e => e.type === 'tab').scene.words.length`), 2,
  'each Tab event must retain the exact full scene visible at item-use time');
assert.deepStrictEqual(Array.from(run(`[
  TRACE.events.find(e => e.type === 'key_input').order,
  TRACE.events.find(e => e.type === 'tab').order,
  TRACE.events.find(e => e.type === 'kill').order
]`)), [0, 0, 0], 'input, item, and verdict events must identify duplicate-text words by order');
assert.strictEqual(run('g.words[0].resolved && g.words[0].hp === g.words[0].maxhp'), true,
  'the first word must remain visually alive after its logical death');

run(`const before = g.tabs; handleTab(); globalThis.unstartedTab = [before, g.tabs, g.idx];`);
assert.deepStrictEqual(Array.from(run('globalThis.unstartedTab')), [1, 1, 1],
  'Tab on an unstarted next word must not consume another charge');

const plinksBefore = run('g.plinks');
run(`tapAt(150, 196);`);
assert.strictEqual(run('g.plinks'), plinksBefore, 'a presentation-only corpse must not count as a wrong target');

run(`g.freeze = 0.05; handleKey('B'); handleTab();`);
assert.strictEqual(run('g.idx'), 2, 'a second word must resolve in the same input burst');
assert.strictEqual(run('g.freeze'), 0.05, 'presentation hit-stop must not be consumed to accept input');
assert.strictEqual(run('g.tabs'), 0, 'two distinct completions consume two charges');
assert.deepStrictEqual(Array.from(run(`TRACE.events.filter(e => e.type === 'tab').map(e => e.left)`)), [1, 0],
  'each Tab event must expose the post-use stock');
assert.strictEqual(run('g.words.filter(w => w.resolved).length'), 2,
  'both resolved words should coexist on screen before their missiles arrive');
assert.strictEqual(run(`TRACE.events.filter(e => e.type === 'kill').length`), 2,
  'logical kill telemetry must be emitted at verdict time');
assert.strictEqual(run(`TRACE.events.filter(e => e.type === 'settle').length`), 0,
  'visual settle telemetry must not fire before impacts');

for (let i = 0; i < 900 && run('g.words.length'); i++) run('update(0.016)');
assert.strictEqual(run('g.words.length'), 0, 'all presentation-only words must eventually explode and retire');
assert.strictEqual(run(`TRACE.events.filter(e => e.type === 'settle').length`), 2,
  'each logical kill must receive exactly one visual settlement');

run(`
  g.sentence = ['Gamma', 'Delta']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  g.words.push(makeWord('Gamma', 0, 100), makeWord('Delta', 1, 300));
  tapAt(150, 196); tapAt(350, 251);
`);
assert.strictEqual(run('g.idx'), 2, 'rapid pointer targeting must also advance on committed volleys');
assert.strictEqual(run('g.fireQueues.length'), 2, 'the second target must not replace the first target firing queue');
run('spawnMissiles(0.016)');
assert.strictEqual(run('new Set(g.missiles.map(m => m.target.order)).size'), 2,
  'both independent target queues must keep firing');
run(`globalThis.transitionSettleBefore = TRACE.events.filter(e => e.type === 'settle').length; nextSentence();`);
assert.strictEqual(run(`TRACE.events.filter(e => e.type === 'settle').length - globalThis.transitionSettleBefore`), 2,
  'sentence transition must settle every committed target whose missile tail is still pending');
assert.strictEqual(run(`TRACE.events.filter(e => e.type === 'settle' && e.forced).length`), 2,
  'transition-forced settlements must remain distinguishable in telemetry');

run(`
  g.sentence = ['Echo']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  g.words.push(makeWord('Echo', 0, 100)); g.missGraceUntil = 0; g.plinks = 0;
  TRACE.events.length = 0;
  globalThis.missBurstY0 = g.words[0].y;
  handleKey('x'); handleKey('y'); handleKey('z');
  globalThis.missBurstY1 = g.words[0].y;
`);
assert.strictEqual(run('g.plinks'), 1,
  'one rapid wrong-word burst must apply only one gameplay penalty');
assert.strictEqual(run(`TRACE.events.filter(e => e.type === 'miss').length`), 1,
  'one rapid wrong-word burst must emit one penalized miss');
assert.strictEqual(run(`TRACE.events.filter(e => e.type === 'miss_suppressed').length`), 2,
  'extra keys in the same wrong-word burst must remain visible in telemetry');
assert.strictEqual(run('globalThis.missBurstY1 - globalThis.missBurstY0'), 12,
  'one rapid wrong-word burst must lunge the formation only once');
run(`handleKey('E'); handleKey('q');`);
assert.strictEqual(run('g.plinks'), 2,
  'correct progress must reset the burst boundary so a new mistake is penalized');

run(`
  g.sentence = ['Combo', 'Tail']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  const comboWord = makeWord('Combo', 0, 100); g.words.push(comboWord);
  g.combo = 11; g.tabs = 2; TRACE.events.length = 0;
  resolveWord(comboWord);
`);
assert.deepStrictEqual(Array.from(run(`{
  const e = TRACE.events.find(e => e.type === 'item_gain');
  [e.item, e.reason, e.left, g.tabs];
}`)), ['tab', 'combo12', 3, 3], 'combo rewards must expose their reason and resulting stock');

run(`
  g.sentence = ['Target', 'Wing']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  const targetWord = makeWord('Target', 0, 100), wingWord = makeWord('Wing', 1, 300);
  targetWord.col = wingWord.col = 0; targetWord.row = 0; wingWord.row = 1; wingWord.x = targetWord.x;
  targetWord.y = 120; wingWord.y = H - 64 - wingWord.h + 1;
  g.words.push(targetWord, wingWord); g.speed = 0; g.wordT = 0; g.freeze = 0; TRACE.events.length = 0;
  globalThis.targetBeforeWingRecycle = targetWord.y;
  update(.016); globalThis.wingImmediateScene = traceScene();
  wingWord.recoilAt -= RECOIL_MS / 2; globalThis.wingMidScene = traceScene();
  wingWord.recoilAt -= RECOIL_MS; globalThis.wingSettledScene = traceScene();
`);
assert.strictEqual(run(`TRACE.events.some(e => e.type === 'wing_recycle' && e.effect === 'visible_recoil')`), true,
  'a later-order word crossing the line must record an on-screen recoil instead of an offscreen teleport');
assert.strictEqual(run(`[wingImmediateScene, wingMidScene, wingSettledScene].every(s => s.words.find(w => w[0]===1)[11] === 100)`), true,
  'a recycled later-order word must remain readable throughout its complete rebound');
assert.strictEqual(run(`Math.abs(g.words.find(w=>w.order===0).y-targetBeforeWingRecycle)<1`), true,
  'a later-order recycle must not rewind the target logical position and make the game immortal');
run(`
  g.sentence = Array.from({length: 10}, (_,i) => 'Cross' + i); g.idx = 0; g.words = [];
  const upper = makeWord('Cross7', 7, 140), lower = makeWord('Cross1', 1, 128);
  upper.col = lower.col = 0; upper.row = 2; lower.row = 3;
  upper.y = 575; lower.y = 616; g.words.push(upper, lower); TRACE.events.length = 0;
  beginWordRecoil(lower, safeWingY(lower,performance.now()), performance.now(), recoilRailX(lower), false);
  globalThis.recoilOverlapFrames = 0;
  for (let ms=0; ms<=RECOIL_MS; ms+=13){
    for (const w of g.words) w.recoilAt = performance.now() - ms;
    const s=traceScene(), a=s.words[0], b=s.words[1];
    const dx=Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
    const dy=Math.max(0,Math.min(a[2]+a[4],b[2]+b[4])-Math.max(a[2],b[2]));
    if (dx*dy>0) recoilOverlapFrames++;
  }
`);
assert.strictEqual(run('recoilOverlapFrames'), 0,
  'a same-column wing rebound must use its side rail instead of crossing through another word');
run(`
  g.sentence = Array.from({length: 9},(_,i)=>'Sim'+i); g.idx=0; g.words=[];
  for(let i=0;i<9;i++){
    const w=makeWord('Sim'+i,i,0); w.col=i%3; w.row=Math.floor(i/3); w.x=formationLaneX(w);
    w.y=260+w.row*70; g.words.push(w);
  }
  for(const i of [3,4,5]) g.words[i].y=H-64-g.words[i].h+1;
  g.speed=0; g.wordT=0; g.freeze=0; TRACE.events.length=0; update(.016);
  globalThis.simultaneousWingOverlapFrames=0;
  const started=performance.now(), delays=Object.fromEntries([3,4,5].map(i=>[i,g.words[i].recoilAt-started]));
  for(let ms=0;ms<=RECOIL_MS*3+120;ms+=13){
    const frameNow=performance.now();
    for(const i of [3,4,5]) g.words[i].recoilAt=frameNow+delays[i]-ms;
    const ws=traceScene().words;
    for(let i=0;i<ws.length;i++)for(let j=i+1;j<ws.length;j++){
      const a=ws[i],b=ws[j],dx=Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
      const dy=Math.max(0,Math.min(a[2]+a[4],b[2]+b[4])-Math.max(a[2],b[2]));
      if(dx*dy>0) simultaneousWingOverlapFrames++;
    }
  }
`);
assert.strictEqual(run('simultaneousWingOverlapFrames'),0,
  'simultaneous wing rebounds must reserve distinct side rails and return heights');
run(`
  g.sentence = ['Rebound']; g.idx = 0; g.words = []; g.fireQueues = []; g.freeze = 0;
  const reboundTarget = makeWord('Rebound', 0, 100);
  reboundTarget.y = 48; reboundTarget.recoilFromY = 500; reboundTarget.recoilAt = performance.now();
  g.words.push(reboundTarget);
  const hitY = wordVisualY(reboundTarget);
  g.missiles = [{ x:reboundTarget.x + reboundTarget.w/2, y:hitY + reboundTarget.h/2,
    vx:0, vy:0, target:reboundTarget, dmg:1, letter:'R' }];
  update(0); globalThis.reboundHp = reboundTarget.hp;
`);
assert.strictEqual(run('reboundHp'), run(`sigLen('Rebound') - 1`),
  'missiles must collide with the visible rebound position rather than the separated logical position');

run(`
  g.sentence = ['Shielded']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  const shieldWord = makeWord('Shielded', 0, 100); shieldWord.y = H - 64 - shieldWord.h;
  g.words.push(shieldWord); g.shields = 1; TRACE.events.length = 0;
  loseLife(shieldWord);
`);
assert.deepStrictEqual(Array.from(run(`{
  const e = TRACE.events.find(e => e.type === 'shield_absorb');
  [e.before.inv[1], e.after.inv[1], Math.abs(e.before.words[0][2] - e.after.words[0][2]) <= 2,
    Math.round(e.after.words[0][14]), e.after.words[0][15] > 0,
    e.after.banners.some(b => b[1] === 'SHIELD'), e.effect];
}`)), [1, 0, true, 48, true, true, 'recoil'],
  'shield telemetry must separate the retained render position from the immediate safe logical regroup');
run(`g.words[0].recoilAt -= RECOIL_MS; globalThis.settledShieldScene = traceScene();`);
assert.strictEqual(run('settledShieldScene.words[0][11]'), 100,
  'the repelled target must settle fully on screen instead of vanishing above the viewport');
assert.strictEqual(run(`TRACE.events.some(e => e.type === 'formation_recoil' && e.reason === 'shield')`), true,
  'the dynamic trace must retain the exact shield recoil movement');

run(`
  g.sentence = Array.from({length: 9}, (_,i) => 'Visible' + i); g.idx = 0;
  g.words = g.sentence.map((text,i) => {
    const w = makeWord(text, i, 30 + (i%3)*240);
    w.y = i === 0 ? H - 64 - w.h : -560 + i*95;
    return w;
  });
  g.shields = 1; TRACE.events.length = 0; loseLife(g.words[0]);
  for (const w of g.words) w.recoilAt -= RECOIL_MS;
  globalThis.regroupedScene = traceScene();
`);
assert.strictEqual(run(`regroupedScene.words.filter(w => !(w[9]&1)).every(w => w[11] === 100)`), true,
  'after a shield rebound every live word must finish fully readable on screen');
assert.strictEqual(run(`new Set(regroupedScene.words.map(w => w[2])).size`), 3,
  'the rebound must restore the original three-row formation instead of stacking words together');

run(`
  g.sentence = Array.from({length: 9}, (_,i) => 'Visible' + i); g.idx = 0;
  g.words = g.sentence.map((text,i) => makeWord(text, i, 30 + (i%3)*240));
  g.words[0].y = 500; g.lives = 3; g.shields = 0; g.viewportPaused = false;
  g.messageBeforePause = null; TRACE.events.length = 0;
  globalThis.resizeConsumedBefore = g.words[0].consumed;
`);
viewport.h = 328;
run(`resize(); handleKey('V'); update(5); globalThis.resizePausedState = {
  paused:g.viewportPaused, lives:g.lives, consumed:g.words[0].consumed,
  warning:!$('resize-warning').classList.contains('hidden')
};`);
assert.deepStrictEqual(Array.from(run(`Object.values(resizePausedState)`)), [true, 3, 0, true],
  'shrinking below the safe height must pause time, collisions, and input instead of killing the player');
assert.strictEqual(run(`TRACE.events.some(e => e.type === 'viewport_pause' && e.h === 328)`), true,
  'the trace must record the exact viewport pause boundary');
assert.strictEqual(run(`TRACE.events.find(e => e.type === 'viewport').after.vp`), 1,
  'the resize event must retain complete before/after scenes including paused state');
viewport.h = 600;
run(`
  resize();
  globalThis.resizeRestoredImmediateScene = traceScene();
  for (const w of g.words) w.recoilAt -= RECOIL_MS;
  globalThis.resizeRestoredScene = traceScene();
  const countOverlap = scene => {
    const ws = scene.words;
    let count = 0;
    for (let i=0;i<ws.length;i++) for(let j=i+1;j<ws.length;j++){
      const a=ws[i], b=ws[j];
      const dx=Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
      const dy=Math.max(0,Math.min(a[2]+a[4],b[2]+b[4])-Math.max(a[2],b[2]));
      if (dx*dy>0) count++;
    }
    return count;
  };
  globalThis.resizeImmediateOverlapCount=countOverlap(resizeRestoredImmediateScene);
  globalThis.resizeOverlapCount=countOverlap(resizeRestoredScene);
`);
assert.deepStrictEqual(Array.from(run(`[
  g.viewportPaused, $('resize-warning').classList.contains('hidden'),
  resizeRestoredImmediateScene.words.every(w => w[11] === 100),
  resizeImmediateOverlapCount, resizeRestoredScene.words.every(w => w[11] === 100), resizeOverlapCount,
  TRACE.events.some(e => e.type === 'viewport_resume'),
  TRACE.events.some(e => e.type === 'formation_recoil' && e.reason === 'viewport_resume')
]`)), [false, true, true, 0, true, 0, true, true],
  'restoring the window must resume immediately in a fully visible, non-overlapping formation');

run(`
  g.sentence = Array.from({length: 12}, (_,i) => 'Word' + i); g.idx = 0; g.words = [];
  for (let i=0;i<12;i++) g.words.push(makeWord('Word' + i, i, 20 + (i%3)*230));
  g.missiles = Array.from({length: 12}, (_,i) => ({ x:100+i*7, y:500-i*9, vx:i*3, vy:-220,
    target:g.words[i%g.words.length], dmg:1, letter:i%2 ? 'x' : undefined }));
  g.parts = Array.from({length: 30}, (_,i) => ({ x:i*9, y:i*7, vx:0, vy:30, life:.8, t:.2,
    color:'#aef0ae', text:i%10===0 ? 'x' : undefined }));
  TRACE.samples.length = 0;
  for (let i=0;i<1440;i++) traceSample(78);
  globalThis.representativeTraceBytes = JSON.stringify(TRACE).length;
`);
assert.ok(run('representativeTraceBytes') > 500000,
  'a three-minute representative trace must retain substantially more than summary telemetry');
assert.ok(run('representativeTraceBytes') < 12000000,
  'a three-minute representative trace must remain within the trace ingestion limit');

run(`
  traceStart('type'); $('msg').textContent = '🛡 replay'; traceSample(34); traceSend(false);
`);
const sentTraceBody = fetchCalls.at(-1)[1].body;
assert.strictEqual(JSON.parse(sentTraceBody).meta.bytes, new TextEncoder().encode(sentTraceBody).byteLength,
  'the declared payload size must equal the actual UTF-8 body size');

const fetchesBeforeExit = fetchCalls.length;
run(`traceStart('type'); TRACE.samples.push({ t: 1 }); tEv('kill', { w: 'Fast' });`);
windowHandlers.pagehide();
assert.strictEqual(fetchCalls.length, fetchesBeforeExit + 1,
  'a short session with real gameplay events must be saved on page exit');
assert.strictEqual(fetchCalls.at(-1)[1].keepalive, true,
  'page-exit trace delivery must survive navigation teardown');

assert.ok(source.includes('ctx.globalAlpha = claimAlpha'),
  'resolved targets must visibly recede while their committed missiles settle');
assert.ok(source.includes('renderY = wordVisualY(t)') && source.includes('m.y >= renderY'),
  'homing missiles must chase the visible rebound position, not the hidden logical position');
assert.ok(source.includes("$('hud').appendChild(b)"),
  'reward and shield banners must live in the HUD instead of covering live word text');

console.log('input pipeline regression tests passed; representative 3-minute visual trace bytes:',
  run('representativeTraceBytes'));
