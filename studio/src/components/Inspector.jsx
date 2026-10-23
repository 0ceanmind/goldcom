import { useEffect, useRef, useState } from 'react';
import { TEMPLATES } from '../../shared/templates.js';
import { THEMES, TYPE, ANIMATIONS, TRANSITIONS, COLORS, isArabic } from '../../shared/brand.js';
import { LAYER_TYPES } from '../../shared/schema.js';
import { ICON_NAMES } from '../../shared/icons.js';
import { Icon, Field, Num, TextIn, Select, ColorPick } from './ui.jsx';

const THEME_SWATCH = {
  onyx: 'radial-gradient(120% 80% at 50% 0%, #2D2E2B, #151513 60%)',
  charcoal: '#1D1D1F',
  bullion: 'linear-gradient(180deg,#62422A,#8A6B41 38%,#D0B366 74%,#EDD175)',
  cream: '#FFF8EA',
  sand: '#E8CC73',
};

export default function Inspector({ doc, slideIdx, layer, api, focusText }) {
  const [tab, setTab] = useState('slide');
  useEffect(() => { if (layer) setTab('layer'); }, [layer?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const slide = doc.slides[slideIdx];
  if (!slide) return <aside className="panel right"><div className="empty">No slide selected</div></aside>;
  return (
    <aside className="panel right">
      <div className="tabs">
        <button className={tab === 'slide' ? 'on' : ''} onClick={() => setTab('slide')}>Slide</button>
        <button className={tab === 'layer' ? 'on' : ''} onClick={() => setTab('layer')}>Layer</button>
        <button className={tab === 'layers' ? 'on' : ''} onClick={() => setTab('layers')}>Layers <span className="count">{slide.layers.length}</span></button>
      </div>
      <div className="scroll">
        {tab === 'slide' && <SlidePanel doc={doc} slide={slide} api={api} />}
        {tab === 'layer' && (layer ? <LayerPanel layer={layer} api={api} doc={doc} focusText={focusText} /> : <div className="empty">Select a layer on the canvas, or add one from the toolbar.</div>)}
        {tab === 'layers' && <LayerList slide={slide} selId={layer?.id} api={api} />}
      </div>
    </aside>
  );
}

function SlidePanel({ doc, slide, api }) {
  const tpl = TEMPLATES[slide.template];
  const content = slide.content || {};
  const lang = content.lang || doc.lang;
  const rtl = lang === 'ar';
  const setC = (key, value, opts) => api.setContent({ ...content, [key]: value }, opts);
  return (
    <>
      <div className="section">
        <h4>Theme</h4>
        <div className="themes">
          {Object.entries(THEMES).map(([k, t]) => (
            <button key={k} title={t.label} className={`theme-chip${slide.theme === k ? ' on' : ''}`} style={{ background: THEME_SWATCH[k] }} onClick={() => api.updateSlide({ theme: k }, { relayout: true })} />
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <Field label="Pattern"><Select value={slide.pattern || 'none'} onChange={(v) => api.updateSlide({ pattern: v })} options={{ top: 'Top fade', full: 'Full', none: 'None' }} /></Field>
          <Field label="Background"><Select value={slide.bg?.type || 'theme'} onChange={(v) => api.updateSlide({ bg: v === 'theme' ? null : v === 'image' ? { type: 'image', src: slide.bg?.src || '' } : { type: 'color', color: 'onyx' } })} options={{ theme: 'Theme', color: 'Solid colour', image: 'Photo + scrim' }} /></Field>
        </div>
        {slide.bg?.type === 'color' && <ColorPick value={slide.bg.color} allowTheme={false} onChange={(v) => api.updateSlide({ bg: { type: 'color', color: v } })} />}
        {slide.bg?.type === 'image' && <AssetInput value={slide.bg.src} onChange={(v) => api.updateSlide({ bg: { type: 'image', src: v } })} api={api} />}
      </div>

      {tpl ? (
        <div className="section">
          <h4>{tpl.name} content <Select value={slide.template} onChange={(v) => api.changeTemplate(v)} options={Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, t.name]))} /></h4>
          {slide.custom && (
            <div className="note">
              You edited this slide's layout by hand, so content changes now update text in place.
              <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => api.reapply()}>Re-apply template layout</button></div>
            </div>
          )}
          <Field label="Language">
            <div className="seg">
              {[['', `Document (${doc.lang.toUpperCase()})`], ['ar', 'العربية'], ['en', 'English']].map(([k, l]) => (
                <button key={k} className={(content.lang || '') === k ? 'on' : ''} onClick={() => api.setContent({ ...content, lang: k || undefined }, { relayout: true })}>{l}</button>
              ))}
            </div>
          </Field>
          {tpl.fields.map((f) => <ContentField key={f.key} f={f} value={content[f.key]} rtl={rtl} onChange={(v, o) => setC(f.key, v, o)} api={api} />)}
        </div>
      ) : (
        <div className="section">
          <h4>Custom slide</h4>
          <p className="hint">This slide is free-form. Add layers from the toolbar, or convert it to a template.</p>
          <Select value="" onChange={(v) => v && api.changeTemplate(v)} options={[['', 'Convert to template…'], ...Object.entries(TEMPLATES).map(([k, t]) => [k, t.name])]} />
        </div>
      )}

      <div className="section">
        <h4>Motion</h4>
        <div className="row">
          <Field label="Duration (s)"><Num label="S" value={slide.duration} step={0.5} min={1} onChange={(v) => api.updateSlide({ duration: v })} /></Field>
          <Field label="Transition in"><Select value={slide.transition} onChange={(v) => api.updateSlide({ transition: v })} options={TRANSITIONS} /></Field>
        </div>
        <button className="btn sm" onClick={() => api.staggerAnimations()}>Auto-animate layers</button>
      </div>
    </>
  );
}

function ContentField({ f, value, onChange, rtl, api }) {
  const isRtl = rtl || isArabic(String(value || ''));
  switch (f.type) {
    case 'textarea': return <Field label={f.label}><TextIn multiline rows={2} value={value || ''} rtl={isRtl} onChange={onChange} /></Field>;
    case 'code': return <Field label={f.label}><TextIn multiline code rows={7} value={value || ''} onChange={onChange} /></Field>;
    case 'list': return <Field label={f.label}><TextIn multiline rows={4} rtl={isRtl} value={Array.isArray(value) ? value.join('\n') : value || ''} onChange={(v, o) => onChange(v.split('\n').filter((x, i, a) => x.trim() || i === a.length - 1), o)} /></Field>;
    case 'select': return <Field label={f.label}><Select value={value || f.options[0]} onChange={(v) => onChange(v, { live: false, relayout: true })} options={f.options} /></Field>;
    case 'asset': return <Field label={f.label}><AssetInput value={value} onChange={(v) => onChange(v, { live: false, relayout: true })} api={api} /></Field>;
    case 'icon': return <Field label={f.label}><IconGrid value={value} onChange={(v) => onChange(v, { live: false })} /></Field>;
    default: return <Field label={f.label}><TextIn value={value || ''} rtl={isRtl} onChange={onChange} /></Field>;
  }
}

function AssetInput({ value, onChange, api }) {
  return (
    <div className="asset-field">
      <div className="prev" style={{ backgroundImage: value ? `url("${value}")` : undefined }} />
      <button className="btn sm" onClick={() => api.pickAsset(onChange)}><Icon name="image" />{value ? 'Change' : 'Choose'}</button>
      {value && <button className="btn sm ghost" onClick={() => onChange('')} aria-label="Remove image"><Icon name="x" /></button>}
    </div>
  );
}

function IconGrid({ value, onChange }) {
  return (
    <div className="icon-grid">
      {ICON_NAMES.map((n) => <button key={n} title={n} className={value === n ? 'on' : ''} onClick={() => onChange(n)}><Icon name={n} /></button>)}
    </div>
  );
}

function LayerPanel({ layer: l, api, doc, focusText }) {
  const up = (patch, opts) => api.updateLayer(l.id, patch, opts);
  const textRef = useRef(null);
  useEffect(() => {
    if (focusText === l.id) textRef.current?.querySelector('textarea, input')?.focus();
  }, [focusText, l.id]);
  const rtl = l.dir === 'rtl' || isArabic(l.text || (l.items || []).join(' '));
  return (
    <>
      <div className="section">
        <h4>{LAYER_TYPES[l.type] || l.type}{l.name ? ` · ${l.name}` : ''}
          <span style={{ display: 'flex', gap: 2 }}>
            <button className="btn icon sm ghost" title="Duplicate" onClick={() => api.duplicateLayer(l.id)}><Icon name="copy" /></button>
            <button className="btn icon sm ghost danger" title="Delete" onClick={() => api.deleteLayer(l.id)}><Icon name="trash" /></button>
          </span>
        </h4>
        <div ref={textRef}>
          {l.type === 'text' && (
            <>
              <Field label="Text (wrap a word in *asterisks* for the accent colour)"><TextIn multiline rows={3} value={l.text} rtl={rtl} onChange={(v, o) => up({ text: v }, o)} /></Field>
              <div className="row">
                <Field label="Style"><Select value={l.role} onChange={(v) => up({ role: v, size: undefined })} options={Object.keys(TYPE)} /></Field>
                <Field label="Size override (px)"><Num label="PX" value={l.size ?? ''} onChange={(v) => up({ size: v || undefined })} /></Field>
              </div>
              <div className="row">
                <Field label="Align"><Select value={l.align} onChange={(v) => up({ align: v })} options={{ start: 'Start', center: 'Centre', end: 'End' }} /></Field>
                <Field label="Vertical"><Select value={l.valign} onChange={(v) => up({ valign: v })} options={{ top: 'Top', middle: 'Middle', bottom: 'Bottom' }} /></Field>
              </div>
              <div className="row">
                <Field label="Direction"><Select value={l.dir} onChange={(v) => up({ dir: v })} options={{ auto: 'Auto', rtl: 'RTL (Arabic)', ltr: 'LTR' }} /></Field>
                <Field label="Fit"><label className="check"><input type="checkbox" checked={!!l.fit} onChange={(e) => up({ fit: e.target.checked })} />Shrink to box</label></Field>
              </div>
              <Field label="Colour"><ColorPick value={l.color} onChange={(v) => up({ color: v })} /></Field>
              <Field label="Accent (for *words*)"><ColorPick value={l.accent} onChange={(v) => up({ accent: v })} /></Field>
            </>
          )}
          {l.type === 'list' && (
            <>
              <Field label="Items (one per line)"><TextIn multiline rows={5} rtl={rtl} value={(l.items || []).join('\n')} onChange={(v, o) => up({ items: v.split('\n') }, o)} /></Field>
              <div className="row">
                <Field label="Bullet"><Select value={l.bullet} onChange={(v) => up({ bullet: v })} options={{ gem: 'Gem', number: 'Number', check: 'Check', dash: 'Dash' }} /></Field>
                <Field label="Style"><Select value={l.role} onChange={(v) => up({ role: v })} options={['h3', 'body-lg', 'body', 'small']} /></Field>
              </div>
              <Field label="Direction"><Select value={l.dir} onChange={(v) => up({ dir: v })} options={{ auto: 'Auto', rtl: 'RTL (Arabic)', ltr: 'LTR' }} /></Field>
              <Field label="Colour"><ColorPick value={l.color} onChange={(v) => up({ color: v })} /></Field>
            </>
          )}
          {l.type === 'logo' && (
            <div className="row">
              <Field label="Version"><Select value={l.variant} onChange={(v) => { const r = v === 'horizontal' ? 541 / 1364 : v === 'stacked' ? 842 / 876 : 540 / 427; up({ variant: v, h: Math.round(l.w * r) }); }} options={{ horizontal: 'Horizontal', stacked: 'Stacked', symbol: 'Symbol' }} /></Field>
              <Field label="Colour"><Select value={l.mode} onChange={(v) => up({ mode: v })} options={{ auto: 'Auto (by theme)', primary: 'Primary', reversed: 'Reversed', 'mono-black': 'Mono black', 'mono-white': 'Mono white' }} /></Field>
            </div>
          )}
          {(l.type === 'image' || l.type === 'phone' || l.type === 'browser') && (
            <Field label={l.type === 'image' ? 'Image' : 'Screenshot'}><AssetInput value={l.src} onChange={(v) => up({ src: v })} api={api} /></Field>
          )}
          {l.type === 'image' && (
            <>
              <div className="row">
                <Field label="Fit"><Select value={l.fit} onChange={(v) => up({ fit: v })} options={{ cover: 'Cover', contain: 'Contain' }} /></Field>
                <Field label="Radius"><Num label="R" value={l.radius} onChange={(v) => up({ radius: v })} /></Field>
              </div>
              <label className="check"><input type="checkbox" checked={!!l.facet} onChange={(e) => up({ facet: e.target.checked })} />Facet corner (45° chamfer)</label>
              <label className="check"><input type="checkbox" checked={!!l.scrim} onChange={(e) => up({ scrim: e.target.checked })} />Dark scrim for text</label>
            </>
          )}
          {l.type === 'phone' && l.src && <label className="check"><input type="checkbox" checked={l.statusBar !== false} onChange={(e) => up({ statusBar: e.target.checked })} />Add status bar (untick for real device screenshots)</label>}
          {l.type === 'phone' && (
            <div className="row">
              <Field label="Placeholder screen"><Select value={l.placeholder} onChange={(v) => up({ placeholder: v })} options={{ home: 'Home', browse: 'Browse' }} /></Field>
              <Field label="Placeholder language"><Select value={l.lang} onChange={(v) => up({ lang: v })} options={{ en: 'English', ar: 'العربية' }} /></Field>
            </div>
          )}
          {l.type === 'browser' && <Field label="Address bar"><TextIn value={l.url} onChange={(v, o) => up({ url: v }, o)} /></Field>}
          {l.type === 'code' && (
            <>
              <Field label="File name"><TextIn value={l.title} onChange={(v, o) => up({ title: v }, o)} /></Field>
              <Field label="Code"><TextIn multiline code rows={8} value={l.code} onChange={(v, o) => up({ code: v }, o)} /></Field>
            </>
          )}
          {l.type === 'goldbar' && (
            <div className="row">
              <Field label="Weight"><TextIn value={l.label} onChange={(v, o) => up({ label: v }, o)} /></Field>
              <Field label="Stamp"><TextIn multiline rows={2} value={l.sub} onChange={(v, o) => up({ sub: v }, o)} /></Field>
            </div>
          )}
          {l.type === 'chart' && (
            <>
              <Field label="Values (comma separated, oldest first)"><TextIn value={(l.points || []).join(', ')} onChange={(v, o) => up({ points: v.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n)) }, o)} /></Field>
              <div className="row">
                <Field label="Trend colour"><Select value={l.trend} onChange={(v) => up({ trend: v })} options={{ auto: 'Auto', up: 'Up (gold)', down: 'Down (loss)' }} /></Field>
                <Field label="Options">
                  <label className="check"><input type="checkbox" checked={!!l.area} onChange={(e) => up({ area: e.target.checked })} />Area</label>
                  <label className="check"><input type="checkbox" checked={!!l.grid} onChange={(e) => up({ grid: e.target.checked })} />Grid</label>
                </Field>
              </div>
            </>
          )}
          {(l.type === 'button' || l.type === 'badge') && (
            <>
              <Field label="Label"><TextIn value={l.text} rtl={isArabic(l.text)} onChange={(v, o) => up({ text: v }, o)} /></Field>
              <Field label="Style"><Select value={l.variant} onChange={(v) => up({ variant: v })} options={l.type === 'button' ? { auto: 'Auto (by theme)', spark: 'Spark', charcoal: 'Charcoal', outline: 'Outline' } : { spark: 'Spark', gain: 'Gain', loss: 'Loss', info: 'Info', outline: 'Outline' }} /></Field>
              {l.type === 'badge' && <label className="check"><input type="checkbox" checked={!!l.gem} onChange={(e) => up({ gem: e.target.checked })} />Gem marker</label>}
            </>
          )}
          {l.type === 'icon' && (
            <>
              <Field label="Icon"><IconGrid value={l.icon} onChange={(v) => up({ icon: v })} /></Field>
              <label className="check"><input type="checkbox" checked={!!l.tile} onChange={(e) => up({ tile: e.target.checked })} />Tile background</label>
              <Field label="Colour"><ColorPick value={l.color} onChange={(v) => up({ color: v })} /></Field>
            </>
          )}
          {l.type === 'gem' && <Field label="Fill"><Select value={l.fill} onChange={(v) => up({ fill: v })} options={{ goldLeaf: 'Gold Leaf', gold: 'Gold', spark: 'Spark', amber: 'Amber', white: 'White' }} /></Field>}
          {l.type === 'shape' && (
            <>
              <div className="row">
                <Field label="Shape"><Select value={l.shape} onChange={(v) => up({ shape: v })} options={{ rect: 'Rectangle', circle: 'Ellipse', line: 'Line' }} /></Field>
                <Field label="Radius"><Num label="R" value={l.radius} onChange={(v) => up({ radius: v })} /></Field>
              </div>
              <label className="check"><input type="checkbox" checked={!!l.facet} onChange={(e) => up({ facet: e.target.checked })} />Facet corner (45° chamfer)</label>
              <Field label="Fill"><ColorPick value={l.fill} onChange={(v) => up({ fill: v })} /></Field>
              <Field label="Border"><Select value={l.stroke || ''} onChange={(v) => up({ stroke: v })} options={[['', 'None'], ['accent', 'Accent'], ['border', 'Theme border'], ['spark', 'Spark'], ['gold', 'Gold'], ['white', 'White']]} /></Field>
            </>
          )}
          {l.type === 'pager' && <Field label="Style"><Select value={l.style} onChange={(v) => up({ style: v })} options={{ dots: 'Dots', count: '01 / 08', swipe: 'Swipe hint' }} /></Field>}
        </div>
      </div>

      <div className="section">
        <h4>Position</h4>
        <div className="row4">
          <Num label="X" value={l.x} onChange={(v) => up({ x: v })} />
          <Num label="Y" value={l.y} onChange={(v) => up({ y: v })} />
          <Num label="W" value={l.w} onChange={(v) => up({ w: v })} />
          <Num label="H" value={l.h} onChange={(v) => up({ h: v })} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <Num label="°" value={l.rotation || 0} onChange={(v) => up({ rotation: l.type === 'logo' ? 0 : v })} />
          <Num label="%" value={Math.round((l.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => up({ opacity: Math.max(0, Math.min(1, v / 100)) })} />
        </div>
        <div className="row3" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => up({ x: Math.round((doc.width - l.w) / 2) })}>Centre H</button>
          <button className="btn sm" onClick={() => up({ y: Math.round((doc.height - l.h) / 2) })}>Centre V</button>
          <button className="btn sm" onClick={() => up({ x: doc.width - l.x - l.w })}>Mirror</button>
        </div>
      </div>

      <div className="section">
        <h4>Animation</h4>
        <Field label="Entrance"><Select value={l.anim?.in || 'none'} onChange={(v) => up({ anim: { ...l.anim, in: v } })} options={ANIMATIONS} /></Field>
        <div className="row">
          <Num label="D" value={l.anim?.delay ?? 0} step={0.05} min={0} onChange={(v) => up({ anim: { ...l.anim, delay: v } })} />
          <Num label="T" value={l.anim?.dur ?? 0.6} step={0.05} min={0.1} onChange={(v) => up({ anim: { ...l.anim, dur: v } })} />
        </div>
        <p className="hint" style={{ marginTop: 6 }}>D = delay, T = duration (seconds). Press Play below the canvas to preview.</p>
      </div>
    </>
  );
}

const LAYER_ICON = { text: 'text', list: 'list', logo: 'gem', image: 'image', phone: 'phone', browser: 'globe', code: 'code', goldbar: 'bar', chart: 'chart', button: 'square', badge: 'square', icon: 'sparkle', gem: 'gem', shape: 'square', pager: 'more' };

function LayerList({ slide, selId, api }) {
  const layers = [...slide.layers].reverse();
  return (
    <div className="section">
      <h4>Layers <span className="hint" style={{ textTransform: 'none', letterSpacing: 0 }}>top first</span></h4>
      <div className="layers">
        {layers.map((l) => (
          <div key={l.id} className={`layer-row${l.id === selId ? ' on' : ''}`} onClick={() => api.select(l.id)}>
            <Icon name={LAYER_ICON[l.type] || 'square'} />
            <span className="ttl">{l.name || LAYER_TYPES[l.type]}<small>{l.type === 'text' ? (l.text || '').replace(/\*/g, '').slice(0, 24) : ''}</small></span>
            <span style={{ display: 'flex' }}>
              <button title="Bring forward" onClick={(e) => { e.stopPropagation(); api.moveLayer(l.id, 1); }}><Icon name="up" /></button>
              <button title="Send backward" onClick={(e) => { e.stopPropagation(); api.moveLayer(l.id, -1); }}><Icon name="down" /></button>
            </span>
            <span style={{ display: 'flex' }}>
              <button title={l.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); api.updateLayer(l.id, { hidden: !l.hidden }); }}><Icon name={l.hidden ? 'eyeOff' : 'eye'} /></button>
              <button title={l.locked ? 'Unlock' : 'Lock'} onClick={(e) => { e.stopPropagation(); api.updateLayer(l.id, { locked: !l.locked }); }}><Icon name={l.locked ? 'lock' : 'unlock'} /></button>
            </span>
          </div>
        ))}
      </div>
      {!layers.length && <p className="hint">No layers yet.</p>}
      <p className="hint" style={{ marginTop: 12 }}>Shortcuts: Delete removes · arrows nudge (Shift = 10 px) · Ctrl/Cmd+D duplicates · Ctrl/Cmd+Z undo.</p>
      <p className="hint">Colours on the canvas always come from the Goldcom palette: {Object.keys(COLORS).length} brand tokens.</p>
    </div>
  );
}
