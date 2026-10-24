import { useEffect, useMemo, useRef, useState } from 'react';
import { renderSlide, renderFrame } from '../render/renderer.js';
import { docDuration } from '../../shared/schema.js';
import { isSequence, SAFE_ZONES, isArabic } from '../../shared/brand.js';
import { LIBRARY, buildLibraryDoc } from '../../shared/library.js';
import { captionText } from '../render/export.js';
import { Icon, Copy } from './ui.jsx';

const HANDLE = 'goldcom.om';
const MODES = { feed: 'Feed post', reel: 'Reel', story: 'Story', grid: 'Profile grid' };
const defaultMode = (doc) => (doc.kind === 'reel' || doc.kind === 'video' ? 'reel' : doc.kind === 'story' ? 'story' : 'feed');

function Avatar({ size = 32 }) {
  return <span className="ig-avatar" style={{ width: size, height: size }}><img src="/favicon.svg" alt="" /></span>;
}

/** A canvas that plays a slide (or the whole sequence) in a loop. */
function Player({ doc, images, index = 0, mode = 'slide', playing = true, cssWidth, onTime, crop }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = (cssWidth * dpr) / doc.width;
    cv.width = Math.round(doc.width * scale);
    cv.height = Math.round(doc.height * scale);
    const c = cv.getContext('2d');
    if (!playing) { renderSlide(c, doc, index, { t: Infinity, images, scale }); return; }
    let raf;
    const start = performance.now();
    const total = mode === 'sequence' ? docDuration(doc) : Number(doc.slides[index]?.duration) || 4;
    const tick = (now) => {
      const t = ((now - start) / 1000) % (total + (mode === 'sequence' ? 0 : 0.8));
      if (mode === 'sequence') renderFrame(c, doc, Math.min(t, total - 0.001), { images, scale });
      else renderSlide(c, doc, index, { t, images, scale });
      onTime?.(t, total);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [doc, images, index, mode, playing, cssWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} style={{ width: cssWidth, aspectRatio: `${doc.width}/${doc.height}`, objectFit: crop ? 'cover' : undefined }} />;
}

function Caption({ doc, clamp = true }) {
  const [more, setMore] = useState(false);
  const text = doc.caption?.text || '';
  const tags = (doc.caption?.hashtags || []).join(' ');
  if (!text && !tags) return <p className="ig-cap muted">No caption yet. Add one in the editor's Caption tab.</p>;
  const rtl = isArabic(text || tags);
  return (
    <p className={`ig-cap${clamp && !more ? ' clamp' : ''}`} dir={rtl ? 'rtl' : 'ltr'} onClick={() => setMore(true)}>
      <b>{HANDLE}</b> {text} {tags && <span className="ig-tags">{tags}</span>}
    </p>
  );
}

function Feed({ doc, images, playing }) {
  const [i, setI] = useState(0);
  const n = doc.slides.length;
  const rtl = doc.lang === 'ar';
  const go = (d) => setI((v) => Math.max(0, Math.min(n - 1, v + d)));
  return (
    <div className="ig-screen ig-feed">
      <div className="ig-topbar"><Icon name="up" /><b>Posts</b><span /></div>
      <div className="ig-post-head"><Avatar /><div><b>{HANDLE}</b><small>Muscat, Oman</small></div><Icon name="more" /></div>
      <div className="ig-media">
        <Player doc={doc} images={images} index={i} playing={playing} cssWidth={360} />
        {n > 1 && <span className="ig-count">{i + 1}/{n}</span>}
        {n > 1 && i > 0 && <button className="ig-nav l" onClick={() => go(-1)} aria-label="Previous"><Icon name="up" /></button>}
        {n > 1 && i < n - 1 && <button className="ig-nav r" onClick={() => go(1)} aria-label="Next"><Icon name="up" /></button>}
      </div>
      <div className="ig-actions">
        <Icon name="heart" size={24} /><Icon name="comment" size={24} /><Icon name="send" size={24} />
        {n > 1 && <span className="ig-dots" dir={rtl ? 'rtl' : 'ltr'}>{doc.slides.map((s, k) => <i key={s.id} className={k === i ? 'on' : ''} />)}</span>}
        <span className="spacer" /><Icon name="bookmark" size={24} />
      </div>
      <Caption doc={doc} />
      <small className="ig-time">Just now</small>
    </div>
  );
}

function Reel({ doc, images, playing, zones }) {
  const seq = isSequence(doc.kind) || doc.slides.length > 1;
  const z = SAFE_ZONES.reel;
  const k = 360 / doc.width;
  return (
    <div className="ig-screen ig-full">
      <div className="ig-fill"><Player doc={doc} images={images} mode={seq ? 'sequence' : 'slide'} playing={playing} cssWidth={360} /></div>
      {zones && <><div className="ig-zone" style={{ top: 0, height: z.top * k }} /><div className="ig-zone" style={{ bottom: 0, height: z.bottom * k }} /><div className="ig-zone" style={{ top: z.top * k, bottom: z.bottom * k, right: 0, width: z.right * k }} /></>}
      <div className="ig-reel-top"><b>Reels</b><Icon name="camera" /></div>
      <div className="ig-reel-side"><Icon name="heart" size={26} /><Icon name="comment" size={26} /><Icon name="send" size={26} /><Icon name="more" size={22} /></div>
      <div className="ig-reel-bottom">
        <div className="ig-row"><Avatar size={28} /><b>{HANDLE}</b><span className="ig-follow">Follow</span></div>
        <Caption doc={doc} />
        <small>♫ Original audio · {HANDLE}</small>
      </div>
    </div>
  );
}

function Story({ doc, images, playing, zones }) {
  const [i, setI] = useState(0);
  const [prog, setProg] = useState(0);
  const n = doc.slides.length;
  const z = SAFE_ZONES.story;
  const k = 360 / doc.width;
  const advanced = useRef(-1);
  useEffect(() => { setProg(0); advanced.current = -1; }, [i]);
  const onTime = (t, total) => {
    setProg(Math.min(1, t / total));
    if (playing && t >= total - 0.05 && n > 1 && advanced.current !== i) { advanced.current = i; setI((v) => (v + 1) % n); }
  };
  return (
    <div className="ig-screen ig-full">
      <div className="ig-fill"><Player doc={doc} images={images} index={i} playing={playing} cssWidth={360} onTime={onTime} /></div>
      {zones && <><div className="ig-zone" style={{ top: 0, height: z.top * k }} /><div className="ig-zone" style={{ bottom: 0, height: z.bottom * k }} /></>}
      <div className="ig-story-bars">{doc.slides.map((s, k2) => <i key={s.id}><b style={{ width: `${k2 < i ? 100 : k2 === i ? prog * 100 : 0}%` }} /></i>)}</div>
      <div className="ig-story-head"><Avatar size={30} /><b>{HANDLE}</b><small>2h</small><span className="spacer" /><Icon name="more" /><Icon name="x" /></div>
      <button className="ig-tap l" onClick={() => setI((v) => Math.max(0, v - 1))} aria-label="Previous frame" />
      <button className="ig-tap r" onClick={() => setI((v) => Math.min(n - 1, v + 1))} aria-label="Next frame" />
      <div className="ig-story-foot"><span>Send message</span><Icon name="heart" size={24} /><Icon name="send" size={24} /></div>
    </div>
  );
}

function Grid({ doc, images }) {
  const neighbours = useMemo(() => LIBRARY.filter((it) => it.category !== 'story').slice(0, 8).map((it) => buildLibraryDoc(it, doc.lang)), [doc.lang]);
  const tiles = [doc, ...neighbours];
  return (
    <div className="ig-screen ig-grid">
      <div className="ig-topbar"><span /><b>{HANDLE}</b><Icon name="more" /></div>
      <div className="ig-profile"><Avatar size={72} /><div><b>Goldcom · جولدكم</b><small>Real gold, from your phone.</small><small className="ig-link">goldcom.om</small></div></div>
      <div className="ig-tiles">
        {tiles.map((d, k) => (
          <div key={k} className={`ig-tile${k === 0 ? ' me' : ''}`}><GridThumb doc={d} images={images} /></div>
        ))}
      </div>
      <p className="hint" style={{ padding: '10px 12px' }}>Instagram's profile grid crops posts to 3:4. Your design is the first tile.</p>
    </div>
  );
}

function GridThumb({ doc, images }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const dpr = window.devicePixelRatio || 1;
    const scale = (120 * dpr) / doc.width;
    cv.width = Math.round(doc.width * scale); cv.height = Math.round(doc.height * scale);
    const c = cv.getContext('2d');
    if (isSequence(doc.kind)) renderFrame(c, doc, Math.min(docDuration(doc) - 0.01, 2.5), { images, scale });
    else renderSlide(c, doc, 0, { t: Infinity, images, scale });
  }, [doc, images]);
  return <canvas ref={ref} />;
}

export default function InstaPreview({ doc, images, onClose, onEdit, notes }) {
  const [mode, setMode] = useState(() => defaultMode(doc));
  const [playing, setPlaying] = useState(true);
  const [zones, setZones] = useState(false);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const tall = doc.height / doc.width > 1.7;
  const cap = captionText(doc);
  return (
    <div className="modal-bg ig-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ig-wrap" role="dialog" aria-label="Instagram preview">
        <div className="ig-side">
          <h3 dir="auto">{doc.name}</h3>
          <p className="hint">Preview of how this looks on Instagram. Animations play live.</p>
          <div className="ig-modes">
            {Object.entries(MODES).map(([k, l]) => (
              <button key={k} className={`chip${mode === k ? ' on' : ''}`} onClick={() => setMode(k)} disabled={(k === 'reel' || k === 'story') && !tall}>{l}</button>
            ))}
          </div>
          {(mode === 'reel' || mode === 'story') && !tall && <p className="hint">Reels and Stories need a 9:16 design.</p>}
          {(notes || doc.notes) && <div className="note"><b>Before posting:</b> {notes || doc.notes}</div>}
          <label className="check"><input type="checkbox" checked={playing} onChange={(e) => setPlaying(e.target.checked)} />Play animations</label>
          {(mode === 'reel' || mode === 'story') && <label className="check"><input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} />Show interface safe zones</label>}
          <div className="section" style={{ padding: '14px 0', borderBottom: 0 }}>
            <h4>Caption {cap && <Copy text={cap} />}</h4>
            <div className="ig-capbox" dir="auto">{cap || <span className="hint">No caption yet.</span>}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            {onEdit && <button className="btn primary" onClick={onEdit}><Icon name="text" />{onEdit.label || 'Edit design'}</button>}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="ig-phone">
          <div className="ig-notch" />
          {mode === 'feed' && <Feed doc={doc} images={images} playing={playing} />}
          {mode === 'reel' && tall && <Reel doc={doc} images={images} playing={playing} zones={zones} />}
          {mode === 'story' && tall && <Story doc={doc} images={images} playing={playing} zones={zones} />}
          {mode === 'grid' && <Grid doc={doc} images={images} />}
          {(mode === 'reel' || mode === 'story') && !tall && <Feed doc={doc} images={images} playing={playing} />}
        </div>
      </div>
    </div>
  );
}

