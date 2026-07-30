const WING_HOLD_CLEARANCE = 144;
function wingHoldClearance(){ return Math.min(WING_HOLD_CLEARANCE,Math.max(84,H*.2)); }
function sigLen(text){ let n = 0; for (const c of text) if (SIG.test(c)) n++; return n; }
function typingForm(text){ let out = ''; for (const c of text) if (SIG.test(c)) out += c.toLowerCase(); return out; }
function choiceIdentity(text){ return String(text).trim().replace(/\s+/g,' ').toLowerCase(); }
function validateItems(items){
  for (const item of items){
    const choices = [...item.answer,...(item.decoys||[])];
    if (!item.ask || !item.answer.length) throw new Error('invalid TOEFL item: '+item.id);
    for (let i=0;i<choices.length;i++) for (let j=i+1;j<choices.length;j++){
      if (typingForm(choices[i]) === typingForm(choices[j]) && choiceIdentity(choices[i]) !== choiceIdentity(choices[j]))
        throw new Error('typing collision in '+item.id+': '+choices[i]+' / '+choices[j]);
    }
  }
}
validateItems(ITEMS);

function sortieStageForSolved(solved){
  const wave=Math.max(0,solved|0)%4;
  return{sortie:Math.floor(Math.max(0,solved|0)/4)+1,wave,boss:wave===3};
}
function pickSentence(solvedOverride){
  const solved=Number.isFinite(solvedOverride)?solvedOverride:g.solved;
  const stage=sortieStageForSolved(solved),lv=Math.min(3,1+stage.wave);
  const len = item => item.answer.length;
  let cands = ITEM_ORDER.filter(item => !!item.boss===stage.boss && !g.recent.includes(item.id));
  if (!cands.length){
    if(stage.boss)cands=ITEM_ORDER.filter(item=>item.boss);
    else{g.recent=g.recent.filter(id=>ITEMS.some(item=>item.id===id&&item.boss));cands=ITEM_ORDER.filter(item=>!item.boss);}
  }
  const tier = stage.boss?cands:cands.filter(item => lv===1 ? len(item)<=4 : lv===2 ? len(item)>=4 : len(item)>=5);
  const use = tier.length ? tier : cands;
  return use[0];
}

function makeFormationWords(item,incoming){
  const offered=[
    ...item.answer.map((text,order)=>({text,order,isDecoy:false})),
    ...(item.decoys||[]).map((text,i)=>({text,order:item.answer.length+i,isDecoy:true})),
  ];
  const perRow=W<520?1:2,margin=8,slots=offered.map((w,i)=>i);
  const layoutRng=makeRng(AB_SEED^textSeed(item.id));
  for(let i=slots.length-1;i>0;i--){const j=Math.floor(layoutRng()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
  return offered.map((piece,pieceIndex)=>{
    const {text,order,isDecoy}=piece,slot=slots[pieceIndex],row=Math.floor(slot/perRow),col=slot%perRow;
    const laneW=(W-margin*2)/perRow,tw=ctx.measureText(text).width,bw=Math.min(laneW-10,tw+22),bh=34;
    const jitterX=layoutRng()*12-6,x=Math.max(margin,Math.min(W-margin-bw,margin+col*laneW+(laneW-bw)/2+jitterX));
    const rows=Math.ceil(offered.length/perRow),top=W<520?104:132;
    const safeBottom=Math.max(top,(H-64)-wingHoldClearance()-bh-6);
    const bottom=W>=520?Math.max(top,Math.min(safeBottom,H-250)):safeBottom;
    const rowGap=rows>1?Math.min(58,(bottom-top)/(rows-1)):0,targetY=top+row*rowGap;
    const hp=sigLen(text),entryOffset=Math.max(154,Math.min(220,H*.3));
    return{text,order,x,y:incoming?targetY-entryOffset:targetY,targetY,w:bw,h:bh,hp,maxhp:hp,flash:0,consumed:0,
      committed:0,resolved:false,resolvedAt:0,settled:false,pts:0,row,col,slot,jitterX,holding:false,threatY:null,isDecoy,baseX:x,
      phase:layoutRng()*Math.PI*2,firedAt:0,heatPulse:0,spawnY:targetY,rage:0,boundaryTemp:.25,incoming:!!incoming};
  });
  if(g.preloadedItem&&(g.incomingWords||[]).length){
    g.incomingWords=makeFormationWords(g.preloadedItem,false).map(w=>Object.assign(w,{incoming:true,y:w.targetY}));
  }
}

function prepareIncomingFormation(){
  if(!g||g.over||g.preloadedItem||(g.incomingWords||[]).length)return null;
  const nextSolved=g.solved+1,item=pickSentence(nextSolved),stage=sortieStageForSolved(nextSolved);
  if(!item)return null;
  g.preloadedItem=item;g.incomingWords=item.boss&&H<MIN_BOSS_HEIGHT?[]:makeFormationWords(item,true);
  tEv('formation_preload',{item:item.id,sortie:stage.sortie,wave:stage.wave+1,boss:stage.boss,
    words:g.incomingWords.map(w=>[w.order,w.text,roundTrace(w.x),roundTrace(w.y),roundTrace(w.targetY),w.isDecoy?1:0])});
  return item;
}

function replyText(count, cursor){
  if (!g || !g.sentence) return '';
  const item = g.item || { lead:'', tail:'' };
  const pieces = [];
  if (item.lead) pieces.push(item.lead);
  pieces.push(...g.sentence.slice(0, count));
  if (cursor && count < g.sentence.length) pieces.push('▁');
  let text = pieces.filter(Boolean).join(' ');
  if (count >= g.sentence.length && item.tail) text += item.tail;
  return text.trim();
}

function fullReply(){ return replyText(g.sentence.length, false); }

function attachedReplyCount(){
  if(!g||!g.sentence)return 0;
  let count=0;
  while(count<g.sentence.length&&g.visualAttached&&g.visualAttached[count])count++;
  return count;
}
function replyRailHtml(){
  const count=attachedReplyCount(),pieces=[];
  if(g.item&&g.item.lead)pieces.push('<span class="lead-piece">'+esc(g.item.lead)+'</span>');
  for(let i=0;i<count;i++){
    const flash=i===g.assemblyFlashOrder&&performance.now()<(g.assemblyFlashUntil||0)
      ?' just-attached-'+g.variant.toLowerCase():'';
    pieces.push('<span class="chunk-piece'+flash+'" data-order="'+i+'">'+esc(g.sentence[i])+'</span>');
  }
  if(count>=g.sentence.length&&g.item&&g.item.tail)pieces.push('<span class="lead-piece">'+esc(g.item.tail)+'</span>');
  if(count<g.sentence.length)pieces.push('<span id="assembly-target" class="assembly-target"></span><span class="pending-piece"></span>');
  return pieces.join(' ');
}

function nextSentence(){
  const unresolvedImpacts=g.words.filter(w=>w.resolved&&!w.settled&&!w.isDecoy);
  if(g.pendingSentenceClear && g.idx===g.sentence.length && unresolvedImpacts.length){
    // A transition may be requested by a stale timer or test harness, but an
    // earned projectile is never converted into a rewardless cleanup blast.
    // Settle every reserved impact normally; the last one calls sentenceClear,
    // whose own timer will return here after the reward beat has played.
    for(const w of unresolvedImpacts) settleWord(w,false);
    return;
  }
  // Do not let a fast clear erase the tail of its own hit animation. Any volley that has
  // not physically arrived by the transition deadline lands as a final cleanup blast.
  for (const w of g.words.slice()) if (w.resolved && !w.settled) settleWord(w, true);
  endHeatVolley('wave_transition');
  const item = g.preloadedItem || pickSentence(g.solved);
  const incoming = g.preloadedItem===item ? g.incomingWords : null;
  g.preloadedItem=null;g.incomingWords=[];
  g.recent.push(item.id); if (g.recent.length > 12) g.recent.shift();
  g.item = item;
  g.sentence = item.answer.slice();
  const stage=sortieStageForSolved(g.solved);g.sortie=stage.sortie;g.sortieWave=stage.wave;
  g.idx = 0; g.t0 = performance.now(); g.perfect = true; g.typePrefix = ''; g.pendingSentenceClear=false;
  for(const flight of(g.assemblyFlights||[]))flight.el.remove();
  g.visualAttached=Array(g.sentence.length).fill(false);g.assemblyFlights=[];g.assemblyFlashOrder=-1;g.assemblyFlashUntil=0;
  g.shotJamUntil = 0; g.lastMissAt = 0; g.missChain = 0;
  g.waveGraceUntil = g.t0 + [3200,2600,2000,1400][stage.wave];
  g.combatStarted = false;
  g.heatEmitT = .42;
  g.recoilBank = 0;
  g.visualPhase = 0; g.escortShots = [];
  if (g.viewportPaused) g.viewportPauseAt = g.t0;
  const rules = variantRules(g.variant);
  g.speed = Math.min(rules.speedCap,rules.baseSpeed*Math.pow(rules.solvedScale,g.solved));
  g.wordT = 0;
  g.words = []; g.missiles = []; g.fireQueues = []; g.lock = null;
  ctx.font = '15px "Cascadia Mono", Consolas, monospace';
  g.perRow=W<520?1:2;
  g.words=(incoming&&incoming.length?incoming:makeFormationWords(item,false)).map(w=>Object.assign(w,{y:w.targetY,incoming:false,spawnY:w.targetY}));
  tEv('sentence_start', { solved: g.solved, speed: roundTrace(g.speed), variant:g.variant,craft:g.craft,
    concept:variantConcept(g.variant),
    item:item.id, source:item.source||null, ask:item.ask, lead:item.lead, tail:item.tail, answer_count:item.answer.length,
    sortie:stage.sortie,wave:stage.wave+1,boss:stage.boss,streamed:!!(incoming&&incoming.length),grace_ms:Math.round(g.waveGraceUntil-g.t0),
    words: g.words.map(w => [w.order, w.text, roundTrace(w.x), roundTrace(w.y),
      roundTrace(w.w), roundTrace(w.h), w.maxhp, w.isDecoy ? 1 : 0]) });
  if(stage.boss)banner('BOSS SENTENCE · '+item.answer.length+' CHUNKS',true);
  if(H<minimumPlayHeight())reflowViewport(W,H);
  updateHud();
}

function updateReserveHud(){
  const label = CRAFTS[g.craft]?.name || g.craft || g.variant;
  if ($('h-variant').textContent !== label) $('h-variant').textContent = label;
}

function resourcePips(value,max){
  value=Math.max(0,Math.min(max,Math.round(value||0)));
  return '●'.repeat(value)+'○'.repeat(max-value);
}

function updateHud(){
  updateReserveHud();
  $('h-score').textContent = Math.round(g.scoreDisplay||0);
  $('h-score-goal').textContent = 'BREAK ' + g.scoreMilestone;
  const prevMilestone=Math.max(0,g.scoreMilestone-SCORE_STEP);
  const scoreFill=Math.max(0,Math.min(100,100*((g.scoreDisplay||0)-prevMilestone)/SCORE_STEP));
  const scoreBank=$('score-bank');
  if(scoreBank.style && scoreBank.style.setProperty) scoreBank.style.setProperty('--score-fill',scoreFill+'%');
  else if(scoreBank.style) scoreBank.style['--score-fill']=scoreFill+'%';
  const attached=attachedReplyCount();
  $('h-progress').textContent = 'S'+(g.sortie||1)+' '+((g.sortieWave||0)+1)+'/4 · '+attached+'/'+g.sentence.length;
  const craft=CRAFTS[g.craft]||CRAFTS.striker;
  $('h-combat-label').textContent = craft.verb;
  if(isStriker()){
    $('h-combo').textContent='W'+(g.wingUnits||0)+' · U'+(g.stormCharge||0)+'/'+STORM_READY_HITS;
    $('h-weapon').textContent=resourcePips(g.wingUnits||0,MAX_WING_UNITS)+' · '+resourcePips(g.stormCharge||0,STORM_READY_HITS);
  }else if(isPhantom()){
    $('h-combo').textContent='SYNC '+Math.round(g.sync||0)+'%';
    $('h-weapon').textContent=resourcePips(Math.floor((g.sync||0)/GRAZE_GAIN),SYNC_MAX/GRAZE_GAIN)+' · REAL HIT = WIPE';
  }else if(isCarrier()){
    const dock=g.cargo?(g.cargo.dockX<W/2?'← LEFT DOCK':'RIGHT DOCK →'):(g.cargoPendingOrder!==null?'CAPTURE INBOUND':'READY');
    $('h-combo').textContent=g.cargo?'CARGO '+(g.cargo.order+1):dock;
    $('h-weapon').textContent=dock;
  }else{
    const charges=(g.counterLines||[]).reduce((n,line)=>n+Math.max(0,line.charges||0),0);
    $('h-combo').textContent='LINES '+(g.counterLines||[]).length+' · R'+charges;
    $('h-weapon').textContent='STAND ON GREEN LINE';
  }
  const skillReady=isStriker()&&(g.stormCharge||0)>=STORM_READY_HITS&&!(g.wakeNodes||[]).length;
  $('h-resource').classList.toggle('skill-ready',skillReady);
  $('h-resource').classList.toggle('skill-active',(isStriker()&&(g.wakeNodes||[]).length>0)||(isPhantom()&&(g.sync||0)>=SYNC_MAX)||!!g.cargo);
  const density=dustBand();
  $('h-dust').innerHTML = '<b>' + density.temp.toFixed(2) + '</b>';
  const hostile=dustHazardActive();
  $('h-hazard').textContent = 'VOLLEY';
  if(hostile)$('h-hazard').classList.remove('hidden');else $('h-hazard').classList.add('hidden');
  $('h-lives').textContent = '▲'.repeat(Math.max(0, g.lives)) || '—';
  $('h-best').textContent = g.best;
  g.builtDrawn = replyText(attached,attached<g.sentence.length);
  $('built').textContent = g.builtDrawn;
  if (g.item){
    $('prompt').innerHTML = '<span class="speaker">A:</span> ' + esc(g.item.ask) + '<br>' +
      '<span class="speaker">B:</span> <span id="reply-rail" class="reply reply-rail">' + replyRailHtml() + '</span>';
  }
}

function dockAssembly(id){
  if(!g)return;
  const flight=(g.assemblyFlights||[]).find(f=>f.id===id);
  if(!flight)return;
  flight.el.remove();
  g.assemblyFlights=g.assemblyFlights.filter(f=>f!==flight);
  if(flight.itemId!==(g.item&&g.item.id)||!g.visualAttached||flight.order>=g.visualAttached.length)return;
  g.visualAttached[flight.order]=true;
  const railRoute=flight.route==='direct_rail_slam';
  g.assemblyFlashOrder=flight.order;g.assemblyFlashUntil=performance.now()+(railRoute?620:800);
  updateHud();
  const prompt=$('prompt');
  prompt.classList.remove('prompt-impact-a','prompt-impact-b');void prompt.offsetWidth;
  prompt.classList.add(railRoute?'prompt-impact-a':'prompt-impact-b');
  setTimeout(()=>prompt.classList.remove('prompt-impact-a','prompt-impact-b'),850);
  if(railRoute)tone(540,860,.09,'square',.055);else{tone(420,760,.12,'sine',.05);setTimeout(()=>tone(760,1080,.1,'sine',.04),90);}
  tEv('assembly_dock',{id:flight.id,order:flight.order,w:flight.text,route:flight.route,
    attached:attachedReplyCount(),duration_ms:flight.duration});
}

function launchAssembly(word,sourceX,sourceY){
  if(!g||!word||word.isDecoy||word.order>=g.sentence.length)return;
  updateHud();
  const wrap=$('wrap'),wrapRect=wrap.getBoundingClientRect(),target=$('assembly-target')||$('reply-rail');
  const targetRect=target&&target.getBoundingClientRect?target.getBoundingClientRect():$('prompt').getBoundingClientRect();
  const tx=targetRect.left-wrapRect.left+Math.max(1,targetRect.width/2),ty=targetRect.top-wrapRect.top+targetRect.height/2;
  const railRoute=g.variant==='A'||(g.variant==='C'&&word.order%2===0);
  const route=railRoute?'direct_rail_slam':'core_link',duration=railRoute?380:560;
  const core=signalCore(),id=++g.assemblySeq;
  const el=document.createElement('div');el.className='assembly-flight '+(railRoute?'a':'b');el.textContent=word.text;
  el.style.left=sourceX+'px';el.style.top=sourceY+'px';
  el.style.setProperty('--dx',(tx-sourceX)+'px');el.style.setProperty('--dy',(ty-sourceY)+'px');
  el.style.setProperty('--mx',(core.x-sourceX)+'px');el.style.setProperty('--my',(core.y-sourceY)+'px');
  el.style.setProperty('--flight-ms',duration+'ms');wrap.appendChild(el);
  const flight={id,order:word.order,text:word.text,itemId:g.item.id,route,duration,startedAt:performance.now(),sourceX,sourceY,targetX:tx,targetY:ty,el};
  g.assemblyFlights.push(flight);
  if(!railRoute){addPulse(core.x,core.y,70,'#5ee6df',.46);spawnParts(core.x,core.y,7,'#b5fffa',80);}
  tEv('assembly_launch',{id,order:word.order,w:word.text,route,duration_ms:duration,
    source:[roundTrace(sourceX),roundTrace(sourceY)],via:railRoute?null:[roundTrace(core.x),roundTrace(core.y)],
    target:[roundTrace(tx),roundTrace(ty)]});
  setTimeout(()=>dockAssembly(id),duration);
}

function banner(text, gold){
  const b = document.createElement('div');
  b.className = 'gbanner' + (gold ? ' gold' : '');
  b.textContent = text; $('wrap').appendChild(b);
  const id = ++traceBannerSeq;
  activeTraceBanners.set(id, { id, text, gold: !!gold, el: b });
  tEv('banner_on', { id, text, gold: !!gold });
  setTimeout(()=>{
    tEv('banner_off', { id });
    activeTraceBanners.delete(id);
    b.remove();
  }, 950);
}
function shake(){
  const w = $('wrap');
  w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
}
function spawnParts(x, y, n, color, spd){
  for (let i = 0; i < n; i++){
    const a = Math.random()*Math.PI*2, v = spd*(0.4 + Math.random());
    g.parts.push({ x, y, vx: Math.cos(a)*v, vy: Math.sin(a)*v, life: .5 + Math.random()*.3, t: 0, color });
  }
}
function popText(x, y, text, color){
  let stackedY=y;
  for(let guard=0;guard<8&&g.parts.some(p=>p.text&&p.t<p.life&&Math.abs(p.x-x)<190&&Math.abs(p.y-stackedY)<19);guard++)stackedY-=20;
  g.parts.push({ x, y:stackedY, vx: 0, vy: -60, life: .8, t: 0, color, text });
}
function showConfirmFeedback(word,correct){
  if(!word)return;
  const now=performance.now(),kind=correct?'correct':word.isDecoy?'grammar':'order';
  g.confirmFlash={x:wordVisualX(word,now)+word.w/2,y:wordVisualY(word,now)+word.h/2,at:now,life:.24,correct:!!correct,kind};
  g.freeze=Math.max(g.freeze,.05);
  tEv('confirm_feedback',{order:word.order,w:word.text,correct:!!correct,kind,freeze_ms:50,scene:traceScene(now)});
}

function flashScore(kind){
  const bank=$('score-bank');
  bank.classList.remove('score-gain','score-loss'); void bank.offsetWidth;
  bank.classList.add(kind==='loss'?'score-loss':'score-gain');
  setTimeout(()=>bank.classList.remove('score-gain','score-loss'),360);
}
function scoreMoteTarget(variant){
  const current={x:Math.max(90,W*.27),y:8};
  if(variant==='B')return current;
  try{
    const canvasRect=$('cv').getBoundingClientRect(),bankRect=$('score-bank').getBoundingClientRect();
    const canvasWidth=canvasRect.width||W,bankWidth=bankRect.width||(bankRect.right-bankRect.left);
    const x=bankRect.left+bankWidth/2-canvasRect.left;
    if(Number.isFinite(x)&&bankWidth>0&&bankWidth<canvasWidth*.6){
      return{x:Math.max(18,Math.min(W-18,x)),y:8};
    }
  }catch(e){}
  return current;
}
function awardScore(points,x,y,reason){
  points=Math.max(0,Math.round(points||0));
  if(!points) return 0;
  g.score+=points;
  const count=Math.max(3,Math.min(9,Math.ceil(points/55)));
  const target=scoreMoteTarget(g.variant);
  for(let i=0;i<count;i++) g.scoreMotes.push({
    x:(Number.isFinite(x)?x:W/2)+(Math.random()*20-10), y:Number.isFinite(y)?y:H/2,
    sx:Number.isFinite(x)?x:W/2, sy:Number.isFinite(y)?y:H/2,
    tx:target.x, ty:target.y, t:-i*.035, life:.48+Math.random()*.12, value:points/count, final:i===count-1,
  });
  while(g.score>=g.scoreMilestone){
    const reached=g.scoreMilestone;
    g.scoreTier++; g.scoreMilestone+=SCORE_STEP;
    const heatBefore=(g.heat&&g.heat.totalMass)||0;
    const cleared=endHeatVolley('score_break');
    const thermal=triggerThermalClear('score_break',.88);
    addPulse(g.ship.x,H-34,Math.max(W,H)*.65,'#f0bd67',.62);
    banner('SCORE BREAK ' + reached + ' · THERMAL BREAK',true);
    tEv('score_break',{ reached,tier:g.scoreTier,cleared,shield_gained:false,heat_before:roundHeat(heatBefore),
      clear_kind:thermal.kind,heat_integral:roundHeat(g.heat.totalMass||0) });
    sfx.up(); buzz([20,28,45]);
  }
  checkExtraLife();
  if(g.score>g.best){ g.best=g.score; localStorage.setItem('shooter2_best_'+g.craft,g.best); }
  tEv('score_gain',{ points,reason:reason||'combat',score:g.score,x:roundTrace(x),y:roundTrace(y),
    target_mode:g.variant==='B'?'legacy_fixed':'hud_bank',target_x:roundTrace(target.x),target_y:roundTrace(target.y) });
  updateHud();
  return points;
}
function loseScore(points,x,y,reason){
  const before=g.score;
  g.score=Math.max(0,g.score-Math.max(0,Math.round(points||0)));
  const lost=before-g.score;
  g.scoreDisplay=Math.min(g.scoreDisplay,g.score);
  flashScore('loss');
  spawnParts(Number.isFinite(x)?x:W*.27,Number.isFinite(y)?y:12,Math.max(5,Math.min(14,Math.ceil(points/25))),'#f08b8b',130);
  tEv('score_loss',{ requested:points,lost,reason:reason||'wrong',score:g.score });
  updateHud();
  return lost;
}

function equivalentTarget(word){
  if (!word || word.order === g.idx) return word;
  const target = g.words.find(w => !w.resolved && w.order === g.idx);
  if (!target || choiceIdentity(target.text) !== choiceIdentity(word.text)) return word;
  const oldOrder = word.order;
  word.order = target.order;
  target.order = oldOrder;
  const oldDecoy = word.isDecoy;
  word.isDecoy = target.isDecoy;
  target.isDecoy = oldDecoy;
  tEv('equivalent_swap', { text:word.text, selected:oldOrder, target:g.idx });
  return word;
}

