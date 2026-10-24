// Brand checks from GOLDCOM_BRAND_GUIDELINES.md §0, §2, §10 and §11, plus Instagram readiness.
import { SAFE_ZONES } from './brand.js';
const RED = [
  [/guarantee(d|s)?\b/i, 'Never promise guaranteed returns (§11 red tier).'],
  [/risk[-\s]?free/i, '"Risk-free" is never allowed (§11).'],
  [/safe investment/i, '"Safe investment" is never allowed (§11).'],
  [/double your money|get rich|to the moon|skyrocket/i, 'Hype and get-rich language is off-brand (§10).'],
  [/\b(best|cheapest|lowest) (gold )?price/i, 'Superlative price claims need independent substantiation (§11).'],
  [/#1|number one|most trusted/i, 'Superlatives need independent substantiation (§11).'],
  [/fully regulated|government[-\s]backed|central[-\s]bank approved/i, 'Regulatory absolutes are never allowed (§11).'],
  [/100% safe|unhackable|bank[-\s]grade/i, 'Security absolutes are off-brand (§10).'],
  [/hurry|last chance|before it'?s too late|never be this low/i, 'No urgency from price movements (§10).'],
  [/مضمون|ضمان الأرباح|أرباح مضمونة|بدون مخاطر|خالي من المخاطر|استثمار آمن|أفضل سعر|أرخص سعر/, 'Arabic red-tier claim: guaranteed, risk-free, safe investment or best price (§11).'],
];
const AMBER = [
  [/fully insured|insured\b/i, 'Insurance claims need the insurer name and scope on file (§11 amber).'],
  [/licensed|regulated/i, 'Licensing claims need the authority and CR number (§11 amber).'],
  [/sharia[-\s]?certified|halal guaranteed/i, 'Sharia certification needs the certificate number. Prefer "Sharia advisory by Eltizam" (§11).'],
  [/recorded in your name|allocated/i, 'Allocation claims need sign-off while operationally true (§11 amber).'],
  [/\bvault\b/i, 'Vault custody claims need the operator named (§11 amber).'],
  [/free storage|30 days/i, 'Free storage offers only while the offer is live (§11 amber).'],
  [/مؤمن عليها|مرخص|معتمد شرعي/, 'Arabic amber-tier claim: needs approved wording (§11).'],
];
// Shown prices (OMR figures), saving or investing language need the risk disclaimer; the bare word "price" does not.
const NEEDS_DISCLAIMER = /OMR\s?\d|\d[\d.,]*\s?ر\.ع|\binvest|\bsav(e|ing)\b|\breturns?\b|استثمار|ادّخ|ادخ|عوائد/i;
const HAS_DISCLAIMER = /not financial advice|ليس نصيحة مالية|go down as well as up|قد ترتفع أو تنخفض|ترتفع قيمة مقتنياتك أو تنخفض/i;
const NAME_ERRORS = [
  [/GoldCom|GOLDCOM|Gold Com|Gold\.com/, 'Write the name as "Goldcom" (§2).'],
  [/جولد كوم|ذهب كوم|غولدكم/, 'Write the Arabic name as "جولدكم" (§2).'],
];

function textsOf(slide) {
  const out = [];
  for (const l of slide.layers || []) {
    if (l.hidden) continue;
    if (l.type === 'text' || l.type === 'button' || l.type === 'badge') out.push({ layer: l, text: l.text || '' });
    if (l.type === 'list') out.push({ layer: l, text: (l.items || []).join('\n') });
  }
  return out;
}

/** Returns [{ level: 'error'|'warn'|'info', slide, layer, message }] */
export function lintDocument(doc) {
  const issues = [];
  let disclaimerAnywhere = false;
  doc.slides.forEach((slide, si) => {
    const texts = textsOf(slide);
    const hasDisclaimer = texts.some((t) => HAS_DISCLAIMER.test(t.text));
    if (hasDisclaimer) disclaimerAnywhere = true;
    let needs = false;
    for (const { layer, text } of texts) {
      for (const [re, msg] of RED) if (re.test(text)) issues.push({ level: 'error', slide: si, layer: layer.id, message: msg });
      for (const [re, msg] of AMBER) if (re.test(text)) issues.push({ level: 'warn', slide: si, layer: layer.id, message: msg });
      for (const [re, msg] of NAME_ERRORS) if (re.test(text)) issues.push({ level: 'error', slide: si, layer: layer.id, message: msg });
      if (NEEDS_DISCLAIMER.test(text) && !HAS_DISCLAIMER.test(text)) needs = true;
      if (/OMR\s?\d+(\.\d{1,2})?(?!\d)/.test(text) && !/OMR\s?\d+\.\d{3}/.test(text)) issues.push({ level: 'warn', slide: si, layer: layer.id, message: 'OMR prices use 3 decimals, e.g. OMR 31.204 (§5.4).' });
      if (/!/.test(text) && layer.type === 'button') issues.push({ level: 'warn', slide: si, layer: layer.id, message: 'No exclamation marks in buttons (§10.5).' });
    }
    if (needs && !hasDisclaimer) issues.push({ level: 'warn', slide: si, layer: null, message: 'Price, saving or investment wording: add the risk disclaimer on this slide or the last slide (§11.2).' });
    const showsPrice = texts.some((t) => /OMR\s?\d|\d\.\d{3}\s?ر\.ع/.test(t.text)) || (slide.layers || []).some((l) => l.type === 'ticker' && !l.hidden);
    for (const { layer, text } of texts) if (showsPrice && layer.type === 'badge' && /^\s*(live|مباشر)\s*$/i.test(text)) issues.push({ level: 'error', slide: si, layer: layer.id, message: 'A posted price is a snapshot: label it "Indicative" with the date, never "Live" (hard rule 7).' });
    const logos = (slide.layers || []).filter((l) => l.type === 'logo' && !l.hidden);
    if (logos.length > 1) issues.push({ level: 'warn', slide: si, layer: logos[1].id, message: 'Use the logo once per layout (§3.4).' });
    for (const l of logos) if (l.rotation) issues.push({ level: 'error', slide: si, layer: l.id, message: 'Never rotate the logo (§3.6).' });
  });
  if (!doc.slides.some((s) => (s.layers || []).some((l) => l.type === 'logo' && !l.hidden))) issues.push({ level: 'info', slide: 0, layer: null, message: 'No logo in this document. Add it once, usually on the cover or the last slide.' });
  // A drawn sticker cannot be tapped. In Reels and Stories, mark the space for Instagram's own sticker instead.
  if (doc.kind === 'reel' || doc.kind === 'story') doc.slides.forEach((slide, si) => {
    for (const l of slide.layers || []) if (l.type === 'sticker' && !l.hidden && !l.guide) issues.push({ level: 'warn', slide: si, layer: l.id, message: 'This sticker is drawn into the video, so viewers cannot tap it. Set "Use Instagram\'s own sticker" to yes and add the real sticker when posting.' });
  });
  // Instagram readiness
  const W = doc.width, H = doc.height, k = Math.min(W, H) / 1080;
  const zone = H / W > 1.7 && (doc.kind === 'reel' || doc.kind === 'story') ? SAFE_ZONES[doc.kind] : null;
  doc.slides.forEach((slide, si) => {
    for (const l of slide.layers || []) {
      if (l.hidden || !['text', 'list', 'button', 'badge'].includes(l.type) || l.name === 'disclaimer') continue;
      if (zone && (l.y < zone.top * k - 4 || l.y + l.h > H - zone.bottom * k + 4)) issues.push({ level: 'warn', slide: si, layer: l.id, message: `Text sits under the Instagram ${doc.kind === 'reel' ? 'Reel' : 'Story'} interface (top ${zone.top}px / bottom ${zone.bottom}px). Move it into the safe area.` });
      if (doc.format === 'feed-portrait' && (l.x < 34 * k || l.x + l.w > W - 34 * k) && l.w < W * 0.98) issues.push({ level: 'info', slide: si, layer: l.id, message: 'Close to the side edge: the 3:4 profile grid crops about 34 px on each side.' });
    }
  });
  const cap = doc.caption || {};
  const capText = String(cap.text || '');
  const allTags = cap.hashtags || [];
  if (capText.length + allTags.join(' ').length > 2200) issues.push({ level: 'error', slide: 0, layer: null, message: 'Caption is longer than Instagram allows (2,200 characters).' });
  if (allTags.length > 30) issues.push({ level: 'error', slide: 0, layer: null, message: 'Instagram allows at most 30 hashtags.' });
  else if (allTags.length > 6) issues.push({ level: 'info', slide: 0, layer: null, message: 'Keep hashtags to 3–5 relevant ones.' });
  const emoji = (capText.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emoji > 2) issues.push({ level: 'warn', slide: 0, layer: null, message: 'Caption uses more than one or two emoji (brand §6.5).' });
  for (const [re, msg] of RED) if (re.test(capText)) issues.push({ level: 'error', slide: 0, layer: null, message: `Caption: ${msg}` });
  if (NEEDS_DISCLAIMER.test(capText) && /OMR|ر\.ع|invest|استثمار/i.test(capText) && !/indicative|استرشادي|go down|تنخفض/i.test(capText)) issues.push({ level: 'warn', slide: 0, layer: null, message: 'Caption mentions prices or investing: add the short price note.' });
  // Collapse per-slide disclaimer warnings when the document carries one somewhere (carousels usually end with it).
  return disclaimerAnywhere ? issues.filter((i) => !i.message.startsWith('Price, saving')) : issues;
}
