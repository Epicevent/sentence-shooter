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
    assert.ok(html.includes('id="start-title"') && html.includes("'DRIFT STORM'") && html.includes("'STEER STORM'") &&
      html.includes("'fusion_fixed_drift_storm'") && html.includes("'fusion_steerable_drift_storm'"),
      'portable server must serve both C-based manual storm candidates');

    const resumed=childProcess.execFileSync(process.execPath,[path.join(__dirname,'resume-check.js')],{encoding:'utf8'});
    assert.ok(resumed.includes('<!-- CURRENT_CONTRACT_START -->') && resumed.includes('[resume] OK · build torus-26'),
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

    const sessionId='checkpoint-test-01';
    const checkpoint=(sampleOffset,eventOffset,samples,events)=>({meta:{pipeline:8,build:'torus-26',session_id:sessionId,
      sample_offset:sampleOffset,event_offset:eventOffset},samples,events});
    const cp1=await fetch(base+'/api/trace-checkpoint',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(checkpoint(0,0,[{t:1}],[{t:1,type:'sentence_start'}]))});
    assert.strictEqual(cp1.status,200);
    const cp2=await fetch(base+'/api/trace-checkpoint',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(checkpoint(1,1,[{t:2}],[{t:2,type:'wake_node'}]))});
    assert.strictEqual(cp2.status,200);
    const checkpointFile=path.join(traceDir,'tr_'+sessionId+'.json');
    const checkpointTrace=JSON.parse(fs.readFileSync(checkpointFile));
    assert.deepStrictEqual(checkpointTrace.samples.map(x=>x.t),[1,2]);
    assert.deepStrictEqual(checkpointTrace.events.map(x=>x.type),['sentence_start','wake_node']);
    assert.strictEqual(checkpointTrace.meta.complete,false);

    const proof=(variant,reviewer,concept,steerable)=>({meta:{pipeline:8,build:'torus-26',base_variant:'C',ab_variant:variant,reviewer,ab_concept:concept},
      samples:[{scene:{missiles:[[100,200,0,-200,0,0,'',5,900,'escort']]}}],events:[
      {type:'assembly_launch',route:'direct_rail_slam'},{type:'assembly_dock',route:'direct_rail_slam'},
      {type:'assembly_launch',route:'core_link'},{type:'assembly_dock',route:'core_link'},
      {type:'wing_deploy',after:4,normal_fire_origins:5,reward_flash_ms:260},
      {type:'fusion_reward',escort_ammo:1,storm_level:2,storm_charge:1},{type:'escort_intercept_spent',remaining:0},
      {type:'storm_charge',ready:true},{type:'storm_cast',steerable,vx:34},
      steerable?{type:'storm_steer',before:1,after:-1}:{type:'storm_cast_blocked',reason:'active_fixed'},
      {type:'heat_volley_armed',arrows:3,field_unchanged:true,heat_integral:.4},
      {type:'heat_arrow_hit'},{type:'ship_hit',reason:'heat_arrow'},
      {type:'thermal_clear_start',reason:'sentence_clear',heat_before:.4},
      {type:'thermal_clear_end',reason:'sentence_clear',heat_before:.4,heat_after:.1}]});
    for(const proofTrace of[
      proof('A','agent-storm-a','fusion_fixed_drift_storm',false),
      proof('B','agent-storm-b','fusion_steerable_drift_storm',true)]){
      const response=await fetch(base+'/api/trace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proofTrace)});
      assert.strictEqual(response.status,200);
    }
    const verified=childProcess.execFileSync(process.execPath,[path.join(__dirname,'verify-play.js'),'--dir',traceDir],{encoding:'utf8'});
    assert.ok(verified.includes('minimum causal evidence present (not a fun verdict)'));

    const invalid=await fetch(base+'/api/trace',{method:'POST',body:'{}'});
    assert.strictEqual(invalid.status,400,'invalid telemetry must not become a session');
    assert.strictEqual(fs.readdirSync(traceDir).filter(x=>x.endsWith('.json')).length,4);
    console.log('portable agent workflow tests passed');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
