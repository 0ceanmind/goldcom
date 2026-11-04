import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { SelectControl, Icon } from './ui.jsx';
import { useStudio } from './StudioContext.jsx';
import { MiniActivity } from './ProductionJourney.jsx';
import { useSelectionGlider } from './StudioMotion.jsx';

const EXAMPLES = {
  en: ['Make a step-by-step Reel on how to buy gold in the app', 'Explain what 24K means in a short carousel', 'A 20-second Reel about gifting gold for Eid', 'A Story with a poll: gold or cash for a wedding gift?'],
  ar: ['ريل خطوة بخطوة: كيف تشتري الذهب من التطبيق', 'اشرح معنى عيار ٢٤ في منشور متعدد قصير', 'ريل ٢٠ ثانية عن إهداء الذهب في العيد', 'ستوري: تصويت ذهب أم نقود لهدية الزواج؟'],
};

export function StatusPill({ status }) {
  const { t } = useStudio();
  const label = status === 'needs-attention' ? 'attention' : status;
  return <span className={`status ${status}`}><i className="status-dot" />{t(label)}</span>;
}

function Starter({ itemId, title, subtitle, prompt, onPick, index, selected, useLabel }) {
  return <button className="starter-card direction-option" onClick={() => onPick(prompt)} aria-pressed={selected}>
    <span className="direction-number">{String(index + 1).padStart(2,'0')}</span><span className="direction-icon"><Icon name={itemId === 'post-gift' ? 'gift' : itemId === 'post-app' ? 'phone' : 'bar'} size={22} /></span>
    <span className="direction-copy"><b>{title}</b><span>{subtitle}</span></span><span className="direction-action"><span>{useLabel}</span><Icon name={selected ? 'check' : 'back'} size={16} /></span>
  </button>;
}

export default function Home({ onOpenProduction, onOpenSettings, onGo, toast }) {
  const { t, uiLang, advanced } = useStudio();
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState('auto');
  const [lang, setLang] = useState('ar');
  const [duration, setDuration] = useState(25);
  const [choose, setChoose] = useState(false);
  const [campaign, setCampaign] = useState(false);
  const [deliverables, setDeliverables] = useState(['reel', 'story', 'post']);
  const [cast, setCast] = useState('');
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState(null);
  const [device, setDevice] = useState(null);
  const [footage, setFootage] = useState([]);
  const [recent, setRecent] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const formatGlider = useSelectionGlider(`${format}:${uiLang}:${advanced}`,'button[aria-pressed="true"]');
  const ta = useRef(null);
  const load = () => api.productions().then(jobs => { setRecent(jobs); setLoadError(false); }).catch(() => setLoadError(true));
  useEffect(() => {
    api.settings().then(s => setLang(s.language || 'ar')).catch(() => {});
    api.engine().then(setEngine).catch(() => setEngine({ selected: null }));
    api.device().then(setDevice).catch(() => {});
    api.footage().then(setFootage).catch(() => {});
    load();
    const onJob = () => load();
    window.addEventListener('gc:job', onJob);
    const timer = setInterval(load, 8000);
    return () => { clearInterval(timer); window.removeEventListener('gc:job', onJob); };
  }, []);
  const start = async () => {
    if (busy) return;
    if (!prompt.trim()) { ta.current?.focus(); return; }
    if (engine && !engine.selected) { onOpenSettings(); return; }
    if (campaign && !deliverables.length) { toast(uiLang === 'ar' ? 'اختر شكلًا واحدًا على الأقل للحملة.' : 'Choose at least one campaign format.', true); return; }
    setBusy(true);
    try {
      const options = { format, lang, duration: ['reel', 'story', 'motion', 'auto'].includes(format) ? duration : undefined, chooseConcept: choose };
      const result = campaign ? await api.campaign({ brief: prompt.trim(), cast, line, deliverables: deliverables.map(f => ({ format: f, lang, duration, chooseConcept: choose })) }) : await api.produce(prompt.trim(), options);
      onOpenProduction(result.jobId);
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  const pick = value => { setPrompt(value); ta.current?.focus(); ta.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); };
  const phone = device?.devices?.find(d => d.state === 'device');
  const ready = footage.filter(f => f.status === 'ready');
  const starters = [
    ['post-gift', 'gift', 'giftHint', uiLang === 'ar' ? 'أنشئ ريل قصير يروي قصة إهداء الذهب لشخص عزيز.' : 'Create a short Reel telling a story about gifting gold to someone special.'],
    ['post-app', 'app', 'appHint', EXAMPLES[uiLang][0]],
    ['post-first-gram', 'firstGram', 'firstGramHint', uiLang === 'ar' ? 'قدّم شراء أول جرام ذهب في منشور بسيط وجذّاب.' : 'Introduce buying your first gram of gold in a simple, engaging post.'],
  ];
  return <div className="create-page">
    <section className="create-intro"><div className="page-eyebrow"><span className="tiny-gem" />Goldcom Studio</div><h1>{t('headline')}</h1><p>{t('intro')}</p></section>
    <section className={`composer create-composer ${busy ? 'is-busy' : ''}`} aria-busy={busy}>
      <label htmlFor="creative-brief" className="composer-label">{t('yourIdea')}<span>01</span></label>
      <textarea id="creative-brief" ref={ta} value={prompt} onChange={e => setPrompt(e.target.value)} dir="auto" rows={3} maxLength={12000} placeholder={t('placeholder')} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); start(); } }} />
      <div ref={formatGlider} className="format-picker selection-glider" role="group" aria-label={uiLang === 'ar' ? 'شكل المحتوى' : 'Content format'}>{['auto', 'reel', 'carousel', 'story', 'post', ...(advanced || format === 'motion' ? ['motion'] : [])].map(k => <button key={k} aria-pressed={format === k} onClick={() => setFormat(k)}><Icon name={k === 'auto' ? 'claude' : k === 'reel' || k === 'motion' ? 'film' : k === 'carousel' ? 'copy' : k === 'story' ? 'phone' : 'image'} size={17} />{t(k)}</button>)}</div>
      <div className="creation-actions"><div className="creation-options"><label><Icon name="comment" size={15} /><span className="sr-only">{t('language')}</span><SelectControl aria-label={t('language')} value={lang} onChange={e => setLang(e.target.value)}><option value="ar">العربية</option><option value="en">English</option><option value="auto">{t('auto')}</option></SelectControl></label>{['auto', 'reel', 'story', 'motion'].includes(format) && <label><Icon name="play" size={14} /><span className="sr-only">{t('duration')}</span><SelectControl aria-label={t('duration')} value={duration} onChange={e => setDuration(Number(e.target.value))}>{[15, 25, 35].map(d => <option key={d} value={d}>{d} {t('seconds')}</option>)}</SelectControl></label>}</div><button className="btn primary create-submit" onClick={start} disabled={busy || !prompt.trim()}>{busy ? <><MiniActivity />{t('starting')}</> : <>{t('start')}<Icon name="send" size={17} /></>}</button></div>
      <details className="creation-details" open={advanced || undefined}><summary>{t('moreOptions')}<Icon name="down" size={14} /></summary><div className="creation-detail-body"><label className="check"><input type="checkbox" checked={choose} onChange={e => setChoose(e.target.checked)} />{t('chooseConcept')}</label><p className="hint">{t('chooseHint')}</p><label className="check"><input type="checkbox" checked={campaign} onChange={e => setCampaign(e.target.checked)} />{t('campaign')}</label>{campaign && <div className="campaign-options"><p className="hint">{t('campaignHint')}</p><div className="row">{['reel', 'story', 'post', 'carousel'].map(f => <label className="check" key={f}><input type="checkbox" checked={deliverables.includes(f)} onChange={e => setDeliverables(x => e.target.checked ? [...x, f] : x.filter(k => k !== f))} />{t(f)}</label>)}</div><label className="field">{t('cast')}<input className="input" dir="auto" value={cast} onChange={e => setCast(e.target.value)} /></label><label className="field">{t('campaignLine')}<input className="input" dir="auto" value={line} onChange={e => setLine(e.target.value)} /></label></div>}</div></details>
    </section>
    <section className="inspiration-section direction-section"><div className="direction-intro"><span className="page-eyebrow">{uiLang === 'ar' ? 'نقطة انطلاق' : 'A starting point'}</span><h2>{t('inspiration')}</h2><p>{uiLang === 'ar' ? 'اختر اتجاهًا، ثم صِغ الفكرة بأسلوبك.' : 'Choose a direction, then make the idea your own.'}</p><span className="direction-footnote"><Icon name="text" size={14} />{uiLang === 'ar' ? 'يمكن تعديل كل فكرة' : 'Every idea is yours to edit'}</span></div><div className="direction-content"><div className="starter-grid direction-list">{starters.map(([id, title, subtitle, value],index) => <Starter key={id} itemId={id} index={index} title={t(title)} subtitle={t(subtitle)} prompt={value} selected={prompt === value} onPick={pick} useLabel={uiLang === 'ar' ? prompt === value ? 'تم الاختيار' : 'استخدم الفكرة' : prompt === value ? 'Selected' : 'Use idea'} />)}</div><details className="more-ideas"><summary>{uiLang === 'ar' ? 'المزيد من الأفكار' : 'More ideas'}<Icon name="plus" size={14} /></summary><div className="chips example-prompts">{EXAMPLES[uiLang].map(x => <button key={x} className="chip" dir="auto" onClick={() => pick(x)}><span>{x}</span><Icon name="send" size={14} /></button>)}</div></details></div></section>
    <section className="recent-section"><div className="section-heading"><h2>{t('recent')}</h2><button className="btn ghost" onClick={() => onGo('gallery')}>{t('allProjects')}<Icon name="back" className="forward-icon" size={15} /></button></div>
      {loadError ? <div className="studio-empty"><Icon name="warn" size={24} /><p>{uiLang === 'ar' ? 'تعذّر تحميل المشاريع.' : 'Your productions couldn’t be loaded.'}</p><button className="btn" onClick={load}>{t('retry')}</button></div> : recent === null ? <div className="project-skeleton" aria-label={t('loading')}><i /><i /></div> : recent.length ? <div className="recent-projects">{recent.slice(0, 6).map(j => <button key={j.id} className="recent-project" onClick={() => onOpenProduction(j.id)}><span className={`project-monogram ${j.status}`}><Icon name={j.status === 'done' ? 'check' : 'film'} size={22} /></span><span className="project-name"><b dir="auto">{j.title || j.prompt}</b><small>{new Date(j.createdAt).toLocaleDateString(uiLang === 'ar' ? 'ar-OM' : 'en-GB', { day: 'numeric', month: 'short' })}{j.status === 'running' && j.stage ? ` · ${t(({ concepts: 'ideas', pick: 'direction', choose: 'direction', capture: 'footage', 'footage-index': 'footage' })[j.stage] || j.stage)}` : ''}</small></span><StatusPill status={j.status} /><Icon name="back" className="forward-icon" size={16} /></button>)}</div> : <div className="studio-empty"><span className="empty-gem"><Icon name="claude" size={25} /></span><div><h3>{t('emptyTitle')}</h3><p>{t('emptyHint')}</p></div></div>}
    </section>
    <section className="studio-readiness"><div className="readiness-caption"><Icon name="check" size={16} /><b>{t('setup')}</b><span>{t('setupHint')}</span></div><div className="readiness"><button className={`ready-item ${engine?.selected ? 'ok' : 'bad'}`} onClick={onOpenSettings}><span className="dot" />{engine?.selected ? t('configured') : engine ? t('configure') : t('checking')}</button><button className={`ready-item ${phone ? 'ok' : 'warn'}`} onClick={() => onGo('footage')}><span className="dot" />{t(phone ? 'phoneReady' : 'phoneOptional')}</button><button className={`ready-item ${ready.length ? 'ok' : 'warn'}`} onClick={() => onGo('footage')}><span className="dot" />{ready.length ? `${ready.length} · ${t('mediaReady')}` : t('addMedia')}</button></div></section>
  </div>;
}
