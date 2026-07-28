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
const scheduledTimers = [];
const rafCalls = [];
const sandbox = {
  console, performance,
  Math, Date, JSON, Object, Array, String, Number, RegExp, Set, Map, TextEncoder, URLSearchParams,
  viewport, windowHandlers, location:{search:'?ab=A&seed=20260728'},
  setTimeout: (fn, delay = 0) => {
    const timer = { id: scheduledTimers.length + 1, fn, delay, cleared:false };
    scheduledTimers.push(timer);
    return timer.id;
  },
  clearTimeout(id){ const timer = scheduledTimers.find(t => t.id === id); if (timer) timer.cleared = true; },
  requestAnimationFrame(fn){ rafCalls.push(fn); },
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

assert.strictEqual(run('ITEMS.length'), 70,
  'the pool must contain the original 12 items plus every one of the 58 photographed workbook items');
assert.strictEqual(run(`ITEMS.filter(item=>item.source&&item.source.startsWith('photo-')).length`), 58,
  'every photographed problem must remain identifiable in content and trace audits');
assert.strictEqual(run(`new Set(ITEMS.map(item=>item.id)).size`), 70,
  'the expanded pool must retain a unique stable id for every item');

run(`
  startGame('type');
  globalThis.initialStockEvent = TRACE.events.find(e => e.type === 'item_stock');
  globalThis.initialStartEvent = TRACE.events.find(e => e.type === 'sentence_start');
  globalThis.initialStudyItem = [g.item.ask, g.sentence.length,
    g.words.filter(w => w.isDecoy).length, g.words.every(w => w.y >= 108), $('prompt').textContent || $('prompt').innerHTML];
  W = 800; H = 600; g.speed = 0; g.tabs = 2; g.shields = 0;
  g.sentence = ['Alpha', 'Bravo']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  const makeWord = (text, order, x) => {
    const hp = sigLen(text);
    return { text, order, x, y: 180 + order*55, w: 100, h: 32, hp, maxhp: hp,
      flash: 0, consumed: 0, committed: 0, resolved: false, resolvedAt: 0,
      settled: false, pts: 0, row: Math.floor(order/3), col: order%3, holding: false, threatY: null };
  };
  g.words.push(makeWord('Alpha', 0, 100), makeWord('Bravo', 1, 300));
  g.t0 = performance.now(); TRACE.events.length = 0;
`);
assert.deepStrictEqual(Array.from(run(`[initialStockEvent.tabs, initialStockEvent.shields]`)), [4, 1],
  'each trace must begin with the item stock granted to the player');
assert.strictEqual(run(`initialStudyItem[0].length > 10 && initialStudyItem[1] >= 3 &&
  initialStudyItem[2] >= 0 && initialStudyItem[3] && initialStudyItem[4].includes('A:')`), true,
  'every run must start immediately with a visible TOEFL dialogue and ordered answer chunks');
assert.strictEqual(run(`TRACE.meta.ab_variant === 'A' && Number.isInteger(TRACE.meta.ab_seed) &&
  initialStartEvent.answer_count === initialStudyItem[1] &&
  initialStartEvent.words.length === initialStudyItem[1] + initialStudyItem[2]`), true,
  'A/B traces must identify the variant, seed, answer boundary, and every offered source chunk');

run(`traceSample(34);`);
assert.strictEqual(run('TRACE.meta.pipeline'), 4, 'replay-complete scene telemetry must use pipeline 4');
assert.strictEqual(run('TRACE.samples[0].scene.words.length'), 2,
  'each dynamic sample must retain every word in the current scene');
assert.strictEqual(run('TRACE.samples[0].scene.words[0].length'), 17,
  'word scene rows must retain render/logical x/y geometry, combat, visibility, occlusion, alpha, and recoil fields');
assert.strictEqual(run('TRACE.samples[0].scene.words[0][9] & 4'), 4,
  'the current target must remain identifiable in the dynamic scene');
assert.strictEqual(run(`TRACE.meta.enemy_shot_fields.at(-1)`), 'graze_armed',
  'replay-complete telemetry must retain a near-miss candidate before it becomes a successful graze');

run(`handleKey('A'); handleTab();`);
assert.strictEqual(run('g.idx'), 1, 'Tab must open the next word without waiting for a missile impact');
assert.strictEqual(run('g.tabs'), 2, 'confirming a typed focus must not consume an assist charge');
assert.deepStrictEqual(Array.from(run(`{
  const e = TRACE.events.find(e => e.type === 'focus_confirm');
  [e.prefix, e.order, e.correct];
}`)), ['a', 0, true], 'focus confirmation telemetry must identify the visible prefix and chosen chunk');
assert.strictEqual(run(`TRACE.events.find(e => e.type === 'key_input').scene.words.length`), 2,
  'each key event must retain the exact full scene visible at input time');
assert.strictEqual(run(`TRACE.events.find(e => e.type === 'focus_confirm').scene.words.length`), 2,
  'each focus-confirm event must retain the exact full scene visible at confirmation time');
assert.deepStrictEqual(Array.from(run(`[
  TRACE.events.find(e => e.type === 'key_input').order,
  TRACE.events.find(e => e.type === 'focus_confirm').order,
  TRACE.events.find(e => e.type === 'kill').order
]`)), [null, 0, 0], 'raw typing must stay answer-neutral while confirmation and verdict identify the chosen block');
assert.strictEqual(run('g.words[0].resolved && g.words[0].hp === g.words[0].maxhp'), true,
  'the first word must remain visually alive after its logical death');

run(`const before = g.tabs; handleTab(); globalThis.unstartedTab = [before, g.tabs, g.idx];`);
assert.deepStrictEqual(Array.from(run('globalThis.unstartedTab')), [2, 1, 2],
  'Tab must spend one charge to auto-build an untouched next chunk in both A and B');

const plinksBefore = run('g.plinks');
run(`tapAt(150, 196);`);
assert.strictEqual(run('g.plinks'), plinksBefore, 'a presentation-only corpse must not count as a wrong target');

run(`g.freeze = 0.05;`);
assert.strictEqual(run('g.idx'), 2, 'typed confirmation and stocked assist must both resolve immediately');
assert.strictEqual(run('g.freeze'), 0.05, 'presentation hit-stop must not alter accepted input state');
assert.strictEqual(run('g.tabs'), 1, 'only the no-focus assist completion may consume stock');
assert.deepStrictEqual(Array.from(run(`TRACE.events.filter(e => e.type === 'tab').map(e => e.left)`)), [1],
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
  g.sentence = ['Committee', 'Campus', 'Tail']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  g.lock = null; g.typePrefix = ''; g.missGraceUntil = 0; g.tabs = 3; g.combo=0; TRACE.events.length = 0;
  g.words.push(makeWord('Committee', 0, 100), makeWord('Campus', 1, 300), makeWord('Tail', 2, 500));
  handleKey('c');
  globalThis.ambiguousInitial = [g.words[0].consumed, g.words[1].consumed, g.lock, g.typePrefix, g.plinks];
  handleKey('o');
  globalThis.disambiguatedTarget = [g.words[0].consumed, g.words[1].consumed, g.lock && g.lock.order,g.idx,g.tabs];
  handleTab();
  globalThis.confirmedFocus=[g.idx,g.tabs,g.words[0].resolved,
    TRACE.events.some(e=>e.type==='focus_confirm'&&e.correct)];
`);
assert.deepStrictEqual(Array.from(run('ambiguousInitial')), [0, 0, null, 'c', 0],
  'a shared first letter must stay neutral instead of silently selecting the correct word');
assert.deepStrictEqual(Array.from(run('disambiguatedTarget')), [0, 0, 0, 0, 3],
  'typing enough letters to identify one visible word must focus it without firing or spending stock');
assert.deepStrictEqual(Array.from(run('confirmedFocus')), [1,3,true,true],
  'Tab must confirm a unique typed focus for free and only then judge it');
assert.strictEqual(run(`TRACE.events.some(e => e.type === 'type_prefix' && e.prefix === 'c' && e.candidates.length === 2)`), true,
  'ambiguous selection must remain observable without marking either candidate as the answer');

run(`
  g.sentence=['whether','tail']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
  g.lock=null; g.typePrefix=''; g.plinks=0; g.tabs=3; g.shotJamUntil=0; TRACE.events.length=0;
  const whether2=makeWord('whether',0,100), will2=makeWord('will accept',2,300);
  will2.isDecoy=true; g.words.push(whether2,will2);
  handleKey('w');
  globalThis.wFocus=[focusCandidates(g.typePrefix).map(w=>w.order),g.lock,g.typePrefix,g.plinks,g.tabs];
  handleTab();
  globalThis.blockedFocus=[g.idx,g.typePrefix,g.plinks,g.tabs,
    TRACE.events.some(e=>e.type==='focus_confirm_blocked')];
  handleKey('w');
  globalThis.invalidFocus=[g.idx,g.typePrefix,g.lock,g.plinks,g.tabs,
    TRACE.events.some(e=>e.type==='focus_clear'&&e.rejected==='ww')];
`);
assert.deepStrictEqual(JSON.parse(JSON.stringify(run('wFocus'))), [[0,2],null,'w',0,3],
  'typing w must visibly focus every live w candidate without disclosing the correct one');
assert.deepStrictEqual(Array.from(run('blockedFocus')), [0,'w',0,3,true],
  'Tab on multiple focused forms must neither guess nor consume the assist stock');
assert.deepStrictEqual(Array.from(run('invalidFocus')), [0,'',null,0,3,true],
  'an impossible continuation such as ww must clear focus with no wrong-answer penalty');

run(`
  g.sentence=['whether','tail']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
  g.lock=null; g.typePrefix=''; g.plinks=0; g.tabs=3; g.shotJamUntil=0; g.recoilBank=30;
  g.enemyShots=[]; g.missChain=0; g.lastMissAt=0; TRACE.events.length=0;
  const whether=makeWord('whether',0,100), will=makeWord('will accept',2,300);
  will.isDecoy=true; g.words.push(whether,will);
  handleKey('w'); handleKey('i');
  globalThis.wrongBeforeConfirm=[g.idx,g.plinks,will.err||0,g.tabs,g.lock&&g.lock.order,
    $('msg').textContent.includes('whether')];
  handleTab();
  globalThis.wrongAfterConfirm=[g.idx,g.plinks,will.err>0,g.tabs,g.enemyShots.length,
    $('msg').textContent.includes('whether'),TRACE.events.filter(e=>e.type==='miss').length];
`);
assert.deepStrictEqual(Array.from(run('wrongBeforeConfirm')), [0,0,0,3,2,false],
  'a uniquely focused wrong chunk must remain only a preview until Tab confirmation');
assert.deepStrictEqual(Array.from(run('wrongAfterConfirm')), [0,1,true,3,3,false,1],
  'only Tab confirmation may judge the unique wrong focus, counterfire, and preserve the hidden answer');

run(`
  g.sentence = ['the', 'the']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  g.variant = 'A'; g.lock = null; g.plinks = 0; g.shotJamUntil=0; TRACE.events.length = 0;
  const firstThe = makeWord('the', 0, 100), secondThe = makeWord('the', 1, 300);
  g.words.push(firstThe, secondThe); tapAt(350, 251);
  globalThis.equivalentTap = [g.idx, firstThe.resolved, secondThe.resolved, g.plinks,
    TRACE.events.some(e => e.type === 'equivalent_swap')];
`);
assert.deepStrictEqual(Array.from(run('equivalentTap')), [1, false, true, 0, true],
  'identical visible chunks must be interchangeable instead of creating an impossible spatial guess');
run(`
  g.sentence=['the','the']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
  g.lock=null; g.typePrefix=''; g.plinks=0; g.tabs=3; g.shotJamUntil=0; TRACE.events.length=0;
  g.words.push(makeWord('the',0,100),makeWord('the',1,300)); handleKey('t');
  globalThis.equivalentTypedBefore=[g.idx,g.words[0].consumed,g.words[1].consumed,g.plinks,g.lock.order,g.tabs];
  handleTab();
  globalThis.equivalentTypedAfter=[g.idx,g.plinks,g.tabs,TRACE.events.some(e=>e.type==='focus_confirm')];
`);
assert.deepStrictEqual(Array.from(run('equivalentTypedBefore')), [0,0,0,0,0,3],
  'typing an exact duplicate must focus one interchangeable identity without silently firing');
assert.deepStrictEqual(Array.from(run('equivalentTypedAfter')), [1,0,3,true],
  'Tab must confirm an interchangeable duplicate without an artificial spatial guess or stock cost');
run(`
  g.sentence=['a board']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[]; g.plinks=0; TRACE.events.length=0;
  const spaced=makeWord('a board',0,100), joined=makeWord('aboard',1,300);
  g.words.push(spaced,joined); tapAt(350,251);
  globalThis.spacingCollisionTap=[g.idx,g.plinks,TRACE.events.some(e=>e.type==='equivalent_swap')];
  globalThis.spacingCollisionRejected=false;
  try { validateItems([{id:'bad',ask:'?',lead:'',tail:'.',answer:['a board'],decoys:['aboard']}]); }
  catch(e){ globalThis.spacingCollisionRejected=true; }
`);
assert.deepStrictEqual(Array.from(run('spacingCollisionTap')), [0,1,false],
  'whitespace-distinct chunks must never become interchangeable merely because typing strips spaces');
assert.strictEqual(run('spacingCollisionRejected'), true,
  'content validation must reject non-identical choices that cannot be distinguished in type mode');

run(`
  g.sentence=['Top','Bottom']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
  g.variant='A'; g.plinks=0; g.shotJamUntil=0; TRACE.events.length=0;
  const top=makeWord('Top',0,100), bottom=makeWord('Bottom',1,100);
  top.y=180; bottom.y=220; g.words.push(top,bottom); tapAt(150,219);
  globalThis.paddedTapChoice=[g.idx,g.plinks,TRACE.events.find(e=>e.type==='tap_input').order];
`);
assert.deepStrictEqual(Array.from(run('paddedTapChoice')), [0,1,1],
  'overlapping mobile hit padding must select the nearest visible block, never hidden answer-array order');

run(`
  g.sentence = ['Hold']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  const holdWord = makeWord('Hold', 0, 100); holdWord.baseX = 100; holdWord.phase = 0;
  g.words.push(holdWord); g.variant = 'A'; g.waveGraceUntil = 0; g.enemyFireT = 0;
  g.enemyShots = []; g.speed = 60; g.wordT = 0; g.freeze = 0;
  globalThis.variantAY = holdWord.y; update(.01);
  globalThis.variantAState = [holdWord.y, g.enemyShots.length, threatLineY()];
`);
assert.strictEqual(run(`variantAState[0] > variantAY && variantAState[1] >= 1 && variantAState[2] === H-64`), true,
  'variant A must use the same descending TOEFL formation while creating denser hostile fire');

run(`
  g.sentence=['Parry','Later']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
  g.variant='A'; g.combo=0; g.recoilBank=0; TRACE.events.length=0;
  const parryWord=makeWord('Parry',0,100), parryLater=makeWord('Later',1,300);
  parryWord.y=210; parryLater.y=270; g.words.push(parryWord,parryLater);
  g.enemyShots=[{x:150,y:226,vx:0,vy:0,r:4,source:1}];
  const parryLaterY=parryLater.y; resolveWord(parryWord);
  const parryEvent=TRACE.events.find(e=>e.type==='earned_recoil');
  globalThis.variantAParry=[g.idx,g.enemyShots.length,parryLater.y<parryLaterY,
    parryEvent.variant,parryEvent.cleared,parryEvent.requested];
`);
assert.deepStrictEqual(Array.from(run('variantAParry')), [1,0,true,'A',1,13],
  'A must turn a correct grammar hit into both a local bullet parry and a smaller shared push');

run(`
  g.sentence=['Parry B','Later']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
  g.variant='B'; g.combo=0; g.recoilBank=0; g.cargo=null; g.dockX=null;
  g.deliveryLeft=30; g.enemyShots=[]; TRACE.events.length=0;
  const parryWordB=makeWord('Parry B',0,100), parryLaterB=makeWord('Later',1,300);
  parryWordB.y=210; parryLaterB.y=270; g.words.push(parryWordB,parryLaterB);
  g.enemyShots=[{x:150,y:226,vx:0,vy:0,r:4,source:1}];
  const laterY=parryLaterB.y; resolveWord(parryWordB);
  const recoil=TRACE.events.find(e=>e.type==='earned_recoil');
  globalThis.variantBLogicalState=[g.idx,g.enemyShots.length,parryLaterB.y<laterY,recoil.variant,recoil.cleared,
    recoil.requested,g.cargo,g.dockX,traceScene().delivery_ms,traceScene().cargo_order];
  parryWordB.hp=0; settleWord(parryWordB);
  const impactParry=TRACE.events.find(e=>e.type==='impact_parry');
  globalThis.variantBImpactState=[g.enemyShots.length,impactParry.cleared,
    TRACE.events.filter(e=>e.type==='settle'&&e.w==='Parry B').length,g.words.includes(parryWordB)];
`);
assert.deepStrictEqual(Array.from(run('variantBLogicalState')), [1,1,true,'B',0,13,null,null,null,null],
  'B must advance and recoil immediately without clearing bullets before the missile physically lands');
assert.deepStrictEqual(Array.from(run('variantBImpactState')), [0,1,1,false],
  'B must parry the nearby bullet and retire the target exactly when physical damage reaches zero');
assert.strictEqual(run(`TRACE.events.some(e=>['cargo_capture','cargo_deliver','earned_delivery','escort_fire'].includes(e.type))`), false,
  'the new B visual proposal must not secretly preserve the rejected transport loop');
run(`
  const fullTabAssist = variant => {
    g.sentence=['Assisted','Tail']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
    g.variant=variant; g.tabs=2; g.shotJamUntil=0; TRACE.events.length=0;
    const assisted=makeWord('Assisted',0,100), tail=makeWord('Tail',1,300);
    g.words.push(assisted,tail); handleTab();
    return [g.idx,g.tabs,assisted.auto,assisted.resolved,TRACE.events.find(e=>e.type==='tab').at];
  };
  globalThis.aFullTab=fullTabAssist('A'); globalThis.bFullTab=fullTabAssist('B');
`);
assert.deepStrictEqual(Array.from(run('aFullTab')), [1,1,true,true,0],
  'A Tab must spend one stocked charge to auto-build an untouched next chunk');
assert.deepStrictEqual(Array.from(run('bFullTab')), [1,1,true,true,0],
  'B Tab must spend one stocked charge to auto-build an untouched next chunk');

run(`
  const wrongPenaltyAudit = variant => {
    g.sentence=['Correct','Wrong']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
    g.variant=variant; g.plinks=0; g.combo=5; g.tabs=2; g.recoilBank=30; g.enemyShots=[];
    g.cargo=null; g.dockX=null; g.deliveryMax=40; g.deliveryLeft=40;
    g.shotJamUntil=0; g.lastMissAt=0; g.missChain=0; TRACE.events.length=0;
    const target=makeWord('Correct',0,100), wrong=makeWord('Wrong',1,300);
    const wrongY0=wrong.y; g.words.push(target,wrong); tapAt(350,251);
    const idxAfterWrong=g.idx; tapAt(150,196); handleKey('x'); handleTab();
    const miss=TRACE.events.find(e=>e.type==='miss');
    return [g.plinks,g.idx,idxAfterWrong,g.shotJamUntil>performance.now(),
      g.enemyShots.length,Math.round(wrong.y-wrongY0),Math.round(g.recoilBank),
      Math.round(miss.time_lost),miss.retaliation,miss.jam,g.tabs,TRACE.events.filter(e=>e.type==='input_jammed').length,
      [...new Set(TRACE.events.filter(e=>e.type==='input_jammed').map(e=>e.kind))].sort().join(','),
      $('msg').textContent.includes('Correct')];
  };
  globalThis.aWrongPenalty=wrongPenaltyAudit('A'); globalThis.bWrongPenalty=wrongPenaltyAudit('B');
`);
assert.deepStrictEqual(Array.from(run('aWrongPenalty')), [1,0,0,true,3,30,18,0,3,570,2,3,'tab,tap,type',false],
  'A wrong picks must apply jam, formation lunge, reserve loss, and counterfire without revealing the answer');
assert.deepStrictEqual(Array.from(run('bWrongPenalty')), [1,0,0,true,3,30,18,0,3,570,2,3,'tab,tap,type',false],
  'B must apply the same gameplay penalty as A while differing only in battlefield presentation');

run(`
  const concurrentControl = variant => {
    g.sentence=['Aim','Tail']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
    g.variant=variant; g.ship.x=100; g.shotJamUntil=0; g.enemyShots=[]; g.escortShots=[];
    g.cargo=null; g.dockX=null; g.visualPhase=0; g.waveGraceUntil=999999;
    const aim=makeWord('Aim',0,300), tail=makeWord('Tail',1,500); aim.y=180;
    g.words.push(aim,tail);
    windowHandlers.keydown({key:'ArrowRight',preventDefault(){}}); tapAt(350,196);
    update(.1);
    const result=[g.idx,!!g.cargo,g.ship.x>100,g.ship.x<200,traceScene().move_dir,g.escortShots.length];
    windowHandlers.keyup({key:'ArrowRight'}); return result;
  };
  globalThis.concurrentMoveFireA=concurrentControl('A');
  globalThis.concurrentMoveFireB=concurrentControl('B');
`);
assert.deepStrictEqual(Array.from(run('concurrentMoveFireA')), [1,false,true,true,1,0],
  'A held-arrow movement must continue during mouse fire without teleporting the ship');
assert.deepStrictEqual(Array.from(run('concurrentMoveFireB')), [1,false,true,true,1,0],
  'B held-arrow movement must continue during the same mouse-fire BREACH action');
assert.strictEqual(run(`moveInput.right`), false,
  'keyup must stop continuous dodge movement');
run(`
  g.ship.x=400; windowHandlers.keydown({key:'ArrowLeft',preventDefault(){}});
  windowHandlers.keydown({key:'ArrowRight',preventDefault(){}}); update(.1);
  const bothX=g.ship.x; windowHandlers.keyup({key:'ArrowRight'}); update(.1);
  const leftX=g.ship.x; windowHandlers.blur();
  globalThis.heldMoveReset=[Math.round(bothX),leftX<bothX,moveInput.left,moveInput.right];
`);
assert.deepStrictEqual(Array.from(run('heldMoveReset')), [400,true,false,false],
  'opposite held arrows must cancel, releasing one must resume the other, and blur must clear stuck movement');

run(`
  g.sentence=['Recovered','Tail']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
  const recovered=makeWord('Recovered',0,100), recoveredTail=makeWord('Tail',1,300);
  g.words.push(recovered,recoveredTail); g.missChain=3; g.lastMissAt=performance.now();
  resolveWord(recovered); globalThis.chainAfterCorrect=[g.missChain,g.lastMissAt];
`);
assert.deepStrictEqual(Array.from(run('chainAfterCorrect')), [0,0],
  'completing a correct chunk must clear the prior mistake chain before the next choice');
run(`
  g.sentence=['Core']; g.idx=0; g.words=[makeWord('Core',0,100)];
  g.variant='B'; g.cargo=null; g.dockX=null; g.deliveryLeft=37.5; g.recoilBank=7;
  g.waveGraceUntil=999999; g.wordT=0; g.freeze=0; updateReserveHud();
  globalThis.coreTraceState=[traceScene().delivery_ms,traceScene().cargo_order,traceScene().dock_x,
    $('h-variant').textContent,traceScene().recoil_bank];
`);
assert.deepStrictEqual(Array.from(run('coreTraceState')), [null,null,null,'TEST B · CORE R7 · SYNC 0',7],
  'B must expose CORE styling and the same recoil reserve while rejected DELIVERY fields stay null');

run(`
  g.sentence = ['Dodge']; g.idx = 0; g.words = [makeWord('Dodge',0,100)];
  g.variant = 'A'; g.waveGraceUntil = performance.now()+99999; g.enemyFireT = 99;
  g.ship.x = 400; g.shields = 1; g.lives = 3; g.hitInvulnUntil = 0; TRACE.events.length = 0;
  g.typePrefix='d'; g.lock=g.words[0];
  g.enemyShots = [{x:400,y:H-34,vx:0,vy:0,r:4,source:0}]; update(0);
  globalThis.hostileHitState = [g.shields,g.lives,g.enemyShots.length,
    TRACE.events.some(e => e.type === 'ship_hit' && e.shielded),g.typePrefix,g.lock&&g.lock.order];
`);
assert.deepStrictEqual(Array.from(run('hostileHitState')), [0,3,0,true,'d',0],
  'a hostile shot must consume the shield without turning a focused Tab confirm into an accidental assist');

run(`
  g.variant='B'; g.sentence=['Graze','Tail']; g.idx=0; g.words=[makeWord('Graze',0,100),makeWord('Tail',1,300)];
  g.ship.x=400; g.enemyShots=[]; g.missiles=[]; g.fireQueues=[]; g.pulses=[];
  g.sync=0; g.grazes=0; g.waveGraceUntil=performance.now()+99999; g.enemyFireT=99;
  g.speed=0; g.freeze=0; g.hitInvulnUntil=0; TRACE.events.length=0;
  const skim={x:426,y:H-34,vx:0,vy:1,r:4,source:0}; g.enemyShots=[skim];
  update(0); update(0); skim.y=H-17; update(0); update(0);
  globalThis.singleGrazeState=[g.sync,g.grazes,skim.grazed,
    TRACE.events.filter(e=>e.type==='graze').length,traceScene().enemyShots[0][6],g.shields,g.lives];
  for(let i=1;i<5;i++){
    const pass={x:426,y:H-34,vx:0,vy:1,r:4,source:i}; g.enemyShots=[pass];
    update(0); pass.y=H-17; update(0);
  }
  globalThis.fullSyncState=[g.sync,g.grazes,TRACE.events.filter(e=>e.type==='graze').length,
    traceScene().sync,$('h-variant').textContent.includes('SYNC 100')];
`);
assert.deepStrictEqual(Array.from(run('singleGrazeState')), [20,1,true,1,1,0,3],
  'a near miss outside the ship hitbox must award exactly one graze only after safely passing the ship');
assert.deepStrictEqual(Array.from(run('fullSyncState')), [100,5,5,100,true],
  'five distinct grazes must visibly fill the B core without changing the TOEFL verdict pipeline');

run(`
  g.sync=60; g.shields=1; g.lives=3; g.hitInvulnUntil=0; g.enemyShots=[]; TRACE.events.length=0;
  const failedGraze={x:426,y:H-34,vx:0,vy:1,r:4,source:7}; g.enemyShots=[failedGraze];
  update(0); globalThis.armedGrazeTrace=traceScene().enemyShots[0];
  failedGraze.x=400; update(0);
  globalThis.failedGrazeState=[g.sync,g.shields,g.lives,g.enemyShots.length,
    TRACE.events.filter(e=>e.type==='graze').length,TRACE.events.filter(e=>e.type==='ship_hit').length];
`);
assert.strictEqual(run('armedGrazeTrace[6]===0 && armedGrazeTrace[7]===1'), true,
  'entering the graze ring must be replayable as an armed but not-yet-rewarded state');
assert.deepStrictEqual(Array.from(run('failedGrazeState')), [20,0,3,0,0,1],
  'an armed bullet that hits the ship must grant no graze and must apply the full SYNC hit loss');

run(`
  g.sentence=['Impact','Tail']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[]; g.pulses=[];
  g.enemyShots=[]; g.combo=0; g.score=0; g.best=999999; g.sync=100; g.coreBursts=0; g.pendingSentenceClear=false;
  g.waveGraceUntil=performance.now()+99999; g.enemyFireT=99; g.speed=0; g.freeze=0; TRACE.events.length=0;
  const impactWord=makeWord('Impact',0,100), impactTail=makeWord('Tail',1,300);
  impactWord.y=180; impactTail.y=250; g.words.push(impactWord,impactTail); resolveWord(impactWord);
  const logicalScore=g.score; impactWord.hp=1;
  g.enemyShots=[{x:20,y:20,vx:0,vy:0,r:4,source:1},{x:780,y:20,vx:0,vy:0,r:4,source:1}];
  const ix=wordVisualX(impactWord)+impactWord.w/2, iy=wordVisualY(impactWord)+impactWord.h/2;
  g.missiles=[{x:ix,y:iy,vx:0,vy:0,target:impactWord,dmg:1,letter:'t'},
    {x:ix,y:iy,vx:0,vy:0,target:impactWord,dmg:1,letter:'!'}];
  globalThis.preContactBurstState=[g.idx,g.sync,g.enemyShots.length,g.words.includes(impactWord),impactWord.resolved];
  update(0);
  const burst=TRACE.events.find(e=>e.type==='core_burst');
  const settled=TRACE.events.find(e=>e.type==='settle'&&e.w==='Impact');
  globalThis.contactBurstState=[g.sync,g.enemyShots.length,g.words.includes(impactWord),g.score-logicalScore,
    burst.cleared,settled.core_burst,g.coreBursts,g.pulses.length,
    TRACE.events.filter(e=>e.type==='core_burst').length,TRACE.events.filter(e=>e.type==='settle'&&e.w==='Impact').length];
`);
assert.deepStrictEqual(Array.from(run('preContactBurstState')), [1,100,2,true,true],
  'logical success must leave the charged core, hostile shots, and alive-looking word intact before contact');
assert.deepStrictEqual(Array.from(run('contactBurstState')), [0,0,false,250,2,true,1,3,1,1],
  'simultaneous missile contacts must consume SYNC, award the burst, and retire the word exactly once');

run(`
  g.sentence=['Auto','Tail']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[]; g.pulses=[];
  g.sync=100; g.pendingSentenceClear=false; g.enemyShots=[{x:150,y:196,vx:0,vy:0,r:4,source:1}];
  g.tabs=1; g.typePrefix=''; g.lock=null; g.shotJamUntil=0; g.freeze=0; g.speed=0;
  g.waveGraceUntil=performance.now()+99999; g.enemyFireT=99;
  const autoImpact=makeWord('Auto',0,100), autoTail=makeWord('Tail',1,300);
  autoImpact.y=180; autoTail.y=250; g.words.push(autoImpact,autoTail);
  TRACE.events.length=0; handleTab();
  let autoFrames=0; while(g.words.includes(autoImpact)&&autoFrames<900){ update(.016); autoFrames++; }
  globalThis.autoImpactState=[g.sync,TRACE.events.some(e=>e.type==='core_burst'),
    TRACE.events.some(e=>e.type==='impact_parry'),g.words.includes(autoImpact),autoImpact.auto,g.idx,g.tabs,autoFrames<900];
  g.sync=100; g.hitInvulnUntil=0; g.shields=1; g.lives=3; g.over=false; takeShipHit();
  globalThis.syncHitState=[g.sync,g.shields,g.lives,
    TRACE.events.find(e=>e.type==='ship_hit').sync_before,TRACE.events.find(e=>e.type==='ship_hit').sync_after];
`);
assert.deepStrictEqual(Array.from(run('autoImpactState')), [100,false,true,false,true,1,0,true],
  'a stocked Tab auto-build must travel through its real queue and impact without spending a charged skill core');
assert.deepStrictEqual(Array.from(run('syncHitState')), [60,0,3,100,60],
  'getting hit while charged must drain SYNC so grazing remains a risk-reward loop');

run(`
  g.sentence = ['Committee', 'Campus']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  g.lock = null; g.typePrefix = ''; g.missGraceUntil = 0; g.shotJamUntil=0; g.tabs=3; TRACE.events.length = 0;
  const answer = makeWord('Committee', 0, 100), wrongChoice = makeWord('Campus', 1, 300);
  g.words.push(answer, wrongChoice); handleKey('c'); handleKey('a');
  globalThis.wrongChoicePreview = [answer.err || 0, wrongChoice.err || 0,$('msg').textContent.includes('Committee'),
    TRACE.events.filter(e => e.type === 'miss').length,g.lock&&g.lock.order,g.tabs];
  handleTab();
  globalThis.wrongChoiceFeedback = [answer.err || 0, wrongChoice.err > 0, $('msg').textContent.includes('Committee'),
    TRACE.events.filter(e => e.type === 'miss').length,g.tabs];
`);
assert.deepStrictEqual(Array.from(run('wrongChoicePreview')), [0,0,false,0,1,3],
  'narrowing to a unique wrong chunk must remain an unjudged preview');
assert.deepStrictEqual(Array.from(run('wrongChoiceFeedback')), [0,true,false,1,3],
  'Tab-confirming a wrong focus must mark only that chunk, preserve stock, and never expose the answer');

run(`
  g.sentence = ['Echo']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  g.words.push(makeWord('Echo', 0, 100)); g.lock = null; g.typePrefix = ''; g.missGraceUntil = 0; g.plinks = 0;
  g.variant = 'A'; g.enemyShots = []; g.shotJamUntil=0; g.missChain=0; g.lastMissAt=0;
  TRACE.events.length = 0;
  handleKey('x'); handleKey('y'); handleKey('z');
  globalThis.invalidBurst=[g.idx,g.typePrefix,g.plinks,g.enemyShots.length,g.words[0].err||0,
    TRACE.events.filter(e=>e.type==='focus_clear').length,TRACE.events.filter(e=>e.type==='miss').length];
`);
assert.deepStrictEqual(Array.from(run('invalidBurst')), [0,'',0,0,0,3,0],
  'unmatched keyboard noise must repeatedly clear focus without damage, counterfire, or answer leakage');

run(`
  g.sentence = ['Combo', 'Tail']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  const comboWord = makeWord('Combo', 0, 100); g.words.push(comboWord);
  g.combo = 3; g.tabs = 2; TRACE.events.length = 0;
  resolveWord(comboWord);
`);
assert.deepStrictEqual(Array.from(run(`{
  const e = TRACE.events.find(e => e.type === 'item_gain');
  [e.item, e.reason, e.left, g.tabs];
}`)), ['tab', 'combo4', 3, 3], 'every four manual kills must refill Tab and expose the resulting stock');
run(`
  g.sentence = ['Perfect']; g.idx = 1; g.words = []; g.missiles = []; g.fireQueues = [];
  g.perfect = true; g.tabs = 3; g.t0 = performance.now(); TRACE.events.length = 0;
  sentenceClear();
  globalThis.perfectTabReward = (() => {
    const e = TRACE.events.find(e => e.type === 'item_gain' && e.reason === 'perfect');
    return [e.amount, e.left, g.tabs];
  })();
`);
assert.deepStrictEqual(Array.from(run('perfectTabReward')), [2, 5, 5],
  'a PERFECT sentence must grant two Tab charges so the item can be used frequently');

run(`
  g.sentence = ['Target', 'Wing']; g.idx = 0; g.words = []; g.missiles = []; g.fireQueues = [];
  g.variant = 'A';
  const targetWord = makeWord('Target', 0, 100), wingWord = makeWord('Wing', 1, 300);
  targetWord.y = 120; wingWord.y = H - 64 - wingHoldClearance() - wingWord.h - 2;
  g.words.push(targetWord, wingWord); g.speed = 40; g.wordT = 0; g.freeze = 0; g.waveGraceUntil = 0; TRACE.events.length = 0;
  globalThis.targetBeforeWingHold = targetWord.y; globalThis.wingBeforeHold = wingWord.y;
  update(.1); globalThis.wingHeldY = wingWord.y; globalThis.targetAfterWingHold = targetWord.y;
  globalThis.targetThreatAtHold = targetWord.threatY; globalThis.pressureAtHold = threatLineY();
  for (let i=0;i<100;i++) update(.01);
  globalThis.wingAfterDelay = wingWord.y; globalThis.targetAfterDelay = targetWord.y;
  globalThis.targetThreatAfterDelay = targetWord.threatY; globalThis.pressureAfterDelay = threatLineY();
`);
assert.strictEqual(run(`TRACE.events.some(e => e.type === 'wing_hold' && e.effect === 'hold_position')`), true,
  'a later-order word must record that it held position instead of receiving a free rebound');
assert.strictEqual(run('wingHeldY >= wingBeforeHold && Math.abs(wingAfterDelay-wingHeldY)<0.001'), true,
  'delaying the target must never move a future word upward and must leave it at its danger hold');
assert.strictEqual(run(`targetAfterWingHold > targetBeforeWingHold &&
  Math.abs(targetAfterDelay-targetAfterWingHold)<0.001 && targetThreatAfterDelay>targetThreatAtHold`), true,
  'the visible formation must stay neutral while the hidden target threat keeps accelerating toward failure');
assert.strictEqual(run('pressureAfterDelay < pressureAtHold && traceScene().pressure_y === Math.round(pressureAfterDelay*10)/10'), true,
  'a visible global pressure line must expose the continuing deadline without identifying the target');
assert.strictEqual(run(`TRACE.events.some(e => e.type === 'wing_recycle')`), false,
  'the exploitable free wing recycle must be absent');
run(`
  targetWord.resolved = true; g.idx = 1; g.wordT = 0; wingWord.threatY = wingWord.y;
  globalThis.heldBeforeActivation = wingWord.y; update(.1);
  globalThis.heldAfterActivation = wingWord.y;
`);
assert.strictEqual(run('heldAfterActivation > heldBeforeActivation && !wingWord.holding'), true,
  'a held word must resume descending with a full reaction buffer when it becomes the target');
run(`
  g.sentence = ['Now', 'Later1', 'Later2', 'Later3']; g.idx=0; g.words=[];
  const nowWord=makeWord('Now',0,80), later1=makeWord('Later1',1,220),
    later2=makeWord('Later2',2,380), later3=makeWord('Later3',3,540);
  nowWord.y=80; later1.y=180; later2.y=230;
  later3.y=H-64-wingHoldClearance()-later3.h-1;
  g.words.push(nowWord,later1,later2,later3); g.speed=50; g.wordT=0; g.freeze=0; TRACE.events.length=0;
  const futureBefore=[nowWord.y,later1.y,later2.y,later3.y]; update(.1);
  globalThis.futureFormationDeltas=[nowWord.y-futureBefore[0],later1.y-futureBefore[1],
    later2.y-futureBefore[2],later3.y-futureBefore[3]];
`);
assert.strictEqual(run(`futureFormationDeltas.every(d => Math.abs(d-futureFormationDeltas[0])<0.001 && d>=0)`), true,
  'the target and future words must stop as one neutral formation, preserving spacing without revealing the answer');
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
  g.words.push(shieldWord); g.shields = 1; g.typePrefix='s'; g.lock=shieldWord; TRACE.events.length = 0;
  loseLife(shieldWord);
`);
assert.deepStrictEqual(Array.from(run(`{
  const e = TRACE.events.find(e => e.type === 'shield_absorb');
  [e.before.inv[1], e.after.inv[1], Math.abs(e.before.words[0][2] - e.after.words[0][2]) <= 4,
    Math.round(e.after.words[0][14]), e.after.words[0][15] > 0,
    e.after.banners.some(b => b[1] === 'SHIELD'), e.effect, $('msg').textContent.includes('Shielded'),
    g.typePrefix,g.lock&&g.lock.order];
}`)), [1, 0, true, Math.round(run('formationStageY(g.words[0])')), true, true, 'recoil', false,'s',0],
  'shield telemetry must separate the retained render position from the immediate safe logical regroup');
run(`g.typePrefix=''; g.lock=null; g.words[0].recoilAt -= RECOIL_MS; globalThis.settledShieldScene = traceScene();`);
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
  g.sentence=['Top','Lower','Side']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[];
  g.perRow=3; g.variant='A';
  const survivorTop=makeWord('Top',0,100), survivorLower=makeWord('Lower',1,100), survivorSide=makeWord('Side',2,350);
  survivorTop.col=0; survivorTop.row=0; survivorTop.y=220;
  survivorLower.col=0; survivorLower.row=1; survivorLower.y=250;
  survivorSide.col=1; survivorSide.row=0; survivorSide.y=220;
  g.words.push(survivorTop,survivorLower,survivorSide); recoilFormation('sparse_rows');
  for(const word of g.words) word.recoilAt-=RECOIL_MS;
  const sparseScene=traceScene(), a=sparseScene.words[0], b=sparseScene.words[1];
  const dx=Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
  const dy=Math.max(0,Math.min(a[2]+a[4],b[2]+b[4])-Math.max(a[2],b[2]));
  globalThis.sparseRowAudit=[Math.round(dx*dy),Math.round(Math.abs(a[2]-b[2]))];
`);
assert.strictEqual(run(`sparseRowAudit[0] === 0 && sparseRowAudit[1] >= 34`), true,
  'a rebound with sparse occupied slots must preserve both rows instead of collapsing same-column survivors');

run(`
  const paceAudit = (variant,solved) => {
    const rules=variantRules(variant);
    const speed=Math.min(rules.speedCap,rules.baseSpeed*Math.pow(rules.solvedScale,solved));
    let elapsed=0,activeWordT=0,travel=0,nextSolve=9,completed=0;
    while(elapsed<36){
      const dt=.05; elapsed+=dt;
      if(elapsed>=2.2){
        activeWordT+=dt;
        travel+=(speed+Math.min(rules.hesitationCap,activeWordT*rules.hesitationAccel))*dt;
      }
      if(completed<3 && elapsed>=nextSolve){
        completed++;
        travel-=rules.kickBase+Math.min(rules.kickCap,completed*rules.kickCombo);
        activeWordT=0; nextSolve+=9;
      }
    }
    let noInputElapsed=0,noInputWordT=0,noInputTravel=0;
    while(noInputTravel<370 && noInputElapsed<60){
      const dt=.05; noInputElapsed+=dt;
      if(noInputElapsed>=2.2){
        noInputWordT+=dt;
        noInputTravel+=(speed+Math.min(rules.hesitationCap,noInputWordT*rules.hesitationAccel))*dt;
      }
    }
    return [Math.round(370-travel),Math.round(noInputElapsed*10)/10];
  };
  globalThis.paceAFirst=paceAudit('A',0); globalThis.paceATenth=paceAudit('A',9);
  globalThis.paceBFirst=paceAudit('B',0); globalThis.paceBTenth=paceAudit('B',9);
`);
assert.strictEqual(run(`paceAFirst[0]>0 && paceATenth[0]>0 && paceAFirst[1]>=31 && paceATenth[1]>=29 &&
  JSON.stringify(paceAFirst)===JSON.stringify(paceBFirst) && JSON.stringify(paceATenth)===JSON.stringify(paceBTenth)`), true,
  'both visual proposals must retain the selected, deliberately slower BREACH deadline and recoil pacing');

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
  const initialSignature = variant => {
    W=800; H=600; g.variant=variant; g.solved=0; g.recent=[]; g.words=[]; g.enemyShots=[];
    g.missiles=[]; g.fireQueues=[]; g.over=false; nextSentence();
    return [g.item.id,g.item.ask,g.item.lead,g.item.tail,g.sentence.slice(),
      g.words.map(w=>[w.order,w.text,roundTrace(w.x),roundTrace(w.y),roundTrace(w.w),w.isDecoy?1:0])];
  };
  globalThis.signatureA=initialSignature('A'); globalThis.signatureB=initialSignature('B');
`);
assert.deepStrictEqual(JSON.parse(JSON.stringify(run('signatureA.slice(0,5)'))),
  JSON.parse(JSON.stringify(run('signatureB.slice(0,5)'))),
  'A and B must present the exact same TOEFL item and answer for a shared seed');
assert.notDeepStrictEqual(JSON.parse(JSON.stringify(run('signatureA[5]'))),
  JSON.parse(JSON.stringify(run('signatureB[5]'))),
  'the paired games must use visibly different battlefield geometry instead of hiding a tuning-only A/B');

run(`
  const auditFullPool = (variant,width,height) => {
    W=width; H=height; g.variant=variant; g.solved=0; g.recent=[]; g.words=[]; g.enemyShots=[];
    g.missiles=[]; g.fireQueues=[]; g.tabs=0; g.shields=0; g.lives=99; g.over=false; g.recoilBank=0;
    let maxArea=0, worst='', minInitialRoom=Infinity, coreCollision=0;
    const audit = label => {
      const live=g.words.filter(w=>!w.resolved);
      for(let i=0;i<live.length;i++) for(let j=i+1;j<live.length;j++){
        const a=live[i],b=live[j];
        const dx=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
        const dy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
        if(dx*dy>maxArea){ maxArea=dx*dy; worst=label+':'+a.text+'/'+b.text; }
      }
      if(variant==='B'){
        const core=signalCore();
        for(const w of core.hidden ? [] : live){
          const wx=wordVisualX(w), wy=wordVisualY(w);
          const nx=Math.max(wx,Math.min(core.x,wx+w.w));
          const ny=Math.max(wy,Math.min(core.y,wy+w.h));
          if(Math.hypot(nx-core.x,ny-core.y)<core.r+3) coreCollision++;
        }
      }
    };
    for(let n=0;n<ITEMS.length;n++){
      nextSentence(); audit(g.item.id+':start');
      const hold=(H-64)-wingHoldClearance();
      for(const word of g.words) minInitialRoom=Math.min(minInitialRoom,
        variant==='B' ? H-(word.y+word.h) : hold-(word.y+word.h));
      while(g.idx<g.sentence.length){
        const target=g.words.find(w=>!w.resolved&&w.order===g.idx);
        resolveWord(target); audit(g.item.id+':'+g.idx);
        target.hp=0; settleWord(target);
      }
    }
    return [Math.round(maxArea),worst,Math.round(minInitialRoom),coreCollision];
  };
  globalThis.fullPoolADesktopOverlap=auditFullPool('A',800,600);
  globalThis.fullPoolAMobileOverlap=auditFullPool('A',375,500);
  globalThis.fullPoolBDesktopOverlap=auditFullPool('B',800,600);
  globalThis.fullPoolBMobileOverlap=auditFullPool('B',375,500);
  W=800; H=600;
`);
assert.strictEqual(run(`[fullPoolADesktopOverlap,fullPoolBDesktopOverlap].every(x=>x[0]===0&&x[2]>=0) &&
  fullPoolBDesktopOverlap[3]===0`), true,
  'every A/B sentence must remain visible and non-overlapping on desktop, including the B signal core');
assert.strictEqual(run(`[fullPoolAMobileOverlap,fullPoolBMobileOverlap].every(x=>x[0]===0&&x[2]>=0) &&
  fullPoolBMobileOverlap[3]===0`), true,
  'every A/B sentence must remain visible and non-overlapping on a narrow mobile viewport: '+
  JSON.stringify(run('[fullPoolAMobileOverlap,fullPoolBMobileOverlap]')));

run(`
  W=375; H=500; g.variant='B'; g.sentence=['Target']; g.idx=0; g.words=[]; g.enemyShots=[];
  g.missiles=[]; g.fireQueues=[]; g.recoilBank=30; g.shotJamUntil=0; g.lastMissAt=0; g.missChain=0;
  g.visualPhase=0; TRACE.events.length=0;
  const mobileTarget=makeWord('Target',0,80), mobileWrong=makeWord('Wrong',1,210);
  const mobileHold=(H-64)-wingHoldClearance();
  mobileTarget.y=mobileHold-mobileTarget.h; mobileWrong.y=mobileTarget.y;
  mobileTarget.row=0; mobileTarget.col=0; mobileWrong.row=0; mobileWrong.col=0;
  g.words.push(mobileTarget,mobileWrong); applyWrongPenalty(mobileWrong);
  const mobileCore=signalCore();
  const visibleCoreOverlap=w=>{
    if(mobileCore.hidden) return false;
    const wx=wordVisualX(w),wy=wordVisualY(w);
    const nx=Math.max(wx,Math.min(mobileCore.x,wx+w.w));
    const ny=Math.max(wy,Math.min(mobileCore.y,wy+w.h));
    return Math.hypot(nx-mobileCore.x,ny-mobileCore.y)<mobileCore.r+5;
  };
  globalThis.mobileLungeCore=[mobileCore.hidden,g.words.some(visibleCoreOverlap)];
  W=800; H=600;
`);
assert.deepStrictEqual(Array.from(run('mobileLungeCore')), [true,false],
  'the mobile signal core must yield before a wrong-answer lunge can cover a TOEFL choice');

run(`
  const auditWidthResize = variant => {
    W=800; H=600; g.variant=variant; g.solved=0; g.recent=[]; g.words=[]; g.enemyShots=[];
    g.missiles=[]; g.fireQueues=[]; g.over=false; g.recoilBank=0; nextSentence();
    viewport.w=375; viewport.h=500; resize();
    const immediate=traceScene();
    for(const w of g.words) if(w.recoilAt) w.recoilAt-=RECOIL_MS;
    const settled=traceScene();
    const overlaps = scene => {
      const ws=scene.words.filter(w=>!(w[9]&1)); let count=0;
      for(let i=0;i<ws.length;i++) for(let j=i+1;j<ws.length;j++){
        const a=ws[i],b=ws[j];
        const dx=Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
        const dy=Math.max(0,Math.min(a[2]+a[4],b[2]+b[4])-Math.max(a[2],b[2]));
        if(dx*dy>0) count++;
      }
      return count;
    };
    return [overlaps(immediate),overlaps(settled),
      immediate.words.every(w=>w[11]===100),settled.words.every(w=>w[11]===100),
      TRACE.events.some(e=>e.type==='formation_recoil'&&e.reason==='viewport_reflow')];
  };
  globalThis.widthResizeA=auditWidthResize('A');
  viewport.w=800; viewport.h=600; resize();
  globalThis.widthResizeB=auditWidthResize('B');
  viewport.w=800; viewport.h=600; resize();
`);
assert.deepStrictEqual(Array.from(run('widthResizeA')), [0,0,true,true,true],
  'A must reflow from desktop to mobile without stale lanes or overlapping chunks');
assert.deepStrictEqual(Array.from(run('widthResizeB')), [0,0,true,true,true],
  'B must reflow from desktop to mobile without stale lanes or overlapping chunks');

run(`
  g.variant='B'; g.item={id:'final-impact-order',ask:'Does only the final impact clear?',lead:'',tail:'.',
    answer:['First','Final'],decoys:[]};
  g.sentence=['First','Final']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[]; g.enemyShots=[];
  g.pendingSentenceClear=false; g.over=false; g.perfect=false; g.t0=performance.now(); TRACE.events.length=0;
  const earlyImpact=makeWord('First',0,100), finalImpact=makeWord('Final',1,300);
  g.words.push(earlyImpact,finalImpact); resolveWord(earlyImpact); resolveWord(finalImpact);
  earlyImpact.hp=0; settleWord(earlyImpact);
  globalThis.earlySettleClearState=[g.pendingSentenceClear,TRACE.events.some(e=>e.type==='clear'),g.words.includes(finalImpact)];
  finalImpact.hp=0; settleWord(finalImpact);
  globalThis.finalSettleClearState=[g.pendingSentenceClear,TRACE.events.filter(e=>e.type==='clear').length,
    TRACE.events.filter(e=>e.type==='settle'&&!e.forced).map(e=>e.order).join(',')];
`);
assert.deepStrictEqual(Array.from(run('earlySettleClearState')), [true,false,true],
  'an earlier inbound word may settle after the final verdict without clearing the sentence prematurely');
assert.deepStrictEqual(Array.from(run('finalSettleClearState')), [false,1,'0,1'],
  'only the actual impact of the final ordered word may begin sentence clear');

const transitionTimerBase = scheduledTimers.length;
run(`
  g.variant='B'; g.item={id:'timer-audit',ask:'Can the wave transition cleanly?',lead:'It',tail:'.',
    answer:['can'],decoys:['cannot']};
  g.sentence=['can']; g.idx=0; g.words=[]; g.missiles=[]; g.fireQueues=[]; g.enemyShots=[];
  g.over=false; g.perfect=false; g.t0=performance.now();
  const transitionAnswer=makeWord('can',0,100), transitionDecoy=makeWord('cannot',1,300);
  transitionDecoy.isDecoy=true;
  g.words.push(transitionAnswer,transitionDecoy); g.enemyShots.push({x:20,y:20,vx:0,vy:0,r:4});
  TRACE.events.length=0; resolveWord(transitionAnswer);
  globalThis.preImpactTransitionState=[g.pendingSentenceClear,g.words.includes(transitionAnswer),
    g.words.includes(transitionDecoy),g.enemyShots.length,TRACE.events.some(e=>e.type==='clear')];
  transitionAnswer.hp=0; settleWord(transitionAnswer);
  globalThis.clearTransitionState=[g.words.includes(transitionDecoy),g.enemyShots.length,
    TRACE.events.some(e=>e.type==='settle'&&e.w==='cannot'&&e.forced),
    TRACE.events.some(e=>e.type==='clear')];
`);
assert.deepStrictEqual(Array.from(run('preImpactTransitionState')), [true,true,true,1,false],
  'the final logical answer must leave the wave intact until its missile visibly lands');
assert.deepStrictEqual(Array.from(run('clearTransitionState')), [false,0,true,true],
  'the physical final impact must scrap the decoy, settle it at zero points, and erase hostile fire');
const transitionTimers = scheduledTimers.slice(transitionTimerBase).filter(t => t.delay === 700 && !t.cleared);
assert.strictEqual(transitionTimers.length, 1,
  'a clear must schedule exactly one 700ms sentence transition');
transitionTimers[0].fn();
assert.strictEqual(run(`g.item.id !== 'timer-audit' && g.words.every(w=>!w.resolved) &&
  g.missiles.length===0 && g.fireQueues.length===0 && g.enemyShots.length===0`), true,
  'the next wave must not retain stale words, missiles, queues, or enemy shots');

run(`
  g.sentence = Array.from({length: 12}, (_,i) => 'Word' + i); g.idx = 0; g.words = [];
  for (let i=0;i<12;i++) g.words.push(makeWord('Word' + i, i, 20 + (i%3)*230));
  g.missiles = Array.from({length: 12}, (_,i) => ({ x:100+i*7, y:500-i*9, vx:i*3, vy:-220,
    target:g.words[i%g.words.length], dmg:1, letter:i%2 ? 'x' : undefined }));
  g.parts = Array.from({length: 30}, (_,i) => ({ x:i*9, y:i*7, vx:0, vy:30, life:.8, t:.2,
    color:'#aef0ae', text:i%10===0 ? 'x' : undefined }));
  g.pulses = [];
  for (const b of activeTraceBanners.values()) b.el.remove();
  activeTraceBanners.clear();
  TRACE.samples.length = 0; TRACE.events.length = 0;
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

const rafBeforeRetries = rafCalls.length;
run(`startGame('tap'); gameOver(); startGame('type'); gameOver(); startGame('tap');`);
assert.strictEqual(rafCalls.length, rafBeforeRetries,
  'retries must reuse the single animation loop instead of accumulating permanent RAF chains');

assert.ok(!source.includes('ctx.globalAlpha = claimAlpha') && !source.includes('presentation-only husk'),
  'logically resolved targets must not fade or turn into a corpse before the missile lands');
assert.ok(source.includes("const incoming = w.resolved && !w.settled") && source.includes("if(incoming){"),
  'an inbound marker may communicate commitment without visually killing the still-unhit word');
assert.ok(source.includes('renderY = wordVisualY(t)') && source.includes('m.y >= renderY'),
  'homing missiles must chase the visible rebound position, not the hidden logical position');
assert.ok(source.includes("$('hud').appendChild(b)"),
  'reward and shield banners must live in the HUD instead of covering live word text');

console.log('input pipeline regression tests passed; representative 3-minute visual trace bytes:',
  run('representativeTraceBytes'));
