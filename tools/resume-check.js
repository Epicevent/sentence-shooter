#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const agentsPath = path.join(repo, 'AGENTS.md');
const indexPath = path.join(repo, 'index.html');
const agents = fs.readFileSync(agentsPath, 'utf8');
const html = fs.readFileSync(indexPath, 'utf8');

// The command deliberately prints the complete UTF-8 contract. Running the gate
// and reading AGENTS.md are therefore one auditable operation after compaction.
process.stdout.write(agents.endsWith('\n') ? agents : agents + '\n');

if (!agents.includes('<!-- CURRENT_CONTRACT_START -->') || !agents.includes('<!-- CURRENT_CONTRACT_END -->'))
  throw new Error('CURRENT_CONTRACT markers are missing from AGENTS.md');

const sections = [...agents.matchAll(/^## v(\d+)\b[^\n]*$/gm)];
if (!sections.length) throw new Error('no versioned contract found in AGENTS.md');
const highest = sections.reduce((best, match) => Number(match[1]) > Number(best[1]) ? match : best);
const latestStart = highest.index;
const laterSection = sections.find(match => match.index > latestStart);
const latestBody = agents.slice(latestStart, laterSection ? laterSection.index : agents.length);
const build = html.match(/const BUILD_ID\s*=\s*['"]([^'"]+)['"]/);
if (!build) throw new Error('BUILD_ID is missing from index.html');
if (!latestBody.includes('`' + build[1] + '`'))
  throw new Error(`build mismatch: index.html=${build[1]}, latest AGENTS section=v${highest[1]}`);

console.log(`\n[resume] OK · build ${build[1]} · live contract v${highest[1]} · AGENTS.md printed in full`);
