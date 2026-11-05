// Art directions are independent of format. Copy stays editable and never lives in a bitmap.
import { ctxHelpers, L, anim, textLayer, pagerLayers, disclaimerLayer } from './layout.js';
import { parseDrawing, EXAMPLE_DRAWING, drawingPlacement } from './drawing.js';

export const ART_DIRECTIONS = {
  'illustrated-scene': { en: 'Bespoke illustration', ar: 'رسم خاص بالفكرة', layout: 'top', motif: 'custom' },
  'photo-story': { en: 'Editorial photography', ar: 'تصوير تحريري', layout: 'photo', image: '/artwork/omani-gift-note.png' },
  'painted-story': { en: 'Painted Omani stories', ar: 'حكايات عُمانية مرسومة', layout: 'photo', image: '/artwork/muscat-connections.png' },
  'paper-cut': { en: 'Paper sculpture', ar: 'قصاصات ورق', layout: 'bottom', motif: 'gift' },
  editorial: { en: 'Editorial collage', ar: 'كولاج تحريري', layout: 'split', motif: 'layers' },
  diagram: { en: 'Visual explainers', ar: 'شرح بصري', layout: 'top', motif: 'process' },
  comic: { en: 'Illustrated conversations', ar: 'سوالف مصوّرة', layout: 'bottom', motif: 'conversation' },
  ticket: { en: 'Die-cut tickets', ar: 'بطاقات مقصوصة', layout: 'inset', motif: 'gift' },
  mosaic: { en: 'Geometric mosaics', ar: 'فسيفساء هندسية', layout: 'split', motif: 'purity' },
  orbit: { en: 'Orbital systems', ar: 'مدارات مترابطة', layout: 'top', motif: 'choice' },
  blueprint: { en: 'Technical drawings', ar: 'رسومات توضيحية', layout: 'bottom', motif: 'weight' },
  calendar: { en: 'Calendar stories', ar: 'حكايات الأيام', layout: 'top', motif: 'time' },
  weave: { en: 'Woven ribbons', ar: 'شرائط متداخلة', layout: 'split', motif: 'connection' },
  contrast: { en: 'Visual contrasts', ar: 'مقارنات بصرية', layout: 'inset', motif: 'choice' },
  construct: { en: 'Constructed typography', ar: 'حروف وتكوين', layout: 'bottom', motif: 'scale' },
};

const commonFields = [
  { key: 'image', label: 'Photo or illustration (image-led directions)', type: 'asset' },
  { key: 'title', label: 'Headline', type: 'textarea' },
  { key: 'detail', label: 'Supporting line (optional)', type: 'textarea' },
  { key: 'motif', label: 'What the artwork explains', type: 'select', options: ['gift', 'weight', 'purity', 'process', 'conversation', 'time', 'choice', 'risk', 'connection', 'layers', 'scale'] },
  { key: 'composition', label: 'Composition', type: 'select', options: ['auto','top','bottom','split','inset'] },
  { key: 'drawing', label: 'Declarative illustration (1000 × 1000)', type: 'code' },
  { key: 'labels', label: 'Diagram labels (one per line)', type: 'list' },
  { key: 'seed', label: 'Composition seed', type: 'number' },
  { key: 'disclaimer', label: 'Risk disclaimer', type: 'select', options: ['no', 'yes'] },
];

export const CREATIVE_TEMPLATES = Object.fromEntries(Object.entries(ART_DIRECTIONS).map(([id, art]) => [id, {
  name: art.en,
  description: `${art.en}: purpose-built 2D artwork with editable type. Explain a specific idea using motif and labels; choose composition deliberately. Never a text-only slide.${art.image?' New productions must supply a new or client-approved image asset; library demonstration imagery is not reused automatically.':''}`,
  fields: commonFields.filter(f=>{
    if(art.image)return ['image','title','disclaimer'].includes(f.key);
    if(f.key==='image')return false;
    if(f.key==='drawing')return id==='illustrated-scene';
    if(['motif','seed'].includes(f.key)&&id==='illustrated-scene')return false;
    if(f.key==='labels')return ['diagram','orbit','contrast','calendar','illustrated-scene'].includes(id);
    return true;
  }),
  example: id==='illustrated-scene'?{title:'Look a little *closer*',drawing:JSON.stringify(EXAMPLE_DRAWING),labels:['A different perspective']}:{ title: 'A gift with *meaning*', motif: art.motif, labels: ['Choose', 'Personalise', 'Send'], seed: 1 },
  layout(c, ctx) {
    const h = ctxHelpers(ctx), s = h.s;
    if(art.image) {
      const title=textLayer(h,{name:'title',text:c.title||'',role:'display',x:h.m,y:h.m+55*s,w:h.cw,lang:ctx.lang,a:'rise',delay:.2});
      title.h=Math.min(h.H*.3,300*s);
      const layers=[L('image',{name:'editorial-image',src:c.image||'',x:0,y:0,w:h.W,h:ctx.H,bleed:'full',radius:0,facet:false,anim:anim('none',0)}),title];
      if(c.disclaimer==='yes')layers.push(disclaimerLayer(h,ctx,h.H-h.m-(ctx.noPager?0:72*s)));
      return [...layers,...pagerLayers(h,ctx)];
    }
    const footer = h.H - h.m - (ctx.noPager ? 0 : 72 * s);
    const top = h.m + 50 * s;
    const bottom = c.disclaimer === 'yes' ? footer - 100 * s : footer;
    const title = textLayer(h, { name: 'title', text: c.title || '', role: h.wide ? 'h1' : 'display', x: h.m, y: top, w: h.cw, lang: ctx.lang, a: id === 'construct' ? 'wipe' : 'rise', delay: .15 });
    // Fixed text envelopes protect Arabic joining/leading and keep graphics clear of the copy.
    const composition=['top','bottom','split','inset'].includes(c.composition)?c.composition:art.layout;
    const split = (composition === 'split' && (h.wide || h.H / h.W < 1.5));
    const textW = split ? h.cw * .47 : h.cw;
    title.w = textW;
    title.x = h.X(h.m, textW);
    title.h = Math.min(bottom - top, split ? (bottom - top) * .5 : (bottom - top) * .28);
    const detailH = c.detail ? Math.min(100 * s, (bottom - top) * .13) : 0;
    let box;
    if (split) {
      title.y = top + (bottom - top) * .15;
      box = { x: h.X(h.m + h.cw * .53, h.cw * .47), y: top, w: h.cw * .47, h: bottom - top };
    } else if (composition === 'bottom') {
      title.y = bottom - title.h - detailH;
      box = { x: h.m, y: top, w: h.cw, h: title.y - top - 26 * s };
    } else if (composition === 'inset') {
      title.y = top + (bottom - top) * .14;
      title.x = h.m + 36 * s; title.w = h.cw - 72 * s;
      box = { x: h.m, y: title.y + title.h + detailH + 30 * s, w: h.cw, h: bottom - title.y - title.h - detailH - 30 * s };
    } else {
      box = { x: h.m, y: top + title.h + detailH + 32 * s, w: h.cw, h: bottom - top - title.h - detailH - 32 * s };
    }
    const labels = (Array.isArray(c.labels) ? c.labels : String(c.labels || '').split('\n')).filter(Boolean).slice(0, 3);
    const layers = [L('artwork', { name: 'concept-art', treatment: id, motif: c.motif || art.motif, seed: Number(c.seed) || 1, ...box, anim: anim('scale', 0, .8) }), title];
    if(id==='illustrated-scene') {
      // Partial JSON while editing must not crash the workspace. The readiness gate rejects it.
      let drawing;try{drawing=parseDrawing(c.drawing);}catch{drawing={shapes:[],labels:[]};}
      layers[0].drawing=drawing;
      const {unit,x:dx,y:dy}=drawingPlacement(drawing,box);
      const allLabels=(Array.isArray(c.labels)?c.labels:String(c.labels||'').split('\n')).filter(Boolean);
      allLabels.slice(0,6).forEach((text,i)=>{
        const pos=drawing.labels[i];if(!pos)return;
        const d=textLayer(h,{name:`diagram-label-${i}`,text,role:'body-lg',x:0,y:dy+pos.y*unit,w:pos.w*unit,align:'center',lang:ctx.lang,delay:.4+i*.1});
        d.x=dx+pos.x*unit;layers.push(d);
      });
    }
    if(id==='comic') {
      for(let i=0;i<2;i++)layers.push(L('character',{name:`illustrated-person-${i}`,style:'flat',spec:{gender:'woman',outfit:'abaya',headwear:'hijab',skin:i?'tan':'medium',pose:i?'thinking':'give-gift',mood:'calm',prop:i?'none':'giftbox',facing:i?'left':'right'},x:box.x+box.w*(i?.60:.08),y:box.y+box.h*.38,w:box.w*.3,h:box.h*.57,anim:anim('rise',.25+i*.2)}));
    }
    if (c.detail) {
      const d = textLayer(h, { name: 'detail', text: c.detail, role: 'small', x: h.m, y: title.y + title.h + 8 * s, w: textW, lang: ctx.lang, color: 'fg2', delay: .35 });
      d.h = detailH; layers.push(d);
    }
    // Labels accompany real nodes. They are separate text layers, so RTL, fonts, export and lint agree.
    if (labels.length && ['diagram', 'orbit', 'contrast', 'calendar'].includes(id)) {
      const cell = box.w / labels.length;
      labels.forEach((text, i) => {
        const d = textLayer(h, { name: `node-${i}`, text, role: 'small', x: h.m + cell * (i + .08), y: box.y + box.h * .78, w: cell * .84, align: 'center', lang: ctx.lang, delay: .4 + .12 * i });
        d.h = box.h * .18; layers.push(d);
      });
    }
    if (c.disclaimer === 'yes') layers.push(disclaimerLayer(h, ctx, footer));
    layers.push(...pagerLayers(h, ctx));
    return layers;
  },
}]));
