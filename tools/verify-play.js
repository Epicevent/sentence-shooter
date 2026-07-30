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
  {variant:'A',reviewer:'agent-storm-a',concept:'big_wing_fixed_wake',steerable:false},
  {variant:'B',reviewer:'agent-storm-b',concept:'big_wing_steerable_wake',steerable:true},
];

const failures = [], passed = [];
for (const spec of specs) {
  const candidates = traces.filter(row => row.trace.meta.ab_variant === spec.variant && row.trace.meta.reviewer === spec.reviewer)
    .sort((a,b) => b.mtime-a.mtime);
  if (!candidates.length) { failures.push(`${spec.variant}: no ${build} trace for reviewer=${spec.reviewer}`); continue; }
  const row = candidates[0], trace = row.trace, events = Array.isArray(trace.events) ? trace.events : [];
  const samples=Array.isArray(trace.samples)?trace.samples:[];
  const escortMissileSeen=samples.some(sample=>sample.scene&&Array.isArray(sample.scene.missiles)&&
    sample.scene.missiles.some(missile=>missile[9]==='escort'));
  const checks = {
    concept: trace.meta.pipeline >= 9 && trace.meta.base_variant === 'C' && trace.meta.ab_concept === spec.concept,
    feedback: events.some(event => event.type === 'confirm_feedback' && event.freeze_ms === 50),
    assembly: ['direct_rail_slam','core_link'].every(route=>
      events.some(event => event.type === 'assembly_launch' && event.route === route) &&
      events.some(event => event.type === 'assembly_dock' && event.route === route)),
    escort: events.some(event => event.type === 'wing_deploy' && event.after >= 4 && event.normal_fire_origins >= 5 && event.reward_flash_ms >= 260) &&
      escortMissileSeen &&
      events.some(event => event.type === 'fusion_reward' && event.escort_ammo > 0 && event.storm_charge > 0) &&
      events.some(event => event.type === 'escort_intercept_spent') &&
      events.some(event => event.type === 'storm_charge' && event.ready === true),
    storm: events.some(event => event.type === 'storm_cast' && event.steerable === spec.steerable && event.vx !== 0) &&
      events.some(event => event.type === 'sweep_start' && event.vy === -600 && event.iframes_ms >= 1600) &&
      events.some(event => event.type === 'sweep_end') &&
      (spec.steerable
        ? events.some(event => event.type === 'storm_steer' && event.before !== event.after)
        : events.some(event => event.type === 'storm_cast_blocked' && event.reason === 'active_fixed')),
    sortie: events.some(event => event.type === 'formation_preload') &&
      events.some(event => event.type === 'sentence_start' && event.streamed === true) &&
      events.some(event => event.type === 'sentence_start' && event.boss === true && event.answer_count >= 8),
    phase: events.some(event => event.type === 'heat_volley_armed' && event.arrows > 0 &&
      event.field_unchanged === true && event.heat_integral > 0),
    hit: events.some(event => event.type === 'heat_arrow_hit') &&
      events.some(event => event.type === 'ship_hit' && event.reason === 'heat_arrow'),
    cooling: events.some(event => event.type === 'thermal_clear_start' && event.heat_before > 0) &&
      events.some(event => event.type === 'thermal_clear_end' && event.heat_after < event.heat_before),
  };
  const missing = Object.entries(checks).filter(([,ok]) => !ok).map(([name]) => name);
  if (missing.length) failures.push(`${spec.reviewer}: ${path.basename(row.file)} missing ${missing.join(', ')}`);
  else passed.push({ variant:spec.variant, reviewer:spec.reviewer, file:path.relative(repo,row.file), events:events.length,
    samples:samples.length });
}

if (failures.length) {
  console.error(`[verify:play] ${build} evidence incomplete`);
  for (const failure of failures) console.error(' - ' + failure);
  process.exitCode = 1;
} else {
  console.log(`[verify:play] ${build} minimum causal evidence present (not a fun verdict)`);
  for (const row of passed) console.log(` - ${row.variant} ${row.reviewer}: ${row.file} · ${row.events} events · ${row.samples} samples`);
}
