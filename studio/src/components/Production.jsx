import { useEffect, useRef, useState } from 'react';
import { EditableBrief, CampaignLinks } from './ReviewControls.jsx';
import { api } from '../api.js';
import { normalizeDocument } from '../../shared/schema.js';
import { TEMPLATES } from '../../shared/templates.js';
import { LivePreview } from './Gallery.jsx';
import { StatusPill } from './Home.jsx';
import { Icon, SlideThumb } from './ui.jsx';
import { useStudio } from './StudioContext.jsx';
import ProductionJourney, { ExportSurface, LoadingSurface } from './ProductionJourney.jsx';
import { useSelectionGlider } from './StudioMotion.jsx';

const field = (scene, key) => scene.fields?.find(f => f.key === key)?.value || '';

export default function Production({ id, images, onOpenDoc, onOpenProduction, onBack, toast }) {
  const { t, advanced, uiLang } = useStudio();
  const [job, setJob] = useState(null);
  const [doc, setDoc] = useState(null);
  const [tab, setTab] = useState('story');
  const tabGlider = useSelectionGlider(`${tab}:${uiLang}:${advanced}`,'button[aria-selected="true"]');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [exportProgress, setExportProgress] = useState(null);
  const detailsRef = useRef(null);
  const logRef = useRef(null);
  const mounted = useRef(true);
  const load = () => api.job(id).then(data => { if (mounted.current) { setJob(data); setLoadError(null); } }).catch(e => { if (mounted.current) setLoadError(e.message); });
  useEffect(() => {
    mounted.current = true;
    load();
    const onJob = e => { if (e.detail?.job?.id === id) load(); };
    window.addEventListener('gc:job', onJob);
    const timer = setInterval(load, 5000);
    return () => { mounted.current = false; window.removeEventListener('gc:job', onJob); clearInterval(timer); };
  }, [id]);
  const docKey = job?.docId ? `${job.docId}:${job.updatedAt}` : null;
  useEffect(() => {
    if (!job?.docId) return;
    let alive = true;
    api.get(job.docId).then(data => { if (alive) setDoc(normalizeDocument(data)); }).catch(() => {});
    return () => { alive = false; };
  }, [docKey]);
  useEffect(() => { if (job?.status === 'waiting') setTab('ideas'); }, [job?.status]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job?.log?.length, tab]);
  useEffect(() => { if (!advanced && tab === 'log') setTab('story'); }, [advanced]);
  if (!job) return loadError ? <div className="studio-empty production-load-error"><Icon name="warn" size={30} /><h2>{t('loadError')}</h2><p>{loadError}</p><button className="btn primary" onClick={load}>{t('retry')}</button><button className="btn ghost" onClick={onBack}>{t('back')}</button></div> : <LoadingSurface title={t('loadProduction')} />;

  const video = job.status === 'done' ? job.result?.video || job.video : null;
  const sb = job.storyboard;
  const lastReview = job.reviews?.at(-1);
  const inspect = key => {
    setTab(key);
    requestAnimationFrame(() => { detailsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }); detailsRef.current?.querySelector(`[data-tab="${key}"]`)?.focus({ preventScroll: true }); });
  };
  const act = async (fn, message) => { if (busy) return; setBusy(true); try { await fn(); if (message) toast(message); await load(); } catch (e) { toast(e.message, true); } finally { if (mounted.current) setBusy(false); } };
  const revise = () => { if (note.trim()) act(async () => { await api.revise(id, note.trim()); setNote(''); }, uiLang === 'ar' ? 'بدأ تطبيق التعديلات.' : 'Your revision is underway.'); };
  const download = async mode => {
    if (busy) return;
    setBusy(true);
    setExportProgress({ p: 0, label: t('exportWorking') });
    try {
      const { jobId } = await api.exportVideo(job.docId, { mode });
      while (mounted.current) {
        const result = await api.job(jobId);
        if (!mounted.current) break;
        setExportProgress({ p: result.progress, msg: result.message });
        if (result.status === 'done') { const a = document.createElement('a'); a.href = `${result.result.url}?download`; a.download = result.result.file; document.body.appendChild(a); a.click(); a.remove(); break; }
        if (result.status !== 'running') throw new Error(result.error || result.status);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (e) { toast(e.message, true); } finally { if (mounted.current) { setBusy(false); setExportProgress(null); } }
  };
  const canRevise = ['done', 'needs-attention', 'error'].includes(job.status);
  const tabs = [['story', 'storyboard'], ['ideas', 'ideas'], ['review', 'review'], ['brief', 'brief'], ...(advanced ? [['log', 'activity']] : [])];
  return <article className="production-page">
    <header className="prod-head production-page-head"><div className="production-heading"><button className="btn icon ghost" onClick={onBack} aria-label={t('back')}><Icon name="back" /></button><div className="prod-title"><b dir="auto">{job.title || job.prompt}</b><span className="hint" dir="auto">{job.brief ? `${t(job.brief.format) || job.brief.format} · ${job.brief.lang === 'ar' ? 'العربية' : 'English'}` : job.prompt}</span></div></div><StatusPill status={job.status} /></header>
    {loadError && <div className="note err" role="alert">{loadError}<button className="btn sm" onClick={load}>{t('retry')}</button></div>}
    <ProductionJourney job={job} onInspect={inspect} />
    <div className="production-actions"><div className="production-inspect-actions"><button className="btn" onClick={() => inspect('brief')} disabled={!job.brief}><Icon name="text" />{t('viewBrief')}</button><button className="btn" onClick={() => inspect('ideas')} disabled={!job.concepts?.length}><Icon name="claude" />{t('exploreIdeas')}</button></div><div className="production-job-actions">{job.status === 'running' && <button className="btn ghost" disabled={busy} onClick={() => act(() => api.cancelJob(id))}><Icon name="square" size={13} />{t('stop')}</button>}{['interrupted', 'error', 'cancelled'].includes(job.status) && <button className="btn primary" disabled={busy} onClick={() => act(() => api.resume(id))}>{busy ? <span className="mini-label">…</span> : <Icon name="play" />}{t('resume')}</button>}{job.status !== 'running' && job.brief && <button className="btn" disabled={busy} onClick={() => act(() => api.rebuild(id))}>{t('rebuild')}</button>}{job.docId && <button className="btn" onClick={() => onOpenDoc(job.docId)}><Icon name="grid" />{t('openEditor')}</button>}{video && <a className="btn primary" href={`${video.url}?download`} download><Icon name="download" />{t('download')}</a>}{!video && job.docId && job.status === 'done' && doc && <button className="btn primary" disabled={busy} onClick={() => download(['reel', 'video'].includes(doc.kind) ? 'sequence' : 'png')}><Icon name="download" />{t(['reel', 'video'].includes(doc.kind) ? 'download' : 'downloadImages')}</button>}{!video && job.docId && job.status === 'done' && doc && !['post', 'reel', 'video'].includes(doc.kind) && <button className="btn" disabled={busy} onClick={() => download('slides')}>MP4</button>}</div></div>
    {job.status === 'error' && <div className="production-notice error" role="alert"><Icon name="warn" /><div><b>{t('errorTitle')}</b><p dir="auto">{job.error}</p></div></div>}
    {job.status === 'waiting' && <div className="production-notice choice" role="status"><Icon name="claude" /><div><b>{t('waitingTitle')}</b><p>{t('waitingSub')}</p></div><button className="btn primary" onClick={() => inspect('ideas')}>{t('exploreIdeas')}</button></div>}
    {job.status === 'needs-attention' && <div className="production-notice error" role="alert"><Icon name="warn" /><div><b>{t('attentionTitle')}</b><ul>{(job.blockers || []).map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></div></div>}
    {doc?.source?.forkedFrom && <div className="note">{uiLang === 'ar' ? 'احتفظنا بنسختك السابقة.' : 'Your previous editor version is preserved.'}<button className="btn sm" onClick={() => onOpenDoc(doc.source.forkedFrom)}>{t('openEditor')}</button></div>}
    <CampaignLinks campaignId={job.campaignId} currentId={id} onOpen={onOpenProduction} />
    <div className={`production-workbench ${doc ? 'has-preview' : ''}`}>
      {doc && <section className="production-result"><div className="section-heading"><h2>{t('result')}</h2>{lastReview && <span className="pill">{lastReview.score}/10 · {t('review')}</span>}</div><div className="result-canvas">{video ? <video key={video.url} src={video.url} controls loop playsInline className="final-video" /> : !['reel', 'video'].includes(doc.kind) && doc.slides.length > 1 ? <div className="slide-strip" dir={doc.lang === 'ar' ? 'rtl' : 'ltr'}>{doc.slides.map((sl, i) => <div key={sl.id} className="strip-item"><SlideThumb doc={doc} index={i} width={240} images={images} /><span>{i + 1}</span></div>)}</div> : <div className="preview-frame"><LivePreview doc={doc} images={images} width={340} active={!window.matchMedia('(prefers-reduced-motion: reduce)').matches} /></div>}</div></section>}
      <section className="production-details" ref={detailsRef} aria-label={t('details')}><div ref={tabGlider} className="tabs selection-glider" role="tablist" aria-label={t('details')}>{tabs.map(([key, label]) => <button key={key} id={`production-tab-${key}`} data-tab={key} role="tab" aria-selected={tab === key} aria-controls="production-tabpanel" className={tab === key ? 'on' : ''} onClick={() => setTab(key)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const current = tabs.findIndex(([k]) => k === tab); const delta = (e.key === 'ArrowRight' ? 1 : -1) * (uiLang === 'ar' ? -1 : 1); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (current + delta + tabs.length) % tabs.length; setTab(tabs[next][0]); e.currentTarget.parentElement.children[next].focus(); } }} tabIndex={tab === key ? 0 : -1}>{t(label)}{key === 'ideas' && job.status === 'waiting' && <span className="tab-notification" />}</button>)}</div>
        <div className="production-tab-content" id="production-tabpanel" role="tabpanel" aria-labelledby={`production-tab-${tab}`}>
          {tab === 'brief' && <EditableBrief job={job} onSaved={load} toast={toast} />}
          {tab === 'ideas' && (job.concepts?.length ? <div className="concepts">{job.pick && <p className="hint" dir="auto">{job.pick.reason}</p>}{job.concepts.map(c => { const score = job.pick?.scores?.find(s => s.id === c.id); const chosen = (job.chosen || job.pick?.winner) === c.id; return <div key={c.id} className={`concept${chosen ? ' chosen' : ''}`}><div className="concept-head"><span className="cid">{c.id}</span><b dir="auto">{c.name}</b>{chosen && <span className="pill claude">{t('chosen')}</span>}</div><p className="hook" dir="auto">{c.hook}</p><p className="hint" dir="auto">{c.angle}</p><ol className="beats">{(c.beats || []).map((beat, i) => <li key={i} dir="auto">{beat}</li>)}</ol>{advanced && score && <div className="scores">{['hook', 'clarity', 'brand', 'feasibility', 'originality'].map(k => <span key={k}>{k}<b>{score[k]}</b></span>)}</div>}{job.status === 'waiting' && <button className="btn primary" disabled={busy} onClick={() => act(() => api.choose(id, c.id))}>{t('useConcept')}<Icon name="send" size={14} /></button>}{['done', 'needs-attention'].includes(job.status) && !chosen && <button className="btn" disabled={busy} onClick={() => act(() => api.choose(id, c.id))}>{t('useConcept')}</button>}</div>; })}</div> : <div className="detail-empty"><Icon name="claude" size={28} /><p>{t('noIdeas')}</p></div>)}
          {tab === 'story' && (sb ? <div className="scenes">{sb.scenes.map((scene, i) => <div key={i} className="scene-row"><span className="n">{String(i + 1).padStart(2, '0')}</span><div><div className="scene-meta"><b>{advanced ? TEMPLATES[scene.scene]?.name || scene.scene : `${t('scene')} ${i + 1}`}</b><small>{scene.duration}s{advanced ? ` · ${scene.theme} · ${scene.transition}` : ''}</small></div>{field(scene, 'title') && <p dir="auto" className="scene-title">{field(scene, 'title').replace(/\*/g, '')}</p>}{(field(scene, 'body') || field(scene, 'subtitle') || field(scene, 'a_text')) && <p dir="auto" className="hint">{(field(scene, 'body') || field(scene, 'subtitle') || field(scene, 'a_text')).replace(/\*/g, '')}</p>}{scene.footage?.use && (scene.footage.footage_id ? <span className="pill ok">{t('footage')} · {Number(scene.footage.from).toFixed(1)}–{Number(scene.footage.to).toFixed(1)}s</span> : <span className="pill warn">{uiLang === 'ar' ? 'تسجيل مطلوب' : 'Recording needed'}: {scene.footage.capture_goal}</span>)}</div></div>)}</div> : <div className="detail-empty"><Icon name="copy" size={28} /><p>{t('noStoryboard')}</p></div>)}
          {tab === 'review' && (job.reviews?.length ? job.reviews.map(r => <div key={r.round} className="review"><div className="review-head"><b>{t('review')} {r.round}</b><span className={`pill ${r.score >= 8 ? 'ok' : 'warn'}`}>{r.score}/10</span></div><p className="hint" dir="auto">{r.summary}</p><ul className="issues">{(r.issues || []).map((issue, i) => <li key={i} className={issue.severity}><b>{issue.scene ? `${t('scene')} ${issue.scene}` : ''}</b> <span dir="auto">{issue.problem}</span></li>)}</ul></div>) : <div className="detail-empty"><Icon name="check" size={28} /><p>{t('noReview')}</p></div>)}
          {tab === 'log' && advanced && <><div className="usage-summary">{job.usage?.calls || 0} AI calls{job.usage?.costUsd ? ` · $${job.usage.costUsd.toFixed(2)} estimated` : ''}{job.usage?.unpricedCopyCalls ? ` · ${job.usage.unpricedCopyCalls} ChatGPT subscription calls (outside USD estimate)` : ''}</div><div className="log" ref={logRef}>{(job.log || []).map((line, i) => <div key={i}><time>{new Date(line.t).toLocaleTimeString()}</time><span dir="auto">{line.msg}</span></div>)}</div></>}
        </div>
      </section>
    </div>
    {canRevise && <section className="production-revision"><div><Icon name="comment" size={22} /><h2>{t('revise')}</h2></div><textarea className="input" rows={2} dir="auto" aria-label={t('revise')} value={note} onChange={e => setNote(e.target.value)} placeholder={t('revisePlaceholder')} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) revise(); }} /><button className="btn primary" disabled={busy || !note.trim()} onClick={revise}><Icon name="claude" />{t('apply')}</button></section>}
    {sb?.notes?.length > 0 && <div className="note posting-notes"><b>{t('beforePosting')}</b><ul>{sb.notes.map((item, i) => <li key={i} dir="auto">{item}</li>)}</ul></div>}
    {sb?.caption?.text && <section className="caption-box"><div className="caption-head"><b>{t('caption')}</b><button className="btn sm ghost" onClick={async () => { try { await navigator.clipboard.writeText([sb.caption.text, (sb.caption.hashtags || []).join(' ')].join('\n\n')); toast(t('copied')); } catch { toast(uiLang === 'ar' ? 'تعذّر النسخ. يمكنك تحديد النص ونسخه.' : 'Select the caption and copy it manually.', true); } }}><Icon name="copy" />{t('copy')}</button></div><p dir="auto">{sb.caption.text}</p><p className="tags" dir="auto">{(sb.caption.hashtags || []).join(' ')}</p></section>}
    {exportProgress && <ExportSurface progress={exportProgress} />}
  </article>;
}
