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

const specs = ['agent-fusion-a','agent-fusion-b'].map(reviewer=>({variant:'C',reviewer,concept:'fusion_rail_blizzard'}));

const failures = [], passed = [];
for (const spec of specs) {
  const candidates = traces.filter(row => row.trace.meta.ab_variant === spec.variant && row.trace.meta.reviewer === spec.reviewer)
    .sort((a,b) => b.mtime-a.mtime);
  if (!candidates.length) { failures.push(`${spec.variant}: no ${build} trace for reviewer=${spec.reviewer}`); continue; }
  const row = candidates[0], trace = row.trace, events = Array.isArray(trace.events) ? trace.events : [];
  const checks = {
    concept: trace.meta.ab_concept === spec.concept,
    assembly: ['direct_rail_slam','core_link'].every(route=>
      events.some(event => event.type === 'assembly_launch' && event.route === route) &&
      events.some(event => event.type === 'assembly_dock' && event.route === route)),
    reward: events.some(event => event.type === 'fusion_reward' && event.escort_ammo > 0 && event.storm_level > 0) &&
      events.some(event => event.type === 'escort_intercept_spent') &&
      events.some(event => event.type === 'wake_drive' && event.movement_only === true) &&
      events.some(event => event.type === 'wake_node' && event.reason === 'movement'),
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
    samples:Array.isArray(trace.samples)?trace.samples.length:0 });
}

if (failures.length) {
  console.error(`[verify:play] ${build} evidence incomplete`);
  for (const failure of failures) console.error(' - ' + failure);
  process.exitCode = 1;
} else {
  console.log(`[verify:play] ${build} minimum causal evidence present (not a fun verdict)`);
  for (const row of passed) console.log(` - ${row.variant} ${row.reviewer}: ${row.file} · ${row.events} events · ${row.samples} samples`);
}
