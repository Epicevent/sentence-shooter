function threatLineY(){
  const deadline = H - 64;
  if (!g || !g.words) return deadline;
  const target = g.words.find(w => !w.resolved && w.order === g.idx);
  if (!target || !Number.isFinite(target.threatY)) return deadline;
  return Math.max(34, deadline - Math.max(0, target.threatY - target.y));
}

function signalCore(){
  if (W < 520){
    const core={ x:W/2, y:H-94, r:26, hidden:false };
    const live=g && g.words ? g.words.filter(w=>!w.settled) : [];
    const maxBottom=live.length ? Math.max(...live.map(w=>wordVisualY(w)+w.h)) : -Infinity;
    // The core yields if viewport pressure ever consumes the mobile gap; it must
    // never cover a choice, while spokes and the SIGNAL label stay readable.
    core.hidden=maxBottom+8>core.y-core.r-5;
    return core;
  }
  return { x:W/2, y:Math.min(H-125,Math.max(335,H*.64)), r:48 };
}

function drawStormAt(field,drawX){
  const q=Math.max(0,Math.min(1,field.t/field.life)),fade=1-q,spin=field.spin+field.t*(1.5+field.rpm*.72);
  ctx.save();ctx.translate(drawX,field.y);
  const frost=ctx.createRadialGradient(0,0,4,0,0,field.radius);
  frost.addColorStop(0,'rgba(232,255,255,'+(.26*fade)+')');
  frost.addColorStop(.42,'rgba(121,232,226,'+(.16*fade)+')');
  frost.addColorStop(1,'rgba(83,108,193,0)');
  ctx.fillStyle=frost;ctx.beginPath();ctx.arc(0,0,field.radius,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.rotate(spin);ctx.strokeStyle='#79e8e2';ctx.lineWidth=2.4;ctx.globalAlpha=.7*fade;
  for(const scale of[.38,.68,.94]){
    ctx.beginPath();ctx.arc(0,0,field.radius*scale,-Math.PI*.18,Math.PI*.72);ctx.stroke();
    ctx.rotate(Math.PI*.72);
  }
  ctx.strokeStyle='#e8ffff';ctx.lineWidth=1.4;ctx.globalAlpha=.78*fade;
  for(let flake=0;flake<10;flake++){
    const a=flake*Math.PI*.2+field.id*.73,r=field.radius*(.18+.7*((flake*37+field.id*11)%97)/97);
    const x=Math.cos(a)*r,y=Math.sin(a)*r*.72,len=7+field.rpm*2;
    ctx.beginPath();ctx.moveTo(x-len*.55,y-len*.25);ctx.lineTo(x+len*.55,y+len*.25);ctx.stroke();
  }
  ctx.restore();
  const dir=Math.sign(field.direction||field.vx||0);
  if(dir){
    const ax=dir*field.radius*.68,ay=-field.radius*.14;
    ctx.globalAlpha=.95*fade;ctx.strokeStyle='#e8ffff';ctx.fillStyle='#b5fffa';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(ax-dir*28,ay);ctx.lineTo(ax,ay);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax-dir*13,ay-9);ctx.lineTo(ax-dir*13,ay+9);ctx.closePath();ctx.fill();
  }
  ctx.globalAlpha=.95*fade;ctx.fillStyle='#e8ffff';ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();ctx.restore();
}

function drawBigWingSweep(sweep){
  const q=Math.max(0,Math.min(1,sweep.t/sweep.life)),fade=Math.min(1,(1-q)*2.4),dir=sweep.direction||1;
  ctx.save();ctx.translate(sweep.x,sweep.y);ctx.rotate(dir*.08);ctx.globalCompositeOperation='screen';
  ctx.globalAlpha=.18*fade;ctx.fillStyle='#73d5ee';ctx.beginPath();ctx.ellipse(0,18,SWEEP_CORRIDOR*.72,82,0,0,Math.PI*2);ctx.fill();
  const trail=ctx.createLinearGradient(0,18,0,145);trail.addColorStop(0,'rgba(232,255,255,.78)');trail.addColorStop(1,'rgba(115,213,238,0)');
  ctx.globalAlpha=.8*fade;ctx.fillStyle=trail;ctx.beginPath();ctx.moveTo(-22,15);ctx.lineTo(-48,138);ctx.lineTo(0,92);ctx.lineTo(48,138);ctx.lineTo(22,15);ctx.closePath();ctx.fill();
  ctx.globalAlpha=.98*fade;ctx.shadowColor='#9fe9fb';ctx.shadowBlur=28;ctx.fillStyle='#dffcff';ctx.strokeStyle='#fff4b8';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,-58);ctx.lineTo(-22,-14);ctx.lineTo(-76,12);ctx.lineTo(-58,30);ctx.lineTo(-17,22);
  ctx.lineTo(0,52);ctx.lineTo(17,22);ctx.lineTo(58,30);ctx.lineTo(76,12);ctx.lineTo(22,-14);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#5ee6df';ctx.beginPath();ctx.moveTo(0,-43);ctx.lineTo(-9,5);ctx.lineTo(0,17);ctx.lineTo(9,5);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#e8ffff';ctx.lineWidth=4;for(const x of[-46,-18,18,46]){ctx.beginPath();ctx.moveTo(x,18);ctx.lineTo(x,55);ctx.stroke();}
  ctx.restore();
}

function draw(){
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = g.variant === 'A' ? '#151d35' : '#171735';
  for (const s of g.stars) ctx.fillRect(s.x, s.y, 2, 2);
  // Heat is a continuous amber fog sampled from the authoritative grid. The
  // invisible tracer pool exists only to seed the wrong-answer phase change.
  // Only the explicit red arrow phase below is a projectile layer.
  {
    const field=g.heat;
    drawHeatFog(field);
    for(let i=0;i<field.floorBins.length;i++){
      const heat=field.floorBins[i],hot=Math.max(0,Math.min(1,heat/FLOOR_CRITICAL));
      ctx.globalAlpha=.025+hot*.17;ctx.fillStyle=hot>.55?'#f0bd67':'#5ee6df';
      ctx.fillRect(i*W/field.floorBins.length,H-16,W/field.floorBins.length+1,16);
    }
    for(const arrow of(g.heatArrows||[])){
      if(arrow.dead)continue;
      drawHeatThreat(arrow);
    }
    ctx.shadowBlur=0;
    for(const shot of(g.interceptorShots||[])){
      const d=Math.hypot(shot.vx,shot.vy)||1;ctx.globalAlpha=.95;ctx.strokeStyle='#9fe9fb';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(shot.x,shot.y);ctx.lineTo(shot.x-shot.vx/d*14,shot.y-shot.vy/d*14);ctx.stroke();
    }
    ctx.globalAlpha=1;
    for(const wave of(g.pressureWaves||[])){
      const q=Math.max(0,Math.min(1,wave.t/wave.life));
      ctx.globalAlpha=(1-q)*.7;ctx.strokeStyle='#9fe9fb';ctx.lineWidth=2+wave.guns*.5;
      ctx.beginPath();ctx.moveTo(wave.x-wave.width,wave.y);ctx.quadraticCurveTo(wave.x,wave.y-10,wave.x+wave.width,wave.y);ctx.stroke();
      ctx.globalAlpha=(1-q)*.18;ctx.fillStyle='#73d5ee';ctx.fillRect(wave.x-wave.width,wave.y-10,wave.width*2,20);
    }
    for(const burst of(g.quenchBursts||[])){
      const q=Math.max(0,Math.min(1,burst.t/burst.life)),fade=1-q;
      ctx.save();ctx.globalAlpha=.82*fade;ctx.strokeStyle='#e8ffff';ctx.shadowColor='#79e8e2';ctx.shadowBlur=18;
      ctx.lineWidth=4+8*fade;ctx.beginPath();ctx.arc(burst.x,burst.y,burst.r,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=.12*fade;ctx.fillStyle='#79e8e2';ctx.beginPath();ctx.arc(burst.x,burst.y,burst.r,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    ctx.globalAlpha=1;ctx.lineWidth=1;
  }
  if((g.incomingWords||[]).length){
    ctx.save();ctx.font='13px "Cascadia Mono", Consolas, monospace';ctx.textBaseline='middle';
    for(const w of g.incomingWords){
      const visible=Math.max(0,Math.min(1,(w.y+36)/80));
      ctx.globalAlpha=.16+.34*visible;ctx.fillStyle='rgba(36,46,54,.82)';ctx.strokeStyle='rgba(151,181,190,.58)';ctx.lineWidth=1;
      ctx.fillRect(w.x,w.y,w.w,w.h);ctx.strokeRect(w.x,w.y,w.w,w.h);
      ctx.fillStyle='#8ca7ad';ctx.fillText(w.text,w.x+11,w.y+w.h/2+1);
    }
    ctx.globalAlpha=.75;ctx.fillStyle='#9fb9c0';ctx.font='9px "Cascadia Mono", Consolas, monospace';
    ctx.fillText((g.preloadedItem&&g.preloadedItem.boss?'BOSS INBOUND':'NEXT WAVE INBOUND'),10,116);ctx.restore();
  }
  if(g.confirmFlash){
    const age=(performance.now()-g.confirmFlash.at)/1000;
    if(age<g.confirmFlash.life){
      const q=age/g.confirmFlash.life,fade=1-q,r=18+q*38;
      ctx.save();ctx.globalCompositeOperation='screen';ctx.translate(g.confirmFlash.x,g.confirmFlash.y);
      ctx.globalAlpha=.3*fade;ctx.fillStyle=g.confirmFlash.correct?'#9fe9fb':'#ff5a70';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.95*fade;ctx.strokeStyle=g.confirmFlash.correct?'#e8ffff':'#ff6e7f';ctx.lineWidth=2+5*fade;
      ctx.beginPath();ctx.arc(0,0,r*.72,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<8;i++){const a=i*Math.PI/4,len=22+q*24;ctx.beginPath();ctx.moveTo(Math.cos(a)*9,Math.sin(a)*9);ctx.lineTo(Math.cos(a)*len,Math.sin(a)*len);ctx.stroke();}
      ctx.restore();
    }
  }
  ctx.textBaseline = 'middle';
  ctx.font = '15px "Cascadia Mono", Consolas, monospace';
  const deadlineY = H - 64, pressureY = threatLineY();
  {
    const core=signalCore(), coreX=core.x, coreY=core.y;
    const focusState=focusSelection(g.typePrefix), focusSet=new Set(focusState.candidates);
    for(const w of g.words){
      const wx=wordVisualX(w)+w.w/2, wy=wordVisualY(w)+w.h/2, focused=focusSet.has(w), incoming=w.resolved;
      ctx.strokeStyle=incoming?'rgba(94,230,223,.62)':focused ? (focusState.chosen?'rgba(94,230,223,.85)':'rgba(189,184,255,.75)') : 'rgba(104,100,170,.16)';
      ctx.lineWidth=focused||incoming?2:1; ctx.setLineDash(focused||incoming?[]:[4,8]);
      ctx.beginPath(); ctx.moveTo(coreX,coreY); ctx.lineTo(wx,wy); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth=1;
    if(!core.hidden){
      const ratio=Math.max(0,Math.min(1,(deadlineY-pressureY)/Math.max(1,H-130)));
      ctx.strokeStyle='rgba(104,100,170,.35)'; ctx.lineWidth=9;
      ctx.beginPath(); ctx.arc(coreX,coreY,core.r,-Math.PI*.75,Math.PI*.75); ctx.stroke();
      ctx.strokeStyle=ratio>.7?'#d16969':'#5ee6df';
      ctx.beginPath(); ctx.arc(coreX,coreY,core.r,-Math.PI*.75,-Math.PI*.75+Math.PI*1.5*ratio); ctx.stroke();
      ctx.lineWidth=1; ctx.fillStyle='rgba(12,12,31,.92)';
      ctx.beginPath(); ctx.arc(coreX,coreY,core.r-10,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(189,184,255,.75)'; ctx.stroke();
      ctx.fillStyle=g.typePrefix?'#5ee6df':(g.variant==='B'?'#9f9af4':'#73d5ee'); ctx.font='11px "Cascadia Mono", Consolas, monospace';
      const stormActive=isStormTrial()&&(g.wakeNodes||[]).length>0;
      const stormReady=isStormTrial()&&(g.stormCharge||0)>=STORM_READY_HITS;
      const coreText=g.typePrefix?g.typePrefix.toUpperCase():stormActive?(g.experiment==='B'?'STEER':'LOCKED'):stormReady?'SWEEP':'COOL';
      ctx.fillText(coreText,coreX-ctx.measureText(coreText).width/2,coreY-3);
      const resourceRatio=isStormTrial()?Math.max(0,Math.min(1,(g.stormCharge||0)/STORM_READY_HITS))
        :Math.max(0,Math.min(1,((g.escortAmmo||0)/MAX_WING_UNITS+(g.coolerLevel||0)/9)/2));
      ctx.strokeStyle=resourceRatio>=1?'#d7ba7d':(g.variant==='B'?'#5ee6df':'#73d5ee'); ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(coreX,coreY,Math.max(8,core.r-7),-Math.PI/2,-Math.PI/2+Math.PI*2*resourceRatio); ctx.stroke();
      ctx.lineWidth=1; ctx.fillStyle=resourceRatio>=1?'#d7ba7d':(g.variant==='B'?'rgba(159,154,244,.8)':'rgba(115,213,238,.85)');
      ctx.font='9px "Cascadia Mono", Consolas, monospace';
      const resourceText=isStormTrial()
        ?stormActive?(g.experiment==='B'?'◀ WAKE ▶':'WAKE ACTIVE'):stormReady?'◀ SWEEP ▶':'SWEEP '+(g.stormCharge||0)+'/'+STORM_READY_HITS
        :'W'+(g.wingUnits||0)+' · S'+(g.coolerLevel||0);
      ctx.fillText(resourceText,coreX-ctx.measureText(resourceText).width/2,coreY+11);
    }
    ctx.strokeStyle='rgba(209,105,105,.35)'; ctx.setLineDash([6,6]);
    ctx.beginPath(); ctx.moveTo(0,pressureY); ctx.lineTo(W,pressureY); ctx.stroke(); ctx.setLineDash([]);
  }
  if(hasStorm(g.variant)){
    for(const field of (g.wakeNodes||[])){
      const copies=[field.x];
      if(field.x-field.radius<0)copies.push(field.x+W);
      if(field.x+field.radius>W)copies.push(field.x-W);
      for(const drawX of copies)drawStormAt(field,drawX);
    }
    ctx.globalAlpha=1; ctx.lineWidth=1; ctx.font='15px "Cascadia Mono", Consolas, monospace';
  }
  for(const pulse of g.pulses){
    const q=Math.max(0,Math.min(1,pulse.t/pulse.life));
    ctx.globalAlpha=(1-q)*.82; ctx.strokeStyle=pulse.color; ctx.lineWidth=1+4*(1-q);
    ctx.beginPath(); ctx.arc(pulse.x,pulse.y,pulse.r,0,Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha=1; ctx.lineWidth=1;
  ctx.font = '15px "Cascadia Mono", Consolas, monospace';
  ctx.textBaseline = 'middle';
  const danger = !!g.danger;
  if (danger){   // red vignette pulses with the heartbeat
    const a = 0.05 + 0.05 * Math.abs(Math.sin(performance.now()/180));
    const grad = ctx.createLinearGradient(0, H-220, 0, H);
    grad.addColorStop(0, 'rgba(209,105,105,0)');
    grad.addColorStop(1, 'rgba(209,105,105,' + a + ')');
    ctx.fillStyle = grad;
    ctx.fillRect(0, H-220, W, 220);
  }
  const drawFocus=focusSelection(g.typePrefix), focusSet=new Set(drawFocus.candidates);
  for (const w of g.words){
    const wx = wordVisualX(w), wy = wordVisualY(w);
    const isNext = !w.resolved && w.order === g.idx;
    const incoming = w.resolved && !w.settled;
    const dmg = w.maxhp - w.hp;
    const focused=focusSet.has(w), uniqueFocus=focused && !!drawFocus.chosen;
    ctx.globalAlpha = 1;
    if(!w.settled){
      const floorNear=Math.max(0,Math.min(1,(wy-DUST_TOP)/Math.max(1,H-DUST_TOP-80)));
      const shimmer=.2+.25*floorNear+.22*Math.max(0,(w.heatPulse||0)/.18);
      ctx.globalAlpha=shimmer;ctx.strokeStyle='#f0bd67';ctx.lineWidth=1+floorNear*1.4;
      ctx.strokeRect(wx-3-floorNear*2,wy-3-floorNear*2,w.w+6+floorNear*4,w.h+6+floorNear*4);
      for(let mote=0;mote<2;mote++){
        const phase=performance.now()/650+(w.phase||0)+mote*2.7;
        ctx.fillStyle='#ffe49a';ctx.beginPath();ctx.arc(wx+w.w*(.28+.42*mote)+Math.sin(phase)*5,wy-5-Math.abs(Math.cos(phase))*7,1.3,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
    }
    ctx.fillStyle = focused ? (g.variant==='B'?'#1b1b42':'#102f3b') : w.err > 0 ? '#2a1010' : w.flash > 0 ? '#1e321e' : '#0b110b';
    ctx.strokeStyle = focused ? (uniqueFocus?'#5ee6df':(g.variant==='B'?'#bdb8ff':'#73d5ee')) : w.err > 0 ? '#d16969' : incoming ? '#5ee6df' : dmg > 0 ? '#6fae6f' : 'rgba(240,189,103,.62)';
    ctx.lineWidth = focused ? 3 : incoming || dmg > 0 ? 2 : 1;
    ctx.fillRect(wx, wy, w.w, w.h);
    ctx.strokeRect(wx, wy, w.w, w.h);
    if((w.rage||0)>0 && !w.resolved){
      const ragePulse=.55+.35*Math.abs(Math.sin(performance.now()/110));
      ctx.save(); ctx.globalAlpha=ragePulse; ctx.strokeStyle='#ff6e7f'; ctx.lineWidth=2+w.rage*.6;
      ctx.shadowColor='#d16969'; ctx.shadowBlur=8+w.rage*4;
      ctx.strokeRect(wx-3-w.rage,wy-3-w.rage,w.w+6+w.rage*2,w.h+6+w.rage*2);
      ctx.restore();
      ctx.fillStyle='#ff6e7f'; ctx.font='9px "Cascadia Mono", Consolas, monospace';
      ctx.fillText('RAGE '+w.rage,wx+w.w-ctx.measureText('RAGE '+w.rage).width,wy-9);
      ctx.font='15px "Cascadia Mono", Consolas, monospace';
    }
    if(focused){
      ctx.fillStyle=uniqueFocus?'#5ee6df':(g.variant==='B'?'#bdb8ff':'#73d5ee');
      ctx.font='10px "Cascadia Mono", Consolas, monospace';
      ctx.fillText(uniqueFocus?'TAB':'FOCUS',wx+5,wy-8);
      ctx.font='15px "Cascadia Mono", Consolas, monospace';
    }
    const baseCol = focused && uniqueFocus ? '#f0f3ff' : w.err > 0 ? '#f0b0b0' : (g.variant==='B'?'#dddafb':'#cbe8ef');
    if (isNext && w.consumed > 0){
      const pre = w.text.slice(0, w.consumed), rest = w.text.slice(w.consumed);
      const preW = ctx.measureText(pre).width;
      ctx.fillStyle = '#d7ba7d';
      ctx.fillText(pre, wx + 11, wy + w.h/2 + 1);
      ctx.fillStyle = baseCol;
      ctx.fillText(rest, wx + 11 + preW, wy + w.h/2 + 1);
    } else {
      ctx.fillStyle = baseCol;
      ctx.fillText(w.text, wx + 11, wy + w.h/2 + 1);
    }
    if(incoming){
      const pulse=.45+.45*Math.abs(Math.sin(performance.now()/90));
      ctx.fillStyle='rgba(94,230,223,'+pulse+')';
      ctx.beginPath(); ctx.arc(wx+w.w-8,wy+7,2.2,0,Math.PI*2); ctx.fill();
    }
    if (dmg > 0){
      ctx.strokeStyle = 'rgba(174,240,174,.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx + w.w*0.3, wy); ctx.lineTo(wx + w.w*0.4, wy + w.h*0.6);
      if (dmg > 1){ ctx.moveTo(wx + w.w*0.7, wy + w.h); ctx.lineTo(wx + w.w*0.6, wy + w.h*0.3); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // homing missiles: oriented streaks with glow
  ctx.strokeStyle = g.variant==='B'?'#bdb8ff':'#9fe9fb'; ctx.lineWidth = 2.5;
  ctx.shadowColor = g.variant==='B'?'#bdb8ff':'#9fe9fb'; ctx.shadowBlur = 8;
  for (const m of g.missiles){
    const d = Math.hypot(m.vx, m.vy) || 1;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x - m.vx/d*13, m.y - m.vy/d*13);
    ctx.stroke();
  }
  ctx.shadowBlur = 0; ctx.lineWidth = 1;
  for(const shot of (g.escortShots||[])){
    const d=Math.hypot(shot.vx,shot.vy)||1;
    ctx.strokeStyle=shot.color||'#d7ba7d'; ctx.shadowColor=shot.color||'#d7ba7d'; ctx.shadowBlur=12; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(shot.x,shot.y); ctx.lineTo(shot.x-shot.vx/d*24,shot.y-shot.vy/d*24); ctx.stroke();
  }
  ctx.shadowBlur=0; ctx.lineWidth=1;
  for(const absorb of(g.sweepAbsorbs||[])){
    const q=Math.max(0,Math.min(1,absorb.t/absorb.life)),mx=(absorb.sx+absorb.tx)/2,arcY=Math.min(absorb.sy,absorb.ty)-72;
    const omt=1-q,x=omt*omt*absorb.sx+2*omt*q*mx+q*q*absorb.tx,y=omt*omt*absorb.sy+2*omt*q*arcY+q*q*absorb.ty;
    ctx.save();ctx.globalAlpha=(1-q)*.85;ctx.strokeStyle='#b5fffa';ctx.shadowColor='#79e8e2';ctx.shadowBlur=14;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(absorb.sx,absorb.sy);ctx.quadraticCurveTo(mx,arcY,absorb.tx,absorb.ty);ctx.stroke();
    ctx.fillStyle='#e8ffff';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  for(const sweep of(g.sweeps||[]))drawBigWingSweep(sweep);
  // lock brackets on the current target
  if (g.lock){
    const t = g.lock, tx = wordVisualX(t), ty = wordVisualY(t), c = 7;
    ctx.strokeStyle = '#d7ba7d'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx-4, ty-4+c); ctx.lineTo(tx-4, ty-4); ctx.lineTo(tx-4+c, ty-4);
    ctx.moveTo(tx+t.w+4-c, ty-4); ctx.lineTo(tx+t.w+4, ty-4); ctx.lineTo(tx+t.w+4, ty-4+c);
    ctx.moveTo(tx-4, ty+t.h+4-c); ctx.lineTo(tx-4, ty+t.h+4); ctx.lineTo(tx-4+c, ty+t.h+4);
    ctx.moveTo(tx+t.w+4-c, ty+t.h+4); ctx.lineTo(tx+t.w+4, ty+t.h+4); ctx.lineTo(tx+t.w+4, ty+t.h+4-c);
    ctx.stroke(); ctx.lineWidth = 1;
  }
  const sx = g.ship.x, sy = H - 34;
  if(hasEscort(g.variant)){
    for(const pos of wingPositions()){
      const outer=pos.index>=2,scale=outer?.84:1;
      ctx.save();ctx.globalAlpha=.3;ctx.strokeStyle='#73d5ee';ctx.setLineDash([3,5]);
      ctx.beginPath();ctx.moveTo(sx,sy+2);ctx.lineTo(pos.x,pos.y+4);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      ctx.shadowColor='#73d5ee'; ctx.shadowBlur=16; ctx.fillStyle=outer?'#73d5ee':'#9fe9fb'; ctx.strokeStyle='#fff4b8'; ctx.lineWidth=1.6;
      ctx.beginPath();
      ctx.moveTo(pos.x,pos.y-15*scale);ctx.lineTo(pos.x-14*scale,pos.y+8*scale);ctx.lineTo(pos.x-6*scale,pos.y+5*scale);
      ctx.lineTo(pos.x,pos.y+11*scale);ctx.lineTo(pos.x+6*scale,pos.y+5*scale);ctx.lineTo(pos.x+14*scale,pos.y+8*scale);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // One bright barrel per escort matches its real normal-fire origin. As the
      // formation grows, five spatially distinct muzzle lines become visible.
      ctx.strokeStyle='#e8ffff';ctx.shadowColor='#fff4b8';ctx.shadowBlur=12;ctx.lineWidth=3.5;
      ctx.beginPath();ctx.moveTo(pos.x,pos.y-11*scale);ctx.lineTo(pos.x,pos.y-25*scale);ctx.stroke();
      ctx.fillStyle='#d7ba7d';ctx.globalAlpha=.9;ctx.fillRect(pos.x-2.2,pos.y-28*scale,4.4,4.4);
      ctx.globalAlpha=.75;ctx.fillStyle='#fff4b8';ctx.font='7px "Cascadia Mono", Consolas, monospace';
      ctx.fillText(String(pos.index+1),pos.x-2,pos.y+3);
      ctx.globalAlpha=1;ctx.fillStyle='rgba(215,186,125,'+(0.35+Math.random()*.45)+')';
      ctx.fillRect(pos.x-2,pos.y+10*scale,4,5+Math.random()*5);ctx.restore();
    }
    ctx.shadowBlur=0; ctx.lineWidth=1;
  }
  ctx.globalAlpha = performance.now() < (g.hitInvulnUntil || 0)
    ? (.35 + .35*Math.abs(Math.sin(performance.now()/70))) : 1;
  ctx.shadowColor = g.variant === 'B' ? '#bdb8ff' : '#73d5ee'; ctx.shadowBlur = 14;
  ctx.fillStyle = g.variant === 'B' ? '#bdb8ff' : '#73d5ee';
  ctx.beginPath();
  ctx.moveTo(sx, sy - 14); ctx.lineTo(sx - 11, sy + 10); ctx.lineTo(sx, sy + 4); ctx.lineTo(sx + 11, sy + 10);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(215,186,125,' + (0.4 + Math.random()*0.5) + ')';
  ctx.fillRect(sx - 2, sy + 10, 4, 5 + Math.random()*6);
  ctx.globalAlpha = 1;
  for(const mote of (g.scoreMotes||[])){
    if(mote.t<0) continue;
    const q=Math.max(0,Math.min(1,mote.t/mote.life));
    ctx.globalAlpha=1-q*.25; ctx.fillStyle='#fff4b8'; ctx.shadowColor='#f0bd67'; ctx.shadowBlur=10;
    const size=3+2*(1-q); ctx.save(); ctx.translate(mote.x,mote.y); ctx.rotate(Math.PI/4+q*2); ctx.fillRect(-size/2,-size/2,size,size); ctx.restore();
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;
  for (const p of g.parts){
    const a = 1 - p.t/p.life;
    ctx.globalAlpha = a;
    if (p.text){
      ctx.fillStyle = p.color;
      ctx.font = '13px "Cascadia Mono", Consolas, monospace';
      ctx.fillText(p.text, p.x, p.y);
      ctx.font = '15px "Cascadia Mono", Consolas, monospace';
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
  const flashNow=performance.now();
  if(flashNow<(g.rewardFlashUntil||0)){
    const duration=Math.max(1,(g.rewardFlashUntil||0)-(g.rewardFlashAt||0));
    const q=Math.max(0,Math.min(1,(flashNow-(g.rewardFlashAt||flashNow))/duration)),fade=1-q;
    const fx=g.rewardFlashX||sx,fy=g.rewardFlashY||sy;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle='rgba(220,255,255,'+(.18*fade*fade)+')';ctx.fillRect(0,0,W,H);
    ctx.translate(fx,fy);ctx.strokeStyle='#fff4b8';ctx.shadowColor='#9fe9fb';ctx.shadowBlur=22;ctx.lineWidth=2+5*fade;
    for(let ray=0;ray<16;ray++){
      const a=ray*Math.PI/8,len=32+q*118+(ray%2)*22;
      ctx.globalAlpha=fade*(ray%2?.72:1);ctx.beginPath();ctx.moveTo(Math.cos(a)*10,Math.sin(a)*10);ctx.lineTo(Math.cos(a)*len,Math.sin(a)*len);ctx.stroke();
    }
    ctx.globalAlpha=.95*fade;ctx.lineWidth=8*fade+2;ctx.strokeStyle='#e8ffff';ctx.beginPath();ctx.arc(0,0,16+q*104,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=.55*fade;ctx.lineWidth=3;ctx.strokeStyle='#73d5ee';ctx.beginPath();ctx.arc(0,0,8+q*148,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
}

