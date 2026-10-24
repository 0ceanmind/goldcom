// Goldcom design library: ready-made Instagram posts, carousels, Reels, Stories, animated posts and videos.
// Each item builds a full design in Arabic or English from the brand templates, with its caption and hashtags.
// Copy rules: brand guidelines §10 (voice) and §11 (claims). Prices are illustrative and always labelled.
import { createDocument, createSlide, normalizeDocument } from './schema.js';
import { applyAllTemplates } from './templates.js';

const P = (lang) => (en, ar) => (lang === 'ar' ? ar : en);
const S = (template, theme, content, more = {}) => ({ template, theme, content, ...more });

const TAGS = {
  en: ['#Goldcom', '#Gold', '#Oman'],
  ar: ['#جولدكم', '#ذهب', '#عمان'],
};
const tags = (lang, ...extra) => [...TAGS[lang], ...extra];
const PRICE_NOTE = {
  en: 'Prices shown are indicative. Gold prices can go down as well as up.',
  ar: 'الأسعار المعروضة استرشادية، وأسعار الذهب قد ترتفع أو تنخفض.',
};

const ctaApp = (t, extra = {}) => S('cta', 'onyx', {
  title: t('Start with one gram', 'ابدأ بجرام واحد'),
  subtitle: t('On the App Store and Google Play.', 'على App Store و Google Play.'),
  button: t('Download Goldcom', 'حمّل جولدكم'),
  link: 'goldcom.om',
  disclaimer: 'no',
  ...extra,
});

// Only what Goldcom sells: 24K, by weight. Figures are illustrative and must be updated on the posting day.
const TICKER = (t) => [
  t('24K · 1 g  OMR 31.204 ▲ +0.42%', 'عيار 24 · 1 جرام  31.204 ر.ع. ▲ +0.42%'),
  t('24K · 10 g  OMR 312.040 ▲ +0.42%', 'عيار 24 · 10 جرام  312.040 ر.ع. ▲ +0.42%'),
  t('24K · 1 oz  OMR 970.552 ▲ +0.42%', 'عيار 24 · 1 أونصة  970.552 ر.ع. ▲ +0.42%'),
];
// Date and time of the price snapshot. Library designs are built on the day they are used, so the date is today.
const STAMP = (t, hhmm, indicative = false) => {
  const d = new Date();
  const date = t(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), d.toLocaleDateString('ar-OM-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }));
  return `${indicative ? t('Indicative · ', 'استرشادي · ') : ''}${date} · ${hhmm} ${t('GST', 'بتوقيت عُمان')}`;
};
const PRICE = (t) => t('OMR 31.204', '31.204 ر.ع.');
const BARS = (t) => t(['1 g | OMR 33.180', '2.5 g | OMR 81.910', '5 g | OMR 162.260', '10 g | OMR 321.400'], ['1 g | 33.180 ر.ع.', '2.5 g | 81.910 ر.ع.', '5 g | 162.260 ر.ع.', '10 g | 321.400 ر.ع.']);
const NOTE_PRICE = 'Update the price, change and time to the posting moment before you publish. The date is set to the day you created this design.';
const NOTE_QUIZ = "Add Instagram's quiz sticker in the marked space when you post, with 18K, 21K and 24K as options, and mark 24K as the correct answer. The marker is not exported.";
const NOTE_STICKER = (name) => `Add Instagram's ${name} sticker in the marked space when you post. The marker is not exported.`;

export const LIBRARY_CATEGORIES = {
  post: 'Posts',
  carousel: 'Carousels',
  reel: 'Reels',
  story: 'Stories',
  motion: 'Animated posts',
  video: 'Videos',
};

// Visual first: every design is one 3D scene per slide that shows the idea, with at most one short line.
// (knowledge/design-dna.md, knowledge/lessons.md)
const V = (scene, params, content = {}, more = {}) => S('scene', more.theme || 'onyx', { scene, params, ...content }, { pattern: 'none', duration: more.duration || 6, transition: more.transition || 'fade', ...more });
const NOTE_GIFTBOX = 'The gift box is a visual metaphor for gifting in the app. Do not promise physical gift packaging unless Goldcom offers it.';
const NOTE_STORAGE = 'Storage and custody wording needs sign-off (brand §11, amber tier): name the operator before saying "vault" or "insured".';
const NOTE_SCREEN = 'The phone shows an illustrative buy screen with an example price. Swap in a real screenshot (scene setting "Screenshot URL") when you have one.';
// The sticker slot sits low (above Instagram's bottom bar) so the real sticker never covers the hero object.
const sticker = (kind, question, options = [], more = {}) => ({ type: 'sticker', kind, question, options, guide: true, x: 0.2, y: 0.69, w: 0.6, h: 0.14, rotation: -2, anim: { in: 'pop', delay: 0.6, dur: 0.6 }, ...more });
const LOGO_END = (t, more = {}) => V('logo-mark', { mode: 'assemble' }, { title: t('Download Goldcom', 'حمّل جولدكم'), caption: t('App Store · Google Play · goldcom.om', 'App Store · Google Play · goldcom.om'), textZone: 'bottom' }, { duration: 4, ...more });

export const LIBRARY = [
  // ───────────── Posts ─────────────
  {
    id: 'post-real-gold', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['brand', 'product'],
    name: { en: 'Real gold, yours', ar: 'ذهب حقيقي، ملكك' },
    build: (lang, t = P(lang)) => ({
      slides: [V('bar-hero', { weight: '10 g', motion: 'reveal' }, { title: t('Real gold. *Yours.*', 'ذهب حقيقي. *ملكك.*'), caption: t('Minted 24K bar · 10 g', 'سبيكة عيار 24 · 10 جرام') })],
      caption: { text: t('A minted 24K bar with its weight stamped on it. Buy from one gram in the app, then keep it, gift it or collect it.', 'سبيكة ذهب عيار 24 مختوم عليها وزنها. اشترِ من جرام واحد عبر التطبيق، ثم احتفظ بها أو أهدِها أو استلمها.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'post-first-gram', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['brand', 'education'],
    name: { en: 'Start with one gram', ar: 'ابدأ بجرام واحد' },
    build: (lang, t = P(lang)) => ({
      slides: [V('gram-steps', {}, { title: t('Start with *one gram*.', 'ابدأ *بجرام واحد*.'), caption: t('1 g · 5 g · 10 g · 50 g · 100 g, at real size', '1 · 5 · 10 · 50 · 100 جرام، بأحجامها الحقيقية') }, { duration: 7 })],
      caption: { text: t("Gold doesn't need a big budget. Start with a 1 g bar and add more when it suits you.", 'الذهب لا يحتاج إلى ميزانية كبيرة. ابدأ بسبيكة جرام واحد، وأضف إليها متى ناسبك.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'post-purity', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['education', 'purity'],
    name: { en: 'Four nines', ar: 'أربع تسعات' },
    build: (lang, t = P(lang)) => ({
      slides: [V('gold-number', { text: '999.9' }, { title: t('Four nines of *pure gold*.', 'أربع تسعات من *الذهب الخالص*.'), textZone: 'bottom' }, { duration: 5 })],
      caption: { text: t('24K bars are usually 999.9 fine: at least 99.99% gold. Jewellery is usually 18K to 22K, mixed with other metals to hold its shape.', 'سبائك عيار 24 غالبًا بنقاء 999.9، أي ذهب بنسبة 99.99% على الأقل. أما المجوهرات فغالبًا من عيار 18 إلى 22، ممزوجة بمعادن أخرى لتحافظ على شكلها.'), hashtags: tags(lang, t('#24K', '#عيار_24')) },
    }),
  },
  {
    id: 'post-price-today', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['price'], notes: NOTE_PRICE,
    name: { en: 'Gold price today', ar: 'سعر الذهب اليوم' },
    build: (lang, t = P(lang)) => ({
      slides: [V('gold-number', { text: '31.204' }, { title: t('24K gold, *per gram*', 'ذهب عيار 24، *للجرام*'), caption: `${t('OMR', 'ر.ع.')} · ${STAMP(t, '14:05', true)}`, textZone: 'bottom', disclaimer: 'yes' }, { duration: 5 })],
      caption: { text: t(`Today's indicative price for 24K gold, per gram. You see the live price in the app before you buy.\n\n${PRICE_NOTE.en}`, `سعر الذهب عيار 24 للجرام اليوم. السعر المباشر يظهر لك في التطبيق قبل الشراء.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#GoldPrice', '#سعر_الذهب')) },
    }),
  },
  {
    id: 'post-gift', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['gifting'], notes: NOTE_GIFTBOX,
    name: { en: 'Gift gold', ar: 'أهدِ ذهبًا' },
    build: (lang, t = P(lang)) => ({
      slides: [V('gift-box', { weight: '5 g' }, { title: t('Gift *gold*.', 'أهدِ *ذهبًا*.') })],
      caption: { text: t('Send gold to someone you love, from one gram. They can keep it or collect the bar.', 'أهدِ الذهب لمن تحب، بدءًا من جرام واحد. يحتفظ به في التطبيق، أو يستلم السبيكة.'), hashtags: tags(lang, t('#GoldGift', '#هدية_ذهب')) },
    }),
  },
  {
    id: 'post-keep', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['trust'], notes: NOTE_STORAGE,
    name: { en: 'Keep it or collect it', ar: 'احتفظ به أو استلمه' },
    build: (lang, t = P(lang)) => ({
      slides: [V('vault-tile', { weight: '50 g' }, { title: t('Keep it, or *collect it*.', 'احتفظ به، أو *استلمه*.') })],
      caption: { text: t('Keep your gold in the app, or collect the bar whenever you like.', 'احتفظ بذهبك في التطبيق، أو استلم السبيكة متى شئت.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'post-monthly', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['habit'],
    name: { en: 'A little, every month', ar: 'القليل، كل شهر' },
    build: (lang, t = P(lang)) => ({
      slides: [V('coin-stack', { count: 12 }, { title: t('A little, *every month*.', 'القليل، *كل شهر*.') })],
      caption: { text: t('A gram or two each month, and your grams add up. Prices change, so buy at a pace that suits you.', 'جرام أو جرامان كل شهر، وتتراكم جراماتك. الأسعار تتغير، فاشترِ بالوتيرة التي تناسبك.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'post-app', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['app'], notes: NOTE_SCREEN,
    name: { en: 'Three taps', ar: 'ثلاث نقرات' },
    build: (lang, t = P(lang)) => ({
      slides: [V('phone-taps', { weight: '1 g' }, { title: t('Three taps. *Real gold.*', 'ثلاث نقرات. *ذهب حقيقي.*'), caption: t('Illustrative screen', 'شاشة توضيحية') }, { duration: 7 })],
      caption: { text: t('Pick a weight, check the indicative price, buy. The gold is yours.', 'اختر الوزن، راجع السعر الاسترشادي، واشترِ. والذهب ملكك.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'post-ramadan', category: 'post', format: 'square', kind: 'post', tags: ['occasion'],
    name: { en: 'Ramadan Kareem', ar: 'رمضان كريم' },
    build: (lang, t = P(lang)) => ({
      slides: [V('crescent', {}, { title: t('Ramadan Kareem', 'رمضان كريم'), textZone: 'bottom' }, { duration: 8 })],
      caption: { text: t('Ramadan Kareem from all of us at Goldcom.', 'رمضان كريم من أسرة جولدكم، وكل عام وأنتم بخير.'), hashtags: tags(lang, t('#Ramadan', '#رمضان')) },
    }),
  },
  {
    id: 'post-eid', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['occasion', 'gifting'],
    name: { en: 'Eid Mubarak', ar: 'عيد مبارك' },
    build: (lang, t = P(lang)) => ({
      slides: [V('gift-box', { weight: '2.5 g', lining: 'cream' }, { title: t('Eid *Mubarak*', 'عيد *مبارك*') })],
      caption: { text: t('Eid Mubarak from Goldcom. May it bring you and your family joy.', 'عساكم من عوّاده. عيد مبارك من جولدكم.'), hashtags: tags(lang, t('#EidMubarak', '#عيد_مبارك')) },
    }),
  },
  {
    id: 'post-brand', category: 'post', format: 'square', kind: 'post', tags: ['brand'],
    name: { en: 'The mark', ar: 'العلامة' },
    build: (lang, t = P(lang)) => ({
      slides: [{ ...V('logo-mark', { mode: 'assemble' }, { title: t('Real gold, from your phone.', 'ذهب حقيقي، من جوالك.'), textZone: 'bottom' }, { duration: 4 }), brandMark: false }],
      caption: { text: t('Goldcom: certified 24K gold from one gram, in your pocket.', 'جولدكم: ذهب عيار 24 معتمد يبدأ من جرام واحد، في جيبك.'), hashtags: tags(lang) },
    }),
  },

  // ───────────── Carousels ─────────────
  {
    id: 'carousel-launch', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['brand', 'app'], notes: `${NOTE_SCREEN} ${NOTE_GIFTBOX}`,
    name: { en: 'Meet Goldcom', ar: 'تعرّف على جولدكم' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('bar-hero', { weight: '10 g' }, { title: t('Real gold. *From your phone.*', 'ذهب حقيقي. *من جوالك.*') }),
        V('gram-steps', {}, { title: t('Start with *one gram*.', 'ابدأ *بجرام واحد*.') }, { duration: 7 }),
        V('phone-taps', {}, { title: t('Buy in *three taps*.', 'اشترِ *بثلاث نقرات*.'), caption: t('Illustrative screen', 'شاشة توضيحية') }, { duration: 7 }),
        V('gift-box', { weight: '5 g' }, { title: t('Send it as *a gift*.', 'أهدِه *لمن تحب*.') }),
        V('vault-tile', {}, { title: t('Keep it, or *collect it*.', 'احتفظ به، أو *استلمه*.') }),
        LOGO_END(t),
      ],
      caption: { text: t('Certified 24K gold from one gram. Buy it, gift it, keep it or collect it, all from the Goldcom app.', 'ذهب عيار 24 معتمد يبدأ من جرام واحد. اشترِه وأهدِه واحتفظ به أو استلمه، كله من تطبيق جولدكم.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'carousel-purity', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['education', 'purity'],
    name: { en: 'What 24K means', ar: 'ماذا يعني عيار 24' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('gold-number', { text: '24K' }, { title: t('What does *24K* mean?', 'ماذا يعني *عيار 24*؟'), textZone: 'bottom' }, { duration: 5 }),
        V('gold-number', { text: '999.9', reveal: 'rise' }, { title: t('At least *99.99%* gold.', 'ذهب بنسبة *99.99%* على الأقل.'), textZone: 'bottom' }, { duration: 5 }),
        V('bar-hero', { weight: '20 g', motion: 'turntable' }, { title: t('Weight and purity, *stamped*.', 'الوزن والنقاء، *مختومان*.') }),
        LOGO_END(t),
      ],
      caption: { text: t('Karat measures how much of a piece is pure gold, out of 24 parts. 24K is as pure as gold gets: bars are usually 999.9 fine.', 'العيار يقيس نسبة الذهب الخالص في القطعة من 24 جزءًا. عيار 24 هو أنقى الذهب، والسبائك غالبًا بنقاء 999.9.'), hashtags: tags(lang, t('#24K', '#عيار_24')) },
    }),
  },
  {
    id: 'carousel-gifting', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['gifting', 'occasion'], notes: `${NOTE_GIFTBOX} ${NOTE_SCREEN}`,
    name: { en: 'Gifting gold', ar: 'إهداء الذهب' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('gift-box', { weight: '5 g' }, { title: t('Gift *gold*.', 'أهدِ *ذهبًا*.') }),
        V('gram-steps', { weights: '1 g, 2.5 g, 5 g', highlight: 'none' }, { title: t('Pick the *weight*.', 'اختر *الوزن*.') }, { duration: 6 }),
        V('phone-taps', { weight: '2.5 g' }, { title: t('Send it from *the app*.', 'أرسله *من التطبيق*.'), caption: t('Illustrative screen', 'شاشة توضيحية') }, { duration: 7 }),
        LOGO_END(t),
      ],
      caption: { text: t('Eid, a new baby, a graduation: gold is a gift that lasts. Choose the weight and send it in the app.', 'عيد، مولود جديد، تخرّج: الذهب هدية تدوم. اختر الوزن وأرسله من التطبيق.'), hashtags: tags(lang, t('#GoldGift', '#هدية_ذهب')) },
    }),
  },
  {
    id: 'carousel-price', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['price', 'education'], notes: `${NOTE_PRICE} Replace the series on slide 1 with the real last 30 days.`,
    name: { en: 'Gold price, the last month', ar: 'سعر الذهب خلال الشهر' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('price-ridge', {}, { title: t('The last *30 days*.', 'آخر *30 يومًا*.'), caption: t('24K per gram · indicative, illustrative series', 'عيار 24 للجرام · سلسلة توضيحية استرشادية') }),
        V('gold-number', { text: '31.204' }, { title: t('Today, *per gram*', 'اليوم، *للجرام*'), caption: `${t('OMR', 'ر.ع.')} · ${STAMP(t, '14:05', true)}`, textZone: 'bottom', disclaimer: 'yes' }, { duration: 5 }),
        LOGO_END(t),
      ],
      caption: { text: t(`How 24K gold moved over the last month, and today's indicative price per gram.\n\n${PRICE_NOTE.en}`, `حركة سعر الذهب عيار 24 خلال الشهر الماضي، وسعره الاسترشادي اليوم للجرام.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#GoldPrice', '#سعر_الذهب')) },
    }),
  },

  // ───────────── Reels ─────────────
  {
    id: 'reel-brand', category: 'reel', format: 'story', kind: 'reel', tags: ['brand', 'app'], notes: NOTE_SCREEN,
    name: { en: 'Goldcom in 16 seconds', ar: 'جولدكم في 16 ثانية' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('bar-hero', { weight: '10 g' }, { title: t('Real gold.', 'ذهب حقيقي.') }, { duration: 4 }),
        V('gram-steps', {}, { title: t('From *one gram*.', 'من *جرام واحد*.') }, { duration: 4, transition: 'slide' }),
        V('phone-taps', {}, { title: t('In *three taps*.', 'بثلاث *نقرات*.') }, { duration: 4, transition: 'wipe' }),
        LOGO_END(t, { transition: 'zoom' }),
      ],
      caption: { text: t('Real gold, from one gram, in three taps.', 'ذهب حقيقي، من جرام واحد، بثلاث نقرات.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'reel-gift', category: 'reel', format: 'story', kind: 'reel', tags: ['gifting', 'occasion'], notes: NOTE_GIFTBOX,
    name: { en: 'Gift reel', ar: 'ريل الهدية' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('gift-box', { weight: '5 g' }, { title: t('A gift that *lasts*.', 'هدية *تدوم*.') }, { duration: 6 }),
        LOGO_END(t, { transition: 'fade' }),
      ],
      caption: { text: t('Gold for the people you love, from one gram.', 'ذهب لمن تحب، بدءًا من جرام واحد.'), hashtags: tags(lang, t('#GoldGift', '#هدية_ذهب')) },
    }),
  },
  {
    id: 'reel-price', category: 'reel', format: 'story', kind: 'reel', tags: ['price'], notes: `${NOTE_PRICE} Replace the series with the real last 30 days.`,
    name: { en: 'Price reel', ar: 'ريل السعر' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('price-ridge', {}, { title: t('The last *30 days*.', 'آخر *30 يومًا*.'), caption: t('Illustrative series', 'سلسلة توضيحية') }, { duration: 5 }),
        V('gold-number', { text: '31.204' }, { title: t('Today, *per gram*', 'اليوم، *للجرام*'), caption: `${t('OMR', 'ر.ع.')} · ${STAMP(t, '14:05', true)}`, textZone: 'bottom', disclaimer: 'yes' }, { duration: 5, transition: 'slide' }),
      ],
      caption: { text: t(`Today's indicative 24K price per gram.\n\n${PRICE_NOTE.en}`, `السعر الاسترشادي للذهب عيار 24 للجرام اليوم.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#GoldPrice', '#سعر_الذهب')) },
    }),
  },
  {
    id: 'reel-purity', category: 'reel', format: 'story', kind: 'reel', tags: ['education', 'purity'],
    name: { en: 'Purity reel', ar: 'ريل النقاء' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('gold-number', { text: '999.9' }, { title: t('Four *nines*.', 'أربع *تسعات*.'), textZone: 'bottom' }, { duration: 4 }),
        V('bar-hero', { weight: '10 g', motion: 'turntable' }, { title: t('That is *24K*.', 'هذا هو *عيار 24*.') }, { duration: 4, transition: 'zoom' }),
      ],
      caption: { text: t('999.9 means at least 99.99% gold. That is what 24K bars are made of.', '999.9 تعني ذهبًا بنسبة 99.99% على الأقل، ومنه تُصنع سبائك عيار 24.'), hashtags: tags(lang, t('#24K', '#عيار_24')) },
    }),
  },

  // ───────────── Stories ─────────────
  {
    id: 'story-poll', category: 'story', format: 'story', kind: 'story', tags: ['interactive', 'occasion'], notes: `${NOTE_STICKER('poll')} ${NOTE_GIFTBOX}`,
    name: { en: 'Poll: gold or cash for Eidiya', ar: 'تصويت: العيدية ذهب أم نقود' },
    build: (lang, t = P(lang)) => ({
      slides: [V('gift-box', { weight: '2.5 g' }, { title: t('Eidiya: gold *or cash*?', 'العيدية: ذهب *أم نقود*؟'), focusY: 0.47 }, { extras: [sticker('poll', t('Gold or cash?', 'ذهب أم نقود؟'), t(['Gold', 'Cash'], ['ذهب', 'نقود']))] })],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'story-quiz', category: 'story', format: 'story', kind: 'story', tags: ['interactive', 'education'], notes: NOTE_QUIZ,
    name: { en: 'Quiz: the purest karat', ar: 'اختبار: أنقى عيار' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('bar-hero', { weight: '10 g', motion: 'turntable' }, { title: t('Which karat is *purest*?', 'أي عيار هو *الأنقى*؟'), focusY: 0.47 }, { extras: [sticker('quiz', t('Which karat is purest?', 'أي عيار هو الأنقى؟'), ['18K', '21K', '24K'])] }),
        V('gold-number', { text: '24K' }, { title: t('*24K*: 99.9% gold or more.', '*عيار 24*: ذهب بنسبة 99.9% أو أكثر.'), textZone: 'bottom' }, { duration: 5 }),
      ],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'story-price', category: 'story', format: 'story', kind: 'story', tags: ['price'], notes: NOTE_PRICE,
    name: { en: 'Price story', ar: 'قصة السعر' },
    build: (lang, t = P(lang)) => ({
      slides: [V('gold-number', { text: '31.204' }, { title: t('Gold this morning', 'الذهب هذا الصباح'), caption: `${t('OMR per gram, 24K', 'ر.ع. للجرام، عيار 24')} · ${STAMP(t, '09:30', true)}`, textZone: 'bottom', disclaimer: 'yes' }, { duration: 5 })],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'story-ramadan', category: 'story', format: 'story', kind: 'story', tags: ['interactive', 'occasion'], notes: `${NOTE_STICKER('countdown')} Set it to the expected start of Ramadan.`,
    name: { en: 'Countdown to Ramadan', ar: 'العد التنازلي لرمضان' },
    build: (lang, t = P(lang)) => ({
      slides: [V('crescent', {}, { title: t('Ramadan is *close*.', 'رمضان *يقترب*.'), textZone: 'bottom' }, { duration: 8, extras: [sticker('countdown', t('Ramadan', 'رمضان'), [], { y: 0.36 })] })],
      caption: { text: '', hashtags: [] },
    }),
  },

  // ───────────── Animated posts ─────────────
  {
    id: 'motion-bar', category: 'motion', format: 'feed-portrait', kind: 'motion', tags: ['product'],
    name: { en: 'Turning bar (loop)', ar: 'سبيكة تدور (حلقة)' },
    build: (lang, t = P(lang)) => ({
      slides: [V('bar-hero', { weight: '10 g', motion: 'turntable' }, { title: t('Real gold. *Yours.*', 'ذهب حقيقي. *ملكك.*'), seamless: 'yes' }, { duration: 6 })],
      caption: { text: t('Certified 24K, from one gram.', 'ذهب عيار 24 معتمد، من جرام واحد.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'motion-coins', category: 'motion', format: 'feed-portrait', kind: 'motion', tags: ['habit'],
    name: { en: 'Coins stacking (loop)', ar: 'عملات تتراكم (حلقة)' },
    build: (lang, t = P(lang)) => ({
      slides: [V('coin-stack', { count: 12 }, { title: t('A little, *every month*.', 'القليل، *كل شهر*.'), seamless: 'yes' }, { duration: 6 })],
      caption: { text: t('Gram by gram.', 'جرامًا بعد جرام.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'motion-logo', category: 'motion', format: 'square', kind: 'motion', tags: ['brand'],
    name: { en: 'Logo sting (loop)', ar: 'شعار متحرك (حلقة)' },
    build: (lang) => ({
      slides: [{ ...V('logo-mark', { mode: 'assemble' }, { seamless: 'yes' }, { duration: 4 }), brandMark: false }],
      caption: { text: '', hashtags: tags(lang) },
    }),
  },
  {
    id: 'motion-crescent', category: 'motion', format: 'square', kind: 'motion', tags: ['occasion'],
    name: { en: 'Ramadan crescent (loop)', ar: 'هلال رمضان (حلقة)' },
    build: (lang, t = P(lang)) => ({
      slides: [V('crescent', {}, { title: t('Ramadan Kareem', 'رمضان كريم'), textZone: 'bottom', seamless: 'yes' }, { duration: 8 })],
      caption: { text: t('Ramadan Kareem.', 'رمضان كريم.'), hashtags: tags(lang, t('#Ramadan', '#رمضان')) },
    }),
  },

  // ───────────── Video ─────────────
  {
    id: 'video-brand', category: 'video', format: 'video', kind: 'video', tags: ['brand'], notes: `${NOTE_SCREEN} ${NOTE_GIFTBOX}`,
    name: { en: 'Brand film 16:9 (web, YouTube)', ar: 'فيلم تعريفي 16:9 (الموقع ويوتيوب)' },
    build: (lang, t = P(lang)) => ({
      slides: [
        V('bar-hero', { weight: '10 g' }, { title: t('Real gold.', 'ذهب حقيقي.') }, { duration: 4.5 }),
        V('gram-steps', {}, { title: t('From *one gram*.', 'من *جرام واحد*.') }, { duration: 5, transition: 'slide' }),
        V('phone-taps', {}, { title: t('In *three taps*.', 'بثلاث *نقرات*.') }, { duration: 5, transition: 'wipe' }),
        V('gift-box', {}, { title: t('For the people *you love*.', 'لمن *تحب*.') }, { duration: 5, transition: 'fade' }),
        LOGO_END(t, { transition: 'zoom' }),
      ],
      caption: { text: t('Goldcom in 24 seconds.', 'جولدكم في 24 ثانية.'), hashtags: tags(lang) },
    }),
  },
];

export const libraryItem = (id) => LIBRARY.find((i) => i.id === id);

/** Build a ready-to-edit document from a library item. */
export function buildLibraryDoc(item, lang = 'ar') {
  const built = item.build(lang);
  const doc = createDocument({ name: item.name[lang] || item.name.en, format: item.format, kind: item.kind, lang, caption: built.caption });
  doc.source = { type: 'library', item: item.id };
  // Buttons inside a Reel (or a video posted as one) cannot be tapped, so the caption points to the link in the bio.
  const last = built.slides[built.slides.length - 1];
  if (['reel', 'video'].includes(item.kind) && last?.template === 'cta' && doc.caption && !/goldcom\.om/.test(doc.caption.text)) {
    doc.caption = { ...doc.caption, text: `${doc.caption.text}\n\n${lang === 'ar' ? 'الرابط في الملف الشخصي: goldcom.om' : 'Link in bio: goldcom.om'}` };
  }
  if (item.notes) doc.notes = item.notes;
  doc.slides = built.slides.map((s) => createSlide({ pattern: 'top', duration: 4, transition: 'fade', ...s, layers: [] }));
  return applyAllTemplates(normalizeDocument(doc));
}
