import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { assertCaptureUrl, privateAddress } from './security.mjs';

// Resolve and validate at the actual connection, closing the DNS-check/connect race.
export async function fetchCaptureResource(url, headers, allowedOrigins) {
  const parsed=await assertCaptureUrl(url,allowedOrigins);
  const explicitlyAllowed=allowedOrigins.includes(parsed.origin);
  return new Promise((resolve,reject)=>{
    const request=(parsed.protocol==='https:'?https:http).request(parsed,{
      method:'GET',headers:{...headers,'accept-encoding':'identity'},
      lookup(host,opts,callback){
        dns.lookup(host,{all:true},(err,addresses)=>{
          if(err)return callback(err);
          if(!addresses.length||!explicitlyAllowed&&addresses.some(a=>privateAddress(a.address)))return callback(new Error('Private capture destination blocked'));
          if(opts.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family);
        });
      },
    },response=>{
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>20*1024*1024){request.destroy(new Error('Capture resource is too large'));return;}chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>{
        const out=Object.fromEntries(Object.entries(response.headers).filter(([k,v])=>v!==undefined&&!['transfer-encoding','connection'].includes(k)).map(([k,v])=>[k,Array.isArray(v)?v.join(', '):v]));
        resolve({status:response.statusCode||502,headers:out,body:Buffer.concat(chunks)});
      });
    });
    request.setTimeout(10000,()=>request.destroy(new Error('Capture resource timed out')));
    request.on('error',reject);request.end();
  });
}
