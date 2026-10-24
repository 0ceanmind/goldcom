import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './ui.jsx';

/** Follow one job's progress from the server's live events. */
function useJob(onDone) {
  const [job, setJob] = useState(null);
  useEffect(() => {
    if (!job?.id) return undefined;
    const onJob = (e) => {
      const j = e.detail?.job;
      if (!j || j.id !== job.id) return;
      setJob((cur) => ({ ...cur, ...j }));
      if (j.status !== 'running') onDone?.(j);
    };
    window.addEventListener('gc:job', onJob);
    return () => window.removeEventListener('gc:job', onJob);
  }, [job?.id]);
  return [job, setJob];
}

function JobLine({ job }) {
  if (!job) return null;
  return (
    <div className={`job-line ${job.status || 'running'}`}>
      {(job.status || 'running') === 'running' && <i className="spin" />}
      <span>{job.message}{job.status === 'running' && job.progress > 0.02 ? ` · ${Math.round(job.progress * 100)}%` : ''}</span>
    </div>
  );
}

/** Mirror, buttons, recording and "Claude films a flow" for one ready Android device (emulator, cloud or USB). */
export function DeviceControls({ serial, toast, label }) {
  const [dev, setDev] = useState(null);
  const [shot, setShot] = useState(0);
  const [mirror, setMirror] = useState(false);
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useJob((j) => toast(j.status === 'done' ? 'Footage saved to the library' : j.error || j.message, j.status !== 'done'));
  const refresh = () => api.device(serial).then(setDev).catch(() => {});
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [serial]);
  useEffect(() => {
    if (!mirror) return undefined;
    const t = setInterval(() => setShot((n) => n + 1), 1200);
    return () => clearInterval(t);
  }, [mirror]);
  const act = async (fn, ok) => { setBusy(true); try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); return null; } finally { setBusy(false); } };
  const tapMirror = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    api.deviceInput({ serial, action: 'tap', x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }).then(() => setTimeout(() => setShot((n) => n + 1), 500)).catch((er) => toast(er.message, true));
  };
  const rec = dev?.recording === serial;
  return (
    <div className="device-controls">
      <div className="phone-status"><span className="dot live" /><b>{label || dev?.info?.model || serial}</b><span className="hint">{dev?.info ? `Android ${dev.info.android} · ${dev.info.width}×${dev.info.height}` : ''}</span></div>
      <p className="hint">{dev?.pkg ? <>Goldcom app: <code>{dev.pkg}</code></> : 'Goldcom is not installed on this phone yet.'}</p>
      <div className="mirror-wrap">
        {mirror ? <img className="mirror" src={`/api/device/screen?serial=${encodeURIComponent(serial)}&n=${shot}`} alt="Phone screen" onClick={tapMirror} title="Click to tap the phone" />
          : <button className="mirror-off" onClick={() => setMirror(true)}><Icon name="eye" />Show the phone screen</button>}
      </div>
      <div className="row3">
        <button className="btn sm" onClick={() => api.deviceInput({ serial, action: 'back' })}>Back</button>
        <button className="btn sm" onClick={() => api.deviceInput({ serial, action: 'home' })}>Home</button>
        <button className="btn sm" onClick={() => act(() => api.deviceInput({ serial, action: 'launch', fresh: true }), 'Opening Goldcom')}>Open Goldcom</button>
      </div>
      <div className="row">
        <button className="btn sm" disabled={busy} onClick={() => act(() => api.deviceScreenshot('Phone screenshot', serial), 'Screenshot saved to the library')}><Icon name="camera" />Screenshot</button>
        {!rec ? <button className="btn sm" disabled={busy || !!dev?.recording} onClick={() => act(async () => { await api.recordStart(serial); refresh(); }, 'Recording — use the phone, then press Stop')}><span className="rec-dot" />Record</button>
          : <button className="btn sm primary" disabled={busy} onClick={() => act(async () => { await api.recordStop('Screen recording'); refresh(); }, 'Recording saved')}>Stop & save</button>}
      </div>
      <div className="capture-box">
        <label className="lbl">Let Claude film a flow</label>
        <textarea className="input" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. From the home screen, open Browse, open the 1 g bar, tap Buy gold, stop on the review screen before paying" dir="auto" />
        <button className="btn primary" disabled={busy || !goal.trim() || job?.status === 'running'} onClick={() => act(async () => { const { jobId } = await api.deviceCapture(goal.trim(), undefined, serial); setJob({ id: jobId, status: 'running', message: 'Starting…' }); })}><Icon name="claude" />Rehearse & record</button>
        <p className="hint small">Claude rehearses the flow first, then records one clean take. It never confirms payments, sales or gifts. Productions also film missing steps by themselves when this phone is running.</p>
      </div>
      <JobLine job={job} />
    </div>
  );
}

// ---------- phone emulator on this computer ----------
function EmulatorSource({ toast }) {
  const [st, setSt] = useState(null);
  const [accept, setAccept] = useState(false);
  const [headless, setHeadless] = useState(false);
  const refresh = () => api.emulator().then(setSt).catch((e) => setSt({ error: e.message }));
  const [job, setJob] = useJob((j) => { refresh(); if (j.status === 'error') toast(j.error || j.message, true); });
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, []);
  useEffect(() => { const id = st?.installJob || st?.startJob; if (id && !job) setJob({ id, status: 'running', message: 'Working…' }); }, [st?.installJob, st?.startJob]);
  const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); refresh(); return r; } catch (e) { toast(e.message, true); return null; } };
  if (!st) return <p className="hint">Checking…</p>;
  if (st.supported === false) return <p className="note err">{st.unsupported}</p>;
  const running = job?.status === 'running';
  if (!st.installed) {
    return (
      <>
        <p className="hint">Runs a real Android phone with Google Play inside this computer. You install Goldcom on it once from the Play Store, and Claude uses the real app to film clips and screenshots. No phone or cable needed.</p>
        <ul className="facts">
          <li>One-time download from Google: about 2.3 GB.</li>
          <li>Needs about {st.needGb} GB of free disk space{st.freeGb != null ? ` (this drive has ${st.freeGb.toFixed(0)} GB free)` : ''} and 8 GB of RAM or more.</li>
          <li>Windows: “Windows Hypervisor Platform” must be on. The studio checks and helps you switch it on.</li>
        </ul>
        <label className="check"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />I accept the <a href="https://developer.android.com/studio/terms" target="_blank" rel="noreferrer">Android SDK License Agreement</a></label>
        <button className="btn primary" disabled={!accept || running} onClick={() => act(async () => { const { jobId } = await api.emulatorInstall(); setJob({ id: jobId, status: 'running', message: 'Starting…' }); })}><Icon name="download" />Install the phone emulator</button>
        <JobLine job={job} />
      </>
    );
  }
  const accelOff = st.accel && st.accel.checked && !st.accel.ok;
  return (
    <>
      <div className="phone-status"><span className={`dot ${st.state === 'ready' ? 'live' : ''}`} /><b>Goldcom phone</b><span className="hint">Android {st.android} · {st.state === 'ready' ? 'running' : st.state === 'starting' ? 'starting…' : 'stopped'}</span></div>
      {accelOff && (
        <div className="note err">
          {st.accel.message}
          {st.host?.os === 'windows' && <div><button className="btn sm" onClick={() => act(() => api.emulatorEnableHypervisor(), 'Approve the Windows prompt, then restart the computer')}>Turn on Windows Hypervisor Platform</button></div>}
        </div>
      )}
      {st.error && <p className="note err">{st.error}</p>}
      {st.state === 'stopped' && (
        <>
          <button className="btn primary" disabled={running} onClick={() => act(async () => { const { jobId } = await api.emulatorStart(headless); setJob({ id: jobId, status: 'running', message: 'Starting the phone…' }); })}><Icon name="phone" />Start the phone</button>
          <label className="check"><input type="checkbox" checked={headless} onChange={(e) => setHeadless(e.target.checked)} />Run in the background (no phone window)</label>
        </>
      )}
      <JobLine job={job?.status === 'running' ? job : null} />
      {st.state === 'ready' && (
        <>
          {st.goldcomInstalled === false && (
            <div className="setup-steps">
              <b>First time only</b>
              <ol className="howto">
                <li>In the phone window, open <b>Play Store</b> and sign in with a Google account (one from Oman if Goldcom is only listed there).</li>
                <li><button className="btn sm" onClick={() => act(() => api.emulatorOpenStore(), 'Goldcom’s Play Store page is open in the phone')}>Open Goldcom in the Play Store</button> and press <b>Install</b>.</li>
                <li>Open Goldcom and log in. A demo or test account is best, so no real balances are filmed.</li>
              </ol>
            </div>
          )}
          <DeviceControls serial={st.serial} toast={toast} label="Goldcom phone (emulator)" />
          <button className="btn sm ghost" onClick={() => act(() => api.emulatorStop(), 'Phone stopped')}>Stop the phone</button>
        </>
      )}
      {st.state === 'stopped' && (
        <button className="btn sm ghost danger" onClick={() => { if (confirm('Remove the phone emulator and everything on it (frees about 10 GB)? You can install it again later.')) act(() => api.emulatorRemove(), 'Emulator removed'); }}>Remove the emulator</button>
      )}
    </>
  );
}

// ---------- Android phone over USB (optional extra) ----------
function UsbSource({ toast }) {
  const [dev, setDev] = useState(null);
  const [job, setJob] = useJob(() => refresh());
  const refresh = () => api.device().then(setDev).catch(() => setDev({ adb: null, devices: [] }));
  useEffect(() => { refresh(); const t = setInterval(refresh, 6000); return () => clearInterval(t); }, []);
  if (!dev) return <p className="hint">Checking…</p>;
  const usb = (dev.devices || []).filter((d) => !/^emulator-|:\d+$/.test(d.serial));
  const phone = usb.find((d) => d.state === 'device');
  const unauthorized = usb.find((d) => d.state === 'unauthorized');
  if (!dev.adb) {
    return (
      <>
        <p className="hint">Optional: film with your own Android phone over a USB cable.</p>
        <button className="btn" onClick={async () => { try { const { jobId } = await api.installTools(); setJob({ id: jobId, status: 'running', message: 'Installing…' }); } catch (e) { toast(e.message, true); } }}>Install Android tools</button>
        <p className="hint small">Google’s platform tools, about 15 MB.</p>
        <JobLine job={job} />
      </>
    );
  }
  if (!phone) {
    return (
      <>
        <p className="hint">{unauthorized ? 'The phone is connected but not authorised. Unlock it and tap “Allow USB debugging”.' : 'No phone connected. Plug in an Android phone with USB debugging turned on.'}</p>
        <ol className="howto">
          <li>Settings → About phone → tap <b>Build number</b> 7 times.</li>
          <li>Settings → Developer options → turn on <b>USB debugging</b>.</li>
          <li>Connect with USB and tap <b>Allow</b> on the phone.</li>
        </ol>
      </>
    );
  }
  return <DeviceControls serial={phone.serial} toast={toast} />;
}

const SOURCES = [['emulator', 'Emulator'], ['cloud', 'Cloud phone'], ['ios', 'iPhone'], ['usb', 'USB phone']];

/** Right-hand panel of the Footage page: where real app footage comes from. */
export function CapturePanel({ toast, extraSources = {} }) {
  const [src, setSrc] = useState(() => { try { return localStorage.getItem('gc:capture-source') || 'emulator'; } catch { return 'emulator'; } });
  const pick = (k) => { setSrc(k); try { localStorage.setItem('gc:capture-source', k); } catch { /* private mode */ } };
  const Extra = extraSources[src];
  return (
    <aside className="phone-panel">
      <h3><Icon name="phone" size={18} />Film the real app</h3>
      <div className="seg wide">{SOURCES.map(([k, l]) => <button key={k} className={src === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>)}</div>
      {src === 'emulator' && <EmulatorSource toast={toast} />}
      {src === 'usb' && <UsbSource toast={toast} />}
      {Extra && <Extra toast={toast} />}
      <div className="note"><b>Recorded it yourself?</b> Screen recordings from any phone work too: drop the video on the left. Claude splits it into steps and uses it in productions.</div>
    </aside>
  );
}
