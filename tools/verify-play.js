#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
let traceDir = path.resolve(process.env.SHOOTER_TRACE_DIR || path.join(repo, 'traces'));
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--dir') traceDir = path.resolve(process.argv[++i]);
  else throw new Error('usage: node tools/verify-play.js [--dir DIR]');
}
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const buildMatch = html.match(/const BUILD_ID\s*=\s*['"]([^'"]+)['"]/);
if (!buildMatch) throw new Error('BUILD_ID is missing from index.html');
const build = buildMatch[1];
if (!fs.existsSync(traceDir)) throw new Error('trace directory not found: ' + traceDir);

const traces = fs.readdirSync(traceDir).filter(name => /^tr_.*\.json$/.test(name)).map(name => {
  const file = path.join(traceDir, name);
  try { return { file, mtime:fs.statSync(file).mtimeMs, trace:JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch (error) { return { file, mtime:0, error }; }
}).filter(row => !row.error && row.trace && row.trace.meta && row.trace.meta.build === build);

const specs = [
  {craft:'striker',reviewer:'agent-hangar-a',concept:'striker_escort_sweep'},
  {craft:'carrier',reviewer:'agent-hangar-a',concept:'carrier_capture_delivery'},
  {craft:'phantom',reviewer:'agent-hangar-b',concept:'phantom_graze_wipe'},
  {craft:'bulwark',reviewer:'agent-hangar-b',concept:'bulwark_counter_line'},
];

const failures = [], passed = [];
for (const spec of specs) {
  const candidates = traces.filter(row => row.trace.meta.craft === spec.craft && row.trace.meta.reviewer === spec.reviewer)
    .sort((a,b) => b.mtime-a.mtime);
  if (!candidates.length) { failures.push(`${spec.craft}: no ${build} trace for reviewer=${spec.reviewer}`); continue; }
  const row = candidates[0], trace = row.trace, events = Array.isArray(trace.events) ? trace.events : [];
  const samples=Array.isArray(trace.samples)?trace.samples:[];
  const escortMissileSeen=samples.some(sample=>sample.scene&&Array.isArray(sample.scene.missiles)&&
    sample.scene.missiles.some(missile=>missile[9]==='escort'));
  const craftChecks={
    striker:()=>events.some(event=>event.type==='wing_deploy'&&event.after>=4&&event.normal_fire_origins>=5)&&escortMissileSeen&&
      events.some(event=>event.type==='storm_charge'&&event.ready===true)&&
      events.some(event=>event.type==='storm_cast'&&event.steerable===true)&&
      events.some(event=>event.type==='sweep_start'&&event.vy===-600)&&events.some(event=>event.type==='storm_steer'),
    phantom:()=>events.filter(event=>event.type==='graze').length>=4&&events.some(event=>event.type==='bullet_wipe'&&event.cleared>0),
    carrier:()=>events.some(event=>event.type==='cargo_capture')&&events.some(event=>event.type==='cargo_intercept')&&events.some(event=>event.type==='cargo_dock'),
    bulwark:()=>events.some(event=>event.type==='counter_line_start')&&events.some(event=>event.type==='counter_reflect')&&
      events.some(event=>event.type==='counter_line_collapse'&&event.reason==='wrong'),
  };
  const checks = {
    concept: trace.meta.pipeline >= 10 && trace.meta.craft === spec.craft && trace.meta.craft_concept === spec.concept,
    feedback: events.some(event => event.type === 'confirm_feedback' && event.freeze_ms === 50),
    sampled: samples.length>0&&samples.some(sample=>sample.scene&&sample.scene.craft===spec.craft),
    input: events.some(event=>event.type==='focus_confirm'||event.type==='tap_input'),
    phase: events.some(event => event.type === 'heat_volley_armed' && event.arrows > 0 &&
      event.field_unchanged === true && event.heat_integral > 0),
    craft_verb: craftChecks[spec.craft](),
  };
  const missing = Object.entries(checks).filter(([,ok]) => !ok).map(([name]) => name);
  if (missing.length) failures.push(`${spec.reviewer}: ${path.basename(row.file)} missing ${missing.join(', ')}`);
  else passed.push({ craft:spec.craft, reviewer:spec.reviewer, file:path.relative(repo,row.file), events:events.length,
    samples:samples.length });
}

if (failures.length) {
  console.error(`[verify:play] ${build} evidence incomplete`);
  for (const failure of failures) console.error(' - ' + failure);
  process.exitCode = 1;
} else {
  console.log(`[verify:play] ${build} minimum causal evidence present (not a fun verdict)`);
  for (const row of passed) console.log(` - ${row.craft} ${row.reviewer}: ${row.file} · ${row.events} events · ${row.samples} samples`);
}
