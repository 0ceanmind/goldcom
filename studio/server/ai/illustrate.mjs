// Turn visual intent into real drawable art, rather than leaving instructions in art_note.
import { ART_DIRECTIONS } from '../../shared/creative.js';
import { DRAWING_SCHEMA, parseDrawing } from '../../shared/drawing.js';

const str={type:'string'};
export const ILLUSTRATIONS={type:'object',additionalProperties:false,required:['scenes'],properties:{scenes:{type:'array',items:{type:'object',additionalProperties:false,required:['number','composition','drawing','labels'],properties:{number:{type:'integer'},composition:{type:'string',enum:['top','bottom','split','inset']},drawing:DRAWING_SCHEMA,labels:{type:'array',maxItems:6,items:str}}}}}};
export function needsIllustration(scene) {
  if(!ART_DIRECTIONS[scene.scene])return false;
  // Existing editorial assets must be provided by the client or generated explicitly; never use demo images.
  if(['photo-story','painted-story'].includes(scene.scene))return !scene.fields.some(f=>f.key==='image'&&f.value);
  return !scene.realized;
}

export function applyIllustrations(sb,result,indices) {
  if(result.scenes.length!==indices.length||new Set(result.scenes.map(s=>s.number)).size!==indices.length||result.scenes.some(s=>!indices.includes(s.number)))throw new Error('Illustration build must cover exactly the requested scenes');
  const map=new Map(result.scenes.map(s=>[s.number,s]));
  return {...sb,scenes:sb.scenes.map((scene,i)=>{
    const built=map.get(i+1);if(!built)return scene;
    const drawing=parseDrawing(built.drawing);
    if(drawing.labels.length!==built.labels.length)throw new Error('Every illustration label needs a drawable position');
    const fields=scene.fields.filter(f=>['title','detail','disclaimer'].includes(f.key));
    fields.push({key:'drawing',value:JSON.stringify(drawing)},{key:'labels',value:built.labels.join('\n')},{key:'composition',value:built.composition});
    return {...scene,scene:'illustrated-scene',fields,realized:true};
  })};
}

export async function realizeIllustrations(sb,{call,brief,request}) {
  const selected=sb.scenes.map((s,i)=>({...s,number:i+1})).filter(needsIllustration);
  if(!selected.length)return sb;
  if(/photograph|photoreal|real photo|صورة فوتوغرافية|تصوير فوتوغرافي/i.test(request)&&selected.some(s=>['photo-story','painted-story'].includes(s.scene)))throw new Error('This brief requires a new photographic asset. Generate or supply the image through the director image tools before rebuilding; a vector drawing cannot substitute for the requested photograph.');
  const prompt=`You are Claude, the illustration builder. Compile the following visual ideas into ACTUAL rendered shapes. The renderer DOES NOT execute art_note prose.\nClient request: ${request}\nBrief: ${JSON.stringify(brief)}\nScenes: ${JSON.stringify(selected)}\nBuild an original, cohesive editorial illustration for EACH scene, with a materially different composition and scale across the sequence. Use the proposed visual metaphor where it is feasible. Simplify impossible effects into deliberate, beautiful 2D craft; never pretend to have rendered photography, metallic reflections, 3D, blur or a material that shapes cannot produce.\nThe artboard is 1000 x 1000. Supported shapes: rect, ellipse (x,y are top-left and w,h the diameters), path (SVG path data d) and line (x,y,x2,y2). All shapes have fill, stroke, width and opacity. Use only the fields allowed for that shape. Use 'none' for absent paint. Geometry must stay inside 40..960 with reasonable breathing room. Only supported brand colours or hex: onyx, charcoal, graphite, slate, gold, bronze, bronzeDeep, cream, mist, white, sand. Compose 12–28 useful shapes per scene: layered silhouettes, clear focal object, refined ruled annotation, meaningful negative space. Gold in this medium is a graphic illustration, never evidence of a real product. No generic central icon inside a rectangle. Do not attempt realistic hands, fingers or faces using crude geometric blocks. Unless anatomy is explicitly essential, communicate exchange, curiosity and invitation with well-drawn objects, messages, routes and editorial silhouettes. Simplify the idea into convincing graphic craft instead of imitating a photograph. No wallpaper, gradients, sparkles, random grids or decorative visual clutter.\nNo text inside paths, no logos or brand marks. A maximum of 3 short labels per scene, each with a matching position {x,y,w} inside the drawing; text is drawn separately and finalised by ChatGPT. Keep all label boxes (height about 85 artboard units) separated from focal art and from each other. On dark themes text is white; on cream themes text is dark, so place label boxes on compatible backgrounds. Do not add facts or claims. Main title is outside the artboard. Choose composition top, bottom, split or inset to frame THIS scene. A client-requested count is binding; do not add or remove scenes.`;
  let error='';
  for(let attempt=0;attempt<2;attempt++){
    const result=await call({schema:ILLUSTRATIONS,prompt:prompt+(error?`\nFix this validation error: ${error}`:''),maxTokens:16000,effort:'medium'});
    try{return applyIllustrations(sb,result,selected.map(s=>s.number));}catch(e){error=e.message;}
  }
  throw new Error(`Could not compile the custom illustrations: ${error}`);
}
