import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './ui.jsx';

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

function PhonePanel({ toast }) {
  const [dev, setDev] = useState(null);
  const [shot, setShot] = useState(0);
  const [mirror, setMirror] = useState(false);
  const [goal, setGoal] = useState('');
  const [job, setJob] = useState(null);
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef(null);

  const refresh = () => api.device().then((d) => { setDev(d); setRec(!!d.recording); }).catch(() => setDev({ adb: null, devices: [] }));
  useEffect(() => { refresh(); const t = setInterval(refresh, 6000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!mirror) return;
    const t = setInterval(() => setShot((n) => n + 1), 1200);
    return () => clearInterval(t);
  }, [mirror]);
  useEffect(() => {
    const onJob = (e) => { const j = e.detail?.job; if (j && job && j.id === job.id) setJob({ ...job, ...j, line: e.detail.line || job.line }); };
    window.addEventListener('gc:job', onJob);
    return () => window.removeEventListener('gc:job', onJob);
  }, [job]);

  const phone = dev?.devices?.find((d) => d.state === 'device');
  const unauthorized = dev?.devices?.find((d) => d.state === 'unauthorized');
  const act = async (fn, ok) => { setBusy(true); try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); return null; } finally { setBusy(false); } };
  const tapMirror = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    api.deviceInput({ action: 'tap', x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }).then(() => setTimeout(() => setShot((n) => n + 1), 500)).catch((er) => toast(er.message, true));
  };

  return (
    <aside className="phone-panel">
      <h3><Icon name="phone" size={18} />Phone capture</h3>
      {!dev ? <p className="hint">Checking…</p> : !dev.adb ? (
        <>
          <p className="hint">Connect an Android phone with the Goldcom app and Claude can operate the real app and record clean, professional takes (status bar set to 9:41, full battery, every tap logged).</p>
          <button className="btn primary" disabled={busy} onClick={() => act(async () => { const { jobId } = await api.installTools(); setJob({ id: jobId, message: 'Installing…' }); }, 'Installing Android tools…')}>Install Android tools</button>
          <p className="hint small">Downloads Google’s official Android platform tools (about 15 MB) into the studio folder.</p>
          <ShareHowTo />
        </>
      ) : !phone ? (
        <>
          <p className="hint">{unauthorized ? 'The phone is connected but not authorised. Unlock it and tap “Allow USB debugging”.' : 'No phone connected. Plug in an Android phone with USB debugging turned on.'}</p>
          <ol className="howto">
            <li>Settings → About phone → tap <b>Build number</b> 7 times.</li>
            <li>Settings → Developer options → turn on <b>USB debugging</b>.</li>
            <li>Connect with USB and tap <b>Allow</b> on the phone.</li>
          </ol>
          <ShareHowTo />
        </>
      ) : (
        <>
          <div className="phone-status"><span className="dot live" /><b>{phone.model || phone.serial}</b><span className="hint">{dev.info ? `Android ${dev.info.android} · ${dev.info.width}×${dev.info.height}` : ''}</span></div>
          <p className="hint">{dev.pkg ? <>Goldcom app: <code>{dev.pkg}</code></> : 'Goldcom app not found on this phone — install it or set its package name in Settings.'}</p>
          <div className="mirror-wrap">
            {mirror ? <img ref={imgRef} className="mirror" src={`/api/device/screen?n=${shot}`} alt="Phone screen" onClick={tapMirror} title="Click to tap the phone" /> : <button className="mirror-off" onClick={() => setMirror(true)}><Icon name="eye" />Show the phone screen</button>}
          </div>
          <div className="row3">
            <button className="btn sm" onClick={() => api.deviceInput({ action: 'back' })}>Back</button>
            <button className="btn sm" onClick={() => api.deviceInput({ action: 'home' })}>Home</button>
            <button className="btn sm" onClick={() => act(() => api.deviceInput({ action: 'launch', fresh: true }), 'Opening Goldcom')}>Open Goldcom</button>
          </div>
          <div className="row">
            <button className="btn sm" disabled={busy} onClick={() => act(() => api.deviceScreenshot('Phone screenshot'), 'Screenshot saved to the library')}><Icon name="camera" />Screenshot</button>
            {!rec ? <button className="btn sm" disabled={busy} onClick={() => act(async () => { await api.recordStart(); setRec(true); }, 'Recording — use the phone, then press Stop')}><span className="rec-dot" />Record</button>
              : <button className="btn sm primary" disabled={busy} onClick={() => act(async () => { await api.recordStop('Screen recording'); setRec(false); }, 'Recording saved')}>Stop & save</button>}
          </div>
          <div className="capture-box">
            <label className="lbl">Let Claude film a flow</label>
            <textarea className="input" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. From the home screen, open Browse, open the 1 g bar, tap Buy gold, stop on the review screen before paying" dir="auto" />
            <button className="btn primary" disabled={busy || !goal.trim() || job?.status === 'running'} onClick={() => act(async () => { const { jobId } = await api.deviceCapture(goal.trim()); setJob({ id: jobId, status: 'running', message: 'Starting…' }); })}><Icon name="claude" />Rehearse & record</button>
            <p className="hint small">Claude rehearses the flow first, then records one clean take. It never confirms payments, sales or gifts.</p>
          </div>
        </>
      )}
      {job && (
        <div className={`job-line ${job.status || 'running'}`}>
          {job.status === 'running' && <i className="spin" />}<span>{job.message}</span>
        </div>
      )}
    </aside>
  );
}

function ShareHowTo() {
  return (
    <div className="note">
      <b>iPhone or no cable?</b> Record the screen on the phone (Control Centre → Screen Recording), go through the flow slowly, then drop the video here. Claude splits it into steps and uses it in productions.
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
      <PhonePanel toast={toast} />
    </div>
  );
}
