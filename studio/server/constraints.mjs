/** @param {string} prompt */
export function constraintsFor(prompt) {
  const quoted = [...String(prompt).matchAll(/["“'«]([^"”'»\n]{3,180})["”'»]/g)].filter(m => /exact|verbatim|حرفي|بالضبط/i.test(String(prompt).slice(Math.max(0,m.index-90),m.index+m[0].length+90)));
  return quoted.map(m => ({ text: m[1], count: /once|one time|مرة واحدة/i.test(String(prompt).slice(Math.max(0,m.index-90),m.index+m[0].length+90)) ? 1 : null }));
}
/**
 * @param {{scenes: Array<{fields: Array<{value: string}>}>, caption?: {text?: string}}} storyboard
 * @param {Array<{text: string, count: number | null}>} constraints
 */
export function constraintIssues(storyboard, constraints) {
  const text = [...storyboard.scenes.flatMap(s => s.fields.map(f => f.value)), storyboard.caption?.text || ''].join('\n');
  return constraints.flatMap(c => {
    const count = text.split(c.text).length-1;
    return count === 0 || c.count !== null && count !== c.count ? [`Required wording “${c.text}” must appear ${c.count === 1 ? 'exactly once' : 'verbatim'}. Found ${count}.`] : [];
  });
}
