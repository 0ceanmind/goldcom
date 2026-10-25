// Starter packs: ready-made, on-brand slide sets. Each returns { name, format, kind, lang, slides: [{ template, theme, content }] }.
// Brand starters are visual first: one 3D scene per slide with one short line (knowledge/design-dna.md).
const T = (lang) => (en, ar) => (lang === 'ar' ? ar : en);
const V = (scene, params, content = {}, more = {}) => ({ template: 'scene', theme: more.theme || 'onyx', pattern: 'none', duration: more.duration || 5, transition: more.transition || 'fade', content: { scene, params, ...content } });
// The price snapshot is dated the day the design is made; update the figure and time before posting.
const stamp = (t) => {
  const d = new Date();
  return `${t('Indicative · ', 'استرشادي · ')}${t(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), d.toLocaleDateString('ar-OM-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }))} · 14:05 ${t('GST', 'بتوقيت عُمان')}`;
};
export const STARTERS = {
  launch: {
    name: 'App launch carousel',
    description: 'Six visual slides, one idea each: the minted bar, the old way (souq), gifting, three taps, the price, the logo.',
    kind: 'carousel', format: 'feed-portrait',
    build: (lang) => {
      const t = T(lang);
      return [
        V('bar-hero', { weight: '10 g', motion: 'reveal' }, { title: t('Real gold, *from your phone*.', 'ذهب حقيقي، *من جوالك*.') }),
        V('people', { set: 'souq', mood: 'dim', a_person: 'man', a_pose: 'stressed', a_mood: 'worried', a_facing: 'right', a_at: 0.42 }, { title: t('No more shop to shop.', 'لا تنقّل بين المحلات بعد اليوم.') }),
        V('gift-box', { weight: '5 g' }, { title: t('Gift it *in seconds*.', 'أهدِه *في ثوانٍ*.') }),
        V('phone-taps', {}, { title: t('Buy in *three taps*.', 'اشترِ *بثلاث نقرات*.') }),
        V('gold-number', { text: '31.204' }, { title: t('See the price *before you buy*.', 'اعرف السعر *قبل أن تشتري*.'), caption: `${t('OMR per gram', 'ر.ع. للجرام')} · ${stamp(t)}`, textZone: 'bottom', disclaimer: 'yes' }),
        V('logo-mark', { mode: 'assemble' }, { title: t('Download Goldcom', 'حمّل جولدكم'), caption: 'App Store · Google Play · goldcom.om', textZone: 'bottom' }),
      ];
    },
  },
  project: {
    name: 'Project showcase',
    description: 'Showcase something you built (the layout Claude Code fills in): cover, problem, features, live screen, code, stat, CTA.',
    kind: 'carousel', format: 'feed-portrait',
    build: (lang) => ({
      en: [
        { template: 'cover', theme: 'onyx', content: { kicker: 'Built with Claude Code', title: 'Project name, *one-line promise*', subtitle: 'What it does for the user, in one sentence.', visual: 'device', device: 'browser' } },
        { template: 'statement', theme: 'charcoal', content: { kicker: 'Why we built it', title: 'The problem, stated *plainly*.', body: 'One supporting line with the concrete pain.' } },
        { template: 'feature', theme: 'onyx', content: { icon: 'bolt', kicker: 'Feature', title: 'Key feature one', body: 'What it does and why it matters.', device: 'browser' } },
        { template: 'list', theme: 'cream', content: { kicker: 'What is inside', title: 'Highlights', items: ['Highlight one', 'Highlight two', 'Highlight three'], bullet: 'gem' } },
        { template: 'code', theme: 'onyx', content: { kicker: 'Under the hood', title: 'How it works', code: "// key snippet from the project\nexport async function main() {\n  return 'hello';\n}", filename: 'index.ts', caption: 'Simplified excerpt.' } },
        { template: 'stat', theme: 'bullion', content: { kicker: 'Result', stat: '3x', label: 'faster than before', body: 'Measured how, and on what.' } },
        { template: 'cta', theme: 'onyx', content: { title: 'Try it today', subtitle: 'Where to find it.', button: 'Open the project', link: 'goldcom.om', disclaimer: 'no' } },
      ],
      ar: [
        { template: 'cover', theme: 'onyx', content: { kicker: 'بُني باستخدام Claude Code', title: 'اسم المشروع، *وعد في سطر*', subtitle: 'ماذا يقدّم للمستخدم في جملة واحدة.', visual: 'device', device: 'browser' } },
        { template: 'statement', theme: 'charcoal', content: { kicker: 'لماذا بنيناه', title: 'المشكلة، *بوضوح*.', body: 'سطر داعم يوضح المشكلة الفعلية.' } },
        { template: 'feature', theme: 'onyx', content: { icon: 'bolt', kicker: 'ميزة', title: 'الميزة الرئيسية الأولى', body: 'ماذا تفعل ولماذا تهم.', device: 'browser' } },
        { template: 'list', theme: 'cream', content: { kicker: 'ماذا يتضمن', title: 'أبرز المزايا', items: ['الميزة الأولى', 'الميزة الثانية', 'الميزة الثالثة'], bullet: 'gem' } },
        { template: 'code', theme: 'onyx', content: { kicker: 'خلف الكواليس', title: 'كيف يعمل', code: "// key snippet from the project\nexport async function main() {\n  return 'hello';\n}", filename: 'index.ts', caption: 'مقتطف مبسّط.' } },
        { template: 'stat', theme: 'bullion', content: { kicker: 'النتيجة', stat: '3x', label: 'أسرع من قبل', body: 'كيف قسنا ذلك.' } },
        { template: 'cta', theme: 'onyx', content: { title: 'جرّبه اليوم', subtitle: 'أين تجده.', button: 'افتح المشروع', link: 'goldcom.om', disclaimer: 'no' } },
      ],
    })[lang],
  },
  price: {
    name: 'Gold price post',
    description: 'The price as a minted 3D number, with the time of the snapshot and the mandatory disclaimer.',
    kind: 'post', format: 'feed-portrait',
    build: (lang) => {
      const t = T(lang);
      return [V('gold-number', { text: '31.204' }, { title: t('24K gold, *per gram*', 'ذهب عيار 24، *للجرام*'), caption: `${t('OMR', 'ر.ع.')} · ${stamp(t)}`, textZone: 'bottom', disclaimer: 'yes' }, { duration: 5 })];
    },
  },
  gift: {
    name: 'Gifting reel',
    description: 'Eid gifting in three shots: the moment between two people, the gift box opening, the logo.',
    kind: 'reel', format: 'story',
    build: (lang) => {
      const t = T(lang);
      return [
        V('people', { set: 'room', setTheme: 'cream', a_person: 'woman', a_pose: 'give-gift', b_person: 'young-woman', b_pose: 'receive-gift', b_prop: 'none', b_skin: 'light', seed: 2 }, { title: t('A gift that *lasts*.', 'هدية *تدوم*.') }, { theme: 'cream', duration: 4 }),
        V('gift-box', { weight: '5 g' }, { title: t('Send gold *in seconds*.', 'أرسل الذهب *في ثوانٍ*.') }, { duration: 5, transition: 'wipe' }),
        V('logo-mark', { mode: 'assemble' }, { title: t('Gift gold with Goldcom', 'أهدِ الذهب مع جولدكم'), caption: 'App Store · Google Play · goldcom.om', textZone: 'bottom' }, { duration: 4 }),
      ];
    },
  },
  appstore: {
    name: 'App Store screenshots',
    description: 'App-store screenshot set on the Bullion gradient with device mockups and Arabic headlines.',
    kind: 'carousel', format: 'appstore',
    build: (lang) => ({
      ar: [
        { template: 'cover', theme: 'bullion', content: { title: 'تصفح أسعار الذهب الفورية', visual: 'device', device: 'phone' } },
        { template: 'cover', theme: 'bullion', content: { title: 'في جولدكم تسوق بأمان', visual: 'device', device: 'phone', placeholder: 'browse' } },
        { template: 'cover', theme: 'bullion', content: { title: 'أهدِ من تحب ذهبًا حقيقيًا', visual: 'goldbar', barLabel: '5 g' } },
      ],
      en: [
        { template: 'cover', theme: 'bullion', content: { title: 'Browse live gold prices', visual: 'device', device: 'phone' } },
        { template: 'cover', theme: 'bullion', content: { title: 'Shop with confidence at Goldcom', visual: 'device', device: 'phone', placeholder: 'browse' } },
        { template: 'cover', theme: 'bullion', content: { title: 'Gift real gold to the people you love', visual: 'goldbar', barLabel: '5 g' } },
      ],
    })[lang],
  },
  blank: {
    name: 'Blank',
    description: 'One empty Onyx slide with the logo.',
    kind: 'carousel', format: 'feed-portrait',
    build: () => [{ template: null, theme: 'onyx', content: null, layers: [{ type: 'logo', x: 80, y: 80, w: 250, h: 99 }] }],
  },
};
