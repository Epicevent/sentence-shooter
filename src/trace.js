// ---------- play-trace recorder: whole sessions become bulk learning data ----------
const TRACE = { meta: {}, samples: [], events: [] };
let traceOn = false, traceAcc = 0, traceBannerSeq = 0;
let traceCheckpointSamples = 0, traceCheckpointEvents = 0, traceCheckpointBusy = false, traceCheckpointToken = 0;
const TRACE_CHECKPOINT_ENABLED = !String(location.hostname||'').endsWith('github.io');
const activeTraceBanners = new Map();
function tEv(type, data){
  if (!traceOn) return;
  TRACE.events.push(Object.assign({ t: Math.round(performance.now() - TRACE.meta.started), type }, data || {}));
}
function traceStart(mode){
  for (const b of activeTraceBanners.values()) b.el.remove();
  activeTraceBanners.clear();
  TRACE.meta = {
    started: performance.now(), mode, pipeline: 9, ua: navigator.userAgent.slice(0, 60),
    w: W, h: H, dpr, at: Date.now(), hz: 8, build:BUILD_ID, base_variant:'C', ab_variant:AB_VARIANT, ab_seed:AB_SEED,
    reviewer:AB_CONFIG.reviewer,
    session_id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),
    ab_concept:AB_CONCEPT,
    // Compact scene rows retain enough state to reconstruct/query the changing playfield.
    word_fields: ['order','render_x','render_y','w','h','hp','maxhp','consumed','committed','flags','block_vis','text_vis','banner_cover','alpha','logic_y','recoil_ms','logic_x','rage'],
    missile_fields: ['x','y','vx','vy','target_order','dmg','letter','weapon_level','speed','origin_kind'],
    escort_shot_fields: ['x','y','vx','vy','target_x','target_y'],
    particle_fields: ['x','y','vx','vy','life_ms','age_ms','color','text'],
    pulse_fields: ['x','y','radius','max_radius','life_ms','age_ms','color'],
    pressure_wave_fields: ['id','x','y','width','age_ms','life_ms','guns'],
    quench_burst_fields: ['id','x','y','radius','max_radius','age_ms','life_ms','strength','reason','cells'],
    heat_arrow_fields: ['id','x','y','vx','vy','age_ms','arm_ms','life_ms','heat','silhouette','chill','source_x','source_y'],
    wake_field_fields: ['id','x','y','radius','age_ms','life_ms','rpm','contacts','vx','direction'],
    sweep_fields: ['id','x','y','vx','vy','age_ms','life_ms','corridor','direction','cleared','cooled_cells'],
    sweep_absorb_fields: ['id','source_x','source_y','target_x','target_y','age_ms','life_ms'],
    incoming_word_fields: ['order','render_x','render_y','target_y','w','h','is_decoy','visible'],
    assembly_flight_fields: ['id','order','route','source_x','source_y','target_x','target_y','age_ms','duration_ms'],
    interceptor_fields: ['x','y','vx','vy','target_id','age_ms','life_ms'],
    heat_field_fields: ['tracer_count','integral','floor_local','volley_count','max_temp','sim_steps','step_us','max_step_us'],
    floor_bin_fields: ['left_to_right_local_heat'],
    banner_fields: ['id','text','gold','x','y','w','h','opacity'],
    reward_fields: ['wing_units','wake_nodes','combat_started','combat_armed','normal_origins','storm_power',
      'escort_ammo','storm_charge','reward_flash_ms','experiment','reward_flash_x','reward_flash_y'],
    ui_fields: ['score','weapon_level','built_line','message','game_over'],
    scene_fields: ['i','freeze_ms','danger','viewport_paused','pressure_y','recoil_bank',
      'delivery_ms','cargo_order','dock_x','jam_ms','move_dir','ship','lock','inventory',
      'sync','reward','feedback','words','missiles','escortShots','particles','pulses',
      'heat','floorBins','pressureWaves','quenchBursts','heatArrows','interceptorShots','wakeFields','sweeps','sweepAbsorbs',
      'incomingWords','assemblyFlights','banners','shake','ui'],
  };
  TRACE.samples.length = 0; TRACE.events.length = 0;
  traceCheckpointToken++;
  traceCheckpointSamples = 0; traceCheckpointEvents = 0; traceCheckpointBusy = false;
  traceOn = true; traceAcc = 0;
}
function roundTrace(n){ return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; }
function roundHeat(n){ return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null; }
function rectArea(r){ return Math.max(0, r.w) * Math.max(0, r.h); }
function rectIntersection(a, b){
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}
function visiblePct(r){
  const area = rectArea(r);
  return area ? Math.round(100 * rectIntersection(r, { x: 0, y: 0, w: W, h: H }) / area) : 0;
}
const RECOIL_MS = 520, MIN_PLAY_HEIGHT = 500, MIN_BOSS_HEIGHT = 620;
function minimumPlayHeight(){return g&&g.item&&g.item.boss?MIN_BOSS_HEIGHT:MIN_PLAY_HEIGHT;}
function recoilProgress(w, now){
  if (!Number.isFinite(w.recoilAt)) return 1;
  return Math.max(0, Math.min(1, ((now || performance.now()) - w.recoilAt) / RECOIL_MS));
}
function wordVisualX(w, now){
  now = now || performance.now();
  const p = recoilProgress(w, now);
  let visualX;
  if (p >= 1 || !Number.isFinite(w.recoilFromX)){
    if (g){
      const shift = Math.sin((g.visualPhase || 0) + (w.row || 0)*1.7 + (w.col || 0)*.8) * Math.min(12,W*.018);
      visualX=Math.max(8,Math.min(W-w.w-8,w.x+shift));
    } else visualX=w.x;
  } else if (Number.isFinite(w.recoilRailX)){
    if (p < .2){ const q=1-Math.pow(1-p/.2,3); visualX=w.recoilFromX+(w.recoilRailX-w.recoilFromX)*q; }
    else if (p <= .8) visualX=w.recoilRailX;
    else { const q=1-Math.pow(1-(p-.8)/.2,3); visualX=w.recoilRailX+(w.x-w.recoilRailX)*q; }
  } else if (w.recoilSettleEarly && p <= .8) visualX=w.recoilFromX;
  else {
    const q = w.recoilSettleEarly ? Math.max(0,(p-.8)/.2) : p;
    const eased = 1-Math.pow(1-q,3);
    visualX=w.recoilFromX+(w.x-w.recoilFromX)*eased;
  }
  const hitAge=Number.isFinite(w.hitAt) ? now-w.hitAt : Infinity;
  if(hitAge>=0 && hitAge<110){
    const q=hitAge/110;
    visualX+=(w.hitDir||1)*Math.sin(q*Math.PI*3)*(1-q)*6;
  }
  return visualX;
}
function wordVisualY(w, now){
  now = now || performance.now();
  if (!Number.isFinite(w.recoilFromY) || !Number.isFinite(w.recoilAt))
    return g
      ? w.y + Math.cos((g.visualPhase || 0)+(w.row || 0)*1.3+(w.col || 0)) * 4
      : w.y;
  const p = recoilProgress(w, now);
  if (p >= 1) return w.y;
  if (Number.isFinite(w.recoilRailX)){
    if (p <= .2) return w.recoilFromY;
    if (p >= .8) return w.y;
    const q=(p-.2)/.6, eased=1-Math.pow(1-q,3);
    return w.recoilFromY+(w.y-w.recoilFromY)*eased;
  }
  // Formation rebounds share monotone progress and a common upward kick, so ordered rows cannot cross.
  const q = w.recoilSettleEarly ? Math.min(1,p/.8) : p;
  const eased = 1 - Math.pow(1-q, 3), kick = -10 * Math.sin(Math.PI*q);
  return w.recoilFromY + (w.y - w.recoilFromY) * eased + kick;
}
function formationStageY(w){
  const perRow = g.perRow || 3;
  // A logically resolved word is still a solid, readable formation member until
  // its reserved projectile physically lands. Keeping it in the row model lets
  // correctness and animation stay decoupled without a later word being reflowed
  // into the same slot during viewport recovery or a life recoil.
  const live = g.words.filter(x => !x.settled);
  // Resolved blocks can leave holes. Count occupied row indices, not merely live/perRow,
  // or two survivors in one column collapse onto each other during a shield/life rebound.
  const rows = Math.max(1,...live.map(x => (Number.isInteger(x.row) ? x.row : 0)+1));
  const top = W < 520 ? 104 : 112;
  const blockH = Math.max(34,...g.words.filter(x=>!x.settled).map(x=>x.h||34));
  const safeBottom = Math.max(top,(H-64)-wingHoldClearance()-blockH-6);
  const bottom = W>=520 ? Math.max(top,Math.min(safeBottom,H-250)) : safeBottom;
  const gap = rows > 1 ? Math.min(58,(bottom-top)/(rows-1)) : 0;
  return top + (w.row || 0) * gap;
}
function formationLaneX(w){
  const margin = 8, perRow = g.perRow || 3;
  const col = Number.isInteger(w.col) ? w.col : (w.order % perRow);
  const laneW = Math.max(1, (W - margin*2) / perRow);
  return Math.max(margin, Math.min(W - margin - w.w, margin + col*laneW + (laneW-w.w)/2));
}
function relayoutFormationWidth(){
  if (!g || !g.words) return;
  g.perRow = W < 520 ? 1 : 2;
  const margin=8, laneW=(W-margin*2)/g.perRow;
  ctx.font = '15px "Cascadia Mono", Consolas, monospace';
  g.words.forEach((w,index) => {
    const slot = Number.isInteger(w.slot) ? w.slot : index;
    w.row=Math.floor(slot/g.perRow); w.col=slot%g.perRow;
    w.w=Math.min(laneW-10,ctx.measureText(w.text).width+22);
    w.x=Math.max(margin,Math.min(W-margin-w.w,
      margin+w.col*laneW+(laneW-w.w)/2+(w.jitterX||0)));
    w.baseX=w.x;
  });
}
function reflowViewport(oldW, oldH){
  if (!g || g.over) return;
  const now = performance.now(), wasPaused = !!g.viewportPaused;
  const widthChanged = oldW > 0 && Math.abs(oldW-W) > 1;
  relayoutFormationWidth();
  g.ship.x = Math.max(14, Math.min(W - 14, g.ship.x));
  if(widthChanged){
    for(const node of (g.wakeNodes||[])) node.x=torusWrap(node.x*W/oldW,W);
    if(g.heat) for(const p of g.heat.particles){p.x=p.u*W;p.px=p.x;}
    for(const wave of(g.pressureWaves||[])){wave.x=Math.max(8,Math.min(W-8,wave.x*W/oldW));wave.width*=W/oldW;}
    for(const burst of(g.quenchBursts||[])){burst.x=torusWrap(burst.x*W/oldW,W);burst.maxR=thermalWorldRadius();}
  }

  const requiredHeight=minimumPlayHeight();
  if (H < requiredHeight){
    if (!wasPaused){
      g.viewportPaused = true; g.viewportPauseAt = now;
      g.messageBeforePause = $('msg').innerHTML;
      tEv('viewport_pause', { w:roundTrace(W), h:roundTrace(H), min_h:requiredHeight,boss:!!(g.item&&g.item.boss) });
    }
    $('resize-warning').classList.remove('hidden');
    g.lastT = now;
    return;
  }

  $('resize-warning').classList.add('hidden');
  if (wasPaused){
    const pausedMs = Math.max(0, now - (g.viewportPauseAt || now));
    g.viewportPaused = false; g.viewportPauseAt = 0;
    g.t0 += pausedMs;
    if (g.messageBeforePause !== null) $('msg').innerHTML = g.messageBeforePause;
    g.messageBeforePause = null;
    recoilFormation('viewport_resume', true);
    tEv('viewport_resume', { w:roundTrace(W), h:roundTrace(H), paused_ms:Math.round(pausedMs) });
  } else if (widthChanged){
    recoilFormation('viewport_reflow',true);
  } else if (oldH > 0 && oldW > 0){
    const scaleY = Math.max(1, H - 64) / Math.max(1, oldH - 64);
    for (const w of g.words){
      w.y *= scaleY;
      if (Number.isFinite(w.threatY)) w.threatY *= scaleY;
      w.recoilFromY = null; w.recoilFromX = null; w.recoilRailX = null; w.recoilAt = null;
    }
    if(g.heat)for(const p of g.heat.particles){p.y=torusToScreenY(p.v);p.py=p.y;}
  }
  if(g.heat)rebuildHeatStats(g.heat);
  g.lastT = now;
}
function beginWordRecoil(w, to, now, railX, settleEarly, startAt){
  now = now || performance.now();
  const fromY = wordVisualY(w, now), fromX = wordVisualX(w, now);
  w.y = to; w.recoilFromY = fromY; w.recoilFromX = fromX;
  w.recoilRailX = Number.isFinite(railX) ? railX : null;
  w.recoilSettleEarly = !!settleEarly; w.recoilAt = Number.isFinite(startAt) ? startAt : now;
  return [w.order, roundTrace(fromY), roundTrace(to), w.col, w.row,
    roundTrace(fromX), roundTrace(w.x), Number.isFinite(railX) ? roundTrace(railX) : null];
}
function stabilizeFormationRows(now){
  const columns = new Map();
  for (const w of g.words){
    if (w.settled) continue;
    if (!columns.has(w.col)) columns.set(w.col, []);
    columns.get(w.col).push(w);
  }
  for (const words of columns.values()){
    words.sort((a,b) => wordVisualY(a, now) - wordVisualY(b, now) || a.order - b.order);
    words.forEach((w,row) => { w.row = row; });
  }
}
function recoilFormation(reason, visibleStart, at){
  const now = Number.isFinite(at) ? at : performance.now(), movement = [];
  const settleEarly = g.words.some(w => !w.settled && Math.abs(wordVisualX(w,now)-w.x)>1);
  stabilizeFormationRows(now);
  for (const w of g.words){
    if (w.settled) continue;
    w.holding = false;
    w.threatY = null;
    const target=formationStageY(w);
    if (visibleStart){
      w.y=target; w.recoilFromY=Math.min(H-64-w.h,target+24); w.recoilFromX=w.x;
      w.recoilRailX=null; w.recoilSettleEarly=false; w.recoilAt=now;
      movement.push([w.order,roundTrace(w.recoilFromY),roundTrace(target),w.col,w.row,
        roundTrace(w.x),roundTrace(w.x),null]);
    } else movement.push(beginWordRecoil(w, target, now, null, settleEarly));
  }
  tEv('formation_recoil', { reason, visible_start:!!visibleStart, duration:RECOIL_MS, words:movement });
  return movement;
}
function traceBannerRows(){
  const wrapRect = $('wrap').getBoundingClientRect();
  const rows = [];
  for (const b of activeTraceBanners.values()){
    const r = b.el.getBoundingClientRect();
    const opacity = +(getComputedStyle(b.el).opacity || 0);
    rows.push([b.id, b.text, b.gold ? 1 : 0,
      roundTrace(r.left - wrapRect.left), roundTrace(r.top - wrapRect.top),
      roundTrace(r.width), roundTrace(r.height), Math.round(opacity * 100)]);
  }
  return rows;
}
function traceScene(now){
  now = now || performance.now();
  const banners = traceBannerRows();
  const bannerRects = banners.map(b => ({ x: b[3], y: b[4], w: b[5], h: b[6], opacity: b[7] / 100 }));
  const words = g.words.map(w => {
    const isNext = !w.resolved && w.order === g.idx;
    // Logical death is immediate, but the enemy remains fully alive-looking until
    // the reserved missile damage physically lands (MapleStory-style settlement).
    const alpha = 1;
    const renderX = wordVisualX(w, now), renderY = wordVisualY(w, now);
    const block = { x: renderX, y: renderY, w: w.w, h: w.h };
    const textW = Math.max(1, w.w - 22);
    const textRect = { x: renderX + 11, y: renderY + (w.h - 16)/2, w: textW, h: 16 };
    let bannerCover = 0;
    for (const b of bannerRects) bannerCover = Math.max(bannerCover,
      rectArea(textRect) ? rectIntersection(textRect, b) / rectArea(textRect) * b.opacity : 0);
    const flags = (w.resolved ? 1 : 0) | (w.settled ? 2 : 0) | (isNext ? 4 : 0) |
      (w.err > 0 ? 8 : 0) | (w.flash > 0 ? 16 : 0) | (w.auto ? 32 : 0) |
      (w.holding ? 64 : 0) | (w.isDecoy ? 128 : 0);
    return [w.order, roundTrace(renderX), roundTrace(renderY), roundTrace(w.w), roundTrace(w.h),
      w.hp, w.maxhp, w.consumed || 0, w.committed || 0, flags,
      visiblePct(block), visiblePct(textRect), Math.round(bannerCover * 100), Math.round(alpha * 100),
      roundTrace(isNext && Number.isFinite(w.threatY) ? w.threatY : w.y),
      Math.max(0, Math.round(RECOIL_MS - (now - (w.recoilAt || 0)))), roundTrace(w.x), w.rage || 0];
  });
  const missiles = g.missiles.map(m => [roundTrace(m.x), roundTrace(m.y), roundTrace(m.vx), roundTrace(m.vy),
    m.target ? m.target.order : null, m.dmg || 0, m.letter || '',m.level||1,
    roundTrace(m.speed||missileSpeed(m.level||1)),m.origin||'player']);
  const escortShots = (g.escortShots || []).map(s => [roundTrace(s.x),roundTrace(s.y),
    roundTrace(s.vx),roundTrace(s.vy),roundTrace(s.tx),roundTrace(s.ty)]);
  const particles = g.parts.map(p => [roundTrace(p.x), roundTrace(p.y), roundTrace(p.vx), roundTrace(p.vy),
    Math.round(p.life * 1000), Math.round(p.t * 1000), p.color || '', p.text || '']);
  const pulses = (g.pulses || []).map(p => [roundTrace(p.x),roundTrace(p.y),roundTrace(p.r),roundTrace(p.maxR),
    Math.round(p.life*1000),Math.round(p.t*1000),p.color||'']);
  const field=g.heat||createHeatField();
  let activeTracers=0;for(const tracer of field.particles)if(tracer.active)activeTracers++;
  const heat=[activeTracers,roundHeat(field.totalMass),roundHeat(floorTemperatureAt(g.ship.x)),
    (g.heatArrows||[]).filter(a=>!a.dead).length,roundHeat(field.maxTemp||0),field.simSteps||0,
    Math.round((field.stepCostMs||0)*1000),Math.round((field.maxStepCostMs||0)*1000)];
  const floorBins=Array.from(field.floorBins||[],roundHeat);
  const pressureWaves=(g.pressureWaves||[]).map(w=>[w.id,roundTrace(w.x),roundTrace(w.y),roundTrace(w.width),
    Math.round(w.t*1000),Math.round(w.life*1000),w.guns||1]);
  const quenchBursts=(g.quenchBursts||[]).map(b=>[b.id,roundTrace(b.x),roundTrace(b.y),roundTrace(b.r),roundTrace(b.maxR),
    Math.round(b.t*1000),Math.round(b.life*1000),roundTrace(b.strength),b.reason,b.cells||0]);
  const heatArrows=(g.heatArrows||[]).filter(a=>!a.dead).map(a=>[a.id,roundTrace(a.x),roundTrace(a.y),
    roundTrace(a.vx),roundTrace(a.vy),Math.round(a.age*1000),Math.round(a.arm*1000),Math.round(a.life*1000),roundHeat(a.heat),
    a.silhouette==='arrow'?1:0,roundTrace(a.chill||0),roundTrace(a.sourceX),roundTrace(a.sourceY)]);
  const interceptorShots=(g.interceptorShots||[]).map(s=>[roundTrace(s.x),roundTrace(s.y),roundTrace(s.vx),roundTrace(s.vy),
    s.target?s.target.id:null,Math.round(s.t*1000),Math.round(s.life*1000)]);
  const wakeFields=(g.wakeNodes||[]).map(node=>[node.id,roundTrace(node.x),roundTrace(node.y),roundTrace(node.radius),
    Math.round(node.t*1000),Math.round(node.life*1000),roundTrace(node.rpm),node.marks||0,
    roundTrace(node.vx||0),Math.sign(node.vx||node.direction||0)]);
  const sweeps=(g.sweeps||[]).map(s=>[s.id,roundTrace(s.x),roundTrace(s.y),roundTrace(s.vx),roundTrace(s.vy),
    Math.round(s.t*1000),Math.round(s.life*1000),roundTrace(s.corridor),s.direction,s.cleared||0,s.cooledCells||0]);
  const sweepAbsorbs=(g.sweepAbsorbs||[]).map(a=>[a.id,roundTrace(a.sx),roundTrace(a.sy),roundTrace(a.tx),roundTrace(a.ty),
    Math.round(a.t*1000),Math.round(a.life*1000)]);
  const incomingWords=(g.incomingWords||[]).map(w=>[w.order,roundTrace(w.x),roundTrace(w.y),roundTrace(w.targetY),
    roundTrace(w.w),roundTrace(w.h),w.isDecoy?1:0,visiblePct({x:w.x,y:w.y,w:w.w,h:w.h})]);
  const assemblyFlights=(g.assemblyFlights||[]).map(f=>[f.id,f.order,f.route,roundTrace(f.sourceX),roundTrace(f.sourceY),
    roundTrace(f.targetX),roundTrace(f.targetY),Math.max(0,Math.round(now-(f.startedAt||now))),f.duration]);
  return {
    i: g.idx, f: Math.max(0, Math.round(g.freeze * 1000)), d: g.danger ? 1 : 0,
    vp: g.viewportPaused ? 1 : 0, pressure_y:roundTrace(threatLineY()),
    recoil_bank:roundTrace(g.recoilBank || 0),
    // Retained as nullable schema fields so historical DELIVERY traces still analyze,
    // but both live variants now use the selected BREACH rules.
    delivery_ms:null, cargo_order:null, dock_x:null,
    jam_ms:Math.max(0,Math.round((g.shotJamUntil || 0)-now)),
    move_dir:(moveInput.right?1:0)-(moveInput.left?1:0),
    ship: [roundTrace(g.ship.x), roundTrace(H - 34)], lock: g.lock ? g.lock.order : null,
    inv: [0, 0, g.lives, g.combo],
    sync:Math.round(g.sync||0),
    feedback:g.confirmFlash&&now-g.confirmFlash.at<g.confirmFlash.life*1000
      ?[roundTrace(g.confirmFlash.x),roundTrace(g.confirmFlash.y),Math.round(now-g.confirmFlash.at),
        Math.round(g.confirmFlash.life*1000),g.confirmFlash.correct?1:0,g.confirmFlash.kind]:null,
    reward:[g.wingUnits||0,(g.wakeNodes||[]).length,g.combatStarted?1:0,
      g.combatStarted?1:0,heavyWeaponOrigins().length,g.coolerLevel||0,g.escortAmmo||0,
      g.stormCharge||0,Math.max(0,Math.round((g.rewardFlashUntil||0)-now)),g.experiment||'C',
      roundTrace(g.rewardFlashX||0),roundTrace(g.rewardFlashY||0)],
    words, missiles, escortShots, particles, pulses,
    heat, floorBins, pressureWaves, quenchBursts, heatArrows, interceptorShots, wakeFields, sweeps, sweepAbsorbs,
    incomingWords, assemblyFlights,
    banners, shake: $('wrap').classList.contains('shake') ? 1 : 0,
    ui: [Math.round(g.scoreDisplay||0), weaponLv(), g.builtDrawn || '', $('msg').textContent || '', g.over ? 1 : 0],
  };
}
function traceSample(eff){
  if (!traceOn || !g) return;
  const nw = g.words.find(w => w.order === g.idx);
  TRACE.samples.push({
    t: Math.round(performance.now() - TRACE.meta.started),
    d: nw
      ? Math.round((H - 64) - ((Number.isFinite(nw.threatY) ? nw.threatY : nw.y) + nw.h)) : null,
    n: g.words.filter(w => !w.resolved).length,
    q: g.words.filter(w => w.resolved).length,              // presentation-only deaths still on screen
    sp: Math.round(eff), c: g.combo, l: g.lives, m: g.missiles.length,
    scene: traceScene(),
  });
}
function tracePayloadBody(payload){
  payload.meta.bytes = 0;
  let body = JSON.stringify(payload);
  for (let i = 0; i < 3; i++){
    const bytes = new TextEncoder().encode(body).byteLength;
    if (payload.meta.bytes === bytes) break;
    payload.meta.bytes = bytes;
    body = JSON.stringify(payload);
  }
  return body;
}
function traceCheckpoint(unloading){
  if(!TRACE_CHECKPOINT_ENABLED || !traceOn || !g || g.over || traceCheckpointBusy) return;
  const sampleEnd=TRACE.samples.length,eventEnd=TRACE.events.length;
  if(sampleEnd===traceCheckpointSamples && eventEnd===traceCheckpointEvents) return;
  const token=traceCheckpointToken;
  const payload={
    meta:Object.assign({},TRACE.meta,{checkpoint:true,complete:false,
      sample_offset:traceCheckpointSamples,event_offset:traceCheckpointEvents,
      sample_count:sampleEnd,event_count:eventEnd}),
    samples:TRACE.samples.slice(traceCheckpointSamples,sampleEnd),
    events:TRACE.events.slice(traceCheckpointEvents,eventEnd),
  };
  const body=tracePayloadBody(payload);
  traceCheckpointBusy=true;
  fetch('/api/trace-checkpoint',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:!!unloading})
    .then(res=>{if(res.ok&&token===traceCheckpointToken){traceCheckpointSamples=sampleEnd;traceCheckpointEvents=eventEnd;}})
    .catch(()=>{}).finally(()=>{if(token===traceCheckpointToken)traceCheckpointBusy=false;});
}
function traceSend(unloading){
  traceOn = false;
  TRACE.meta.sample_count = TRACE.samples.length;
  TRACE.meta.event_count = TRACE.events.length;
  TRACE.meta.complete = true;
  const body = tracePayloadBody(TRACE);
  try {
    fetch('/api/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body, keepalive: !!unloading }).catch(()=>{});
  } catch(e){}
}
window.addEventListener('pagehide', ()=>{
  // Fast successful bursts can end before 40 samples. Preserve any session that contains
  // a player/game event. The rich whole scene exceeds the unload quota, so only the
  // final delta uses keepalive after local 1-second checkpoints have been merged.
  if (traceOn && (TRACE.samples.length > 40 || TRACE.events.length > 0)) traceCheckpoint(true);
});
if(typeof setInterval==='function') setInterval(()=>traceCheckpoint(false),1000);

