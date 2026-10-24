import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { renderSlide, renderFrame } from '../render/renderer.js';
import { docDuration, slideAt } from '../../shared/schema.js';
import { SAFE_ZONES } from '../../shared/brand.js';
import { Icon } from './ui.jsx';

const KEEP_ASPECT = new Set(['logo', 'phone', 'goldbar', 'gem', 'icon', 'browser']);

/** Shared playback clock so the canvas animates without re-rendering React every frame. */
export function createClock() {
  const subs = new Set();
  const clock = {
    time: null, // null = static (final state)
    playing: false,
    set(t) { clock.time = t; subs.forEach((f) => f()); },
    sub(f) { subs.add(f); return () => subs.delete(f); },
  };
  return clock;
}

export default function Stage({ doc, slideIdx, selId, onSelect, onBegin, onLive, onEnd, images, imagesVersion, clock, mode, onEditText, zones, onToggleZones }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [zoom, setZoom] = useState(0.5);
  const [autoFit, setAutoFit] = useState(true);
  const [guides, setGuides] = useState([]);
  const drag = useRef(null);
  const W = doc.width, H = doc.height;

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const z = Math.min((el.clientWidth - 64) / W, (el.clientHeight - 64) / H);
    setZoom(Math.max(0.1, Math.min(2, z)));
  }, [W, H]);

  useLayoutEffect(() => { if (autoFit) fit(); }, [fit, autoFit, W, H]);
  useEffect(() => {
    const ro = new ResizeObserver(() => autoFit && fit());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [fit, autoFit]);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = zoom * dpr;
    const pw = Math.round(W * scale), ph = Math.round(H * scale);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const c = cv.getContext('2d');
    const t = clock.time;
    if (t === null) renderSlide(c, doc, slideIdx, { t: Infinity, images, scale, guides: true });
    else if (mode === 'video') { c.setTransform(1, 0, 0, 1, 0, 0); renderFrame(c, doc, t, { images, scale }); }
    else renderSlide(c, doc, slideIdx, { t, images, scale, guides: true });
  }, [doc, slideIdx, zoom, images, clock, mode, W, H]);

  useEffect(() => { draw(); }, [draw, imagesVersion]);
  useEffect(() => clock.sub(draw), [clock, draw]);

  const slide = doc.slides[slideIdx];
  const playingIdx = mode === 'video' && clock.time !== null ? slideAt(doc, clock.time).index : slideIdx;

  // ---------- drag / resize ----------
  const s = Math.min(W, H) / 1080;
  const margin = Math.round(80 * s);
  function snap(box) {
    const thr = 8 / zoom;
    const vx = [0, margin, W / 2, W - margin, W];
    const hy = [0, margin, H / 2, H - margin, H];
    const g = [];
    let { x, y } = box;
    const xs = [[x, 0], [x + box.w / 2, box.w / 2], [x + box.w, box.w]];
    for (const [edge, off] of xs) { const t = vx.find((v) => Math.abs(v - edge) < thr); if (t !== undefined) { x = t - off; g.push({ v: true, at: t }); break; } }
    const ys = [[y, 0], [y + box.h / 2, box.h / 2], [y + box.h, box.h]];
    for (const [edge, off] of ys) { const t = hy.find((v) => Math.abs(v - edge) < thr); if (t !== undefined) { y = t - off; g.push({ v: false, at: t }); break; } }
    return { x, y, g };
  }

  function onDown(e, layer, handle) {
    e.stopPropagation();
    onSelect(layer.id);
    if (layer.locked) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: layer.id, handle, sx: e.clientX, sy: e.clientY, start: { x: layer.x, y: layer.y, w: layer.w, h: layer.h }, moved: false, aspect: layer.w / layer.h, keep: KEEP_ASPECT.has(layer.type) };
  }
  function onMove(e) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    if (!d.moved) { d.moved = true; onBegin(); }
    const st = d.start;
    let patch;
    if (!d.handle) {
      const r = snap({ x: st.x + dx, y: st.y + dy, w: st.w, h: st.h });
      setGuides(r.g);
      patch = { x: Math.round(r.x), y: Math.round(r.y) };
    } else {
      let { x, y, w, h } = st;
      if (d.handle.includes('e')) w = st.w + dx;
      if (d.handle.includes('s')) h = st.h + dy;
      if (d.handle.includes('w')) { w = st.w - dx; x = st.x + dx; }
      if (d.handle.includes('n')) { h = st.h - dy; y = st.y + dy; }
      if (d.keep || e.shiftKey) {
        const nh = w / d.aspect;
        if (d.handle.includes('n')) y = st.y + st.h - nh;
        h = nh;
      }
      w = Math.max(10, w); h = Math.max(10, h);
      patch = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    }
    onLive(d.id, patch);
  }
  function onUp() {
    if (drag.current?.moved) onEnd();
    drag.current = null;
    setGuides([]);
  }

  const showOverlay = clock.time === null;

  return (
    <div className="stage-wrap" ref={wrapRef} onPointerDown={() => onSelect(null)}>
      <div className="stage" style={{ width: W * zoom, height: H * zoom }}>
        <canvas ref={canvasRef} style={{ width: W * zoom, height: H * zoom }} />
        {showOverlay && slide && playingIdx === slideIdx && (
          <div className="overlay" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {slide.layers.map((l) => !l.hidden && (
              <div key={l.id}
                className={`hit${l.id === selId ? ' sel' : ''}${l.locked ? ' locked' : ''}`}
                style={{ left: l.x * zoom, top: l.y * zoom, width: l.w * zoom, height: l.h * zoom, transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined }}
                onPointerDown={(e) => onDown(e, l)}
                onDoubleClick={() => onEditText?.(l.id)}
                title={l.name || l.type}>
                {l.id === selId && !l.locked && ['nw', 'ne', 'sw', 'se'].map((h) => (
                  <div key={h} className={`handle ${h}`} onPointerDown={(e) => onDown(e, l, h)} />
                ))}
              </div>
            ))}
            {guides.map((g, i) => <div key={i} className="guide" style={g.v ? { left: g.at * zoom, top: 0, bottom: 0, width: 1 } : { top: g.at * zoom, left: 0, right: 0, height: 1 }} />)}
          </div>
        )}
        {zones && <SafeZones doc={doc} zoom={zoom} />}
      </div>
      <div className="zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn icon sm ghost" onClick={() => { setAutoFit(false); setZoom((z) => Math.max(0.1, z / 1.2)); }} aria-label="Zoom out"><Icon name="zoomOut" /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="btn icon sm ghost" onClick={() => { setAutoFit(false); setZoom((z) => Math.min(3, z * 1.2)); }} aria-label="Zoom in"><Icon name="zoomIn" /></button>
        <button className="btn icon sm ghost" onClick={() => { setAutoFit(true); fit(); }} aria-label="Fit" title="Fit to screen"><Icon name="fit" /></button>
        <button className={`btn icon sm ghost${zones ? ' on' : ''}`} onClick={onToggleZones} aria-label="Instagram guides" title="Instagram guides: safe zones and 3:4 grid crop"><Icon name="zones" /></button>
      </div>
    </div>
  );
}

export function Timeline({ doc, mode, slideIdx, clock, onSeekSlide }) {
  const [, force] = useState(0);
  useEffect(() => clock.sub(() => force((n) => (n + 1) % 1e6)), [clock]);
  const total = mode === 'video' ? docDuration(doc) : Number(doc.slides[slideIdx]?.duration) || 4;
  const t = clock.time;
  const trackRef = useRef(null);
  const play = () => {
    if (clock.playing) { clock.playing = false; clock.set(clock.time); return; }
    clock.playing = true;
    let last = performance.now();
    let cur = t === null || t >= total - 0.01 ? 0 : t;
    const step = (now) => {
      if (!clock.playing) return;
      cur += (now - last) / 1000; last = now;
      if (cur >= total) { cur = mode === 'video' ? total : 0; if (mode === 'video') { clock.playing = false; clock.set(total - 0.001); return; } }
      clock.set(cur);
      if (mode === 'video') { const idx = slideAt(doc, cur).index; if (idx !== slideIdx) onSeekSlide(idx, true); }
      requestAnimationFrame(step);
    };
    clock.set(cur);
    requestAnimationFrame(step);
  };
  const seek = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    const v = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total;
    clock.playing = false;
    clock.set(v);
    if (mode === 'video') onSeekSlide(slideAt(doc, v).index, true);
  };
  const fmt = (v) => `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`;
  const segs = mode === 'video' ? doc.slides.map((s, i) => ({ i, d: Number(s.duration) || 4, label: s.template || 'custom' })) : [{ i: slideIdx, d: total, label: `Slide ${slideIdx + 1} animation` }];
  return (
    <div className="timeline">
      <button className="btn icon primary" onClick={play} aria-label={clock.playing ? 'Pause' : 'Play'}><Icon name={clock.playing ? 'pause' : 'play'} fill="currentColor" stroke={0} /></button>
      <button className="btn sm ghost" onClick={() => { clock.playing = false; clock.set(null); }} disabled={t === null}>Edit mode</button>
      <div className="track" ref={trackRef} onPointerDown={seek}>
        {segs.map((sg) => <div key={sg.i} className={`segm${sg.i === slideIdx ? ' on' : ''}`} style={{ width: `${(sg.d / total) * 100}%` }}>{mode === 'video' ? `${sg.i + 1} · ${sg.label}` : sg.label}</div>)}
        {t !== null && <div className="head" style={{ left: `${(Math.min(t, total) / total) * 100}%` }} />}
      </div>
      <span className="time">{fmt(t ?? 0)} / {fmt(total)}</span>
    </div>
  );
}

/** Instagram overlays: UI safe zones on Reels/Stories, 3:4 profile-grid crop on 4:5 and 1:1 posts. */
function SafeZones({ doc, zoom }) {
  const W = doc.width, H = doc.height, k = Math.min(W, H) / 1080;
  if (H / W > 1.7) {
    const z = SAFE_ZONES[doc.kind === 'story' ? 'story' : 'reel'];
    const label = doc.kind === 'story' ? 'Story' : 'Reel';
    return (
      <div className="zones" aria-hidden="true">
        <div className="zone" style={{ top: 0, height: z.top * k * zoom }}><span>{label} header</span></div>
        <div className="zone" style={{ bottom: 0, height: z.bottom * k * zoom }}><span>{label} caption and buttons</span></div>
        {doc.kind !== 'story' && <div className="zone side" style={{ top: z.top * k * zoom, bottom: z.bottom * k * zoom, right: 0, width: z.right * k * zoom }} />}
      </div>
    );
  }
  if (doc.format === 'feed-portrait' || doc.format === 'square') {
    const vis = Math.min(W, H * 0.75);
    const side = ((W - vis) / 2) * zoom;
    const visH = Math.min(H, W / 0.75);
    const tb = ((H - visH) / 2) * zoom;
    return (
      <div className="zones" aria-hidden="true">
        {side > 0.5 && <><div className="crop" style={{ left: 0, width: side, top: 0, bottom: 0 }} /><div className="crop" style={{ right: 0, width: side, top: 0, bottom: 0 }} /></>}
        {tb > 0.5 && <><div className="crop" style={{ top: 0, height: tb, left: 0, right: 0 }} /><div className="crop" style={{ bottom: 0, height: tb, left: 0, right: 0 }} /></>}
        <span className="crop-label">3:4 profile grid</span>
      </div>
    );
  }
  return null;
}
