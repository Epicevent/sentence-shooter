const fs = require('fs');
const dir = 'C:/Users/com/Documents/toefl-writing/traces';
const requested = process.argv[2];
const files = fs.readdirSync(dir).filter(x => x.endsWith('.json') && (!requested || x === requested));
if (requested && !files.length) throw new Error('trace not found: ' + requested);
for (const f of files){
  const T = JSON.parse(fs.readFileSync(dir + '/' + f));
  const S = T.samples, E = T.events;
  const dur = S.length ? (S[S.length-1].t - S[0].t)/1000 : 0;
  const ds = S.map(s => s.d).filter(d => d !== null).sort((a,b)=>a-b);
  const pct = p => ds[Math.floor(ds.length*p)] ?? null;
  const closeFrac = ds.length ? ds.filter(d => d < 150).length/ds.length : 0;
  const veryClose = ds.length ? ds.filter(d => d < 60).length/ds.length : 0;
  const ev = {}; for (const e of E) ev[e.type] = (ev[e.type]||0)+1;
  // boredom: gaps between consecutive action events (kill/miss) > 5s
  const acts = E.filter(e => ['kill','miss','miss_suppressed','tab','hint'].includes(e.type)).map(e => e.t);
  let gaps = []; for (let i=1;i<acts.length;i++) if (acts[i]-acts[i-1] > 5000) gaps.push([Math.round(acts[i-1]/1000), Math.round(acts[i]/1000)]);
  const misses = E.filter(e => e.type==='miss').map(e => (e.k? e.k+'≠'+ (e.want||'?') + ' in ' : '') + (e.w||''));
  const suppressedMisses = E.filter(e => e.type==='miss_suppressed');
  const items = E.filter(e => ['item_stock','item_gain','item_overflow','tab','shield_absorb'].includes(e.type));
  const deaths = E.filter(e => e.type==='life_lost'||e.type==='shield_absorb').map(e => e.type[0]+':'+e.w);
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
  const liveRows = s => s.scene.words.filter(w => !(w[9] & 1));
  const targetRow = s => s.scene.words.find(w => w[9] & 4);
  const sampleAtOrBefore = (t, pool=visual) => {
    let found = null;
    for (const s of pool){ if (s.t > t) break; found = s; }
    return found;
  };
  const firstAnyVisible = visual.find(s => liveRows(s).some(w => w[11] > 0));
  const firstAllVisible = visual.find(s => liveRows(s).length && liveRows(s).every(w => w[11] === 100));
  const firstTargetVisible = visual.find(s => { const w=targetRow(s); return w && w[11] > 0; });
  let targetInvisibleMs = 0, noLiveVisibleMs = 0, bannerCoverMs = 0, maxBannerCover = 0;
  for (let i=0; i+1<visual.length; i++){
    const dt = Math.min(250, Math.max(0, visual[i+1].t - visual[i].t));
    const live = liveRows(visual[i]), target = targetRow(visual[i]);
    if (target && target[11] === 0) targetInvisibleMs += dt;
    if (live.length && !live.some(w => w[11] > 0)) noLiveVisibleMs += dt;
    const cover = live.reduce((m,w)=>Math.max(m,w[12]||0),0);
    if (cover > 0) bannerCoverMs += dt;
    maxBannerCover = Math.max(maxBannerCover, cover);
  }
  const sceneCounts = visual.map(s => liveRows(s).filter(w => w[11] > 0).length);
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
    const end = sentenceStarts[sentenceIndex + 1]?.t ?? overT;
    const seg = visual.filter(s => s.t >= start.t && s.t <= end);
    const inputEvents = E.filter(e => ['key_input','tap_input','tab'].includes(e.type) && e.t >= start.t && e.t <= end);
    const killsInSegment = E.filter(e => e.type === 'kill' && e.t >= start.t && e.t <= end);
    const settlesInSegment = E.filter(e => e.type === 'settle' && e.t >= start.t && e.t <= end);
    const eventOrder = e => Number.isInteger(e.order) ? e.order :
      (Number.isInteger(e.scene?.i) ? e.scene.i : null);
    const words = start.words.map(initial => {
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
      const settle = settlesInSegment.find(e => e.order === order) ||
        settlesInSegment.filter(e => e.order === undefined && e.w === text)[duplicateRank] || null;
      const losses = E.filter(e => ['life_lost','shield_absorb'].includes(e.type) &&
        (e.order === order || (e.order === undefined && (e.before?.i === order || e.w === text))) && e.t >= start.t && e.t <= end);
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
    const boundaries = [start.t, ...inputEvents.map(e => e.t), end].sort((a,b)=>a-b);
    const inputSilences = [];
    for (let i=1;i<boundaries.length;i++) if (boundaries[i]-boundaries[i-1] > 5000)
      inputSilences.push([boundaries[i-1], boundaries[i], boundaries[i]-boundaries[i-1]]);
    return {
      sentence: start.words.map(w => w[1]).join(' '), start_t:start.t, end_t:end,
      samples:seg.length, input_events:inputEvents.length, input_silences:inputSilences,
      target_invisible_ms:targetInvisible, no_live_visible_ms:noLiveVisible,
      hidden_first_inputs:words.filter(w => w.first_input_t !== null && w.input_text_vis === 0).map(w => w.text),
      unobserved_first_inputs:words.filter(w => w.first_input_t !== null &&
        (w.input_text_vis === null || w.input_scene_age_ms > 250)).map(w => w.text),
      words,
    };
  });
  console.log('=== ' + f + ' ===');
  console.log('mode:', T.meta.mode, '| dur:', dur.toFixed(0)+'s', '| samples:', S.length, '| viewport:', T.meta.w+'x'+T.meta.h);
  console.log('events:', JSON.stringify(ev));
  console.log('threat d px: min', ds[0], '| p10', pct(.1), '| median', pct(.5), '| p90', pct(.9));
  console.log('tension: d<150px', (closeFrac*100).toFixed(1)+'% of time | d<60px', (veryClose*100).toFixed(1)+'%');
  console.log('avg sec between logical kills:', avgKill, '| boredom gaps>5s:', JSON.stringify(gaps));
  console.log('visual settle lag ms: avg', avgSettle, '| p90', p90Settle, '| transition flush', forcedSettles+'/'+settles.length);
  console.log('mistake bursts: penalized', misses.length, '| suppressed repeat keys', suppressedMisses.length);
  console.log('item economy:', JSON.stringify(items.map(e => ({
    t:e.t, type:e.type, item:e.item, reason:e.reason, word:e.w,
    started:e.at, threat:e.d, left:e.left, tabs:e.tabs, shields:e.shields, points:e.points,
  }))));
  if (visual.length){
    console.log('visual trace:', visual.length+' scene samples', '| file bytes', fs.statSync(dir + '/' + f).size,
      '| first any/all/target text visible ms', firstAnyVisible?.t ?? null, firstAllVisible?.t ?? null, firstTargetVisible?.t ?? null);
    console.log('visual visibility: live words visible min/max', Math.min(...sceneCounts)+'/'+Math.max(...sceneCounts),
      '| target invisible ms', targetInvisibleMs, '| no live word visible ms', noLiveVisibleMs);
    console.log('visual occlusion: banner overlap ms', bannerCoverMs, '| max covered text %', maxBannerCover);
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
