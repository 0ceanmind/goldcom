import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './ui.jsx';
import { CapturePanel } from './Capture.jsx';
import { useStudio } from './StudioContext.jsx';
import { LoadingSurface } from './ProductionJourney.jsx';
import { useGoldcomDialog } from './GoldcomDialogs.jsx';

function FootageCard({ f, onDelete, onRename, toast }) {
  const { t } = useStudio();
  const vref = useRef(null);
  const [hover, setHover] = useState(false);
  const [cropping, setCropping] = useState(false);
  // A landscape recording is usually a desktop showing a phone (cloud phone session, mirroring window).
  const wide = f.status === 'ready' && !f.crop && f.width > f.height * 0.9;
  const crop = async (body, ok) => { setCropping(true); try { await api.cropFootage(f.id, body); toast?.(ok); } catch (e) { toast?.(e.message, true); } finally { setCropping(false); } };
  useEffect(() => { const v = vref.current; if (!v) return; if (hover) v.play().catch(() => {}); else { v.pause(); v.currentTime = 0; } }, [hover]);
  const steps = f.steps || [];
  return (
    <div className="ft-card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="ft-media">
        {f.status === 'ready' && f.kind === 'video' && <video ref={vref} src={`/footage/${f.id}/video.mp4`} poster={`/footage/${f.id}/poster.jpg`} muted loop playsInline preload="none" />}
        {f.status === 'ready' && f.kind === 'image' && <img src={`/footage/${f.id}/poster.jpg`} alt="" />}
        {f.status === 'processing' && <div className="ft-wait"><LoadingSurface compact title={t('mediaProcessing')} subtitle={t('mediaProcessingHint')} /></div>}
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
        {wide && <button className="btn sm" disabled={cropping} onClick={() => crop({ auto: true }, 'Cropping to the phone screen…')}>{cropping ? <i className="spin" /> : <Icon name="crop" />}Crop to the phone screen</button>}
        {f.crop && f.status === 'ready' && <button className="btn sm ghost" disabled={cropping} onClick={() => crop({ rect: null }, 'Crop removed')}>Undo crop</button>}
        <div className="ft-actions"><span className="hint">{(f.events || []).filter((e) => e.type === 'tap').length} taps logged</span><button className="btn sm ghost danger" onClick={onDelete}><Icon name="trash" />Delete</button></div>
      </div>
    </div>
  );
}

export default function Footage({ toast }) {
  const { confirmAction } = useGoldcomDialog();
  const { t, advanced } = useStudio();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(0);
  const input = useRef(null);
  const load = () => api.footage().then(data => { setItems(data); setLoaded(true); setLoadError(null); }).catch(error => { setLoaded(true); setLoadError(error.message); });
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('gc:footage', on);
    const timer = setInterval(load, 8000);
    return () => { window.removeEventListener('gc:footage', on); clearInterval(timer); };
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
            <h2>{t('media')}</h2>
            <p className="hint">{t('mediaIntro')}</p>
          </div>
          <button className="btn primary" onClick={() => input.current?.click()}><Icon name="upload" />{t('addRecordings')}</button>
          <input ref={input} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </div>
        <div className={`dropzone${drag ? ' on' : ''}`} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }} onClick={() => input.current?.click()}>
          <Icon name="film" size={28} />
          <b>{t('dropMedia')}</b>
          <span className="hint">{t('dropHint')}</span>
        </div>
        {uploading > 0 && <div className="media-upload-progress"><LoadingSurface compact title={`${t('uploadWorking')} · ${uploading}`} /></div>}
        {loadError ? <div className="studio-empty" role="alert" style={{ marginTop:24 }}><Icon name="warn" /><p>{loadError}</p><button className="btn" onClick={load}>{t('retry')}</button></div> : !loaded ? <LoadingSurface compact /> : items.length ? (
          <div className="ft-grid">
            {items.map((f) => <FootageCard key={f.id} f={f} toast={toast} onDelete={async () => { if (await confirmAction({ title:`Delete “${f.name}”?`,message:'This recording will be removed from the media library.',confirmLabel:'Delete recording' })) { await api.deleteFootage(f.id); load(); } }} onRename={(name) => api.updateFootage(f.id, { name }).then(load)} />)}
          </div>
        ) : <div className="studio-empty" style={{ marginTop:24 }}><span className="empty-gem"><Icon name="film" size={24} /></span><div><h3>{t('emptyMedia')}</h3><p>{t('emptyMediaHint')}</p></div></div>}
      </div>
      <details className="capture-disclosure" open={advanced || undefined}><summary><Icon name="camera" size={22} /><div><b>{t('capture')}</b><span>{t('captureHint')}</span></div><Icon name="down" size={16} /></summary><CapturePanel toast={toast} /></details>
    </div>
  );
}
