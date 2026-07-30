function weaponLv(combo,variant){
  const liveVariant=variant || (g && g.variant) || AB_VARIANT;
  if(liveVariant==='C') return 1+Math.min(4,(g&&g.wingUnits)||0);
  if(liveVariant==='B') return 1+Math.min(3,Math.floor(((g&&g.coolerLevel)||0)/3));
  // Legacy A remains readable in old replay fixtures; live A/B both enter via C.
  return 1+Math.min(3,((g&&g.wingUnits)||0)*3);
}
function missileSpeed(level){ return 560+Math.max(1,Math.min(5,level||weaponLv()))*70; }
function volleyGap(level){ return [0,.09,.075,.06,.05,.04][Math.max(1,Math.min(5,level||weaponLv()))]; }
function startGame(mode){
  resize();
  g = {
    mode: mode || 'tap',
    score: 0, combo: 0, lives: 3, solved: 0, kills: 0, plinks: 0,
    best: +(localStorage.getItem('shooter2_best') || 0),
    ship: { x: W/2, combatX:W/2, manualUntil:0 }, missiles: [], escortShots: [], fireQueues: [], words: [], incomingWords:[], parts: [], pulses: [], stars: [],
    lock: null, typePrefix: '', freeze: 0, missGraceUntil: 0,
    shotJamUntil:0, lastMissAt:0, missChain:0,
    perfect: true, nextLife: 10000,
    wordT: 0, beatT: 0,
    idx: 0, sentence: null, item: null, preloadedItem:null, recent: [], perRow:3, sortie:1, sortieWave:0,
    speed: 12, eff: 12, builtDrawn: '', visualAttached:[], assemblyFlights:[], assemblySeq:0,
    assemblyFlashOrder:-1, assemblyFlashUntil:0, viewportPaused: false, viewportPauseAt: 0,
    messageBeforePause: null, over: false, lastT: performance.now(), t0: 0,
    waveGraceUntil:0, variant:'C', experiment:AB_VARIANT, recoilBank:0,
    visualPhase:0, sync:0, grazes:0, coreBursts:0, pendingSentenceClear:false,
    wingUnits:0, escortAmmo:0, coolerLevel:0, stormCharge:0, wakeNodes:[], sweeps:[], sweepAbsorbs:[], heatArrows:[], interceptorShots:[], shotSeq:0, combatStarted:false,
    heat:createHeatField(), heatEmitT:0, pressureWaves:[], pressureWaveSeq:0, quenchBursts:[], quenchBurstSeq:0, wakeDropT:0, interceptT:0,
    scoreDisplay:0, scoreMilestone:1500, scoreTier:0, scoreMotes:[],
    rewardFlashAt:0, rewardFlashUntil:0, rewardFlashX:W/2, rewardFlashY:H-34,
    confirmFlash:null, mistakes:[], completedSentences:[], stormHintAt:0,
  };
  moveInput.left = false; moveInput.right = false;
  for (let i = 0; i < 44; i++)
    g.stars.push({ x: Math.random()*W, y: Math.random()*H, v: 30 + Math.random()*70 });
  $('start').classList.add('hidden');
  $('over').classList.add('hidden');
  $('prompt').classList.remove('hidden');
  $('msg').textContent = AB_VARIANT==='C' ? 'TYPE A CHUNK · TAB TO CONFIRM · ← → DODGE'
    : 'TYPE A CHUNK · TAB TO CONFIRM · SHIFT+←/→ SWEEP';
  traceStart(g.mode);
  seedDust(HEAT_TRACER_COUNT);
  tEv('field_start', { build:BUILD_ID, topology:'torus', vertical_period_screens:TORUS_VERTICAL_SCREENS,
    initial_temperature:0, tracer_cap:HEAT_TRACER_COUNT, grid:[HEAT_GRID_X,HEAT_GRID_Y],
    diffusivity:HEAT_KAPPA, sim_hz:Math.round(1/HEAT_SIM_DT), items:false });
  nextSentence();
  if (H < minimumPlayHeight()) reflowViewport(W, H);
  else $('resize-warning').classList.add('hidden');
  if (!loopStarted){
    loopStarted = true;
    requestAnimationFrame(frame);
  }
}

// significant characters (typed); punctuation like commas/periods auto-fires
const SIG = /[a-z0-9'-]/i;
const MISS_BURST_MS = 220;  // one mistyped word should not become one punishment per letter
// Combo impacts grow a symmetric formation: two escorts on each side.
const MAX_WING_UNITS = 4;
const STORM_READY_HITS = 3, STORM_DRIFT_SPEED = 78;
const SWEEP_SPEED = 600, SWEEP_LIFE = 1.5, SWEEP_CORRIDOR = 132;
const HEAT_GRID_X = 64, HEAT_GRID_Y = 40, HEAT_SIM_DT = 1/30, HEAT_KAPPA = .00125;
const HEAT_SINK_CAP = 12;
const TORUS_VERTICAL_SCREENS = 1, HEAT_TRACER_COUNT = 180, HEAT_ARROW_ARM_MS = 220;
const HEAT_VOLLEY_CAP = 36, HEAT_VOLLEY_COLS = 6, HEAT_VOLLEY_ROWS = 4;
const DUST_TOP = 104, DUST_SPAWN_INTERVAL = .22, FLOOR_BINS = 16;
const FLOOR_HOT = .28, FLOOR_CRITICAL = .58;
const SCORE_STEP = 1500;
const VARIANT_RULES = {
  A:{ baseSpeed:8.0, speedCap:9.6, solvedScale:1.01, hesitationAccel:.13, hesitationCap:2.8,
    wrongScoreBase:110, wrongScoreChain:45 },
  B:{ baseSpeed:8.0, speedCap:9.6, solvedScale:1.01, hesitationAccel:.13, hesitationCap:2.8,
    wrongScoreBase:110, wrongScoreChain:45 },
  C:{ baseSpeed:8.0, speedCap:9.6, solvedScale:1.01, hesitationAccel:.13, hesitationCap:2.8,
    wrongScoreBase:110, wrongScoreChain:45 },
};
function variantRules(variant){ return VARIANT_RULES[variant || (g && g.variant) || AB_VARIANT]; }
function variantConcept(variant){ const live=variant || (g&&g.variant) || AB_VARIANT;return live==='A'
  ? 'heavy_interceptor_rail_slam' : live==='B' ? 'blizzard_core_link' : 'fusion_rail_blizzard'; }
function hasEscort(variant){ return (variant || (g&&g.variant) || AB_VARIANT)!=='B'; }
function hasStorm(variant){ return (variant || (g&&g.variant) || AB_VARIANT)!=='A'; }
function isStormTrial(){ return !!g && (g.experiment==='A'||g.experiment==='B'); }
function armCombat(reason){
  if(!g || g.combatStarted) return;
  g.combatStarted=true;
  tEv('combat_arm',{ reason, read_ms:Math.max(0,Math.round(performance.now()-g.t0)) });
}
function wingPositions(count){
  const inner=Math.max(34,Math.min(54,W*.12)),outer=Math.max(inner+24,Math.min(96,W*.22));
  const slots=[[inner,-1],[-inner,-1],[outer,-8],[-outer,-8]];
  return slots.slice(0,Math.max(0,count===undefined?(g&&g.wingUnits||0):count))
    .map((slot,index)=>({ x:Math.max(24,Math.min(W-24,(g?g.ship.x:W/2)+slot[0])), y:H-34+slot[1], index }));
}
function heavyWeaponOrigins(){
  const origins=[{x:g.ship.x,y:H-46,kind:'player'}];
  for(const escort of wingPositions())origins.push({x:escort.x,y:escort.y-22,kind:'escort',index:escort.index});
  return origins;
}
