'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTraceServer } = require('./dev-server');

(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sentence-shooter-'));
  const traceDir=path.join(temp,'traces');
  const server=createTraceServer({traceDir});
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base='http://127.0.0.1:'+server.address().port;
    const page=await fetch(base+'/game');
    const html=await page.text();
    assert.strictEqual(page.status,200);
    assert.ok(html.includes('id="start-title"') && html.includes("'HEAVY INTERCEPT'") &&
      html.includes("'BLIZZARD FIELD'") && html.includes("'heavy_interceptor_rail_slam'") && html.includes("'blizzard_core_link'"),
      'portable server must serve the real paired game');

    const resumed=childProcess.execFileSync(process.execPath,[path.join(__dirname,'resume-check.js')],{encoding:'utf8'});
    assert.ok(resumed.includes('<!-- CURRENT_CONTRACT_START -->') && resumed.includes('[resume] OK · build torus-24'),
      'resume gate must print the whole contract and verify the live build');

    const source=path.join(__dirname,'..','fixtures','traces','resize-recovery-after.json');
    const raw=fs.readFileSync(source);
    const saved=await fetch(base+'/api/trace',{method:'POST',headers:{'Content-Type':'application/json'},body:raw});
    const receipt=await saved.json();
    assert.strictEqual(saved.status,200);
    assert.strictEqual(receipt.ok,true);
    const files=fs.readdirSync(traceDir).filter(x=>x.endsWith('.json'));
    assert.strictEqual(files.length,1,'one POST must create one game-owned session file');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(traceDir,files[0]))),JSON.parse(raw));

    const proof=(variant,reviewer,concept,events)=>({meta:{pipeline:6,build:'torus-24',ab_variant:variant,reviewer,ab_concept:concept},samples:[],events});
    const aProof=proof('A','agent-a','heavy_interceptor_rail_slam',[
      {type:'assembly_launch',route:'direct_rail_slam'},{type:'assembly_dock',route:'direct_rail_slam'},
      {type:'wing_deploy',after:1,barrels:4},{type:'heat_phase_change',arrows:3},{type:'heat_arrow_hit'},{type:'ship_hit',reason:'heat_arrow'}]);
    const bProof=proof('B','agent-b','blizzard_core_link',[
      {type:'assembly_launch',route:'core_link'},{type:'assembly_dock',route:'core_link'},
      {type:'wake_drive',movement_only:true},{type:'wake_node',reason:'movement'},{type:'heat_phase_change',arrows:3},
      {type:'heat_arrow_hit'},{type:'ship_hit',reason:'heat_arrow'}]);
    for(const proofTrace of[aProof,bProof]){
      const response=await fetch(base+'/api/trace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proofTrace)});
      assert.strictEqual(response.status,200);
    }
    const verified=childProcess.execFileSync(process.execPath,[path.join(__dirname,'verify-play.js'),'--dir',traceDir],{encoding:'utf8'});
    assert.ok(verified.includes('minimum causal evidence present (not a fun verdict)'));

    const invalid=await fetch(base+'/api/trace',{method:'POST',body:'{}'});
    assert.strictEqual(invalid.status,400,'invalid telemetry must not become a session');
    assert.strictEqual(fs.readdirSync(traceDir).filter(x=>x.endsWith('.json')).length,3);
    console.log('portable agent workflow tests passed');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
