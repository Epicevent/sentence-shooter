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
  const acts = E.filter(e => ['kill','miss','tab','hint'].includes(e.type)).map(e => e.t);
  let gaps = []; for (let i=1;i<acts.length;i++) if (acts[i]-acts[i-1] > 5000) gaps.push([Math.round(acts[i-1]/1000), Math.round(acts[i]/1000)]);
  const misses = E.filter(e => e.type==='miss').map(e => (e.k? e.k+'≠'+ (e.want||'?') + ' in ' : '') + (e.w||''));
  const deaths = E.filter(e => e.type==='life_lost'||e.type==='shield_absorb').map(e => e.type[0]+':'+e.w);
  const over = E.find(e => e.type==='over') || {};
  const kills = E.filter(e=>e.type==='kill');
  // per-kill spacing (action tempo)
  let kGaps = []; for (let i=1;i<kills.length;i++) kGaps.push((kills[i].t-kills[i-1].t)/1000);
  const avgKill = kGaps.length ? (kGaps.reduce((a,b)=>a+b,0)/kGaps.length).toFixed(1) : '-';
  console.log('=== ' + f + ' ===');
  console.log('mode:', T.meta.mode, '| dur:', dur.toFixed(0)+'s', '| samples:', S.length, '| viewport:', T.meta.w+'x'+T.meta.h);
  console.log('events:', JSON.stringify(ev));
  console.log('threat d px: min', ds[0], '| p10', pct(.1), '| median', pct(.5), '| p90', pct(.9));
  console.log('tension: d<150px', (closeFrac*100).toFixed(1)+'% of time | d<60px', (veryClose*100).toFixed(1)+'%');
  console.log('avg sec between kills:', avgKill, '| boredom gaps>5s:', JSON.stringify(gaps));
  console.log('misses:', JSON.stringify(misses.slice(0,10)));
  console.log('deaths:', JSON.stringify(deaths));
  console.log('final:', JSON.stringify(over));
  console.log('');
}
