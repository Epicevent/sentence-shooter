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
  { variant:'A', reviewer:'agent-a', concept:'heavy_interceptor_rail_slam', assemblyRoute:'direct_rail_slam', reward(events){
    return events.some(event => event.type === 'wing_deploy' && event.after === 1 && event.barrels === 4);
  }, rewardLabel:'heavy escort settle reward' },
  { variant:'B', reviewer:'agent-b', concept:'blizzard_core_link', assemblyRoute:'core_link', reward(events){
    return events.some(event => event.type === 'wake_drive' && event.movement_only === true) &&
      events.some(event => event.type === 'wake_node' && event.reason === 'movement');
  }, rewardLabel:'charged movement-only blizzard' },
];

const failures = [], passed = [];
for (const spec of specs) {
  const candidates = traces.filter(row => row.trace.meta.ab_variant === spec.variant && row.trace.meta.reviewer === spec.reviewer)
    .sort((a,b) => b.mtime-a.mtime);
  if (!candidates.length) { failures.push(`${spec.variant}: no ${build} trace for reviewer=${spec.reviewer}`); continue; }
  const row = candidates[0], trace = row.trace, events = Array.isArray(trace.events) ? trace.events : [];
  const checks = {
    concept: trace.meta.ab_concept === spec.concept,
    assembly: events.some(event => event.type === 'assembly_launch' && event.route === spec.assemblyRoute) &&
      events.some(event => event.type === 'assembly_dock' && event.route === spec.assemblyRoute),
    reward: spec.reward(events),
    phase: events.some(event => event.type === 'heat_phase_change' && event.arrows > 0),
    hit: events.some(event => event.type === 'heat_arrow_hit') &&
      events.some(event => event.type === 'ship_hit' && event.reason === 'heat_arrow'),
  };
  const missing = Object.entries(checks).filter(([,ok]) => !ok).map(([name]) => name);
  if (missing.length) failures.push(`${spec.variant}: ${path.basename(row.file)} missing ${missing.join(', ')} (${spec.rewardLabel})`);
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
