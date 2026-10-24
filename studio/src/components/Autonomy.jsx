// The studio's autonomous side: the director (Claude working on a brief), image/3D generation, feedback that
// teaches the studio, settings for providers, and a view of what it has learned.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, onStudioEvent } from '../api.js';
import { Modal, Icon, Field, Select } from './ui.jsx';
import { FORMATS, KINDS } from '../../shared/brand.js';

const REASONS = {
  'too-much-text': 'Too much text',
  generic: 'Looks generic / AI-made',
  'visual-quality': 'Visuals not polished enough',
  'wrong-idea': "Doesn't show the idea",
  'motion-feel': 'Motion feels off',
  'not-premium': 'Not premium enough',
  'off-brand': 'Off-brand colours, type or logo',
  copy: 'Copy sounds wrong',
  arabic: 'Arabic needs fixing',
  layout: 'Layout, spacing or crop',
};

const ago = (iso) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString(); };

// ---------- director ----------
export function DirectorPanel({ onClose, doc, slideIdx = 0, onOpen, toast, initialTask }) {
  const [status, setStatus] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [active, setActive] = useState(initialTask || null);
  const [task, setTask] = useState(null);
  const [brief, setBrief] = useState('');
  const [scope, setScope] = useState(doc ? 'this' : 'new');
  const [lang, setLang] = useState(doc?.lang || 'ar');
  const [format, setFormat] = useState('feed-portrait');
  const [kind, setKind] = useState('carousel');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const refresh = () => api.tasks().then(setTasks).catch(() => {});
  useEffect(() => { api.agentStatus().then(setStatus).catch(() => setStatus({ available: false, why: 'Studio server unreachable' })); refresh(); }, []);
  useEffect(() => { if (active) api.task(active).then(setTask).catch(() => {}); else setTask(null); }, [active]);
  useEffect(() => onStudioEvent((ev) => {
    if (ev.type !== 'agent') return;
    if (ev.taskId === active && ev.entry) setTask((t) => (t ? { ...t, status: ev.status || t.status, log: [...(t.log || []), ev.entry] } : t));
    if (ev.done) { refresh(); if (ev.taskId === active) api.task(active).then(setTask).catch(() => {}); }
  }), [active]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }); }, [task?.log?.length]);

  const start = async () => {
    if (!brief.trim()) return;
    setBusy(true);
    try {
      const t = await api.startTask(scope === 'this' && doc ? { mode: 'revise', brief, designId: doc.id, slide: slideIdx, lang: doc.lang } : { mode: 'create', brief, lang, format: kind === 'reel' || kind === 'story' ? 'story' : format, kind });
      setActive(t.id); setBrief(''); refresh();
    } catch (e) { toast?.(e.message, true); }
    setBusy(false);
  };

  const examples = scope === 'this'
    ? ['Make slide 2 show the idea without the subline', 'The gold looks flat on slide 1: fix the lighting', 'Turn this into a 15-second Reel']
    : ['Arabic carousel: why start with 1 gram', 'Eid gifting Reel, 12 seconds, warm and quiet', 'A price post for today with the 3D number', 'A Story with a poll: gold or cash for Eidiya'];

  return (
    <Modal title="Ask Claude" onClose={onClose}>
      {status && !status.available && <div className="note"><b>The director needs Claude Code.</b> {status.why}</div>}
      <div className="director">
        <div className="brief">
          {doc && (
            <div className="seg" style={{ marginBottom: 10 }}>
              <button className={scope === 'this' ? 'on' : ''} onClick={() => setScope('this')}>Work on this design</button>
              <button className={scope === 'new' ? 'on' : ''} onClick={() => setScope('new')}>New design</button>
            </div>
          )}
          <textarea className="input" rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What should Claude make or change? Say who it is for and the one idea it should show." onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(); }} />
          {scope === 'new' && (
            <div className="row" style={{ marginTop: 8 }}>
              <Field label="Type"><Select value={kind} onChange={setKind} options={Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label]))} /></Field>
              <Field label="Format"><Select value={kind === 'reel' || kind === 'story' ? 'story' : format} onChange={setFormat} options={Object.fromEntries(Object.entries(FORMATS).map(([k, f]) => [k, f.label]))} /></Field>
              <Field label="Language"><Select value={lang} onChange={setLang} options={{ ar: 'العربية', en: 'English' }} /></Field>
            </div>
          )}
          <div className="chips">{examples.map((x) => <button key={x} className="chip" onClick={() => setBrief(x)}>{x}</button>)}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button className="btn primary" disabled={!status?.available || busy || !brief.trim()} onClick={start}><Icon name="claude" />Start</button>
            <span className="hint">Claude plans, builds missing scenes, generates images, checks its own renders and fixes them. {status?.billing ? `Billing: ${status.billing}.` : ''}</span>
          </div>
        </div>
        <div className="tasks">
          <div className="task-list">
            {tasks.map((t) => (
              <button key={t.id} className={`task-row${t.id === active ? ' on' : ''}`} onClick={() => setActive(t.id)}>
                <span className={`st ${t.status}`} />
                <span className="ttl">{t.brief}<small>{t.mode} · {ago(t.createdAt)}{t.attempts > 1 ? ' · retried' : ''}</small></span>
              </button>
            ))}
            {!tasks.length && <p className="hint">No runs yet.</p>}
          </div>
          {task && (
            <div className="task-log" ref={logRef}>
              <div className="task-head">
                <b>{task.status === 'running' ? 'Working…' : task.status === 'done' ? 'Done' : task.status === 'failed' ? 'Stopped with an error' : task.status}</b>
                {task.status === 'running' && <button className="btn sm ghost" onClick={() => api.cancelTask(task.id).then(refresh)}>Stop</button>}
                {task.designId && <button className="btn sm" onClick={() => { onOpen?.(task.designId); onClose(); }}>Open design</button>}
              </div>
              {(task.log || []).map((e, i) => <div key={i} className={`log ${e.kind}`}>{e.kind === 'tool' ? <Icon name="wrench" size={13} /> : null}<span>{e.text}</span></div>)}
              {task.result && <div className="log done"><span>{task.result}</span></div>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------- generation ----------
export function GenerateDialog({ doc, slideIdx = 0, onClose, toast, onPlaced }) {
  const [info, setInfo] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [intent, setIntent] = useState('auto');
  const [provider, setProvider] = useState('auto');
  const [place, setPlace] = useState(doc ? 'background' : 'none');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const aspect = doc ? (doc.width / doc.height > 1.5 ? '16:9' : doc.width / doc.height > 0.92 ? '1:1' : doc.width / doc.height > 0.7 ? '4:5' : '9:16') : '4:5';
  useEffect(() => { api.generators().then(setInfo).catch(() => {}); }, []);
  const ready = (info?.providers || []).filter((p) => p.available && p.kind !== 'model3d');
  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await api.generate({ prompt, intent: intent === 'auto' ? undefined : intent, provider, aspect, attach: doc && place !== 'none' ? { docId: doc.id, slide: slideIdx, as: place } : undefined });
      setResult(r);
      if (r.attached) onPlaced?.();
    } catch (e) { toast?.(e.message, true); setResult({ error: e.message }); }
    setBusy(false);
  };
  return (
    <Modal title="Generate an image" onClose={onClose} size="sm">
      <textarea className="input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image: subject, setting, light, mood. Brand art direction is added for you." />
      <div className="row" style={{ marginTop: 8 }}>
        <Field label="Kind"><Select value={intent} onChange={setIntent} options={{ auto: 'Detect automatically', ...(info?.intents || {}) }} /></Field>
        <Field label="Provider"><Select value={provider} onChange={setProvider} options={{ auto: 'Best available (learns from ratings)', ...Object.fromEntries(ready.map((p) => [p.id, p.label])) }} /></Field>
      </div>
      {doc && <Field label="Place it"><Select value={place} onChange={setPlace} options={{ background: `As the background of slide ${slideIdx + 1}`, layer: `As a layer on slide ${slideIdx + 1}`, none: 'Just save it to assets' }} /></Field>}
      <div className="provider-status">
        {(info?.providers || []).filter((p) => p.kind !== 'model3d').map((p) => <span key={p.id} className={`pill ${p.available ? 'ok' : 'off'}`} title={p.available ? `Ready via ${p.via}` : p.why}>{p.label}</span>)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={busy || !prompt.trim()} onClick={run}><Icon name="wand" />{busy ? 'Generating…' : 'Generate'}</button>
      </div>
      {result?.asset && (
        <div className="gen-result">
          <img src={result.asset.url} alt="" />
          <div className="hint">Made by <b>{result.label}</b> ({result.model}) as “{info?.intents?.[result.intent] || result.intent}”{result.attempts?.length > 1 ? `, after ${result.attempts.filter((a) => !a.ok).map((a) => a.provider).join(', ')} failed` : ''}.{result.degraded ? ` ${result.degraded}` : ''}{result.attached ? ' Placed on the slide.' : ''}</div>
        </div>
      )}
      {result?.error && <div className="note">{result.error}</div>}
      <p className="hint" style={{ marginTop: 12 }}>Product shots of bars and coins come from the studio's own 3D scenes (exact and free). Photos go to Gemini or OpenAI, lettering to OpenAI, vector art to Claude. Add keys in Settings.</p>
    </Modal>
  );
}

// ---------- feedback ----------
export function FeedbackDialog({ doc, slideIdx = 0, onClose, toast, onTask }) {
  const [rating, setRating] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [note, setNote] = useState('');
  const [improve, setImprove] = useState(true);
  const [sent, setSent] = useState(null);
  const toggle = (k) => setReasons((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]));
  const submit = async (r = rating) => {
    try {
      const res = await api.feedback({ designId: doc.id, slide: slideIdx, rating: r, reasons, note, improve: r === 'down' && improve });
      setSent(res);
      if (res.task) onTask?.(res.task.id);
      if (r === 'up') { toast?.('Thanks. The studio will lean towards what worked here.'); onClose(); }
    } catch (e) { toast?.(e.message, true); }
  };
  if (sent && rating === 'down') return (
    <Modal title="Thank you" onClose={onClose} size="sm">
      <p>Your notes are saved. {sent.task ? 'Claude is turning them into rules for next time and revising this design now. You can watch it work.' : sent.agent ? `They will shape the next designs. To have Claude revise automatically: ${sent.agent}` : 'They will shape the next designs.'}</p>
      <div style={{ display: 'flex', gap: 8 }}>{sent.task && <button className="btn primary" onClick={() => onTask?.(sent.task.id, true)}>Watch Claude revise it</button>}<button className="btn" onClick={onClose}>Close</button></div>
    </Modal>
  );
  return (
    <Modal title="How is this design?" onClose={onClose} size="sm">
      <div className="rate">
        <button className={`rate-btn${rating === 'up' ? ' on' : ''}`} onClick={() => { setRating('up'); submit('up'); }}><Icon name="thumbUp" size={22} />It works</button>
        <button className={`rate-btn${rating === 'down' ? ' on' : ''}`} onClick={() => setRating('down')}><Icon name="thumbDown" size={22} />Not there yet</button>
      </div>
      {rating === 'down' && (
        <>
          <p className="lbl" style={{ marginTop: 14 }}>What is off? Pick all that apply.</p>
          <div className="chips">{Object.entries(REASONS).map(([k, v]) => <button key={k} className={`chip${reasons.includes(k) ? ' on' : ''}`} onClick={() => toggle(k)}>{v}</button>)}</div>
          <Field label="In your words (what would make it right?)"><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the bar should be bigger and the line shorter; it should feel like a jewellery ad" /></Field>
          <label className="check"><input type="checkbox" checked={improve} onChange={(e) => setImprove(e.target.checked)} />Have Claude learn from this and revise the design now</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn primary" disabled={!reasons.length && !note.trim()} onClick={() => submit('down')}>Send</button></div>
        </>
      )}
    </Modal>
  );
}

// ---------- settings ----------
export function SettingsDialog({ onClose, toast }) {
  const [s, setS] = useState(null);
  const [gens, setGens] = useState(null);
  const [agent, setAgent] = useState(null);
  const [keys, setKeys] = useState({});
  const load = () => { api.generatorSettings().then(setS); api.generators().then(setGens); api.agentStatus().then(setAgent); };
  useEffect(load, []);
  const save = async (patch) => { try { setS(await api.saveGeneratorSettings(patch)); setKeys({}); api.generators().then(setGens); toast?.('Settings saved'); } catch (e) { toast?.(e.message, true); } };
  if (!s) return <Modal title="Settings" onClose={onClose} size="sm"><p className="hint">Loading…</p></Modal>;
  const KEYS = [['OPENAI_API_KEY', 'OpenAI (GPT Image)'], ['GEMINI_API_KEY', 'Google Gemini (Nano Banana)'], ['ANTHROPIC_API_KEY', 'Anthropic (Claude SVG art, optional director billing)'], ['MESHY_API_KEY', 'Meshy (text to 3D)'], ['TRIPO_API_KEY', 'Tripo (text to 3D)']];
  return (
    <Modal title="Settings" onClose={onClose} footer={<button className="btn primary" onClick={() => save({ keys })} disabled={!Object.keys(keys).length}>Save keys</button>}>
      <div className="settings">
        <section>
          <h4>Generators</h4>
          {(gens?.providers || []).map((p) => (
            <div key={p.id} className="gen-row">
              <label className="check"><input type="checkbox" checked={p.enabled} onChange={(e) => save({ providers: { [p.id]: e.target.checked } })} /><b>{p.label}</b></label>
              <span className={`pill ${p.available ? 'ok' : 'off'}`}>{p.available ? 'ready' : 'not set up'}</span>
              <small className="hint">{p.route}{p.available ? ` · ${p.via}` : ` · ${p.why}`}</small>
            </div>
          ))}
          <p className="hint">Subscriptions: ChatGPT Plus/Pro works through the Codex CLI (signed in). Claude Pro/Max works through Claude Code (signed in). Gemini image models need a billing-enabled API key; a Google account login cannot generate images programmatically.</p>
        </section>
        <section>
          <h4>API keys <span className="hint">stored only on this computer, in studio/data/settings.json</span></h4>
          {KEYS.map(([k, label]) => (
            <Field key={k} label={`${label}${s.keys[k]?.set ? ` · set (${s.keys[k].source}, ${s.keys[k].hint})` : ''}`}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" type="password" autoComplete="off" placeholder={s.keys[k]?.set ? 'Leave empty to keep' : 'Paste key'} value={keys[k] || ''} onChange={(e) => setKeys({ ...keys, [k]: e.target.value })} />
                {s.keys[k]?.source === 'studio' && <button className="btn sm ghost" onClick={() => save({ keys: { [k]: '' } })}>Remove</button>}
              </div>
            </Field>
          ))}
        </section>
        <section>
          <h4>Models <span className="hint">they update themselves if a provider retires one</span></h4>
          <div className="row">
            {Object.entries(s.models).map(([k, v]) => <Field key={k} label={k}><input className="input" defaultValue={v} onBlur={(e) => e.target.value !== v && save({ models: { [k]: e.target.value } })} /></Field>)}
          </div>
        </section>
        <section>
          <h4>Director and self-repair</h4>
          <p className="hint">{agent?.available ? `Claude Code found (${agent.cli}). Billing: ${agent.billing}.` : agent?.why}</p>
          <label className="check"><input type="checkbox" checked={s.autoRepair} onChange={(e) => save({ autoRepair: e.target.checked })} />Repair automatically: when a scene fails to render, Claude fixes the module and verifies it</label>
          <label className="check"><input type="checkbox" checked={!!s.director?.useApiKey} onChange={(e) => save({ director: { ...s.director, useApiKey: e.target.checked } })} />Bill the director to the Anthropic API key instead of the Claude plan</label>
          <div className="row">
            <Field label="Director model"><Select value={s.director?.model || ''} onChange={(v) => save({ director: { ...s.director, model: v || undefined } })} options={{ '': 'Claude Code default', opus: 'Opus', sonnet: 'Sonnet', fable: 'Fable' }} /></Field>
            <Field label="Max turns per task"><input className="input" type="number" defaultValue={s.director?.maxTurns || 80} onBlur={(e) => save({ director: { ...s.director, maxTurns: Number(e.target.value) || 80 } })} /></Field>
          </div>
        </section>
      </div>
    </Modal>
  );
}

// ---------- memory ----------
export function BrainPanel({ onClose, onOpenTask }) {
  const [m, setM] = useState(null);
  useEffect(() => { api.memory().then(setM).catch(() => setM({})); }, []);
  const lessons = useMemo(() => {
    const out = [];
    let cat = 'General';
    for (const line of String(m?.lessons || '').split('\n')) {
      if (line.startsWith('## ')) cat = line.slice(3);
      else if (line.startsWith('- ')) out.push({ cat, text: line.slice(2).replace(/<!--.*?-->/g, '').replace(/_\(why: (.*?)\)_/, '— $1').trim() });
    }
    return out;
  }, [m]);
  if (!m) return <Modal title="What the studio has learned" onClose={onClose}><p className="hint">Loading…</p></Modal>;
  const stats = Object.entries(m.stats || {}).map(([k, v]) => ({ k, ...v })).sort((a, b) => (b.ok + b.fail) - (a.ok + a.fail));
  return (
    <Modal title="What the studio has learned" onClose={onClose}>
      <div className="brain">
        <section>
          <h4>Rules it follows ({lessons.length})</h4>
          <p className="hint">Learned from your feedback and from its own mistakes. Every task reads these first. Edit them in studio/knowledge/lessons.md.</p>
          {[...new Set(lessons.map((l) => l.cat))].map((c) => (
            <div key={c} className="lesson-group"><span className="lbl">{c}</span>{lessons.filter((l) => l.cat === c).map((l, i) => <div key={i} className="lesson">{l.text}</div>)}</div>
          ))}
        </section>
        <section>
          <h4>Your recurring notes</h4>
          {(m.themes || []).length ? m.themes.map((t) => <div key={t.reason} className="theme"><span>{t.label}</span><span className="bar" style={{ width: `${Math.min(100, t.weight * 20)}%` }} /></div>) : <p className="hint">No ratings yet. Use “Rate” in the editor: a thumbs-down asks why and teaches the studio.</p>}
          <h4 style={{ marginTop: 18 }}>Generators, as measured</h4>
          {stats.length ? stats.map((s) => <div key={s.k} className="hint">{s.k.replace('|', ' · ')}: {s.ok} ok, {s.fail} failed{s.votes ? `, your votes ${s.score > 0 ? '+' : ''}${s.score}` : ''}{s.ms ? `, ~${Math.round(s.ms / 1000)} s` : ''}</div>) : <p className="hint">Nothing generated yet.</p>}
          <h4 style={{ marginTop: 18 }}>Self-repair</h4>
          {(m.errors || []).length ? m.errors.slice(0, 8).map((e) => <div key={e.sig} className={`issue ${e.status === 'fixed' ? 'info' : 'warn'}`} style={{ cursor: 'default' }}><i /><div>{e.source}{e.module ? ` · ${e.module}` : ''}: {e.message}<br /><small>{e.status} · seen {e.count}× · {ago(e.lastAt || e.firstAt)}</small></div></div>) : <p className="hint">No errors reported.</p>}
          <h4 style={{ marginTop: 18 }}>Recent director runs</h4>
          {(m.tasks || []).map((t) => <button key={t.id} className="task-row" onClick={() => onOpenTask?.(t.id)}><span className={`st ${t.status}`} /><span className="ttl">{t.brief}<small>{t.mode} · {ago(t.createdAt)}</small></span></button>)}
        </section>
      </div>
    </Modal>
  );
}
