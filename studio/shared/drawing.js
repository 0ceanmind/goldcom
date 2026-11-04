// Declarative illustration only. No JavaScript, HTML, network requests or embedded text.
import { COLORS } from './brand.js';
const TYPES=new Set(['rect','ellipse','path','line']);
const paint=v=>v==='none'||Object.hasOwn(COLORS,v)||/^#[0-9a-f]{6}$/i.test(v||'');
const finite=(v,min=-200,max=1200)=>Number.isFinite(v)&&v>=min&&v<=max;
export function parseDrawing(value) {
  let drawing;
  try{drawing=typeof value==='string'?JSON.parse(value):value;}catch{throw new Error('Illustration must be valid drawing JSON');}
  if(!drawing||!Array.isArray(drawing.shapes)||drawing.shapes.length<3||drawing.shapes.length>120)throw new Error('Illustration needs 3–120 drawable shapes');
  for(const shape of drawing.shapes){
    if(!shape||!TYPES.has(shape.type))throw new Error('Illustration supports rect, ellipse, path and line only');
    if(shape.fill&&!paint(shape.fill)||shape.stroke&&!paint(shape.stroke))throw new Error('Illustration colours must be brand tokens or hex colours');
    if(shape.opacity!==undefined&&!finite(shape.opacity,0,1)||shape.width!==undefined&&!finite(shape.width,0,40))throw new Error('Invalid illustration opacity or stroke width');
    if(shape.type==='path'){
      if(typeof shape.d!=='string'||shape.d.length>16000||!/^[MmLlHhVvCcSsQqTtAaZz0-9eE\s.,+\-]+$/.test(shape.d))throw new Error('Illustration paths must contain SVG path data only');
    }else{
      const keys=shape.type==='line'?['x','y','x2','y2']:['x','y','w','h'];
      if(keys.some(k=>!finite(shape[k])))throw new Error('Illustration coordinates must fit the 1000 × 1000 artboard');
      if(shape.type!=='line'&&(shape.w<=0||shape.h<=0))throw new Error('Illustration shapes need positive dimensions');
    }
  }
  if(drawing.shapes.filter(s=>(s.opacity??1)>0&&(s.fill&&s.fill!=='none'||s.stroke&&s.stroke!=='none')).length<3)throw new Error('Illustration needs at least three visible shapes');
  const labels=Array.isArray(drawing.labels)?drawing.labels:[];
  if(labels.length>6||labels.some(l=>!finite(l.x,0,1000)||!finite(l.y,0,1000)||!finite(l.w,40,1000)))throw new Error('Invalid illustration label positions');
  return {...drawing,labels};
}

const number={type:'number'},string={type:'string'};
const paints={fill:string,stroke:string,width:number,opacity:number};
const shapeSchema=(properties)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export const DRAWING_SCHEMA={type:'object',additionalProperties:false,required:['shapes','labels'],properties:{
  shapes:{type:'array',minItems:3,maxItems:64,items:{anyOf:[
    shapeSchema({type:{type:'string',enum:['rect','ellipse']},x:number,y:number,w:number,h:number,...paints}),
    shapeSchema({type:{type:'string',enum:['line']},x:number,y:number,x2:number,y2:number,stroke:string,width:number,opacity:number}),
    shapeSchema({type:{type:'string',enum:['path']},d:string,...paints}),
  ]}},
  labels:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['x','y','w'],properties:{x:{type:'number'},y:{type:'number'},w:{type:'number'}}}},
}};

export const EXAMPLE_DRAWING={shapes:[
  {type:'rect',x:180,y:210,w:440,h:470,fill:'graphite',stroke:'gold',width:4},
  {type:'rect',x:230,y:270,w:340,h:340,fill:'bronzeDeep'},
  {type:'path',d:'M 290 450 L 390 335 L 505 450 L 390 560 Z',fill:'gold',stroke:'sand',width:4},
  {type:'ellipse',x:360,y:250,w:400,h:400,fill:'none',stroke:'gold',width:18},
  {type:'ellipse',x:382,y:272,w:356,h:356,fill:'none',stroke:'sand',width:3},
  {type:'path',d:'M 699 600 L 855 780 L 815 815 L 655 632 Z',fill:'bronze',stroke:'gold',width:4},
  {type:'line',x:180,y:730,x2:570,y2:730,stroke:'stone',width:3},
],labels:[{x:130,y:770,w:440}]};
