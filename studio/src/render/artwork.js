// Deterministic, native Canvas illustration. No WebGL, generated fake UI, or flattened copy.
import { ICONS } from '../../shared/icons.js';

const SYMBOLS = { gift: 'gift', weight: 'layers', purity: 'scan', process: 'cart', conversation: 'user', time: 'calendar', choice: 'arrow', risk: 'chart', connection: 'heart', layers: 'layers', scale: 'layers' };

export function drawArtwork(c, layer, ctx) {
  const { x, y, w, h } = layer;
  if (w <= 0 || h <= 0) return;
  const light = ['cream', 'bullion'].includes(ctx.theme);
  const ink = light ? '#3B2A1C' : '#FFF8EA';
  const gold = light ? '#8A5A2B' : '#DBA761';
  const paper = light ? '#E9E1CF' : '#2D2E2B';
  const seed = Number(layer.seed) || 1;
  const t = Number.isFinite(ctx.t) ? ctx.t : 2;
  const p = Math.min(1, Math.max(0, t / 1.2));
  const phase=Number.isFinite(ctx.t)?t/Math.max(1,ctx.dur||6)*Math.PI*2:0;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.translate(x, y); c.scale(w / 1000, h / 700);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const rect = (a, b, d, e, fill, r = 0) => { c.fillStyle = fill; c.beginPath(); c.roundRect(a, b, d, e, r); c.fill(); };
  const line = (a, b, d, e, color = gold, width = 4) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(a,b); c.lineTo(d,e); c.stroke(); };
  const circle = (a,b,r,fill,stroke) => { c.beginPath(); c.arc(a,b,r,0,Math.PI*2); if(fill){c.fillStyle=fill;c.fill();} if(stroke){c.strokeStyle=stroke;c.lineWidth=3;c.stroke();} };
  const icon = (a,b,size,name = SYMBOLS[layer.motif] || 'layers',color = ink) => {
    c.save(); c.translate(a-size/2,b-size/2); c.scale(size/24,size/24); c.strokeStyle=color; c.lineWidth=1.15;
    for(const path of ICONS[name] || ICONS.layers) c.stroke(new Path2D(path)); c.restore();
  };
  switch(layer.treatment) {
    case 'paper-cut':
      for(let i=4;i>=0;i--){ c.save(); c.translate(500,340); c.rotate((i-2)*.12+(seed%5)*.025+Math.sin(phase)*i*.012); rect(-260+i*18,-240+i*18,520-i*36,490-i*36,i%2?paper:gold,16); c.restore(); }
      icon(500,330,210,undefined,light?'#FFF8EA':ink); break;
    case 'editorial':
      rect(35,70,540,560,paper); c.save(); c.translate(510,360); c.rotate(-.16); rect(-290,-230,580,460,gold); c.restore();
      for(let i=0;i<7;i++) line(70,130+i*63,300+(i%3)*45,130+i*63,ink,2);
      circle(680,325,180,light?'#FFF8EA':'#151513'); icon(680,325,210); line(580,540,930,540,ink,7); break;
    case 'diagram': {
      const nodes = [[165,270],[500,200],[835,270]];
      line(165,270,500,200,gold,8);line(500,200,835,270,gold,8);
      nodes.forEach(([a,b],i)=>{circle(a,b,95,i===1?gold:paper);icon(a,b,100,['scan',SYMBOLS[layer.motif]||'layers','check'][i],i===1?'#151513':ink);});
      circle(165+670*((1-Math.cos(phase))*.5),270-70*Math.sin(Math.PI*((1-Math.cos(phase))*.5)),12,ink);
      line(165,382,165,475);line(500,312,500,475);line(835,382,835,475); break;
    }
    case 'comic':
      rect(0,30,465,590,paper,28);rect(500,80,490,590,gold,28);
      rect(85,105,300,155,ink,36);rect(590,150,310,155,light?'#FFF8EA':'#151513',36);
      icon(235,180,85,SYMBOLS[layer.motif]||'gift',light?'#FFF8EA':'#151513');icon(745,225,85,'check',gold);break;
    case 'ticket':
      rect(40,60,920,550,paper,24);rect(40,60,270,550,gold,24);
      c.setLineDash([8,15]);line(340,80,340,590,ink,3);c.setLineDash([]);
      icon(175,330,145,undefined,light?'#FFF8EA':'#151513');icon(650,280,200);
      for(let i=0;i<32;i++)rect(480+i*11,460,2+(i*seed%5),75,ink);
      line(470+360*((1-Math.cos(phase))*.5),430,470+360*((1-Math.cos(phase))*.5),555,gold,5);
      break;
    case 'mosaic':
      for(let r=0;r<4;r++)for(let col=0;col<6;col++){
        const a=30+col*160,b=35+r*155;
        rect(a,b,145,140,(r+col+seed)%3?paper:gold,2);
        if((r+col)%2){c.fillStyle=gold;c.beginPath();c.moveTo(a,b);c.lineTo(a+145,b);c.lineTo(a,b+140);c.fill();}
      }
      circle(500,345,145,light?'#FFF8EA':'#151513');icon(500,345,180);break;
    case 'orbit':
      for(let i=1;i<=3;i++){c.strokeStyle=i===2?gold:paper;c.lineWidth=i===2?10:3;c.beginPath();c.ellipse(500,300,130*i,75*i,-.3,0,Math.PI*2);c.stroke();}
      [0,1,2].forEach(i=>{const a=i*2.1+seed*.2+phase;const xx=500+340*Math.cos(a), yy=300+180*Math.sin(a);circle(xx,yy,48,gold);icon(xx,yy,52,['gift','scan','wallet'][i],'#151513');});
      circle(500,300,100,paper);icon(500,300,130);break;
    case 'blueprint':
      for(let i=0;i<20;i++)line(i*53,0,i*53,700,paper,1);
      for(let i=0;i<14;i++)line(0,i*53,1000,i*53,paper,1);
      rect(280,110,440,450,paper,26);icon(500,325,245);
      [[220,110,220,560],[280,630,720,630]].forEach(a=>line(...a,gold,3));
      for(const a of [110,560])line(200,a,240,a,gold,3);for(const a of [280,720])line(a,610,a,650,gold,3);break;
    case 'calendar':
      rect(60,15,880,505,paper,24);rect(60,15,880,95,gold,24);
      for(let i=0;i<7;i++)for(let j=0;j<3;j++){
        const a=130+i*121,b=190+j*125;
        if((i+j*7+seed)%8===0){circle(a,b,43,gold);icon(a,b,48,'check','#151513');}
        else circle(a,b,7,ink);
      }
      for(let i=0;i<5;i++)rect(160+i*160,0,12,65,ink,6);break;
    case 'weave':
      for(let i=0;i<4;i++){
        c.strokeStyle=i%2?paper:gold;c.lineWidth=68;c.beginPath();
        c.moveTo(-30,110+i*140);c.bezierCurveTo(270,50+i*140+Math.sin(phase)*35,540,650-i*100-Math.sin(phase)*35,1030,150+i*100);c.stroke();
      }
      circle(500,350,130,light?'#FFF8EA':'#151513');icon(500,350,165);break;
    case 'contrast':
      rect(20,25,455,480,paper,28);rect(525,25,455,480,gold,28);
      for(let i=0;i<6;i++)line(90+i*48,140,150+i*48,350,ink,10);
      circle(755,265,125,light?'#FFF8EA':'#151513');icon(755,265,160,undefined,gold);
      line(500,70,500,470,ink,2);break;
    case 'construct':
      for(let i=0;i<5;i++){
        const step=(i+1)*45;
        rect(60+i*180,530-step*p,140,step*p+30,i%2?paper:gold,8);
        line(60+i*180,565,200+i*180,565,ink,4);
      }
      c.save();c.translate(500,190);c.rotate(-.12);rect(-155,-110,310,220,paper,4);icon(0,0,175);c.restore();break;
  }
  c.restore();
}
