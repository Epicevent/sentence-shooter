function createHeatField(){
  const cells=HEAT_GRID_X*HEAT_GRID_Y;
  return { particles:[],temp:new Float32Array(cells),next:new Float32Array(cells),sink:new Float32Array(cells),
    floorBins:new Float32Array(FLOOR_BINS),totalMass:0,maxTemp:0,acc:0,simSteps:0,
    stepCostMs:0,maxStepCostMs:0,vizCanvas:null,vizCtx:null,vizImage:null,vizStep:-1 };
}
function heatField(){ return g && g.heat; }
function torusWrap(value,period){ value%=period; return value<0?value+period:value; }
function torusLerp(a,b,period,t){
  let delta=b-a;if(delta>period/2)delta-=period;else if(delta<-period/2)delta+=period;
  return torusWrap(a+delta*t,period);
}
function visibleHeight(){ return Math.max(1,H-13-DUST_TOP); }
function screenToTorusV(y){ return (y-DUST_TOP)/visibleHeight(); }
function torusToScreenY(v){ return DUST_TOP+v*visibleHeight(); }
function heatIndex(col,row){
  return torusWrap(row,HEAT_GRID_Y)*HEAT_GRID_X+torusWrap(col,HEAT_GRID_X);
}
function sampleHeatUV(u,v){
  const field=heatField();if(!field)return 0;
  // Grid row zero is the nodal cold seam, so v=0 must sample that row exactly.
  const x=torusWrap(u,1)*HEAT_GRID_X,y=torusWrap(v,TORUS_VERTICAL_SCREENS)/TORUS_VERTICAL_SCREENS*HEAT_GRID_Y;
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
  const a=field.temp[heatIndex(x0,y0)],b=field.temp[heatIndex(x0+1,y0)];
  const c=field.temp[heatIndex(x0,y0+1)],d=field.temp[heatIndex(x0+1,y0+1)];
  return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
}
function drawHeatFog(field){
  if(!field)return;
  if(!field.vizCanvas){
    field.vizCanvas=document.createElement('canvas');field.vizCanvas.width=HEAT_GRID_X;field.vizCanvas.height=HEAT_GRID_Y;
    field.vizCtx=field.vizCanvas.getContext('2d');field.vizImage=field.vizCtx.createImageData(HEAT_GRID_X,HEAT_GRID_Y);
  }
  if(field.vizStep!==field.simSteps){
    const rgba=field.vizImage.data,temp=field.temp;
    for(let i=0;i<temp.length;i++){
      const t=Math.max(0,Math.min(1,temp[i])),o=i*4,glow=Math.pow(t,.68);
      rgba[o]=Math.round(210+45*t);rgba[o+1]=Math.round(118+82*t);rgba[o+2]=Math.round(45+55*t);
      rgba[o+3]=t<.012?0:Math.round(148*glow);
    }
    field.vizCtx.putImageData(field.vizImage,0,0);field.vizStep=field.simSteps;
  }
  ctx.save();ctx.globalCompositeOperation='screen';ctx.imageSmoothingEnabled=true;
  ctx.globalAlpha=.62;ctx.filter='blur(9px)';ctx.drawImage(field.vizCanvas,-10,DUST_TOP-10,W+20,visibleHeight()+20);
  ctx.globalAlpha=.16;ctx.filter='none';ctx.drawImage(field.vizCanvas,0,DUST_TOP,W,visibleHeight());ctx.restore();
}
function drawHeatThreat(arrow){
  const d=Math.hypot(arrow.vx,arrow.vy)||1,angle=Math.atan2(arrow.vy,arrow.vx);
  const warning=arrow.age<arrow.arm,pulse=.76+.24*Math.abs(Math.sin(performance.now()/58));
  ctx.save();ctx.translate(arrow.x,arrow.y);ctx.rotate(angle);ctx.globalAlpha=warning?pulse:1;
  ctx.strokeStyle='#ff6e7f';ctx.fillStyle='#ff5a70';ctx.lineWidth=3;
  ctx.shadowColor='#d16969';ctx.shadowBlur=15;
  // User-selected common baseline: v21 round body and exactly 11 px of
  // velocity-opposed tail. A/B no longer varies the lethal silhouette.
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-11,0);ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,arrow.r,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff0f2';ctx.beginPath();ctx.arc(0,0,Math.max(1.8,arrow.r*.28),0,Math.PI*2);ctx.fill();
  if(warning){ctx.globalAlpha=.48*pulse;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,arrow.r+5,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}
function wordBoundaryTemperature(word){
  const spawn=Number.isFinite(word.spawnY)?word.spawnY:DUST_TOP+8;
  const floor=Math.max(spawn+1,H-64-word.h);
  const descent=Math.max(0,Math.min(1,(word.y-spawn)/(floor-spawn)));
  return Math.min(1,.25+.55*descent+.10*Math.min(3,word.rage||0));
}
function clampWordBoundaries(field){
  if(!g||!g.words)return;
  for(const word of g.words){
    if(word.settled)continue;
    const x0=Math.max(0,wordVisualX(word))/W,x1=Math.min(W,wordVisualX(word)+word.w)/W;
    const v0=screenToTorusV(wordVisualY(word)),v1=screenToTorusV(wordVisualY(word)+word.h);
    const c0=Math.max(0,Math.floor(x0*HEAT_GRID_X)),c1=Math.min(HEAT_GRID_X-1,Math.ceil(x1*HEAT_GRID_X)-1);
    const r0=Math.floor(v0/TORUS_VERTICAL_SCREENS*HEAT_GRID_Y),r1=Math.ceil(v1/TORUS_VERTICAL_SCREENS*HEAT_GRID_Y)-1;
    const fixed=wordBoundaryTemperature(word);word.boundaryTemp=fixed;
    for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++)field.temp[heatIndex(col,row)]=fixed;
  }
  // Ceiling and floor are the same circle on the torus. That seam is an internal
  // absolute-zero Dirichlet line, so upward heat cannot return hot at the floor.
  for(let col=0;col<HEAT_GRID_X;col++)field.temp[heatIndex(col,0)]=0;
}
function torusDxPx(a,b){
  const raw=Math.abs(a-b),period=W;return Math.min(raw,period-raw);
}
function torusDyPx(a,b){
  const period=visibleHeight(),raw=Math.abs(a-b);return Math.min(raw,Math.abs(period-raw));
}
function addHeatSink(sink,index,strength){ sink[index]=Math.min(HEAT_SINK_CAP,sink[index]+strength); }
function rasterizeCooling(field){
  const sink=field.sink;sink.fill(0);
  if(hasEscort(g.variant))for(const wave of(g.pressureWaves||[])){
    const centerCol=Math.floor(wave.x/W*HEAT_GRID_X),radiusCol=Math.ceil(wave.width/W*HEAT_GRID_X);
    const centerRow=Math.floor(screenToTorusV(wave.y)*HEAT_GRID_Y),radiusRow=Math.max(1,Math.ceil(24/visibleHeight()*HEAT_GRID_Y));
    const strength=1.4+.28*(wave.guns||1);
    for(let dr=-radiusRow;dr<=radiusRow;dr++){
      const row=torusWrap(centerRow+dr,HEAT_GRID_Y);
      for(let dc=-radiusCol;dc<=radiusCol;dc++)addHeatSink(sink,heatIndex(centerCol+dc,row),strength);
    }
  }
  if(hasStorm(g.variant))for(const node of(g.wakeNodes||[])){
    // The earned blizzard is intentionally broad and decisive: a player should
    // read the cold territory immediately, not hunt for a narrow wake pixel.
    const q=Math.max(0,Math.min(1,node.t/node.life)),strength=(1-q)*(9.2+1.1*node.rpm);
    const centerCol=Math.floor(node.x/W*HEAT_GRID_X),radiusCol=Math.ceil(node.radius/W*HEAT_GRID_X);
    const centerRow=Math.floor(screenToTorusV(node.y)*HEAT_GRID_Y),radiusRow=Math.ceil(node.radius/visibleHeight()*HEAT_GRID_Y);
    for(let dr=-radiusRow;dr<=radiusRow;dr++){
      const row=torusWrap(centerRow+dr,HEAT_GRID_Y);
      const y=torusToScreenY((row+.5)/HEAT_GRID_Y),dy=torusDyPx(y,node.y);
      for(let dc=-radiusCol;dc<=radiusCol;dc++){
        const col=torusWrap(centerCol+dc,HEAT_GRID_X),x=(col+.5)/HEAT_GRID_X*W,dx=torusDxPx(x,node.x);
        if(dx*dx+dy*dy<=node.radius*node.radius)addHeatSink(sink,row*HEAT_GRID_X+col,strength);
      }
    }
  }
}
function rebuildHeatStats(field){
  field.floorBins.fill(0);let total=0,max=0;
  const floorRow=HEAT_GRID_Y-1,rows=4;
  for(let i=0;i<field.temp.length;i++){const value=field.temp[i];total+=value;if(value>max)max=value;}
  for(let bin=0;bin<FLOOR_BINS;bin++){
    let sum=0,count=0,c0=Math.floor(bin/FLOOR_BINS*HEAT_GRID_X),c1=Math.max(c0+1,Math.floor((bin+1)/FLOOR_BINS*HEAT_GRID_X));
    for(let row=floorRow-rows+1;row<=floorRow;row++)for(let col=c0;col<c1;col++){sum+=field.temp[heatIndex(col,row)];count++;}
    field.floorBins[bin]=count?sum/count:0;
  }
  field.totalMass=total/field.temp.length;field.maxTemp=max;
}
function dustHazardActive(now){
  return !!g&&(g.heatArrows||[]).some(arrow=>!arrow.dead);
}
function seedDust(count){
  const field=heatField();field.particles=[];
  for(let i=0;i<count;i++)field.particles.push({id:i+1,u:Math.random(),v:Math.random(),
    pu:0,pv:0,x:0,y:0,px:0,py:0,heat:0,active:false,armed:false});
  rebuildHeatStats(field);
}
function spawnDustFromWord(word){
  const field=heatField();if(!word||!field)return;
  let tracer=null,cold=Infinity;
  for(const candidate of field.particles){
    if(candidate.armed)continue;
    if(!candidate.active){tracer=candidate;break;}
    if(candidate.heat<cold){cold=candidate.heat;tracer=candidate;}
  }
  if(!tracer)return;
  tracer.u=torusWrap((wordVisualX(word)+word.w/2+(Math.random()*18-9))/W,1);
  tracer.v=torusWrap(screenToTorusV(wordVisualY(word)+word.h+3),TORUS_VERTICAL_SCREENS);
  tracer.pu=tracer.u;tracer.pv=tracer.v;tracer.x=tracer.px=tracer.u*W;
  tracer.y=tracer.py=torusToScreenY(tracer.v);tracer.active=true;tracer.heat=wordBoundaryTemperature(word);
  word.heatPulse=.18;
}
function floorTemperatureAt(x){
  const field=heatField(); if(!field||!field.floorBins.length)return 0;
  const f=torusWrap(x/W,1)*field.floorBins.length-.5,base=Math.floor(f),frac=f-base;
  const at=i=>field.floorBins[torusWrap(i,field.floorBins.length)]||0;
  return at(base)*(1-frac)+at(base+1)*frac;
}
function coolestFloorX(){
  const field=heatField(); if(!field)return{x:W/2,temp:0};
  let bin=0,best=Infinity;
  for(let i=0;i<field.floorBins.length;i++)if(field.floorBins[i]<best){best=field.floorBins[i];bin=i;}
  return{x:(bin+.5)/field.floorBins.length*W,temp:Number.isFinite(best)?best:0};
}
function dustBand(){
  const temp=g?floorTemperatureAt(g.ship.x):0;
  return temp>=FLOOR_CRITICAL?{label:'FLOOR CRITICAL',level:2,temp}:temp>=FLOOR_HOT
    ?{label:'FLOOR HOT',level:1,temp}:{label:'FLOOR COOL',level:0,temp};
}
function triggerDustHazard(chain,chosen){
  const field=heatField();if(!field)return 0;
  const band=dustBand(),heatIntegral=field.totalMass,shipY=H-34,arrows=[],eligible=[];
  for(const p of field.particles){
    if(!p.active||p.armed)continue;
    const sourceHeat=sampleHeatUV(p.u,p.v);
    if(sourceHeat<.035)continue;
    eligible.push({p,sourceHeat});
  }
  // A tracer is a sample of the continuous heat field, not one unit of damage.
  // Keep one hot representative per screen cell before filling the remaining
  // budget by temperature, so thinking longer cannot turn one error into an
  // unbounded wall while the volley still originates across the visible fog.
  const cellBest=new Map();
  for(const candidate of eligible){
    const col=Math.min(HEAT_VOLLEY_COLS-1,Math.floor(torusWrap(candidate.p.u,1)*HEAT_VOLLEY_COLS));
    const row=Math.min(HEAT_VOLLEY_ROWS-1,Math.floor(torusWrap(candidate.p.v,TORUS_VERTICAL_SCREENS)/TORUS_VERTICAL_SCREENS*HEAT_VOLLEY_ROWS));
    const key=row*HEAT_VOLLEY_COLS+col,prior=cellBest.get(key);
    if(!prior||candidate.sourceHeat>prior.sourceHeat||
      (candidate.sourceHeat===prior.sourceHeat&&candidate.p.id<prior.p.id))cellBest.set(key,candidate);
  }
  const hottest=(a,b)=>b.sourceHeat-a.sourceHeat||a.p.id-b.p.id;
  const selected=Array.from(cellBest.values()).sort(hottest).slice(0,HEAT_VOLLEY_CAP);
  const selectedIds=new Set(selected.map(candidate=>candidate.p.id));
  for(const candidate of eligible.filter(candidate=>!selectedIds.has(candidate.p.id)).sort(hottest)){
    if(selected.length>=HEAT_VOLLEY_CAP)break;
    selected.push(candidate);selectedIds.add(candidate.p.id);
  }
  for(const {p,sourceHeat} of selected){
    const x=p.u*W,y=torusToScreenY(p.v),jitter=((p.id*47)%101-50)*(1.35-Math.min(1,p.heat));
    const dx=g.ship.x+jitter-x,dy=shipY-y,d=Math.hypot(dx,dy)||1,speed=185+125*Math.min(1,sourceHeat)+18*Math.max(0,(chain||1)-1);
    // A wrong answer snapshots the visible heat source into a projectile. The
    // tracer and authoritative temperature remain in the world; failure never
    // doubles as a cooling action.
    arrows.push({id:(g.heatArrowSeq=(g.heatArrowSeq||0)+1),sourceTracerId:p.id,x,y,px:x,py:y,sourceX:x,sourceY:y,
      silhouette:'round',vx:dx/d*speed,vy:dy/d*speed,age:0,arm:HEAT_ARROW_ARM_MS/1000,
      life:HEAT_ARROW_ARM_MS/1000+d/speed+1.25,travelDistance:d,heat:sourceHeat,sourceHeat,
      r:Math.max(6.5,4+sourceHeat*3.2),dead:false,nodeMarks:new Set()});
  }
  g.heatArrows.push(...arrows);
  addPulse(g.ship.x,H-34,92,'#d16969',.35);banner('WRONG · HEAT VOLLEY ARMED',true);
  tEv('heat_volley_armed',{chain:chain||1,floor_temp:roundHeat(band.temp),arrows:arrows.length,
    eligible_tracers:eligible.length,volley_cap:HEAT_VOLLEY_CAP,suppressed_tracers:Math.max(0,eligible.length-arrows.length),
    warning_ms:HEAT_ARROW_ARM_MS,heat_integral:roundHeat(heatIntegral),chosen:chosen?chosen.order:null,
    source_visual:'continuous_heat_fog',source_min_temp:arrows.length?roundHeat(Math.min(...arrows.map(a=>a.sourceHeat))):null,
    silhouette:'round_control',same_source_position:true,field_unchanged:true});
  tone(210,64,.18,'sawtooth',.075);buzz([30,20,55]);return band.temp;
}
function updatePressureWaves(step,field){
  for(const wave of (g.pressureWaves||[])){
    wave.t+=step;wave.y-=wave.speed*step;
    if(wave.y<DUST_TOP)wave.y+=visibleHeight();
  }
  const ended=(g.pressureWaves||[]).filter(w=>w.t>=w.life);
  for(const wave of ended)tEv('pressure_end',{id:wave.id});
  g.pressureWaves=(g.pressureWaves||[]).filter(w=>w.t<w.life);
}
function thermalWorldRadius(){ return Math.hypot(W*.5,visibleHeight()*.5)+28; }
function triggerQuenchBurst(reason,strength){
  const field=heatField(),core=signalCore(),burst={id:++g.quenchBurstSeq,x:core.x,y:core.y,r:0,maxR:thermalWorldRadius(),
    t:0,life:reason==='score_break'?.82:.72,strength:Math.max(0,Math.min(.95,strength||.5)),reason:reason||'clear',
    cooled:new Uint8Array(HEAT_GRID_X*HEAT_GRID_Y),cells:0,heatBefore:field?field.totalMass:0};
  g.quenchBursts.push(burst);
  tEv('thermal_clear_start',{id:burst.id,reason:burst.reason,shape:'radial',strength:roundTrace(burst.strength),
    heat_before:roundHeat(burst.heatBefore),max_radius:roundTrace(burst.maxR),life_ms:Math.round(burst.life*1000)});
  return burst;
}
function triggerThermalClear(reason,strength){
  const rail=hasEscort(g.variant),radial=hasStorm(g.variant);
  let waves=0,burst=null;
  if(rail)waves=fireWingSalvo({name:reason,combo:Math.max(1,g.combo||1),thermalClear:true},
    {maxOrigins:g.variant==='C'?4:undefined,widthScale:reason==='score_break'?2.35:1.7});
  if(radial)burst=triggerQuenchBurst(reason,strength);
  const kind=rail&&radial?'rail_radial':rail?'rail':'radial';
  tEv('thermal_clear',{reason,kind,waves,burst:burst&&burst.id,heat_before:roundHeat((g.heat&&g.heat.totalMass)||0)});
  return{kind,waves,burst};
}
function updateQuenchBursts(step,field){
  for(const burst of(g.quenchBursts||[])){
    const previous=burst.r;burst.t=Math.min(burst.life,burst.t+step);burst.r=burst.maxR*(burst.t/burst.life);
    for(let row=0;row<HEAT_GRID_Y;row++)for(let col=0;col<HEAT_GRID_X;col++){
      const index=row*HEAT_GRID_X+col;if(burst.cooled[index])continue;
      const x=(col+.5)/HEAT_GRID_X*W,y=torusToScreenY((row+.5)/HEAT_GRID_Y);
      const distance=Math.hypot(torusDxPx(x,burst.x),torusDyPx(y,burst.y));
      if(distance>burst.r||distance<=previous)continue;
      const keep=1-burst.strength;field.temp[index]*=keep;field.next[index]*=keep;burst.cooled[index]=1;burst.cells++;
    }
  }
  const ended=(g.quenchBursts||[]).filter(burst=>burst.t>=burst.life);
  if(ended.length){
    rebuildHeatStats(field);field.vizStep=-1;
    for(const burst of ended)tEv('thermal_clear_end',{id:burst.id,reason:burst.reason,cells:burst.cells,
      heat_before:roundHeat(burst.heatBefore),heat_after:roundHeat(field.totalMass),reduction:roundHeat(burst.heatBefore-field.totalMass)});
  }
  g.quenchBursts=(g.quenchBursts||[]).filter(burst=>burst.t<burst.life);
}
function stepHeatField(step,now){
  const field=heatField();if(!field)return;
  const costStart=performance.now();
  updatePressureWaves(step,field);updateQuenchBursts(step,field);
  rasterizeCooling(field);
  const invDx2=HEAT_GRID_X*HEAT_GRID_X,invDy2=HEAT_GRID_Y*HEAT_GRID_Y,kdt=HEAT_KAPPA*step;
  const temp=field.temp,next=field.next,sink=field.sink,nx=HEAT_GRID_X,ny=HEAT_GRID_Y;
  // The cold torus seam is row zero, so it never needs a finite-difference update.
  // Direct row indices are faster than four indirect neighbor-array reads per cell.
  next.fill(0,0,nx);
  for(let row=1;row<ny;row++){
    const rowStart=row*nx,upStart=(row-1)*nx,downStart=(row+1<ny?row+1:0)*nx;
    for(let col=0;col<nx;col++){
      const i=rowStart+col,left=rowStart+(col?col-1:nx-1),right=rowStart+(col+1<nx?col+1:0),t=temp[i];
      const lap=(temp[left]-2*t+temp[right])*invDx2+(temp[upStart+col]-2*t+temp[downStart+col])*invDy2;
      const value=t+kdt*lap-step*sink[i]*t;
      next[i]=value<0?0:value>1?1:value;
    }
  }
  const swap=field.temp;field.temp=field.next;field.next=swap;
  clampWordBoundaries(field);rebuildHeatStats(field);field.simSteps++;
  const sigma=Math.sqrt(2*HEAT_KAPPA*step);
  for(const p of field.particles){
    if(!p.active||p.armed)continue;
    p.pu=p.u;p.pv=p.v;
    const radius=Math.sqrt(-2*Math.log(Math.max(1e-9,Math.random()))),angle=Math.random()*Math.PI*2;
    p.u=torusWrap(p.u+sigma*radius*Math.cos(angle),1);
    p.v=torusWrap(p.v+sigma*radius*Math.sin(angle),TORUS_VERTICAL_SCREENS);
    p.heat=sampleHeatUV(p.u,p.v);
    if(p.heat<.018&&!p.armed)p.active=false;
    p.px=p.x;p.py=p.y;p.x=p.u*W;p.y=torusToScreenY(p.v);
  }
  field.stepCostMs=performance.now()-costStart;field.maxStepCostMs=Math.max(field.maxStepCostMs,field.stepCostMs);
}
function updateDust(dt,now){
  const field=heatField();if(!field)return;
  field.acc=Math.min(.15,field.acc+dt);
  while(field.acc>=HEAT_SIM_DT){stepHeatField(HEAT_SIM_DT,now-field.acc*1000);field.acc-=HEAT_SIM_DT;}
}
function releaseHeatArrow(arrow,reason){
  if(!arrow||arrow.dead)return;
  arrow.dead=true;
  tEv('heat_arrow_end',{id:arrow.id,reason,x:roundTrace(arrow.x),y:roundTrace(arrow.y)});
}
function endHeatVolley(reason){
  if(!g||!(g.heatArrows||[]).length)return 0;
  const live=g.heatArrows.filter(a=>!a.dead);
  for(const arrow of live)releaseHeatArrow(arrow,reason||'ended');
  g.heatArrows=[];
  if(live.length)tEv('heat_volley_end',{reason:reason||'ended',count:live.length});
  return live.length;
}
function rotateVelocity(body,angle){
  const c=Math.cos(angle),s=Math.sin(angle),x=body.vx,y=body.vy;
  body.vx=x*c-y*s;body.vy=x*s+y*c;
}
function segmentPointDistanceSq(x0,y0,x1,y1,px,py){
  const dx=x1-x0,dy=y1-y0,den=dx*dx+dy*dy;
  const q=den?Math.max(0,Math.min(1,((px-x0)*dx+(py-y0)*dy)/den)):0;
  const ex=x0+dx*q-px,ey=y0+dy*q-py;return ex*ex+ey*ey;
}
function movingPointDistanceSq(ax0,ay0,ax1,ay1,bx0,by0,bx1,by1){
  // Collision in relative coordinates: both endpoints may move during this frame.
  return segmentPointDistanceSq(ax0-bx0,ay0-by0,ax1-bx1,ay1-by1,0,0);
}
function nearestTorusImage(value,anchor,period){
  let delta=value-anchor;
  if(delta>period/2)delta-=period;else if(delta<-period/2)delta+=period;
  return anchor+delta;
}
function fireInterceptor(target){
  const origins=heavyWeaponOrigins();
  const origin=origins[(g.shotSeq++||0)%origins.length],dx=target.x-origin.x,dy=target.y-origin.y,d=Math.hypot(dx,dy)||1;
  g.interceptorShots.push({x:origin.x,y:origin.y,vx:dx/d*760,vy:dy/d*760,target,t:0,life:.78,origin:origin.kind});
  tone(980,720,.035,'square',.022);
}
function updateHeatCombat(dt){
  const shipX0=Number.isFinite(g.ship.combatX)?g.ship.combatX:g.ship.x,shipX1=g.ship.x,shipY=H-34;
  updateBigWingSweeps(dt);
  for(const node of(g.wakeNodes||[])){
    node.t+=dt;
    if(node.vx)node.x=torusWrap(node.x+node.vx*dt,W);
  }
  g.wakeNodes=(g.wakeNodes||[]).filter(node=>node.t<node.life);
  const launched=(g.heatArrows||[]).filter(a=>!a.dead&&a.age>=a.arm);
  if(hasEscort(g.variant)&&launched.length&&(g.variant==='A'||(g.escortAmmo||0)>0)){
    g.interceptT-=dt;
    const guns=heavyWeaponOrigins().length,period=Math.max(.07,.31/(guns+.08*Math.min(9,g.combo||0)));
    if(g.interceptT<=0){
      const claimed=new Set((g.interceptorShots||[]).filter(s=>s.t<s.life&&s.target&&!s.target.dead).map(s=>s.target));
      const available=launched.filter(a=>!claimed.has(a));
      const target=available.reduce((best,a)=>!best||Math.hypot(a.x-g.ship.x,a.y-(H-34))<Math.hypot(best.x-g.ship.x,best.y-(H-34))?a:best,null);
      if(target){fireInterceptor(target);if(g.variant==='C'){
        g.escortAmmo=Math.max(0,(g.escortAmmo||0)-1);
        tEv('escort_intercept_spent',{target:target.id,remaining:g.escortAmmo});updateHud();
      }}
      g.interceptT=g.variant==='C'?.38:period;
    }
  }
  for(const shot of(g.interceptorShots||[])){
    shot.t+=dt;const target=shot.target;
    if(!target||target.dead){shot.life=0;continue;}
    const x0=shot.x,y0=shot.y,dx=target.x-shot.x,dy=target.y-shot.y,d=Math.hypot(dx,dy)||1,k=Math.min(1,10*dt),speed=760;
    shot.vx+=(dx/d*speed-shot.vx)*k;shot.vy+=(dy/d*speed-shot.vy)*k;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;
    const targetX1=target.x+target.vx*dt,targetY1=target.y+target.vy*dt;
    if(movingPointDistanceSq(x0,y0,shot.x,shot.y,target.x,target.y,targetX1,targetY1)<144){releaseHeatArrow(target,'intercepted');shot.life=0;spawnParts(target.x,target.y,8,'#9fe9fb',105);addPulse(target.x,target.y,24,'#73d5ee',.18);}
  }
  g.interceptorShots=(g.interceptorShots||[]).filter(s=>s.t<s.life);
  for(const arrow of(g.heatArrows||[])){
    if(arrow.dead)continue;
    if(arrow.retryAt&&performance.now()<arrow.retryAt){arrow.life+=dt;continue;}
    arrow.retryAt=0;arrow.age+=dt;arrow.px=arrow.x;arrow.py=arrow.y;
    if(arrow.age<arrow.arm)continue;
    if(hasStorm(g.variant)){
      let storm=null;
      for(const node of(g.wakeNodes||[])){
        const predictedX=arrow.x+arrow.vx*dt,predictedY=arrow.y+arrow.vy*dt;
        const nodeX=nearestTorusImage(node.x,arrow.x,W),nodeY=nearestTorusImage(node.y,arrow.y,visibleHeight());
        if(segmentPointDistanceSq(arrow.x,arrow.y,predictedX,predictedY,nodeX,nodeY)<=node.radius*node.radius){
          if(!storm||node.rpm>storm.rpm)storm=node;
        }
      }
      if(storm){
        const firstContact=!arrow.nodeMarks.has(storm.id),sign=((arrow.id+storm.id)&1)?1:-1;
        arrow.nodeMarks.add(storm.id);arrow.chill=(arrow.chill||0)+dt*(1.45+.3*storm.rpm);
        rotateVelocity(arrow,sign*(2.15+.18*storm.rpm)*dt);
        const drag=Math.exp(-(7.2+.9*storm.rpm)*dt);arrow.vx*=drag;arrow.vy*=drag;
        if(firstContact){
          storm.marks++;spawnParts(arrow.x,arrow.y,5,'#79e8e2',68);addPulse(arrow.x,arrow.y,18,'#b5fffa',.16);
          tEv('wake_deflect',{arrow:arrow.id,node:storm.id,rpm:roundTrace(storm.rpm)});
        }
        if(arrow.chill>=.22){
          releaseHeatArrow(arrow,'quenched');spawnParts(arrow.x,arrow.y,9,'#b5fffa',92);addPulse(arrow.x,arrow.y,26,'#e8ffff',.2);
          tEv('wake_quench',{arrow:arrow.id,node:storm.id,chill:roundTrace(arrow.chill)});continue;
        }
      }
    }
    const x0=arrow.x,y0=arrow.y;arrow.x+=arrow.vx*dt;arrow.y+=arrow.vy*dt;
    const hitR=12+arrow.r;
    if(movingPointDistanceSq(x0,y0,arrow.x,arrow.y,shipX0,shipY,shipX1,shipY)<hitR*hitR){
      const vulnerable=performance.now()>=(g.hitInvulnUntil||0);
      if(vulnerable){
        releaseHeatArrow(arrow,'ship_hit');
        tEv('heat_arrow_hit',{id:arrow.id,heat:roundHeat(arrow.heat),age_ms:Math.round(arrow.age*1000)});
        takeShipHit('heat_arrow');
      }else{
        // A surviving volley waits outside the collision strip through i-frames.
        // It can still hit later if the player remains on its locked line, but the
        // player can move away before it resumes.
        arrow.x=x0;arrow.y=y0;arrow.retryAt=g.hitInvulnUntil;
        tEv('heat_arrow_contact',{id:arrow.id,reason:'iframes_hold',age_ms:Math.round(arrow.age*1000)});
      }
      break;
    }
    if(arrow.age>arrow.life||arrow.x<-28||arrow.x>W+28||arrow.y<DUST_TOP-28||arrow.y>H+28)releaseHeatArrow(arrow,'cold_seam');
  }
  g.heatArrows=(g.heatArrows||[]).filter(a=>!a.dead);
  g.ship.combatX=g.ship.x;
}
