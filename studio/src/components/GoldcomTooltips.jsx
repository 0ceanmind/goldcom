import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Replace browser title balloons with the studio's own tooltip layer. */
export default function GoldcomTooltips() {
  const [tip,setTip] = useState(null);
  const timer = useRef(null);
  const target = useRef(null);
  useEffect(() => {
    const adopt = element => {
      if (!element?.hasAttribute?.('title')) return;
      const title = element.getAttribute('title');
      if (title?.trim()) {
        element.setAttribute('data-goldcom-tooltip',title);
        if (!element.getAttribute('aria-label') && !element.textContent.trim() && element.matches('button,a,input')) element.setAttribute('aria-label',title);
      }
      element.removeAttribute('title');
    };
    const scan = node => { adopt(node); node.querySelectorAll?.('[title]').forEach(adopt); };
    scan(document.body);
    const observer = new MutationObserver(records => { for (const record of records) { if (record.type === 'attributes') adopt(record.target); else record.addedNodes.forEach(scan); } });
    observer.observe(document.body,{ subtree:true,childList:true,attributes:true,attributeFilter:['title'] });
    const hide = () => {
      clearTimeout(timer.current);
      const element = target.current;
      if (element) {
        const ids = (element.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== 'goldcom-tooltip');
        ids.length ? element.setAttribute('aria-describedby',ids.join(' ')) : element.removeAttribute('aria-describedby');
      }
      target.current = null; setTip(null);
    };
    const reveal = event => {
      const element = event.target.closest?.('[data-goldcom-tooltip]');
      if (!element || element.disabled || element === target.current) return;
      hide(); target.current = element;
      timer.current = setTimeout(() => {
        if (!element.isConnected) return;
        const rect = element.getBoundingClientRect();
        const width = Math.min(280,window.innerWidth - 24);
        const x = Math.min(window.innerWidth - width / 2 - 12,Math.max(width / 2 + 12,rect.left + rect.width / 2));
        const above = rect.top > 100;
        const ids = element.getAttribute('aria-describedby');
        element.setAttribute('aria-describedby',[ids,'goldcom-tooltip'].filter(Boolean).join(' '));
        setTip({ label:element.getAttribute('data-goldcom-tooltip'),x,y:above ? rect.top - 9 : rect.bottom + 9,above });
      },event.type === 'focusin' ? 150 : 450);
    };
    const leave = event => { if (target.current && !target.current.contains(event.relatedTarget)) hide(); };
    const escape = event => { if (event.key === 'Escape') hide(); };
    document.addEventListener('pointerover',reveal);
    document.addEventListener('pointerout',leave);
    document.addEventListener('focusin',reveal);
    document.addEventListener('focusout',leave);
    document.addEventListener('pointerdown',hide,true);
    document.addEventListener('scroll',hide,true);
    document.addEventListener('keydown',escape);
    window.addEventListener('resize',hide);
    return () => { observer.disconnect(); clearTimeout(timer.current); document.removeEventListener('pointerover',reveal); document.removeEventListener('pointerout',leave); document.removeEventListener('focusin',reveal); document.removeEventListener('focusout',leave); document.removeEventListener('pointerdown',hide,true); document.removeEventListener('scroll',hide,true); document.removeEventListener('keydown',escape); window.removeEventListener('resize',hide); };
  }, []);
  return tip && createPortal(<div id="goldcom-tooltip" role="tooltip" className={`goldcom-tooltip ${tip.above ? 'above' : 'below'}`} style={{ left:tip.x,top:tip.y }}>{tip.label}</div>,document.body);
}
