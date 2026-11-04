import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SelectControl } from './ui.jsx';
import { useStudio } from './StudioContext.jsx';

export function VersionsDialog({ id, onClose, onRestore, toast }) {
  const [versions, setVersions] = useState([]);
  useEffect(() => { api.versions(id).then(setVersions).catch(e => toast(e.message,true)); }, [id]);
  const restore = async v => { try { const current = await api.get(id); await api.restoreVersion(id,v.revision,current.revision); onRestore(); } catch(e) { toast(e.message,true); } };
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><h3>Design history</h3><button className="btn" onClick={onClose}>Close</button></div><div className="modal-body">
    {!versions.length && <p>No earlier versions yet. Each saved change preserves the previous version.</p>}
    {versions.map(v=><div className="row" key={v.revision}><span>Version {v.revision} · {new Date(v.updatedAt).toLocaleString()}</span><button className="btn" onClick={()=>restore(v)}>Restore</button></div>)}
  </div></div></div>;
}

export function EditableBrief({ job, onSaved, toast }) {
  const { t, uiLang } = useStudio();
  const label = (en, ar) => uiLang === 'ar' ? ar : en;
  const [brief,setBrief]=useState(job.brief);
  useEffect(()=>setBrief(job.brief),[job.updatedAt]);
  if (!brief) return <p className="hint">{label('Your brief will appear once we’ve understood your idea.', 'سيظهر الملخص بعد فهم فكرتك.')}</p>;
  const set=(k,v)=>setBrief(b=>({...b,[k]:v}));
  const save=async()=>{try{await api.saveBrief(job.id,brief);toast('Brief saved. Rebuild when ready.');onSaved();}catch(e){toast(e.message,true);}};
  return <div>
    {['objective','audience','key_message','tone'].map(k=><div className="field" key={k}><label htmlFor={`brief-${k}`}>{({objective:label('Objective','الهدف'),audience:label('Audience','الجمهور'),key_message:label('Key message','الرسالة الرئيسية'),tone:label('Tone','الأسلوب')})[k]}</label><textarea id={`brief-${k}`} className="input" dir="auto" value={brief[k]||''} disabled={job.status==='running'} onChange={e=>set(k,e.target.value)}/></div>)}
    <div className="row"><label className="field">{label('Format','الشكل')}<SelectControl className="input" value={brief.format} onChange={e=>set('format',e.target.value)} disabled={job.status==='running'}>{['post','carousel','reel','story','motion'].map(f=><option key={f} value={f}>{t(f)}</option>)}</SelectControl></label><label className="field">{label('Language','اللغة')}<SelectControl className="input" value={brief.lang} onChange={e=>set('lang',e.target.value)} disabled={job.status==='running'}><option value="ar">العربية</option><option value="en">English</option></SelectControl></label></div>
    <div className="row">{[['duration_s',label('Seconds','الثواني')],['slide_count',label('Scenes / slides','عدد المشاهد')]].map(([k,text])=><label className="field" key={k}>{text}<input className="input" type="number" min="0" max="120" value={brief[k] ?? 0} disabled={job.status==='running'} onChange={e=>set(k,Number(e.target.value))}/></label>)}</div>
    <label className="field">{label('Must include — one requirement per line','المتطلبات — مطلب واحد في كل سطر')}<textarea className="input" dir="auto" value={(brief.must_include||[]).join('\n')} disabled={job.status==='running'} onChange={e=>set('must_include',e.target.value.split('\n').filter(Boolean))}/></label>
    <button className="btn primary" disabled={job.status==='running'} onClick={save}>{label('Save brief','حفظ الملخص')}</button>
    {brief.assumptions?.length>0&&<div className="note"><b>{label('Assumptions to check','افتراضات للمراجعة')}</b><ul>{brief.assumptions.map((x,i)=><li key={i} dir="auto">{x}</li>)}</ul></div>}
  </div>;
}

export function CampaignLinks({ campaignId, currentId, onOpen }) {
  const [campaign,setCampaign]=useState(null);
  useEffect(()=>{if(campaignId)api.job(campaignId).then(setCampaign).catch(()=>{});},[campaignId]);
  return campaign ? <div className="note"><b>{campaign.title}</b><div className="row">{campaign.deliverables.map((id,i)=><button className="btn sm" key={id} disabled={id===currentId} onClick={()=>onOpen(id)}>Deliverable {i+1}</button>)}</div></div> : null;
}

export function EvidenceSettings({ toast }) {
  const [facts,setFacts]=useState([]);
  const [pending,setPending]=useState([]);
  const load=()=>api.pendingModules().then(setPending).catch(e=>toast(e.message,true));
  useEffect(()=>{api.facts().then(setFacts).catch(()=>{});load();},[]);
  const change=(i,k,v)=>setFacts(rows=>rows.map((f,n)=>n===i?{...f,[k]:v}:f));
  return <>
    <section><h4>Product facts</h4><p className="hint">The director receives approved facts with their sources. Check these against current product information; the initial entries come from the existing brand register.</p>
      {facts.map((f,i)=><details key={f.id}><summary>{f.claim||'New fact'}</summary>{[['claim','Claim'],['source','Evidence or source'],['approvedBy','Approved by'],['expiresAt','Expiry date (optional)']].map(([k,label])=><div className="field" key={k}><label>{label}</label><input className="input" dir="auto" value={f[k]||''} onChange={e=>change(i,k,e.target.value)}/></div>)}<label className="check"><input type="checkbox" checked={!!f.approved} onChange={e=>change(i,'approved',e.target.checked)}/>Approved for use</label></details>)}
      <div className="row"><button className="btn" onClick={()=>setFacts(x=>[...x,{id:`fact-${Date.now()}`,claim:'',source:'',approvedBy:'',approved:false}])}>Add fact</button><button className="btn" onClick={async()=>{try{await api.saveFacts(facts);toast('Product facts saved');}catch(e){toast(e.message,true);}}}>Save facts</button></div>
    </section>
    <section><h4>Scene proposals</h4><p className="hint">Scene code runs in the editor after approval. Review the complete source before approving it. Automatic repair never approves code.</p>
      {!pending.length&&<p className="hint">No scene proposals waiting.</p>}
      {pending.map(p=><details key={p.digest}><summary>{p.meta.name}</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}}>{p.code}</pre><button className="btn" onClick={async()=>{try{await api.approveModule(p.meta.id,p.digest);toast('Scene approved');load();}catch(e){toast(e.message,true);}}}>Approve this source</button></details>)}
    </section>
  </>;
}
