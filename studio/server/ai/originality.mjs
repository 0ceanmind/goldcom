// Compare with known work, reserve concepts atomically, and keep history across server/MCP restarts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, listDocuments, getDocument } from '../store.mjs';
import { atomicWrite, withFileLock } from '../files.mjs';
import { LIBRARY } from '../../shared/library.js';

const FILE=path.join(DATA_DIR,'creative-history.json');
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670*]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const words=s=>new Set(normalize(s).split(' ').filter(w=>w.length>1&&!['the','and','for','your','with','from','this','that','في','من','على','لك','مع'].includes(w)));
const overlap=(a,b)=>{const x=words(a),y=words(b);if(!x.size||!y.size)return 0;return [...x].filter(w=>y.has(w)).length/Math.min(x.size,y.size);};
export const signatureOf=c=>({hook:c.hook||'',angle:c.angle||'',metaphor:c.metaphor||'',family:c.family||c.visual_style||'',framing:c.framing||'',motion:c.motion||'',narrative:c.narrative||(c.beats||[]).join(' | ')});

export function originalityIssues(concepts, history=[]) {
  const issues=[];
  if(concepts.length!==3||new Set(concepts.map(c=>c.id)).size!==3)issues.push('Supply exactly three distinct concepts A, B and C.');
  for(let i=0;i<concepts.length;i++){
    const c=concepts[i],s=signatureOf(c);
    for(const old of [...history,...concepts.slice(0,i).map(signatureOf)]){
      const sameHook=normalize(s.hook).length>8&&normalize(s.hook)===normalize(old.hook);
      const similarHook=words(s.hook).size>=4&&overlap(s.hook,old.hook)>=.85;
      const dimensions=['metaphor','family','framing','motion','narrative'].filter(k=>s[k]&&old[k]&&overlap(s[k],old[k])>=.8);
      if(sameHook||similarHook||dimensions.length>=4)issues.push(`Concept ${c.id}: too close to known work (${sameHook||similarHook?'opening line':dimensions.join(', ')}). Change the premise and visual construction.`);
    }
  }
  if(new Set(concepts.map(c=>normalize(c.family))).size<3)issues.push('The three concepts must use three different visual families.');
  return [...new Set(issues)];
}

async function ledger(){try{return JSON.parse(await fs.readFile(FILE,'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
export async function creativeHistory({excludeJob,excludeDoc}={}) {
  const saved=(await ledger()).filter(x=>x.jobId!==excludeJob);
  const docs=(await listDocuments()).filter(d=>d.id!==excludeDoc);
  const entries=await Promise.all(docs.map(async d=>{
    const doc=await getDocument(d.id);
    return {hook:doc.slides[0]?.content?.title||(doc.slides[0]?.layers||[]).find(l=>l.name==='title')?.text||doc.name,family:doc.slides.map(s=>s.template).join(' | '),narrative:doc.slides.map(s=>s.content?.title||'').join(' | '),name:doc.name};
  }));
  return [...saved,...entries,...LIBRARY.flatMap(i=>['ar','en'].map(lang=>({hook:i.build(lang).slides[0]?.content?.title||i.name[lang],family:i.medium||'3d',name:i.name[lang]})))];
}

export async function reserveConcepts(jobId,concepts,{excludeDoc}={}) {
  return withFileLock(FILE,async()=>{
    const history=await creativeHistory({excludeJob:jobId,excludeDoc});
    const issues=originalityIssues(concepts,history);
    if(issues.length)return issues;
    const saved=(await ledger()).filter(x=>x.jobId!==jobId);
    saved.push(...concepts.map(c=>({...signatureOf(c),jobId,at:new Date().toISOString()})));
    await atomicWrite(FILE,JSON.stringify(saved,null,2));
    return [];
  });
}

export function historyPrompt(history) {
  // Keep the prompt bounded; deterministic checking still compares against the full archive.
  return JSON.stringify(history.slice(-180));
}

export function finalOriginalityIssues(sb,history) {
  const hook=sb.scenes?.[0]?.fields?.find(f=>f.key==='title')?.value||'';
  const narrative=(sb.scenes||[]).map(s=>s.fields.find(f=>f.key==='title')?.value||'').join(' | ');
  return history.some(h=>(normalize(hook).length>8&&normalize(hook)===normalize(h.hook)) || (words(narrative).size>=5&&h.narrative&&overlap(narrative,h.narrative)>.92))
    ? ['The final opening or narrative repeats known work. Develop a new premise and visual construction before exporting.'] : [];
}
