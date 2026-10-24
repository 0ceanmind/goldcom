import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { loadFonts, ImageCache } from './render/renderer.js';
import { sceneRuntime } from './render/scene3d/runtime.js';
import { exportPng, exportZip, exportVideo, exportGif, exportJson, exportSlideVideosZip, captionText, downloadBlob } from './render/export.js';
import { normalizeDocument, createSlide, layerDefaults, uid, clone, LAYER_TYPES } from '../shared/schema.js';
import { TEMPLATES, applyTemplate, applyAllTemplates, patchContent, exampleFor } from '../shared/templates.js';
import { FORMATS, KINDS, isSequence } from '../shared/brand.js';
import { buildLibraryDoc } from '../shared/library.js';
import { lintDocument } from '../shared/lint.js';
import Stage, { Timeline, createClock } from './components/Stage.jsx';
import Inspector from './components/Inspector.jsx';
import Gallery from './components/Gallery.jsx';
import InstaPreview from './components/InstaPreview.jsx';
import { NewDocDialog, TemplatePicker, AssetPicker, ClaudePanel, LintPanel } from './components/Dialogs.jsx';
import { DirectorPanel, GenerateDialog, FeedbackDialog, SettingsDialog, BrainPanel } from './components/Autonomy.jsx';
import { Icon, SlideThumb, Select } from './components/ui.jsx';

const TOOL_GROUPS = [
  ['Text', 'text', [['text', 'Text'], ['list', 'List']]],
  ['Brand', 'gem', [['logo', 'Logo'], ['goldbar', 'Gold bar (flat)'], ['gem', 'Gem']]],
  ['Media', 'image', [['scene3d', '3D scene'], ['image', 'Image'], ['phone', 'Phone mockup'], ['browser', 'Browser mockup'], ['code', 'Code card']]],
  ['Data', 'chart', [['chart', 'Price chart'], ['ticker', 'Price ticker'], ['countdown', 'Countdown'], ['progress', 'Progress ring / bar']]],
  ['Interactive', 'sparkle', [['sticker', 'Story sticker'], ['notification', 'Push notification'], ['chat', 'Chat'], ['tap', 'Tap indicator']]],
  ['Shapes & UI', 'square', [['button', 'Button'], ['badge', 'Badge / LIVE'], ['icon', 'Icon'], ['shape', 'Shape'], ['pager', 'Carousel pager']]],
];

// Arabic defaults for new layers in Arabic documents.
const AR_DEFAULTS = {
  text: { text: 'ذهب حقيقي، من جوالك', dir: 'rtl' },
  list: { items: ['ابدأ من جرام واحد', 'أسعار مباشرة استرشادية', 'أهدِ الذهب لمن تحب'], dir: 'rtl' },
  button: { text: 'اشترِ الذهب' },
  badge: { text: 'موثّق' },
  notification: { title: 'وصلتك هدية ذهب', body: 'أرسلت لك عائشة 2.5 جرام ذهب عيار 24.', time: 'الآن', dir: 'rtl' },
  sticker: { question: 'ذهب أم نقود؟', options: ['ذهب', 'نقود'], dir: 'rtl' },
  chat: { messages: [{ from: 'them', text: 'ما أقل كمية أستطيع شراءها؟' }, { from: 'me', text: 'جرام واحد من ذهب عيار 24.' }], dir: 'rtl' },
  progress: { label: '6.2 جرام', sub: 'من 10 جرام' },
  ticker: { items: ['عيار 24  31.204 ▲ +0.42%', 'عيار 22  28.603 ▲ +0.39%', 'عيار 21  27.304 ▲ +0.40%'], dir: 'rtl' },
  countdown: { dir: 'rtl' },
};

const routeId = () => (location.hash.match(/#\/doc\/([\w-]+)/) || [])[1];
const readPref = (k, d) => { try { const v = localStorage.getItem(`gc.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(`gc.${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export default function App() {
  const [health, setHealth] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [doc, setDoc] = useState(null);
  const docRef = useRef(null);
  const [view, setView] = useState(routeId() ? 'editor' : 'gallery');
  const [slideIdx, setSlideIdx] = useState(0);
  const [selId, setSelId] = useState(null);
  const [modal, setModal] = useState(null);
  const [preview, setPreview] = useState(null);
  const assetCb = useRef(null);
  const [toasts, setToasts] = useState([]);
  const [progress, setProgress] = useState(null);
  const [live, setLive] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [imagesVersion, setImagesVersion] = useState(0);
  const [focusText, setFocusText] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [zones, setZones] = useState(() => readPref('zones', true));
  const [saveState, setSaveState] = useState('saved');
  const [directorTask, setDirectorTask] = useState(null);
  const images = useMemo(() => new ImageCache(() => setImagesVersion((v) => v + 1)), []);
  const clock = useMemo(createClock, []);
  const hist = useRef({ past: [], future: [], base: null });
  const lastSaved = useRef(null);
  const saveTimer = useRef(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  const clipboard = useRef(null);

  const toast = useCallback((msg, err) => {
    const id = uid('t');
    setToasts((t) => [...t.slice(-3), { id, msg, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), err ? 6000 : 3200);
  }, []);

  const refreshList = useCallback(() => api.list().then((l) => { setDocs(l); setDocsLoaded(true); }).catch(() => {}), []);

  // ---------- saving (debounced, retried, flushed on exit) ----------
  const flush = useCallback(async () => {
    const d = docRef.current;
    if (!d || !dirty.current || saving.current) return;
    saving.current = true;
    dirty.current = false;
    setSaveState('saving');
    try {
      const saved = await api.save({ ...d, source: d.source ? { ...d.source, lastWriter: 'studio' } : d.source });
      lastSaved.current = saved.updatedAt;
      if (docRef.current?.id === saved.id) docRef.current = { ...docRef.current, updatedAt: saved.updatedAt };
      setDocs((list) => list.map((x) => (x.id === saved.id ? { ...x, name: saved.name, updatedAt: saved.updatedAt, slides: saved.slides.length, kind: saved.kind, format: saved.format, lang: saved.lang } : x)));
      setSaveState(dirty.current ? 'pending' : 'saved');
    } catch {
      dirty.current = true;
      setSaveState('error');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flush(), 3000);
    } finally {
      saving.current = false;
      if (dirty.current) { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => flush(), 600); }
    }
  }, []);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setSaveState((s) => (s === 'error' ? s : 'pending'));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flush(), 450);
  }, [flush]);

  useEffect(() => {
    const onExit = () => {
      const d = docRef.current;
      if (d && dirty.current) fetch(`/api/documents/${d.id}`, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).catch(() => {});
    };
    const warn = (e) => { if (dirty.current) { onExit(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('pagehide', onExit);
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('pagehide', onExit); window.removeEventListener('beforeunload', warn); };
  }, []);

  // ---------- load & routing ----------
  const openDoc = useCallback(async (id, { keepSlide } = {}) => {
    try {
      const d = normalizeDocument(await api.get(id));
      docRef.current = d;
      setDoc(d);
      setView('editor');
      setSlideIdx((i) => (keepSlide ? Math.max(0, Math.min(i, d.slides.length - 1)) : 0));
      if (!keepSlide) { setSelId(null); hist.current = { past: [], future: [], base: null }; clock.playing = false; clock.set(null); }
      lastSaved.current = d.updatedAt;
      setSaveState('saved');
      if (routeId() !== id) history.pushState(null, '', `#/doc/${id}`);
    } catch (e) {
      toast(/not found|404/i.test(e.message) ? 'That design could not be found. It may have been deleted.' : `Could not open the design: ${e.message}`, true);
      if (!keepSlide) goGallery();
    }
  }, [clock, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const goGallery = useCallback(async () => {
    await flush();
    clock.playing = false; clock.set(null);
    setView('gallery');
    setSelId(null);
    if (location.hash !== '#/') history.pushState(null, '', '#/');
    refreshList();
  }, [flush, clock, refreshList]);

  useEffect(() => {
    loadFonts().then(() => setFontsReady(true));
    api.health().then(setHealth).catch(() => {});
    refreshList();
    if (routeId()) openDoc(routeId());
    const onPop = () => { const id = routeId(); if (id) { if (id !== docRef.current?.id || view !== 'editor') openDoc(id); } else { setView('gallery'); refreshList(); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
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
        let ev;
        try { ev = JSON.parse(m.data); } catch { return; }
        window.dispatchEvent(new CustomEvent('studio-event', { detail: ev }));
        if (ev.type === 'repair') toast(`Self-repair: Claude is fixing the "${ev.module || 'studio'}" error in the background.`);
        if (ev.type === 'agent' && ev.done) toast(ev.status === 'done' ? 'Claude finished the task.' : `Claude stopped: ${ev.status}`, ev.status !== 'done');
        if (ev.type === 'document' || ev.type === 'deleted') refreshList();
        if (ev.type === 'module') sceneRuntime.invalidate(ev.id).then(() => setImagesVersion((v) => v + 1));
        const cur = docRef.current;
        if (ev.type === 'document' && cur && ev.id === cur.id && ev.updatedAt !== lastSaved.current && ev.updatedAt !== cur.updatedAt) {
          if (dirty.current || saving.current) toast('This design changed elsewhere. Your newer edits were kept.');
          else { openDoc(ev.id, { keepSlide: true }); toast(ev.origin === 'claude-code' ? `Claude Code updated "${ev.name}"` : `"${ev.name}" was updated`); }
        } else if (ev.type === 'document' && ev.origin === 'claude-code' && (!cur || ev.id !== cur.id)) {
          toast(`Claude Code saved "${ev.name}"`);
        }
        if (ev.type === 'deleted' && cur && ev.id === cur.id) { dirty.current = false; setDoc(null); docRef.current = null; toast('This design was deleted.', true); goGallery(); }
      };
    };
    connect();
    return () => { clearTimeout(retry); es?.close(); };
  }, [openDoc, refreshList, toast, goGallery]);

  // ---------- mutations ----------
  const change = useCallback((fn, { live: isLive } = {}) => {
    const cur = docRef.current;
    if (!cur) return;
    const draft = clone(cur);
    const next = fn(draft) || draft;
    const h = hist.current;
    if (isLive) { if (!h.base) h.base = cur; } else { h.past.push(h.base || cur); h.base = null; if (h.past.length > 150) h.past.shift(); h.future = []; }
    docRef.current = next;
    setDoc(next);
    scheduleSave();
  }, [scheduleSave]);

  const undo = useCallback(() => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(docRef.current);
    const prev = h.past.pop();
    h.base = null;
    docRef.current = prev; setDoc(prev); setSlideIdx((i) => Math.max(0, Math.min(i, prev.slides.length - 1))); scheduleSave();
  }, [scheduleSave]);
  const redo = useCallback(() => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(docRef.current);
    const next = h.future.pop();
    docRef.current = next; setDoc(next); setSlideIdx((i) => Math.max(0, Math.min(i, next.slides.length - 1))); scheduleSave();
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
    setCaption: (caption, opts = {}) => change((d) => ({ ...d, caption: { ...d.caption, ...caption } }), { live: opts.live }),
    changeTemplate: (id) => change((d) => withSlide(d, slideIdx, (s) => {
      const lang = s.content?.lang || d.lang;
      const content = { ...exampleFor(id, lang), ...(s.content || {}) };
      return applyTemplate({ ...s, template: id, content, extras: s.extras }, d, slideIdx, d.slides.length);
    })),
    reapply: () => change((d) => withSlide(d, slideIdx, (s) => applyTemplate(s, d, slideIdx, d.slides.length))),
    staggerAnimations: () => change((d) => withSlide(d, slideIdx, (s) => {
      const sorted = [...s.layers].sort((a, b) => a.y - b.y);
      const order = new Map(sorted.map((l, i) => [l.id, i]));
      return { ...s, custom: !!s.template || s.custom, layers: s.layers.map((l) => {
        const i = order.get(l.id);
        const kind = l.type === 'logo' ? 'assemble' : l.type === 'chart' || l.type === 'progress' ? 'draw' : l.type === 'pager' ? 'none' : ['goldbar', 'gem', 'sticker', 'badge'].includes(l.type) ? 'pop' : l.type === 'notification' ? 'drop' : l.type === 'code' || l.type === 'chat' ? 'type' : l.type === 'text' && /\d/.test(l.text || '') && ['stat', 'price'].includes(l.role) ? 'count' : l.type === 'text' && ['display', 'h1'].includes(l.role) ? 'rise' : 'fade-up';
        return { ...l, anim: { ...l.anim, in: kind, delay: +(i * 0.12).toFixed(2), dur: kind === 'draw' ? 1.3 : kind === 'type' ? 1.6 : kind === 'assemble' ? 1.4 : 0.7 } };
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
    if (!doc?.slides[slideIdx]) return;
    const base = layerDefaults(type);
    const k = s0;
    const l = { ...base, ...(doc.lang === 'ar' ? AR_DEFAULTS[type] || {} : {}), x: Math.round(base.x * k), y: Math.round(base.y * k), w: Math.round(base.w * k), h: Math.round(base.h * k), ...extra };
    if (type === 'phone') l.lang = doc.lang;
    const fullWidth = type === 'ticker' || type === 'sparkles' || type === 'scene3d';
    if (fullWidth) { l.x = 0; l.w = doc.width; if (type === 'sparkles' || type === 'scene3d') { l.y = 0; l.h = doc.height; } else l.y = Math.round(doc.height * 0.7); }
    else if (!extra.x) { l.x = Math.round((doc.width - l.w) / 2); l.y = Math.round(Math.max(0, Math.min((doc.height - l.h) / 2, doc.height - l.h - 40 * k))); }
    if (type === 'pager') { l.x = Math.round(80 * k); l.y = doc.height - Math.round(120 * k); }
    change((d) => withSlide(d, slideIdx, (s) => ({ ...s, custom: !!s.template || s.custom, layers: type === 'sparkles' || type === 'scene3d' ? [l, ...s.layers] : [...s.layers, l] })));
    setSelId(l.id);
    setMenuOpen(null);
  };

  const addSlide = (templateId, theme) => {
    const at = Math.min(slideIdx + 1, doc.slides.length);
    change((d) => {
      const slide = createSlide({ template: templateId, theme, content: templateId ? { ...exampleFor(templateId, d.lang) } : null, layers: [], duration: isSequence(d.kind) ? 4 : 5 });
      d.slides.splice(at, 0, slide);
      return applyAllTemplates(d);
    });
    setSlideIdx(at); setSelId(null); setModal(null); clock.set(null);
  };
  const slideOp = (op, i) => {
    if (op === 'delete' && doc.slides.length === 1) return toast('A design needs at least one slide.', true);
    change((d) => {
      if (op === 'dup') d.slides.splice(i + 1, 0, { ...clone(d.slides[i]), id: uid('s'), layers: d.slides[i].layers.map((l) => ({ ...l, id: uid('l') })) });
      if (op === 'delete') d.slides.splice(i, 1);
      if (op === 'up' && i > 0) [d.slides[i - 1], d.slides[i]] = [d.slides[i], d.slides[i - 1]];
      if (op === 'down' && i < d.slides.length - 1) [d.slides[i + 1], d.slides[i]] = [d.slides[i], d.slides[i + 1]];
      return applyAllTemplates(d); // pagers and "swipe" hints follow the new order
    });
    if (op === 'dup') setSlideIdx(i + 1);
    if (op === 'delete') { setSlideIdx(Math.max(0, Math.min(i, doc.slides.length - 2))); setSelId(null); }
    if (op === 'up') setSlideIdx(Math.max(0, i - 1));
    if (op === 'down') setSlideIdx(Math.min(doc.slides.length - 1, i + 1));
  };

  const setDocProp = (patch) => change((d) => {
    let n = { ...d, ...patch };
    if (patch.format && patch.format !== d.format) {
      const f = FORMATS[patch.format];
      const kx = f.w / d.width, ky = f.h / d.height;
      n = { ...n, width: f.w, height: f.h, slides: n.slides.map((s) => (s.template && !s.custom ? s : { ...s, layers: s.layers.map((l) => ({ ...l, x: Math.round(l.x * kx), y: Math.round(l.y * ky), w: Math.round(l.w * kx), h: Math.round(l.h * (['logo', 'phone', 'goldbar', 'gem', 'icon', 'progress', 'tap'].includes(l.type) ? kx : ky)) })) })) };
    }
    if (patch.format || patch.lang || patch.kind) n = applyAllTemplates(n);
    return n;
  });

  // ---------- documents ----------
  const createDoc = async (d, { open = true } = {}) => {
    try {
      const saved = await api.create(d);
      setModal(null); setPreview(null);
      await refreshList();
      if (open) openDoc(saved.id);
      return saved;
    } catch (e) { toast(e.message, true); return null; }
  };
  const applyLibrary = (item, lang) => createDoc(buildLibraryDoc(item, lang));
  const duplicateDoc = async (id) => {
    const d = await api.get(id);
    const copy = { ...d, id: uid('doc'), name: `${d.name} (copy)`, source: d.source?.type === 'claude-code' ? { ...d.source, lastWriter: 'studio' } : d.source, createdAt: new Date().toISOString() };
    await createDoc(copy, { open: false });
    toast('Duplicated');
  };
  const renameDoc = async (id, name) => {
    if (docRef.current?.id === id) { change((d) => ({ ...d, name })); return; }
    const d = await api.get(id);
    await api.save({ ...d, name });
    refreshList();
  };
  const deleteDoc = async (id) => {
    if (!confirm('Delete this design? This cannot be undone.')) return;
    await api.remove(id);
    if (docRef.current?.id === id) { dirty.current = false; setDoc(null); docRef.current = null; goGallery(); }
    refreshList();
  };

  // ---------- exports ----------
  const run = async (label, fn) => {
    setMenuOpen(null);
    setProgress({ label, p: 0 });
    try {
      const res = await fn((p) => setProgress({ label, p }));
      toast(res?.container ? `Exported ${res.container.toUpperCase()}${res.frames ? ` · ${res.frames} ${res.container === 'zip' ? 'files' : 'frames'}` : ''} · ${(res.bytes / 1e6).toFixed(1)} MB` : 'Export ready');
    } catch (e) { toast(`Export failed: ${e.message}`, true); } finally { setProgress(null); }
  };
  const exportsFor = (d, i) => {
    const k = d.kind;
    const list = [
      ['PNG', 'this slide', () => run('Rendering PNG', () => exportPng(d, i, images))],
      ['All slides', 'PNG · ZIP', () => run('Rendering images', (p) => exportZip(d, images, p))],
    ];
    if (k === 'reel' || k === 'video') list.unshift(['Video', 'MP4 · whole design', () => run('Encoding video', (p) => exportVideo(d, images, { mode: 'sequence', onProgress: p }))]);
    if (k === 'story') list.unshift(['Story frames', 'MP4 per frame · ZIP', () => run('Encoding story frames', (p) => exportSlideVideosZip(d, images, p))], ['This frame', 'MP4', () => run('Encoding frame', (p) => exportVideo(d, images, { mode: 'slide', index: i, onProgress: p }))]);
    if (k === 'carousel') list.push(['Animated slides', 'MP4 per slide · ZIP', () => run('Encoding slides', (p) => exportSlideVideosZip(d, images, p))], ['This slide animated', 'MP4', () => run('Encoding slide', (p) => exportVideo(d, images, { mode: 'slide', index: i, onProgress: p }))]);
    if (k === 'motion' || k === 'post') list.unshift(['Animated post', 'MP4', () => run('Encoding animation', (p) => exportVideo(d, images, { mode: 'slide', index: i, onProgress: p }))]);
    list.push(['GIF', isSequence(k) ? 'whole design' : 'this slide', () => run('Encoding GIF', (p) => exportGif(d, images, { mode: isSequence(k) ? 'sequence' : 'slide', index: i, onProgress: p }))]);
    list.push(['Caption', 'TXT', () => { setMenuOpen(null); const c = captionText(d); if (!c) return toast('Add a caption first (Caption tab).', true); downloadBlob(new Blob([c], { type: 'text/plain' }), 'caption.txt'); }]);
    list.push(['Design file', 'JSON', () => { setMenuOpen(null); exportJson(d); }]);
    return list;
  };
  const galleryExport = (d, what) => (what === 'video'
    ? run('Encoding video', (p) => (isSequence(d.kind) ? exportVideo(d, images, { mode: 'sequence', onProgress: p }) : d.kind === 'story' || d.kind === 'carousel' ? exportSlideVideosZip(d, images, p) : exportVideo(d, images, { mode: 'slide', index: 0, onProgress: p })))
    : run('Rendering images', (p) => exportZip(d, images, p)));

  // ---------- keyboard, paste, drop ----------
  const selLayer = doc?.slides[slideIdx]?.layers.find((l) => l.id === selId) || null;
  useEffect(() => {
    const onKey = (e) => {
      if (view !== 'editor') return;
      const t = e.target;
      const typing = t.closest?.('input, textarea, select, [contenteditable]');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); return; }
      if (typing || !docRef.current || modal || preview) return;
      if (mod && e.key.toLowerCase() === 'v' && clipboard.current) {
        e.preventDefault();
        const nid = uid('l');
        const src = clipboard.current;
        const sameSlide = docRef.current.slides[slideIdx]?.layers.some((l) => l.id === src.id);
        change((d) => withSlide(d, slideIdx, (s) => ({ ...s, custom: !!s.template || s.custom, layers: [...s.layers, { ...clone(src), id: nid, name: undefined, x: src.x + (sameSlide ? 24 : 0), y: src.y + (sameSlide ? 24 : 0) }] })));
        setSelId(nid);
        toast('Layer pasted');
        return;
      }
      if (e.key === 'Escape') { setSelId(null); setMenuOpen(null); }
      if (e.key === 'PageDown' || (e.key === ']' && !selId)) setSlideIdx((i) => Math.min(docRef.current.slides.length - 1, i + 1));
      if (e.key === 'PageUp' || (e.key === '[' && !selId)) setSlideIdx((i) => Math.max(0, i - 1));
      if (!selId || !selLayer) return;
      if (mod && e.key.toLowerCase() === 'c') { clipboard.current = clone(selLayer); toast('Layer copied. Paste on any slide with Ctrl/Cmd+V.'); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ops.deleteLayer(selId); }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); ops.duplicateLayer(selId); }
      const step = e.shiftKey ? 10 : 1;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (mv && !selLayer.locked) { e.preventDefault(); ops.updateLayer(selId, { x: selLayer.x + mv[0], y: selLayer.y + mv[1] }); }
    };
    const onPaste = async (e) => {
      if (view !== 'editor' || e.target.closest?.('input, textarea')) return;
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (file && docRef.current) { e.preventDefault(); await placeFile(file); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
  });

  const placeFile = async (file) => {
    if (!file.type.startsWith('image/')) return toast('Only images can be placed on a slide.', true);
    if (file.size > 40 * 1024 * 1024) return toast('That image is larger than 40 MB. Please use a smaller file.', true);
    try {
      const a = await api.upload(file);
      if (selLayer && ['image', 'phone', 'browser'].includes(selLayer.type)) { ops.updateLayer(selLayer.id, { src: a.url }); toast('Image placed in the selected layer'); }
      else addLayer('image', { src: a.url, w: Math.round(doc.width * 0.6), h: Math.round(doc.width * 0.6), x: Math.round(doc.width * 0.2), y: Math.round((doc.height - doc.width * 0.6) / 2) });
    } catch (e) { toast(e.message, true); }
  };

  const issues = useMemo(() => (doc ? lintDocument(doc) : []), [doc]);
  const errs = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  const mode = doc && isSequence(doc.kind) ? 'video' : 'carousel';
  const saveLabel = { saved: 'Saved', pending: 'Saving…', saving: 'Saving…', error: 'Offline · retrying' }[saveState];

  if (!fontsReady) return <div className="welcome"><div><img src="/favicon.svg" alt="" /><p>Loading Goldcom Studio…</p></div></div>;

  const dialogs = (
    <>
      {modal === 'new' && <NewDocDialog onClose={() => setModal(null)} onCreate={createDoc} images={images} />}
      {modal === 'template' && doc && <TemplatePicker doc={doc} images={images} defaultTheme={doc.slides[slideIdx]?.theme} onClose={() => setModal(null)} onPick={addSlide} />}
      {modal === 'assets' && <AssetPicker toast={toast} onClose={() => setModal(null)} onPick={(url) => { assetCb.current?.(url); setModal(null); }} />}
      {modal === 'claude' && <ClaudePanel health={health} docs={docs} onClose={() => setModal(null)} onOpen={openDoc} />}
      {modal === 'lint' && doc && <LintPanel issues={issues} onClose={() => setModal(null)} onGo={(i) => { setSlideIdx(i.slide); setSelId(i.layer); }} />}
      {modal === 'director' && <DirectorPanel doc={view === 'editor' ? doc : null} slideIdx={slideIdx} toast={toast} initialTask={directorTask} onClose={() => { setModal(null); setDirectorTask(null); }} onOpen={openDoc} />}
      {modal === 'generate' && <GenerateDialog doc={view === 'editor' ? doc : null} slideIdx={slideIdx} toast={toast} onClose={() => setModal(null)} onPlaced={() => doc && openDoc(doc.id, { keepSlide: true })} />}
      {modal === 'feedback' && doc && <FeedbackDialog doc={doc} slideIdx={slideIdx} toast={toast} onClose={() => setModal(null)} onTask={(id, watch) => { if (watch) { setDirectorTask(id); setModal('director'); } }} />}
      {modal === 'settings' && <SettingsDialog toast={toast} onClose={() => setModal(null)} />}
      {modal === 'brain' && <BrainPanel onClose={() => setModal(null)} onOpenTask={(id) => { setDirectorTask(id); setModal('director'); }} />}
      {preview && (
        <InstaPreview doc={preview.doc} images={images} notes={preview.item?.notes} onClose={() => setPreview(null)}
          onEdit={Object.assign(() => { const p = preview; setPreview(null); if (p.item) applyLibrary(p.item, p.doc.lang); else if (p.doc.id && p.doc.id !== docRef.current?.id) openDoc(p.doc.id); }, { label: preview.item ? 'Use this design' : preview.doc.id === docRef.current?.id ? 'Back to editor' : 'Open in editor' })} />
      )}
      {progress && <div className="progress"><div className="box"><b>{progress.label}…</b><div className="hint" style={{ marginTop: 4 }}>Rendered frame by frame in your browser.</div><div className="bar"><div style={{ width: `${Math.round(progress.p * 100)}%` }} /></div></div></div>}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast${t.err ? ' err' : ''}`}>{t.msg}</div>)}</div>
    </>
  );

  if (view === 'gallery' || !doc) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brandmark"><img src="/favicon.svg" alt="Goldcom" /><b>Goldcom <span>Studio</span></b></div>
          <span className="hint hide-sm">Instagram posts, carousels, Reels, Stories and animations, on brand.</span>
          <span className="spacer" />
          {view === 'editor' && !doc && <span className="hint">Loading design…</span>}
          <button className="btn" onClick={() => setModal('director')} title="Give Claude a brief"><Icon name="claude" />Ask Claude</button>
          <button className="btn icon ghost" onClick={() => setModal('generate')} title="Generate an image"><Icon name="wand" /></button>
          <button className="btn icon ghost" onClick={() => setModal('brain')} title="What the studio has learned"><Icon name="brain" /></button>
          <button className="btn icon ghost" onClick={() => setModal('settings')} title="Settings: generators, keys, self-repair"><Icon name="key" /></button>
        </header>
        {docsLoaded || docs.length ? (
          <Gallery docs={docs} images={images} live={live}
            onOpen={openDoc} onNew={() => setModal('new')} onUseLibrary={applyLibrary}
            onPreview={(d, item) => setPreview({ doc: d, item })} onDuplicate={duplicateDoc} onRename={renameDoc} onDelete={deleteDoc}
            onExport={galleryExport} onClaude={() => setModal('claude')} />
        ) : <div className="welcome"><p className="hint">Connecting to the studio server…</p></div>}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn icon ghost" onClick={goGallery} title="Back to gallery"><Icon name="grid" /></button>
        <div className="brandmark"><img src="/favicon.svg" alt="Goldcom" /></div>
        <input className="docname" value={doc.name} maxLength={120} onChange={(e) => change((d) => ({ ...d, name: e.target.value }), { live: true })} onBlur={(e) => { if (!e.target.value.trim()) change((d) => ({ ...d, name: 'Untitled design' })); else change((d) => d); }} aria-label="Design name" />
        <span className={`save ${saveState}`} title="Changes save automatically">{saveLabel}</span>
        <div style={{ width: 150 }} className="hide-sm"><Select value={doc.format} onChange={(v) => setDocProp({ format: v })} options={Object.fromEntries(Object.entries(FORMATS).map(([k, f]) => [k, f.label]))} /></div>
        <div style={{ width: 140 }}><Select value={doc.kind} onChange={(v) => { clock.playing = false; clock.set(null); setDocProp({ kind: v, ...((v === 'reel' || v === 'story') && doc.format !== 'story' ? { format: 'story' } : {}) }); }} options={Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label]))} /></div>
        <div className="seg">
          <button className={doc.lang === 'ar' ? 'on' : ''} onClick={() => setDocProp({ lang: 'ar' })}>AR</button>
          <button className={doc.lang === 'en' ? 'on' : ''} onClick={() => setDocProp({ lang: 'en' })}>EN</button>
        </div>
        <button className="btn icon ghost" onClick={undo} disabled={!hist.current.past.length} title="Undo (Ctrl/Cmd+Z)"><Icon name="undo" /></button>
        <button className="btn icon ghost" onClick={redo} disabled={!hist.current.future.length} title="Redo (Ctrl/Cmd+Shift+Z)"><Icon name="redo" /></button>
        <span className="spacer" />
        <button className="btn" onClick={() => setPreview({ doc })} title="Instagram preview"><Icon name="eye" />Preview</button>
        <button className="btn" onClick={() => setModal('lint')} title="Brand check">Check {errs ? <span className="count err">{errs}</span> : warns ? <span className="count warn">{warns}</span> : <span className="count ok">✓</span>}</button>
        <button className="btn" onClick={() => setModal('feedback')} title="Rate this design: a thumbs-down asks why and teaches the studio"><Icon name="thumbUp" size={16} />Rate</button>
        <button className="btn" onClick={() => setModal('director')} title="Ask Claude to change or extend this design"><Icon name="claude" />Ask Claude</button>
        <button className="btn icon" onClick={() => setModal('claude')} title="Claude Code connection"><span className={`dot${live ? ' live' : ''}`} /></button>
        <div className="rel">
          <button className="btn primary" onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === 'export' ? null : 'export'); }}><Icon name="download" />Export</button>
          {menuOpen === 'export' && (
            <div className="menu" onClick={(e) => e.stopPropagation()}>
              {exportsFor(doc, slideIdx).map(([a, b, fn]) => <button key={a + b} onClick={fn}>{a} <small>{b}</small></button>)}
            </div>
          )}
        </div>
      </header>

      <div className="main" onClick={() => setMenuOpen(null)}>
        <aside className="panel">
          <div className="tabs"><button className="on">{doc.kind === 'story' ? 'Frames' : 'Slides'} <span className="count">{doc.slides.length}</span></button></div>
          <div className="scroll">
            <div className="slides">
              {doc.slides.map((s, i) => (
                <div key={s.id} className={`slide-item${i === slideIdx ? ' on' : ''}`}>
                  <span className="n">{i + 1}</span>
                  <div className="thumb" onClick={() => { setSlideIdx(i); setSelId(null); if (mode === 'carousel') clock.set(null); }}>
                    <SlideThumb doc={doc} index={i} width={200} images={images} version={imagesVersion} />
                    <span className="tag">{s.template ? TEMPLATES[s.template]?.name : 'Custom'}{s.custom && s.template ? ' · edited' : ''}{isSequence(doc.kind) || doc.kind === 'story' ? ` · ${s.duration}s` : ''}</span>
                    <div className="tools" onClick={(e) => e.stopPropagation()}>
                      <button title="Move up" onClick={() => slideOp('up', i)} disabled={i === 0}><Icon name="up" /></button>
                      <button title="Move down" onClick={() => slideOp('down', i)} disabled={i === doc.slides.length - 1}><Icon name="down" /></button>
                      <button title="Duplicate" onClick={() => slideOp('dup', i)}><Icon name="copy" /></button>
                      <button title="Delete" onClick={() => slideOp('delete', i)}><Icon name="trash" /></button>
                    </div>
                  </div>
                </div>
              ))}
              <button className="add-slide" onClick={() => setModal('template')}>+ Add {doc.kind === 'story' ? 'frame' : 'slide'}</button>
            </div>
          </div>
        </aside>

        <section className="center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files][0]; if (f) placeFile(f); }}>
          <div className="toolbar">
            <button className="tool" onClick={() => addLayer('text')} title="Add text"><Icon name="text" /><span>Text</span></button>
            <button className="tool" onClick={() => addLayer('image')} title="Add image"><Icon name="image" /><span>Image</span></button>
            <button className="tool" onClick={() => addLayer('scene3d')} title="Add a 3D scene"><Icon name="cube" /><span>3D</span></button>
            <button className="tool" onClick={() => setModal('generate')} title="Generate an image with the best available AI"><Icon name="wand" /><span>Generate</span></button>
            <span className="sep" />
            {TOOL_GROUPS.map(([label, icon, items]) => (
              <div key={label} className="rel">
                <button className={`tool${menuOpen === label ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === label ? null : label); }}><Icon name={icon} /><span>{label}</span><Icon name="down" size={12} /></button>
                {menuOpen === label && (
                  <div className="menu left" onClick={(e) => e.stopPropagation()}>
                    {items.map(([type, name]) => <button key={type} onClick={() => addLayer(type)}>{name}</button>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <Stage doc={doc} slideIdx={slideIdx} selId={selId} onSelect={setSelId}
            onBegin={() => { if (!hist.current.base) hist.current.base = docRef.current; }}
            onLive={(id, patch) => ops.updateLayer(id, patch, { live: true })}
            onEnd={() => change((d) => d)}
            images={images} imagesVersion={imagesVersion} clock={clock} mode={mode} zones={zones}
            onToggleZones={() => { setZones((z) => { writePref('zones', !z); return !z; }); }}
            onEditText={(id) => { setFocusText(null); setTimeout(() => setFocusText(id), 0); }} />
          <Timeline doc={doc} mode={mode} slideIdx={slideIdx} clock={clock} onSeekSlide={(i) => setSlideIdx(i)} />
        </section>

        <Inspector doc={doc} slideIdx={slideIdx} layer={selLayer} api={ops} focusText={focusText} issues={issues} />
      </div>
      {dialogs}
    </div>
  );
}
