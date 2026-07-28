const fs = require('fs');
const dir = 'C:/Users/com/Documents/toefl-writing/traces';
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))){
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
  console.log('misses:', JSON.stringify(misses.slice(0,10)));
  console.log('deaths:', JSON.stringify(deaths));
  console.log('final:', JSON.stringify(over));
  console.log('');
}
