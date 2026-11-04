import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'goldcom-creative-test-'));
process.env.GOLDCOM_STUDIO_DATA=dir;
const {LIBRARY,buildLibraryDoc}=await import('../shared/library.js');
const {ART_DIRECTIONS}=await import('../shared/creative.js');
const {lintDocument}=await import('../shared/lint.js');
const {productionReadiness}=await import('../shared/readiness.js');
const {originalityIssues,reserveConcepts,creativeHistory,finalOriginalityIssues}=await import('../server/ai/originality.mjs');
const {applyCopy,copyInput}=await import('../server/ai/copy-contract.mjs');
const {copyCliArgs,responseText,completeCopy}=await import('../server/ai/copy.mjs');
const {updateSettings}=await import('../server/settings.mjs');
const {runProduction}=await import('../server/ai/pipeline.mjs');
const {getDocument}=await import('../server/store.mjs');
const approved={score:9,verdict:'ship',issues:[],edits:[],caption_fix:'',hashtags_fix:[],summary:'Approved'};
const concepts=(suffix='')=>['paper-cut','blueprint','orbit'].map((family,i)=>({id:['A','B','C'][i],family,hook:[`A handwritten invitation across generations ${suffix}`,`Unfold the anatomy of a choice ${suffix}`,`Three decisions with room to reconsider ${suffix}`][i],angle:`specific angle ${i}${suffix}`,metaphor:['folded invitation','architectural measurement','solar system'][i]+suffix,framing:['overhead desk closeup','side elevation detail','circular overhead map'][i]+suffix,motion:['paper unfolds into envelope','ruler draws dimensions','satellites revolve sequentially'][i]+suffix,narrative:['recipient remembers a personal message','a scale resolves a measurement question','options branch into different destinations'][i]+suffix}));
const storyboard=()=>({title:'A different premise',scenes:[{scene:'paper-cut',purpose:'Explain',duration:4,theme:'cream',transition:'fade',fields:[{key:'title',value:'Provisional Claude wording'},{key:'motif',value:'gift'}],footage:{use:false,footage_id:''},art_note:'Folded paper carries a message'}],caption:{text:'A draft caption',hashtags:[]},music:'none',notes:[]});

test('catalog spans 14 visual styles and all formats, with optional 3D in a small minority',()=>{
 assert.equal(LIBRARY.length,64);assert.equal(new Set(LIBRARY.map(i=>i.medium)).size,15);
 assert.equal(Object.keys(ART_DIRECTIONS).length,14);
 assert.ok(LIBRARY.filter(i=>i.medium==='3d').length/LIBRARY.length<.15);
 assert.equal(new Set(LIBRARY.map(i=>i.kind)).size,6);
 assert.equal(new Set(LIBRARY.map(i=>i.id)).size,LIBRARY.length);
 for(const item of LIBRARY)for(const lang of ['ar','en'])assert.deepEqual(lintDocument(buildLibraryDoc(item,lang)).filter(i=>i.level==='error'),[],`${item.id} ${lang}`);
});

test('a ship verdict cannot approve text plus a logo and decorative shapes',()=>{
 const doc={width:1080,height:1350,slides:[{layers:[{type:'text',text:'Looks approved'},{type:'logo',w:500,h:500},{type:'shape',w:1080,h:1350}]}]};
 assert.equal(productionReadiness(doc,approved).ready,false);
 assert.match(productionReadiness(doc,approved).blockers.join(' '),/Text-only/);
});

test('novelty rejects a repeated Arabic hook and a recoloured identical construction',()=>{
 const c=concepts();c[0].hook='أول جرام على راحتك';
 assert.ok(originalityIssues(c,[{hook:'اول جرام، على راحتك!'}]).length);
 const old={...c[1],hook:'A completely different opening'};
 assert.ok(originalityIssues(c,[old]).some(x=>x.includes('known work')));
 const sb=storyboard();sb.scenes[0].fields[0].value=c[0].hook;
 assert.equal(finalOriginalityIssues(sb,[{hook:c[0].hook}]).length,1);
});

test('atomic reservations prevent concurrent jobs choosing the same ideas and persist across readers',async()=>{
 const result=await Promise.all([reserveConcepts('one',concepts()),reserveConcepts('two',concepts())]);
 assert.equal(result.filter(x=>x.length===0).length,1);
 assert.equal((await creativeHistory()).filter(x=>x.jobId==='one'||x.jobId==='two').length,3);
});

test('bilingual copy preserves layout/media and rejects inserted technical fields or missing scenes',()=>{
 const sb=storyboard();sb.scenes[0].fields.push({key:'footage',value:'/footage/verified/video.mp4'});
 const deck={scenes:[{number:1,fields:[{key:'title',value:'خلّ الهدية بكلامك'}]}],caption:{text:'لحد في بالك',hashtags:['#عمان']}};
 const packet={ar:deck,en:structuredClone(deck)};
 const next=applyCopy(sb,packet,'ar');assert.equal(next.scenes[0].fields.find(f=>f.key==='footage').value,'/footage/verified/video.mp4');
 assert.equal(next.scenes[0].fields[0].value,'خلّ الهدية بكلامك');assert.equal(sb.scenes[0].fields[0].value,'Provisional Claude wording');
 const malicious=structuredClone(packet);malicious.en.scenes[0].fields.push({key:'footage',value:'https://outside.example'});assert.throws(()=>applyCopy(sb,malicious,'ar'),/allowed fields/);
 const missing=structuredClone(packet);missing.ar.scenes=[];assert.throws(()=>applyCopy(sb,missing,'ar'),/every scene/);
});

test('writing CLI isolates user tool configuration and uses schema output without a shell',()=>{
 const args=copyCliArgs({schemaFile:'schema.json',outputFile:'copy.json'});
 assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--ephemeral'));assert.ok(args.includes('read-only'));assert.ok(args.includes('features.shell_tool=false'));assert.equal(args.at(-1),'-');
 assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'),false);
});

test('refused/incomplete text responses and API auth failure never fall back to Claude or another provider',async()=>{
 assert.throws(()=>responseText({status:'incomplete',output:[]}),/incomplete/);
 assert.throws(()=>responseText({output:[{content:[{type:'refusal',refusal:'No'}]}]}),/declined/);
 const original=globalThis.fetch;let calls=0;
 updateSettings({copyEngine:'api',copyModel:'test-model',copyRates:{input:1,output:1},keys:{OPENAI_API_KEY:'mock'}});
 globalThis.fetch=async()=>{calls++;return {ok:false,status:401};};
 try{await assert.rejects(completeCopy({schema:{type:'object'},prompt:'Hello',budgetUsd:1}),/401/);assert.equal(calls,1);}
 finally{globalThis.fetch=original;updateSettings({copyEngine:'codex',keys:{OPENAI_API_KEY:''}});}
});

test('ChatGPT outage stops concept generation without a Claude copy fallback',async()=>{
 let claudeCalls=0;
 const job={id:'no-fallback',prompt:'A fresh Goldcom post',brief:{brand:'Goldcom',lang:'ar',format:'post'},controller:new AbortController(),options:{autoExport:false},log:[]};
 await assert.rejects(runProduction(job,{base:'http://localhost',complete:async()=>{claudeCalls++;},completeCopy:async()=>{throw new Error('ChatGPT unavailable');}}),/ChatGPT unavailable/);
 assert.equal(claudeCalls,0);assert.equal(job.docId,undefined);
});

test('Claude review edits return through ChatGPT before the exact rebuilt document is approved',async()=>{
 let writes=0,reviews=0;
 const job={id:'author-routing',prompt:'A fresh Goldcom post',brief:{brand:'Goldcom',lang:'ar',format:'post'},concepts:concepts('routing'),pick:{winner:'A'},chosen:'A',storyboard:storyboard(),footageDone:true,controller:new AbortController(),options:{autoExport:false,reviewRounds:2},log:[]};
 const write=async()=>{writes++;const input=copyInput(job.storyboard);const deck={scenes:input.scenes.map(s=>({number:s.number,fields:s.fields.map(f=>({...f,value:`ChatGPT final wording ${writes}`}))})),caption:input.caption};return {ar:deck,en:deck};};
 await runProduction(job,{base:'http://localhost',completeCopy:write,complete:async()=>{reviews++;return reviews===1?{...approved,score:6,verdict:'revise',edits:[{scene:1,set:[{key:'title',value:'Claude provisional revision'}]}]}:approved;},reviewFrames:async()=>[]});
 const doc=await getDocument(job.docId);assert.equal(job.status,'done');assert.equal(writes,2);assert.equal(reviews,2);
 assert.equal(doc.slides[0].content.title,'ChatGPT final wording 2');assert.equal(doc.source.copywriter,'ChatGPT');assert.ok(job.copyVariants.ar&&job.copyVariants.en);
});

after(async()=>{await fs.rm(dir,{recursive:true,force:true,maxRetries:3});});
