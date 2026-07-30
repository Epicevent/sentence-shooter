const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const repo = path.join(__dirname, '..');
const html = process.env.SHOOTER_REV
  ? childProcess.execFileSync('git', ['show', process.env.SHOOTER_REV + ':index.html'], { cwd: repo, encoding: 'utf8' })
  : fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const viewport = { w:800, h:600 };
function element(id){
  const classes = new Set(id === 'start' ? [] : ['hidden']);
  return {
    id, style:{setProperty(k,v){this[k]=v;}}, textContent:'', innerHTML:'', offsetWidth:800,
    classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),
      toggle:(x,force)=>force===undefined?(classes.has(x)?(classes.delete(x),false):(classes.add(x),true)):(force?(classes.add(x),true):(classes.delete(x),false))},
    addEventListener(){}, appendChild(){}, remove(){},
    getBoundingClientRect(){return{left:0,top:0,width:id==='wrap'?viewport.w:800,height:id==='wrap'?viewport.h:600};},
  };
}
const elements=new Map();
const canvasContext=new Proxy({measureText:text=>({width:String(text).length*9}),createLinearGradient:()=>({addColorStop(){}})},
  {get:(target,key)=>key in target?target[key]:()=>{}});
function getElement(id){
  if(!elements.has(id))elements.set(id,element(id));
  const el=elements.get(id);if(id==='cv')el.getContext=()=>canvasContext;return el;
}
const storage=new Map(),scheduledTimers=[],rafCalls=[];
const sandbox={
  console,performance,Math,Date,JSON,Object,Array,String,Number,RegExp,Set,Map,Float32Array,Int32Array,TextEncoder,URLSearchParams,
  location:{search:'?ab=A&seed=20260728&reviewer=agent-a'},
  setTimeout:(fn,delay=0)=>{scheduledTimers.push({fn,delay});return scheduledTimers.length;},clearTimeout(){},
  requestAnimationFrame:fn=>rafCalls.push(fn),getComputedStyle:()=>({opacity:'1'}),fetch:async()=>({ok:true}),
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  navigator:{userAgent:'pipeline-test',vibrate(){}},
  document:{getElementById:getElement,createElement:id=>element(id),addEventListener(){}},
};
sandbox.window=sandbox;sandbox.window.addEventListener=()=>{};sandbox.window.devicePixelRatio=1;
vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'index.html'});
const run=code=>vm.runInContext(code,sandbox);

assert.strictEqual(run('ITEMS.length'),74,'12 original, 58 photographed, and four boss items must remain');
assert.strictEqual(run(`ITEMS.filter(item=>item.source&&item.source.startsWith('photo-')).length`),58);
assert.strictEqual(run(`ITEMS.filter(item=>item.boss).length`),4);
assert.strictEqual(run(`ITEMS.filter(item=>item.boss).every(item=>item.answer.length>=8&&item.answer.length<=12)`),true);
assert.strictEqual(run(`new Set(ITEMS.map(item=>item.id)).size`),74);
assert.deepStrictEqual(Array.from(run('CRAFT_ORDER')),['striker','phantom','carrier','bulwark'],'the 1945 hangar must expose four selectable aircraft');
assert.ok(html.includes('id="hangar-grid"')&&html.includes('data-craft=')&&html.includes('LAUNCH SELECTED'),
  'aircraft choice must be a visible launch-screen control rather than a hidden query flag');
assert.ok(!html.includes('id="h-tabs"')&&!html.includes('id="h-shields"'),'removed inventories must stay removed');
const liveHudMarkup=html.slice(html.indexOf('<div id="hud">'),html.indexOf('<div id="wrap">'));
assert.ok(liveHudMarkup.includes('id="h-progress"')&&liveHudMarkup.includes('id="h-resource"')&&
  !liveHudMarkup.includes('FLOOR ')&&!liveHudMarkup.includes('YELLOW HARMLESS')&&!liveHudMarkup.includes('best '),
  'the live HUD must contain only player decisions, not build/heat telemetry or best-score prose');
assert.ok(!html.includes('function spawnEnemyShot')&&!html.includes('function launchWrongRicochet'),
  'word boxes must never emit direct or reflected projectiles');
assert.ok(html.includes('function drawHeatFog(field)') && !html.match(/function draw\(\)[\s\S]*?for\s*\([^)]*field\.particles/),
  'the authoritative heat field must render as continuous fog, never 180 individual yellow dots');
const threatRenderer=html.slice(html.indexOf('function drawHeatThreat(arrow){'),html.indexOf('function wordBoundaryTemperature'));
assert.ok(threatRenderer.includes('ctx.arc(0,0,arrow.r') && threatRenderer.includes('ctx.lineTo(-11,0)'),
  'both variants must use the user-selected round v21 control with its 11px tail');
assert.ok(!threatRenderer.includes("variant==='A'")&&!threatRenderer.includes('ctx.lineTo(40*s,0)')&&
  !html.includes("silhouette:g.variant==='A'?'round':'arrow'"),
  'the arrow silhouette experiment must be removed from both live variants');
assert.ok(!html.includes('RED ARROWS')&&!html.includes('HEAT VECTOR LOCK')&&!html.includes('BOUNDARY +0.10'),
  'visible feedback must say round volley and player action, not the removed arrow experiment or internal heat telemetry');

run(`startGame('type');`);
assert.deepStrictEqual(Array.from(run(`[TRACE.meta.pipeline,TRACE.meta.build,TRACE.meta.ab_concept,g.heat.particles.length,g.heat.floorBins.length]`)),
  [10,'torus-28','hangar_striker_preset',180,16]);
assert.strictEqual(run(`$('h-variant').textContent`),'STRIKER','the HUD must name the selected aircraft');
assert.strictEqual(run('TRACE.meta.reviewer'),'agent-a','reviewer query must survive into trace metadata');
assert.strictEqual(run(`g.heat.temp.every(v=>v===0)&&g.heat.floorBins.every(v=>v===0)&&g.heat.particles.every(p=>!p.active)`),true,
  'the whole torus must start at absolute zero with no visible tracers');
assert.strictEqual(run(`TRACE.events.some(e=>e.type==='field_start'&&e.topology==='torus'&&e.initial_temperature===0)`),true);
assert.deepStrictEqual(Array.from(run(`[roundTrace(.01234),roundHeat(.01234),roundHeat(.00006)]`)),[0,.0123,.0001],
  'heat telemetry must preserve small positive world temperatures instead of rounding them to zero');

run(`
  W=800;H=720;g.solved=2;g.item={id:'stream-source',ask:'?',lead:'',tail:'.',answer:['Final'],decoys:[]};
  g.sentence=['Final'];g.idx=0;g.words=[];g.incomingWords=[];g.preloadedItem=null;g.pendingSentenceClear=false;
  const streamFinal={text:'Final',order:0,x:320,y:160,targetY:160,w:100,h:34,hp:5,maxhp:5,flash:0,err:0,consumed:0,committed:5,
    resolved:false,resolvedAt:0,settled:false,pts:0,row:0,col:0,slot:0,jitterX:0,holding:false,threatY:null,isDecoy:false,baseX:320,
    phase:0,firedAt:0,heatPulse:0,rage:0,boundaryTemp:.25};
  g.words=[streamFinal];resolveWord(streamFinal);
  globalThis.streamPreload=[!!g.preloadedItem,!!g.preloadedItem.boss,g.incomingWords.length>=9,g.incomingWords.every(w=>w.incoming&&w.y<w.targetY),
    TRACE.events.some(e=>e.type==='formation_preload'&&e.boss===true)];
  g.words=[];g.pendingSentenceClear=false;g.solved=3;nextSentence();
  const streamedStart=TRACE.events.findLast(e=>e.type==='sentence_start');
  globalThis.bossActivation=[g.item.boss,g.sortieWave,g.sentence.length,g.words.every(w=>!w.incoming&&w.y===w.targetY),
    Math.round(g.waveGraceUntil-g.t0),streamedStart.streamed,streamedStart.boss,g.viewportPaused];
`);
assert.deepStrictEqual(Array.from(run('streamPreload')),[true,true,true,true,true],
  'the final logical confirmation must preload a non-interactive boss formation above its target slots');
assert.deepStrictEqual(Array.from(run('bossActivation')),[true,3,8,true,1400,true,true,false],
  'three regular waves must activate the same streamed 8-chunk boss formation as wave four');
run(`startGame('type');g.parts=[];popText(100,100,'ONE','#fff');popText(100,100,'TWO','#fff');popText(100,100,'THREE','#fff');
  globalThis.popStack=g.parts.map(p=>p.y);`);
assert.deepStrictEqual(Array.from(run('popStack')),[100,80,60],'simultaneous reward tutorials must stack instead of covering each other');

run(`
  $('cv').getBoundingClientRect=()=>({left:12,top:38,width:800,height:600});
  $('score-bank').getBoundingClientRect=()=>({left:350,top:8,width:160,height:21});
  globalThis.scoreTargets=[scoreMoteTarget('A').x,scoreMoteTarget('A').y,scoreMoteTarget('B').x,scoreMoteTarget('B').y];
  g.score=0;g.scoreDisplay=0;g.scoreMilestone=1500;g.scoreMotes=[];g.over=false;g.variant='A';
  awardScore(177,200,300,'score-effect-test');
  const scoreGainEvent=TRACE.events.findLast(e=>e.type==='score_gain');
  globalThis.scoreRise=[g.score,g.scoreDisplay,g.scoreMotes.length,
    g.scoreMotes.every((m,i)=>m.tx===418&&m.ty===8&&m.sx===200&&m.sy===300&&m.t===-i*.035&&m.life>=.48&&m.life<.60),
    g.scoreMotes.reduce((sum,m)=>sum+m.value,0),g.scoreMotes.filter(m=>m.final).length,g.scoreMotes.at(-1).final,
    scoreGainEvent.target_mode,scoreGainEvent.target_x,scoreGainEvent.target_y];
`);
assert.deepStrictEqual(Array.from(run('scoreTargets')),[418,8,216,8],
  'A restores the score rise to the live HUD bank while B preserves the current fixed landing point');
assert.deepStrictEqual(Array.from(run('scoreRise')),[177,0,4,true,177,1,true,'hud_bank',418,8],
  'the approved gold score rise keeps its cadence, curve inputs, and arrival-gated count-up in A');
run(`for(const mote of g.scoreMotes)mote.t=mote.life-.001;update(.01);
  globalThis.scoreArrival=[g.scoreDisplay,g.scoreMotes.length,$('score-bank').classList.contains('score-gain')];`);
assert.deepStrictEqual(Array.from(run('scoreArrival')),[177,0,true],
  'each mote arrival must bank the displayed score and the final arrival must restart the HUD gain pulse');
const scoreRenderer=html.slice(html.indexOf('for(const mote of (g.scoreMotes||[])){',html.indexOf('function draw()')),
  html.indexOf('for (const p of g.parts)',html.indexOf('function draw()')));
assert.ok(scoreRenderer.includes("ctx.fillStyle='#fff4b8'")&&scoreRenderer.includes("ctx.shadowColor='#f0bd67'")&&
  scoreRenderer.includes('ctx.rotate(Math.PI/4+q*2)')&&scoreRenderer.includes('ctx.fillRect(-size/2,-size/2,size,size)'),
  'the approved rotating gold diamond silhouette and palette are a locked common score-effect baseline');

run(`
  W=800;H=600;g.speed=0;g.sentence=['Alpha','Amber'];g.idx=0;g.words=[];g.missiles=[];g.fireQueues=[];
  globalThis.makeWord=(text,order,x,y=160)=>{const hp=sigLen(text);return{text,order,x,y,spawnY:y,w:100,h:34,hp,maxhp:hp,flash:0,err:0,
    consumed:0,committed:0,resolved:false,resolvedAt:0,settled:false,pts:0,row:0,col:order,slot:order,jitterX:0,
    holding:false,threatY:null,isDecoy:false,baseX:x,phase:0,firedAt:0,heatPulse:0,rage:0,boundaryTemp:.25};};
  g.words=[makeWord('Alpha',0,100),makeWord('Amber',1,300)];g.typePrefix='';g.lock=null;TRACE.events.length=0;
  handleKey('a');globalThis.multiFocus=[g.typePrefix,focusCandidates(g.typePrefix).length,g.idx,g.missiles.length];
  handleKey('l');globalThis.uniqueFocus=[g.typePrefix,g.lock&&g.lock.order,g.idx,g.missiles.length];
  handleTab();globalThis.focusConfirmed=[g.idx,g.words[0].resolved,g.combo,TRACE.events.filter(e=>e.type==='focus_confirm').length];
`);
assert.deepStrictEqual(Array.from(run('multiFocus')),['a',2,0,0]);
assert.deepStrictEqual(Array.from(run('uniqueFocus')),['al',0,0,0]);
assert.deepStrictEqual(Array.from(run('focusConfirmed')),[1,true,1,1],'Tab confirms focus and does not auto-build');
assert.strictEqual(run(`TRACE.events.some(e=>e.type==='confirm_feedback'&&e.correct&&e.freeze_ms===50)`),true,
  'Tab confirmation must answer immediately with a recorded 50ms hit-stop flash while score still waits for impact');
assert.deepStrictEqual(Array.from(run(`[g.visualAttached[0],g.assemblyFlights.length,$('built').textContent.includes('Alpha')]`)),
  [false,0,false],'logical correctness must not silently attach the chunk before its real impact');
run(`
  const attachingWord=g.words.find(w=>w.order===0);
  attachingWord.hp=0;settleWord(attachingWord,false);
  const launchEvent=TRACE.events.findLast(e=>e.type==='assembly_launch');
  globalThis.assemblyLaunch=[g.visualAttached[0],g.assemblyFlights.length,launchEvent.route,launchEvent.duration_ms,
    $('built').textContent.includes('Alpha')];
`);
scheduledTimers.findLast(timer=>timer.delay===380).fn();
run(`
  const dockEvent=TRACE.events.findLast(e=>e.type==='assembly_dock');
  globalThis.assemblyDock=[g.visualAttached[0],g.assemblyFlights.length,$('built').textContent.includes('Alpha'),
    dockEvent.route,dockEvent.attached];
`);
assert.deepStrictEqual(Array.from(run('assemblyLaunch')),[false,1,'direct_rail_slam',380,false],
  'A must launch a visible rail-slam flight from the physical impact without revealing the chunk early');
assert.deepStrictEqual(Array.from(run('assemblyDock')),[true,0,true,'direct_rail_slam',1],
  'A must attach the chunk and advance the visible rail only when the flight docks');
run(`
  g.variant='B';g.sentence=['Alpha','Amber'];g.visualAttached=[true,false];g.assemblyFlights=[];
  launchAssembly(makeWord('Amber',1,300),300,160);
  const bLaunch=TRACE.events.findLast(e=>e.type==='assembly_launch');
  globalThis.bAssemblyLaunch=[g.visualAttached[1],g.assemblyFlights.length,bLaunch.route,bLaunch.duration_ms,
    Array.isArray(bLaunch.via)&&bLaunch.via.length===2];
`);
scheduledTimers.findLast(timer=>timer.delay===560).fn();
run(`const bDock=TRACE.events.findLast(e=>e.type==='assembly_dock');
  globalThis.bAssemblyDock=[g.visualAttached[1],g.assemblyFlights.length,bDock.route,bDock.attached];`);
assert.deepStrictEqual(Array.from(run('bAssemblyLaunch')),[false,1,'core_link',560,true],
  'B must route the unattached chunk through the real core position');
assert.deepStrictEqual(Array.from(run('bAssemblyDock')),[true,0,'core_link',2],
  'B must attach only after its longer core-link flight docks');
assert.ok(html.includes("const railRoute=g.variant==='A'||(g.variant==='C'&&word.order%2===0)")&&
  html.includes("route=railRoute?'direct_rail_slam':'core_link',duration=railRoute?380:560")&&html.includes('assemblyLinkB'),
  'the combined build must preserve both exact A rail-slam and B core-link routes while sharing one correctness pipeline');

run(`
  g.variant='C';g.experiment='A';g.sentence=['the time','the time completing it'];g.idx=0;g.typePrefix='thetime';g.lock=null;
  g.words=[makeWord('the time',0,100),makeWord('the time completing it',1,300)];TRACE.events.length=0;
  const exactFocus=focusSelection(g.typePrefix);globalThis.exactPrefix=[exactFocus.candidates.length,exactFocus.chosen.text,exactFocus.chosen.order];
  handleTab();globalThis.exactConfirmed=[g.idx,g.words[0].resolved,g.words[1].resolved,TRACE.events.some(e=>e.type==='focus_confirm'&&e.order===0)];
`);
assert.deepStrictEqual(Array.from(run('exactPrefix')),[1,'the time',0],
  'a fully typed short chunk must outrank a longer chunk that only shares its prefix');
assert.deepStrictEqual(Array.from(run('exactConfirmed')),[1,true,false,true],
  'Tab must confirm the visible exact chunk without selecting the longer prefix collision');

run(`
  g.heat=createHeatField();g.words=[makeWord('Hot',0,200,150)];
  stepHeatField(HEAT_SIM_DT,performance.now());
  globalThis.boundaryModel=[wordBoundaryTemperature(g.words[0]),g.heat.maxTemp,g.heat.totalMass,
    Array.from({length:HEAT_GRID_X},(_,c)=>g.heat.temp[heatIndex(c,0)]).every(v=>v===0)];
  g.words[0].y=H-64-g.words[0].h;g.words[0].rage=2;
  globalThis.hotterBoundary=wordBoundaryTemperature(g.words[0]);
`);
const boundaryModel=Array.from(run('boundaryModel'));
assert.strictEqual(boundaryModel[0],.25);
assert.ok(boundaryModel[1]>=.25&&boundaryModel[2]>0,'moving word boundary must be the only initial heat source');
assert.strictEqual(boundaryModel[3],true,'the identified ceiling/floor seam is clamped to absolute zero');
assert.strictEqual(run('hotterBoundary'),1,'descent and wrong-answer rage raise the prescribed boundary temperature');

run(`
  g.heat=createHeatField();g.words=[];const row=12;
  g.heat.temp[heatIndex(0,row)]=1;stepHeatField(HEAT_SIM_DT,performance.now());
  globalThis.periodicX=[g.heat.temp[heatIndex(HEAT_GRID_X-1,row)]>0,g.heat.temp[heatIndex(1,row)]>0,
    Array.from({length:HEAT_GRID_X},(_,c)=>g.heat.temp[heatIndex(c,0)]).every(v=>v===0)];
`);
assert.deepStrictEqual(Array.from(run('periodicX')),[true,true,true],'x diffusion is periodic while the shared y seam remains zero');
assert.ok(run('HEAT_KAPPA*HEAT_SIM_DT*(HEAT_GRID_X*HEAT_GRID_X+HEAT_GRID_Y*HEAT_GRID_Y)')<.5,
  'the explicit 2-D heat stencil must stay inside its stability bound');
run(`g.heat=createHeatField();g.words=[];g.heat.temp[heatIndex(10,HEAT_GRID_Y-1)]=1;
  globalThis.seamSample=[sampleHeatUV(10/HEAT_GRID_X,0),sampleHeatUV(10/HEAT_GRID_X,(HEAT_GRID_Y-1)/HEAT_GRID_Y)];`);
assert.strictEqual(run('seamSample[0]'),0,'the tracer sampler must observe the cold seam exactly');
assert.ok(run('seamSample[1]')>.9,'the sampler must remain aligned with non-seam grid nodes');

run(`
  g.variant='C';g.heat=createHeatField();g.words=[];g.pressureWaves=[];g.wakeNodes=[];
  g.heat.temp.fill(.5);const localNode=addWakeNode(W*.5,2,'local-cooling');localNode.y=H*.5;localNode.radius=72;
  rasterizeCooling(g.heat);const center=heatIndex(Math.floor(HEAT_GRID_X*.5),Math.floor((localNode.y-DUST_TOP)/visibleHeight()*HEAT_GRID_Y));
  const far=heatIndex(2,8);globalThis.localSink=[g.heat.sink[center]>0,g.heat.sink[far]===0];
`);
assert.deepStrictEqual(Array.from(run('localSink')),[true,true],'cooling must rasterize locally instead of applying a global sink');
run(`
  g.variant='C';g.heat=createHeatField();g.words=[];g.wakeNodes=[];
  for(let i=0;i<24;i++)g.wakeNodes.push({id:i+1,x:W/2,y:H-48,t:0,life:3,radius:66,rpm:2.6});
  rasterizeCooling(g.heat);globalThis.sinkCap=Math.max(...g.heat.sink);
`);
assert.ok(run('sinkCap<=HEAT_SINK_CAP&&HEAT_SIM_DT*HEAT_SINK_CAP+2*HEAT_KAPPA*HEAT_SIM_DT*(HEAT_GRID_X**2+HEAT_GRID_Y**2)<1'),
  'overlapping cooling zones must remain inside the positive explicit-Euler coefficient bound');

run(`
  g.variant='A';g.combo=4;g.recoilBank=0;const answered=makeWord('Answered',0,100,160),remaining=makeWord('Remaining',1,300,220);
  g.words=[answered,remaining];const beforeY=remaining.y;applyCorrectDefense(answered,remaining);
  globalThis.noCorrectShove=[remaining.y,beforeY,g.recoilBank,Number.isFinite(remaining.recoilAt)];
`);
assert.deepStrictEqual(Array.from(run('noCorrectShove')),[220,220,0,false],
  'a correct answer must not shove the remaining word formation upward');

run(`
  W=800;H=600;g.perRow=2;g.visualPhase=0;
  const pending=makeWord('wanted to know',0,100,132),next=makeWord('would',2,100,190);
  pending.slot=0;pending.col=0;pending.row=0;pending.resolved=true;pending.settled=false;pending.committed=pending.maxhp;
  next.slot=2;next.col=0;next.row=1;next.resolved=false;next.settled=false;
  g.words=[pending,next];recoilFormation('viewport_resume',true,1000);
  globalThis.pendingImpactReflow=[pending.row,next.row,[0,130,260,390,520].every(ms=>{
    const ay=wordVisualY(pending,1000+ms),by=wordVisualY(next,1000+ms);
    return by-(ay+pending.h)>=0;
  }),TRACE.events.some(e=>e.type==='formation_recoil'&&e.reason==='viewport_resume'&&e.words.length===2)];
`);
assert.deepStrictEqual(Array.from(run('pendingImpactReflow')),[0,1,true,true],
  'viewport recovery must reserve a row for a logically dead but physically visible word until its real impact settles');

run(`
  g.variant='A';g.heat=createHeatField();seedDust(HEAT_TRACER_COUNT);g.words=[makeWord('Wrong',1,100,180)];
  for(let i=0;i<48;i++){const p=g.heat.particles[i];p.active=true;p.u=(i+.5)/48;p.v=.34+(i%8)*.055;p.heat=.55;p.x=p.u*W;p.y=torusToScreenY(p.v);p.px=p.x;p.py=p.y;}
  g.heat.temp.fill(.4);rebuildHeatStats(g.heat);g.lives=3;g.over=false;g.hitInvulnUntil=0;g.ship.x=400;
  const heatBefore=Array.from(g.heat.temp),integralBefore=g.heat.totalMass;
  applyWrongPenalty(g.words[0],{test:true});
  const arrows=g.heatArrows.length;const fieldUnchanged=g.heat.temp.every((v,i)=>v===heatBefore[i])&&g.heat.totalMass===integralBefore;
  updateHeatCombat(.1);globalThis.phaseChange=[arrows,fieldUnchanged,g.lives,g.words[0].rage,
    TRACE.events.some(e=>e.type==='heat_volley_armed'&&e.heat_integral>0&&e.field_unchanged===true&&e.silhouette==='round_control'&&e.same_source_position&&
      e.eligible_tracers===48&&e.volley_cap===36&&e.suppressed_tracers===12),
    g.heatArrows.every(a=>a.age<a.arm&&a.silhouette==='round'&&a.sourceX===a.x&&a.sourceY===a.y),
    g.heat.particles.slice(0,48).every(p=>p.active&&!p.armed)];
`);
const phaseChange=Array.from(run('phaseChange'));
assert.strictEqual(phaseChange[0],36,'wrong samples existing heat only up to the bounded lethal-volley budget');
assert.deepStrictEqual(phaseChange.slice(1),[true,3,1,true,true,true],
  'wrong answer arms visible telegraphed rounds without venting or consuming the authoritative temperature field');
assert.strictEqual(run(`g.heatArrows.every(a=>a.life>=a.arm+a.travelDistance/Math.hypot(a.vx,a.vy)+1.24)`),true,
  'far arrows must live long enough to cross their locked aim point instead of expiring by fixed lifetime');

run(`
  endHeatVolley('escort_reset');g.variant='C';g.experiment='A';g.pressureWaves=[];g.pressureWaveSeq=0;g.wingUnits=0;g.combo=1;
  g.escortShots=[];g.missiles=[];g.shotSeq=0;TRACE.events.length=0;
  for(let i=0;i<4;i++){const dock=makeWord('Dock'+i,i,100+i*90,160);dock.impactCombo=i+1;deployWingGun(dock,dock.x,dock.y,{limited:true});}
  const target=makeWord('Target',9,330,120);target.resolved=false;
  for(let i=0;i<5;i++)launchMissile(target,0,undefined,weaponLv());
  globalThis.escortReward=[g.wingUnits,g.pressureWaves.length,TRACE.events.some(e=>e.type==='wing_deploy'&&e.after===4&&e.barrels===5),
    MAX_WING_UNITS,weaponLv(),heavyWeaponOrigins().length,new Set(g.missiles.map(m=>Math.round(m.x/10))).size,
    g.missiles.filter(m=>m.origin==='escort').length,Math.round(g.rewardFlashUntil-g.rewardFlashAt)];
`);
assert.deepStrictEqual(Array.from(run('escortReward')),[4,4,true,4,5,5,5,4,260],
  'four symmetric escorts must add four real normal-fire origins and a recorded dock flash');

run(`
  g.variant='C';g.experiment='A';g.coolerLevel=4;g.stormCharge=3;g.wakeNodes=[];g.ship.x=300;g.over=false;g.viewportPaused=false;
  TRACE.events.length=0;const fixed=castStorm(1,'test-a'),fixedStart=fixed.x;updateHeatCombat(1);castStorm(-1,'test-a-steer');
  globalThis.fixedStorm=[fixed.x-fixedStart,fixed.vx,fixed.direction,g.stormCharge,
    TRACE.events.some(e=>e.type==='storm_cast'&&e.steerable===false),TRACE.events.some(e=>e.type==='storm_steer'),
    TRACE.events.some(e=>e.type==='storm_cast_blocked'&&e.reason==='active_fixed')];
`);
assert.deepStrictEqual(Array.from(run('fixedStorm')),[78,-78,-1,0,false,true,false],
  'STRIKER spends one earned skill and can visibly reverse its active wake');
assert.strictEqual(run(`TRACE.events.some(e=>e.type==='sweep_start'&&e.vy===-600&&e.iframes_ms===1650)`),true,
  'storm cast must start the decisive 600px/s BIG WING SWEEP and its short bomb i-frame');

run(`
  g.variant='C';g.experiment='B';g.coolerLevel=4;g.stormCharge=3;g.wakeNodes=[];g.ship.x=300;TRACE.events.length=0;
  const steer=castStorm(1,'test-b');updateHeatCombat(.5);const beforeTurn=steer.x;castStorm(-1,'test-b-steer');updateHeatCombat(.5);
  globalThis.steerStorm=[beforeTurn-300,steer.x-beforeTurn,steer.vx,steer.direction,g.stormCharge,
    TRACE.events.some(e=>e.type==='storm_steer'&&e.before===1&&e.after===-1)];
`);
assert.deepStrictEqual(Array.from(run('steerStorm')),[39,-39,-78,-1,0,true],
  'legacy A/B presets must both preserve the selected STRIKER steering verb');
run(`
  g.variant='C';g.experiment='A';g.coolerLevel=3;g.stormCharge=3;g.wakeNodes=[];
  globalThis.noAutoStorm=castWakeFromMovement(300,340,0,true);
`);
assert.strictEqual(run('noAutoStorm'),null,'ordinary movement must never auto-spend the STRIKER storm skill');
assert.ok(html.includes("if (e.key === ' ' || e.code === 'Space'){ e.preventDefault(); return; }"),
  'Space is typing cadence and must stay a no-op instead of casting the storm');

run(`
  endHeatVolley('fusion_reset');g.variant='C';g.experiment='A';g.pressureWaves=[];g.wakeNodes=[];g.wingUnits=0;g.escortAmmo=0;g.coolerLevel=0;g.stormCharge=0;g.combo=2;
  g.sentence=['Fuse'];g.idx=1;const fuse=makeWord('Fuse',0,220,160);fuse.resolved=true;fuse.resolvedAt=performance.now();
  fuse.impactCombo=2;fuse.pts=100;fuse.hp=0;g.words=[fuse];settleWord(fuse);
  globalThis.fusionReward=[g.wingUnits,g.escortAmmo,g.coolerLevel,g.pressureWaves.length,
    TRACE.events.some(e=>e.type==='fusion_reward'&&e.escort_ammo===1&&e.storm_level===2&&e.storm_charge===1)];
`);
assert.deepStrictEqual(Array.from(run('fusionReward')),[1,1,2,2,true],
  'a docked STRIKER escort must add a visible normal-fire wave instead of being interception-only');
run(`
  g.variant='C';g.experiment='A';g.coolerLevel=0;g.stormCharge=0;const later=makeWord('Later',1,300),earlier=makeWord('Earlier',0,100);
  later.impactCombo=2;earlier.impactCombo=1;boostWakeDrive(later,300,160);boostWakeDrive(earlier,100,160);
  globalThis.outOfOrderStorm=[g.coolerLevel,g.stormCharge,TRACE.events.filter(e=>e.type==='wake_drive').slice(-2).map(e=>[e.before,e.after])];
`);
assert.strictEqual(run('JSON.stringify(outOfOrderStorm)'),'[2,2,[[0,2],[2,2]]]',
  'a late first-word missile may not rewind STORM earned by an earlier-arriving second-word missile');
run(`
  g.craft='phantom';g.variant='B';g.sync=0;g.grazes=0;g.heatArrows=[];TRACE.events.length=0;
  const pressure=makeWord('Pressure',0,260,140);g.words=[pressure];g.idx=0;g.ship.x=320;
  const grazeRound=spawnCraftPressureRound('phantom_pressure');awardGraze(grazeRound);
  globalThis.phantomGraze=[grazeRound.origin,g.sync,g.grazes,TRACE.events.some(e=>e.type==='graze'&&e.after===25)];
`);
assert.deepStrictEqual(Array.from(run('phantomGraze')),['phantom_pressure',25,1,true],
  'PHANTOM must charge SYNC only from its independent pressure round graze');
run(`
  const wrongRound={origin:'wrong',grazed:false};const syncBeforeWrong=g.sync;
  const wrongGraze=awardGraze(wrongRound);
  g.sync=SYNC_MAX;g.heatArrows=[
    {id:9101,x:120,y:180,dead:false,origin:'phantom_pressure',nodeMarks:new Set()},
    {id:9102,x:620,y:220,dead:false,origin:'wrong',nodeMarks:new Set()}];
  g.phantomAbsorbs=[];const wipeWord=makeWord('Wipe',0,260,140);wipeWord.auto=false;
  const wipe=triggerBulletWipe(260,140,wipeWord);
  globalThis.phantomWipe=[wrongGraze,syncBeforeWrong,g.sync,wipe.cleared,g.phantomAbsorbs.length,
    TRACE.events.some(e=>e.type==='bullet_wipe'&&e.cleared===2)];
`);
assert.deepStrictEqual(Array.from(run('phantomWipe')),[false,25,0,2,2,true],
  'wrong-answer rounds must never charge PHANTOM, while a full-SYNC real hit visibly wipes every live round');

run(`
  g.craft='carrier';g.variant='D';g.cargo=null;g.cargoPendingOrder=null;g.pendingSentenceClear=false;g.score=0;g.scoreDisplay=0;
  g.item={id:'carrier-test',ask:'?',lead:'',tail:'',answer:['Cargo','Next'],decoys:[]};g.sentence=['Cargo','Next'];g.idx=0;
  g.visualAttached=[false,false];g.assemblyFlights=[];g.words=[];
  const cargoWord=makeWord('Cargo',0,120,150),nextCargo=makeWord('Next',1,520,160);g.words=[cargoWord,nextCargo];
  resolveWord(cargoWord);const lockedBeforeImpact=carrierBusy()&&g.cargoPendingOrder===0;
  cargoWord.hp=0;settleWord(cargoWord);const dockX=g.cargo.dockX,scoreBeforeDock=g.score;g.cargo.attached=true;g.ship.x=dockX;dockCarrierCargo();
  globalThis.carrierDelivery=[lockedBeforeImpact,scoreBeforeDock===0,g.cargo===null,g.cargoPendingOrder===null,g.score===cargoWord.pts,
    TRACE.events.some(e=>e.type==='cargo_capture'),TRACE.events.some(e=>e.type==='cargo_dock')];
`);
assert.deepStrictEqual(Array.from(run('carrierDelivery')),[true,true,true,true,true,true,true],
  'CARRIER must block the next confirmation from logical resolve through physical capture, then pay only at the opposite dock');

run(`
  g.craft='bulwark';g.variant='E';g.counterLines=[];g.counterShots=[];g.score=0;g.scoreDisplay=0;g.ship.x=300;
  const lineWord=makeWord('Anchor',0,270,150);const planted=plantCounterLine(lineWord,300,150);const line=g.counterLines[0];
  const counterArrow={id:9201,x:306,y:420,vx:90,vy:170,dead:false,age:.4,arm:.22,life:3,heat:.3,r:6,nodeMarks:new Set()};
  const reflected=reflectCounterArrow(counterArrow,294,410),chargesAfter=line.charges,collapsed=collapseCounterLines('test_wrong');
  globalThis.bulwarkCounter=[planted.reward,reflected,chargesAfter,g.counterShots.length,g.score,collapsed,g.counterLines.length,
    TRACE.events.some(e=>e.type==='counter_reflect')];
`);
assert.deepStrictEqual(Array.from(run('bulwarkCounter')),['counter_line',true,3,1,20,1,0,true],
  'BULWARK must convert a crossing round only while the ship anchors its line, and wrong collapse must remove that line');

run(`
  g.variant='A';g.pressureWaves=[];g.wingUnits=0;g.pendingSentenceClear=false;g.solved=0;TRACE.events.length=0;
  g.item={id:'impact-order',ask:'?',lead:'',tail:'',answer:['First','Final'],decoys:[]};g.sentence=['First','Final'];g.idx=0;
  const first=makeWord('First',0,120,160),final=makeWord('Final',1,360,160);g.words=[first,final];
  resolveWord(first);resolveWord(final);final.hp=0;settleWord(final);const early=[g.pendingSentenceClear,g.solved,g.words.includes(first)];
  first.hp=0;settleWord(first);globalThis.impactOrder=[...early,g.pendingSentenceClear,g.solved,
    TRACE.events.filter(e=>e.type==='clear').length,TRACE.events.filter(e=>e.type==='settle'&&!e.forced).map(e=>e.order).join(',')];
`);
assert.deepStrictEqual(Array.from(run('impactOrder')),[true,0,true,false,1,1,'1,0'],
  'an early final missile may not hang or clear the sentence before every reserved physical impact settles');

run(`
  g.variant='C';g.lives=3;g.over=false;g.hitInvulnUntil=0;g.ship.x=80;g.wakeNodes=[];g.heatArrows=[];
  const node=addWakeNode(400,2.2,'test');node.y=H-90;node.radius=90;
  const tracer=g.heat.particles[0];tracer.armed=true;
  const arrow={id:999,tracer,x:400,y:H-90,px:400,py:H-90,vx:0,vy:220,age:.3,arm:.22,life:2,heat:.7,r:4,dead:false,nodeMarks:new Set()};
  g.heatArrows=[arrow];const speed0=Math.hypot(arrow.vx,arrow.vy);updateHeatCombat(.016);
  globalThis.wakeDeflect=[Math.hypot(arrow.vx,arrow.vy)<speed0,arrow.nodeMarks.has(node.id),TRACE.events.some(e=>e.type==='wake_deflect')];
`);
assert.deepStrictEqual(Array.from(run('wakeDeflect')),[true,true,true],'STRIKER wake bends and slows red rounds instead of acting as a box safe-zone');
run(`
  g.variant='C';g.lives=3;g.over=false;g.hitInvulnUntil=0;g.ship.x=80;g.ship.combatX=80;g.wakeNodes=[];g.heatArrows=[];TRACE.events.length=0;
  const quenchStorm=addWakeNode(400,2.2,'movement');quenchStorm.y=H-90;quenchStorm.radius=180;
  const quenchArrow={id:1001,x:400,y:H-90,px:400,py:H-90,vx:0,vy:220,age:.3,arm:.22,life:3,heat:.7,r:4,dead:false,nodeMarks:new Set(),silhouette:'arrow'};
  g.heatArrows=[quenchArrow];updateHeatCombat(.16);
  globalThis.stormQuench=[g.heatArrows.length,TRACE.events.some(e=>e.type==='wake_quench'),Math.max(...g.heat.sink)];
`);
assert.deepStrictEqual(Array.from(run('stormQuench')).slice(0,2),[0,true],'a red arrow crossing the earned blizzard must visibly quench');

run(`
  g.variant='C';g.coolerLevel=3;g.wakeNodes=[];g.ship.x=16;g.words=[];g.heatArrows=[];g.over=false;g.waveGraceUntil=Infinity;
  moveInput.left=true;update(.3);moveInput.left=false;globalThis.edgeWake=g.wakeNodes.length;
`);
assert.strictEqual(run('edgeWake'),0,'holding into a wall without actual ship displacement must not stack wake nodes');

run(`
  g.variant='C';g.wingUnits=1;g.escortAmmo=2;g.combo=9;g.interceptorShots=[];g.heatArrows=[];g.ship.x=W/2;g.over=false;
  for(let i=0;i<6;i++)g.heatArrows.push({id:8000+i,x:80+i*110,y:260,px:0,py:0,vx:0,vy:80,age:.3,arm:.22,life:5,heat:.5,r:3,dead:false,nodeMarks:new Set()});
  for(let i=0;i<4;i++){g.interceptT=0;updateHeatCombat(.001);}
  globalThis.interceptorClaims=[...g.interceptorShots.map(s=>s.target.id),g.escortAmmo];
`);
assert.deepStrictEqual(Array.from(run('interceptorClaims')).slice(-1),[0]);
assert.strictEqual(run('new Set(interceptorClaims.slice(0,-1)).size'),2,
  'the combined escort may intercept only the rounds paid for by physical correct impacts');

run(`
  g.variant='C';g.heat=createHeatField();g.words=[];g.heat.temp.fill(.8);rebuildHeatStats(g.heat);
  g.quenchBursts=[];TRACE.events.length=0;const beforeClear=g.heat.totalMass;
  triggerThermalClear('sentence_clear',.52);
  for(let i=0;i<30;i++)stepHeatField(HEAT_SIM_DT,performance.now());
  globalThis.clearCooling=[beforeClear,g.heat.totalMass,TRACE.events.some(e=>e.type==='thermal_clear_start'&&e.reason==='sentence_clear'),
    TRACE.events.some(e=>e.type==='thermal_clear_end'&&e.reason==='sentence_clear'&&e.heat_after<e.heat_before)];
`);
const clearCooling=Array.from(run('clearCooling'));
assert.ok(clearCooling[1]<clearCooling[0]*.6,'the combined clear wave must materially lower authoritative world heat as it expands');
assert.deepStrictEqual(clearCooling.slice(2),[true,true],'the trace must measure both ends of the visual/physical clear wave');

run(`
  g.variant='C';g.heat=createHeatField();g.words=[];g.heat.temp.fill(.8);rebuildHeatStats(g.heat);g.quenchBursts=[];
  g.score=1490;g.scoreDisplay=1490;g.scoreMilestone=1500;g.scoreTier=0;g.heatArrows=[];TRACE.events.length=0;
  awardScore(20,W/2,H/2,'break-test');const breakBefore=g.heat.totalMass;
  for(let i=0;i<30;i++)stepHeatField(HEAT_SIM_DT,performance.now());
  globalThis.scoreBreakCooling=[g.scoreTier,g.quenchBursts.length,g.heat.totalMass,breakBefore,
    TRACE.events.some(e=>e.type==='score_break'&&e.clear_kind==='rail_radial'&&e.heat_before>0)];
`);
const scoreBreakCooling=Array.from(run('scoreBreakCooling'));
assert.strictEqual(scoreBreakCooling[0],1);
assert.ok(scoreBreakCooling[2]<scoreBreakCooling[3]*.25,'SCORE BREAK must be a stronger world-cooling ultimate than an ordinary sentence clear');
assert.strictEqual(scoreBreakCooling[4],true);

run(`
  g.variant='B';g.lives=3;g.over=false;g.hitInvulnUntil=0;g.combo=0;g.heatArrows=[];g.interceptorShots=[];g.wakeNodes=[];
  const makeHit=id=>({id,x:g.ship.x,y:H-34,px:g.ship.x,py:H-34,vx:0,vy:0,age:.3,arm:.22,life:5,heat:.6,r:3,dead:false,nodeMarks:new Set()});
  g.heatArrows=[makeHit(1),makeHit(2),makeHit(3)];updateHeatCombat(.016);
  globalThis.volleyPersists=[g.lives,g.heatArrows.length];
`);
assert.deepStrictEqual(Array.from(run('volleyPersists')),[2,2],'a ship hit consumes one arrow, not the whole lethal volley');

run(`
  g.variant='B';g.lives=3;g.over=false;g.hitInvulnUntil=0;g.ship.x=200;g.ship.combatX=100;g.wakeNodes=[];g.heatArrows=[];TRACE.events.length=0;
  g.heatArrows=[{id:31,x:150,y:H-34,px:150,py:H-34,vx:0,vy:0,age:.3,arm:.22,life:5,heat:.6,r:3,dead:false,nodeMarks:new Set()}];
  updateHeatCombat(.016);globalThis.relativeSweep=[g.lives,TRACE.events.some(e=>e.type==='heat_arrow_hit')];
`);
assert.deepStrictEqual(Array.from(run('relativeSweep')),[2,true],
  'relative-motion swept collision must catch a ship crossing a projectile between frame endpoints');

run(`
  g.variant='B';g.lives=3;g.over=false;g.score=0;g.solved=0;g.ship.x=240;g.ship.combatX=240;g.wakeNodes=[];g.heatArrows=[];TRACE.events.length=0;
  const makeLethal=id=>({id,x:240,y:H-34,px:240,py:H-34,vx:0,vy:0,age:.3,arm:.22,life:5,heat:.6,r:3,dead:false,nodeMarks:new Set()});
  g.heatArrows=[makeLethal(41),makeLethal(42),makeLethal(43)];
  for(let i=0;i<3;i++){g.hitInvulnUntil=0;updateHeatCombat(.016);}
  globalThis.threeHitOver=[g.over,g.lives,TRACE.events.filter(e=>e.type==='heat_arrow_hit').length,TRACE.events.filter(e=>e.type==='ship_hit').length];
`);
assert.deepStrictEqual(Array.from(run('threeHitOver')),[true,0,3,3],
  'one wrong volley must retain enough independent projectiles to cause three real hits and game over');

run(`
  g.lives=1;g.over=false;g.score=0;g.solved=0;g.hitInvulnUntil=0;g.pendingSentenceClear=true;g.sentence=['Final'];g.idx=1;
  const doomed=makeWord('Final',0,260,180);doomed.resolved=true;doomed.resolvedAt=performance.now();doomed.hp=1;doomed.pts=100;g.words=[doomed];
  g.missiles=[{x:doomed.x+doomed.w/2,y:doomed.y+doomed.h/2,vx:0,vy:0,target:doomed,dmg:1,level:1,speed:630}];
  g.heatArrows=[{id:44,x:g.ship.x,y:H-34,px:g.ship.x,py:H-34,vx:0,vy:0,age:.3,arm:.22,life:5,heat:.6,r:3,dead:false,nodeMarks:new Set()}];
  g.waveGraceUntil=Infinity;update(.016);globalThis.postOver=[g.over,g.score,g.solved,doomed.settled];
`);
assert.deepStrictEqual(Array.from(run('postOver')),[true,0,0,false],
  'game over during heat combat must stop the frame before later missiles mutate score or progress');

const kernelCpuStart=process.cpuUsage();
run(`
  g.variant='B';g.heat=createHeatField();seedDust(HEAT_TRACER_COUNT);g.words=[];g.wakeNodes=[];
  g.heat.temp.fill(.45);for(const p of g.heat.particles){p.active=true;p.heat=.45;}
  for(let i=0;i<24;i++)addWakeNode(i/24*W,2.5,'benchmark');
  // Measure the steady-state frame kernel, not V8's first-call compilation.
  // The 10ms/step gameplay budget remains unchanged.
  for(let i=0;i<30;i++)stepHeatField(HEAT_SIM_DT,performance.now());g.heat.simSteps=0;
  const tempRef=g.heat.temp,nextRef=g.heat.next,sinkRef=g.heat.sink;
  const t0=performance.now();for(let i=0;i<300;i++)stepHeatField(HEAT_SIM_DT,performance.now());const elapsed=performance.now()-t0;
  globalThis.kernel=[g.heat.temp.length,g.heat.sink.length,g.heat.floorBins.length,g.heat.simSteps,elapsed,
    (g.heat.temp===tempRef||g.heat.temp===nextRef)&&g.heat.sink===sinkRef,stepHeatField.toString().includes('coolingStrengthAt(')];
`);
const kernelCpu=process.cpuUsage(kernelCpuStart),kernelCpuMs=(kernelCpu.user+kernelCpu.system)/1000;
const kernel=Array.from(run('kernel'));
assert.deepStrictEqual(kernel.slice(0,4),[2560,2560,16,300]);
assert.ok(kernelCpuMs<3000,`300 heat steps should remain below a 10ms/step CPU budget, got ${kernelCpuMs.toFixed(1)}ms CPU`);
assert.deepStrictEqual(kernel.slice(5),[true,false],'kernel must reuse typed arrays and never scan every cooling node per cell');
console.log(`heat kernel benchmark: 300 steps ${kernelCpuMs.toFixed(1)}ms CPU (${(kernelCpuMs/300).toFixed(3)}ms/step), ${kernel[4].toFixed(1)}ms wall`);

run(`
  g.heat.temp.fill(.37);const before=g.heat.temp[99];g.solved=0;g.recent=[];nextSentence();globalThis.heatPersists=[before,g.heat.temp[99]];
  g.variant='B';g.solved=0;g.recent=[];nextSentence();const b=[g.item.id,g.item.ask,g.sentence.slice(),g.words.map(w=>[w.text,w.x,w.y])];
  g.variant='A';g.solved=0;g.recent=[];nextSentence();const a=[g.item.id,g.item.ask,g.sentence.slice(),g.words.map(w=>[w.text,w.x,w.y])];
  globalThis.paired=JSON.stringify(a)===JSON.stringify(b);
`);
assert.deepStrictEqual(Array.from(run('heatPersists')),[.3700000047683716,.3700000047683716],
  'a bare sentence transition never resets world heat; only earned cooling effects may change it');
assert.strictEqual(run('paired'),true,'A/B share TOEFL content and starting geometry');

assert.ok(!html.includes('fillRect(field.x-'),'rejected rectangular safe-zone rendering must stay removed');
console.log('input pipeline torus-28 tests passed: four-craft hangar, distinct verbs, instant confirm, locked red rounds, physical clears');
