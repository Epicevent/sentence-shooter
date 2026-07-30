// ---------- input ----------
let lastMode = 'tap';
function begin(mode){ lastMode = mode; startGame(mode); }
function craftRecord(id,key){
  try{return +(localStorage.getItem('shooter2_'+key+'_'+id)||0)}catch(e){return 0}
}
function renderHangar(){
  const grid=$('hangar-grid');
  grid.innerHTML=CRAFT_ORDER.map(id=>{
    const craft=CRAFTS[id],selected=id===selectedCraft;
    return '<button type="button" class="craft-card '+(selected?'selected':'')+'" data-craft="'+id+'" role="radio" aria-checked="'+selected+'" style="--craft-color:'+craft.color+'">'+
      '<span class="craft-icon '+id+'"></span><span class="craft-name">'+craft.name+'</span>'+
      '<span class="craft-verb">'+craft.verb+'</span><span class="craft-detail">'+craft.detail+'</span>'+
      '<span class="craft-record">BEST '+craftRecord(id,'best')+' · CLEAR '+craftRecord(id,'solved')+'</span></button>';
  }).join('');
  const craft=CRAFTS[selectedCraft];
  $('start-best').textContent='SELECTED '+craft.name+' · '+craft.verb;
  if(document.body)document.body.dataset.variant=craft.variant;
}
function selectCraft(id,source){
  if(!CRAFTS[id])return;
  selectedCraft=id;
  try{localStorage.setItem('shooter2_craft',id)}catch(e){}
  renderHangar();
}
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
$('hangar-grid').addEventListener('pointerdown',e=>{
  const card=e.target.closest('[data-craft]');
  if(!card)return;
  e.preventDefault();e.stopPropagation();selectCraft(card.dataset.craft,'pointer');
});
$('launch').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();begin('tap');});
$('over').addEventListener('pointerdown', e => { e.preventDefault(); begin(lastMode); });
$('return-hangar').addEventListener('pointerdown',e=>{
  e.preventDefault();e.stopPropagation();$('over').classList.add('hidden');$('start').classList.remove('hidden');renderHangar();
});
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('start').classList.contains('hidden')){
    e.preventDefault();
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
      const at=CRAFT_ORDER.indexOf(selectedCraft),delta=e.key==='ArrowLeft'?-1:1;
      selectCraft(CRAFT_ORDER[(at+delta+CRAFT_ORDER.length)%CRAFT_ORDER.length],'keyboard');
    }else if(/^Digit[1-4]$/.test(e.code))selectCraft(CRAFT_ORDER[+e.code.slice(-1)-1],'keyboard');
    else if(e.key==='Enter')begin('tap');
    return;
  }
  if (!$('over').classList.contains('hidden')){
    e.preventDefault();
    if(e.key.toLowerCase()==='h'){$('over').classList.add('hidden');$('start').classList.remove('hidden');renderHangar();}
    else begin(lastMode);
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
  if(!isStriker())return;
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
renderHangar();
resize();
