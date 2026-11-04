import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { ICONS } from '../../shared/icons.js';
import { COLORS, COLOR_LABELS } from '../../shared/brand.js';
import { renderSlide } from '../render/renderer.js';
import { schedulePreview } from '../preview-queue.js';

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
  cube: ['M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z', 'M4 7.5l8 4.5 8-4.5', 'M12 12v9'],
  wand: ['M4 20 15 9', 'M15 4v2', 'M20 9h-2', 'M18.5 5.5l-1.4 1.4', 'M11 4.5l.6 1.4', 'M19.5 13l-1.4-.6'],
  thumbUp: ['M7 11v9H4v-9h3Z', 'M7 11l4-7a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7'],
  thumbDown: ['M7 13V4H4v9h3Z', 'M7 13l4 7a2 2 0 0 0 2-2v-4h5.5a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 17.3 4H7'],
  brain: ['M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h0V4Z', 'M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h0V4Z'],
  wrench: ['M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z'],
  key: ['M14 10a4 4 0 1 0-1.2 2.8L20 20', 'M17 17l2-2', 'M15 15l1.5-1.5'],
  gear: ['M12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
};

export function Icon({ name, size = 20, stroke = 1.75, fill, className }) {
  const paths = UI_ICONS[name] || ICONS[name] || ICONS.sparkle;
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill={fill || 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  return <SelectControl className="input" value={value ?? ''} onChange={event => onChange(event.target.value)} options={opts.map(([value,label]) => ({ value, label }))} />;
}

function optionText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(optionText).join('');
  return isValidElement(node) ? optionText(node.props.children) : '';
}

function optionItems(children) {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === 'option') return [{ value:child.props.value ?? optionText(child.props.children), label:optionText(child.props.children), disabled:child.props.disabled }];
    return optionItems(child.props.children);
  });
}

/** Goldcom-owned select. No native select element, browser picker, or hidden native menu. */
export function SelectControl({ value, onChange, options, children, className = '', disabled = false, id, style, title, name, 'aria-label': ariaLabel, 'aria-labelledby': labelledBy }) {
  const items = options || optionItems(children);
  const selected = items.findIndex(item => String(item.value) === String(value ?? ''));
  const uid = useId();
  const trigger = useRef(null);
  const popup = useRef(null);
  const search = useRef({ text:'',at:0 });
  const [open,setOpen] = useState(false);
  const [active,setActive] = useState(0);
  const [position,setPosition] = useState(null);
  const [fieldLabel,setFieldLabel] = useState('');
  const label = ariaLabel || fieldLabel || optionText(items[selected]?.label) || 'Choose an option';
  const listId = `goldcom-options-${uid}`;
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus({ preventScroll:true }); };
  const show = () => { if (disabled || !items.some(item => !item.disabled)) return; setActive(selected >= 0 && !items[selected].disabled ? selected : items.findIndex(item => !item.disabled)); setOpen(true); };
  const choose = index => {
    const item = items[index];
    if (!item || item.disabled) return;
    const target = { value:String(item.value), name };
    onChange?.({ target, currentTarget:target });
    close(true);
  };
  useLayoutEffect(() => {
    const labelElement = trigger.current?.closest('label') || trigger.current?.closest('.field')?.querySelector('label');
    if (!labelElement || ariaLabel) return;
    const text = [...labelElement.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ').trim() || labelElement.querySelector('.sr-only')?.textContent || (labelElement.contains(trigger.current) ? '' : labelElement.textContent);
    if (text) setFieldLabel(text.trim());
  }, [ariaLabel, children]);
  const placeMenu = () => {
    if (!trigger.current) return;
    const rect = (trigger.current.closest('.creation-options > label') || trigger.current).getBoundingClientRect();
    const width = Math.min(Math.max(rect.width,220),420,window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const flip = below < Math.min(items.length * 44 + 46,300) && above > below;
    const maxHeight = Math.max(80,Math.min(360,flip ? above : below));
    const height = Math.min(maxHeight,items.length * 44 + 46);
    const dir = trigger.current.closest('[dir]')?.getAttribute('dir') || 'ltr';
    const left = Math.max(12,Math.min(dir === 'rtl' ? rect.right - width : rect.left,window.innerWidth - width - 12));
    setPosition({ top:flip ? Math.max(8,rect.top - height - 8) : rect.bottom + 8, left, width, maxHeight, dir });
  };
  useLayoutEffect(() => { if (open) placeMenu(); }, [open, items.length]);
  useLayoutEffect(() => { if (open && position) popup.current?.focus({ preventScroll:true }); }, [open,position]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) close(); };
    let frame;
    const scroll = event => {
      if (popup.current?.contains(event.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = trigger.current?.getBoundingClientRect();
        if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) close(); else placeMenu();
      });
    };
    const resized = () => close();
    document.addEventListener('pointerdown',outside,true);
    document.addEventListener('scroll',scroll,true);
    window.addEventListener('resize',resized);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown',outside,true); document.removeEventListener('scroll',scroll,true); window.removeEventListener('resize',resized); };
  }, [open]);
  useEffect(() => { if (open) popup.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block:'nearest' }); }, [active,open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const keyDown = event => {
    if (event.key === 'Tab') { if (open) { event.stopPropagation(); close(true); } return; }
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (['Enter',' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); open ? choose(active) : show(); return; }
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (!open) { show(); return; }
      const enabled = items.map((item,index) => !item.disabled ? index : -1).filter(index => index >= 0);
      const current = enabled.indexOf(active);
      const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : enabled[(current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length];
      setActive(next); return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      const now = performance.now();
      search.current = { text:(now - search.current.at < 600 ? search.current.text : '') + event.key.toLocaleLowerCase(), at:now };
      const found = items.findIndex(item => !item.disabled && optionText(item.label).toLocaleLowerCase().startsWith(search.current.text));
      if (found >= 0) { event.preventDefault(); event.stopPropagation(); if (!open) show(); setActive(found); }
    }
  };
  return <span className={`gc-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}>
    <button ref={trigger} type="button" id={id} className={`gc-select-trigger ${className}`} style={style} title={title} disabled={disabled} role="combobox" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} onClick={() => open ? close(true) : show()} onKeyDown={keyDown}><span className="gc-select-value" dir="auto">{items[selected]?.label ?? items[0]?.label ?? '—'}</span><Icon name="down" size={13} className="gc-select-chevron" /></button>
    {open && position && createPortal(<div ref={popup} className="gc-select-menu" dir={position.dir} role="listbox" id={listId} aria-label={label} aria-activedescendant={`${listId}-${active}`} tabIndex={-1} style={{ top:position.top,left:position.left,width:position.width,maxHeight:position.maxHeight }} onKeyDown={keyDown}><div className="gc-select-heading" aria-hidden="true">{label}</div><div className="gc-select-options">{items.map((item,index) => <div key={`${item.value}-${index}`} id={`${listId}-${index}`} data-option-index={index} data-value={String(item.value)} className={`gc-select-option ${index === active ? 'is-active' : ''}`} role="option" aria-selected={index === selected} aria-disabled={!!item.disabled} onPointerMove={() => { if (!item.disabled) setActive(index); }} onClick={() => choose(index)}><span dir="auto">{item.label}</span><span className="gc-option-check">{index === selected && <Icon name="check" size={15} />}</span></div>)}</div></div>,document.body)}
  </span>;
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
    return schedulePreview(() => renderSlide(cv.getContext('2d'), doc, index, { t: Infinity, images, scale }));
  }, [key, width]);
  return <canvas ref={ref} style={{ width: '100%', aspectRatio: `${doc.width}/${doc.height}` }} />;
});

export function Modal({ title, onClose, children, footer, size }) {
  const modalRef = useRef(null);
  useDialogFocus(modalRef, onClose);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={modalRef} className={`modal ${size || ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header><h3>{title}</h3><button className="btn icon ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/** Keep keyboard focus in an open dialog, then return it to the trigger. */
export function useDialogFocus(ref, onClose, ready = true) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!ready) return;
    const previous = document.activeElement;
    const root = ref.current;
    if (!root) return;
    const selector = 'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]';
    const targets = () => [...root.querySelectorAll(selector)].filter(element => element.getClientRects().length);
    (targets()[0] || root).focus();
    const handle = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const list = targets();
      if (!list.length) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === list[0] || !root.contains(document.activeElement))) { event.preventDefault(); list.at(-1).focus(); }
      else if (!event.shiftKey && (document.activeElement === list.at(-1) || !root.contains(document.activeElement))) { event.preventDefault(); list[0].focus(); }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); if (previous?.isConnected) previous.focus(); };
  }, [ready]);
}

export function Copy({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn sm copy" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1400); }}>
      {ok ? 'Copied' : 'Copy'}
    </button>
  );
}
