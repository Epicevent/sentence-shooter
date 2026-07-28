#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_TRACE_DIR = path.join(REPO_ROOT, 'traces');
const DEFAULT_LIMIT = 12_000_000;

function sendJson(res, status, value){
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(value));
}

function readBody(req, limit){
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, failed = false;
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > limit){
        failed = true;
        const err = new Error('trace exceeds '+limit+' bytes'); err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function validTrace(trace){
  return !!trace && typeof trace === 'object' && !!trace.meta &&
    Number(trace.meta.pipeline) >= 1 && Array.isArray(trace.samples) && Array.isArray(trace.events);
}

function uniqueTracePath(traceDir){
  const base = 'tr_' + Date.now();
  let candidate = path.join(traceDir, base+'.json'), suffix = 1;
  while (fs.existsSync(candidate)) candidate = path.join(traceDir, base+'_'+suffix+++'.json');
  return candidate;
}

function createTraceServer(options={}){
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const traceDir = path.resolve(options.traceDir || DEFAULT_TRACE_DIR);
  const traceLimit = options.traceLimit || DEFAULT_LIMIT;
  return http.createServer(async (req,res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health')
      return sendJson(res,200,{ok:true,repo:repoRoot,traces:traceDir});

    if (req.method === 'POST' && url.pathname === '/api/trace'){
      try {
        const raw = await readBody(req,traceLimit);
        const trace = JSON.parse(raw.toString('utf8'));
        if (!validTrace(trace)) return sendJson(res,400,{ok:false,error:'invalid trace schema'});
        fs.mkdirSync(traceDir,{recursive:true});
        const target = uniqueTracePath(traceDir);
        fs.writeFileSync(target,raw);
        return sendJson(res,200,{ok:true,id:path.basename(target,'.json'),file:path.relative(repoRoot,target)});
      } catch (err){
        return sendJson(res,err.statusCode||400,{ok:false,error:String(err.message||err)});
      }
    }

    if (req.method === 'GET' && ['/', '/game', '/game/', '/index.html'].includes(url.pathname)){
      try {
        const html = fs.readFileSync(path.join(repoRoot,'index.html'));
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        return res.end(html);
      } catch (err){ return sendJson(res,500,{ok:false,error:String(err.message||err)}); }
    }
    sendJson(res,404,{ok:false,error:'not found'});
  });
}

function parseArgs(argv){
  const options = {host:'127.0.0.1',port:7777,traceDir:DEFAULT_TRACE_DIR};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--host') options.host=argv[++i];
    else if(argv[i]==='--port') options.port=Number(argv[++i]);
    else if(argv[i]==='--traces') options.traceDir=path.resolve(argv[++i]);
    else throw new Error('usage: node tools/dev-server.js [--host HOST] [--port PORT] [--traces DIR]');
  }
  if(!Number.isInteger(options.port)||options.port<0||options.port>65535) throw new Error('invalid port');
  return options;
}

if(require.main===module){
  const options=parseArgs(process.argv.slice(2));
  const server=createTraceServer({traceDir:options.traceDir});
  server.listen(options.port,options.host,()=>{
    const address=server.address();
    console.log('sentence-shooter dev server: http://'+options.host+':'+address.port);
    console.log('trace directory: '+path.resolve(options.traceDir));
  });
}

module.exports={createTraceServer,validTrace,parseArgs,DEFAULT_LIMIT};
