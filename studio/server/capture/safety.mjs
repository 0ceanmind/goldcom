const PAYMENT = /\b(pay|confirm|payment|checkout|place order|complete purchase|buy now|send gift|transfer|otp|verification code)\b|دفع|تأكيد|تسديد|تحويل|رمز التحقق|رمز التأكيد|شراء الآن|إرسال الهدية/i;
/**
 * @param {{action: string, element?: number, sensitive_regions?: unknown[]}} step
 * @param {Array<{text?: string, desc?: string, id?: string, clickable?: boolean}>} elements
 */
export function assertSafeCaptureStep(step, elements) {
  if (step.sensitive_regions?.length) throw new Error('Capture stopped: personal data is visible. Use a demonstration account without personal data.');
  if (step.action === 'type' && elements.some(e => PAYMENT.test([e.text,e.desc,e.id].join(' ')))) throw new Error('Capture cannot enter payment or verification information.');
  if (step.action !== 'tap') return;
  const target = typeof step.element === 'number' ? elements[step.element] : undefined;
  if (!target || !target.clickable || ![target.text,target.desc].some(Boolean)) throw new Error('Capture stopped: tap must identify a labelled accessible control.');
  if (PAYMENT.test([target.text,target.desc,target.id].join(' '))) throw new Error('Capture stopped before a payment, confirmation or verification control.');
}
