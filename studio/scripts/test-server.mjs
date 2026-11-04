// Every integration run gets its own server, data, modules and knowledge. No owner instance is used.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'goldcom-integration-'));
const sock=net.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;await new Promise(r=>sock.close(r));
const origin=`http://127.0.0.1:${port}`;
const env={...process.env,PORT:String(port),GOLDCOM_STUDIO_PORT:String(port),GOLDCOM_STUDIO_URL:origin,STUDIO_URL:origin,GOLDCOM_STUDIO_DATA:temp,GOLDCOM_STUDIO_KNOWLEDGE:path.join(temp,'knowledge'),GOLDCOM_STUDIO_MODULES:path.join(temp,'modules')};
await fs.cp(path.join(root,'knowledge'),env.GOLDCOM_STUDIO_KNOWLEDGE,{recursive:true});
await fs.cp(path.join(root,'modules','scenes'),env.GOLDCOM_STUDIO_MODULES,{recursive:true});
await fs.writeFile(path.join(temp,'settings.json'),JSON.stringify({autoUpdateCheck:false,autoRepair:false,captureOrigins:[origin]}));
const server=spawn(process.execPath,[path.join(root,'server','index.mjs')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',d=>process.stdout.write(d));server.stderr.on('data',d=>process.stderr.write(d));
try{
 let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(origin+'/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 if(!ready)throw new Error('Isolated test server did not start');
 const args=process.argv[2]==='http'?['--test',path.join(root,'tests','http.test.mjs')]:[path.join(root,'scripts',process.argv[2]==='creative-live'?'creative-live.mjs':process.argv[2]==='creative'?'creative-scenarios.mjs':process.argv[2]==='ui'?'ui-scenarios.mjs':process.argv[2]==='workspace'?'workspace-scenarios.mjs':process.argv[2]==='motion'?'motion-scenarios.mjs':'smoke-test.mjs')];
 const child=spawn(process.execPath,args,{cwd:root,env,windowsHide:true,stdio:'inherit'});
 process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
}finally{
 if(process.platform==='win32')await new Promise(r=>{const p=spawn('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});p.on('close',r);p.on('error',r);});
 else server.kill('SIGTERM');
 if(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
