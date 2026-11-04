// Starter packs demonstrate different visual media. 3D remains an optional editor capability.
import { SHOWCASE_LIBRARY } from './showcase.js';
const from=(id,lang)=>SHOWCASE_LIBRARY.find(i=>i.id===id).build(lang).slides;
export const STARTERS = {
  launch:{name:'Explore Goldcom',description:'A graphic story of the available choices, with orbital and diagram scenes.',kind:'carousel',format:'feed-portrait',build:lang=>from('reel-choices',lang)},
  project:{name:'Explain an idea visually',description:'Technical drawings and geometric construction, one visual explanation per slide.',kind:'carousel',format:'feed-portrait',build:lang=>from('carousel-label',lang)},
  gift:{name:'A personal gifting story',description:'Woven connections and orbital storytelling, with conversational Omani or English copy.',kind:'reel',format:'story',build:lang=>from('reel-gift-note',lang)},
  price:{name:'Understand a price snapshot',description:'A visual reminder to check the recording date. Add a current verified price when needed.',kind:'post',format:'feed-portrait',build:lang=>from('post-price-snapshot',lang)},
  appstore:{name:'App Store screenshots',description:'Add verified Goldcom screenshots to these app layouts before export.',kind:'carousel',format:'appstore',build:lang=>[
    {template:'app-step',theme:'onyx',content:{title:lang==='ar'?'شيّك الوزن أول':'Check the weight first',footage:'',step:'1'}},
    {template:'ui-zoom',theme:'cream',content:{title:lang==='ar'?'اقرأ التفاصيل زين':'Read the details carefully',footage:''}},
    {template:'paper-cut',theme:'cream',content:{title:lang==='ar'?'خلّ القرار قرارك':'The decision stays yours',motif:'choice',disclaimer:'yes'}},
  ]},
  blank:{name:'Blank',description:'An empty canvas. Add a meaningful visual before exporting.',kind:'carousel',format:'feed-portrait',build:()=>[{template:null,theme:'onyx',content:null,layers:[]}]},
};
