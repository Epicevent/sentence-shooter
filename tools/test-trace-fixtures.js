'use strict';

const assert=require('assert');
const path=require('path');
const {spawnSync}=require('child_process');

const analyzer=path.join(__dirname,'analyze-trace.js');
function analyze(name){
  const file=path.join(__dirname,'..','fixtures','traces',name);
  const result=spawnSync(process.execPath,[analyzer,file],{encoding:'utf8'});
  assert.strictEqual(result.status,0,result.stderr||result.stdout);
  return result.stdout;
}

const before=analyze('resize-overlap-before.json');
assert.match(before,/"max_pairs":9/,'known-bad fixture must exercise the overlap detector');
assert.match(before,/"max_area_px2":2769/,'known-bad fixture must retain measured overlap area');

const after=analyze('resize-recovery-after.json');
assert.match(after,/"max_pairs":0/,'known-good fixture must remain collision-free');
assert.match(after,/"samples_without_scene":0/,'known-good fixture must retain every dynamic scene');
assert.match(after,/"paused":1/,'known-good fixture must retain viewport pause state');
console.log('trace fixture negative/positive controls passed');
