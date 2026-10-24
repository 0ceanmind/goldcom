import { useEffect, useRef, useState, memo } from 'react';
import { ICONS } from '../../shared/icons.js';
import { COLORS, COLOR_LABELS } from '../../shared/brand.js';
import { renderSlide } from '../render/renderer.js';

const UI_ICONS = {
  plus: ['M12 5v14', 'M5 12h14'],
  crop: ['M6 2v14a2 2 0 0 0 2 2h14', 'M18 22V8a2 2 0 0 0-2-2H2'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  up: ['m6 14 6-6 6 6'],
  down: ['m6 10 6 6 6-6'],
  eyeOff: ['M3 3l18 18', 'M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6', 'M6.6 6.6A16.6 16.6 0 0 0 2.5 12S6 18 12 18a9.3 9.3 0 0 0 4.3-1'],
  unlock: ['M6 11h12v9.5H6z', 'M8.5 11V8a3.5 3.5 0 0 1 6.9-.8'],
  play: ['M7 4.5v15l12-7.5z'],
  pause: ['M7 5h3.5v14H7z', 'M13.5 5H17v14h-3.5z'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  download: ['M12 4v11', 'm7 10 5 5 5-5', 'M5 20h14'],
  text: ['M5 6V4h14v2', 'M12 4v16', 'M9 20h6'],
  image: ['M4 5h16v14H4z', 'm4 16 5-5 4 4 2-2 5 5', 'M15.5 9.5a1.5 1.5 0 1 0 0-.01'],
  square: ['M5 5h14v14H5z'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  zoomIn: ['M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'm20 20-3.5-3.5', 'M11 8v6', 'M8 11h6'],
  zoomOut: ['M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'm20 20-3.5-3.5', 'M8 11h6'],
  fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  claude: ['M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z'],
  warn: ['M12 4 2.5 20h19L12 4Z', 'M12 10v4', 'M12 17h.01'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z'],
  upload: ['M12 16V5', 'm7 10 5-5 5 5', 'M5 20h14'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M9 13a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
  gem: ['M12 3 21 12 12 21 3 12Z'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  comment: ['M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.6-4.3A8.5 8.5 0 1 1 20.5 11.5Z'],
  send: ['M21 3 10.5 13.5', 'M21 3l-6.5 18-4-7.5L3 9.5 21 3Z'],
  bookmark: ['M6 3.5h12v17l-6-4.5-6 4.5z'],
  back: ['M15 5l-7 7 7 7'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  film: ['M4 4h16v16H4z', 'M8 4v16', 'M16 4v16', 'M4 9h4', 'M4 15h4', 'M16 9h4', 'M16 15h4'],
  zones: ['M3 3h18v18H3z', 'M3 8h18', 'M3 16h18'],
  bar: ['M7 4h10l2 16H5L7 4Z', 'M9 9h6'],
  gear: ['M12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
};

export function Icon({ name, size = 20, stroke = 1.75, fill }) {
  const paths = UI_ICONS[name] || ICONS[name] || ICONS.sparkle;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={fill || 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

export function Num({ label, value, onChange, step = 1, min, max }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="num">
      <span>{label}</span>
      <input className="input" type="number" step={step} min={min} max={max} value={v === '' || v === null || v === undefined || !Number.isFinite(+v) ? '' : Math.round(v * 100) / 100}
        onChange={(e) => { const raw = e.target.value; setV(raw); if (raw !== '' && Number.isFinite(+raw) && (min === undefined || +raw >= min) && (max === undefined || +raw <= max)) onChange(+raw); }}
        onBlur={() => {
          // Out-of-range or empty values are clamped (or reset) when the field loses focus.
          if (v === '' || !Number.isFinite(+v)) { setV(value); return; }
          const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, +v));
          if (c !== +v) { setV(c); onChange(c); }
        }} />
    </div>
  );
}

/** Text input/textarea that commits on blur/Enter (keeps undo history clean) but previews live. */
export function TextIn({ value, onChange, multiline, rows = 3, rtl, code, placeholder, live = true }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const cls = `input${rtl ? ' rtl' : ''}${code ? ' code' : ''}`;
  const props = {
    className: cls, value: v, placeholder, dir: rtl ? 'rtl' : 'auto',
    onChange: (e) => { setV(e.target.value); if (live) onChange(e.target.value, { live: true }); },
    onBlur: () => { if (v !== value) onChange(v, { live: false }); },
  };
  return multiline ? <textarea rows={rows} {...props} spellCheck={!code} /> : <input {...props} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}

export function Select({ value, onChange, options }) {
  const opts = Array.isArray(options) ? options.map((o) => (typeof o === 'string' ? [o, o] : o)) : Object.entries(options);
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

const THEME_TOKENS = [['auto', 'Auto'], ['fg', 'Text'], ['fg2', 'Secondary'], ['accent', 'Accent'], ['surface', 'Surface']];
const PALETTE = ['white', 'cream', 'spark', 'gold', 'amber', 'bullion', 'bronze', 'bronzeDeep', 'espresso', 'sand', 'stone', 'stoneDark', 'graphite', 'charcoal', 'onyx', 'ink', 'gainDark', 'lossDark', 'gainLight', 'lossLight', 'info', 'mist', 'slate'];

export function ColorPick({ value, onChange, allowTheme = true }) {
  return (
    <div>
      {allowTheme && (
        <div className="seg" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
          {THEME_TOKENS.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
        </div>
      )}
      <div className="swatches">
        {PALETTE.map((k) => <button key={k} title={COLOR_LABELS[k]} className={`sw${value === k ? ' on' : ''}`} style={{ background: COLORS[k] }} onClick={() => onChange(k)} />)}
      </div>
    </div>
  );
}

/** Small canvas preview of a slide. Re-renders only when the slide changes. */
export const SlideThumb = memo(function SlideThumb({ doc, index, width = 180, images, version }) {
  const ref = useRef(null);
  const slide = doc.slides[index];
  const key = JSON.stringify(slide) + doc.width + doc.height + doc.lang + doc.slides.length + (version || 0);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const scale = (width * (window.devicePixelRatio || 1)) / doc.width;
    cv.width = Math.round(doc.width * scale);
    cv.height = Math.round(doc.height * scale);
    renderSlide(cv.getContext('2d'), doc, index, { t: Infinity, images, scale });
  }, [key, width]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} style={{ width: '100%', aspectRatio: `${doc.width}/${doc.height}` }} />;
});

export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size || ''}`} role="dialog" aria-label={title}>
        <header><h3>{title}</h3><button className="btn icon ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Copy({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn sm copy" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1400); }}>
      {ok ? 'Copied' : 'Copy'}
    </button>
  );
}
