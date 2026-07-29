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
    classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},
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

assert.strictEqual(run('ITEMS.length'),70,'12 original plus 58 photographed TOEFL items must remain');
assert.strictEqual(run(`ITEMS.filter(item=>item.source&&item.source.startsWith('photo-')).length`),58);
assert.strictEqual(run(`new Set(ITEMS.map(item=>item.id)).size`),70);
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
  [6,'torus-24','heavy_interceptor_rail_slam',180,16]);
assert.strictEqual(run('TRACE.meta.reviewer'),'agent-a','reviewer query must survive into trace metadata');
assert.strictEqual(run(`g.heat.temp.every(v=>v===0)&&g.heat.floorBins.every(v=>v===0)&&g.heat.particles.every(p=>!p.active)`),true,
  'the whole torus must start at absolute zero with no visible tracers');
assert.strictEqual(run(`TRACE.events.some(e=>e.type==='field_start'&&e.topology==='torus'&&e.initial_temperature===0)`),true);

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
assert.ok(html.includes("route=g.variant==='A'?'direct_rail_slam':'core_link'")&&
  html.includes("duration=g.variant==='A'?380:560")&&html.includes('assemblyLinkB'),
  'B must retain a distinct core-link route and timing while sharing the same correctness pipeline');

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
  g.variant='B';g.heat=createHeatField();g.words=[];g.pressureWaves=[];g.wakeNodes=[];
  g.heat.temp.fill(.5);const localNode=addWakeNode(W*.5,2,'local-cooling');localNode.y=H*.5;localNode.radius=72;
  rasterizeCooling(g.heat);const center=heatIndex(Math.floor(HEAT_GRID_X*.5),Math.floor((localNode.y-DUST_TOP)/visibleHeight()*HEAT_GRID_Y));
  const far=heatIndex(2,8);globalThis.localSink=[g.heat.sink[center]>0,g.heat.sink[far]===0];
`);
assert.deepStrictEqual(Array.from(run('localSink')),[true,true],'cooling must rasterize locally instead of applying a global sink');
run(`
  g.variant='B';g.heat=createHeatField();g.words=[];g.wakeNodes=[];
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
  g.variant='A';g.heat=createHeatField();seedDust(HEAT_TRACER_COUNT);g.words=[makeWord('Wrong',1,100,180)];
  for(let i=0;i<48;i++){const p=g.heat.particles[i];p.active=true;p.u=(i+.5)/48;p.v=.34+(i%8)*.055;p.heat=.55;p.x=p.u*W;p.y=torusToScreenY(p.v);p.px=p.x;p.py=p.y;}
  g.heat.temp.fill(.4);rebuildHeatStats(g.heat);g.lives=3;g.over=false;g.hitInvulnUntil=0;g.ship.x=400;
  applyWrongPenalty(g.words[0],{test:true});
  const arrows=g.heatArrows.length;const zeroAfter=g.heat.temp.every(v=>v===0);
  updateHeatCombat(.1);globalThis.phaseChange=[arrows,zeroAfter,g.lives,g.words[0].rage,
    TRACE.events.some(e=>e.type==='heat_phase_change'&&e.heat_integral>0&&e.silhouette==='round_control'&&e.same_source_position&&
      e.eligible_tracers===48&&e.volley_cap===36&&e.suppressed_tracers===12),
    g.heatArrows.every(a=>a.age<a.arm&&a.silhouette==='round'&&a.sourceX===a.x&&a.sourceY===a.y)];
`);
const phaseChange=Array.from(run('phaseChange'));
assert.strictEqual(phaseChange[0],36,'wrong converts existing heat only up to the bounded lethal-volley budget');
assert.deepStrictEqual(phaseChange.slice(1),[true,3,1,true,true],
  'wrong answer converts existing heat to visible telegraphed arrows, clears T, and cannot hit during warning');
assert.strictEqual(run(`g.heatArrows.every(a=>a.life>=a.arm+a.travelDistance/Math.hypot(a.vx,a.vy)+1.24)`),true,
  'far arrows must live long enough to cross their locked aim point instead of expiring by fixed lifetime');

run(`
  endHeatVolley('test_reset');g.variant='A';g.pressureWaves=[];g.pressureWaveSeq=0;g.wingUnits=0;g.combo=1;
  g.sentence=['Alpha'];g.idx=1;const alpha=makeWord('Alpha',0,100,160);alpha.resolved=true;alpha.resolvedAt=performance.now();
  alpha.impactCombo=1;alpha.pts=100;g.words=[alpha];alpha.hp=0;settleWord(alpha);
  globalThis.aReward=[g.wingUnits,g.pressureWaves.length,TRACE.events.some(e=>e.type==='wing_deploy'&&e.barrels===4),
    MAX_WING_UNITS,weaponLv(),heavyWeaponOrigins().length];
`);
assert.deepStrictEqual(Array.from(run('aReward')),[1,4,true,1,4,4],
  'A docks at most one large escort while preserving four real firing origins');

run(`
  g.variant='B';g.coolerLevel=0;g.wakeNodes=[];g.combo=3;g.sentence=['Wake'];g.idx=1;
  const wake=makeWord('Wake',0,330,160);wake.resolved=true;wake.resolvedAt=performance.now();wake.impactCombo=3;wake.pts=100;wake.hp=0;g.words=[wake];
  settleWord(wake);const beforeMove=g.wakeNodes.length;moveInput.right=true;update(.31);moveInput.right=false;
  const bStorm=g.wakeNodes[0];globalThis.bReward=[g.coolerLevel,beforeMove,g.wakeNodes.length,g.wakeNodes.length>beforeMove,
    TRACE.events.some(e=>e.type==='wake_drive'&&e.movement_only===true),bStorm.radius>=170,bStorm.life>=23.9];
`);
assert.deepStrictEqual(Array.from(run('bReward')),[3,0,1,true,true,true,true],
  'B physical impact only charges; actual movement casts a wide blizzard that survives the observed learner thinking interval');
run(`
  g.variant='B';g.coolerLevel=3;g.wakeNodes=[];g.wakeDropT=.04;TRACE.events.length=0;
  const nudgeBefore=320,nudgeAfter=340;castWakeFromMovement(nudgeBefore,nudgeAfter,0,true);
  globalThis.nudgeWake=[g.wakeNodes.length,g.wakeNodes[0].x,
    TRACE.events.some(e=>e.type==='wake_node'&&e.reason==='movement'),castWakeFromMovement(340,340,0,true)];
`);
assert.deepStrictEqual(Array.from(run('nudgeWake')).slice(0,3),[1,340,true],
  'a short keyboard nudge must cast the charged B blizzard even when no animation frame observes held input');
assert.strictEqual(run('nudgeWake[3]'),null,'no-coordinate-change input must still be unable to cast a blizzard');
assert.ok(html.includes('castWakeFromMovement(beforeNudge,g.ship.x,0,true)'),
  'the real ArrowLeft/ArrowRight nudge path must feed the movement-only reward');

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
  g.variant='B';g.lives=3;g.over=false;g.hitInvulnUntil=0;g.ship.x=80;g.wakeNodes=[];g.heatArrows=[];
  const node=addWakeNode(400,2.2,'test');node.y=H-90;node.radius=90;
  const tracer=g.heat.particles[0];tracer.armed=true;
  const arrow={id:999,tracer,x:400,y:H-90,px:400,py:H-90,vx:0,vy:220,age:.3,arm:.22,life:2,heat:.7,r:4,dead:false,nodeMarks:new Set()};
  g.heatArrows=[arrow];const speed0=Math.hypot(arrow.vx,arrow.vy);updateHeatCombat(.016);
  globalThis.wakeDeflect=[Math.hypot(arrow.vx,arrow.vy)<speed0,arrow.nodeMarks.has(node.id),TRACE.events.some(e=>e.type==='wake_deflect')];
`);
assert.deepStrictEqual(Array.from(run('wakeDeflect')),[true,true,true],'B wake bends and slows red arrows instead of acting as a box safe-zone');
run(`
  g.variant='B';g.lives=3;g.over=false;g.hitInvulnUntil=0;g.ship.x=80;g.ship.combatX=80;g.wakeNodes=[];g.heatArrows=[];TRACE.events.length=0;
  const quenchStorm=addWakeNode(400,2.2,'movement');quenchStorm.y=H-90;quenchStorm.radius=180;
  const quenchArrow={id:1001,x:400,y:H-90,px:400,py:H-90,vx:0,vy:220,age:.3,arm:.22,life:3,heat:.7,r:4,dead:false,nodeMarks:new Set(),silhouette:'arrow'};
  g.heatArrows=[quenchArrow];updateHeatCombat(.16);
  globalThis.stormQuench=[g.heatArrows.length,TRACE.events.some(e=>e.type==='wake_quench'),Math.max(...g.heat.sink)];
`);
assert.deepStrictEqual(Array.from(run('stormQuench')).slice(0,2),[0,true],'a red arrow crossing the earned blizzard must visibly quench');

run(`
  g.variant='B';g.coolerLevel=3;g.wakeNodes=[];g.ship.x=16;g.words=[];g.heatArrows=[];g.over=false;g.waveGraceUntil=Infinity;
  moveInput.left=true;update(.3);moveInput.left=false;globalThis.edgeWake=g.wakeNodes.length;
`);
assert.strictEqual(run('edgeWake'),0,'holding into a wall without actual ship displacement must not stack wake nodes');

run(`
  g.variant='A';g.wingUnits=1;g.combo=9;g.interceptorShots=[];g.heatArrows=[];g.ship.x=W/2;g.over=false;
  for(let i=0;i<6;i++)g.heatArrows.push({id:8000+i,x:80+i*110,y:260,px:0,py:0,vx:0,vy:80,age:.3,arm:.22,life:5,heat:.5,r:3,dead:false,nodeMarks:new Set()});
  for(let i=0;i<4;i++){g.interceptT=0;updateHeatCombat(.001);}
  globalThis.interceptorClaims=g.interceptorShots.map(s=>s.target.id);
`);
assert.strictEqual(run('new Set(interceptorClaims).size'),4,'earned A guns must reserve different red-arrow targets instead of overkilling one');

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

run(`
  g.variant='B';g.heat=createHeatField();seedDust(HEAT_TRACER_COUNT);g.words=[];g.wakeNodes=[];
  g.heat.temp.fill(.45);for(const p of g.heat.particles){p.active=true;p.heat=.45;}
  for(let i=0;i<24;i++)addWakeNode(i/24*W,2.5,'benchmark');
  const tempRef=g.heat.temp,nextRef=g.heat.next,sinkRef=g.heat.sink;
  const t0=performance.now();for(let i=0;i<300;i++)stepHeatField(HEAT_SIM_DT,performance.now());const elapsed=performance.now()-t0;
  globalThis.kernel=[g.heat.temp.length,g.heat.sink.length,g.heat.floorBins.length,g.heat.simSteps,elapsed,
    (g.heat.temp===tempRef||g.heat.temp===nextRef)&&g.heat.sink===sinkRef,stepHeatField.toString().includes('coolingStrengthAt(')];
`);
const kernel=Array.from(run('kernel'));
assert.deepStrictEqual(kernel.slice(0,4),[2560,2560,16,300]);
assert.ok(kernel[4]<1500,`300 heat steps should remain cheap in the JS VM, got ${kernel[4].toFixed(1)}ms`);
assert.deepStrictEqual(kernel.slice(5),[true,false],'kernel must reuse typed arrays and never scan every cooling node per cell');
console.log(`heat kernel benchmark: 300 steps ${kernel[4].toFixed(1)}ms (${(kernel[4]/300).toFixed(3)}ms/step)`);

run(`
  g.heat.temp.fill(.37);const before=g.heat.temp[99];g.solved=0;g.recent=[];nextSentence();globalThis.heatPersists=[before,g.heat.temp[99]];
  g.variant='B';g.solved=0;g.recent=[];nextSentence();const b=[g.item.id,g.item.ask,g.sentence.slice(),g.words.map(w=>[w.text,w.x,w.y])];
  g.variant='A';g.solved=0;g.recent=[];nextSentence();const a=[g.item.id,g.item.ask,g.sentence.slice(),g.words.map(w=>[w.text,w.x,w.y])];
  globalThis.paired=JSON.stringify(a)===JSON.stringify(b);
`);
assert.deepStrictEqual(Array.from(run('heatPersists')),[.3700000047683716,.3700000047683716],
  'heat persists between sentences until a wrong answer discharges it');
assert.strictEqual(run('paired'),true,'A/B share TOEFL content and starting geometry');

assert.ok(!html.includes('fillRect(field.x-'),'rejected rectangular safe-zone rendering must stay removed');
console.log('input pipeline torus-24 tests passed: lean HUD, impact-gated assembly A/B, shared round threat, heavy escort, blizzard, swept hits');
