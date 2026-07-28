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
    getBoundingClientRect(){ return { left: 0, top: 0, width: 800, height: 600 }; },
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
  Math, Date, JSON, Object, Array, String, Number, RegExp, Set, Map,
  setTimeout: () => 0, clearTimeout(){}, requestAnimationFrame(){},
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
      settled: false, pts: 0 };
  };
  g.words.push(makeWord('Alpha', 0, 100), makeWord('Bravo', 1, 300));
  g.t0 = performance.now(); TRACE.events.length = 0;
`);
assert.deepStrictEqual(Array.from(run(`[initialStockEvent.tabs, initialStockEvent.shields]`)), [2, 1],
  'each trace must begin with the item stock granted to the player');

run(`handleKey('A'); handleTab();`);
assert.strictEqual(run('g.idx'), 1, 'Tab must open the next word without waiting for a missile impact');
assert.strictEqual(run('g.tabs'), 1, 'one Tab consumes exactly one charge');
assert.deepStrictEqual(Array.from(run(`{
  const e = TRACE.events.find(e => e.type === 'tab');
  [e.at, e.left, Number.isFinite(e.d)];
}`)), [1, 1, true], 'Tab telemetry must show started progress, remaining stock, and threat distance');
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

const fetchesBeforeExit = fetchCalls.length;
run(`traceStart('type'); TRACE.samples.push({ t: 1 }); tEv('kill', { w: 'Fast' });`);
windowHandlers.pagehide();
assert.strictEqual(fetchCalls.length, fetchesBeforeExit + 1,
  'a short session with real gameplay events must be saved on page exit');
assert.strictEqual(fetchCalls.at(-1)[1].keepalive, true,
  'page-exit trace delivery must survive navigation teardown');

assert.ok(source.includes('ctx.globalAlpha = claimAlpha'),
  'resolved targets must visibly recede while their committed missiles settle');

console.log('input pipeline regression tests passed');
