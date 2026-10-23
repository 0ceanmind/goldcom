// Brand checks from GOLDCOM_BRAND_GUIDELINES.md §0, §2, §10 and §11.
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
const NEEDS_DISCLAIMER = /OMR|ر\.ع|\binvest|\bsave\b|returns?\b|استثمار|ادخار|سعر|price/i;
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
    const hasDisclaimer = texts.some((t) => /not financial advice|ليس نصيحة مالية/i.test(t.text));
    if (hasDisclaimer) disclaimerAnywhere = true;
    let needs = false;
    for (const { layer, text } of texts) {
      for (const [re, msg] of RED) if (re.test(text)) issues.push({ level: 'error', slide: si, layer: layer.id, message: msg });
      for (const [re, msg] of AMBER) if (re.test(text)) issues.push({ level: 'warn', slide: si, layer: layer.id, message: msg });
      for (const [re, msg] of NAME_ERRORS) if (re.test(text)) issues.push({ level: 'error', slide: si, layer: layer.id, message: msg });
      if (NEEDS_DISCLAIMER.test(text) && !/not financial advice|ليس نصيحة مالية/i.test(text)) needs = true;
      if (/OMR\s?\d+(\.\d{1,2})?(?!\d)/.test(text) && !/OMR\s?\d+\.\d{3}/.test(text)) issues.push({ level: 'warn', slide: si, layer: layer.id, message: 'OMR prices use 3 decimals, e.g. OMR 31.204 (§5.4).' });
      if (/!/.test(text) && layer.type === 'button') issues.push({ level: 'warn', slide: si, layer: layer.id, message: 'No exclamation marks in buttons (§10.5).' });
    }
    if (needs && !hasDisclaimer) issues.push({ level: 'warn', slide: si, layer: null, message: 'Price, saving or investment wording: add the risk disclaimer on this slide or the last slide (§11.2).' });
    const logos = (slide.layers || []).filter((l) => l.type === 'logo' && !l.hidden);
    if (logos.length > 1) issues.push({ level: 'warn', slide: si, layer: logos[1].id, message: 'Use the logo once per layout (§3.4).' });
    for (const l of logos) if (l.rotation) issues.push({ level: 'error', slide: si, layer: l.id, message: 'Never rotate the logo (§3.6).' });
  });
  if (!doc.slides.some((s) => (s.layers || []).some((l) => l.type === 'logo' && !l.hidden))) issues.push({ level: 'info', slide: 0, layer: null, message: 'No logo in this document. Add it once, usually on the cover or the last slide.' });
  // Collapse per-slide disclaimer warnings when the document carries one somewhere (carousels usually end with it).
  return disclaimerAnywhere ? issues.filter((i) => !i.message.startsWith('Price, saving')) : issues;
}
