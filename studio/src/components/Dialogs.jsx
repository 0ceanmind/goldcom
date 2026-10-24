import { useEffect, useMemo, useState } from 'react';
import { TEMPLATES, applyTemplate, exampleFor } from '../../shared/templates.js';
import { FORMATS, THEMES, KINDS } from '../../shared/brand.js';
import { STARTERS } from '../../shared/starters.js';
import { createDocument, createSlide, normalizeDocument } from '../../shared/schema.js';
import { api } from '../api.js';
import { Modal, Icon, Field, Select, SlideThumb, Copy } from './ui.jsx';

export function NewDocDialog({ onClose, onCreate, images }) {
  const [starter, setStarter] = useState('launch');
  const [lang, setLang] = useState('ar');
  const st = STARTERS[starter];
  const [format, setFormat] = useState(st.format);
  const [kind, setKind] = useState(st.kind);
  const [name, setName] = useState(st.name);
  useEffect(() => { setFormat(STARTERS[starter].format); setKind(STARTERS[starter].kind); setName(STARTERS[starter].name); }, [starter]);
  const preview = useMemo(() => {
    const d = createDocument({ name, format, kind, lang });
    d.slides = st.build(lang).map((s) => createSlide({ ...s, layers: s.layers || [] }));
    const n = normalizeDocument(d);
    n.slides = n.slides.map((s, i) => (s.template ? applyTemplate(s, n, i, n.slides.length) : s));
    return n;
  }, [starter, lang, format, kind, name, st]);
  return (
    <Modal title="New design" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onCreate(preview)}>Create</button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        <div>
          <div className="starter">
            {Object.entries(STARTERS).map(([k, s]) => (
              <button key={k} className={starter === k ? 'on' : ''} onClick={() => setStarter(k)}><b>{s.name}</b><small>{s.description}</small></button>
            ))}
          </div>
        </div>
        <div>
          <div className="row">
            <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Language"><div className="seg"><button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>العربية</button><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button></div></Field>
          </div>
          <div className="row">
            <Field label="Format"><Select value={format} onChange={setFormat} options={Object.fromEntries(Object.entries(FORMATS).map(([k, f]) => [k, `${f.label} · ${f.w}×${f.h}`]))} /></Field>
            <Field label="Type"><Select value={kind} onChange={(v) => { setKind(v); if ((v === 'reel' || v === 'story') && format !== 'story') setFormat('story'); }} options={Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label]))} /></Field>
          </div>
          <div className="grid-cards" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${format === 'linkedin' || format === 'video' ? 200 : 120}px, 1fr))` }}>
            {preview.slides.map((s, i) => <div key={s.id} className="tcard" style={{ cursor: 'default' }}><SlideThumb doc={preview} index={i} width={200} images={images} /></div>)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function TemplatePicker({ doc, onClose, onPick, images, defaultTheme = 'onyx' }) {
  const [theme, setTheme] = useState(defaultTheme);
  const preview = useMemo(() => {
    const ids = Object.keys(TEMPLATES);
    const d = { ...doc, slides: ids.map((id) => createSlide({ template: id, theme, content: { ...exampleFor(id, doc.lang) } })) };
    d.slides = d.slides.map((s, i) => applyTemplate(s, d, i, 3));
    return { d, ids };
  }, [doc.width, doc.height, doc.lang, doc.kind, theme]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title="Add a slide" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span className="lbl">Theme</span>
        <div className="seg">{Object.entries(THEMES).map(([k, t]) => <button key={k} className={theme === k ? 'on' : ''} onClick={() => setTheme(k)}>{t.label.split(' ')[0]}</button>)}</div>
        <span className="spacer" />
        <button className="btn sm" onClick={() => onPick(null, theme)}><Icon name="plus" />Blank slide</button>
      </div>
      <div className="grid-cards">
        {preview.ids.map((id, i) => (
          <button key={id} className="tcard" onClick={() => onPick(id, theme)}>
            <SlideThumb doc={preview.d} index={i} width={170} images={images} />
            <div><b>{TEMPLATES[id].name}</b><small>{TEMPLATES[id].description}</small></div>
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 14 }}>Previews show sample copy in your document language. Replace it in the Slide panel after adding.</p>
    </Modal>
  );
}

export function AssetPicker({ onClose, onPick, toast }) {
  const [assets, setAssets] = useState([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('http://localhost:3000');
  const [device, setDevice] = useState('phone');
  const load = () => api.assets().then(setAssets).catch(() => {});
  useEffect(() => { load(); }, []);
  const upload = async (files) => {
    setBusy(true);
    try {
      let last;
      for (const f of files) last = await api.upload(f);
      await load();
      if (last && files.length === 1) onPick(last.url);
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  const capture = async () => {
    setBusy(true);
    try { const a = await api.capture({ url, device }); onPick(a.url); } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title="Images and screenshots" onClose={onClose}>
      <div className={`drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files]); }}>
        <Icon name="upload" size={22} />
        <div style={{ margin: '6px 0 10px' }}>Drop images here, paste a screenshot, or</div>
        <label className="btn sm primary">Choose files<input type="file" accept="image/*" multiple hidden onChange={(e) => upload([...e.target.files])} /></label>
      </div>
      <div className="section" style={{ padding: '0 0 16px', borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
        <h4>Live screenshot from a URL</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or http://localhost:3000" />
          <div style={{ width: 130 }}><Select value={device} onChange={setDevice} options={{ phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop' }} /></div>
          <button className="btn primary" disabled={busy} onClick={capture}><Icon name="camera" />{busy ? 'Working…' : 'Capture'}</button>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>Captures your running app (for example a Claude Code project's dev server) at real device size. Needs Playwright on the studio machine.</p>
      </div>
      <div className="assets">
        {assets.filter((a) => a.mime.startsWith('image/')).map((a) => (
          <button key={a.file} className="asset" onClick={() => onPick(a.url)} title={a.file}><img src={a.url} alt={a.file} loading="lazy" /></button>
        ))}
      </div>
      {!assets.length && <p className="hint">No assets yet.</p>}
    </Modal>
  );
}

export function ClaudePanel({ onClose, health, docs, onOpen }) {
  const root = health?.root || '/path/to/goldcom/studio';
  const mcpCmd = `claude mcp add goldcom-studio --scope user -- node ${root}/mcp/server.mjs`;
  const fromClaude = docs.filter((d) => d.source?.type === 'claude-code').slice(0, 6);
  return (
    <Modal title="Connect Claude Code" onClose={onClose}>
      <p className="hint" style={{ fontSize: 13, marginTop: 0 }}>
        Once connected, any Claude Code project can design for you: Claude reads the project, captures live screenshots of it, writes on-brand copy and builds slides with the Goldcom templates. They appear here instantly, ready to edit and export.
      </p>
      <ol className="steps-list">
        <li><div><b>Run the one-time setup</b>
          <div className="codeblock">cd {root}{'\n'}npm run connect<Copy text={`cd ${root} && npm run connect`} /></div>
          <p className="hint">This registers the <code>goldcom-studio</code> MCP server for all your projects and installs the <code>/goldcom-studio</code> skill. Prefer to do it by hand?</p>
          <div className="codeblock">{mcpCmd}<Copy text={mcpCmd} /></div>
        </div></li>
        <li><div><b>Open any project in Claude Code and ask</b>
          <div className="codeblock">/goldcom-studio make an Arabic carousel about this project{'\n'}/goldcom-studio 20-second launch video, 9:16, English{'\n'}/goldcom-studio screenshot my app at localhost:3000 and add it to slide 3<Copy text="/goldcom-studio make an Arabic carousel about this project" /></div>
        </div></li>
        <li><div><b>Edit and export here</b><p className="hint" style={{ margin: 0 }}>Claude's slides use the same templates as this editor, so every word, image and layer stays editable. Claude can also check your edits and render previews.</p></div></li>
      </ol>
      <div className="section" style={{ padding: '18px 0 0', borderBottom: 0 }}>
        <h4>Recently created by Claude Code</h4>
        {fromClaude.length ? fromClaude.map((d) => (
          <div key={d.id} className="docrow" onClick={() => { onOpen(d.id); onClose(); }}>
            <div><b>{d.name}</b><small>{d.source?.project ? `from ${d.source.project} · ` : ''}{d.slides} slides · {new Date(d.updatedAt).toLocaleString()}</small></div>
            <span className="pill claude">Claude</span>
          </div>
        )) : <p className="hint">Nothing yet. Try the prompts above.</p>}
      </div>
    </Modal>
  );
}

export function LintPanel({ issues, onClose, onGo }) {
  return (
    <Modal title="Brand check" onClose={onClose} size="sm">
      {!issues.length && <div className="empty"><Icon name="check" size={28} /><p>Everything follows the Goldcom guidelines.</p></div>}
      {issues.map((i, k) => (
        <div key={k} className={`issue ${i.level}`} onClick={() => { onGo(i); onClose(); }}>
          <i /><div>{i.message}<br /><small>Slide {i.slide + 1}{i.layer ? ' · click to select the layer' : ''}</small></div>
        </div>
      ))}
      <p className="hint" style={{ marginTop: 12 }}>Checks come from the Goldcom brand guidelines: claims register, name spelling, disclaimers, logo use and price format.</p>
    </Modal>
  );
}
