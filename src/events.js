// ---------- input ----------
let lastMode = 'tap';
function begin(mode){ lastMode = mode; startGame(mode); }
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  tapAt(e.clientX - r.left, e.clientY - r.top);
});
cv.addEventListener('pointermove', e => {
  if (!g || g.over || g.viewportPaused) return;
  // Both tests use the mouse strictly as an aiming cursor on desktop so held arrows can dodge
  // independently while the player points at and clicks a chunk. Touch drag still steers.
  if (e.pointerType === 'mouse') return;
  const r = cv.getBoundingClientRect();
  g.ship.x = Math.max(16,Math.min(W-16,e.clientX-r.left));
  g.ship.manualUntil = performance.now()+500;
});
$('start').addEventListener('pointerdown', e => { e.preventDefault(); begin('tap'); });
$('over').addEventListener('pointerdown', e => { e.preventDefault(); begin(lastMode); });
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('start').classList.contains('hidden')){
    e.preventDefault(); begin(e.key.length===1?'type':'tap');
    if(e.key.length===1&&SIG.test(e.key))handleKey(e.key);
    return;
  }
  if (!$('over').classList.contains('hidden')){
    e.preventDefault(); begin(lastMode);
    return;
  }
  if (e.key === 'Tab'){ e.preventDefault(); handleTab(); return; }
  if (e.key === ' ' || e.code === 'Space'){ e.preventDefault(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
    e.preventDefault();
    const side = e.key === 'ArrowLeft' ? 'left' : 'right';
    if(e.shiftKey&&isStormTrial()){castStorm(side==='left'?-1:1,'keyboard');return;}
    if(isStormTrial()&&(g.stormCharge||0)>=STORM_READY_HITS&&performance.now()-(g.stormHintAt||0)>900){
      g.stormHintAt=performance.now();$('msg').innerHTML='<span style="color:var(--gold)">HOLD SHIFT + '+(side==='left'?'←':'→')+' TO CAST SWEEP</span> · arrow alone still dodges';
      tEv('storm_hint',{side,charge:g.stormCharge,scene:traceScene()});
    }
    if (!moveInput[side]){
      const nudge = side === 'left' ? -20 : 20;
      const beforeNudge=g.ship.x;
      g.ship.x = Math.max(16,Math.min(W-16,g.ship.x+nudge));
      if(!isStormTrial())castWakeFromMovement(beforeNudge,g.ship.x,0,true);
    }
    moveInput[side] = true;
    return;
  }
  if (e.key.length === 1 || e.key === 'Backspace'){ e.preventDefault(); handleKey(e.key); }
});
$('h-resource').addEventListener('pointerdown',e=>{
  if(!isStormTrial())return;
  e.preventDefault();
  const rect=$('h-resource').getBoundingClientRect();
  castStorm(e.clientX<rect.left+rect.width/2?-1:1,'hud');
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft') moveInput.left = false;
  if (e.key === 'ArrowRight') moveInput.right = false;
});
window.addEventListener('blur', () => { moveInput.left = false; moveInput.right = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden){ moveInput.left = false; moveInput.right = false; }
});
$('start-best').textContent = 'best: ' + (+(localStorage.getItem('shooter2_best') || 0));
resize();
