// tap-to-lock, ZType style: the ship fires a stream of homing missiles at the locked word
function tapAt(x, y){
  if (!g || g.over || g.viewportPaused) return;   // keyboard and pointer both live when play is visible
  if (g.pendingSentenceClear || g.idx >= g.sentence.length){
    $('msg').textContent='# FINAL IMPACT INBOUND · movement remains live'; return;
  }
  // A resolved word remains visible for its impacts, but is no longer an input target.
  const now = performance.now();
  if (inputJammed('tap')) return;
  const live = g.words.filter(w => !w.resolved);
  let w = live.find(w => {
    const wx = wordVisualX(w, now), wy = wordVisualY(w, now);
    return x >= wx && x <= wx + w.w && y >= wy && y <= wy + w.h;
  });
  // Padding makes narrow/mobile blocks easier to hit, but adjacent padded boxes can overlap.
  // In that fringe choose the visually nearest block instead of array order (which leaks answer order).
  if (!w){
    w = live.filter(word => {
      const wx = wordVisualX(word, now), wy = wordVisualY(word, now);
      return x >= wx - 8 && x <= wx + word.w + 8 && y >= wy - 8 && y <= wy + word.h + 8;
    }).sort((a,b) => {
      const ax=wordVisualX(a,now)+a.w/2, ay=wordVisualY(a,now)+a.h/2;
      const bx=wordVisualX(b,now)+b.w/2, by=wordVisualY(b,now)+b.h/2;
      return Math.hypot(x-ax,y-ay)-Math.hypot(x-bx,y-by);
    })[0];
  }
  if (!w){
    const core=signalCore();
    if(isStormTrial()&&!core.hidden&&Math.hypot(x-core.x,y-core.y)<=core.r+14){
      castStorm(x<core.x?-1:1,'core');
    }
    return;
  }
  w = equivalentTarget(w);
  armCombat('tap_answer');
  tEv('tap_input', { x: roundTrace(x), y: roundTrace(y), order: w.order, w: w.text,
    correct: w.order === g.idx, scene: traceScene() });
  g.typePrefix = ''; g.lock = null;
  if (w.order === g.idx){
    g.missChain = 0;
    g.lock = w;
    queueDamageVolley(w, w.maxhp - w.committed);   // one tap commits a full kill; visuals follow independently
    tone(600, 900, .06, 'square', .05);            // lock blip
  } else {
    applyWrongPenalty(w,{ want:(g.words.find(word=>word.order===g.idx)||{}).text });
  }
}

function launchMissile(target, dmg, letter, level){
  level=level||weaponLv();
  const origins=hasEscort(g.variant)
    ? heavyWeaponOrigins()
    : [{x:g.ship.x,y:H-46}];
  const origin=origins[(g.shotSeq++)%origins.length];
  addPulse(origin.x,origin.y-8,12+level*2,origin.kind==='escort'?'#fff4b8':'#9fe9fb',.09);
  g.missiles.push({
    x: origin.x + (Math.random()*8 - 4), y: origin.y,
    vx: (Math.random()*2 - 1) * 260,          // flare out sideways...
    vy: -220 - Math.random()*120,             // ...then curve into the target
    target, dmg, letter, level, speed:missileSpeed(level), origin:origin.kind,
  });
}

// Gameplay is committed when a deterministic shot is launched/scheduled. The missile and
// explosion are presentation: they may finish later without holding the next input hostage.
function commitMissile(target, letter, level){
  if (!target || target.resolved) return;
  target.committed++;
  launchMissile(target, 1, letter, level);
  if (target.committed >= target.maxhp) resolveWord(target);
}

function queueDamageVolley(target, count){
  count = Math.max(0, count | 0);
  if (!count || !target || target.resolved) return;
  const level=weaponLv(), gap=volleyGap(level);
  target.committed += count;                         // deterministic reservation: this damage cannot be canceled
  g.fireQueues.push({ target, remaining: count, t: 0, gap, level });
  if (target.committed >= target.maxhp) resolveWord(target);
}

function spawnMissiles(dt){
  for (const q of g.fireQueues){
    if (!g.words.includes(q.target)){ q.remaining = 0; continue; }
    q.t -= dt;
    while (q.remaining > 0 && q.t <= 0){
      q.remaining--;
      q.t += q.gap;
      sfx.pew();
      launchMissile(q.target, 1,undefined,q.level);
    }
  }
  g.fireQueues = g.fireQueues.filter(q => q.remaining > 0);
}

function advanceTypedKey(t, key){
  if (!t || t.resolved || t.consumed >= t.text.length) return false;
  const expected = t.text[t.consumed];
  if (expected.toLowerCase() !== key.toLowerCase()) return false;
  tEv('key_input', { order:t.order, k:key, w:t.text, at:t.consumed, scene:traceScene() });
  g.missGraceUntil = 0;
  g.lock = t;
  const level=weaponLv();
  t.consumed++;
  sfx.pew();
  commitMissile(t, expected,level);
  while (t.consumed < t.text.length && !SIG.test(t.text[t.consumed])){
    t.consumed++;                            // commas and periods ride along as free missiles
    launchMissile(t, 0,undefined,level);
  }
  for (let i = 1; i < level; i++) launchMissile(t, 0,undefined,level);
  return true;
}

function suppressTypedMiss(chosen, key, guess, expected){
  const now = performance.now();
  tEv('miss_suppressed', {
    order: chosen ? chosen.order : null, k:key, want:expected || undefined,
    w:chosen ? chosen.text : '', guess:guess || '',
    remaining:Math.max(0,Math.round(g.missGraceUntil-now)), scene:traceScene(),
  });
}

function penalizeTypedGuess(chosen, key, guess, expected){
  applyWrongPenalty(chosen,{ k:key, want:expected || undefined, guess:guess || '' });
}

function focusCandidates(prefix){
  if (!g || !prefix) return [];
  const normalized=String(prefix).toLowerCase();
  return g.words.filter(w=>!w.resolved && typingForm(w.text).startsWith(normalized));
}
function focusSelection(prefix){
  const prefixCandidates=focusCandidates(prefix),normalized=String(prefix||'').toLowerCase();
  // A complete short chunk must beat a longer chunk that merely shares its prefix.
  // Otherwise "the time" can never be selected while "the time completing it" is alive.
  const exact=prefixCandidates.filter(w=>typingForm(w.text)===normalized);
  const candidates=exact.length?exact:prefixCandidates;
  const forms=[...new Set(candidates.map(w=>choiceIdentity(w.text)))];
  if (forms.length!==1) return { candidates, forms, chosen:null };
  const target=g.words.find(w=>!w.resolved&&w.order===g.idx);
  const chosen=target && forms[0]===choiceIdentity(target.text) ? target : candidates[0];
  return { candidates, forms, chosen };
}
function describeFocus(){
  if (!g.typePrefix){ $('msg').textContent='# focus cleared — type to light matching chunks'; return; }
  const state=focusSelection(g.typePrefix);
  if (state.forms.length===1){
    $('msg').innerHTML='<span style="color:var(--bright)">FOCUS '+esc(g.typePrefix.toUpperCase())+'</span> · '+
      state.candidates.length+' target'+(state.candidates.length===1?'':'s')+' · <span style="color:var(--gold)">TAB TO CONFIRM</span>';
  } else {
    $('msg').innerHTML='<span style="color:var(--bright)">FOCUS '+esc(g.typePrefix.toUpperCase())+'</span> · '+
      state.candidates.length+' candidates · keep typing to narrow';
  }
}

// Typing only builds a visible candidate focus. It never judges grammar by itself.
function handleKey(key){
  if (!g || g.over || g.viewportPaused) return;
  if (g.pendingSentenceClear || g.idx >= g.sentence.length){
    $('msg').textContent='# FINAL IMPACT INBOUND · movement remains live'; return;
  }
  if (key==='Backspace'){
    if (!g.typePrefix) return;
    g.typePrefix=g.typePrefix.slice(0,-1); g.lock=null;
    const state=focusSelection(g.typePrefix);
    if (state.chosen) g.lock=state.chosen;
    tEv('focus_change',{ prefix:g.typePrefix, candidates:state.candidates.map(w=>w.order),
      reason:'backspace', scene:traceScene() });
    describeFocus(); return;
  }
  if (key.length!==1 || !SIG.test(key)) return;
  if (inputJammed('type')) return;
  const attempted=(g.typePrefix+key).toLowerCase();
  const candidates=focusCandidates(attempted);
  tEv('key_input',{ order:null, k:key, prefix:g.typePrefix, attempted, scene:traceScene() });
  if (!candidates.length){
    const rejected=attempted; g.typePrefix=''; g.lock=null;
    tEv('focus_clear',{ rejected, reason:'no_match', scene:traceScene() });
    tone(180,120,.05,'square',.025);
    $('msg').innerHTML='<span style="color:var(--dim)">NO MATCH '+esc(rejected.toUpperCase())+'</span> — focus cleared, no penalty';
    return;
  }
  g.typePrefix=attempted; g.missGraceUntil=0;
  const state=focusSelection(g.typePrefix);
  g.lock=state.chosen;
  tEv('type_prefix',{ prefix:g.typePrefix, candidates:candidates.map(w=>w.order),
    unique:state.chosen ? state.chosen.order : null, scene:traceScene() });
  tone(state.chosen?520:340,state.chosen?760:430,.045,'square',.025);
  describeFocus();
}

// Tab is no longer an inventory item or an answer reveal. It only confirms a unique visible focus.
function handleTab(){
  if (!g || g.over || g.viewportPaused) return;
  if (g.pendingSentenceClear || g.idx >= g.sentence.length){
    $('msg').textContent='# FINAL IMPACT INBOUND · movement remains live'; return;
  }
  if (inputJammed('tab')) return;
  if (g.typePrefix){
    const prefix=g.typePrefix, state=focusSelection(prefix);
    if (!state.chosen){
      tEv('focus_confirm_blocked',{ prefix, candidates:state.candidates.map(w=>w.order), scene:traceScene() });
      sfx.plink(); describeFocus(); return;
    }
    const chosen=equivalentTarget(state.chosen), correct=chosen.order===g.idx;
    armCombat('focus_confirm');
    tEv('focus_confirm',{ prefix, order:chosen.order, w:chosen.text, correct, scene:traceScene() });
    showConfirmFeedback(chosen,correct);
    g.typePrefix=''; g.lock=null;
    if (correct){
      g.missChain=0; g.lock=chosen;
      queueDamageVolley(chosen,chosen.maxhp-chosen.committed);
      tone(600,900,.06,'square',.05);
    } else applyWrongPenalty(chosen,{ guess:prefix, confirm:'tab' });
    updateHud(); return;
  }
  tEv('focus_confirm_blocked',{ prefix:'', candidates:[], reason:'no_focus', scene:traceScene() });
  sfx.plink();
  $('msg').innerHTML='<span style="color:var(--dim)">NO FOCUS TO CONFIRM</span> · type until one visible choice remains';
}

// OpenTyrian's galaga-mode rule (tyrian2.c:1147): score thresholds grant lives,
// each threshold recedes, and a full stock converts to points instead of vanishing
function checkExtraLife(){
  while (g.score >= g.nextLife){
    if (g.lives < 5){ g.lives++; banner('1UP', true); sfx.up(); buzz([30,50,30]); }
    else g.score += 1000;
    g.nextLife += 25000;
  }
}

function applyCorrectDefense(word,nextTarget){
  // Correct answers never shove the remaining word formation. Their reward is
  // expressed only through A's interceptor formation or B's cooling wake.
  if (nextTarget) nextTarget.threatY = nextTarget.y;
  tEv('correct_reward_route',{variant:g.variant,order:word.order,
    route:g.variant==='A'?'interceptor_formation':g.variant==='B'?'quench_wake':'fusion_rail_blizzard',combo:g.combo});
}

function resolveWord(word){
  if (!word || word.resolved || word.isDecoy || g.idx >= g.sentence.length || word.order !== g.idx) return;
  word.resolved = true;
  word.resolvedAt = performance.now();
  g.missGraceUntil = 0;
  g.lastMissAt = 0; g.missChain = 0;
  g.typePrefix = '';
  if (g.lock === word) g.lock = null;
  g.kills++; g.idx++; g.wordT = 0;
  const nextTarget = g.words.find(w => !w.resolved && w.order === g.idx);
  if (nextTarget) nextTarget.threatY = nextTarget.y;
  if (!word.auto) g.combo++;
  word.impactCombo=g.combo; word.impactLevel=weaponLv();
  const finalChunk=g.idx===g.sentence.length;
  $('msg').innerHTML = finalChunk
    ? '<span style="color:var(--bright)">✓ ANSWER LOCKED</span> — final impact inbound'
    : '<span style="color:var(--bright)">✓ CORRECT</span> — impact inbound; choose the next chunk';
  // long words are the fun AND the danger (trace-verified: all deaths were long words) — pay accordingly
  const base = 60 + 9 * word.maxhp;
  const pts = Math.round(word.auto ? base/2 : base);
  word.pts = pts;
  tEv('kill', { order:word.order, w: word.text, auto: !!word.auto, c: g.combo, pts });
  if (finalChunk){g.pendingSentenceClear=true;prepareIncomingFormation();}
  updateHud();
}

function settleWord(word, forced){
  if (!word || word.settled) return;
  const visualX = wordVisualX(word), visualY = wordVisualY(word);
  word.settled = true;
  g.words = g.words.filter(w => w !== word);
  if (g.lock === word) g.lock = null;
  const lag = Math.max(0, Math.round(performance.now() - word.resolvedAt));
  const impact=applyPhysicalImpact(word,visualX+word.w/2,visualY+word.h/2,forced);
  tEv('settle', { order:word.order, w: word.text, lag, forced: !!forced,
    impact_cleared:impact.cleared, core_burst:impact.burst, reward:impact.reward });
  sfx.boom(); buzz(25); shake();
  spawnParts(visualX + word.w/2, visualY + word.h/2, 14, '#d7ba7d', 160);
  spawnParts(visualX + word.w/2, visualY + word.h/2, 8, '#aef0ae', 90);
  if(!forced && word.pts){
    awardScore(word.pts,visualX+word.w/2,visualY+word.h/2,'word_impact');
    popText(visualX + word.w/2, visualY, '+' + word.pts, '#fff4b8');
  }
  if(!forced)launchAssembly(word,visualX+word.w/2,visualY+word.h/2);
  const answerImpactPending=g.words.some(w=>!w.isDecoy&&w.order<g.sentence.length&&!w.settled);
  if(!forced && g.pendingSentenceClear && g.idx===g.sentence.length && !answerImpactPending){
    g.pendingSentenceClear=false;
    sentenceClear();
  }
}

function sentenceClear(){
  for (const decoy of g.words.slice()){
    if (!decoy.resolved && decoy.isDecoy){
      decoy.resolved = true; decoy.resolvedAt = performance.now(); decoy.pts = 0;
      settleWord(decoy, true);
    }
  }
  endHeatVolley('wave_clear');
  const scoreTierBeforeClear=g.scoreTier;
  const completedItem=g.item&&g.item.id,currentMistakes=g.mistakes.filter(m=>m.item===completedItem);
  g.solved++;
  const secs = Math.round((performance.now() - g.t0)/1000);
  const bonus = Math.max(0, 150 - secs*4);
  const reserveBonus = Math.round((g.recoilBank||0)*4);
  if (reserveBonus) tEv('reserve_bonus',{ bank:roundTrace(g.recoilBank), points:reserveBonus });
  g.recoilBank = 0;
  awardScore(bonus+reserveBonus,W/2,H*.36,'sentence_clear');
  sfx.clear();
  let earned = '';
  if (g.perfect){
    awardScore(250,W/2,H*.36,'perfect');
    banner('PERFECT +250', true); sfx.up();
    earned = '  <span style="color:var(--gold)">+250 PERFECT</span>';
  } else banner('CLEAR');
  if (secs <= Math.ceil(g.sentence.length * 2.8)){
    awardScore(300,W/2,H*.36,'fast_clear');
    earned += '  <span style="color:var(--gold)">+300 FAST CLEAR</span>';
  }
  const thermal=g.scoreTier===scoreTierBeforeClear?triggerThermalClear('sentence_clear',.52):{kind:'score_break'};
  checkExtraLife();
  const reply=fullReply();
  g.completedSentences.push({item:completedItem,reply,secs,mistakes:currentMistakes.length});
  if(g.completedSentences.length>12)g.completedSentences.shift();
  tEv('clear', { len: g.sentence.length, secs, perfect: g.perfect,thermal_clear:thermal.kind,
    sortie:g.sortie,wave:g.sortieWave+1,boss:!!(g.item&&g.item.boss),mistake_count:currentMistakes.length });
  const correction=currentMistakes.length?' · <span style="color:var(--gold)">'+currentMistakes.slice(-2).map(m=>
    esc(m.chosen)+' → '+esc(m.expected)).join(' · ')+'</span>':'';
  $('msg').innerHTML = '<span style="color:var(--bright)">✓ ' + esc(reply) + '</span> +' + bonus +
    (reserveBonus ? ' <span style="color:var(--gold)">+R' + reserveBonus + '</span>' : '') + earned+correction;
  $('prompt').classList.add('sentence-complete');
  setTimeout(()=>{if(g)$('prompt').classList.remove('sentence-complete');},1800);
  setTimeout(()=>{ if (g && !g.over) nextSentence(); }, 1800);
}

function loseLife(word){
  // A formation breach is direct hull damage; there is no shield inventory.
  g.perfect = false; g.wordT = 0;
  const transitionAt=performance.now(), before = traceScene(transitionAt);
  sfx.hit(); buzz(120); shake();
  g.lives--; g.combo = 0;
  if(hasEscort(g.variant)){shatterWing('breach');g.escortAmmo=0;}
  if(hasStorm(g.variant)){g.coolerLevel=0;g.stormCharge=0;g.wakeNodes=[];g.sync=0;}
  spawnParts(g.ship.x, H - 40, 20, '#d16969', 200);
  if (g.lives <= 0){
    tEv('life_lost', { order:word.order, w: word.text, left: g.lives, before, after: traceScene(transitionAt) });
    gameOver(); return;
  }
  $('msg').innerHTML = '<span style="color:var(--danger)">✦ breach!</span> gun reset — ' + g.lives + ' ships left';
  recoilFormation('life',false,transitionAt);
  tEv('life_lost', { order:word.order, w: word.text, left: g.lives, before, after: traceScene(transitionAt) });
  updateHud();
}

// (the 💡 reveal item was removed — a skill that tells you the answer betrays the drill)

function gameOver(){
  g.over = true;
  if (g.score > g.best){ g.best = g.score; localStorage.setItem('shooter2_best', g.best); }
  const acc = (g.kills + g.plinks) ? Math.round(100 * g.kills / (g.kills + g.plinks)) : 100;
  if (traceOn) traceSample(g.eff || g.speed);
  tEv('over', { score: g.score, solved: g.solved, acc, kills: g.kills, plinks: g.plinks,
    items:false, heat_integral:roundHeat(g.heat.totalMass||0), particles:g.heat.particles.length });
  traceSend();
  const recentSentences=(g.completedSentences||[]).slice(-3).map(s=>'✓ '+esc(s.reply)).join('<br>');
  const recentMistakes=(g.mistakes||[]).slice(-5).map(m=>(m.kind==='grammar'?'GRAMMAR':'ORDER')+': '+esc(m.chosen)+' → '+esc(m.expected)).join('<br>');
  $('over-stats').innerHTML =
    'score <b style="color:var(--gold)">' + g.score + '</b><br>' +
    'sentences cleared: ' + g.solved + '<br>' +
    'aim discipline: ' + acc + '% (kills vs armor plinks)<br>' +
    'best: ' + g.best +
    (recentSentences?'<br><br><span style="color:var(--bright)">ASSEMBLED</span><br>'+recentSentences:'')+
    (recentMistakes?'<br><br><span style="color:var(--gold)">REVIEW</span><br>'+recentMistakes:'');
  $('over').classList.remove('hidden');
  updateHud();
}

