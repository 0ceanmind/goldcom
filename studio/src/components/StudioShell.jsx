import { useState } from 'react';
import { SelectControl, Icon, Modal } from './ui.jsx';
import { ModeSwitch, useStudio } from './StudioContext.jsx';
import { useSelectionGlider } from './StudioMotion.jsx';

export default function StudioShell({ view, onGo, onSettings, onTool, connected, children, update }) {
  const { t, rtl, uiLang, setUiLang, advanced } = useStudio();
  const [panel, setPanel] = useState(null);
  const navigationGlider = useSelectionGlider(`${view}:${uiLang}`,'button[aria-current="page"]');
  const nav = [['home', 'create', 'claude'], ['gallery', 'projects', 'folder'], ['footage', 'media', 'film']];
  return <div className={`studio-shell ${advanced ? 'is-advanced' : 'is-guided'}`} dir={rtl ? 'rtl' : 'ltr'}>
    <aside className="studio-sidebar" aria-label={t('workspace')}>
      <button className="studio-identity" aria-label="Goldcom Studio" onClick={() => onGo('home')}><img src="/favicon.svg" alt="" /><span>Goldcom <b>Studio</b></span></button>
      <div className="sidebar-label">{t('workspace')}</div>
      <nav ref={navigationGlider} className="studio-nav selection-glider">{nav.map(([key, label, icon]) => <button key={key} aria-label={t(label)} aria-current={view === key || (key === 'home' && view === 'production') ? 'page' : undefined} onClick={() => onGo(key)}><Icon name={icon} size={19} /><span>{t(label)}</span>{key === 'home' && <span className="nav-plus" aria-hidden="true">+</span>}</button>)}
        <button aria-label={t('brand')} onClick={() => setPanel('brand')}><Icon name="gem" size={19} /><span>{t('brand')}</span></button>
      </nav>
      <div className="sidebar-bottom">
        {advanced && <div className="advanced-tools"><span className="sidebar-label">{t('advanced')}</span><button onClick={() => onTool('director')}><Icon name="claude" />{t('ask')}</button><button onClick={() => onTool('generate')}><Icon name="wand" />Generate images</button><button onClick={() => onTool('generators')}><Icon name="key" />AI connections</button><button onClick={() => onTool('brain')}><Icon name="brain" />Studio knowledge</button></div>}
        <button aria-label={t('settings')} onClick={onSettings}><Icon name="gear" size={18} /><span>{t('settings')}</span></button>
        <button aria-label={t('help')} onClick={() => setPanel('help')}><Icon name="comment" size={18} /><span>{t('help')}</span></button>
        <div className="sidebar-status"><i className={connected ? 'online' : ''} /><span>{connected ? 'Goldcom Studio' : t('checking')}</span></div>
      </div>
    </aside>
    <div className="studio-workspace">
      <header className="workspace-topbar"><div className="workspace-location"><Icon name={view === 'footage' ? 'film' : view === 'gallery' ? 'folder' : 'claude'} size={15} /><span>{t(view === 'production' ? 'running' : view === 'gallery' ? 'projects' : view === 'footage' ? 'media' : 'create')}</span></div><div className="workspace-controls">{update}<ModeSwitch /><label className="interface-language"><span className="sr-only">Interface language</span><SelectControl aria-label="Interface language" value={uiLang} onChange={e => setUiLang(e.target.value)}><option value="en">English</option><option value="ar">العربية</option></SelectControl></label></div></header>
      <main className={`workspace-content view-${view}`} id="workspace-main" key={view}>{children}</main>
    </div>
    {panel && <Modal title={t(panel === 'brand' ? 'brandTitle' : 'helpTitle')} onClose={() => setPanel(null)} footer={<button className="btn" onClick={() => setPanel(null)}>{t('close')}</button>}>
      {panel === 'brand' ? <div className="brand-overview"><img src="/favicon.svg" alt="Goldcom" /><p>{t('brandIntro')}</p><div className="brand-colours">{[['Onyx', '#151513'], ['Charcoal', '#1D1D1F'], ['Gold', '#DBA761'], ['Spark', '#F2D46B']].map(([name, colour]) => <div key={name}><i style={{ background: colour }} /><b>{name}</b><small>{colour}</small></div>)}</div><div className="brand-fonts"><b>Inter</b><span>IBM Plex Sans Arabic · العربية</span></div><p className="hint">{t('brandNote')}</p></div> : <div className="studio-help"><p>{t('helpIntro')}</p>{[['01', 'create', 'helpCreate'], ['02', 'running', 'helpFollow'], ['03', 'guidedEditor', 'helpEdit']].map(([n, title, body]) => <section key={n}><span>{n}</span><div><h4>{t(title)}</h4><p>{t(body)}</p></div></section>)}<div className="shortcut-list"><span><kbd>Ctrl / ⌘ + Enter</kbd>{t('start')}</span><span><kbd>Ctrl / ⌘ + S</kbd>{t('saved')}</span><span><kbd>Ctrl / ⌘ + Z</kbd>Undo</span></div></div>}
    </Modal>}
  </div>;
}
