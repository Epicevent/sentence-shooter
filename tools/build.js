#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const repo=path.resolve(__dirname,'..');
const sourceFiles=[
  'shell.head.html','items.js','bootstrap.js','trace.js','game.js','heat.js',
  'gameplay.js','combat.js','input.js','loop.js','render.js','events.js','shell.tail.html',
];
const output=sourceFiles.map(file=>fs.readFileSync(path.join(repo,'src',file),'utf8')).join('');
const target=path.join(repo,'index.html');
if(process.argv.includes('--check')){
  const current=fs.readFileSync(target,'utf8');
  if(current!==output){
    console.error('[build] index.html is stale; run npm run build');
    process.exitCode=1;
  }else console.log('[build] index.html matches src/*');
}else{
  fs.writeFileSync(target,output);
  console.log('[build] wrote index.html from '+sourceFiles.length+' source fragments');
}
