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
export function DeviceControls({ serial, toast, label, autoMirror = false }) {
  const [dev, setDev] = useState(null);
  const [shot, setShot] = useState(0);
  const [mirror, setMirror] = useState(autoMirror);
  const [typed, setTyped] = useState('');
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
        {mirror ? <img className="mirror" src={`/api/device/screen?serial=${encodeURIComponent(serial)}&n=${shot}`} alt="Phone screen" onClick={tapMirror} onError={() => setMirror(false)} title="Click to tap the phone" />
          : <button className="mirror-off" onClick={() => setMirror(true)}><Icon name="eye" />Show the phone screen</button>}
      </div>
      {mirror && (
        <div className="row type-row">
          <input className="input" value={typed} placeholder="Type into the phone (e.g. an email)" onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && typed) { api.deviceInput({ serial, action: 'text', text: typed }).then(() => { setTyped(''); setShot((n) => n + 1); }).catch((er) => toast(er.message, true)); } }} />
          <button className="btn sm" disabled={!typed} onClick={() => api.deviceInput({ serial, action: 'text', text: typed }).then(() => { setTyped(''); setShot((n) => n + 1); }).catch((er) => toast(er.message, true))}>Type</button>
        </div>
      )}
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
      <label className="btn sm ghost file-btn"><Icon name="upload" />Install app file (.apk)
        <input type="file" accept=".apk,application/vnd.android.package-archive" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) act(async () => { toast(`Installing ${f.name}…`); await api.installApk(f, serial); refresh(); }, 'App installed'); }} />
      </label>
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

function CrashDetails({ crash, toast }) {
  const [open, setOpen] = useState(false);
  const text = `Goldcom phone emulator crash\nWhen: ${crash.at}\nCode: ${crash.code}\nMode: ${crash.level}\nAfter: ${crash.afterSec} s\n\n${crash.log || '(no log)'}`;
  return (
    <div className="crash">
      <div className="row">
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} crash details</button>
        <button className="btn sm ghost" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Crash details copied')).catch(() => setOpen(true))}>Copy details</button>
      </div>
      {open && <pre className="crash-log">{text}</pre>}
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
      {job?.status === 'error' ? <p className="note err">{job.error || job.message}</p> : st.error && <p className="note err">{st.error}</p>}
      {st.lastCrash && st.state !== 'ready' && <CrashDetails crash={st.lastCrash} toast={toast} />}
      {st.state === 'stopped' && (
        <>
          <button className="btn primary" disabled={running} onClick={() => act(async () => { setJob(null); const { jobId } = await api.emulatorStart(headless); setJob({ id: jobId, status: 'running', message: 'Starting the phone…' }); })}><Icon name="phone" />Start the phone</button>
          {!st.headless && <label className="check"><input type="checkbox" checked={headless} onChange={(e) => setHeadless(e.target.checked)} />Run in the background (no phone window)</label>}
          <div className="field"><label>Mode (changes by itself if the phone crashes)</label>
            <select className="input" value={st.level ?? 0} onChange={(e) => act(() => api.emulatorMode(Number(e.target.value)))}>
              {(st.levels || []).map((l, i) => <option key={l} value={i}>{l}</option>)}
            </select>
          </div>
          {st.lastCrash && (
            <button className="btn sm ghost" disabled={st.wipePending} onClick={() => { if (confirm('Reset the phone to factory state on the next start? This fixes a damaged phone, but you will need to sign in to Google and Goldcom again.')) act(() => api.emulatorReset(), 'The phone will be reset when it next starts'); }}>{st.wipePending ? 'Reset on next start' : 'Reset the phone (factory state)'}</button>
          )}
        </>
      )}
      <JobLine job={job?.status === 'running' ? job : null} />
      {st.state === 'ready' && (
        <>
          {st.goldcomInstalled === false && (
            <div className="setup-steps">
              <b>First time only</b>
              <ol className="howto">
                <li>In the phone{st.headless ? ' screen below' : ' window'}, open <b>Play Store</b> and sign in with a Google account (one from Oman if Goldcom is only listed there).</li>
                <li><button className="btn sm" onClick={() => act(() => api.emulatorOpenStore(), 'Goldcom’s Play Store page is open in the phone')}>Open Goldcom in the Play Store</button> and press <b>Install</b>.</li>
                <li>Open Goldcom and log in. A demo or test account is best, so no real balances are filmed.</li>
              </ol>
            </div>
          )}
          {st.headless && <p className="hint small">The phone runs without its own window: use the screen below to tap, and the typing box to type.</p>}
          <DeviceControls serial={st.serial} toast={toast} label="Goldcom phone (emulator)" autoMirror={st.headless} />
          <button className="btn sm ghost" onClick={() => act(() => api.emulatorStop(), 'Phone stopped')}>Stop the phone</button>
        </>
      )}
      {st.state === 'stopped' && (
        <button className="btn sm ghost danger" onClick={() => { if (confirm('Remove the phone emulator and everything on it (frees about 10 GB)? You can install it again later.')) act(() => api.emulatorRemove(), 'Emulator removed'); }}>Remove the emulator</button>
      )}
    </>
  );
}

// ---------- cloud phones (Android, over ADB) ----------
// Prices and trials as published on 24 Oct 2026; check the provider's page before buying.
const CLOUD_PROVIDERS = [
  {
    id: 'geelark', name: 'GeeLark', code: true, url: 'https://www.geelark.com/pricing/',
    price: '$0.007/min (max $1.20/day) or $29.90 per phone/month; ADB needs the Base plan ($5/month)',
    trial: 'Free plan: 2 phones + 30 minutes once, but no ADB (needed by the studio)',
    steps: ['In GeeLark, open Profiles and turn on ADB for the phone.', 'Start the phone, then click the 🔗 icon to see its address (IP:port) and connection code.', 'Paste both below.'],
  },
  {
    id: 'duoplus', name: 'DuoPlus', code: false, url: 'https://www.duoplus.net/pricing/', whitelist: true,
    price: '$2 per phone/month + $0.06 per 10 min running (max $1.20/day), or $16.91/month flat',
    trial: '1 phone free for 30 days + 30 running minutes',
    steps: ['In Team settings, add this computer’s IP address (below) to the ADB whitelist.', 'Turn on ADB for the phone in the phone list.', 'Copy the “adb connect …” address from the dashboard and paste it below.'],
  },
  {
    id: 'morelogin', name: 'MoreLogin', code: true, url: 'https://www.morelogin.com/pricing',
    price: '$0.006/min (max $1.50/day) or $23–25 per phone for 30 days',
    trial: '2 permanent phones + 100 minutes, no card',
    steps: ['Create an Android 12 or Android 15 phone (other versions need an SSH tunnel the studio does not set up).', 'Turn on ADB and copy its IP:port and connection code.', 'Paste both below.'],
  },
  {
    id: 'multilogin', name: 'Multilogin', code: true, url: 'https://multilogin.com/pricing',
    price: 'From $7.08/month (annual) + $0.0073/min',
    trial: 'Free plan: 30 minutes once, no card, but no ADB (paid plans only)',
    steps: ['On a paid plan, open the cloud phone (Android 11 or newer) and enable ADB.', 'Copy its IP:port and connection code.', 'Paste both below.'],
  },
  {
    id: 'other', name: 'Other (any “adb connect” address)', code: false, url: null,
    price: 'e.g. VMOS Cloud, Alibaba Cloud Phone, Genymotion, Samsung Remote Test Lab',
    trial: '',
    steps: ['Start the phone in your provider’s dashboard and enable ADB.', 'Paste the address it gives for “adb connect” (host:port). If it gives a login code to type after connecting, add it too.'],
  },
];

function CloudSource({ toast }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ provider: 'geelark', address: '', code: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState(null);
  const [compare, setCompare] = useState(false);
  const refresh = () => api.cloud().then(setData).catch(() => setData({ phones: [] }));
  useEffect(() => { refresh(); const t = setInterval(refresh, 6000); return () => clearInterval(t); }, []);
  const pv = CLOUD_PROVIDERS.find((x) => x.id === form.provider) || CLOUD_PROVIDERS[0];
  useEffect(() => { if (pv.whitelist && !ip) api.cloudMyIp().then((r) => setIp(r.ip || '')).catch(() => setIp('')); }, [pv.id]);
  const act = async (fn, ok) => { setBusy(true); try { const r = await fn(); if (ok) toast(ok); refresh(); return r; } catch (e) { toast(e.message, true); return null; } finally { setBusy(false); } };
  if (!data) return <p className="hint">Checking…</p>;
  const phones = data.phones || [];
  const live = phones.find((x) => x.state === 'device');
  const add = () => act(async () => {
    const r = await api.cloudAdd(form);
    if (r.connection?.state === 'error') throw new Error(r.connection.error);
    setAdding(false); setForm({ ...form, address: '', code: '', name: '' });
    return r;
  }, 'Cloud phone saved');
  return (
    <>
      <p className="hint">An Android phone rented in a data centre, used over the internet. Install Goldcom on it once from its Play Store and it stays logged in, so Claude can film the real app any time without a phone or a powerful computer.</p>
      {phones.map((ph) => (
        <div key={ph.address} className="cloud-phone">
          <div className="phone-status"><span className={`dot ${ph.state === 'device' ? 'live' : ''}`} /><b>{ph.name}</b><span className="hint">{ph.address} · {ph.state === 'device' ? 'connected' : ph.state === 'unauthorized' ? 'waiting for approval' : 'not connected'}</span></div>
          <div className="row">
            {ph.state === 'device'
              ? <button className="btn sm" disabled={busy} onClick={() => act(() => api.cloudDisconnect(ph.address), 'Disconnected')}>Disconnect</button>
              : <button className="btn sm primary" disabled={busy} onClick={() => act(async () => { const r = await api.cloudConnect(ph.address); if (r.state !== 'device') throw new Error(r.state === 'unauthorized' ? 'Approve this computer on the cloud phone, then press Connect again.' : 'The phone did not come online. Check it is running in your provider’s dashboard.'); }, 'Connected')}>Connect</button>}
            <button className="btn sm ghost danger" disabled={busy} onClick={() => { if (confirm(`Forget “${ph.name}”?`)) act(() => api.cloudRemove(ph.address), 'Removed'); }}>Forget</button>
          </div>
        </div>
      ))}
      {live && <DeviceControls serial={live.address} toast={toast} label={live.name} />}
      {!adding ? <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />Add a cloud phone</button> : (
        <div className="setup-steps">
          <div className="field"><label>Provider</label>
            <select className="input" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>{CLOUD_PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </div>
          <ol className="howto">{pv.steps.map((t) => <li key={t}>{t}</li>)}</ol>
          {pv.whitelist && <p className="hint small">This computer’s IP address: <code>{ip === null ? '…' : ip || 'unknown (search “what is my IP”)'}</code></p>}
          <div className="field"><label>Address (IP:port)</label><input className="input" value={form.address} placeholder="203.0.113.10:5555" onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          {(pv.code || form.provider === 'other') && <div className="field"><label>Connection code{pv.code ? '' : ' (if any)'}</label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>}
          <div className="field"><label>Name (optional)</label><input className="input" value={form.name} placeholder={`${pv.name.split(' ')[0]} phone`} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="row"><button className="btn primary" disabled={busy || !form.address.trim() || (pv.code && !form.code.trim())} onClick={add}>Save & connect</button><button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button></div>
          <p className="hint small">First time on a new cloud phone: open its Play Store, sign in with a Google account from Oman (Goldcom may only be listed there), install Goldcom and log in with a demo account. If the Goldcom team gives you the app file (.apk), use “Install app file” instead.</p>
        </div>
      )}
      <button className="btn sm ghost" onClick={() => setCompare(!compare)}>{compare ? 'Hide' : 'Compare'} cloud phone prices</button>
      {compare && (
        <table className="price-table">
          <thead><tr><th>Provider</th><th>Price</th><th>Free</th></tr></thead>
          <tbody>{CLOUD_PROVIDERS.filter((x) => x.url).map((x) => <tr key={x.id}><td><a href={x.url} target="_blank" rel="noreferrer">{x.name}</a></td><td>{x.price}</td><td>{x.trial}</td></tr>)}</tbody>
        </table>
      )}
    </>
  );
}

// ---------- iPhone ----------
function IosSource() {
  return (
    <>
      <p className="hint">Apple only lets iPhone apps run on real iPhones (and Macs), so there is no iPhone emulator for Windows. Tools such as xtool build your own apps and install them on a connected iPhone; they cannot run or film the App Store version of Goldcom. The way to film the real iPhone app without owning an iPhone is a real iPhone in the cloud:</p>
      <div className="setup-steps">
        <b>Real iPhone in the cloud (works today)</b>
        <ol className="howto">
          <li>Open an iPhone session on <a href="https://www.browserstack.com/app-live" target="_blank" rel="noreferrer">BrowserStack App Live</a> (from $39/month, 30-minute free trial) or <a href="https://www.testmuai.com/pricing/" target="_blank" rel="noreferrer">TestMu AI</a> (from $39/month).</li>
          <li>Open the App Store on it, sign in with an Apple ID from Oman, install Goldcom and log in (a demo account is best).</li>
          <li>Start recording your screen: <b>Win + Alt + R</b> (Xbox Game Bar) or Snipping Tool → Record.</li>
          <li>Go through the flow slowly, stop the recording and drop the video on this page.</li>
          <li>Press <b>Crop to the phone screen</b> on it: Claude finds the iPhone and the studio keeps only the app.</li>
        </ol>
        <p className="hint small">These shared iPhones are wiped after every session, so you sign in and install Goldcom each time. Dedicated iPhones that stay logged in (and that Claude could operate by itself) are sold by BrowserStack, TestMu AI, Sauce Labs and TestingBot on request.</p>
      </div>
      <p className="hint small">Have an iPhone at hand? Record its screen (Control Centre → Screen Recording) and drop the video here.</p>
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
      {src === 'cloud' && <CloudSource toast={toast} />}
      {src === 'ios' && <IosSource />}
      {Extra && <Extra toast={toast} />}
      <div className="note"><b>Recorded it yourself?</b> Screen recordings from any phone work too: drop the video on the left. Claude splits it into steps and uses it in productions.</div>
    </aside>
  );
}
