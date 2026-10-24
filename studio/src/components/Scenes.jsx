// Scene picker and scene settings: built from each module's own metadata, so scenes Claude adds appear here too.
import { useEffect, useState } from 'react';
import { sceneRuntime } from '../render/scene3d/runtime.js';
import { Field, Num, TextIn, Select, Icon } from './ui.jsx';

export function useScenes() {
  const [list, setList] = useState(() => sceneRuntime.list());
  useEffect(() => {
    let alive = true;
    sceneRuntime.loadRegistry().then(() => alive && setList(sceneRuntime.list()));
    const off = sceneRuntime.onChange((e) => { if (e.type === 'invalidate' || e.type === 'module') setList(sceneRuntime.list()); });
    return () => { alive = false; off(); };
  }, []);
  return list;
}

const thumb = (m, lang) => `/api/scene-preview/${m.id}?w=216&h=270&v=${m.version}&lang=${lang || 'en'}`;

/** Grid of scenes with rendered stills and the idea each one communicates. */
export function ScenePicker({ value, onChange, lang = 'en' }) {
  const scenes = useScenes();
  const [open, setOpen] = useState(false);
  const cur = scenes.find((s) => s.id === value);
  return (
    <div className="scene-picker">
      <button className="scene-current" onClick={() => setOpen(!open)}>
        {cur ? <img src={thumb(cur, lang)} alt="" loading="lazy" /> : <span className="ph" />}
        <span className="meta">
          <b>{cur?.name || value || 'Choose a scene'}</b>
          <small>{cur ? (cur.idea?.[lang] || cur.idea?.en || cur.description) : 'One 3D visual that shows the idea'}</small>
          {cur?.status === 'error' && <small className="bad">This module failed to load: {cur.error}</small>}
        </span>
        <Icon name={open ? 'up' : 'down'} size={14} />
      </button>
      {open && (
        <div className="scene-grid">
          {scenes.map((m) => (
            <button key={m.id} className={`scene-card${m.id === value ? ' on' : ''}${m.status === 'error' ? ' broken' : ''}`} onClick={() => { onChange(m.id); setOpen(false); }} title={m.description}>
              <img src={thumb(m, lang)} alt="" loading="lazy" />
              <b>{m.name}</b>
              <small>{m.idea?.[lang] || m.idea?.en || ''}</small>
              {m.author && m.author !== 'studio' && <span className="by">{m.author}</span>}
            </button>
          ))}
          {!scenes.length && <p className="hint">Loading scenes…</p>}
        </div>
      )}
    </div>
  );
}

/** Settings for the chosen scene, generated from the module's `params`. */
export function SceneParams({ sceneId, value = {}, onChange, rtl, pickAsset }) {
  const scenes = useScenes();
  const meta = scenes.find((s) => s.id === sceneId);
  if (!meta) return <p className="hint">{sceneId ? 'Loading scene settings…' : 'Choose a scene first.'}</p>;
  if (!meta.params?.length) return <p className="hint">This scene has no settings.</p>;
  const set = (k, v, o) => onChange({ ...value, [k]: v }, o);
  return (
    <>
      {meta.params.map((p) => {
        const v = value[p.key] ?? p.default;
        const label = p.hint ? `${p.label} · ${p.hint}` : p.label;
        if (p.type === 'select') return <Field key={p.key} label={label}><Select value={v} onChange={(x) => set(p.key, x, { live: false })} options={p.options || []} /></Field>;
        if (p.type === 'number') return <Field key={p.key} label={label}><Num label="#" value={v} step={p.step || 1} min={p.min} max={p.max} onChange={(x) => set(p.key, x, { live: false })} /></Field>;
        if (p.type === 'asset') return (
          <Field key={p.key} label={label}>
            <div className="asset-field">
              <div className="prev" style={{ backgroundImage: v ? `url("${v}")` : undefined }} />
              <button className="btn sm" onClick={() => pickAsset?.((x) => set(p.key, x, { live: false }))}><Icon name="image" />{v ? 'Change' : 'Choose'}</button>
              {v && <button className="btn sm ghost" onClick={() => set(p.key, '', { live: false })} aria-label="Remove"><Icon name="x" /></button>}
            </div>
          </Field>
        );
        return <Field key={p.key} label={label}><TextIn value={v ?? ''} rtl={rtl && /[؀-ۿ]/.test(String(v || ''))} onChange={(x, o) => set(p.key, x, o)} /></Field>;
      })}
      <button className="btn sm ghost" onClick={() => onChange({}, { live: false })}>Reset to scene defaults</button>
    </>
  );
}
