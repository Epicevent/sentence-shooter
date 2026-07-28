'use strict';

const assert = require('assert');
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
    assert.ok(html.includes('id="start-title"') && html.includes("'VECTOR BREACH'") && html.includes("'CORE BREACH'"),
      'portable server must serve the real paired game');

    const source=path.join(__dirname,'..','fixtures','traces','resize-recovery-after.json');
    const raw=fs.readFileSync(source);
    const saved=await fetch(base+'/api/trace',{method:'POST',headers:{'Content-Type':'application/json'},body:raw});
    const receipt=await saved.json();
    assert.strictEqual(saved.status,200);
    assert.strictEqual(receipt.ok,true);
    const files=fs.readdirSync(traceDir).filter(x=>x.endsWith('.json'));
    assert.strictEqual(files.length,1,'one POST must create one game-owned session file');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(traceDir,files[0]))),JSON.parse(raw));

    const invalid=await fetch(base+'/api/trace',{method:'POST',body:'{}'});
    assert.strictEqual(invalid.status,400,'invalid telemetry must not become a session');
    assert.strictEqual(fs.readdirSync(traceDir).filter(x=>x.endsWith('.json')).length,1);
    console.log('portable agent workflow tests passed');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
