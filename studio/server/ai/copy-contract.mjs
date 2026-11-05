const str={type:'string'};
const deck={type:'object',additionalProperties:false,required:['scenes','caption'],properties:{
  scenes:{type:'array',items:{type:'object',additionalProperties:false,required:['number','fields'],properties:{number:{type:'integer'},fields:{type:'array',items:{type:'object',additionalProperties:false,required:['key','value'],properties:{key:str,value:str}}}}}},
  caption:{type:'object',additionalProperties:false,required:['text','hashtags'],properties:{text:str,hashtags:{type:'array',items:str}}},
}};
export const BILINGUAL_COPY={type:'object',additionalProperties:false,required:['ar','en'],properties:{ar:deck,en:deck}};
export const COPY_FIELDS=new Set(['title','subtitle','kicker','body','caption','detail','label','callout','button','question','answer','items','messages','lines','labels','before','after',
  'a_label','a_text','b_label','b_text','a_name','a_note','b_name','b_note','bubble','big','notifTitle','notifBody','live','time','ticker','beforeLabel','afterLabel','myth','fact','source','rows','sub','options','note','tagline']);
export function copyInput(sb) {
  return {scenes:sb.scenes.map((s,i)=>({number:i+1,scene:s.scene,purpose:s.purpose,art_note:s.art_note,fields:s.fields.filter(f=>COPY_FIELDS.has(f.key))})),caption:sb.caption};
}
export function applyCopy(sb,packet,lang) {
  // Do not let a writing call alter media URLs, layout, prices, scene order or technical fields.
  for(const code of ['ar','en']){
    const deck=packet[code];
    if(!deck||deck.scenes.length!==sb.scenes.length)throw new Error(`ChatGPT ${code} copy must cover every scene`);
    const seen=new Set();
    for(const scene of deck.scenes){
      const source=sb.scenes[scene.number-1];
      if(!source||seen.has(scene.number))throw new Error('ChatGPT copy changed or duplicated the scene order');
      seen.add(scene.number);
      const keys=source.fields.filter(f=>COPY_FIELDS.has(f.key)).map(f=>f.key);
      if(scene.fields.length!==keys.length||new Set(scene.fields.map(f=>f.key)).size!==keys.length||scene.fields.some(f=>!keys.includes(f.key)))throw new Error('ChatGPT copy changed the allowed fields');
      for(const field of scene.fields){
        const original=source.fields.find(f=>f.key===field.key)?.value||'';
        const required=(original.match(/\*[^*]+\*/g)||[]).length;
        if((field.value.match(/\*[^*]+\*/g)||[]).length<required)throw new Error('ChatGPT copy dropped directed emphasis; preserve all marked concepts in both languages');
      }
    }
  }
  const deck=packet[lang];
  return {...sb,caption:deck.caption,scenes:sb.scenes.map((s,i)=>{
    const edits=new Map(deck.scenes.find(x=>x.number===i+1).fields.map(f=>[f.key,f.value]));
    return {...s,fields:s.fields.map(f=>edits.has(f.key)?{...f,value:edits.get(f.key)}:f)};
  })};
}
