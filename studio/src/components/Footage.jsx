import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './ui.jsx';
import { CapturePanel } from './Capture.jsx';

function FootageCard({ f, onDelete, onRename }) {
  const vref = useRef(null);
  const [hover, setHover] = useState(false);
  useEffect(() => { const v = vref.current; if (!v) return; if (hover) v.play().catch(() => {}); else { v.pause(); v.currentTime = 0; } }, [hover]);
  const steps = f.steps || [];
  return (
    <div className="ft-card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="ft-media">
        {f.status === 'ready' && f.kind === 'video' && <video ref={vref} src={`/footage/${f.id}/video.mp4`} poster={`/footage/${f.id}/poster.jpg`} muted loop playsInline preload="none" />}
        {f.status === 'ready' && f.kind === 'image' && <img src={`/footage/${f.id}/poster.jpg`} alt="" />}
        {f.status === 'processing' && <div className="ft-wait"><i className="spin" />Processing…</div>}
        {f.status === 'error' && <div className="ft-wait err">{f.error || 'Could not process'}</div>}
        {f.kind === 'video' && f.duration ? <span className="ft-dur">{Number(f.duration).toFixed(1)}s</span> : null}
        <span className={`ft-src ${f.source}`}>{f.source === 'device' ? 'Phone' : f.source === 'web' ? 'Web' : 'Upload'}</span>
      </div>
      <div className="ft-info">
        <input className="ft-name" defaultValue={f.name} onBlur={(e) => e.target.value !== f.name && onRename(e.target.value)} dir="auto" />
        {f.labels?.summary && <p className="hint" dir="auto">{f.labels.summary}</p>}
        {!f.labels && f.status === 'ready' && <p className="hint">Claude indexes this the next time it produces something.</p>}
        {f.labels?.sensitive && <span className="pill warn">Personal data visible</span>}
        {steps.length > 0 && <div className="ft-steps">{steps.map((s, i) => <span key={i} title={`${Number(s.t).toFixed(1)}s`} dir="auto">{s.caption || s.screen}</span>)}</div>}
        {!steps.length && f.segments?.some((s) => s.label) && <div className="ft-steps">{f.segments.filter((s) => s.label).map((s, i) => <span key={i} dir="auto">{s.label}</span>)}</div>}
        <div className="ft-actions"><span className="hint">{(f.events || []).filter((e) => e.type === 'tap').length} taps logged</span><button className="btn sm ghost danger" onClick={onDelete}><Icon name="trash" />Delete</button></div>
      </div>
    </div>
  );
}

export default function Footage({ toast }) {
  const [items, setItems] = useState([]);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(0);
  const input = useRef(null);
  const load = () => api.footage().then(setItems).catch(() => {});
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('gc:footage', on);
    return () => window.removeEventListener('gc:footage', on);
  }, []);
  const upload = async (files) => {
    const list = [...files].filter((f) => /video|image/.test(f.type) || /\.(mp4|mov|m4v|webm|png|jpe?g)$/i.test(f.name));
    if (!list.length) return toast('Drop screen recordings (MP4/MOV) or screenshots (PNG/JPG).', true);
    setUploading((n) => n + list.length);
    for (const f of list) {
      try { await api.uploadFootage(f); toast(`Added ${f.name}`); } catch (e) { toast(`${f.name}: ${e.message}`, true); } finally { setUploading((n) => n - 1); }
    }
    load();
  };
  return (
    <div className="footage-page">
      <div className="footage-main scroll" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
        <div className="footage-head">
          <div>
            <h2>Footage</h2>
            <p className="hint">Real recordings and screenshots of the Goldcom app. Claude watches them, learns the screens and buttons, and cuts them into productions.</p>
          </div>
          <button className="btn primary" onClick={() => input.current?.click()}><Icon name="upload" />Add recordings</button>
          <input ref={input} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </div>
        <div className={`dropzone${drag ? ' on' : ''}`} onClick={() => input.current?.click()}>
          <Icon name="film" size={28} />
          <b>Drop screen recordings or screenshots here</b>
          <span className="hint">MP4 or MOV from iPhone or Android, PNG or JPG. Long recordings are fine: they are split into steps automatically.{uploading ? ` Uploading ${uploading}…` : ''}</span>
        </div>
        {items.length ? (
          <div className="ft-grid">
            {items.map((f) => <FootageCard key={f.id} f={f} onDelete={async () => { if (confirm(`Delete “${f.name}”?`)) { await api.deleteFootage(f.id); load(); } }} onRename={(name) => api.updateFootage(f.id, { name }).then(load)} />)}
          </div>
        ) : <p className="empty">No footage yet.</p>}
      </div>
      <CapturePanel toast={toast} />
    </div>
  );
}
