const fs = require('fs');
const path = require('path');
const repo = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let dir = path.resolve(process.env.SHOOTER_TRACE_DIR || path.join(repo, 'traces'));
let requested = null, latest = false;
for (let i=0;i<args.length;i++){
  if (args[i] === '--dir') dir = path.resolve(args[++i] || '');
  else if (args[i] === '--latest') latest = true;
  else if (!requested) requested = args[i];
  else throw new Error('usage: node tools/analyze-trace.js [trace.json] [--dir DIR] [--latest]');
}
if (requested){
  const direct = path.resolve(requested);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()){
    dir = path.dirname(direct); requested = path.basename(direct);
  }
}
if (!fs.existsSync(dir)) throw new Error('trace directory not found: ' + dir + '\nStart: npm run dev');
let files = fs.readdirSync(dir).filter(x => x.endsWith('.json') && (!requested || x === requested));
files.sort((a,b)=>fs.statSync(path.join(dir,a)).mtimeMs-fs.statSync(path.join(dir,b)).mtimeMs);
if (latest && files.length) files = [files.at(-1)];
if (requested && !files.length) throw new Error('trace not found: ' + path.join(dir, requested));
if (!files.length) throw new Error('no traces found in: ' + dir);
for (const f of files){
  const tracePath = path.join(dir, f);
  const T = JSON.parse(fs.readFileSync(tracePath));
  const S = T.samples, E = T.events;
  const dur = S.length ? (S[S.length-1].t - S[0].t)/1000 : 0;
  const ds = S.map(s => s.d).filter(d => d !== null).sort((a,b)=>a-b);
  const pct = p => ds[Math.floor(ds.length*p)] ?? null;
  const closeFrac = ds.length ? ds.filter(d => d < 150).length/ds.length : 0;
  const veryClose = ds.length ? ds.filter(d => d < 60).length/ds.length : 0;
  const ev = {}; for (const e of E) ev[e.type] = (ev[e.type]||0)+1;
  // boredom: gaps between consecutive action events (kill/miss) > 5s
  const acts = [
    ...E.filter(e => ['kill','miss','miss_suppressed','tab','hint','graze','core_burst','cargo_capture','cargo_deliver','escort_fire'].includes(e.type)).map(e => e.t),
    ...S.filter(s => s.scene && s.scene.move_dir).map(s => s.t),
  ].sort((a,b)=>a-b);
  let gaps = []; for (let i=1;i<acts.length;i++) if (acts[i]-acts[i-1] > 5000) gaps.push([Math.round(acts[i-1]/1000), Math.round(acts[i]/1000)]);
  const misses = E.filter(e => e.type==='miss').map(e => (e.k? e.k+'≠'+ (e.want||'?') + ' in ' : '') + (e.w||''));
  const suppressedMisses = E.filter(e => e.type==='miss_suppressed');
  const jammedInputs = E.filter(e => e.type==='input_jammed');
  const items = E.filter(e => ['item_stock','item_gain','item_overflow','tab','shield_absorb'].includes(e.type));
  const deaths = E.filter(e => e.type==='life_lost'||e.type==='shield_absorb'||e.type==='ship_hit')
    .map(e => e.type==='ship_hit' ? 'fire:'+(e.shielded?'shield':'life') : e.type[0]+':'+e.w);
  const over = E.find(e => e.type==='over') || {};
  const kills = E.filter(e=>e.type==='kill');
  const settles = E.filter(e=>e.type==='settle' && Number.isFinite(e.lag));
  // Logical kills are input tempo; settle lag measures how long presentation trails the verdict.
  let kGaps = []; for (let i=1;i<kills.length;i++) kGaps.push((kills[i].t-kills[i-1].t)/1000);
  const avgKill = kGaps.length ? (kGaps.reduce((a,b)=>a+b,0)/kGaps.length).toFixed(1) : '-';
  const settleLags = settles.map(e=>e.lag).sort((a,b)=>a-b);
  const forcedSettles = settles.filter(e=>e.forced).length;
  const avgSettle = settleLags.length ? Math.round(settleLags.reduce((a,b)=>a+b,0)/settleLags.length) : '-';
  const p90Settle = settleLags.length ? settleLags[Math.floor((settleLags.length-1)*.9)] : '-';
  const visual = S.filter(s => s.scene && Array.isArray(s.scene.words));
  const recoilBanks = visual.map(s => Number(s.scene.recoil_bank) || 0);
  const syncValues = visual.map(s => Number(s.scene.sync) || 0);
  const deliveryWindows = visual.map(s => s.scene.delivery_ms)
    .filter(v => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
  const liveRows = s => s.scene.words.filter(w => !(w[9] & 1));
  const targetRow = s => s.scene.words.find(w => w[9] & 4);
  const overlap = (a,b) => Math.max(0, Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1])) *
    Math.max(0, Math.min(a[2]+a[4],b[2]+b[4])-Math.max(a[2],b[2]));
  const overlapAudits = visual.map(s => {
    const words = liveRows(s), pairs = [];
    for (let i=0;i<words.length;i++) for (let j=i+1;j<words.length;j++){
      const area = overlap(words[i], words[j]);
      if (area > 0) pairs.push([words[i][0], words[j][0], Math.round(area)]);
    }
    return { t:s.t, viewport_paused:s.scene.vp || 0, pairs };
  });
  const overlapping = overlapAudits.filter(x => x.pairs.length);
  const maxOverlapPairs = overlapping.reduce((m,x)=>Math.max(m,x.pairs.length),0);
  const maxOverlapArea = overlapping.reduce((m,x)=>Math.max(m,...x.pairs.map(p=>p[2])),0);
  const viewportEvents = E.filter(e => ['viewport','viewport_pause','viewport_resume'].includes(e.type)).map(e => ({
    t:e.t, type:e.type,
    from:e.from || null, to:e.to || (Number.isFinite(e.w) ? [e.w,e.h] : null),
    paused:e.paused ?? e.after?.vp ?? (e.type === 'viewport_pause' ? 1 : e.type === 'viewport_resume' ? 0 : null),
  }));
  const wingHolds = E.filter(e => e.type === 'wing_hold').map(e => ({
    t:e.t, word:e.w, y:e.y, clearance:e.clearance, target:e.target, effect:e.effect,
  }));
  const sampleAtOrBefore = (t, pool=visual) => {
    let found = null;
    for (const s of pool){ if (s.t > t) break; found = s; }
    return found;
  };
  const firstAnyVisible = visual.find(s => liveRows(s).some(w => w[11] > 0));
  const firstAllVisible = visual.find(s => liveRows(s).length && liveRows(s).every(w => w[11] === 100));
  const firstTargetVisible = visual.find(s => { const w=targetRow(s); return w && w[11] > 0; });
  let targetInvisibleMs = 0, noLiveVisibleMs = 0, activeTargetInvisibleMs = 0, activeNoLiveVisibleMs = 0;
  let pausedMs = 0, bannerCoverMs = 0, maxBannerCover = 0;
  for (let i=0; i+1<visual.length; i++){
    const dt = Math.min(250, Math.max(0, visual[i+1].t - visual[i].t));
    const live = liveRows(visual[i]), target = targetRow(visual[i]);
    if (target && target[11] === 0) targetInvisibleMs += dt;
    if (live.length && !live.some(w => w[11] > 0)) noLiveVisibleMs += dt;
    if (visual[i].scene.vp) pausedMs += dt;
    else {
      if (target && target[11] === 0) activeTargetInvisibleMs += dt;
      if (live.length && !live.some(w => w[11] > 0)) activeNoLiveVisibleMs += dt;
    }
    const cover = live.reduce((m,w)=>Math.max(m,w[12]||0),0);
    if (cover > 0) bannerCoverMs += dt;
    maxBannerCover = Math.max(maxBannerCover, cover);
  }
  const sceneCounts = visual.map(s => liveRows(s).filter(w => w[11] > 0).length);
  const hostileCounts = visual.map(s => Array.isArray(s.scene.enemyShots) ? s.scene.enemyShots.length : 0);
  const maxHostile = hostileCounts.length ? Math.max(...hostileCounts) : 0;
  const avgHostile = hostileCounts.length
    ? +(hostileCounts.reduce((a,b)=>a+b,0)/hostileCounts.length).toFixed(2) : 0;
  const shieldVisual = E.filter(e => e.type==='shield_absorb' && e.before && e.after).map(e => {
    const summarize = scene => {
      const live = scene.words.filter(w => !(w[9]&1)), target = scene.words.find(w => w[9]&4);
      return { visible:live.filter(w=>w[11]>0).length, total:live.length,
        target_text_vis:target ? target[11] : null, target_render_y:target ? target[2] : null,
        target_logic_y:target ? (target[14] ?? target[2]) : null, recoil_ms:target ? (target[15] ?? 0) : null };
    };
    return { t:e.t, word:e.w, before:summarize(e.before), after:summarize(e.after) };
  });
  const sentenceStarts = E.filter(e => e.type === 'sentence_start' && Array.isArray(e.words));
  const overT = E.find(e => e.type === 'over')?.t ?? (S.at(-1)?.t ?? 0);
  const sentenceAudits = sentenceStarts.map((start, sentenceIndex) => {
    const nextStart = sentenceStarts[sentenceIndex + 1];
    const end = nextStart?.t ?? overT;
    const inSegment = t => t >= start.t && (nextStart ? t < end : t <= end);
    const seg = visual.filter(s => inSegment(s.t));
    const inputEvents = E.filter(e => ['key_input','tap_input','tab','cargo_capture','cargo_deliver','escort_fire'].includes(e.type) && inSegment(e.t));
    const killsInSegment = E.filter(e => e.type === 'kill' && inSegment(e.t));
    const settlesInSegment = E.filter(e => e.type === 'settle' && inSegment(e.t));
    const eventOrder = e => Number.isInteger(e.order) ? e.order :
      (Number.isInteger(e.scene?.i) ? e.scene.i : null);
    const answerCount = Number.isInteger(start.answer_count) ? start.answer_count : start.words.length;
    const answerInitials = start.words.filter((initial,index) => initial[7] !== 1 && index < answerCount);
    const decoyInitials = start.words.filter((initial,index) => initial[7] === 1 || index >= answerCount);
    const words = answerInitials.map(initial => {
      const order = initial[0], text = initial[1];
      const rows = seg.map(s => ({ s, row:s.scene.words.find(w => w[0] === order) })).filter(x => x.row);
      const firstFull = rows.find(x => x.row[11] === 100)?.s.t ?? null;
      const firstInput = inputEvents.find(e => eventOrder(e) === order || (eventOrder(e) === null && e.w === text));
      const inputSample = firstInput ? sampleAtOrBefore(firstInput.t, seg) : null;
      const inputScene = firstInput?.scene || inputSample?.scene;
      const inputRow = inputScene?.words.find(w => w[0] === order);
      const inputSceneT = firstInput?.scene ? firstInput.t : inputSample?.t;
      const kill = killsInSegment.find(e => e.order === order) ||
        (killsInSegment[order]?.order === undefined ? killsInSegment[order] : null);
      const duplicateRank = start.words.filter(w => w[1] === text).findIndex(w => w[0] === order);
      const orderedSettles = settlesInSegment.filter(e => e.order === order && (!kill || e.t >= kill.t));
      const legacySettles = settlesInSegment.filter(e => e.order === undefined && e.w === text && (!kill || e.t >= kill.t));
      const settle = orderedSettles[0] || legacySettles[duplicateRank] || null;
      const losses = E.filter(e => ['life_lost','shield_absorb'].includes(e.type) &&
        (e.order === order || (e.order === undefined && (e.before?.i === order || e.w === text))) && inSegment(e.t));
      return {
        order, text, first_full_t:firstFull, first_input_t:firstInput?.t ?? null,
        input_scene_t:inputSceneT ?? null,
        input_scene_age_ms:firstInput && inputSceneT !== undefined ? firstInput.t-inputSceneT : null,
        input_text_vis:inputRow?.[11] ?? null, input_banner_cover:inputRow?.[12] ?? null,
        input_render_y:inputRow?.[2] ?? null, input_logic_y:inputRow?.[14] ?? inputRow?.[2] ?? null,
        kill_t:kill?.t ?? null, settle_t:settle?.t ?? null,
        breakthrough_t:losses.map(e => e.t),
      };
    });
    let targetInvisible = 0, noLiveVisible = 0;
    for (let i=0;i+1<seg.length;i++){
      const dt = Math.min(250, Math.max(0, seg[i+1].t - seg[i].t));
      const live = liveRows(seg[i]), target = targetRow(seg[i]);
      if (target && target[11] === 0) targetInvisible += dt;
      if (live.length && !live.some(w => w[11] > 0)) noLiveVisible += dt;
    }
    const movementTimes = seg.filter(s => s.scene && s.scene.move_dir).map(s => s.t);
    const boundaries = [start.t, ...inputEvents.map(e => e.t), ...movementTimes, end].sort((a,b)=>a-b);
    const inputSilences = [];
    for (let i=1;i<boundaries.length;i++) if (boundaries[i]-boundaries[i-1] > 5000)
      inputSilences.push([boundaries[i-1], boundaries[i], boundaries[i]-boundaries[i-1]]);
    return {
      item:start.item || null, prompt:start.ask || null,
      sentence: [start.lead,...answerInitials.map(w => w[1])].filter(Boolean).join(' ')+(start.tail||''),
      offered:start.words.map(w=>w[1]), decoys:decoyInitials.map(w=>w[1]),
      start_t:start.t, end_t:end,
      samples:seg.length, input_events:inputEvents.length, movement_samples:movementTimes.length, input_silences:inputSilences,
      target_invisible_ms:targetInvisible, no_live_visible_ms:noLiveVisible,
      hidden_first_inputs:words.filter(w => w.first_input_t !== null && w.input_text_vis === 0).map(w => w.text),
      unobserved_first_inputs:words.filter(w => w.first_input_t !== null &&
        (w.input_text_vis === null || w.input_scene_age_ms > 250)).map(w => w.text),
      words,
    };
  });
  const completedDurations = sentenceStarts.map((start,index) => {
    const nextStart = sentenceStarts[index+1], boundary = nextStart?.t ?? overT;
    const clear = E.find(e => e.type==='clear' && e.t >= start.t && (nextStart ? e.t < boundary : e.t <= boundary));
    return clear ? (clear.t-start.t)/1000 : null;
  }).filter(Number.isFinite).sort((a,b)=>a-b);
  const completedAvg = completedDurations.length
    ? completedDurations.reduce((a,b)=>a+b,0)/completedDurations.length : null;
  const completedMedian = completedDurations.length
    ? completedDurations[Math.floor((completedDurations.length-1)/2)] : null;
  console.log('=== ' + f + ' ===');
  console.log('mode:', T.meta.mode, '| variant:', T.meta.ab_variant || '-', '| seed:', T.meta.ab_seed ?? '-',
    '| dur:', dur.toFixed(0)+'s', '| samples:', S.length, '| viewport:', T.meta.w+'x'+T.meta.h);
  console.log('events:', JSON.stringify(ev));
  console.log('threat d px: min', ds[0], '| p10', pct(.1), '| median', pct(.5), '| p90', pct(.9));
  console.log('tension: d<150px', (closeFrac*100).toFixed(1)+'% of time | d<60px', (veryClose*100).toFixed(1)+'%');
  console.log('avg sec between logical kills:', avgKill, '| boredom gaps>5s:', JSON.stringify(gaps));
  console.log('visual settle lag ms: avg', avgSettle, '| p90', p90Settle, '| transition flush', forcedSettles+'/'+settles.length);
  console.log('mistake bursts: penalized', misses.length, '| blocked spam inputs', jammedInputs.length,
    '| legacy suppressed keys', suppressedMisses.length);
  console.log('completed item pace: n', completedDurations.length,
    '| avg sec', completedAvg === null ? '-' : completedAvg.toFixed(1),
    '| median sec', completedMedian === null ? '-' : completedMedian.toFixed(1),
    '| projected 10 min', completedAvg === null ? '-' : (completedAvg*10/60).toFixed(2));
  console.log('item economy:', JSON.stringify(items.map(e => ({
    t:e.t, type:e.type, item:e.item, reason:e.reason, word:e.w,
    started:e.at, threat:e.d, left:e.left, tabs:e.tabs, shields:e.shields, points:e.points,
  }))));
  if (visual.length){
    console.log('visual trace:', visual.length+' scene samples', '| file bytes', fs.statSync(tracePath).size,
      '| first any/all/target text visible ms', firstAnyVisible?.t ?? null, firstAllVisible?.t ?? null, firstTargetVisible?.t ?? null);
    console.log('visual visibility: live words visible min/max', Math.min(...sceneCounts)+'/'+Math.max(...sceneCounts),
      '| target invisible ms', targetInvisibleMs, '| no live word visible ms', noLiveVisibleMs);
    console.log('hostile fire: avg/max visible', avgHostile+'/'+maxHostile,
      '| ship hits', E.filter(e=>e.type==='ship_hit').length,
      '| bullet clears', E.filter(e=>e.type==='bullet_clear').length);
    console.log('recoil reserve: max', recoilBanks.length ? Math.max(...recoilBanks) : 0,
      '| sampled active frames', recoilBanks.filter(v=>v>0).length,
      '| earned events', E.filter(e=>e.type==='earned_recoil').length,
      '| reserve bonuses', E.filter(e=>e.type==='reserve_bonus').length);
    console.log('B dodge core: max sync', syncValues.length ? Math.max(...syncValues) : 0,
      '| grazes', E.filter(e=>e.type==='graze').length,
      '| impact parries', E.filter(e=>e.type==='impact_parry').length,
      '| core bursts', E.filter(e=>e.type==='core_burst').length,
      '| sync lost to hits', E.filter(e=>e.type==='ship_hit').reduce((n,e)=>n+Math.max(0,(e.sync_before||0)-(e.sync_after||0)),0));
    if (deliveryWindows.length) console.log('delivery window ms: min', Math.min(...deliveryWindows),
      '| max', Math.max(...deliveryWindows), '| captures', E.filter(e=>e.type==='cargo_capture').length,
      '| docks', E.filter(e=>e.type==='cargo_deliver').length,
      '| escort shots', E.filter(e=>e.type==='escort_fire').length);
    console.log('active-play visibility: target invisible ms', activeTargetInvisibleMs,
      '| no live word visible ms', activeNoLiveVisibleMs, '| viewport-paused ms', pausedMs);
    console.log('visual occlusion: banner overlap ms', bannerCoverMs, '| max covered text %', maxBannerCover);
    console.log('viewport transitions:', JSON.stringify(viewportEvents));
    console.log('future-word holds:', JSON.stringify(wingHolds));
    console.log('visual block overlap:', JSON.stringify({
      samples:overlapping.length, first_t:overlapping[0]?.t ?? null, last_t:overlapping.at(-1)?.t ?? null,
      max_pairs:maxOverlapPairs, max_area_px2:maxOverlapArea,
      first_pairs:overlapping[0]?.pairs ?? [], paused_samples:overlapping.filter(x=>x.viewport_paused).length,
    }));
    console.log('shield visual transitions:', JSON.stringify(shieldVisual));
    console.log('scene completeness:', JSON.stringify({
      pipeline:T.meta.pipeline, samples_declared:T.meta.sample_count, samples_actual:S.length,
      events_declared:T.meta.event_count, events_actual:E.length,
      samples_without_scene:S.length-visual.length,
    }));
    for (const audit of sentenceAudits){
      console.log('sentence timeline:', JSON.stringify(audit));
    }
  } else console.log('visual trace: unavailable (pipeline <3)');
  console.log('misses:', JSON.stringify(misses.slice(0,10)));
  console.log('deaths:', JSON.stringify(deaths));
  console.log('final:', JSON.stringify(over));
  console.log('');
}
