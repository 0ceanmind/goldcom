import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { LIBRARY, LIBRARY_CATEGORIES, buildLibraryDoc } from '../../shared/library.js';
import { FORMATS, KINDS, isSequence } from '../../shared/brand.js';
import { normalizeDocument, docDuration } from '../../shared/schema.js';
import { renderSlide, renderFrame } from '../render/renderer.js';
import { api } from '../api.js';
import { Icon } from './ui.jsx';

const CAT_OF_KIND = { carousel: 'carousel', post: 'post', motion: 'motion', story: 'story', reel: 'reel', video: 'video' };
const docCache = new Map();

/** Loads a full document once it scrolls into view (cached by id + updatedAt). */
function useLazyDoc(summary, visible) {
  const key = summary ? `${summary.id}:${summary.updatedAt}` : null;
  const [doc, setDoc] = useState(() => (key ? docCache.get(key) || null : null));
  useEffect(() => {
    if (!visible || !key || doc?.__key === key) return;
    if (docCache.has(key)) { setDoc(docCache.get(key)); return; }
    let alive = true;
    api.get(summary.id).then((d) => { const n = { ...normalizeDocument(d), __key: key }; docCache.set(key, n); if (alive) setDoc(n); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return doc;
}

/** Canvas preview: static until hovered, then it plays. Carousels scrub with the mouse. */
export const LivePreview = memo(function LivePreview({ doc, images, width = 240, active, index: forcedIndex }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const index = forcedIndex ?? idx;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !doc) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = (width * dpr) / doc.width;
    cv.width = Math.round(doc.width * scale);
    cv.height = Math.round(doc.height * scale);
    const c = cv.getContext('2d');
    const seq = isSequence(doc.kind);
    if (!active) {
      if (seq && doc.slides.length) renderFrame(c, doc, Math.min(docDuration(doc) - 0.01, (Number(doc.slides[0].duration) || 4) * 0.85), { images, scale });
      else renderSlide(c, doc, Math.min(index, doc.slides.length - 1), { t: Infinity, images, scale });
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = (now - start) / 1000;
      if (seq) renderFrame(c, doc, t % Math.max(1, docDuration(doc)), { images, scale });
      else {
        const i = Math.min(index, doc.slides.length - 1);
        const d = Number(doc.slides[i]?.duration) || 4;
        renderSlide(c, doc, i, { t: t % (d + 0.6), images, scale });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [doc, active, index, width, images]);
  const scrub = (e) => {
    if (!doc || doc.slides.length < 2 || isSequence(doc.kind) || forcedIndex !== undefined) return;
    const r = e.currentTarget.getBoundingClientRect();
    let i = Math.floor(((e.clientX - r.left) / r.width) * doc.slides.length);
    if (doc.lang === 'ar') i = doc.slides.length - 1 - i;
    setIdx(Math.max(0, Math.min(doc.slides.length - 1, i)));
  };
  return (
    <div className="lp" onMouseMove={scrub} onMouseLeave={() => setIdx(0)}>
      {doc ? <canvas ref={ref} style={{ aspectRatio: `${doc.width}/${doc.height}` }} /> : <div className="lp-skel" />}
      {doc && doc.slides.length > 1 && !isSequence(doc.kind) && (
        <div className="lp-dots" dir={doc.lang === 'ar' ? 'rtl' : 'ltr'}>{doc.slides.map((s, i) => <i key={s.id} className={i === index ? 'on' : ''} />)}</div>
      )}
    </div>
  );
});

function useVisible() {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, v];
}

function meta(doc, kind, format, slides) {
  const k = KINDS[kind]?.label || kind;
  const f = FORMATS[format]?.label?.replace('Instagram ', '') || format;
  const dur = doc && isSequence(kind) ? ` · ${Math.round(docDuration(doc))} s` : '';
  return `${k} · ${f}${slides > 1 ? ` · ${slides} ${kind === 'story' ? 'frames' : 'slides'}` : ''}${dur}`;
}

function MyCard({ summary, images, onOpen, onPreview, onMenu }) {
  const [ref, visible] = useVisible();
  const [hover, setHover] = useState(false);
  const doc = useLazyDoc(summary, visible);
  return (
    <div className="gcard" ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button className="gthumb" onClick={() => onOpen(summary.id)} aria-label={`Open ${summary.name}`}>
        <LivePreview doc={doc} images={images} active={hover} />
        <span className="gplay"><Icon name="play" fill="currentColor" stroke={0} size={12} />{hover ? 'Playing' : 'Hover to play'}</span>
      </button>
      <div className="ginfo">
        <div style={{ minWidth: 0 }}>
          <b title={summary.name}>{summary.name}</b>
          <small>{meta(doc, summary.kind, summary.format, summary.slides)}</small>
          <div className="gtags">
            <span className="pill">{summary.lang?.toUpperCase()}</span>
            {summary.source?.type === 'claude-code' && <span className="pill claude">✦ Claude{summary.source.project ? ` · ${summary.source.project}` : ''}</span>}
            {summary.source?.type === 'library' && <span className="pill">From library</span>}
          </div>
        </div>
        <div className="gacts">
          <button className="btn icon sm ghost" title="Instagram preview" onClick={() => doc && onPreview(doc)}><Icon name="eye" /></button>
          <button className="btn icon sm ghost" title="More" onClick={(e) => onMenu(e, summary, doc)}><Icon name="more" /></button>
        </div>
      </div>
    </div>
  );
}

function LibCard({ item, lang, images, onUse, onPreview }) {
  const [ref, visible] = useVisible();
  const [hover, setHover] = useState(false);
  const doc = useMemo(() => (visible ? buildLibraryDoc(item, lang) : null), [visible, item, lang]);
  return (
    <div className="gcard" ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button className="gthumb" onClick={() => doc && onPreview(doc, item)} aria-label={`Preview ${item.name[lang]}`}>
        <LivePreview doc={doc} images={images} active={hover} />
        <span className="gplay"><Icon name="play" fill="currentColor" stroke={0} size={12} />{hover ? 'Playing' : 'Hover to play'}</span>
      </button>
      <div className="ginfo">
        <div style={{ minWidth: 0 }}>
          <b title={item.name[lang]} dir="auto">{item.name[lang]}</b>
          <small>{meta(doc, item.kind, item.format, doc?.slides.length || 1)}</small>
        </div>
        <div className="gacts">
          <button className="btn sm primary" onClick={() => onUse(item, lang)}>Use</button>
        </div>
      </div>
    </div>
  );
}

export default function Gallery({ docs, images, onOpen, onNew, onUseLibrary, onPreview, onDuplicate, onRename, onDelete, onExport, onClaude, live }) {
  const [tab, setTab] = useState(() => (docs.length ? 'mine' : 'library'));
  const [cat, setCat] = useState('all');
  const [lang, setLang] = useState('ar');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [menu, setMenu] = useState(null);
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, []);

  const mine = useMemo(() => {
    let list = docs.filter((d) => (cat === 'all' || CAT_OF_KIND[d.kind] === cat) && d.name.toLowerCase().includes(q.toLowerCase()));
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [docs, cat, q, sort]);
  const lib = useMemo(() => LIBRARY.filter((i) => (cat === 'all' || i.category === cat) && `${i.name.en} ${i.name.ar} ${i.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())), [cat, q]);
  const counts = useMemo(() => {
    const src = tab === 'mine' ? docs.map((d) => CAT_OF_KIND[d.kind]) : LIBRARY.map((i) => i.category);
    return src.reduce((acc, c) => ({ ...acc, [c]: (acc[c] || 0) + 1, all: (acc.all || 0) + 1 }), {});
  }, [tab, docs]);

  return (
    <div className="gallery">
      <div className="ghead">
        <div>
          <h1>{tab === 'mine' ? 'Your designs' : 'Design library'}</h1>
          <p className="hint">{tab === 'mine' ? 'Everything you and Claude Code have made. Hover a card to play it, move across a carousel to flip through its slides.' : `${LIBRARY.length} ready-made Instagram designs in Arabic and English. Preview one, then press Use to make your own editable copy.`}</p>
        </div>
        <div className="ghead-acts">
          <button className="btn" onClick={onClaude}><span className={`dot${live ? ' live' : ''}`} /><Icon name="claude" />Claude Code</button>
          <button className="btn primary" onClick={onNew}><Icon name="plus" />New design</button>
        </div>
      </div>
      <div className="gbar">
        <div className="seg big">
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Your designs <span className="count">{docs.length}</span></button>
          <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>Library <span className="count">{LIBRARY.length}</span></button>
        </div>
        <div className="chips">
          {[['all', 'All'], ...Object.entries(LIBRARY_CATEGORIES)].map(([k, l]) => (
            <button key={k} className={`chip${cat === k ? ' on' : ''}`} onClick={() => setCat(k)} disabled={!counts[k] && k !== 'all'}>{l}<span>{counts[k] || 0}</span></button>
          ))}
        </div>
        <span className="spacer" />
        <input className="input gsearch" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        {tab === 'library' ? (
          <div className="seg"><button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>العربية</button><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button></div>
        ) : (
          <div className="seg"><button className={sort === 'recent' ? 'on' : ''} onClick={() => setSort('recent')}>Recent</button><button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>A–Z</button></div>
        )}
      </div>

      <div className="ggrid">
        {tab === 'mine' && mine.map((d) => (
          <MyCard key={d.id} summary={d} images={images} onOpen={onOpen} onPreview={onPreview}
            onMenu={(e, s, doc) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right, y: r.bottom, s, doc }); }} />
        ))}
        {tab === 'library' && lib.map((i) => <LibCard key={`${i.id}-${lang}`} item={i} lang={lang} images={images} onUse={onUseLibrary} onPreview={onPreview} />)}
      </div>
      {tab === 'mine' && !mine.length && (
        <div className="empty" style={{ padding: 60 }}>
          {docs.length ? 'Nothing matches these filters.' : 'No designs yet. Start from the library, create a blank design, or ask Claude Code.'}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => setTab('library')}>Browse the library</button>
            <button className="btn" onClick={onNew}>New design</button>
          </div>
        </div>
      )}
      {tab === 'library' && !lib.length && <div className="empty" style={{ padding: 60 }}>Nothing matches these filters.</div>}

      {menu && (
        <div className="menu" style={{ position: 'fixed', top: Math.min(menu.y + 4, window.innerHeight - 280), left: Math.max(8, menu.x - 250), right: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { onOpen(menu.s.id); setMenu(null); }}><Icon name="text" />Open in editor</button>
          <button disabled={!menu.doc} onClick={() => { onPreview(menu.doc); setMenu(null); }}><Icon name="eye" />Instagram preview</button>
          <button onClick={() => { onDuplicate(menu.s.id); setMenu(null); }}><Icon name="copy" />Duplicate</button>
          <button onClick={() => { const n = prompt('Rename design', menu.s.name); if (n && n.trim()) onRename(menu.s.id, n.trim()); setMenu(null); }}><Icon name="text" />Rename</button>
          <hr />
          <button disabled={!menu.doc} onClick={() => { onExport(menu.doc, 'png'); setMenu(null); }}><Icon name="download" />Export images <small>ZIP</small></button>
          {menu.doc && menu.doc.kind !== 'post' && <button onClick={() => { onExport(menu.doc, 'video'); setMenu(null); }}><Icon name="download" />Export video <small>MP4</small></button>}
          <hr />
          <button className="danger" onClick={() => { onDelete(menu.s.id); setMenu(null); }}><Icon name="trash" />Delete</button>
        </div>
      )}
    </div>
  );
}
