import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { loadFonts, ImageCache } from './render/renderer.js';
import { exportPng, exportZip, exportVideo, exportGif, exportJson } from './render/export.js';
import { normalizeDocument, createSlide, layerDefaults, uid, clone, LAYER_TYPES } from '../shared/schema.js';
import { TEMPLATES, applyTemplate, applyAllTemplates, patchContent, exampleFor } from '../shared/templates.js';
import { FORMATS } from '../shared/brand.js';
import { lintDocument } from '../shared/lint.js';
import Stage, { Timeline, createClock } from './components/Stage.jsx';
import Inspector from './components/Inspector.jsx';
import { NewDocDialog, TemplatePicker, AssetPicker, ClaudePanel, LintPanel } from './components/Dialogs.jsx';
import { Icon, SlideThumb, Select } from './components/ui.jsx';

const TOOLS = [
  ['text', 'Text', 'text'], ['list', 'List', 'list'], ['logo', 'Logo', 'gem'], ['image', 'Image', 'image'], ['phone', 'Phone', 'phone'],
  ['browser', 'Browser', 'globe'], ['code', 'Code', 'code'], ['goldbar', 'Gold bar', 'bar'], ['chart', 'Chart', 'chart'],
  ['button', 'Button', 'square'], ['badge', 'Badge', 'check'], ['icon', 'Icon', 'sparkle'], ['gem', 'Gem', 'gem'], ['shape', 'Shape', 'square'], ['pager', 'Pager', 'more'],
];

const routeId = () => (location.hash.match(/#\/doc\/([\w-]+)/) || [])[1];

export default function App() {
  const [health, setHealth] = useState(null);
  const [docs, setDocs] = useState([]);
  const [doc, setDoc] = useState(null);
  const docRef = useRef(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [selId, setSelId] = useState(null);
  const [leftTab, setLeftTab] = useState('slides');
  const [modal, setModal] = useState(null);
  const assetCb = useRef(null);
  const [toasts, setToasts] = useState([]);
  const [progress, setProgress] = useState(null);
  const [live, setLive] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [imagesVersion, setImagesVersion] = useState(0);
  const [focusText, setFocusText] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [query, setQuery] = useState('');
  const images = useMemo(() => new ImageCache(() => setImagesVersion((v) => v + 1)), []);
  const clock = useMemo(createClock, []);
  const hist = useRef({ past: [], future: [], base: null });
  const lastSaved = useRef(null);
  const saveTimer = useRef(null);

  const toast = useCallback((msg, err) => {
    const id = uid('t');
    setToasts((t) => [...t, { id, msg, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), err ? 6000 : 3200);
  }, []);

  const refreshList = useCallback(() => api.list().then(setDocs).catch(() => {}), []);

  // ---------- load ----------
  const openDoc = useCallback(async (id, { keepSlide } = {}) => {
    try {
      const d = normalizeDocument(await api.get(id));
      docRef.current = d;
      setDoc(d);
      setSlideIdx((i) => (keepSlide ? Math.min(i, d.slides.length - 1) : 0));
      if (!keepSlide) { setSelId(null); hist.current = { past: [], future: [], base: null }; clock.playing = false; clock.set(null); }
      lastSaved.current = d.updatedAt;
      if (routeId() !== id) history.replaceState(null, '', `#/doc/${id}`);
    } catch (e) { toast(e.message, true); }
  }, [clock, toast]);

  useEffect(() => {
    loadFonts().then(() => setFontsReady(true));
    api.health().then(setHealth).catch(() => {});
    api.list().then((list) => {
      setDocs(list);
      const id = routeId() || list[0]?.id;
      if (id) openDoc(id);
    }).catch((e) => toast(`Studio server not reachable: ${e.message}`, true));
    const onHash = () => { const id = routeId(); if (id && id !== docRef.current?.id) openDoc(id); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- live updates (Claude Code writes documents through MCP) ----------
  useEffect(() => {
    let es;
    let retry;
    const connect = () => {
      es = new EventSource('/api/events');
      es.onopen = () => setLive(true);
      es.onerror = () => { setLive(false); es.close(); retry = setTimeout(connect, 3000); };
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data);
        if (ev.type === 'document' || ev.type === 'deleted') refreshList();
        const cur = docRef.current;
        if (ev.type === 'document' && cur && ev.id === cur.id && ev.updatedAt !== lastSaved.current && ev.updatedAt !== cur.updatedAt) {
          openDoc(ev.id, { keepSlide: true });
          toast(ev.origin === 'claude-code' ? `Claude Code updated "${ev.name}"` : `"${ev.name}" was updated`);
        } else if (ev.type === 'document' && ev.origin === 'claude-code' && (!cur || ev.id !== cur.id)) {
          toast(`Claude Code saved "${ev.name}". Open it from the Library.`);
        }
        if (ev.type === 'deleted' && cur && ev.id === cur.id) { setDoc(null); docRef.current = null; }
      };
    };
    connect();
    return () => { clearTimeout(retry); es?.close(); };
  }, [openDoc, refreshList, toast]);

  // ---------- mutations ----------
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const d = docRef.current;
      if (!d) return;
      try {
        const saved = await api.save({ ...d, source: d.source ? { ...d.source, lastWriter: 'studio' } : d.source });
        lastSaved.current = saved.updatedAt;
        docRef.current = { ...docRef.current, updatedAt: saved.updatedAt };
        setDocs((list) => list.map((x) => (x.id === saved.id ? { ...x, name: saved.name, updatedAt: saved.updatedAt, slides: saved.slides.length, kind: saved.kind, format: saved.format } : x)));
      } catch (e) { toast(`Save failed: ${e.message}`, true); }
    }, 450);
  }, [toast]);

  const change = useCallback((fn, { live: isLive } = {}) => {
    const cur = docRef.current;
    if (!cur) return;
    const draft = clone(cur);
    const next = fn(draft) || draft;
    const h = hist.current;
    if (isLive) { if (!h.base) h.base = cur; } else { h.past.push(h.base || cur); h.base = null; if (h.past.length > 120) h.past.shift(); h.future = []; }
    docRef.current = next;
    setDoc(next);
    scheduleSave();
  }, [scheduleSave]);

  const undo = useCallback(() => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(docRef.current);
    const prev = h.past.pop();
    docRef.current = prev; setDoc(prev); setSlideIdx((i) => Math.min(i, prev.slides.length - 1)); scheduleSave();
  }, [scheduleSave]);
  const redo = useCallback(() => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(docRef.current);
    const next = h.future.pop();
    docRef.current = next; setDoc(next); scheduleSave();
  }, [scheduleSave]);

  const withSlide = (d, i, fn) => { const s = d.slides[i]; if (s) d.slides[i] = fn(s) || s; return d; };
  const s0 = doc ? Math.min(doc.width, doc.height) / 1080 : 1;

  const ops = useMemo(() => ({
    select: (id) => setSelId(id),
    updateSlide: (patch, opts = {}) => change((d) => withSlide(d, slideIdx, (s) => {
      const n = { ...s, ...patch };
      return opts.relayout && n.template && !n.custom ? applyTemplate(n, d, slideIdx, d.slides.length) : n;
    })),
    setContent: (content, opts = {}) => change((d) => withSlide(d, slideIdx, (s) => {
      if (s.custom) return patchContent(s, content);
      return applyTemplate({ ...s, content }, d, slideIdx, d.slides.length);
    }), { live: opts.live }),
    changeTemplate: (id) => change((d) => withSlide(d, slideIdx, (s) => {
      const content = s.content?.title ? { ...exampleFor(id, s.content?.lang || d.lang), ...s.content } : { ...exampleFor(id, d.lang), ...(s.content || {}) };
      return applyTemplate({ ...s, template: id, content }, d, slideIdx, d.slides.length);
    })),
    reapply: () => change((d) => withSlide(d, slideIdx, (s) => applyTemplate(s, d, slideIdx, d.slides.length))),
    staggerAnimations: () => change((d) => withSlide(d, slideIdx, (s) => {
      const sorted = [...s.layers].sort((a, b) => a.y - b.y);
      const order = new Map(sorted.map((l, i) => [l.id, i]));
      return { ...s, layers: s.layers.map((l) => {
        const i = order.get(l.id);
        const kind = l.type === 'logo' ? 'fade' : l.type === 'chart' ? 'draw' : l.type === 'pager' ? 'none' : l.type === 'goldbar' || l.type === 'gem' ? 'scale' : l.type === 'code' ? 'type' : /\d/.test(l.text || '') && l.role === 'stat' ? 'count' : 'fade-up';
        return { ...l, anim: { in: kind, delay: +(i * 0.12).toFixed(2), dur: kind === 'draw' ? 1.3 : kind === 'type' ? 1.5 : 0.6 } };
      }) };
    })),
    updateLayer: (id, patch, opts = {}) => change((d) => withSlide(d, slideIdx, (s) => ({
      ...s,
      custom: s.template ? true : s.custom,
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })), { live: opts.live }),
    deleteLayer: (id) => { change((d) => withSlide(d, slideIdx, (s) => ({ ...s, custom: !!s.template || s.custom, layers: s.layers.filter((l) => l.id !== id) }))); setSelId(null); },
    duplicateLayer: (id) => {
      const nid = uid('l');
      change((d) => withSlide(d, slideIdx, (s) => {
        const i = s.layers.findIndex((l) => l.id === id);
        if (i < 0) return s;
        const copy = { ...clone(s.layers[i]), id: nid, name: undefined, x: s.layers[i].x + 24, y: s.layers[i].y + 24 };
        const layers = [...s.layers]; layers.splice(i + 1, 0, copy);
        return { ...s, custom: !!s.template || s.custom, layers };
      }));
      setSelId(nid);
    },
    moveLayer: (id, dir) => change((d) => withSlide(d, slideIdx, (s) => {
      const i = s.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.layers.length) return s;
      const layers = [...s.layers]; [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...s, layers };
    })),
    pickAsset: (cb) => { assetCb.current = cb; setModal('assets'); },
  }), [change, slideIdx]);

  const addLayer = (type, extra = {}) => {
    const base = layerDefaults(type);
    const k = s0;
    const l = { ...base, x: Math.round(base.x * k), y: Math.round(base.y * k), w: Math.round(base.w * k), h: Math.round(base.h * k), ...extra };
    if (type === 'text' && doc.lang === 'ar') { l.text = 'ذهب حقيقي، من جوالك'; l.dir = 'rtl'; }
    if (type === 'list' && doc.lang === 'ar') { l.items = ['ابدأ من جرام واحد', 'أسعار مباشرة استرشادية', 'أهدِ الذهب في ثوانٍ']; l.dir = 'rtl'; }
    if (type === 'button' && doc.lang === 'ar') l.text = 'اشترِ الذهب';
    if (type === 'phone') l.lang = doc.lang;
    if (!['image'].includes(type) || !extra.w) { l.x = Math.round((doc.width - l.w) / 2); l.y = Math.round(Math.min((doc.height - l.h) / 2, doc.height - l.h - 40 * k)); }
    if (type === 'pager') { l.x = Math.round(80 * k); l.y = doc.height - Math.round(120 * k); }
    change((d) => withSlide(d, slideIdx, (s) => ({ ...s, custom: !!s.template || s.custom, layers: [...s.layers, l] })));
    setSelId(l.id);
  };

  const addSlide = (templateId, theme) => {
    const at = slideIdx + 1;
    change((d) => {
      let slide = createSlide({ template: templateId, theme, content: templateId ? { ...exampleFor(templateId, d.lang) } : null, layers: [] });
      d.slides.splice(at, 0, slide);
      if (templateId) d.slides[at] = applyTemplate(slide, d, at, d.slides.length);
      return d;
    });
    setSlideIdx(at); setSelId(null); setModal(null); clock.set(null);
  };
  const slideOp = (op, i) => {
    if (op === 'delete' && doc.slides.length === 1) return toast('A document needs at least one slide.', true);
    change((d) => {
      if (op === 'dup') d.slides.splice(i + 1, 0, { ...clone(d.slides[i]), id: uid('s'), layers: d.slides[i].layers.map((l) => ({ ...l, id: uid('l') })) });
      if (op === 'delete') d.slides.splice(i, 1);
      if (op === 'up' && i > 0) [d.slides[i - 1], d.slides[i]] = [d.slides[i], d.slides[i - 1]];
      if (op === 'down' && i < d.slides.length - 1) [d.slides[i + 1], d.slides[i]] = [d.slides[i], d.slides[i + 1]];
      return d;
    });
    if (op === 'dup') setSlideIdx(i + 1);
    if (op === 'delete') setSlideIdx(Math.max(0, Math.min(i, doc.slides.length - 2)));
    if (op === 'up') setSlideIdx(Math.max(0, i - 1));
    if (op === 'down') setSlideIdx(Math.min(doc.slides.length - 1, i + 1));
  };

  const setDocProp = (patch) => change((d) => {
    let n = { ...d, ...patch };
    if (patch.format && patch.format !== d.format) {
      const f = FORMATS[patch.format];
      const kx = f.w / d.width, ky = f.h / d.height;
      n = { ...n, width: f.w, height: f.h, slides: n.slides.map((s) => (s.template && !s.custom ? s : { ...s, layers: s.layers.map((l) => ({ ...l, x: Math.round(l.x * kx), y: Math.round(l.y * ky), w: Math.round(l.w * kx), h: Math.round(l.h * (['logo', 'phone', 'goldbar', 'gem', 'icon'].includes(l.type) ? kx : ky)) })) })) };
    }
    if (patch.format || patch.lang || patch.kind) n = applyAllTemplates(n);
    return n;
  });

  const createDoc = async (d) => {
    try {
      const saved = await api.create(d);
      setModal(null);
      await refreshList();
      openDoc(saved.id);
      setLeftTab('slides');
    } catch (e) { toast(e.message, true); }
  };
  const deleteDoc = async (id) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    await api.remove(id);
    if (docRef.current?.id === id) { setDoc(null); docRef.current = null; history.replaceState(null, '', '#/'); }
    refreshList();
  };

  // ---------- exports ----------
  const run = async (label, fn) => {
    setExportOpen(false);
    setProgress({ label, p: 0 });
    try {
      const res = await fn((p) => setProgress({ label, p }));
      toast(res?.container ? `Exported ${res.container.toUpperCase()} (${res.frames} frames, ${(res.bytes / 1e6).toFixed(1)} MB)` : 'Export ready');
    } catch (e) { toast(`Export failed: ${e.message}`, true); } finally { setProgress(null); }
  };

  // ---------- keyboard, paste, drop ----------
  const selLayer = doc?.slides[slideIdx]?.layers.find((l) => l.id === selId) || null;
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t.closest?.('input, textarea, select, [contenteditable]');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
      if (typing || !docRef.current) return;
      if (e.key === 'Escape') setSelId(null);
      if (!selId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ops.deleteLayer(selId); }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); ops.duplicateLayer(selId); }
      const step = e.shiftKey ? 10 : 1;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (mv && selLayer) { e.preventDefault(); ops.updateLayer(selId, { x: selLayer.x + mv[0], y: selLayer.y + mv[1] }); }
    };
    const onPaste = async (e) => {
      if (e.target.closest?.('input, textarea')) return;
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (file && docRef.current) { e.preventDefault(); await placeFile(file); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
  });

  const placeFile = async (file) => {
    try {
      const a = await api.upload(file);
      if (selLayer && ['image', 'phone', 'browser'].includes(selLayer.type)) { ops.updateLayer(selLayer.id, { src: a.url }); toast('Image placed in the selected layer'); }
      else addLayer('image', { src: a.url, w: Math.round(doc.width * 0.6), h: Math.round(doc.width * 0.6), x: Math.round(doc.width * 0.2), y: Math.round((doc.height - doc.width * 0.6) / 2) });
    } catch (e) { toast(e.message, true); }
  };

  const issues = useMemo(() => (doc ? lintDocument(doc) : []), [doc]);
  const errs = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  const mode = doc?.kind === 'video' ? 'video' : 'carousel';

  if (!fontsReady) return <div className="welcome"><div><img src="/favicon.svg" alt="" /><p>Loading Goldcom Studio…</p></div></div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brandmark"><img src="/favicon.svg" alt="Goldcom" /><b>Goldcom <span>Studio</span></b></div>
        {doc && (
          <>
            <input className="docname" value={doc.name} onChange={(e) => change((d) => ({ ...d, name: e.target.value }), { live: true })} onBlur={() => change((d) => d)} aria-label="Document name" />
            <div style={{ width: 170 }} className="hide-sm"><Select value={doc.format} onChange={(v) => setDocProp({ format: v })} options={Object.fromEntries(Object.entries(FORMATS).map(([k, f]) => [k, f.label]))} /></div>
            <div className="seg">
              {[['carousel', 'Carousel'], ['post', 'Post'], ['video', 'Video']].map(([k, l]) => <button key={k} className={doc.kind === k ? 'on' : ''} onClick={() => { clock.set(null); setDocProp({ kind: k }); }}>{l}</button>)}
            </div>
            <div className="seg">
              <button className={doc.lang === 'ar' ? 'on' : ''} onClick={() => setDocProp({ lang: 'ar' })}>AR</button>
              <button className={doc.lang === 'en' ? 'on' : ''} onClick={() => setDocProp({ lang: 'en' })}>EN</button>
            </div>
            <button className="btn icon ghost" onClick={undo} disabled={!hist.current.past.length} title="Undo (Ctrl/Cmd+Z)"><Icon name="undo" /></button>
            <button className="btn icon ghost" onClick={redo} disabled={!hist.current.future.length} title="Redo (Ctrl/Cmd+Shift+Z)"><Icon name="redo" /></button>
          </>
        )}
        <span className="spacer" />
        {doc && <button className="btn" onClick={() => setModal('lint')} title="Brand check">Brand check {errs ? <span className="count err">{errs}</span> : warns ? <span className="count warn">{warns}</span> : <span className="count" style={{ background: 'var(--gain)', color: '#000' }}>✓</span>}</button>}
        <button className="btn" onClick={() => setModal('claude')} title="Connect Claude Code"><span className={`dot${live ? ' live' : ''}`} /><Icon name="claude" />Claude Code</button>
        {doc && (
          <div className="rel">
            <button className="btn primary" onClick={() => setExportOpen((o) => !o)}><Icon name="download" />Export</button>
            {exportOpen && (
              <div className="menu" onMouseLeave={() => setExportOpen(false)}>
                <button onClick={() => run('Rendering PNG', () => exportPng(doc, slideIdx, images))}>PNG <small>this slide</small></button>
                <button onClick={() => run('Rendering carousel', (p) => exportZip(doc, images, p))}>All slides <small>PNG · ZIP</small></button>
                <hr />
                <button onClick={() => run('Encoding video', (p) => exportVideo(doc, images, { mode: 'sequence', onProgress: p }))}>Video <small>all slides · MP4</small></button>
                <button onClick={() => run('Encoding animation', (p) => exportVideo(doc, images, { mode: 'slide', index: slideIdx, onProgress: p }))}>Animated slide <small>this slide · MP4</small></button>
                <button onClick={() => run('Encoding GIF', (p) => exportGif(doc, images, { mode: doc.kind === 'video' ? 'sequence' : 'slide', index: slideIdx, onProgress: p }))}>GIF <small>{doc.kind === 'video' ? 'all slides' : 'this slide'}</small></button>
                <hr />
                <button onClick={() => { setExportOpen(false); exportJson(doc); }}>Document <small>JSON</small></button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="main">
        <aside className="panel">
          <div className="tabs">
            <button className={leftTab === 'slides' ? 'on' : ''} onClick={() => setLeftTab('slides')}>Slides</button>
            <button className={leftTab === 'library' ? 'on' : ''} onClick={() => setLeftTab('library')}>Library <span className="count">{docs.length}</span></button>
          </div>
          <div className="scroll">
            {leftTab === 'slides' && doc && (
              <div className="slides">
                {doc.slides.map((s, i) => (
                  <div key={s.id} className={`slide-item${i === slideIdx ? ' on' : ''}`}>
                    <span className="n">{i + 1}</span>
                    <div className="thumb" onClick={() => { setSlideIdx(i); setSelId(null); if (mode === 'carousel') clock.set(null); }}>
                      <SlideThumb doc={doc} index={i} width={200} images={images} version={imagesVersion} />
                      <span className="tag">{s.template ? TEMPLATES[s.template]?.name : 'Custom'}{s.custom && s.template ? ' · edited' : ''}</span>
                      <div className="tools" onClick={(e) => e.stopPropagation()}>
                        <button title="Move up" onClick={() => slideOp('up', i)}><Icon name="up" /></button>
                        <button title="Move down" onClick={() => slideOp('down', i)}><Icon name="down" /></button>
                        <button title="Duplicate" onClick={() => slideOp('dup', i)}><Icon name="copy" /></button>
                        <button title="Delete" onClick={() => slideOp('delete', i)}><Icon name="trash" /></button>
                      </div>
                    </div>
                  </div>
                ))}
                <button className="add-slide" onClick={() => setModal('template')}>+ Add slide</button>
              </div>
            )}
            {leftTab === 'slides' && !doc && <div className="empty">Open or create a design.</div>}
            {leftTab === 'library' && (
              <div className="doclist">
                <button className="btn primary" style={{ margin: '4px 2px 8px' }} onClick={() => setModal('new')}><Icon name="plus" />New design</button>
                <input className="input" placeholder="Search designs" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 6 }} />
                {docs.filter((d) => d.name.toLowerCase().includes(query.toLowerCase())).map((d) => (
                  <div key={d.id} className={`docrow${doc?.id === d.id ? ' on' : ''}`} onClick={() => { openDoc(d.id); setLeftTab('slides'); }}>
                    <div style={{ minWidth: 0 }}>
                      <b>{d.name}</b>
                      <small>{d.slides} slide{d.slides === 1 ? '' : 's'} · {FORMATS[d.format]?.label || d.format} · {d.lang?.toUpperCase()}</small>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <span className="pill">{d.kind}</span>
                        {d.source?.type === 'claude-code' && <span className="pill claude">✦ Claude{d.source.project ? ` · ${d.source.project}` : ''}</span>}
                      </div>
                    </div>
                    <button className="btn icon sm ghost danger" onClick={(e) => { e.stopPropagation(); deleteDoc(d.id); }} title="Delete"><Icon name="trash" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f && doc) placeFile(f); }}>
          {doc ? (
            <>
              <div className="toolbar">
                {TOOLS.map(([type, label, icon]) => (
                  <button key={type} className="tool" title={`Add ${LAYER_TYPES[type]}`} onClick={() => addLayer(type)}><Icon name={icon} /><span>{label}</span></button>
                ))}
              </div>
              <Stage doc={doc} slideIdx={slideIdx} selId={selId} onSelect={setSelId}
                onBegin={() => { if (!hist.current.base) hist.current.base = docRef.current; }}
                onLive={(id, patch) => ops.updateLayer(id, patch, { live: true })}
                onEnd={() => change((d) => d)}
                images={images} imagesVersion={imagesVersion} clock={clock} mode={mode}
                onEditText={(id) => { setFocusText(null); setTimeout(() => setFocusText(id), 0); }} />
              <Timeline doc={doc} mode={mode} slideIdx={slideIdx} clock={clock} onSeekSlide={(i) => setSlideIdx(i)} />
            </>
          ) : (
            <div className="welcome" style={{ gridRow: '1 / -1' }}>
              <div>
                <img src="/favicon.svg" alt="" />
                <h2>Design on-brand, in seconds</h2>
                <p>Carousels, posts, animations and videos in the Goldcom identity, by hand or with Claude Code.</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="btn primary" onClick={() => setModal('new')}><Icon name="plus" />New design</button>
                  <button className="btn" onClick={() => setModal('claude')}><Icon name="claude" />Connect Claude Code</button>
                </div>
              </div>
            </div>
          )}
        </section>

        {doc ? <Inspector doc={doc} slideIdx={slideIdx} layer={selLayer} api={ops} focusText={focusText} /> : <aside className="panel right" />}
      </div>

      {modal === 'new' && <NewDocDialog onClose={() => setModal(null)} onCreate={createDoc} images={images} />}
      {modal === 'template' && doc && <TemplatePicker doc={doc} images={images} defaultTheme={doc.slides[slideIdx]?.theme} onClose={() => setModal(null)} onPick={addSlide} />}
      {modal === 'assets' && <AssetPicker toast={toast} onClose={() => setModal(null)} onPick={(url) => { assetCb.current?.(url); setModal(null); }} />}
      {modal === 'claude' && <ClaudePanel health={health} docs={docs} onClose={() => setModal(null)} onOpen={openDoc} />}
      {modal === 'lint' && <LintPanel issues={issues} onClose={() => setModal(null)} onGo={(i) => { setSlideIdx(i.slide); setSelId(i.layer); }} />}

      {progress && <div className="progress"><div className="box"><b>{progress.label}…</b><div className="hint" style={{ marginTop: 4 }}>Rendered frame by frame in your browser.</div><div className="bar"><div style={{ width: `${Math.round(progress.p * 100)}%` }} /></div></div></div>}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast${t.err ? ' err' : ''}`}>{t.msg}</div>)}</div>
    </div>
  );
}
