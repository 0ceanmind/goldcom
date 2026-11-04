import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudio } from './StudioContext.jsx';

const MotionContext = createContext(null);
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** Feedback is painted before navigation work, including work that finishes in one frame. */
export function StudioMotionProvider({ children }) {
  const { reducedMotion, uiLang } = useStudio();
  const [activity,setActivity] = useState(null);
  const sequence = useRef(0);
  const dismiss = useRef(null);
  const alive = useRef(true);
  const motionPreference = useRef(reducedMotion);
  motionPreference.current = reducedMotion;
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(dismiss.current); delete document.documentElement.dataset.gcNavigating; }; }, []);
  const run = useCallback(async (label,task) => {
    const id = ++sequence.current;
    clearTimeout(dismiss.current);
    const started = performance.now();
    setActivity({ id,label,phase:'working' });
    document.documentElement.dataset.gcNavigating = 'true';
    try {
      await nextPaint();
      return await task();
    } finally {
      // This is the transition's settling time, not a fabricated processing percentage.
      const remaining = Math.max(0,(motionPreference.current ? 60 : 180) - (performance.now() - started));
      if (remaining) await new Promise(resolve => setTimeout(resolve,remaining));
      if (alive.current && id === sequence.current) {
        delete document.documentElement.dataset.gcNavigating;
        setActivity(current => current?.id === id ? { ...current,phase:'settling' } : current);
        dismiss.current = setTimeout(() => { if (alive.current && id === sequence.current) setActivity(null); },motionPreference.current ? 40 : 220);
      }
    }
  }, []);
  return <MotionContext.Provider value={{ run, activity }}>
    {children}
    {activity && createPortal(<div className={`studio-navigation-feedback ${activity.phase}`} dir={uiLang === 'ar' ? 'rtl' : 'ltr'} role="status" aria-live="polite"><div className="navigation-light-track" aria-hidden="true"><i /></div><div className="navigation-capsule"><span className="motion-facets" aria-hidden="true"><i /><i /><i /></span><span>{activity.label}</span></div></div>,document.body)}
  </MotionContext.Provider>;
}

export const useStudioMotion = () => useContext(MotionContext);

/** One measured highlight glides between controls without moving their hit areas. */
export function useSelectionGlider(selected, selector) {
  const [root,setRoot] = useState(null);
  useLayoutEffect(() => {
    if (!root) return;
    const position = () => {
      const button = root.querySelector(selector);
      if (!button) { delete root.dataset.gliderReady; return; }
      const base = root.getBoundingClientRect();
      const rect = button.getBoundingClientRect();
      root.style.setProperty('--glider-x',`${rect.left - base.left - root.clientLeft + root.scrollLeft}px`);
      root.style.setProperty('--glider-y',`${rect.top - base.top - root.clientTop + root.scrollTop}px`);
      root.style.setProperty('--glider-width',`${rect.width}px`);
      root.style.setProperty('--glider-height',`${rect.height}px`);
      root.dataset.gliderReady = 'true';
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(root);
    root.querySelectorAll('button').forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [root,selected,selector]);
  return setRoot;
}
