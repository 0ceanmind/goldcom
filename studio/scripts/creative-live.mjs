// Explicit live acceptance run, never included in unit tests. Uses the signed-in model accounts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createJob } from '../server/jobs.mjs';
import { runProduction } from '../server/ai/pipeline.mjs';
import { reviewFrames,contactSheet } from '../server/render/review.mjs';
import { getDocument } from '../server/store.mjs';
import { closeBrowser } from '../server/browser.mjs';

const base=process.env.STUDIO_URL;
if(!base||!process.env.GOLDCOM_STUDIO_DATA)throw new Error('Run via scripts/test-server.mjs creative-live');
const out=path.resolve('../verification/creative-update/live');await fs.mkdir(out,{recursive:true});
const job=createJob('production',{prompt:process.env.GOLDCOM_CREATIVE_BRIEF||'Make a 3-slide Goldcom carousel in natural Omani Arabic. The specific insight: a good question helps someone understand gold before they make a decision. Explore one memorable visual metaphor through 3 genuinely different visual compositions: curiosity, understanding, then an invitation to ask. No app screens, no price claims, no returns or growth charts, no 3D. Use substantive 2D art on all 3 slides, very short copy and no generic text/CTA end card. Do not clone the library. Exactly 3 slides.',options:{format:process.env.GOLDCOM_CREATIVE_FORMAT||'carousel',lang:'ar',reviewRounds:2,autoExport:false,capture:false},title:'Live creative acceptance'});
if(process.env.GOLDCOM_CREATIVE_REPAIR) {
  const previous=JSON.parse(await fs.readFile(process.env.GOLDCOM_CREATIVE_REPAIR,'utf8'));
  Object.assign(job,{brief:previous.brief,concepts:previous.concepts,pick:previous.pick,chosen:previous.chosen,storyboard:previous.storyboard,originality:previous.originality,footageDone:true});
}
let stage='';const timer=setInterval(()=>{if(stage!==job.stage){stage=job.stage;console.log(`${stage}: ${job.message}`);}},500);
try{
 const result=await runProduction(job,{base});
 const {controller,...saved}=job;await fs.writeFile(path.join(out,'production.json'),JSON.stringify(saved,null,2));
 console.log(JSON.stringify({result,status:job.status,blockers:job.blockers,usage:job.usage,copywriter:job.copywriter}));
 if(job.docId){const doc=await getDocument(job.docId);await fs.writeFile(path.join(out,'design.json'),JSON.stringify(doc,null,2));const frames=await reviewFrames({base,doc,scale:.4});await contactSheet(frames,{cols:3,out:path.join(out,'preview.jpg')});}
 if(result!=='done')process.exitCode=1;
}catch(e){console.error(e.stack);process.exitCode=1;const {controller,...saved}=job;await fs.writeFile(path.join(out,'production.json'),JSON.stringify({...saved,error:e.message},null,2));}
finally{clearInterval(timer);await closeBrowser();}
