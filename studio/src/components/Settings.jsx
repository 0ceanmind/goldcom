import { useEffect, useRef, useState } from 'react';
import { EvidenceSettings } from './ReviewControls.jsx';
import { api } from '../api.js';
import { SelectControl, Icon, Modal, useDialogFocus } from './ui.jsx';
import { ModeSwitch, useStudio } from './StudioContext.jsx';
import { LoadingSurface } from './ProductionJourney.jsx';

const MODELS = [['claude-opus-5-5', 'Claude Opus 5.5 (recommended)'], ['claude-fable-5-1', 'Claude Fable 5.1 (most capable)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (faster)']];
const EFFORT = [['medium', 'Fast'], ['high', 'Thorough (recommended)'], ['xhigh', 'Maximum care']];

export function SettingsDialog({ onClose, toast }) {
  const { advanced, t, uiLang } = useStudio();
  const [s, setS] = useState(null);
  const [engine, setEngine] = useState(null);
  const [testing, setTesting] = useState(false);
  const [channels, setChannels] = useState([]);
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, onClose, !!s && advanced);
  useEffect(() => {
    api.settings().then(setS).catch(e => setLoadError(e.message));
    api.engine().then(setEngine).catch(() => {});
    api.channels().then((r) => setChannels(r.branches || [])).catch(() => {});
    api.update().then(setInfo).catch(() => {});
  }, []);
  if (!s) return <Modal title={t('settings')} onClose={onClose}>{loadError ? <div className="detail-empty" role="alert"><Icon name="warn" /><p>{loadError}</p><button className="btn" onClick={() => { setLoadError(null); api.settings().then(setS).catch(e => setLoadError(e.message)); }}>{t('retry')}</button></div> : <LoadingSurface compact />}</Modal>;
  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const save = async () => {
    try { const n = await api.saveSettings(s); setS(n); setEngine(await api.engine()); toast('Settings saved'); } catch (e) { toast(e.message, true); }
  };
  const test = async () => {
    setTesting(true);
    try { await api.saveSettings(s); const r = await api.testEngine(); r.ok ? toast(`Claude replied: ${r.reply.en} · ${r.reply.ar}`) : toast(r.error, true); setEngine(await api.engine()); } catch(e) { toast(e.message,true); } finally { setTesting(false); }
  };
  if (!advanced) return <Modal title={t('settings')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t('close')}</button><button className="btn primary" onClick={save}>{uiLang === 'ar' ? 'حفظ الإعدادات' : 'Save settings'}</button></>}>
    <div className="guided-settings"><div className="guided-settings-heading"><div><span className="page-eyebrow">Goldcom Studio</span><h2>{uiLang === 'ar' ? 'كل شيء جاهز للإبداع' : 'Set up once. Create freely.'}</h2></div><ModeSwitch /></div><section><h3>{uiLang === 'ar' ? 'المساعد الإبداعي' : 'Your creative assistant'}</h3><p>{uiLang === 'ar' ? 'استخدم حساب Claude الموجود على جهازك أو مفتاح API الخاص بك.' : 'Use the Claude account on this computer, or connect your own API key.'}</p><div className="connection-options">{[['auto', uiLang === 'ar' ? 'اكتشاف تلقائي' : 'Find my connection'], ['claude-code', uiLang === 'ar' ? 'حساب Claude الخاص بي' : 'My Claude account'], ['api', 'API key']].map(([value,label]) => <button key={value} aria-pressed={s.engine === value} onClick={() => set({ engine:value })}><Icon name={value === 'api' ? 'key' : 'claude'} size={18} />{label}</button>)}</div>
      {s.engine === 'api' && <label className="field">Anthropic API key<input className="input" type="password" autoComplete="off" value={s.anthropicApiKey || ''} placeholder="sk-ant-…" onChange={e => set({ anthropicApiKey:e.target.value })} /><span className="hint">{uiLang === 'ar' ? 'يُحاسب استخدام API بشكل منفصل من حساب Anthropic.' : 'API usage is billed separately to your Anthropic account.'}</span></label>}
      <div className="connection-status"><span className={`status-dot ${engine?.selected ? 'connected' : ''}`} /><span>{engine?.selected ? t('configured') : uiLang === 'ar' ? 'ثبّت Claude Code وسجّل الدخول على هذا الجهاز، ثم اختبر الاتصال.' : 'Install Claude Code and sign in on this computer, then test the connection.'}</span></div><button className="btn" disabled={testing} onClick={test}><Icon name="claude" />{uiLang === 'ar' ? 'اختبار الاتصال' : 'Test connection'}</button>{testing && <LoadingSurface compact title={t('checking')} />}</section>
      <CopywriterSettings s={s} set={set} toast={toast} uiLang={uiLang}/><section><h3>{uiLang === 'ar' ? 'تفضيلات الإنشاء' : 'Your creation preferences'}</h3><div className="row"><label className="field">{t('language')}<SelectControl className="input" value={s.language} onChange={e => set({ language:e.target.value })}><option value="ar">العربية</option><option value="en">English</option></SelectControl></label><label className="field">{uiLang === 'ar' ? 'الموسيقى' : 'Background music'}<SelectControl className="input" value={s.music} onChange={e => set({ music:e.target.value })}><option value="none">{uiLang === 'ar' ? 'بدون موسيقى' : 'No music'}</option><option value="calm-gold">Calm gold</option><option value="modern-pulse">Modern pulse</option><option value="warm-eid">Warm Eid</option></SelectControl></label></div><label className="field">{uiLang === 'ar' ? 'حد تقدير الاستخدام لكل مشروع (USD)' : 'Usage estimate limit per production (USD)'}<input className="input" type="number" min="0.1" max="1000" step="0.1" value={s.productionBudgetUsd} onChange={e => set({ productionBudgetUsd:Number(e.target.value) })} /></label><p>{uiLang === 'ar' ? 'هذا حد لتقدير الاستخدام، وليس فاتورة اشتراك. تتوفر خيارات النماذج ومقدمي الخدمات في الوضع المتقدم.' : 'This limits estimated usage, and is not a subscription invoice. Advanced mode includes model, provider, and update controls.'}</p></section></div>
  </Modal>;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div ref={dialogRef} className="modal gc2 settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('settings')} tabIndex={-1}>
        <div className="modal-head"><h3>Settings</h3><button className="btn icon ghost" onClick={onClose}><Icon name="x" /></button></div>
        <div className="modal-body">
          <section>
            <h4>Claude</h4>
            <div className="seg wide">
              {[['auto', 'Automatic'], ['claude-code', 'My Claude Code login'], ['api', 'Anthropic API key']].map(([k, v]) => <button key={k} className={s.engine === k ? 'on' : ''} onClick={() => set({ engine: k })}>{v}</button>)}
            </div>
            <p className="hint">
              {engine?.selected ? <>Configured through <b>{engine.selected === 'api' ? 'the API key' : 'Claude Code'}</b>{engine.claudeCode?.version && engine.selected !== 'api' ? ` (${engine.claudeCode.version})` : ''}.</> : 'Not configured yet.'}
              {' '}Claude Code uses your existing Claude plan: install it from claude.com/code and sign in once. An API key bills your Anthropic Console account.
            </p>
            <div className="field"><label>Anthropic API key</label><input className="input" type="password" value={s.anthropicApiKey || ''} placeholder="sk-ant-…" onChange={(e) => set({ anthropicApiKey: e.target.value })} /></div>
            <div className="row">
              <div className="field"><label>Model</label><SelectControl className="input" value={s.model} onChange={(e) => set({ model: e.target.value })}>{MODELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectControl></div>
              <div className="field"><label>Care</label><SelectControl className="input" value={s.effort} onChange={(e) => set({ effort: e.target.value })}>{EFFORT.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectControl></div>
            </div>
            <div className="field"><label>Claude Code location (only if not found automatically)</label><input className="input" value={s.claudePath || ''} placeholder={engine?.claudeCode?.path || 'claude'} onChange={(e) => set({ claudePath: e.target.value })} /></div>
            <button className="btn" onClick={test} disabled={testing}><Icon name="claude" />{testing ? 'Testing…' : 'Test connection'}</button>
          </section>
          <CopywriterSettings s={s} set={set} toast={toast} uiLang={uiLang}/><section>
            <h4>Production defaults</h4>
            <div className="field"><label>Maximum production usage estimate (USD)</label><input className="input" type="number" min="0.1" max="1000" step="0.1" value={s.productionBudgetUsd} onChange={e=>set({productionBudgetUsd:Number(e.target.value)})}/></div>
            <p className="hint">Claude Code applies a per-call spending limit from the remaining budget. API estimates use your configured rates. Subscription usage estimates are not invoices.</p>
            <details><summary>Current API model rates — USD per million tokens</summary>{['input','output','cacheRead','cacheWrite'].map(k=><div className="field" key={k}><label>{k}</label><input className="input" type="number" min="0" step="0.01" value={s.apiRates?.[k]||0} onChange={e=>set({apiRates:{...s.apiRates,[k]:Number(e.target.value)}})}/></div>)}</details>
            <div className="field"><label>Development origins allowed for screenshots — one per line</label><textarea className="input" placeholder="http://localhost:3000" value={(s.captureOrigins||[]).join('\n')} onChange={e=>set({captureOrigins:e.target.value.split('\n').filter(Boolean)})}/></div>
            <div className="row">
              <div className="field"><label>Content language</label><SelectControl className="input" value={s.language} onChange={(e) => set({ language: e.target.value })}><option value="ar">Arabic</option><option value="en">English</option></SelectControl></div>
              <div className="field"><label>Video frame rate</label><SelectControl className="input" value={s.exportFps} onChange={(e) => set({ exportFps: Number(e.target.value) })}><option value={30}>30 fps</option><option value={60}>60 fps (smoother, slower to render)</option></SelectControl></div>
            </div>
            <div className="row">
              <div className="field"><label>Background music</label><SelectControl className="input" value={s.music} onChange={(e) => set({ music: e.target.value })}><option value="none">None (add Instagram audio)</option><option value="calm-gold">Calm gold</option><option value="modern-pulse">Modern pulse</option><option value="warm-eid">Warm Eid</option></SelectControl></div>
              <div className="field"><label>Goldcom Android package</label><input className="input" value={s.appPackage || ''} placeholder="detected automatically" onChange={(e) => set({ appPackage: e.target.value })} /></div>
            </div>
          </section>
          <section>
            <h4>Updates</h4>
            <div className="field"><label>Trusted SSH allowed-signers file for updates</label><input className="input" value={s.trustedUpdateSigner||''} onChange={e=>set({trustedUpdateSigner:e.target.value})}/></div>
            <p className="hint">Updates require Git and a trusted signer. Local edits are restored and kept in a backup stash.</p>
            <p className="hint">{info?.current ? <>Installed: <code>{String(info.current.sha || '').slice(0, 7)}</code> · {info.current.message}</> : 'Version information unavailable.'} {info?.mode ? `(${info.mode === 'git' ? 'Git' : 'download'} install)` : ''}</p>
            <div className="row">
              <div className="field"><label>Update channel</label><SelectControl className="input" value={s.updateBranch || info?.branch || ''} onChange={(e) => set({ updateBranch: e.target.value })}>{[...new Set([info?.branch, ...channels].filter(Boolean))].map((b) => <option key={b} value={b}>{b}</option>)}</SelectControl></div>
              <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!s.autoUpdateCheck} onChange={(e) => set({ autoUpdateCheck: e.target.checked })} />Check for updates automatically</label>
            </div>
          </section>
          <EvidenceSettings toast={toast}/>
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


function CopywriterSettings({s,set,toast,uiLang}) {
  const [testing,setTesting]=useState(false);
  const ar=uiLang==='ar';
  const test=async()=>{
    setTesting(true);
    try { await api.saveSettings(s); const r=await api.testCopywriter(); if(!r.ok)throw new Error(r.error);toast(`${r.reply.ar} · ${r.reply.en}`); }
    catch(e){toast(e.message,true);}finally{setTesting(false);}
  };
  return <section className="copywriter-settings">
    <h3>{ar?'ChatGPT للأفكار والكتابة':'ChatGPT for ideas and copy'}</h3>
    <p>{ar?'Claude يدير الشغل والتصميم والمراجعة. ChatGPT يطلع الأفكار ويكتب بالعماني والإنجليزي.':'Claude directs, builds and reviews. ChatGPT develops ideas and writes natural Omani Arabic and English.'}</p>
    <label className="field">{ar?'اتصال ChatGPT':'ChatGPT connection'}<SelectControl className="input" value={s.copyEngine||'codex'} onChange={e=>set({copyEngine:e.target.value})}><option value="codex">{ar?'حساب ChatGPT عبر Codex':'My ChatGPT account through Codex'}</option><option value="api">OpenAI text API</option></SelectControl></label>
    <label className="field">{ar?'نموذج الكتابة':'Writing model'}<input className="input" value={s.copyModel||''} placeholder={s.copyEngine==='api'?'Enter the exact text model ID':'Use my Codex account default'} onChange={e=>set({copyModel:e.target.value})}/></label>
    {s.copyEngine==='api'?<>
      <label className="field">OpenAI API key<input className="input" type="password" autoComplete="off" value={s.keys?.OPENAI_API_KEY||''} onChange={e=>set({keys:{...s.keys,OPENAI_API_KEY:e.target.value}})}/></label>
      <p className="hint">{ar?'استخدام API محسوب بشكل منفصل. حد المشروع يشمل تقدير تكاليف الكتابة.':'API usage is billed separately. Configure current token rates to include writing in the production budget.'}</p>
      <div className="row">{['input','output'].map(k=><label key={k} className="field">{k} · USD / 1M tokens<input className="input" type="number" min="0" step="0.01" value={s.copyRates?.[k]||0} onChange={e=>set({copyRates:{...s.copyRates,[k]:Number(e.target.value)}})}/></label>)}</div>
    </>:<p className="hint">{ar?'ثبّت Codex وسجّل دخولك بحساب ChatGPT. استهلاك الاشتراك يظهر منفصل عن تقدير تكلفة API.':'Install Codex and sign in with ChatGPT. Subscription usage is reported separately from API cost estimates.'}</p>}
    <button className="btn" disabled={testing} onClick={test}>{testing?(ar?'نختبر الاتصال…':'Testing ChatGPT…'):(ar?'اختبار ChatGPT':'Test ChatGPT')}</button>
  </section>;
}
