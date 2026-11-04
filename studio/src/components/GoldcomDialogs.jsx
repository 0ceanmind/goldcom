import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Modal } from './ui.jsx';
import { useStudio } from './StudioContext.jsx';

const DialogContext = createContext(null);

function GoldcomDialog({ request, finish }) {
  const { uiLang } = useStudio();
  const [value,setValue] = useState(request.initialValue || '');
  const input = useRef(null);
  const isPrompt = request.kind === 'prompt';
  const cancel = () => finish(isPrompt ? null : false);
  useEffect(() => { if (isPrompt) { input.current?.focus(); input.current?.select(); } }, []);
  const submit = () => { if (!isPrompt || value.trim()) finish(isPrompt ? value.trim() : true); };
  return createPortal(<div dir={uiLang === 'ar' ? 'rtl' : 'ltr'}><Modal title={request.title || (uiLang === 'ar' ? 'تأكيد الإجراء' : 'Confirm this action')} onClose={cancel} size="goldcom-decision" footer={<><button className="btn" onClick={cancel}>{uiLang === 'ar' ? 'إلغاء' : 'Cancel'}</button><button className={`btn ${isPrompt ? 'primary' : 'decision-confirm'}`} disabled={isPrompt && !value.trim()} onClick={submit}>{request.confirmLabel || (uiLang === 'ar' ? isPrompt ? 'حفظ الاسم' : 'تأكيد' : isPrompt ? 'Save name' : 'Confirm')}</button></>}>
    <div className="decision-symbol"><Icon name={isPrompt ? 'text' : 'warn'} size={24} /></div>{request.message && <p className="decision-message">{request.message}</p>}{isPrompt && <label className="decision-input-label">{uiLang === 'ar' ? 'اسم المشروع' : 'Project name'}<input ref={input} className="input" dir="auto" maxLength={120} value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }} /></label>}
  </Modal></div>,document.body);
}

export function GoldcomDialogProvider({ children }) {
  const [queue,setQueue] = useState([]);
  const request = (kind,options,initialValue) => new Promise(resolve => setQueue(items => [...items,{ kind,...(typeof options === 'string' ? kind === 'prompt' ? { title:options } : { message:options } : options),initialValue,resolve,id:Math.random() }]));
  const finish = result => { queue[0]?.resolve(result); setQueue(items => items.slice(1)); };
  return <DialogContext.Provider value={{ confirmAction:(options) => request('confirm',options), requestText:(options,initialValue) => request('prompt',options,initialValue) }}>{children}{queue[0] && <GoldcomDialog key={queue[0].id} request={queue[0]} finish={finish} />}</DialogContext.Provider>;
}

export const useGoldcomDialog = () => useContext(DialogContext);
