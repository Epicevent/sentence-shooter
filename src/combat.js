function addPulse(x,y,maxR,color,life){
  g.pulses.push({ x,y,r:4,maxR,life:life||.45,t:0,color });
}

function fireWingSalvo(reason,options){
  options=options||{};
  const combo=reason&&Number.isFinite(reason.combo)?reason.combo:g.combo;
  const rpm=1+Math.min(9,combo)*.1,allOrigins=heavyWeaponOrigins();
  const maxOrigins=Number.isFinite(options.maxOrigins)?Math.max(1,Math.min(allOrigins.length,options.maxOrigins)):allOrigins.length;
  const originOffset=(g.railOriginSeq=g.railOriginSeq||0),origins=[];
  for(let i=0;i<maxOrigins;i++)origins.push(allOrigins[(originOffset+i)%allOrigins.length]);
  g.railOriginSeq=(originOffset+maxOrigins)%Math.max(1,allOrigins.length);
  for(const origin of origins){
    const wave={id:++g.pressureWaveSeq,x:origin.x,y:H-48,width:(31+rpm*4)*(options.widthScale||1),speed:340+rpm*64,
      t:0,life:Math.max(.7,(H-DUST_TOP+40)/(340+rpm*64)),guns:origins.length,pushed:0};
    g.pressureWaves.push(wave);
    g.escortShots.push({x:origin.x,y:origin.y,vx:0,vy:-820,tx:origin.x,ty:H-155,t:0,life:.18,color:'#9fe9fb'});
  }
  tone(760+rpm*70,250,.07,'square',.045);addPulse(g.ship.x,H-42,72,'#73d5ee',.28);
  tEv('cooling_volley',{reason:reason&&reason.name||reason||'impact',craft:1+(g.wingUnits||0),guns:origins.length,
    rpm:roundTrace(rpm),waves:origins.length});
  return origins.length;
}
function deployWingGun(word,x,y,options){
  options=options||{};
  const before=g.wingUnits||0, weaponBefore=weaponLv();
  if(before<MAX_WING_UNITS){
    g.wingUnits=before+1;
    const pos=wingPositions().slice(-1)[0]||{x:g.ship.x,y:H-34},dx=pos.x-x,dy=pos.y-y,d=Math.hypot(dx,dy)||1;
    g.escortShots.push({x,y,vx:dx/d*680,vy:dy/d*680,tx:pos.x,ty:pos.y,t:0,life:Math.max(.28,d/680),color:'#d7ba7d'});
    for(const vx of[-140,0,140])g.escortShots.push({x:pos.x,y:pos.y-19,vx,vy:-900,tx:pos.x+vx*.18,ty:pos.y-170,t:0,life:.34,color:'#fff4b8'});
    spawnParts(x,y,18,'#fff4b8',210);spawnParts(pos.x,pos.y,28,'#9fe9fb',175);spawnParts(pos.x,pos.y,12,'#d7ba7d',115);
    addPulse(x,y,78,'#fff4b8',.24);addPulse(pos.x,pos.y,54,'#e8ffff',.22);addPulse(pos.x,pos.y,96,'#73d5ee',.46);
    g.rewardFlashAt=performance.now();g.rewardFlashUntil=g.rewardFlashAt+260;
    g.rewardFlashX=pos.x;g.rewardFlashY=pos.y;shake();buzz([16,22,34]);
  }
  const fired=fireWingSalvo({name:before<MAX_WING_UNITS?'wing_dock':'full_formation',combo:word.impactCombo||1},
    {maxOrigins:options.limited?1:undefined});
  const weaponAfter=weaponLv();
  if(before<MAX_WING_UNITS){
    banner('ESCORT '+g.wingUnits+'/'+MAX_WING_UNITS+' · '+WEAPONS[weaponAfter-1],true); sfx.up();
    tEv('weapon_up',{ before:weaponBefore,after:weaponAfter,name:WEAPONS[weaponAfter-1],source:'physical_wing' });
  }
  popText(g.ship.x,H-82,(before<MAX_WING_UNITS?'ESCORT FORMATION '+g.wingUnits+'/'+MAX_WING_UNITS:'FORMATION SALVO')+
    ' · '+heavyWeaponOrigins().length+' MUZZLES','#9fe9fb');
  tEv('wing_deploy',{ order:word.order,before,after:g.wingUnits,full:before>=MAX_WING_UNITS,
    craft:1+g.wingUnits,barrels:heavyWeaponOrigins().length,cooling_waves:fired,x:roundTrace(x),y:roundTrace(y),
    reward_flash_ms:before<MAX_WING_UNITS?260:0,normal_fire_origins:heavyWeaponOrigins().length });
  return before<MAX_WING_UNITS?'heavy_interceptor':'heavy_salvo';
}
function shatterWing(reason){
  const count=g.wingUnits||0;
  if(!count) return 0;
  for(const pos of wingPositions(count)){ spawnParts(pos.x,pos.y,11,'#f08b8b',155); addPulse(pos.x,pos.y,28,'#d16969',.22); }
  g.wingUnits=0;
  tEv('wing_shatter',{ reason:reason||'wrong',count });
  popText(g.ship.x,H-70,'WING LOST ×'+count,'#f08b8b');
  return count;
}
function addWakeNode(x,rpm,reason,direction){
  const radius=148+Math.min(9,rpm)*18;
  const nodeY=reason==='skill_cast'?Math.max(DUST_TOP+120,H-158):H-48;
  const existing=(g.wakeNodes||[]).find(node=>torusDxPx(node.x,x)<54&&torusDyPx(node.y,nodeY)<54);
  if(existing){
    existing.t=0;existing.rpm=Math.max(existing.rpm,rpm);existing.radius=Math.max(existing.radius,radius);
    tEv('wake_refresh',{id:existing.id,x:roundTrace(existing.x),rpm:roundTrace(existing.rpm),reason:reason||'move'});
    return existing;
  }
  const dir=Math.sign(direction||0);
  const node={id:(g.fieldSeq=(g.fieldSeq||0)+1),x:torusWrap(x,W),y:nodeY,t:0,
    life:23+Math.min(9,rpm)*.8,radius,rpm,spin:Math.random()*Math.PI*2,marks:0,
    direction:dir,vx:dir*STORM_DRIFT_SPEED};
  g.wakeNodes.push(node);
  if(g.wakeNodes.length>5)g.wakeNodes.shift();
  tEv('wake_node',{id:node.id,x:roundTrace(node.x),radius:roundTrace(node.radius),life_ms:Math.round(node.life*1000),
    rpm:roundTrace(rpm),reason:reason||'move',direction:dir,vx:roundTrace(node.vx)});
  return node;
}
function startBigWingSweep(node,direction,source){
  const now=performance.now(),dir=Math.sign(direction||0)||1;
  const sweep={id:(g.sweepSeq=(g.sweepSeq||0)+1),nodeId:node.id,x:g.ship.x,y:H-34,px:g.ship.x,py:H-34,
    vx:dir*112,vy:-SWEEP_SPEED,t:0,life:SWEEP_LIFE,corridor:SWEEP_CORRIDOR,direction:dir,cleared:0,cooledCells:0,
    cooled:new Uint8Array(HEAT_GRID_X*HEAT_GRID_Y)};
  g.sweeps=[sweep];g.sweepAbsorbs=[];
  g.rewardFlashAt=now;g.rewardFlashUntil=now+340;g.rewardFlashX=sweep.x;g.rewardFlashY=sweep.y;
  g.hitInvulnUntil=Math.max(g.hitInvulnUntil||0,now+1650);
  shake();buzz([28,38,55,28]);
  tEv('sweep_start',{id:sweep.id,node:node.id,x:roundTrace(sweep.x),y:roundTrace(sweep.y),vx:sweep.vx,vy:sweep.vy,
    corridor:sweep.corridor,life_ms:Math.round(sweep.life*1000),iframes_ms:1650,direction:dir,source:source||'input'});
  return sweep;
}
function coolSweepSegment(sweep,x0,y0,x1,y1){
  const field=heatField();if(!field)return 0;
  let cooled=0;
  for(let row=0;row<HEAT_GRID_Y;row++)for(let col=0;col<HEAT_GRID_X;col++){
    const index=row*HEAT_GRID_X+col;if(sweep.cooled[index])continue;
    const x=(col+.5)/HEAT_GRID_X*W,y=torusToScreenY((row+.5)/HEAT_GRID_Y);
    if(segmentPointDistanceSq(x0,y0,x1,y1,x,y)>sweep.corridor*sweep.corridor)continue;
    field.temp[index]*=.28;field.next[index]*=.28;sweep.cooled[index]=1;sweep.cooledCells++;cooled++;
  }
  if(cooled){rebuildHeatStats(field);field.vizStep=-1;}
  return cooled;
}
function updateBigWingSweeps(dt){
  const now=performance.now();
  for(const sweep of(g.sweeps||[])){
    const x0=sweep.x,y0=sweep.y;sweep.px=x0;sweep.py=y0;sweep.t+=dt;sweep.x+=sweep.vx*dt;sweep.y+=sweep.vy*dt;
    coolSweepSegment(sweep,x0,y0,sweep.x,sweep.y);
    for(const word of g.words){
      if(word.settled)continue;
      const wx=wordVisualX(word)+word.w/2,wy=wordVisualY(word)+word.h/2;
      if(segmentPointDistanceSq(x0,y0,sweep.x,sweep.y,wx,wy)<(sweep.corridor+Math.max(word.w,word.h)*.32)**2){
        word.sweepPauseUntil=Math.max(word.sweepPauseUntil||0,now+650);word.heatPulse=Math.max(word.heatPulse||0,.25);
        word.sweepPasses=word.sweepPasses||new Set();
        if(!word.sweepPasses.has(sweep.id)){word.sweepPasses.add(sweep.id);tEv('sweep_word_pause',{sweep:sweep.id,order:word.order,w:word.text,pause_ms:650});}
      }
    }
    for(const arrow of(g.heatArrows||[])){
      if(arrow.dead||segmentPointDistanceSq(x0,y0,sweep.x,sweep.y,arrow.x,arrow.y)>(sweep.corridor+arrow.r)**2)continue;
      const sx=arrow.x,sy=arrow.y;releaseHeatArrow(arrow,'sweep_clear');sweep.cleared++;
      g.sweepAbsorbs.push({id:(g.sweepAbsorbSeq=(g.sweepAbsorbSeq||0)+1),sweep:sweep.id,sx,sy,tx:sweep.x,ty:sweep.y,t:0,life:.48});
      spawnParts(sx,sy,8,'#e8ffff',120);addPulse(sx,sy,28,'#9fe9fb',.22);
      tEv('sweep_absorb',{sweep:sweep.id,arrow:arrow.id,x:roundTrace(sx),y:roundTrace(sy)});
    }
  }
  for(const absorb of(g.sweepAbsorbs||[]))absorb.t+=dt;
  g.sweepAbsorbs=(g.sweepAbsorbs||[]).filter(a=>a.t<a.life);
  const ended=(g.sweeps||[]).filter(s=>s.t>=s.life||s.y<-100);
  for(const sweep of ended)tEv('sweep_end',{id:sweep.id,cleared:sweep.cleared,cooled_cells:sweep.cooledCells,duration_ms:Math.round(sweep.t*1000)});
  g.sweeps=(g.sweeps||[]).filter(s=>s.t<s.life&&s.y>=-100);
}
function castWakeFromMovement(beforeX,afterX,dt,immediate){
  const movedPx=Math.abs(afterX-beforeX);
  if(isStormTrial()||!hasStorm(g.variant)||movedPx<=.25||g.coolerLevel<=0)return null;
  g.wakeDropT-=Math.max(0,dt||0);
  const rpm=1+Math.min(9,g.coolerLevel)*.18;
  if(immediate||g.wakeDropT<=0){
    const node=addWakeNode(afterX,rpm,'movement');
    g.wakeDropT=Math.max(.075,.29-.02*Math.min(9,g.coolerLevel));
    return node;
  }
  return null;
}
function boostWakeDrive(word,x,y){
  const combo=word.impactCombo||1,before=g.coolerLevel||0;
  // Independent missiles may settle out of logical order. A late low-combo
  // impact can add presentation, but it may never rewind already earned RPM.
  g.coolerLevel=Math.max(before,Math.min(9,combo));
  const rpm=1+g.coolerLevel*.18,radius=148+Math.min(9,rpm)*18;
  addPulse(g.ship.x,H-48,radius*.72,'#79e8e2',.42);
  if(isStormTrial()){
    const chargeBefore=g.stormCharge||0;
    g.stormCharge=Math.min(STORM_READY_HITS,chargeBefore+1);
    const ready=g.stormCharge>=STORM_READY_HITS;
    popText(g.ship.x,H-102,ready?'SWEEP READY · SHIFT+←/→':'SWEEP CHARGE '+g.stormCharge+'/'+STORM_READY_HITS,'#b5fffa');
    tEv('storm_charge',{order:word.order,combo,before:chargeBefore,after:g.stormCharge,power:g.coolerLevel,ready});
    tEv('wake_drive',{order:word.order,id:null,rpm:roundTrace(rpm),combo,before,after:g.coolerLevel,
      radius:roundTrace(radius),movement_only:false,manual_skill:true,charge:g.stormCharge});
    tone(460,900,.11,'sine',.045);
    return 'storm_skill_charge';
  }
  popText(g.ship.x,H-102,'BLIZZARD CHARGED · MOVE TO CAST · RPM '+rpm.toFixed(1),'#b5fffa');
  tEv('wake_drive',{order:word.order,id:null,rpm:roundTrace(rpm),combo,before,after:g.coolerLevel,
    radius:roundTrace(radius),movement_only:true});
  tone(460,900,.11,'sine',.045);
  return 'blizzard_charge';
}
function castStorm(direction,source){
  if(!g||g.over||g.viewportPaused||!isStormTrial())return null;
  const dir=Math.sign(direction||0)||1,active=(g.wakeNodes||[]).find(node=>node.t<node.life);
  if(active){
    const before=Math.sign(active.vx||active.direction||0);
    active.direction=dir;active.vx=dir*STORM_DRIFT_SPEED;
    tEv('storm_steer',{id:active.id,before,after:dir,vx:roundTrace(active.vx),source:source||'input',scene:traceScene()});
    popText(active.x,active.y-active.radius*.62,dir<0?'WAKE DRIFT ←':'WAKE DRIFT →','#b5fffa');
    tone(680,420,.07,'sine',.035);updateHud();return active;
  }
  if((g.stormCharge||0)<STORM_READY_HITS){
    tEv('storm_cast_blocked',{reason:'not_ready',charge:g.stormCharge||0,direction:dir,source:source||'input',scene:traceScene()});
    $('msg').textContent='SWEEP '+(g.stormCharge||0)+'/'+STORM_READY_HITS+' · land real hits to charge';sfx.plink();return null;
  }
  const power=Math.max(1,g.coolerLevel||1),rpm=1+Math.min(9,power)*.18;
  const node=addWakeNode(g.ship.x,rpm,'skill_cast',dir);
  const spent=g.stormCharge;g.stormCharge=0;g.coolerLevel=0;
  const sweep=startBigWingSweep(node,dir,source);
  addPulse(node.x,node.y,node.radius*.92,'#e8ffff',.5);spawnParts(node.x,node.y,34,'#b5fffa',190);
  banner(dir<0?'BIG WING SWEEP ←':'BIG WING SWEEP →',true);tone(180,1080,.28,'sawtooth',.09);
  tEv('storm_cast',{id:node.id,direction:dir,vx:roundTrace(node.vx),rpm:roundTrace(rpm),power,spent,
    source:source||'input',steerable:true,sweep:sweep.id,scene:traceScene()});
  updateHud();return node;
}
function empowerEnemy(word){
  if(!word || !g.words.includes(word) || word.settled) return 0;
  const before=word.rage||0;
  word.rage=Math.min(3,before+1);
  word.err=.75;
  spawnParts(wordVisualX(word)+word.w/2,wordVisualY(word)+word.h/2,13,'#f08b8b',130);
  addPulse(wordVisualX(word)+word.w/2,wordVisualY(word)+word.h/2,42+word.rage*8,'#d16969',.32);
  popText(wordVisualX(word)+word.w/2,wordVisualY(word)-12,'OVERHEAT '+word.rage,'#ff6e7f');
  tEv('enemy_empower',{ order:word.order,w:word.text,before,after:word.rage });
  return word.rage;
}

function spawnCraftPressureRound(kind){
  if(!g||g.over||g.viewportPaused||(!isPhantom()&&!isBulwark()))return null;
  const word=g.words.find(w=>!w.resolved&&w.order===g.idx)||g.words.find(w=>!w.settled);
  if(!word)return null;
  const x=wordVisualX(word)+word.w/2,y=wordVisualY(word)+word.h/2,shipY=H-34;
  const lane=(g.craftRoundSeq=(g.craftRoundSeq||0)+1)%2?1:-1;
  const aimX=Math.max(18,Math.min(W-18,g.ship.x+lane*(isPhantom()?30:12)));
  const dx=aimX-x,dy=shipY-y,d=Math.hypot(dx,dy)||1,speed=isPhantom()?205:220;
  const arrow={id:(g.heatArrowSeq=(g.heatArrowSeq||0)+1),sourceTracerId:null,origin:kind||g.craft,x,y,px:x,py:y,
    sourceX:x,sourceY:y,silhouette:'round',vx:dx/d*speed,vy:dy/d*speed,age:0,arm:HEAT_ARROW_ARM_MS/1000,
    life:HEAT_ARROW_ARM_MS/1000+d/speed+1.2,travelDistance:d,heat:.12,sourceHeat:.12,r:6.5,dead:false,
    grazed:false,grazeArmed:false,nodeMarks:new Set()};
  g.heatArrows.push(arrow);
  tEv('craft_round_armed',{id:arrow.id,craft:g.craft,origin:arrow.origin,order:word.order,warning_ms:HEAT_ARROW_ARM_MS,
    x:roundTrace(x),y:roundTrace(y),aim_x:roundTrace(aimX)});
  return arrow;
}

function awardGraze(arrow){
  if(!isPhantom()||!arrow||arrow.grazed||arrow.origin!=='phantom_pressure')return false;
  const before=g.sync||0;arrow.grazed=true;g.sync=Math.min(SYNC_MAX,before+GRAZE_GAIN);g.grazes++;
  spawnParts(arrow.x,arrow.y,7,'#bdb8ff',88);addPulse(arrow.x,arrow.y,24,'#e8ffff',.2);
  popText(g.ship.x,H-70,'GRAZE +'+(g.sync-before),'#bdb8ff');tone(760,1040,.045,'sine',.035);
  tEv('graze',{id:arrow.id,before,after:g.sync,x:roundTrace(arrow.x),y:roundTrace(arrow.y),scene:traceScene()});
  if(before<SYNC_MAX&&g.sync===SYNC_MAX){banner('SYNC 100% · LAND A REAL HIT',true);sfx.up();}
  updateHud();return true;
}

function triggerBulletWipe(x,y,word){
  const live=(g.heatArrows||[]).filter(arrow=>!arrow.dead);
  const core=signalCore(),before=g.sync||0;
  for(const arrow of live){
    g.phantomAbsorbs.push({id:(g.phantomAbsorbSeq=(g.phantomAbsorbSeq||0)+1),sx:arrow.x,sy:arrow.y,
      tx:core.x,ty:core.y,t:0,life:.56});
    releaseHeatArrow(arrow,'phantom_wipe');
  }
  g.sync=0;g.coreBursts=(g.coreBursts||0)+1;g.rewardFlashAt=performance.now();g.rewardFlashUntil=g.rewardFlashAt+320;
  g.rewardFlashX=core.x;g.rewardFlashY=core.y;addPulse(core.x,core.y,Math.max(W,H)*.48,'#bdb8ff',.72);
  spawnParts(core.x,core.y,34,'#e8ffff',210);shake();buzz([22,32,45]);banner('BULLET WIPE ×'+live.length,true);
  tEv('bullet_wipe',{order:word.order,before_sync:before,cleared:live.length,core:[roundTrace(core.x),roundTrace(core.y)],scene:traceScene()});
  return{reward:'bullet_wipe',cleared:live.length,burst:true};
}

function captureCarrierCargo(word,x,y){
  // Delivery must cross the playfield from the carrier's actual capture side.
  // Using the remote word impact x could accidentally place the dock under the ship.
  const dockX=g.ship.x<W/2?W-DOCK_RADIUS:DOCK_RADIUS;
  g.cargo={word,order:word.order,text:word.text,dockX,capturedAt:performance.now(),sourceX:x,sourceY:y,
    x,y,captureLife:420,attached:false};
  g.cargoPendingOrder=null;g.dockFlash=0;g.rewardFlashAt=performance.now();g.rewardFlashUntil=g.rewardFlashAt+210;
  g.rewardFlashX=g.ship.x;g.rewardFlashY=H-48;
  addPulse(x,y,54,'#f0bd67',.24);spawnParts(x,y,16,'#fff4b8',130);
  popText(g.ship.x,H-86,dockX<W/2?'CARGO · DELIVER LEFT':'CARGO · DELIVER RIGHT','#fff4b8');
  tEv('cargo_capture',{order:word.order,w:word.text,from:[roundTrace(x),roundTrace(y)],dock_x:roundTrace(dockX),scene:traceScene()});
  updateHud();return{reward:'cargo_capture',cleared:0,burst:false,defer:true};
}

function dockCarrierCargo(){
  if(!isCarrier()||!g.cargo||!g.cargo.attached)return false;
  const cargo=g.cargo;if(Math.abs(g.ship.x-cargo.dockX)>DOCK_RADIUS)return false;
  g.cargo=null;g.cargoPendingOrder=null;g.dockFlash=performance.now();
  addPulse(cargo.dockX,H-56,150,'#fff4b8',.58);spawnParts(cargo.dockX,H-56,36,'#f0bd67',220);
  sfx.clear();buzz([25,30,48]);shake();banner('DELIVERY COMPLETE',true);
  if(cargo.word.pts){awardScore(cargo.word.pts,cargo.dockX,H-66,'cargo_delivery');popText(cargo.dockX,H-92,'+'+cargo.word.pts,'#fff4b8');}
  launchAssembly(cargo.word,cargo.dockX,H-66);
  tEv('cargo_dock',{order:cargo.order,dock_x:roundTrace(cargo.dockX),travel_ms:Math.round(performance.now()-cargo.capturedAt),scene:traceScene()});
  if(g.pendingSentenceClear&&g.idx===g.sentence.length){g.pendingSentenceClear=false;sentenceClear();}
  else{$('msg').innerHTML='<span style="color:var(--gold)">DELIVERED</span> · NEXT CHUNK READY';updateHud();}
  return true;
}

function fireCarrierIntercept(x,y){
  if(!isCarrier()||!g.cargo||!g.cargo.attached)return false;
  const live=(g.heatArrows||[]).filter(a=>!a.dead&&a.age>=a.arm);
  const target=live.reduce((best,a)=>{
    const d=Math.hypot(a.x-x,a.y-y);return d<140&&(!best||d<best.d)?{a,d}:best;
  },null);
  if(target)fireInterceptor(target.a);
  else{
    const dx=x-g.ship.x,dy=y-(H-46),d=Math.hypot(dx,dy)||1;
    g.escortShots.push({x:g.ship.x,y:H-46,vx:dx/d*850,vy:dy/d*850,tx:x,ty:y,t:0,life:.34,color:'#fff4b8'});
  }
  tone(980,520,.05,'square',.04);tEv('cargo_intercept',{target:target?target.a.id:null,x:roundTrace(x),y:roundTrace(y)});
  return true;
}

function plantCounterLine(word,x,y){
  const line={id:++g.counterSeq,x:Math.max(28,Math.min(W-28,x)),t:0,life:COUNTER_LINE_LIFE,
    charges:COUNTER_LINE_CHARGES,order:word.order};
  g.counterLines.push(line);while(g.counterLines.length>3)g.counterLines.shift();
  addPulse(line.x,y,84,'#aef0ae',.36);spawnParts(line.x,y,22,'#aef0ae',150);banner('COUNTER LINE '+g.counterLines.length+'/3',true);
  tEv('counter_line_start',{id:line.id,order:word.order,x:roundTrace(line.x),life_ms:Math.round(line.life*1000),charges:line.charges,scene:traceScene()});
  updateHud();return{reward:'counter_line',cleared:0,burst:false};
}

function collapseCounterLines(reason){
  const lines=(g.counterLines||[]).slice();
  for(const line of lines){spawnParts(line.x,H-90,12,'#d16969',130);addPulse(line.x,H-90,36,'#d16969',.2);}
  g.counterLines=[];
  if(lines.length)tEv('counter_line_collapse',{reason:reason||'wrong',count:lines.length,ids:lines.map(line=>line.id)});
  return lines.length;
}

function reflectCounterArrow(arrow,x0,y0){
  if(!isBulwark()||!arrow||arrow.dead)return false;
  const line=(g.counterLines||[]).find(candidate=>candidate.charges>0&&Math.abs(g.ship.x-candidate.x)<=26&&
    ((x0-candidate.x)*(arrow.x-candidate.x)<=0||Math.abs(arrow.x-candidate.x)<10));
  if(!line)return false;
  const sx=arrow.x,sy=arrow.y;releaseHeatArrow(arrow,'counter_reflect');line.charges--;
  g.counterShots.push({x:sx,y:sy,vx:-arrow.vx*.45,vy:-Math.abs(arrow.vy)*1.35,t:0,life:.7,line:line.id});
  addPulse(sx,sy,36,'#aef0ae',.24);spawnParts(sx,sy,12,'#e8ffff',155);awardScore(20,sx,sy,'counter_reflect');
  tEv('counter_reflect',{id:arrow.id,line:line.id,charges:line.charges,x:roundTrace(sx),y:roundTrace(sy)});
  if(line.charges<=0){spawnParts(line.x,H-90,18,'#aef0ae',145);tEv('counter_line_spent',{id:line.id});}
  g.counterLines=g.counterLines.filter(candidate=>candidate.charges>0&&candidate.t<candidate.life);updateHud();return true;
}

function grantPhysicalReward(word,x,y){
  if(isPhantom())return (g.sync||0)>=SYNC_MAX&&!word.auto?triggerBulletWipe(x,y,word):{reward:'sync_hold',cleared:0,burst:false};
  if(isCarrier())return captureCarrierCargo(word,x,y);
  if(isBulwark())return plantCounterLine(word,x,y);
  const rail=deployWingGun(word,x,y,{limited:false});
  g.escortAmmo=Math.min(MAX_WING_UNITS,(g.escortAmmo||0)+1);
  const storm=boostWakeDrive(word,x,y);
  tEv('fusion_reward',{order:word.order,rail,storm,escort_ammo:g.escortAmmo,storm_level:g.coolerLevel,
    storm_charge:g.stormCharge||0,wing_units:g.wingUnits,normal_fire_origins:heavyWeaponOrigins().length});
  return{reward:'striker_formation_sweep',cleared:0,burst:false,rail,storm};
}

function applyPhysicalImpact(word,x,y,forced){
  if (forced) return { cleared:0, burst:false, reward:'forced' };
  const color=CRAFTS[g.craft]?.color||'#73d5ee';addPulse(x,y,58,color,.34);
  const result=grantPhysicalReward(word,x,y),reward=result&&result.reward||result;
  tEv('word_impact',{ order:word.order,w:word.text,auto:!!word.auto,reward,craft:g.craft,x:roundTrace(x),y:roundTrace(y) });
  updateHud();
  return typeof result==='object'?result:{ cleared:0, burst:false, reward };
}

function takeShipHit(reason){
  const now = performance.now();
  if (!g || g.over || now < (g.hitInvulnUntil || 0)) return;
  g.hitInvulnUntil = now + 950;
  // Being clipped while dodging must not turn the player's next confirm into an
  // accidental stocked auto-build. Keep the visible candidate focus through recoil.
  g.perfect = false; g.combo = 0;
  g.shotJamUntil = 0; g.missChain = 0;
  const syncBefore=g.sync||0;
  if(isPhantom()) g.sync=0;
  g.lives--;
  if(hasEscort(g.variant)&&(g.wingUnits||0)>0){
    const pos=wingPositions(g.wingUnits).slice(-1)[0];g.wingUnits--;
    if(g.variant==='C')g.escortAmmo=0;
    if(pos){spawnParts(pos.x,pos.y,11,'#f08b8b',155);addPulse(pos.x,pos.y,28,'#d16969',.22);}
    tEv('wing_damage',{reason:reason||'ship_hit',remaining:g.wingUnits});
  }
  spawnParts(g.ship.x,H-34,18,'#d16969',190); shake(); buzz(110);
  // A dense wrong-answer volley remains in flight after one hit. Only the
  // colliding arrow is consumed, so distant arrows can arrive after i-frames.
  tEv('ship_hit', { shielded:false, shields:0, lives:g.lives, variant:g.variant,
    reason:reason||'unknown',reward_preserved:true, sync_before:syncBefore, sync_after:g.sync||0 });
  if (g.lives <= 0){ gameOver(); return; }
  recoilFormation('life_fire');
  banner('SHIP HIT', false);
  $('msg').innerHTML = '<span style="color:var(--danger)">HULL HIT</span> · ' + g.lives + ' SHIPS LEFT · KEEP BUILDING';
  updateHud();
}

function inputJammed(kind){
  return false;
}

function applyWrongPenalty(chosen, detail){
  const now = performance.now();
  const rules = variantRules(g.variant);
  g.missChain = now - (g.lastMissAt || 0) < 1200 ? Math.min(3,(g.missChain || 0)+1) : 1;
  g.lastMissAt = now;
  const chain = g.missChain;
  const jam = 0;
  g.shotJamUntil = 0;
  g.missGraceUntil = now + MISS_BURST_MS;
  const comboLost=g.combo||0, flowLost=0;
  const expected=g.words.find(w=>!w.resolved&&w.order===g.idx),mistakeKind=chosen&&chosen.isDecoy?'grammar':'order';
  if(chosen)g.mistakes.push({item:g.item&&g.item.id,kind:mistakeKind,chosen:chosen.text,expected:expected?expected.text:'',order:g.idx,t:Math.round(now-TRACE.meta.started)});
  const boundaryBefore=chosen?wordBoundaryTemperature(chosen):0;
  const rage=chosen?empowerEnemy(chosen):0;
  const boundaryAfter=chosen?wordBoundaryTemperature(chosen):0;
  const rewardLost=0;
  const collapsed=isBulwark()?collapseCounterLines('wrong'):0;
  const floorHeat=triggerDustHazard(chain,chosen);
  const scoreLost=rules.wrongScoreBase+Math.max(0,chain-1)*rules.wrongScoreChain;
  g.typePrefix = ''; g.plinks++; g.combo = 0; g.perfect = false;
  if(isStriker()){g.coolerLevel=0;g.stormCharge=0;}
  if(isPhantom())g.sync=0;
  const actualScoreLost=loseScore(scoreLost,chosen?wordVisualX(chosen)+chosen.w/2:g.ship.x,
    chosen?wordVisualY(chosen):H-62,'wrong');
  const lunge = 0;
  const timeLost = 0;
  const bankLost = Math.min(g.recoilBank || 0,12*chain);
  g.recoilBank = Math.max(0,(g.recoilBank || 0)-bankLost);

  const retaliation = (g.heatArrows||[]).filter(a=>!a.dead).length;
  tEv('miss', Object.assign({
    order:chosen ? chosen.order : null, w:chosen ? chosen.text : '', mistake_kind:mistakeKind, chain, jam, retaliation,
    lunge, time_lost:roundTrace(timeLost), bank_lost:roundTrace(bankLost),
    score_lost:actualScoreLost, score_loss_requested:scoreLost, combo_lost:comboLost, flow_lost:flowLost,
    reward_lost:rewardLost, floor_heat:floorHeat,boundary_before:roundTrace(boundaryBefore),
    boundary_after:roundTrace(boundaryAfter),rage,counter_lines_collapsed:collapsed,scene:traceScene(),
  },detail || {}));
  if(actualScoreLost)popText(chosen?wordVisualX(chosen)+chosen.w/2:g.ship.x,
    chosen?wordVisualY(chosen)-8:H-62,'-'+actualScoreLost,'#f08b8b');
  $('msg').innerHTML = '<span style="color:var(--danger)">'+(mistakeKind==='grammar'?'GRAMMAR · TRAP FORM':'ORDER · RIGHT PHRASE, NOT YET')+' · '+retaliation+' RED ROUNDS</span>' +
    (actualScoreLost?' · -'+actualScoreLost:'')+' · <span style="color:var(--bright)">MOVE · NEXT INPUT READY</span>';
  updateHud();
}

