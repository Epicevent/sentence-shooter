const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cv = $('cv'), ctx = cv.getContext('2d');
$('h-variant').textContent = AB_VARIANT;
let W = 0, H = 0, dpr = 1;

function resize(){
  const oldW = W, oldH = H;
  const before = traceOn && g ? traceScene() : null;
  const r = $('wrap').getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (g && !g.over) reflowViewport(oldW, oldH);
  if (traceOn) tEv('viewport', {
    from: [roundTrace(oldW), roundTrace(oldH)], to: [roundTrace(W), roundTrace(H)],
    dpr: roundTrace(dpr), paused: g?.viewportPaused ? 1 : 0,
    before, after: g ? traceScene() : null,
  });
}
window.addEventListener('resize', resize);

// ---------- audio ----------
let audioCtx = null;
function tone(f0, f1, dur, type, gain){
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g2 = audioCtx.createGain(), t = audioCtx.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g2.gain.setValueAtTime(gain, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g2); g2.connect(audioCtx.destination); o.start(t); o.stop(t + dur);
  } catch(e){}
}
let lastPlink = 0, lastPew = 0;
const sfx = {
  pew:   () => { const n = performance.now(); if (n - lastPew > 70){ lastPew = n; tone(760, 220, .08, 'square', .03); } },
  plink: () => { const n = performance.now(); if (n - lastPlink > 90){ lastPlink = n; tone(1400, 1100, .05, 'square', .04); } },
  boom:  () => tone(150, 40, .3, 'sawtooth', .13),
  hit:   () => tone(120, 45, .35, 'sawtooth', .14),
  up:    () => { tone(440,440,.08,'square',.08); setTimeout(()=>tone(660,660,.08,'square',.08),90); setTimeout(()=>tone(880,880,.14,'square',.08),180); },
  clear: () => { tone(520,520,.09,'square',.07); setTimeout(()=>tone(660,660,.09,'square',.07),100); setTimeout(()=>tone(880,880,.16,'square',.07),200); },
};
function buzz(ms){ try { if (navigator.vibrate) navigator.vibrate(ms); } catch(e){} }

// ---------- game state ----------
const WEAPONS = ['MK-I', 'MK-II', 'MK-III', 'MK-IV', 'MK-V'];
let g = null;
let loopStarted = false;
const moveInput = { left:false, right:false };

