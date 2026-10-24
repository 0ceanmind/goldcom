import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './ui.jsx';

const MODELS = [['claude-opus-5-5', 'Claude Opus 5.5 (recommended)'], ['claude-fable-5-1', 'Claude Fable 5.1 (most capable)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (faster)']];
const EFFORT = [['medium', 'Fast'], ['high', 'Thorough (recommended)'], ['xhigh', 'Maximum care']];

export function SettingsDialog({ onClose, toast }) {
  const [s, setS] = useState(null);
  const [engine, setEngine] = useState(null);
  const [testing, setTesting] = useState(false);
  const [channels, setChannels] = useState([]);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    api.settings().then(setS);
    api.engine().then(setEngine);
    api.channels().then((r) => setChannels(r.branches || [])).catch(() => {});
    api.update().then(setInfo).catch(() => {});
  }, []);
  if (!s) return null;
  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const save = async () => {
    try { const n = await api.saveSettings(s); setS(n); setEngine(await api.engine()); toast('Settings saved'); } catch (e) { toast(e.message, true); }
  };
  const test = async () => {
    setTesting(true);
    try { await api.saveSettings(s); const r = await api.testEngine(); r.ok ? toast(`Claude replied: ${r.reply.en} · ${r.reply.ar}`) : toast(r.error, true); setEngine(await api.engine()); } finally { setTesting(false); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal gc2 settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Settings</h3><button className="btn icon ghost" onClick={onClose}><Icon name="x" /></button></div>
        <div className="modal-body">
          <section>
            <h4>Claude</h4>
            <div className="seg wide">
              {[['auto', 'Automatic'], ['claude-code', 'My Claude Code login'], ['api', 'Anthropic API key']].map(([k, v]) => <button key={k} className={s.engine === k ? 'on' : ''} onClick={() => set({ engine: k })}>{v}</button>)}
            </div>
            <p className="hint">
              {engine?.selected ? <>Connected through <b>{engine.selected === 'api' ? 'the API key' : 'Claude Code'}</b>{engine.claudeCode?.version && engine.selected !== 'api' ? ` (${engine.claudeCode.version})` : ''}.</> : 'Not connected yet.'}
              {' '}Claude Code uses your existing Claude plan: install it from claude.com/code and sign in once. An API key bills your Anthropic Console account.
            </p>
            <div className="field"><label>Anthropic API key</label><input className="input" type="password" value={s.anthropicApiKey || ''} placeholder="sk-ant-…" onChange={(e) => set({ anthropicApiKey: e.target.value })} /></div>
            <div className="row">
              <div className="field"><label>Model</label><select className="input" value={s.model} onChange={(e) => set({ model: e.target.value })}>{MODELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="field"><label>Care</label><select className="input" value={s.effort} onChange={(e) => set({ effort: e.target.value })}>{EFFORT.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div className="field"><label>Claude Code location (only if not found automatically)</label><input className="input" value={s.claudePath || ''} placeholder={engine?.claudeCode?.path || 'claude'} onChange={(e) => set({ claudePath: e.target.value })} /></div>
            <button className="btn" onClick={test} disabled={testing}><Icon name="claude" />{testing ? 'Testing…' : 'Test connection'}</button>
          </section>
          <section>
            <h4>Production defaults</h4>
            <div className="row">
              <div className="field"><label>Content language</label><select className="input" value={s.language} onChange={(e) => set({ language: e.target.value })}><option value="ar">Arabic</option><option value="en">English</option></select></div>
              <div className="field"><label>Video frame rate</label><select className="input" value={s.exportFps} onChange={(e) => set({ exportFps: Number(e.target.value) })}><option value={30}>30 fps</option><option value={60}>60 fps (smoother, slower to render)</option></select></div>
            </div>
            <div className="row">
              <div className="field"><label>Background music</label><select className="input" value={s.music} onChange={(e) => set({ music: e.target.value })}><option value="none">None (add Instagram audio)</option><option value="calm-gold">Calm gold</option><option value="modern-pulse">Modern pulse</option><option value="warm-eid">Warm Eid</option></select></div>
              <div className="field"><label>Goldcom Android package</label><input className="input" value={s.appPackage || ''} placeholder="detected automatically" onChange={(e) => set({ appPackage: e.target.value })} /></div>
            </div>
          </section>
          <section>
            <h4>Updates</h4>
            <p className="hint">{info?.current ? <>Installed: <code>{String(info.current.sha || '').slice(0, 7)}</code> · {info.current.message}</> : 'Version information unavailable.'} {info?.mode ? `(${info.mode === 'git' ? 'Git' : 'download'} install)` : ''}</p>
            <div className="row">
              <div className="field"><label>Update channel</label><select className="input" value={s.updateBranch || info?.branch || ''} onChange={(e) => set({ updateBranch: e.target.value })}>{[...new Set([info?.branch, ...channels].filter(Boolean))].map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
              <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!s.autoUpdateCheck} onChange={(e) => set({ autoUpdateCheck: e.target.checked })} />Check for updates automatically</label>
            </div>
          </section>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={save}>Save</button></div>
      </div>
    </div>
  );
}

/** "Update available" button + dialog with one-click update and automatic reload. */
export function UpdateButton({ toast }) {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const check = (force) => (force ? api.checkUpdate() : api.update().then((u) => u.lastCheck || null)).then((r) => r && setState(r)).catch(() => {});
  useEffect(() => {
    check(false);
    const onUp = (e) => setState(e.detail);
    const onJob = (e) => { const j = e.detail?.job; if (j?.type === 'update') setJob(j); };
    const onRestart = () => setRestarting(true);
    window.addEventListener('gc:update', onUp);
    window.addEventListener('gc:job', onJob);
    window.addEventListener('gc:restarting', onRestart);
    return () => { window.removeEventListener('gc:update', onUp); window.removeEventListener('gc:job', onJob); window.removeEventListener('gc:restarting', onRestart); };
  }, []);
  useEffect(() => {
    if (!restarting) return;
    let alive = true;
    const startPid = window.__serverPid;
    const poll = async () => {
      while (alive) {
        await new Promise((r) => setTimeout(r, 1200));
        try { const h = await api.health(); if (!startPid || h.pid !== startPid) { location.reload(); return; } } catch { /* still restarting */ }
      }
    };
    poll();
    return () => { alive = false; };
  }, [restarting]);

  const apply = async () => {
    try { const { jobId } = await api.applyUpdate(); setJob({ id: jobId, status: 'running', message: 'Starting…' }); } catch (e) { toast(e.message, true); }
  };
  if (restarting) return <div className="restart-overlay"><div className="box"><i className="spin big" /><b>Restarting Goldcom Studio…</b><span className="hint">The page reloads by itself in a few seconds.</span></div></div>;
  return (
    <>
      {state?.available ? <button className="btn update-btn" onClick={() => setOpen(true)}><Icon name="download" />Update available</button>
        : <button className="btn icon ghost" title="Check for updates" onClick={() => { check(true).then(() => setOpen(true)); }}><Icon name="download" /></button>}
      {open && (
        <div className="modal-bg" onClick={() => !job && setOpen(false)}>
          <div className="modal gc2" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>{state?.available ? 'A new version is ready' : 'You are up to date'}</h3><button className="btn icon ghost" onClick={() => setOpen(false)}><Icon name="x" /></button></div>
            <div className="modal-body">
              {state?.error && <p className="note err">{state.error}</p>}
              {state?.available && (
                <>
                  <p className="hint">{state.behind ? `${state.behind} change${state.behind > 1 ? 's' : ''}` : 'New changes'} on <code>{state.branch}</code>. Your designs, footage and settings are kept.</p>
                  <ul className="changes">{(state.changes || []).slice(0, 12).map((c) => <li key={c.sha}><code>{c.sha.slice(0, 7)}</code> {c.message}</li>)}</ul>
                </>
              )}
              {job && <div className={`job-line ${job.status}`}>{job.status === 'running' && <i className="spin" />}<span>{job.message}</span></div>}
              {job?.status === 'error' && <p className="note err">{job.error}</p>}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => check(true)}>Check again</button>
              {state?.available && <button className="btn primary" disabled={job?.status === 'running'} onClick={apply}><Icon name="download" />Update now</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
