import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './ui.jsx';

const EXAMPLES = {
  en: [
    'Make a step-by-step Reel on how to buy gold in the app',
    'Carousel: two people, one living with Goldcom and one without',
    'A 20-second Reel about gifting 1 gram of gold for Eid',
    'Story: a poll on gold or cash for a wedding gift, then how to send gold',
    'Explain what 24K means in a 6-slide carousel',
    'Reel: what happens after you tap Buy (price lock, fees, ownership)',
  ],
  ar: [
    'ريل خطوة بخطوة: كيف تشتري الذهب من التطبيق',
    'كاروسيل لشخصين: حياة مع جولدكم وحياة بدونها',
    'ريل ٢٠ ثانية عن إهداء جرام ذهب في العيد',
    'ستوري: تصويت ذهب أم نقود لهدية الزواج، ثم كيف ترسل الذهب',
  ],
};
const FORMATS = [['auto', 'Auto'], ['reel', 'Reel'], ['carousel', 'Carousel'], ['story', 'Story'], ['post', 'Post'], ['motion', 'Animated post']];
const STATUS = { running: 'In production', waiting: 'Waiting for you', done: 'Ready', error: 'Failed', cancelled: 'Cancelled', interrupted: 'Paused' };

export function StatusPill({ status }) {
  return <span className={`status ${status}`}>{status === 'running' && <i className="spin" />}{STATUS[status] || status}</span>;
}

export default function Home({ onOpenProduction, onOpenSettings, onGo, toast }) {
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState('auto');
  const [lang, setLang] = useState('ar');
  const [duration, setDuration] = useState(25);
  const [choose, setChoose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState(null);
  const [device, setDevice] = useState(null);
  const [footage, setFootage] = useState([]);
  const [recent, setRecent] = useState([]);
  const ta = useRef(null);

  useEffect(() => {
    api.settings().then((s) => setLang(s.language || 'ar')).catch(() => {});
    api.engine().then(setEngine).catch(() => setEngine({ selected: null }));
    api.device().then(setDevice).catch(() => setDevice(null));
    api.footage().then(setFootage).catch(() => {});
    const load = () => api.productions().then(setRecent).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    const p = prompt.trim();
    if (!p) { ta.current?.focus(); return; }
    if (engine && !engine.selected) { toast('Connect Claude first (Settings).', true); onOpenSettings(); return; }
    setBusy(true);
    try {
      const { jobId } = await api.produce(p, { format, lang, duration: ['reel', 'story', 'motion'].includes(format) || format === 'auto' ? duration : undefined, chooseConcept: choose });
      onOpenProduction(jobId);
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };

  const phone = device?.devices?.find((d) => d.state === 'device');
  const ready = footage.filter((f) => f.status === 'ready');

  return (
    <div className="home scroll">
      <section className="hero">
        <div className="hero-kicker"><Icon name="claude" size={14} />Goldcom AI production studio</div>
        <h1>What should we make <em>today</em>?</h1>
        <p className="hero-sub">Describe it in your own words. Claude writes the brief, explores three ideas, storyboards the best one, films the real app, edits it and reviews it like an art director.</p>
        <div className="composer">
          <textarea ref={ta} value={prompt} onChange={(e) => setPrompt(e.target.value)} dir="auto" rows={3}
            placeholder={lang === 'ar' ? 'مثال: ريل خطوة بخطوة يشرح كيف تشتري الذهب من التطبيق' : 'e.g. Make a step-by-step guide on how to buy gold in the app'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(); }} />
          <div className="composer-bar">
            <div className="seg">{FORMATS.map(([k, v]) => <button key={k} className={format === k ? 'on' : ''} onClick={() => setFormat(k)}>{v}</button>)}</div>
            <div className="seg"><button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>العربية</button><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button></div>
            {(format === 'auto' || format === 'reel') && (
              <div className="seg" title="Reel length">{[15, 25, 35].map((d) => <button key={d} className={duration === d ? 'on' : ''} onClick={() => setDuration(d)}>{d}s</button>)}</div>
            )}
            <label className="check inline"><input type="checkbox" checked={choose} onChange={(e) => setChoose(e.target.checked)} />Let me pick the concept</label>
            <span className="spacer" />
            <button className="btn primary lg" onClick={start} disabled={busy}><Icon name="claude" />{busy ? 'Starting…' : 'Create'}</button>
          </div>
        </div>
        <div className="chips">
          {(EXAMPLES[lang] || EXAMPLES.en).map((x) => <button key={x} className="chip" dir="auto" onClick={() => { setPrompt(x); ta.current?.focus(); }}>{x}</button>)}
        </div>
        <div className="readiness">
          <button className={`ready-item ${engine?.selected ? 'ok' : 'bad'}`} onClick={onOpenSettings}>
            <span className="dot" />{engine?.selected ? <>Claude connected · {engine.selected === 'api' ? 'API key' : 'Claude Code login'}</> : engine ? 'Claude not connected — open Settings' : 'Checking Claude…'}
          </button>
          <button className={`ready-item ${phone ? 'ok' : 'warn'}`} onClick={() => onGo('footage')}>
            <span className="dot" />{phone ? <>Phone connected · {phone.model || phone.serial}{device?.pkg ? ' · Goldcom app found' : ''}</> : device?.adb ? 'No phone connected' : 'Phone capture not set up'}
          </button>
          <button className={`ready-item ${ready.length ? 'ok' : 'warn'}`} onClick={() => onGo('footage')}>
            <span className="dot" />{ready.length ? `${ready.length} real app recording${ready.length > 1 ? 's' : ''} in the library` : 'No app footage yet — add a screen recording'}
          </button>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="recent">
          <div className="recent-head"><h3>Productions</h3><button className="btn sm ghost" onClick={() => onGo('designs')}><Icon name="grid" />All designs</button></div>
          <div className="prod-list">
            {recent.slice(0, 12).map((j) => (
              <button key={j.id} className="prod-card" onClick={() => onOpenProduction(j.id)}>
                <div className="prod-top"><StatusPill status={j.status} /><small>{new Date(j.createdAt).toLocaleString()}</small></div>
                <b dir="auto">{j.title || j.prompt}</b>
                {j.title && j.prompt && j.title !== j.prompt && <span className="hint" dir="auto">{j.prompt}</span>}
                {j.status === 'running' && <div className="bar thin"><div style={{ width: `${Math.round((j.progress || 0) * 100)}%` }} /></div>}
                {j.status === 'running' && <span className="hint">{j.message}</span>}
                {j.result?.score != null && <span className="hint">Art director score {j.result.score}/10</span>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
