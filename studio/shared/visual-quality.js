import { ART_DIRECTIONS } from './creative.js';

export function hasSubstantiveVisual(slide, doc = {}) {
  if (slide.bg?.type === 'image' && slide.bg.src) return true;
  return (slide.layers || []).some(l => {
    if(l.hidden || l.opacity === 0 || l.w <= 0 || l.h <= 0)return false;
    if(doc.width && doc.height && l.w*l.h < doc.width*doc.height*.035)return false;
    if(l.type === 'artwork')return !!ART_DIRECTIONS[l.treatment] && !!l.motif;
    if(['image','phone','browser'].includes(l.type))return !!l.src;
    if(l.type === 'scene3d')return !!l.scene;
    if(l.type === 'chart')return l.points?.length>=3;
    if(l.type === 'character')return !!l.spec;
    if(['chat','notification','sticker','goldbar','prop','progress','countdown'].includes(l.type))return true;
    return false;
  });
}

export function visualIssues(doc) {
  return (doc.slides || []).flatMap((s,i)=>hasSubstantiveVisual(s,doc)?[]:[{level:'error',slide:i,layer:null,message:'Text-only slide: add an idea-specific illustration, diagram, real image, footage or optional 3D scene. Logos, borders and decorative shapes do not count.'}]);
}
