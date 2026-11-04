import { useRef } from 'react';
import { Icon, useDialogFocus } from './ui.jsx';
import { useStudio } from './StudioContext.jsx';

export const JOURNEY_STAGES = ['brief', 'ideas', 'storyboard', 'footage', 'build', 'review', 'export'];
export const journeyStage = stage => ({ concepts: 'ideas', pick: 'ideas', choose: 'ideas', copy:'storyboard', capture: 'footage', 'footage-index': 'brief', done: 'export' })[stage] || (JOURNEY_STAGES.includes(stage) ? stage : 'brief');
const icons = { brief: 'text', ideas: 'claude', storyboard: 'copy', footage: 'film', build: 'cube', review: 'check', export: 'download' };
const value = (scene, key) => scene?.fields?.find(field => field.key === key)?.value || '';

export function MiniActivity() {
  return <span className="mini-activity" aria-hidden="true"><i /><i /><i /></span>;
}

export function LoadingSurface({ title, subtitle, compact = false }) {
  const { t } = useStudio();
  return <div className={`loading-surface ${compact ? 'compact' : ''}`} role="status"><div className="loading-scene" aria-hidden="true"><i /><i /><i /><span /></div><b>{title || t('loading')}</b>{subtitle && <p>{subtitle}</p>}<MiniActivity /></div>;
}

export function ExportSurface({ progress }) {
  const { t } = useStudio();
  const surfaceRef = useRef(null);
  useDialogFocus(surfaceRef, () => {});
  const fraction = Number(progress.p);
  const known = Number.isFinite(fraction) && fraction > 0;
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  const finishing = /mixing|encoding|mux|compress|packag|finishing/i.test(progress.msg || progress.label || '');
  return <div className="progress export-overlay" role="dialog" aria-modal="true" aria-label={t('exportWorking')}><div ref={surfaceRef} tabIndex={-1} className="export-surface"><div className="export-film" aria-hidden="true"><div><img src="/favicon.svg" alt="" /><i /><i /><i /></div><span className="export-scan" /></div><div className="page-eyebrow"><MiniActivity />{t('export')}</div><h2>{t('exportWorking')}</h2><p className="hint">{progress.msg || progress.label}</p><div className="export-phase-list"><span className={finishing ? '' : 'active'} aria-current={!finishing ? 'step' : undefined}><Icon name={finishing ? 'check' : 'film'} size={16} />{t('renderFrames')}</span><span className={finishing ? 'active' : ''} aria-current={finishing ? 'step' : undefined}><Icon name="download" size={16} />{t('renderAudio')}</span></div><div className={`export-progress ${known ? '' : 'indeterminate'}`} role="progressbar" aria-label={t('exportWorking')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? percent : undefined}><i style={known ? { width: `${percent}%` } : undefined} /></div>{known && <span className="export-percent">{percent}%</span>}<small>{t('exportHint')}</small></div></div>;
}

export default function ProductionJourney({ job, onInspect }) {
  const { t, advanced } = useStudio();
  const stage = journeyStage(job.stage);
  const index = JOURNEY_STAGES.indexOf(stage);
  const running = job.status === 'running';
  const waiting = job.status === 'waiting';
  const finished = job.status === 'done';
  const titleKey = waiting ? 'waiting' : finished ? 'done' : job.status === 'needs-attention' ? 'attention' : job.status === 'error' ? 'error' : ['cancelled', 'interrupted'].includes(job.status) ? 'stopped' : job.stage === 'footage-index' ? 'footage' : ['pick', 'choose'].includes(job.stage) ? 'direction' : stage;
  const scenes = job.storyboard?.scenes || [];
  const concepts = job.concepts || [];
  const showingIdeas = ['brief', 'ideas'].includes(stage) && !scenes.length;
  const items = showingIdeas ? concepts : scenes;
  const inspectTab = showingIdeas ? 'ideas' : stage === 'review' ? 'review' : 'story';
  const available = key => key === 'brief' ? !!job.brief : key === 'ideas' ? !!concepts.length : key === 'review' ? !!job.reviews?.length : ['storyboard', 'footage', 'build', 'export'].includes(key) ? !!scenes.length : false;
  return <section className={`production-journey stage-${stage} status-${job.status}`} aria-label={t('running')}>
    <div className="journey-heading"><div><div className="page-eyebrow">{running ? <MiniActivity /> : <Icon name={finished ? 'check' : waiting ? 'claude' : 'film'} size={15} />}{t(running ? 'running' : waiting ? 'waiting' : finished ? 'done' : 'attention')}</div><h1 aria-live="polite">{t(`${titleKey}Title`)}</h1><p>{t(`${titleKey}Sub`)}</p></div><span className="journey-phase-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}<small>/ 07</small></span></div>
    <div className="journey-stage" aria-label={t(showingIdeas ? 'ideas' : 'storyboard')}>
      <div className="journey-connector" aria-hidden="true"><i /></div>
      {[0, 1, 2].map(i => {
        const item = items[i];
        const title = showingIdeas ? item?.name : value(item, 'title') || item?.purpose;
        const content = showingIdeas ? item?.hook : value(item, 'body') || value(item, 'subtitle');
        const chosen = showingIdeas && item && (job.chosen || job.pick?.winner) === item.id;
        return <button key={`${stage}-${i}`} className={`journey-frame frame-${i} ${item ? 'has-content' : 'forming'} ${chosen ? 'chosen' : ''}`} disabled={!item} onClick={() => onInspect(inspectTab)} style={{ '--frame-index': i }}>
          <div className="frame-topline"><span>{String(i + 1).padStart(2, '0')}</span>{chosen ? <span className="frame-badge"><Icon name="check" size={10} />{t('chosen')}</span> : item?.duration ? <span>{item.duration}s</span> : <span className="frame-dots"><i /><i /><i /></span>}</div>
          <div className="frame-art" aria-hidden="true"><div className="frame-art-grid" /><span className="frame-icon"><Icon name={showingIdeas ? ['claude', 'comment', 'gem'][i] : icons[stage]} size={i === 1 ? 46 : 38} /></span>{running && <i className="frame-light" />}</div>
          <div className="frame-content">{title ? <><b dir="auto">{String(title).replace(/\*/g, '')}</b>{content && <p dir="auto">{String(content).replace(/\*/g, '')}</p>}</> : <div className="frame-skeleton" aria-hidden="true"><i /><i /><i /></div>}</div>
          <div className="frame-footer"><span>{t(showingIdeas ? 'ideas' : 'scene')} {String(i + 1).padStart(2, '0')}</span>{item ? <Icon name="eye" size={13} /> : <span>{t('forming')}</span>}</div>
        </button>;
      })}
    </div>
    <div className="journey-rail" aria-label={t('details')}>{JOURNEY_STAGES.map((key, i) => {
      const done = finished || i < index;
      const canInspect = available(key);
      const tab = key === 'brief' ? 'brief' : key === 'ideas' ? 'ideas' : key === 'review' ? 'review' : 'story';
      return <button key={key} className={`${done ? 'complete' : ''} ${i === index && !finished ? 'current' : ''}`} disabled={!canInspect} aria-current={i === index && !finished ? 'step' : undefined} aria-label={`${t(key)} · ${t(done ? 'complete' : i === index ? 'inProgress' : 'upcoming')}`} onClick={() => onInspect(tab)}><span className="rail-node">{done ? <Icon name="check" size={12} /> : <i />}</span><span>{t(key)}</span></button>;
    })}</div>
    {running && <div className="journey-live"><span className="live-beacon" />{advanced && job.message ? <span dir="auto">{job.message}</span> : <span>{t('keepWorking')}</span>}</div>}
  </section>;
}
