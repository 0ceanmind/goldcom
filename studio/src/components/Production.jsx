import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { normalizeDocument } from '../../shared/schema.js';
import { TEMPLATES } from '../../shared/templates.js';
import { LivePreview } from './Gallery.jsx';
import { StatusPill } from './Home.jsx';
import { Icon, SlideThumb } from './ui.jsx';

const STAGES = [
  ['brief', 'Brief', 'Understanding the request'],
  ['concepts', 'Ideas', 'Three creative directions'],
  ['pick', 'Direction', 'Creative director chooses'],
  ['storyboard', 'Storyboard', 'Scenes, copy, timing'],
  ['footage', 'Footage', 'Real app clips'],
  ['build', 'Build', 'Motion design'],
  ['review', 'Review', 'Art director checks frames'],
  ['export', 'Video', 'Rendering the MP4'],
  ['done', 'Ready', ''],
];
const ORDER = Object.fromEntries(STAGES.map(([k], i) => [k, i]));
const stageIndex = (s) => (s === 'footage-index' ? 0 : s === 'capture' ? ORDER.footage : s === 'choose' ? ORDER.pick : ORDER[s] ?? 0);
const field = (scene, key) => scene.fields?.find((f) => f.key === key)?.value || '';

export default function Production({ id, images, onOpenDoc, onBack, toast }) {
  const [job, setJob] = useState(null);
  const [doc, setDoc] = useState(null);
  const [tab, setTab] = useState('story');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  const load = () => api.job(id).then(setJob).catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
    const onJob = (e) => { if (e.detail?.job?.id === id) load(); };
    window.addEventListener('gc:job', onJob);
    const t = setInterval(load, 5000);
    return () => { window.removeEventListener('gc:job', onJob); clearInterval(t); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const docKey = job?.docId ? `${job.docId}:${job.updatedAt}` : null;
  useEffect(() => {
    if (!job?.docId) return;
    if (job.status === 'running' && doc && !['build', 'review', 'export', 'done'].includes(job.stage)) return;
    api.get(job.docId).then((d) => setDoc(normalizeDocument(d))).catch(() => {});
  }, [docKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job?.log?.length, tab]);
  // Waiting for a concept choice: show the ideas.
  useEffect(() => { if (job?.status === 'waiting') setTab('ideas'); }, [job?.status]);

  if (!job) return <div className="welcome"><p className="hint">Loading production…</p></div>;
  const cur = job.status === 'done' ? ORDER.done : stageIndex(job.stage);
  const video = job.result?.video || job.video;
  const sb = job.storyboard;
  const lastReview = job.reviews?.[job.reviews.length - 1];

  // Render on the server, then download (images for carousels/posts, MP4 for anything animated).
  const download = async (mode, label) => {
    setBusy(true);
    toast(`${label}…`);
    try {
      const { jobId } = await api.exportVideo(job.docId, { mode });
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        const j = await api.job(jobId);
        if (j.status === 'done') { const a = document.createElement('a'); a.href = `${j.result.url}?download`; a.download = j.result.file; document.body.appendChild(a); a.click(); a.remove(); break; }
        if (j.status !== 'running') throw new Error(j.error || j.status);
      }
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  const act = async (fn, msg) => { setBusy(true); try { await fn(); if (msg) toast(msg); load(); } catch (e) { toast(e.message, true); } finally { setBusy(false); } };
  const revise = () => { if (!note.trim()) return; act(() => api.revise(id, note.trim()), 'Applying your changes…'); setNote(''); };

  return (
    <div className="production">
      <div className="prod-head">
        <button className="btn icon ghost" onClick={onBack} title="Back"><Icon name="back" /></button>
        <div className="prod-title">
          <b dir="auto">{job.title || job.prompt}</b>
          <span className="hint" dir="auto">{job.prompt}</span>
        </div>
        <StatusPill status={job.status} />
        {job.usage?.calls ? <span className="hint hide-sm" title="Claude usage for this production">{job.usage.calls} Claude calls{job.usage.costUsd ? ` · $${job.usage.costUsd.toFixed(2)}` : ''}</span> : null}
        <span className="spacer" />
        {job.status === 'running' && <button className="btn" disabled={busy} onClick={() => act(() => api.cancelJob(id), 'Cancelled')}>Stop</button>}
        {(job.status === 'interrupted' || job.status === 'error' || job.status === 'cancelled') && <button className="btn" disabled={busy} onClick={() => act(() => api.resume(id), 'Resuming…')}>Resume</button>}
        {job.docId && <button className="btn" onClick={() => onOpenDoc(job.docId)}><Icon name="grid" />Open in editor</button>}
        {video && <a className="btn primary" href={`${video.url}?download`} download><Icon name="download" />Download MP4</a>}
        {!video && job.docId && job.status === 'done' && doc && !['reel', 'video'].includes(doc.kind) && <button className="btn primary" disabled={busy} onClick={() => download('png', 'Rendering images')}><Icon name="download" />Download images</button>}
        {!video && job.docId && job.status === 'done' && doc && doc.kind !== 'post' && <button className="btn" disabled={busy} onClick={() => download(['reel', 'video'].includes(doc.kind) ? 'sequence' : 'slides', 'Rendering video')}><Icon name="film" />{['reel', 'video'].includes(doc.kind) ? 'Export MP4' : 'Animated MP4s'}</button>}
      </div>

      <div className="stepper">
        {STAGES.map(([k, label, sub], i) => (
          <div key={k} className={`stp ${i < cur ? 'done' : i === cur ? (job.status === 'running' ? 'now' : job.status === 'done' ? 'done' : 'stop') : ''}`}>
            <span className="stp-dot">{i < cur || (job.status === 'done' && i === cur) ? <Icon name="check" size={12} /> : i + 1}</span>
            <div><b>{label}</b><small>{i === cur && job.status === 'running' ? job.message : sub}</small></div>
          </div>
        ))}
      </div>
      {job.status === 'running' && <div className="bar thin wide"><div style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} /></div>}
      {job.status === 'error' && <div className="note err">Something went wrong: {job.error}. Press Resume to try again from where it stopped.</div>}
      {job.status === 'waiting' && <div className="note">Three ideas are ready. Pick one in the Ideas tab and Claude carries on from there.</div>}

      <div className="prod-body">
        <div className="prod-preview">
          {video ? (
            <video key={video.url} src={video.url} controls autoPlay loop playsInline className="final-video" />
          ) : doc && !['reel', 'video'].includes(doc.kind) && doc.slides.length > 1 ? (
            <div className="slide-strip" dir={doc.lang === 'ar' ? 'rtl' : 'ltr'}>
              {doc.slides.map((sl, i) => <div key={sl.id} className="strip-item"><SlideThumb doc={doc} index={i} width={260} images={images} /><span>{i + 1}</span></div>)}
            </div>
          ) : doc ? (
            <div className="preview-frame"><LivePreview doc={doc} images={images} width={340} active /></div>
          ) : (
            <div className="preview-empty"><i className="spin big" /><p className="hint">{job.message || 'Working…'}</p></div>
          )}
          {lastReview && (
            <div className={`score ${lastReview.score >= 8 ? 'good' : lastReview.score >= 6 ? 'ok' : 'low'}`}>
              <b>{lastReview.score}/10</b><span>Art director · round {lastReview.round}</span>
            </div>
          )}
          {(job.status === 'done' || job.status === 'error') && (
            <div className="revise">
              <textarea className="input" rows={2} dir="auto" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ask for changes: “make the hook punchier”, “use a woman for step 2”, “shorter, 15 seconds”…" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) revise(); }} />
              <button className="btn primary" disabled={busy || !note.trim()} onClick={revise}><Icon name="claude" />Apply changes</button>
            </div>
          )}
          {sb?.notes?.length > 0 && (
            <div className="note"><b>Before posting</b><ul>{sb.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
          )}
          {sb?.caption?.text && (
            <div className="caption-box">
              <div className="caption-head"><b>Caption</b><button className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText([sb.caption.text, (sb.caption.hashtags || []).join(' ')].join('\n\n')); toast('Caption copied'); }}><Icon name="copy" />Copy</button></div>
              <p dir="auto">{sb.caption.text}</p>
              <p className="tags" dir="auto">{(sb.caption.hashtags || []).join(' ')}</p>
            </div>
          )}
        </div>

        <div className="prod-side">
          <div className="tabs">
            {[['story', 'Storyboard'], ['ideas', 'Ideas'], ['review', 'Review'], ['brief', 'Brief'], ['log', 'Log']].map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}
          </div>
          <div className="scroll pad">
            {tab === 'brief' && (job.brief ? (
              <dl className="kv">
                {[['Format', job.brief.format], ['Language', job.brief.lang === 'ar' ? 'Arabic' : 'English'], ['Objective', job.brief.objective], ['Audience', job.brief.audience], ['Key message', job.brief.key_message], ['Tone', job.brief.tone], ['Length', job.brief.duration_s ? `${job.brief.duration_s} s` : `${job.brief.slide_count} slides`], ['App flows', job.brief.app_flows_needed?.join(' · ')], ['Assumptions', job.brief.assumptions?.join(' · ')]].map(([k, v]) => v ? <div key={k}><dt>{k}</dt><dd dir="auto">{v}</dd></div> : null)}
              </dl>
            ) : <p className="hint">The brief appears here in a moment.</p>)}

            {tab === 'ideas' && (job.concepts ? (
              <div className="concepts">
                {job.pick && <p className="hint"><b>Director:</b> {job.pick.reason}</p>}
                {job.concepts.map((c) => {
                  const sc = job.pick?.scores?.find((s) => s.id === c.id);
                  const chosen = (job.chosen || job.pick?.winner) === c.id;
                  return (
                    <div key={c.id} className={`concept${chosen ? ' chosen' : ''}`}>
                      <div className="concept-head"><span className="cid">{c.id}</span><b>{c.name}</b>{chosen && <span className="pill claude">Chosen</span>}</div>
                      <p className="hook" dir="auto">“{c.hook}”</p>
                      <p className="hint">{c.angle}</p>
                      <ol className="beats">{c.beats.map((b, i) => <li key={i} dir="auto">{b}</li>)}</ol>
                      {sc && <div className="scores">{['hook', 'clarity', 'brand', 'feasibility', 'originality'].map((k) => <span key={k}>{k} <b>{sc[k]}</b></span>)}</div>}
                      {job.status === 'waiting' && <button className="btn sm primary" disabled={busy} onClick={() => act(() => api.choose(id, c.id), `Continuing with ${c.name}`)}>Use this concept</button>}
                      {job.status === 'done' && !chosen && <button className="btn sm" disabled={busy} onClick={() => act(() => api.choose(id, c.id), `Re-producing with ${c.name}`)}>Make this one instead</button>}
                    </div>
                  );
                })}
                {job.pick?.improvements?.length > 0 && <div className="note"><b>Improvements applied</b><ul>{job.pick.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              </div>
            ) : <p className="hint">Ideas appear after the brief.</p>)}

            {tab === 'story' && (sb ? (
              <div className="scenes">
                {sb.scenes.map((s, i) => (
                  <div key={i} className="scene-row">
                    <span className="n">{i + 1}</span>
                    <div>
                      <div className="scene-meta"><b>{TEMPLATES[s.scene]?.name || s.scene}</b><small>{s.duration}s · {s.theme} · {s.transition}</small></div>
                      {field(s, 'title') && <p dir="auto" className="scene-title">{field(s, 'title').replace(/\*/g, '')}</p>}
                      {(field(s, 'body') || field(s, 'subtitle') || field(s, 'a_text')) && <p dir="auto" className="hint">{(field(s, 'body') || field(s, 'subtitle') || field(s, 'a_text')).replace(/\*/g, '')}</p>}
                      {s.footage?.use && (s.footage.footage_id ? <span className="pill ok">Real footage · {Number(s.footage.from).toFixed(1)}–{Number(s.footage.to).toFixed(1)}s</span> : <span className="pill warn">Needs footage: {s.footage.capture_goal}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="hint">The storyboard appears after the creative direction is chosen.</p>)}

            {tab === 'review' && (job.reviews?.length ? job.reviews.map((r) => (
              <div key={r.round} className="review">
                <div className="review-head"><b>Round {r.round}</b><span className={`pill ${r.score >= 8 ? 'ok' : 'warn'}`}>{r.score}/10 · {r.verdict === 'ship' ? 'ready' : 'revise'}</span></div>
                <p className="hint">{r.summary}</p>
                <ul className="issues">{r.issues.map((x, i) => <li key={i} className={x.severity}><b>{x.scene ? `Scene ${x.scene}` : 'Overall'}</b> {x.problem}</li>)}</ul>
                {r.edits?.length > 0 && <p className="hint">{r.edits.length} fix{r.edits.length > 1 ? 'es' : ''} applied</p>}
              </div>
            )) : <p className="hint">The art director reviews rendered frames after the build.</p>)}

            {tab === 'log' && <div className="log" ref={logRef}>{(job.log || []).map((l, i) => <div key={i}><time>{new Date(l.t).toLocaleTimeString()}</time><span dir="auto">{l.msg}</span></div>)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

