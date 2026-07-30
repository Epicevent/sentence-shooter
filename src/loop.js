function frame(now){
  if (!g) return;
  const dt = Math.min(0.05, (now - g.lastT)/1000); g.lastT = now;
  if (!g.over){
    if (!g.viewportPaused) update(dt);
    draw();
    traceAcc += dt;
    if (traceAcc >= 0.125){ traceAcc %= 0.125; traceSample(g.eff || g.speed); }
  }
  requestAnimationFrame(frame);
}

function update(dt){
  if (g.viewportPaused) return;
  if (g.freeze > 0){ g.freeze -= dt; return; }   // hit-stop
  for (const s of g.stars){ s.y += s.v*dt; if (s.y > H){ s.y = -2; s.x = Math.random()*W; } }
  for(const w of(g.incomingWords||[]))w.y=Math.min(w.targetY,w.y+155*dt);
  g.wordT += dt;
  const siege = true, rules = variantRules(g.variant);
  const eff = g.speed + Math.min(rules.hesitationCap,g.wordT*rules.hesitationAccel);
  g.eff = eff;
  const now = performance.now(), currentTarget=g.words.find(w=>!w.resolved&&w.order===g.idx);
  const descentActive = now >= (g.waveGraceUntil || 0) && !carrierBusy() && !(currentTarget&&now<(currentTarget.sweepPauseUntil||0));
  const moveDir = (moveInput.right?1:0)-(moveInput.left?1:0),shipBeforeX=g.ship.x;
  if (moveDir){
    g.ship.x = Math.max(16,Math.min(W-16,g.ship.x+moveDir*330*dt));
    g.ship.manualUntil = now+180;
  }
  if(g.cargo){
    const q=Math.max(0,Math.min(1,(now-g.cargo.capturedAt)/g.cargo.captureLife)),ease=1-Math.pow(1-q,3);
    g.cargo.x=g.cargo.sourceX+(g.ship.x-g.cargo.sourceX)*ease;g.cargo.y=g.cargo.sourceY+((H-54)-g.cargo.sourceY)*ease;
    if(q>=1&&!g.cargo.attached){g.cargo.attached=true;tEv('cargo_attached',{order:g.cargo.order,x:roundTrace(g.ship.x),y:roundTrace(H-54)});}
    dockCarrierCargo();
  }
  if((isPhantom()||isBulwark())&&g.combatStarted&&now>=(g.waveGraceUntil||0)){
    g.craftFireT-=dt;
    if(g.craftFireT<=0){spawnCraftPressureRound(isPhantom()?'phantom_pressure':'bulwark_pressure');g.craftFireT=isPhantom()?1.18:1.48;}
  }
  for(const line of(g.counterLines||[]))line.t+=dt;
  const expiredLines=(g.counterLines||[]).filter(line=>line.t>=line.life);
  for(const line of expiredLines)tEv('counter_line_end',{id:line.id,reason:'expired',charges:line.charges});
  g.counterLines=(g.counterLines||[]).filter(line=>line.t<line.life&&line.charges>0);
  for(const absorb of(g.phantomAbsorbs||[]))absorb.t+=dt;
  g.phantomAbsorbs=(g.phantomAbsorbs||[]).filter(absorb=>absorb.t<absorb.life);
  for(const shot of(g.counterShots||[])){shot.t+=dt;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;}
  g.counterShots=(g.counterShots||[]).filter(shot=>shot.t<shot.life&&shot.y>DUST_TOP-40);
  const movedPx=Math.abs(g.ship.x-shipBeforeX);
  if(movedPx>.25&&!isStormTrial())castWakeFromMovement(shipBeforeX,g.ship.x,dt,false);
  else g.wakeDropT=Math.min(g.wakeDropT,.04);
  g.visualPhase += dt*.9;
  const deadline = H - 64, rawStep = descentActive && siege ? eff * dt : 0;
  const bankSpend = siege ? Math.min(rawStep,g.recoilBank || 0) : 0;
  if (bankSpend){ g.recoilBank -= bankSpend; updateReserveHud(); }
  const fullStep = rawStep-bankSpend;
  const target = currentTarget;
  if (target && siege){
    if (!Number.isFinite(target.threatY)) target.threatY = target.y;
    target.threatY += fullStep;
  }
  const future = g.words.filter(w => !w.resolved && w.order !== g.idx);
  const clearance = wingHoldClearance();
  const holdBottom = deadline - clearance;
  const futureRoom = future.length
    ? Math.min(...future.map(w => holdBottom - (w.y + w.h)))
    : fullStep;
  // Every live word shares one visible formation step, so stopping cannot identify the answer
  // or let the target cross another block. The target's threat clock keeps descending invisibly.
  const formationStep = siege ? Math.max(0, Math.min(fullStep, futureRoom)) : 0;
  for (const w of g.words){
    if (w.resolved) w.y += fullStep;
    else if (siege){ w.y += formationStep; if (w.order === g.idx) w.holding = false; }
    else w.holding = false;
    if (w.flash > 0) w.flash -= dt;
    if (w.err > 0) w.err -= dt;
    if (w.heatPulse > 0) w.heatPulse -= dt;
    if (w.resolved) continue;                    // fatal damage is committed; this shell can no longer hurt the player
    if (!siege){ w.holding = false; continue; }
    if (w.order !== g.idx){
      const holding = w.y + w.h >= holdBottom - 0.01;
      if (holding && !w.holding){
        tEv('wing_hold', { order:w.order, w:w.text, y:roundTrace(w.y),
          clearance:roundTrace(clearance), target:g.idx, effect:'hold_position' });
        tone(90, 70, .08, 'sine', .04);
      }
      w.holding = holding;
      continue;
    }
    if ((Number.isFinite(w.threatY) ? w.threatY : w.y) + w.h >= deadline){
      loseLife(w); return;
    }
  }
  if (g.words.some(w=>!w.settled)){
    g.heatEmitT -= dt;
    if(g.heatEmitT<=0){
      const sources=g.words.filter(w=>!w.settled);
      const source=sources[(g.heatSourceCursor=(g.heatSourceCursor||0)+1)%sources.length];
      spawnDustFromWord(source);
      g.heatEmitT=Math.max(.28,DUST_SPAWN_INTERVAL-g.solved*.008);
      g.heatEmitCount=(g.heatEmitCount||0)+1;
      if(g.heatEmitCount%12===0)tEv('heat_sample',{order:source.order,y:roundTrace(wordVisualY(source)),
        active_tracers:g.heat.particles.reduce((n,p)=>n+(p.active?1:0),0),heat_integral:roundHeat(g.heat.totalMass)});
    }
  }
  updateDust(dt,now);
  updateHeatCombat(dt);
  if(g.over)return;
  for(const shot of (g.escortShots||[])){
    shot.t=(shot.t||0)+dt; shot.x+=shot.vx*dt; shot.y+=shot.vy*dt;
  }
  g.escortShots=(g.escortShots||[]).filter(shot=>shot.t<(shot.life||.42));
  for(const mote of (g.scoreMotes||[])){
    const beforeT=mote.t;
    mote.t+=dt;
    const q=Math.max(0,Math.min(1,mote.t/mote.life)), ease=1-Math.pow(1-q,3);
    mote.x=mote.sx+(mote.tx-mote.sx)*ease;
    mote.y=mote.sy+(mote.ty-mote.sy)*ease-Math.sin(Math.PI*q)*42;
    if(beforeT<mote.life && mote.t>=mote.life && !mote.banked){
      mote.banked=true;
      g.scoreDisplay=Math.min(g.score,(g.scoreDisplay||0)+mote.value);
      if(mote.final) flashScore('gain');
    }
  }
  g.scoreMotes=(g.scoreMotes||[]).filter(mote=>mote.t<mote.life);
  if(!(g.scoreMotes||[]).length && Math.abs(g.score-(g.scoreDisplay||0))<1) g.scoreDisplay=g.score;
  const painted=Math.round(g.scoreDisplay||0);
  if(painted!==g.lastScorePaint){ g.lastScorePaint=painted; updateHud(); }
  // Aiming never steers on desktop; arrow/touch movement remains independent of the lock.
  spawnMissiles(dt);
  for (const m of g.missiles){
    const t = m.target;
    if (!t || !g.words.includes(t)){ m.y += -560*dt; m.dead = m.y < -20; continue; }
    const renderX = wordVisualX(t), renderY = wordVisualY(t), tx = renderX + t.w/2, ty = renderY + t.h/2;
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, 7*dt);
    const speed=m.speed||missileSpeed(m.level||1);
    m.vx += (dx/d*speed - m.vx) * k;
    m.vy += (dy/d*speed - m.vy) * k;
    m.x += m.vx*dt; m.y += m.vy*dt;
    if (Math.random() < 0.6) g.parts.push({ x: m.x, y: m.y, vx: 0, vy: 30, life: .25, t: 0, color: '#5a7a5a' });
    if (m.x >= renderX && m.x <= renderX+t.w && m.y >= renderY && m.y <= renderY+t.h){
      m.dead = true;
      t.flash = .12;
      t.hitAt=performance.now(); t.hitDir=m.vx>=0?1:-1;
      spawnParts(m.x, m.y, 7, '#aef0ae', 105);
      addPulse(m.x,m.y,20,'#aef0ae',.16);
      if (m.letter){    // the struck letter breaks off and tumbles away
        g.parts.push({ x: m.x, y: renderY, vx: (Math.random()*2-1)*120, vy: -140, life: .7, t: 0, color: '#d7ba7d', text: m.letter });
      }
      if (m.dmg > 0){
        t.hp = Math.max(0, t.hp - m.dmg);
        tone(300, 80, .08, 'sawtooth', .05);
        if (t.hp <= 0){ g.freeze = 0.05; settleWord(t); } // presentation settles later; hit-stop still makes it land
      }
    }
  }
  g.missiles = g.missiles.filter(m => !m.dead && m.y > -40 && m.x > -40 && m.x < W+40);
  // Temperature is harmless. Only phase-changed red arrows and the descending
  // target are danger; there is no invisible density collision.
  g.danger = (g.heatArrows||[]).some(a=>!a.dead&&a.age>=a.arm) || (g.words.some(w => w.order === g.idx &&
    (Number.isFinite(w.threatY) ? w.threatY : w.y) > H - 200));
  if (g.danger){
    g.beatT -= dt;
    if (g.beatT <= 0){ g.beatT = 0.7; tone(85, 55, .14, 'sine', .16); }
  } else g.beatT = 0;
  for (const p of g.parts){ p.t += dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += (p.text ? 0 : 140)*dt; }
  g.parts = g.parts.filter(p => p.t < p.life);
  for(const pulse of g.pulses){
    pulse.t+=dt;
    const q=Math.max(0,Math.min(1,pulse.t/pulse.life));
    pulse.r=4+(pulse.maxR-4)*(1-Math.pow(1-q,3));
  }
  g.pulses=g.pulses.filter(p=>p.t<p.life);
}

