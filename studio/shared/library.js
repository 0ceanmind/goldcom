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
  return `${indicative ? t('Indicative · ', 'استرشادي · ') : ''}${date} · ${hhmm}`;
};
const PRICE = (t) => t('OMR 31.204', '31.204 ر.ع.');
const BARS = (t) => t(['1 g | OMR 33.180', '2.5 g | OMR 81.910', '5 g | OMR 162.260', '10 g | OMR 321.400'], ['1 g | 33.180 ر.ع.', '2.5 g | 81.910 ر.ع.', '5 g | 162.260 ر.ع.', '10 g | 321.400 ر.ع.']);
const NOTE_PRICE = 'Update the price, change and time to the posting moment before you publish. The date is set to the day you created this design.';
const NOTE_STICKER = (name) => `Add Instagram's ${name} sticker in the marked space when you post. The marker is not exported.`;

export const LIBRARY_CATEGORIES = {
  post: 'Posts',
  carousel: 'Carousels',
  reel: 'Reels',
  story: 'Stories',
  motion: 'Animated posts',
  video: 'Videos',
};

export const LIBRARY = [
  // ───────────── Posts ─────────────
  {
    id: 'post-price-today', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['price'], notes: NOTE_PRICE,
    name: { en: 'Gold price today', ar: 'سعر الذهب اليوم' },
    build: (lang, t = P(lang)) => ({
      slides: [S('price', 'onyx', { title: t('Gold today', 'الذهب اليوم'), label: t('Gold 24K · per gram', 'ذهب عيار 24 · للجرام'), price: PRICE(t), change: '+0.42%', time: STAMP(t, '14:05', true) })],
      caption: { text: t(`Today's indicative price for 24K gold, per gram. You'll see the live price in the app before you buy.\n\n${PRICE_NOTE.en}`, `سعر الذهب عيار 24 للجرام اليوم. السعر المباشر يظهر لك في التطبيق قبل الشراء.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#GoldPrice', '#سعر_الذهب')) },
    }),
  },
  {
    id: 'post-first-gram', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['brand'],
    name: { en: 'Your first gram', ar: 'جرامك الأول' },
    build: (lang, t = P(lang)) => ({
      slides: [S('statement', 'cream', { kicker: t('Start small', 'ابدأ بالقليل'), title: t('Your first gram is *real gold*.', 'جرامك الأول ذهب *حقيقي*.'), body: t('Certified 24K bars start from one gram on Goldcom.', 'سبائك عيار 24 المعتمدة تبدأ من جرام واحد في جولدكم.') })],
      caption: { text: t('You don\'t need a big budget to own gold. One gram is a real start, and you can add to it whenever you like.', 'امتلاك الذهب لا يحتاج إلى ميزانية كبيرة. جرام واحد بداية حقيقية، وتستطيع أن تضيف إليه متى شئت.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'post-karat-fact', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['education'],
    name: { en: 'Did you know: 24K', ar: 'هل تعلم: عيار 24' },
    build: (lang, t = P(lang)) => ({
      slides: [S('fact', 'onyx', {
        kicker: t('Did you know?', 'هل تعلم؟'),
        fact: t('24K gold is at least *99.9%* pure', 'نقاوة عيار 24 تبلغ *99.9%* على الأقل'),
        body: t('That is why most gold bars are 24K. Jewellery is usually 18K to 22K, mixed with other metals so it holds its shape.', 'لهذا تكون معظم سبائك الذهب من عيار 24، بينما تُخلط المجوهرات عادةً بمعادن أخرى لتحافظ على شكلها.'),
        source: t('Gold bars are often 999.9 fine (99.99%).', 'سبائك الذهب غالبًا بنقاوة 999.9 (أي 99.99%).'),
      })],
      caption: { text: t('The karat number tells you how much of the metal is gold. 24K is the purest form you can buy.', 'رقم العيار يخبرك بنسبة الذهب في المعدن، وعيار 24 هو الأنقى بين ما يمكنك شراؤه.'), hashtags: tags(lang, t('#GoldFacts', '#معلومات_الذهب')) },
    }),
  },
  {
    id: 'post-myth-budget', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['education'],
    name: { en: 'Myth: gold needs a big budget', ar: 'خرافة: الذهب يحتاج مبلغًا كبيرًا' },
    build: (lang, t = P(lang)) => ({
      slides: [S('myth', 'charcoal', { title: t('Myth or fact?', 'خرافة أم حقيقة؟'), myth: t('You need a lot of money to own gold.', 'امتلاك الذهب يحتاج إلى مبلغ كبير.'), fact: t('You can start with one gram and add more whenever you like.', 'تستطيع البدء بجرام واحد، والإضافة متى شئت.') })],
      caption: { text: t('One of the most common things we hear. Gold works in small amounts too.', 'من أكثر ما نسمعه. الذهب يناسب الكميات الصغيرة أيضًا.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'post-faq-collect', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['faq'],
    name: { en: 'Q&A: collect your bar', ar: 'سؤال: استلام السبيكة' },
    build: (lang, t = P(lang)) => ({
      slides: [S('faq', 'sand', { kicker: t('You asked', 'سألتمونا'), question: t('Can I collect my gold as a real bar?', 'هل أستطيع استلام ذهبي سبيكةً حقيقية؟'), answer: t('Yes. Request collection in the app and pick it up as a certified bar.', 'نعم. اطلب الاستلام من التطبيق، وتسلّم ذهبك سبيكةً معتمدة.') })],
      caption: { text: t('Your gold is a physical bar, not just a number on a screen. When you want to hold it, request collection in the app.', 'ذهبك سبيكة حقيقية وليس مجرد رقم على الشاشة. وعندما ترغب في استلامه، اطلب ذلك من التطبيق.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'post-bars', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['product'], notes: NOTE_PRICE,
    name: { en: 'Choose your bar', ar: 'اختر سبيكتك' },
    build: (lang, t = P(lang)) => ({
      slides: [S('products', 'onyx', { kicker: t('Choose your bar', 'اختر سبيكتك'), title: t('From 1 g to 10 g', 'من 1 جرام إلى 10 جرام'), products: BARS(t), note: t('Illustrative prices. The live price is shown in the app.', 'أسعار توضيحية. السعر المباشر يظهر في التطبيق.'), disclaimer: 'yes' })],
      caption: { text: t(`Four weights, all 24K and certified. Pick the one that fits today.\n\n${PRICE_NOTE.en}`, `أربعة أوزان، كلها عيار 24 ومعتمدة. اختر ما يناسبك اليوم.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#GoldBar', '#سبائك_الذهب')) },
    }),
  },
  {
    id: 'post-trust', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['trust'],
    name: { en: 'Built on trust', ar: 'مبني على الثقة' },
    build: (lang, t = P(lang)) => ({
      slides: [S('list', 'cream', { kicker: t('Why us', 'لماذا نحن'), title: t('Four things you can count on', 'أربعة أمور تطمئنك'), items: [t('Identity verification when you sign up', 'التحقق من الهوية عند التسجيل'), t('Biometric login on your phone', 'الدخول بالبصمة من جوالك'), t('Sharia advisory by Eltizam', 'بإشراف استشاري شرعي من التزام'), t('An Omani platform, based in Muscat', 'منصة عُمانية مقرها مسقط')], bullet: 'check' })],
      caption: { text: t('A few of the things that sit behind every purchase on Goldcom.', 'بعض ما يقف خلف كل عملية شراء في جولدكم.'), hashtags: tags(lang, t('#Muscat', '#مسقط')) },
    }),
  },
  {
    id: 'post-eid', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['occasion'],
    name: { en: 'Eid Mubarak', ar: 'عيد مبارك' },
    build: (lang, t = P(lang)) => ({
      slides: [S('greeting', 'bullion', { kicker: t('From all of us', 'من أسرة جولدكم'), title: t('Eid Mubarak', 'عيد مبارك'), body: t('May your days be bright and your family close.', 'كل عام وأنتم بخير، وأيامكم عامرة بالفرح.') })],
      caption: { text: t('Eid Mubarak from the Goldcom team.', 'عيدكم مبارك من فريق جولدكم.'), hashtags: tags(lang, t('#EidMubarak', '#عيد_مبارك')) },
    }),
  },
  {
    id: 'post-national-day', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['occasion'],
    name: { en: 'National Day', ar: 'العيد الوطني' },
    build: (lang, t = P(lang)) => ({
      slides: [S('greeting', 'onyx', { kicker: t('Oman National Day', 'العيد الوطني العُماني'), title: t('Happy National Day', 'كل عام وعُمان بخير'), body: t('Proud to be an Omani platform, built in Muscat.', 'نفخر بأننا منصة عُمانية من مسقط.') })],
      caption: { text: t('Happy National Day to everyone in Oman.', 'كل عام وعُمان وأهلها بخير.'), hashtags: tags(lang, t('#OmanNationalDay', '#العيد_الوطني')) },
    }),
  },
  {
    id: 'post-ramadan', category: 'post', format: 'square', kind: 'post', tags: ['occasion'],
    name: { en: 'Ramadan Kareem', ar: 'رمضان كريم' },
    build: (lang, t = P(lang)) => ({
      slides: [S('greeting', 'charcoal', { title: t('Ramadan Kareem', 'رمضان كريم'), body: t('Wishing you a blessed month with the people you love.', 'نتمنى لكم شهرًا مباركًا مع من تحبون.') })],
      caption: { text: t('Ramadan Kareem from all of us at Goldcom.', 'رمضان كريم من أسرة جولدكم.'), hashtags: tags(lang, t('#RamadanKareem', '#رمضان_كريم')) },
    }),
  },
  {
    id: 'post-hook', category: 'post', format: 'square', kind: 'post', tags: ['brand'],
    name: { en: 'Real gold. From your phone.', ar: 'ذهب حقيقي. من جوالك.' },
    build: (lang, t = P(lang)) => ({
      slides: [S('kinetic', 'onyx', { lines: t(['Real gold.', 'From your phone.', '*From one gram.*'], ['ذهب حقيقي.', 'من جوالك.', '*من جرام واحد.*']), caption: 'goldcom.om' })],
      caption: { text: t('Certified 24K bars, bought in a few taps.', 'سبائك عيار 24 معتمدة، تشتريها بلمسات قليلة.'), hashtags: tags(lang, t('#GoldApp', '#تطبيق_ذهب')) },
    }),
  },
  {
    id: 'post-download', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['app'],
    name: { en: 'Download the app', ar: 'حمّل التطبيق' },
    build: (lang, t = P(lang)) => ({
      slides: [S('cover', 'onyx', { kicker: t('The app', 'تطبيق جولدكم'), title: t('Gold, *in a few taps*', 'الذهب *بلمسات قليلة*'), subtitle: t('Browse live prices, buy from one gram and send gold as a gift.', 'تابع الأسعار المباشرة، واشترِ من جرام واحد، وأهدِ الذهب لمن تحب.'), visual: 'device', device: 'phone' })],
      caption: { text: t('Goldcom is available on the App Store and Google Play, in Arabic and English.', 'جولدكم متوفر على App Store و Google Play بالعربية والإنجليزية.'), hashtags: tags(lang, t('#GoldApp', '#تطبيق_ذهب')) },
    }),
  },

  // ───────────── Carousels ─────────────
  {
    id: 'carousel-launch', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['brand', 'app'], notes: NOTE_PRICE,
    name: { en: 'Meet Goldcom', ar: 'تعرّف على جولدكم' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('cover', 'onyx', { kicker: t('New', 'جديد من جولدكم'), title: t('Real gold, *from your phone*', 'ذهب حقيقي، *من جوالك*'), subtitle: t('Start from one gram. Track, gift, sell or collect.', 'ابدأ من جرام واحد، ثم تابع ذهبك أو أهدِه أو بِعه أو استلمه.'), visual: 'device', device: 'phone' }),
        S('statement', 'charcoal', { kicker: t('The problem', 'التحدي'), title: t('Buying gold should not feel *complicated*.', 'لا ينبغي أن يكون شراء الذهب *معقدًا*.'), body: t('Prices change, purity is hard to judge and storage is a hassle.', 'الأسعار تتغير، والتأكد من النقاوة صعب، والتخزين متعب.') }),
        S('notification', 'onyx', { kicker: t('Gifting', 'الإهداء'), title: t('Send gold *as a gift*', 'أهدِ الذهب *لمن تحب*'), body: t('Pick a weight, add a message and send it from the app.', 'اختر الوزن، وأضف رسالتك، وأرسله من التطبيق.'), notifTitle: t('You received a gold gift', 'وصلتك هدية ذهب'), notifBody: t('Aisha sent you 2.5 g of 24K gold.', 'أرسلت لك عائشة 2.5 جرام ذهب عيار 24.') }),
        S('screenshot', 'bullion', { title: t('Browse live gold prices', 'تصفح أسعار الذهب الفورية'), caption: t('Indicative prices, updated through the day.', 'أسعار استرشادية تتحدث على مدار اليوم.'), device: 'phone', label: 'yes' }),
        S('steps', 'cream', { kicker: t('How it works', 'كيف يعمل'), title: t('Own gold in three steps', 'امتلك الذهب في ثلاث خطوات'), items: [t('Choose a certified bar from 1 g', 'اختر سبيكة معتمدة من 1 جرام'), t('Lock the price at checkout', 'ثبّت السعر عند الدفع'), t('Hold it, gift it, sell it or collect it', 'احتفظ بها أو أهدِها أو بِعها أو استلمها')] }),
        S('price', 'onyx', { title: t('Know your price before you buy', 'اعرف سعرك قبل أن تشتري'), label: t('Gold 24K · per gram', 'ذهب عيار 24 · للجرام'), price: PRICE(t), change: '+0.42%', time: STAMP(t, '14:05', true) }),
        ctaApp(t, { title: t('Your first gram, in a few taps', 'جرامك الأول بلمسات قليلة'), subtitle: t('Download Goldcom and buy your first gram.', 'حمّل جولدكم واشترِ جرامك الأول.'), disclaimer: 'yes' }),
      ],
      caption: { text: t(`Swipe through to see how Goldcom works, from your first gram to collecting a bar.\n\n${PRICE_NOTE.en}`, `اسحب لترى كيف يعمل جولدكم، من جرامك الأول حتى استلام السبيكة.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang) },
    }),
  },
  {
    id: 'carousel-how', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['education', 'app'], notes: NOTE_PRICE,
    name: { en: 'How buying works', ar: 'كيف تشتري' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('statement', 'onyx', { kicker: t('Step by step', 'خطوة بخطوة'), title: t('Buying gold on Goldcom takes *three steps*.', 'اشترِ الذهب من جولدكم في *ثلاث خطوات*.') }),
        S('products', 'charcoal', { kicker: t('1 · Choose', '1 · اختر'), title: t('Pick a weight', 'اختر الوزن'), products: BARS(t), note: t('Illustrative prices.', 'أسعار توضيحية.'), disclaimer: 'yes' }),
        S('price', 'onyx', { title: t('2 · Lock the price at checkout', '2 · ثبّت السعر عند الدفع'), label: t('Gold 24K · per gram', 'ذهب عيار 24 · للجرام'), price: PRICE(t), change: '+0.42%', time: STAMP(t, '14:05', true) }),
        S('list', 'cream', { kicker: t('3 · Own it', '3 · امتلكه'), title: t('Once it\'s yours, you can:', 'بعد الشراء، يمكنك:'), items: [t('Track it in your portfolio', 'متابعته في محفظتك'), t('Send it as a gift', 'إهداؤه لمن تحب'), t('Sell it when you choose', 'بيعه متى شئت'), t('Collect it as a physical bar', 'استلامه سبيكةً حقيقية')], bullet: 'gem' }),
        ctaApp(t, { title: t('Try it with one gram', 'جرّبه بجرام واحد'), subtitle: t('Pick a bar, lock the price, done.', 'اختر السبيكة، وثبّت السعر، وانتهى الأمر.') }),
      ],
      caption: { text: t(`Choose a bar, lock the price, and it's yours. Bookmark this for later.\n\n${PRICE_NOTE.en}`, `اختر السبيكة، ثبّت السعر، وتصبح لك. احفظ المنشور للرجوع إليه.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#HowToBuyGold', '#شراء_الذهب')) },
    }),
  },
  {
    id: 'carousel-karat', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['education'],
    name: { en: 'Gold karats explained', ar: 'دليل عيارات الذهب' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('statement', 'onyx', { kicker: t('Gold guide', 'دليل الذهب'), title: t('24K, 22K, 21K, 18K. What is the *difference*?', 'ما *الفرق* بين عيار 24 و22 و21 و18؟'), body: t('Swipe for the quick guide.', 'اسحب لترى الدليل السريع.') }),
        S('karat', 'charcoal', { kicker: t('Purity', 'النقاوة'), title: t('What the karat number means', 'ماذا يعني رقم العيار؟'), rows: [t('24K | 99.9 | Bars and coins', 'عيار 24 | 99.9 | السبائك والعملات'), t('22K | 91.6 | Traditional jewellery', 'عيار 22 | 91.6 | المشغولات التقليدية'), t('21K | 87.5 | Everyday jewellery', 'عيار 21 | 87.5 | مجوهرات الاستخدام اليومي'), t('18K | 75.0 | Fine jewellery with stones', 'عيار 18 | 75.0 | المجوهرات المرصّعة بالأحجار')] }),
        S('fact', 'onyx', { kicker: t('Why bars are 24K', 'لماذا السبائك عيار 24'), fact: t('Pure gold is *soft*', 'الذهب الخالص *ليّن*'), body: t('Jewellery mixes in other metals so it keeps its shape. Bars do not need to, so they stay 24K.', 'تُضاف معادن أخرى للمجوهرات لتحافظ على شكلها، أما السبائك فلا تحتاج إلى ذلك، ولهذا تبقى عيار 24.') }),
        S('faq', 'sand', { kicker: t('You asked', 'سألتمونا'), question: t('Which karat does Goldcom sell?', 'ما العيار الذي يبيعه جولدكم؟'), answer: t('Certified 24K bars and coins, from one gram.', 'سبائك وعملات عيار 24 معتمدة، تبدأ من جرام واحد.') }),
        ctaApp(t, { title: t('Shop 24K bars from 1 g', 'تسوّق سبائك عيار 24 من جرام واحد'), subtitle: t('Every bar is 24K and certified.', 'كل السبائك عيار 24 ومعتمدة.'), button: t('See the bars', 'شاهد السبائك') }),
      ],
      caption: { text: t('Save this guide for the next time you shop for gold.', 'احفظ هذا الدليل لمرة قادمة تشتري فيها الذهب.'), hashtags: tags(lang, t('#GoldGuide', '#دليل_الذهب')) },
    }),
  },
  {
    id: 'carousel-gifting', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['gifting', 'occasion'],
    name: { en: 'Gifting gold', ar: 'إهداء الذهب' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('cover', 'bullion', { title: t('A gift that *lasts*', 'هدية *تدوم*'), visual: 'goldbar', barLabel: '5 g' }),
        S('notification', 'onyx', { kicker: t('How it feels', 'كيف تصل'), title: t('The best kind of *notification*', 'أجمل *إشعار* قد يصلك'), body: t('Your gift reaches them in the app.', 'هديتك تصلهم في التطبيق.'), notifTitle: t('You received a gold gift', 'وصلتك هدية ذهب'), notifBody: t('Aisha sent you 2.5 g of 24K gold.', 'أرسلت لك عائشة 2.5 جرام ذهب عيار 24.') }),
        S('steps', 'cream', { kicker: t('How to send', 'طريقة الإرسال'), title: t('Gift gold in three steps', 'أهدِ الذهب في ثلاث خطوات'), items: [t('Choose the weight', 'اختر الوزن'), t('Add a personal message', 'أضف رسالة شخصية'), t('Send it from the app', 'أرسلها من التطبيق')] }),
        S('list', 'charcoal', { kicker: t('For every occasion', 'لكل مناسبة'), title: t('Moments worth gold', 'لحظات تستحق الذهب'), items: [t('Eid', 'العيد'), t('Weddings', 'الأعراس'), t('A new baby', 'مولود جديد'), t('Graduation', 'التخرج')], bullet: 'gem' }),
        ctaApp(t, { title: t('Send your first gold gift', 'أرسل أول هدية ذهب'), subtitle: t('Pick a weight and add your message.', 'اختر الوزن وأضف رسالتك.'), button: t('Gift gold', 'أهدِ ذهبًا') }),
      ],
      caption: { text: t('Gold has always been part of our celebrations. Now you can send it from your phone. 🎁', 'الذهب كان دائمًا جزءًا من مناسباتنا، والآن تستطيع إهداءه من جوالك. 🎁'), hashtags: tags(lang, t('#GoldGift', '#هدية_ذهب')) },
    }),
  },
  {
    id: 'carousel-faq', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['faq'],
    name: { en: 'Your questions, answered', ar: 'أسئلتكم وإجاباتنا' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('statement', 'onyx', { kicker: t('Q&A', 'سؤال وجواب'), title: t('Four questions we *often* get', 'أربعة أسئلة تصلنا *كثيرًا*'), body: t('Swipe for the answers.', 'اسحب لترى الإجابات.') }),
        S('faq', 'charcoal', { kicker: t('Question 1', 'السؤال 1'), question: t('What is the smallest amount I can buy?', 'ما أقل كمية أستطيع شراءها؟'), answer: t('One gram of certified 24K gold.', 'جرام واحد من ذهب عيار 24 المعتمد.') }),
        S('faq', 'charcoal', { kicker: t('Question 2', 'السؤال 2'), question: t('Is the gold real?', 'هل الذهب حقيقي؟'), answer: t('Yes. You buy physical, certified bars, and you can request collection.', 'نعم. أنت تشتري سبائك حقيقية معتمدة، وتستطيع طلب استلامها.') }),
        S('faq', 'charcoal', { kicker: t('Question 3', 'السؤال 3'), question: t('Do I know the price before I pay?', 'هل أعرف السعر قبل الدفع؟'), answer: t('Yes. The price and any fees are shown at checkout before you confirm.', 'نعم. يظهر لك السعر وأي رسوم عند الدفع، قبل التأكيد.') }),
        S('faq', 'charcoal', { kicker: t('Question 4', 'السؤال 4'), question: t('Is it available in Arabic?', 'هل التطبيق متوفر بالعربية؟'), answer: t('Yes. The app works in Arabic and English.', 'نعم. التطبيق يعمل بالعربية والإنجليزية.') }),
        ctaApp(t, { title: t('More questions?', 'لديك سؤال آخر؟'), subtitle: t('Message us or write to support@goldcom.om', 'راسلنا أو اكتب إلى support@goldcom.om'), button: t('Ask us', 'اسألنا') }),
      ],
      caption: { text: t('If your question is not here, ask it in the comments and we will answer.', 'إذا لم تجد سؤالك هنا، اكتبه في التعليقات وسنجيبك.'), hashtags: tags(lang, t('#GoldFAQ', '#أسئلة_الذهب')) },
    }),
  },
  {
    id: 'carousel-myths', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['education'],
    name: { en: 'Gold myths', ar: 'خرافات عن الذهب' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('kinetic', 'onyx', { lines: t(['Three gold myths.', '*Let\'s clear them up.*'], ['ثلاث خرافات عن الذهب.', '*لنوضّحها معًا.*']) }),
        S('myth', 'charcoal', { title: t('Myth 1', 'الخرافة 1'), myth: t('You need a lot of money to own gold.', 'امتلاك الذهب يحتاج إلى مبلغ كبير.'), fact: t('You can start with one gram.', 'تستطيع البدء بجرام واحد.') }),
        S('myth', 'charcoal', { title: t('Myth 2', 'الخرافة 2'), myth: t('Buying gold online means you never see it.', 'شراء الذهب عبر الإنترنت يعني أنك لن تراه أبدًا.'), fact: t('Your bar is physical, and you can request collection.', 'سبيكتك حقيقية، وتستطيع طلب استلامها.') }),
        S('myth', 'charcoal', { title: t('Myth 3', 'الخرافة 3'), myth: t('All gold is the same.', 'كل الذهب متشابه.'), fact: t('Purity varies. 24K is at least 99.9% gold; 18K is 75%.', 'النقاوة تختلف؛ عيار 24 لا يقل عن 99.9% ذهبًا، وعيار 18 نسبته 75%.') }),
        ctaApp(t, { title: t('See it for yourself', 'شاهد بنفسك'), subtitle: t('Start with one gram and see how it works.', 'ابدأ بجرام واحد وتعرّف على طريقة العمل.'), button: t('Open Goldcom', 'افتح جولدكم') }),
      ],
      caption: { text: t('Which one did you believe? Tell us in the comments.', 'أي واحدة كنت تصدقها؟ أخبرنا في التعليقات.'), hashtags: tags(lang, t('#GoldMyths', '#خرافات_الذهب')) },
    }),
  },
  {
    id: 'carousel-first-gram', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['brand'],
    name: { en: 'Start with one gram', ar: 'ابدأ بجرام واحد' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('stat', 'onyx', { kicker: t('Start small', 'ابدأ بالقليل'), stat: t('1 g', '1 جرام'), label: t('is all you need to own real gold', 'يكفي لتمتلك ذهبًا حقيقيًا'), body: t('Certified 24K bars from one gram.', 'سبائك عيار 24 معتمدة تبدأ من جرام واحد.') }),
        S('goal', 'charcoal', { kicker: t('A simple plan', 'خطة بسيطة'), title: t('Save toward a gift, *gram by gram*', 'ادّخر لهدية، *جرامًا بعد جرام*'), value: '62', label: t('6.2 g', '6.2 جرام'), sub: t('of 10 g · example', 'من 10 جرام · مثال'), items: [t('Choose the weight you want', 'اختر الوزن الذي تريده'), t('Buy a little when it suits you', 'اشترِ القليل كلما ناسبك'), t('Track your holdings in the app', 'تابع ذهبك في التطبيق')], disclaimer: 'yes' }),
        S('list', 'cream', { kicker: t('The idea', 'الفكرة'), title: t('Small steps, real gold', 'خطوات صغيرة، ذهب حقيقي'), items: [t('No big upfront amount', 'لا حاجة إلى مبلغ كبير'), t('Every gram is a physical bar', 'كل جرام سبيكة حقيقية'), t('Add more whenever you like', 'أضف متى شئت')], bullet: 'gem' }),
        ctaApp(t, { subtitle: t('One gram today, more whenever you like.', 'جرام اليوم، والمزيد متى شئت.'), disclaimer: 'yes' }),
      ],
      caption: { text: t(`A gift for a wedding, a child's future, or just for you: one gram at a time.\n\n${PRICE_NOTE.en}`, `هدية لعرس، أو لمستقبل طفل، أو لنفسك: جرامًا بعد جرام.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#SaveInGold', '#ادخار_الذهب')) },
    }),
  },
  {
    id: 'carousel-price', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['price', 'education'], notes: NOTE_PRICE,
    name: { en: 'How your price is set', ar: 'كيف يُحدد سعرك' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('statement', 'onyx', { kicker: t('Clear pricing', 'وضوح السعر'), title: t('What decides the price *you pay*?', 'ما الذي يحدد السعر *الذي تدفعه*؟') }),
        S('live-price', 'onyx', { label: t('Gold 24K · per gram', 'ذهب عيار 24 · للجرام'), price: PRICE(t), change: '+0.42%', time: STAMP(t, '14:05'), ticker: TICKER(t) }),
        S('steps', 'cream', { kicker: t('Three parts', 'ثلاثة عناصر'), title: t('What makes up your price', 'مِمَّ يتكوّن سعرك؟'), items: [t('The live gold price', 'سعر الذهب المباشر'), t('The weight you choose', 'الوزن الذي تختاره'), t('Any fees, shown before you confirm', 'أي رسوم، تظهر لك قبل التأكيد')] }),
        ctaApp(t, { title: t('See today\'s price in the app', 'شاهد سعر اليوم في التطبيق'), subtitle: t('The price is locked the moment you pay.', 'يُثبَّت السعر لحظة الدفع.'), disclaimer: 'yes' }),
      ],
      caption: { text: t(`No surprises at checkout: you see the price and any fees before you confirm.\n\n${PRICE_NOTE.en}`, `لا مفاجآت عند الدفع: ترى السعر وأي رسوم قبل التأكيد.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#GoldPrice', '#سعر_الذهب')) },
    }),
  },
  {
    id: 'carousel-compare', category: 'carousel', format: 'feed-portrait', kind: 'carousel', tags: ['brand'],
    name: { en: 'The old way vs Goldcom', ar: 'الطريقة التقليدية مقابل جولدكم' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('comparison', 'onyx', { title: t('Buying gold, then and now', 'شراء الذهب بين الأمس واليوم'), beforeLabel: t('The old way', 'الطريقة التقليدية'), before: [t('Visit several shops', 'زيارة عدة محلات'), t('Ask around for prices', 'السؤال عن الأسعار هنا وهناك'), t('Keep it at home', 'الاحتفاظ به في المنزل')], afterLabel: t('With Goldcom', 'مع جولدكم'), after: [t('Buy from your phone', 'الشراء من جوالك'), t('See the live price first', 'رؤية السعر المباشر أولًا'), t('Hold, gift or collect', 'الاحتفاظ به أو إهداؤه أو استلامه')] }),
        ctaApp(t, { title: t('Buy your gold the new way', 'اشترِ ذهبك بالطريقة الجديدة'), subtitle: t('Certified 24K bars, from one gram.', 'سبائك عيار 24 معتمدة، من جرام واحد.') }),
      ],
      caption: { text: t('Same gold, fewer steps.', 'الذهب نفسه، بخطوات أقل.'), hashtags: tags(lang) },
    }),
  },
  // ───────────── Reels (continuous 9:16 video) ─────────────
  {
    id: 'reel-live-price', category: 'reel', format: 'story', kind: 'reel', tags: ['price', 'live'], notes: NOTE_PRICE,
    name: { en: 'Live price reel', ar: 'ريل السعر المباشر' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('logo-sting', 'onyx', { tagline: t('Gold prices, live', 'أسعار الذهب، مباشرة') }, { duration: 3, bgMotion: 'drift' }),
        S('live-price', 'onyx', { label: t('Gold 24K · per gram', 'ذهب عيار 24 · للجرام'), price: PRICE(t), change: '+0.42%', time: STAMP(t, '14:05'), ticker: TICKER(t) }, { duration: 6, transition: 'zoom', bgMotion: 'drift' }),
        S('cta', 'onyx', { title: t('Check the price before you buy', 'اعرف السعر قبل أن تشتري'), button: t('Open Goldcom', 'افتح جولدكم'), link: 'goldcom.om', disclaimer: 'yes' }, { duration: 4, transition: 'fade' }),
      ],
      caption: { text: t(`Gold moves through the day. Goldcom shows you the indicative price live, so you know where it stands before you buy.\n\n${PRICE_NOTE.en}`, `سعر الذهب يتحرك طوال اليوم، وجولدكم يعرض لك السعر الاسترشادي مباشرة لتعرف أين يقف قبل الشراء.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#GoldPrice', '#سعر_الذهب')) },
    }),
  },
  {
    id: 'reel-hook', category: 'reel', format: 'story', kind: 'reel', tags: ['brand', 'app'], notes: NOTE_PRICE,
    name: { en: 'Real gold in 15 seconds', ar: 'الذهب الحقيقي في 15 ثانية' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('kinetic', 'onyx', { lines: t(['Real gold.', 'From your phone.', '*From one gram.*']  , ['ذهب حقيقي.', 'من جوالك.', '*من جرام واحد.*']) }, { duration: 3.5, bgMotion: 'drift' }),
        S('cover', 'onyx', { kicker: t('24K, from 1 g', 'عيار 24، من جرام واحد'), title: t('Buy certified 24K bars', 'اشترِ سبائك عيار 24 معتمدة'), subtitle: t('In a few taps, in Arabic or English.', 'بلمسات قليلة، بالعربية أو الإنجليزية.'), visual: 'device', device: 'phone' }, { duration: 4, transition: 'slide' }),
        S('products', 'charcoal', { kicker: t('Pick a weight', 'اختر الوزن'), title: t('From 1 g to 10 g', 'من 1 جرام إلى 10 جرام'), products: BARS(t), note: t('Illustrative prices.', 'أسعار توضيحية.'), disclaimer: 'yes' }, { duration: 4, transition: 'wipe' }),
        S('cta', 'onyx', { title: t('Start with one gram', 'ابدأ بجرام واحد'), button: t('Download Goldcom', 'حمّل جولدكم'), link: 'goldcom.om', disclaimer: 'yes' }, { duration: 3.5, transition: 'zoom' }),
      ],
      caption: { text: t(`Fifteen seconds on what Goldcom does. Questions are welcome in the comments.\n\n${PRICE_NOTE.en}`, `خمس عشرة ثانية عن جولدكم. نسعد بأسئلتكم في التعليقات.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang) },
    }),
  },
  {
    id: 'reel-gift', category: 'reel', format: 'story', kind: 'reel', tags: ['gifting', 'occasion'],
    name: { en: 'Gold gift reel', ar: 'ريل هدية الذهب' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('statement', 'bullion', { kicker: t('Eid gifting', 'هدايا العيد'), title: t('A gift that *lasts*.', 'هدية *تدوم*.'), body: t('Real gold, sent from your phone.', 'ذهب حقيقي، ترسله من جوالك.') }, { duration: 3.5 }),
        S('notification', 'onyx', { title: t('It arrives *right away*', 'تصل *في الحال*'), notifTitle: t('You received a gold gift', 'وصلتك هدية ذهب'), notifBody: t('Aisha sent you 2.5 g of 24K gold.', 'أرسلت لك عائشة 2.5 جرام ذهب عيار 24.') }, { duration: 4.5, transition: 'wipe' }),
        S('cover', 'onyx', { kicker: t('Gifting', 'الإهداء'), title: t('Choose a weight, *add a message*', 'اختر الوزن، *وأضف رسالتك*'), visual: 'goldbar', barLabel: '2.5 g' }, { duration: 3.5, transition: 'slide' }),
        S('cta', 'onyx', { title: t('Send your first gold gift', 'أرسل أول هدية ذهب'), button: t('Gift gold', 'أهدِ ذهبًا'), link: 'goldcom.om', disclaimer: 'no' }, { duration: 3.5, transition: 'fade' }),
      ],
      caption: { text: t('For Eid, weddings and new arrivals. Send gold in a few taps. 🎁', 'للعيد والأعراس والمواليد الجدد. أرسل الذهب بلمسات قليلة. 🎁'), hashtags: tags(lang, t('#EidGift', '#هدايا_العيد')) },
    }),
  },
  {
    id: 'reel-how', category: 'reel', format: 'story', kind: 'reel', tags: ['education', 'app'],
    name: { en: 'How it works reel', ar: 'ريل كيف يعمل' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('kinetic', 'onyx', { lines: t(['Three steps', 'to *own gold*.'], ['ثلاث خطوات', 'لتمتلك *الذهب*.']) }, { duration: 3 }),
        S('steps', 'charcoal', { kicker: t('How it works', 'كيف يعمل'), title: t('Own gold in three steps', 'امتلك الذهب في ثلاث خطوات'), items: [t('Choose a certified bar from 1 g', 'اختر سبيكة معتمدة من 1 جرام'), t('Lock the price at checkout', 'ثبّت السعر عند الدفع'), t('Hold it, gift it, sell it or collect it', 'احتفظ بها أو أهدِها أو بِعها أو استلمها')] }, { duration: 5, transition: 'slide' }),
        S('screenshot', 'bullion', { title: t('All in one app', 'كل ذلك في تطبيق واحد'), device: 'phone', label: 'yes' }, { duration: 4, transition: 'zoom' }),
        S('cta', 'onyx', { title: t('Try it with one gram', 'جرّبه بجرام واحد'), button: t('Download Goldcom', 'حمّل جولدكم'), link: 'goldcom.om', disclaimer: 'no' }, { duration: 3.5, transition: 'fade' }),
      ],
      caption: { text: t('Choose, lock the price, own it. That is the whole process.', 'اختر، ثبّت السعر، وامتلك. هذه هي الخطوات كلها.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'reel-karat', category: 'reel', format: 'story', kind: 'reel', tags: ['education'],
    name: { en: 'Karats in 20 seconds', ar: 'العيارات في 20 ثانية' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('fact', 'onyx', { kicker: t('Quick guide', 'دليل سريع'), fact: t('Not all gold is *equal*', 'ليس كل الذهب *متساويًا*'), body: t('The karat tells you how pure it is.', 'العيار يخبرك بنسبة النقاوة.') }, { duration: 3.5, bgMotion: 'drift' }),
        S('karat', 'charcoal', { kicker: t('Purity', 'النقاوة'), title: t('What the karat number means', 'ماذا يعني رقم العيار؟'), rows: [t('24K | 99.9 | Bars and coins', 'عيار 24 | 99.9 | السبائك والعملات'), t('22K | 91.6 | Traditional jewellery', 'عيار 22 | 91.6 | المشغولات التقليدية'), t('21K | 87.5 | Everyday jewellery', 'عيار 21 | 87.5 | مجوهرات الاستخدام اليومي'), t('18K | 75.0 | Fine jewellery with stones', 'عيار 18 | 75.0 | المجوهرات المرصّعة بالأحجار')] }, { duration: 7, transition: 'slide' }),
        S('cta', 'onyx', { title: t('Goldcom sells 24K bars from 1 g', 'جولدكم يبيع سبائك عيار 24 من 1 جرام'), button: t('See the bars', 'شاهد السبائك'), link: 'goldcom.om', disclaimer: 'no' }, { duration: 4, transition: 'zoom' }),
      ],
      caption: { text: t('Save this for the next time someone asks what 21K means.', 'احفظ هذا للمرة القادمة التي يسألك فيها أحد عن معنى عيار 21.'), hashtags: tags(lang, t('#GoldGuide', '#دليل_الذهب')) },
    }),
  },
  {
    id: 'reel-myth', category: 'reel', format: 'story', kind: 'reel', tags: ['education'],
    name: { en: 'Myth buster reel', ar: 'ريل تصحيح الخرافات' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('kinetic', 'charcoal', { lines: t(['“Gold is only', 'for big budgets.”'], ['«الذهب؟', 'للميزانيات الكبيرة فقط»']) }, { duration: 3 }),
        S('myth', 'charcoal', { title: t('Myth or fact?', 'خرافة أم حقيقة؟'), myth: t('You need a lot of money to own gold.', 'امتلاك الذهب يحتاج إلى مبلغ كبير.'), fact: t('You can start with one gram and add more whenever you like.', 'تستطيع البدء بجرام واحد، والإضافة متى شئت.') }, { duration: 5, transition: 'wipe' }),
        S('stat', 'bullion', { stat: t('1 g', '1 جرام'), label: t('is enough to start', 'يكفي للبداية') }, { duration: 3, transition: 'zoom' }),
        S('cta', 'onyx', { title: t('Your first gram starts here', 'جرامك الأول يبدأ هنا'), button: t('Download Goldcom', 'حمّل جولدكم'), link: 'goldcom.om', disclaimer: 'no' }, { duration: 3.5, transition: 'fade' }),
      ],
      caption: { text: t('Heard this one before? Gold works in small amounts too.', 'سمعت هذه العبارة من قبل؟ الذهب يناسب الكميات الصغيرة أيضًا.'), hashtags: tags(lang, t('#GoldMyths', '#خرافات_الذهب')) },
    }),
  },
  {
    id: 'reel-countdown', category: 'reel', format: 'story', kind: 'reel', tags: ['launch', 'live'], notes: 'Set the timer to the real launch time and replace the title with what is launching before you post.',
    name: { en: 'Launch countdown', ar: 'عدّ تنازلي للإطلاق' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('countdown', 'onyx', { kicker: t('Coming soon', 'قريبًا'), title: t('Something *new* is on the way', 'شيء *جديد* في الطريق'), days: '3', hours: '14', minutes: '20', subtitle: t('Turn on notifications so you hear it first.', 'فعّل الإشعارات لتكون أول من يعرف.') }, { duration: 6, bgMotion: 'drift' }),
        S('logo-sting', 'onyx', { tagline: t('Stay tuned', 'ترقبوا') }, { duration: 3.5, transition: 'zoom' }),
      ],
      caption: { text: t('Something new is coming to Goldcom. Turn on post notifications so you don\'t miss it.', 'شيء جديد قادم إلى جولدكم. فعّل تنبيهات المنشورات حتى لا يفوتك.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'reel-logo', category: 'reel', format: 'story', kind: 'reel', tags: ['brand'],
    name: { en: 'Logo intro (4 s)', ar: 'مقدمة الشعار (4 ثوانٍ)' },
    build: (lang, t = P(lang)) => ({
      slides: [S('logo-sting', 'onyx', { tagline: t('Real gold, from your phone', 'ذهب حقيقي، من جوالك') }, { duration: 4, bgMotion: 'drift' })],
      caption: { text: t('Goldcom. Real gold, from your phone.', 'جولدكم. ذهب حقيقي، من جوالك.'), hashtags: tags(lang) },
    }),
  },

  // ───────────── Stories (separate 9:16 frames) ─────────────
  {
    id: 'story-poll', category: 'story', format: 'story', kind: 'story', tags: ['interactive'], notes: NOTE_STICKER('poll'),
    name: { en: 'Poll: gold or cash?', ar: 'تصويت: ذهب أم نقود؟' },
    build: (lang, t = P(lang)) => ({
      slides: [S('sticker', 'cream', { kicker: t('Your turn', 'دورك'), title: t('Eid gift: what would *you* pick?', 'هدية العيد: ماذا *تختار*؟'), sticker: 'poll', native: 'yes', question: t('Gold or cash?', 'ذهب أم نقود؟'), options: [t('Gold', 'ذهب'), t('Cash', 'نقود')] }, { duration: 6 })],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'story-quiz', category: 'story', format: 'story', kind: 'story', tags: ['interactive', 'education'], notes: NOTE_STICKER('quiz'),
    name: { en: 'Quiz: which is purest?', ar: 'اختبار: أيها الأنقى؟' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('sticker', 'onyx', { kicker: t('Quick quiz', 'اختبار سريع'), title: t('Test your *gold knowledge*', 'اختبر *معلوماتك عن الذهب*'), sticker: 'quiz', native: 'yes', question: t('Which karat is the purest?', 'أي عيار هو الأنقى؟'), options: t(['18K', '21K', '24K'], ['عيار 18', 'عيار 21', 'عيار 24']), correct: '3', note: t('Answer in the next story', 'الإجابة في القصة التالية') }, { duration: 6 }),
        S('fact', 'onyx', { kicker: t('Answer', 'الإجابة'), fact: t('*24K*, at least 99.9% gold', '*عيار 24*، بنقاوة لا تقل عن 99.9%'), body: t('Every Goldcom bar is 24K.', 'وكل سبائك جولدكم من عيار 24.') }, { duration: 5 }),
      ],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'story-slider', category: 'story', format: 'story', kind: 'story', tags: ['interactive'], notes: NOTE_STICKER('emoji slider'),
    name: { en: 'Emoji slider', ar: 'شريط التفاعل' },
    build: (lang, t = P(lang)) => ({
      slides: [S('sticker', 'bullion', { kicker: t('Wedding season', 'موسم الأعراس'), title: t('How ready are *you*?', 'ما مدى *استعدادك*؟'), sticker: 'slider', native: 'yes', question: t('Slide to answer', 'حرّك للإجابة'), emoji: '💍', value: '0.8' }, { duration: 6 })],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'story-ask', category: 'story', format: 'story', kind: 'story', tags: ['interactive', 'faq'], notes: NOTE_STICKER('questions'),
    name: { en: 'Ask us anything', ar: 'اسألنا أي شيء' },
    build: (lang, t = P(lang)) => ({
      slides: [S('sticker', 'charcoal', { kicker: t('Q&A this week', 'أسئلة هذا الأسبوع'), title: t('Ask us anything about *gold*', 'اسألنا أي شيء عن *الذهب*'), sticker: 'question', native: 'yes', question: t('Your question', 'سؤالك'), note: t('We\'ll answer in our Stories on Thursday', 'نجيب عن أسئلتكم في القصص يوم الخميس') }, { duration: 6 })],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'story-countdown', category: 'story', format: 'story', kind: 'story', tags: ['interactive', 'occasion'], notes: NOTE_STICKER('countdown'),
    name: { en: 'Countdown to Eid', ar: 'العدّ التنازلي للعيد' },
    build: (lang, t = P(lang)) => ({
      slides: [S('sticker', 'bullion', { kicker: t('Almost there', 'اقترب الموعد'), title: t('Have you picked your *Eid gifts*?', 'هل اخترت *هدايا العيد*؟'), sticker: 'countdown', native: 'yes', question: t('Eid', 'العيد') }, { duration: 6 })],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'story-price', category: 'story', format: 'story', kind: 'story', tags: ['price', 'live'], notes: NOTE_PRICE,
    name: { en: 'Price story', ar: 'قصة السعر' },
    build: (lang, t = P(lang)) => ({
      slides: [S('live-price', 'onyx', { title: t('Gold this morning', 'الذهب هذا الصباح'), label: t('Gold 24K · per gram', 'ذهب عيار 24 · للجرام'), price: PRICE(t), change: '+0.42%', time: STAMP(t, '09:30'), ticker: TICKER(t) }, { duration: 7, bgMotion: 'drift' })],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'story-gift', category: 'story', format: 'story', kind: 'story', tags: ['gifting'], notes: 'Buttons in a Story cannot be tapped. Add a link sticker to goldcom.om on the last frame when you post.',
    name: { en: 'Gift arrived', ar: 'وصلت الهدية' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('notification', 'onyx', { kicker: t('Gifting', 'الإهداء'), title: t('A gold gift, *delivered*', 'هدية ذهب *وصلت*'), notifTitle: t('You received a gold gift', 'وصلتك هدية ذهب'), notifBody: t('Aisha sent you 2.5 g of 24K gold.', 'أرسلت لك عائشة 2.5 جرام ذهب عيار 24.') }, { duration: 6 }),
        S('cta', 'onyx', { title: t('Send a gold gift today', 'أرسل هدية ذهب اليوم'), button: t('Gift gold', 'أهدِ ذهبًا'), link: 'goldcom.om', disclaimer: 'no' }, { duration: 5 }),
      ],
      caption: { text: '', hashtags: [] },
    }),
  },

  // ───────────── Animated posts (single slide, looping) ─────────────
  {
    id: 'motion-live-price', category: 'motion', format: 'feed-portrait', kind: 'motion', tags: ['price', 'live'], notes: NOTE_PRICE,
    name: { en: 'Live price, animated', ar: 'السعر المباشر متحركًا' },
    build: (lang, t = P(lang)) => ({
      slides: [S('live-price', 'onyx', { label: t('Gold 24K · per gram', 'ذهب عيار 24 · للجرام'), price: PRICE(t), change: '+0.42%', time: STAMP(t, '14:05'), ticker: TICKER(t) }, { duration: 8, bgMotion: 'drift' })],
      caption: { text: t(`The 24K price, per gram, as it moved today.\n\n${PRICE_NOTE.en}`, `سعر الذهب عيار 24 للجرام كما تحرك اليوم.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#GoldPrice', '#سعر_الذهب')) },
    }),
  },
  {
    id: 'motion-logo', category: 'motion', format: 'square', kind: 'motion', tags: ['brand'],
    name: { en: 'Logo reveal', ar: 'ظهور الشعار' },
    build: (lang, t = P(lang)) => ({
      slides: [S('logo-sting', 'onyx', { tagline: t('Real gold, from your phone', 'ذهب حقيقي، من جوالك') }, { duration: 5, bgMotion: 'drift' })],
      caption: { text: t('Goldcom. Real gold, from your phone.', 'جولدكم. ذهب حقيقي، من جوالك.'), hashtags: tags(lang) },
    }),
  },
  {
    id: 'motion-eid', category: 'motion', format: 'square', kind: 'motion', tags: ['occasion'],
    name: { en: 'Eid sparkle', ar: 'بريق العيد' },
    build: (lang, t = P(lang)) => ({
      slides: [S('greeting', 'onyx', { kicker: t('From all of us', 'من أسرة جولدكم'), title: t('Eid Mubarak', 'عيد مبارك'), body: t('Wishing you and your family a happy Eid.', 'نتمنى لكم ولعائلاتكم عيدًا سعيدًا.') }, { duration: 6, bgMotion: 'drift' })],
      caption: { text: t('Eid Mubarak. ✨', 'عيدكم مبارك. ✨'), hashtags: tags(lang, t('#EidMubarak', '#عيد_مبارك')) },
    }),
  },
  {
    id: 'motion-bar', category: 'motion', format: 'feed-portrait', kind: 'motion', tags: ['product'],
    name: { en: 'Gold bar shine', ar: 'لمعة السبيكة' },
    build: (lang, t = P(lang)) => ({
      slides: [S('cover', 'bullion', { title: t('Certified *24K* bars', 'سبائك *عيار 24* معتمدة'), subtitle: t('From one gram, on Goldcom.', 'تبدأ من جرام واحد في جولدكم.'), visual: 'goldbar', barLabel: '10 g' }, { duration: 6, extras: [{ type: 'sparkles', x: 0, y: 0, w: 1, h: 0.6, count: 24, seed: 21, under: false }] })],
      caption: { text: t('Every bar on Goldcom is 24K and certified.', 'كل سبيكة في جولدكم عيار 24 ومعتمدة.'), hashtags: tags(lang, t('#GoldBar', '#سبائك_الذهب')) },
    }),
  },
  {
    id: 'motion-countdown', category: 'motion', format: 'feed-portrait', kind: 'motion', tags: ['occasion', 'live'],
    name: { en: 'National Day countdown', ar: 'عدّ تنازلي للعيد الوطني' },
    build: (lang, t = P(lang)) => ({
      slides: [S('countdown', 'onyx', { kicker: t('Oman National Day', 'العيد الوطني العُماني'), title: t('Counting down with *pride*', 'نعدّ الأيام *بفخر*'), days: '7', hours: '10', minutes: '30', subtitle: t('From the Goldcom team in Muscat.', 'من فريق جولدكم في مسقط.') }, { duration: 6 })],
      caption: { text: t('A week to go. Happy early National Day to everyone in Oman.', 'أسبوع واحد ويحل العيد الوطني. كل عام وعُمان بخير.'), hashtags: tags(lang, t('#OmanNationalDay', '#العيد_الوطني')) },
    }),
  },
  {
    id: 'motion-goal', category: 'motion', format: 'feed-portrait', kind: 'motion', tags: ['brand'],
    name: { en: 'Goal ring', ar: 'دائرة الهدف' },
    build: (lang, t = P(lang)) => ({
      slides: [S('goal', 'charcoal', { kicker: t('A simple plan', 'خطة بسيطة'), title: t('Save toward a gift, *gram by gram*', 'ادّخر لهدية، *جرامًا بعد جرام*'), value: '62', label: t('6.2 g', '6.2 جرام'), sub: t('of 10 g · example', 'من 10 جرام · مثال'), items: [t('Choose the weight you want', 'اختر الوزن الذي تريده'), t('Buy a little when it suits you', 'اشترِ القليل كلما ناسبك'), t('Track your holdings in the app', 'تابع ذهبك في التطبيق')], disclaimer: 'yes' }, { duration: 6 })],
      caption: { text: t('Big goals get easier when you take them one gram at a time.', 'الأهداف الكبيرة تصبح أسهل حين تقطعها جرامًا بعد جرام.'), hashtags: tags(lang, t('#SaveInGold', '#ادخار_الذهب')) },
    }),
  },
  {
    id: 'motion-chat', category: 'motion', format: 'feed-portrait', kind: 'motion', tags: ['faq'],
    name: { en: 'Chat Q&A', ar: 'محادثة سؤال وجواب' },
    build: (lang, t = P(lang)) => ({
      slides: [S('chat', 'onyx', { kicker: t('You asked', 'سألتمونا'), title: t('Two questions we hear a lot', 'سؤالان يصلاننا كثيرًا'), messages: t(['What is the smallest amount I can buy?', '> One gram of 24K gold.', 'And can I hold the actual bar?', '> Yes. You can request collection in the app.'], ['ما أقل كمية أستطيع شراءها؟', '> جرام واحد من ذهب عيار 24.', 'وهل أستطيع استلام السبيكة نفسها؟', '> نعم، اطلب الاستلام من التطبيق.']) }, { duration: 7 })],
      caption: { text: t('Two of the most common questions in our inbox, answered.', 'سؤالان من أكثر ما يصلنا، مع الإجابة.'), hashtags: tags(lang) },
    }),
  },


  // ───────────── More interactive designs ─────────────
  {
    id: 'reel-quiz', category: 'reel', format: 'story', kind: 'reel', tags: ['interactive', 'education'], notes: NOTE_STICKER('quiz'),
    name: { en: 'Quiz reel: purest karat', ar: 'ريل اختبار: أنقى عيار' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('kinetic', 'onyx', { lines: t(['Quick quiz.', '*Think you know your karats?*'], ['اختبار سريع.', '*هل تعرف العيارات جيدًا؟*']) }, { duration: 3 }),
        S('sticker', 'cream', { kicker: t('Pick one', 'اختر إجابة'), title: t('Which karat is the *purest*?', 'أي عيار هو *الأنقى*؟'), sticker: 'quiz', question: t('Your answer', 'إجابتك'), options: t(['18K', '21K', '24K'], ['عيار 18', 'عيار 21', 'عيار 24']), correct: '3', native: 'yes' }, { duration: 5, transition: 'slide' }),
        S('fact', 'onyx', { kicker: t('The answer', 'الإجابة'), fact: t('*24K*, at least 99.9% gold', '*عيار 24*، بنقاوة 99.9% على الأقل'), body: t('Every Goldcom bar is 24K.', 'وكل سبائك جولدكم من عيار 24.') }, { duration: 4, transition: 'zoom' }),
      ],
      caption: { text: t('Did you get it right? Tell us in the comments.', 'هل أجبت إجابة صحيحة؟ أخبرنا في التعليقات.'), hashtags: tags(lang, t('#GoldGuide', '#دليل_الذهب')) },
    }),
  },
  {
    id: 'motion-ticker', category: 'motion', format: 'square', kind: 'motion', tags: ['price', 'live'], notes: NOTE_PRICE,
    name: { en: 'Price ticker, animated', ar: 'شريط الأسعار متحركًا' },
    build: (lang, t = P(lang)) => ({
      slides: [S('live-price', 'charcoal', { label: t('Gold 24K · per gram', 'ذهب عيار 24 · للجرام'), price: PRICE(t), change: '+0.42%', time: STAMP(t, '11:20'), ticker: TICKER(t) }, { duration: 8, bgMotion: 'drift' })],
      caption: { text: t(`Where gold stands this morning, per gram and per bar.\n\n${PRICE_NOTE.en}`, `أين يقف الذهب هذا الصباح، للجرام وللسبيكة.\n\n${PRICE_NOTE.ar}`), hashtags: tags(lang, t('#GoldPrice', '#سعر_الذهب')) },
    }),
  },
  {
    id: 'motion-notification', category: 'motion', format: 'feed-portrait', kind: 'motion', tags: ['gifting'],
    name: { en: 'Gift notification, animated', ar: 'إشعار الهدية متحركًا' },
    build: (lang, t = P(lang)) => ({
      slides: [S('notification', 'onyx', { kicker: t('Gifting', 'الإهداء'), title: t('Gold that arrives *as a message*', 'ذهب يصل *في رسالة*'), body: t('Gold gifts arrive the moment they are sent.', 'هدايا الذهب تصل لحظة إرسالها.'), notifTitle: t('You received a gold gift', 'وصلتك هدية ذهب'), notifBody: t('Aisha sent you 2.5 g of 24K gold.', 'أرسلت لك عائشة 2.5 جرام ذهب عيار 24.') }, { duration: 6 })],
      caption: { text: t('Imagine opening your phone to this. 🎁', 'تخيّل أن تفتح جوالك فتجد هذا الإشعار. 🎁'), hashtags: tags(lang, t('#GoldGift', '#هدية_ذهب')) },
    }),
  },
  {
    id: 'story-how', category: 'story', format: 'story', kind: 'story', tags: ['education', 'app'], notes: 'Buttons in a Story cannot be tapped. Add a link sticker to goldcom.om on the last frame when you post.',
    name: { en: 'How it works, in Stories', ar: 'كيف يعمل، في القصص' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('statement', 'onyx', { kicker: t('Step by step', 'خطوة بخطوة'), title: t('How to buy *your first gram*', 'كيف تشتري *جرامك الأول*') }, { duration: 4 }),
        S('steps', 'charcoal', { kicker: t('How it works', 'كيف يعمل'), title: t('Three steps', 'ثلاث خطوات'), items: [t('Choose a certified bar from 1 g', 'اختر سبيكة معتمدة من 1 جرام'), t('Lock the price at checkout', 'ثبّت السعر عند الدفع'), t('Hold it, gift it, sell it or collect it', 'احتفظ بها أو أهدِها أو بِعها أو استلمها')] }, { duration: 6 }),
        S('cta', 'onyx', { title: t('Ready for your first gram?', 'جاهز لجرامك الأول؟'), button: t('Download Goldcom', 'حمّل جولدكم'), link: 'goldcom.om', disclaimer: 'no' }, { duration: 5 }),
      ],
      caption: { text: '', hashtags: [] },
    }),
  },
  {
    id: 'post-gift-guide', category: 'post', format: 'feed-portrait', kind: 'post', tags: ['gifting', 'occasion'],
    name: { en: 'Gold gift guide', ar: 'دليل هدايا الذهب' },
    build: (lang, t = P(lang)) => ({
      slides: [S('list', 'cream', { kicker: t('Gift guide', 'دليل الهدايا'), title: t('How much gold *for which occasion*?', 'كم من الذهب *لكل مناسبة*؟'), items: [t('Eid gift: 1 g or 2.5 g', 'عيدية: 1 أو 2.5 جرام'), t('A new baby: 1 g', 'مولود جديد: 1 جرام'), t('Graduation: 2.5 g', 'تخرّج: 2.5 جرام'), t('A wedding: 5 g or 10 g', 'عرس: 5 أو 10 جرام')], bullet: 'gem' })],
      caption: { text: t('A starting point, not a rule. Every gift is personal. Which occasion are you shopping for?', 'مجرد اقتراحات، فكل هدية لها خصوصيتها. لأي مناسبة تبحث عن هدية؟'), hashtags: tags(lang, t('#GoldGift', '#هدية_ذهب')) },
    }),
  },

  // ───────────── Video ─────────────
  {
    id: 'video-brand', category: 'video', format: 'video', kind: 'video', tags: ['brand'],
    name: { en: 'Brand film 16:9 (web, YouTube)', ar: 'فيلم تعريفي 16:9 (الموقع ويوتيوب)' },
    build: (lang, t = P(lang)) => ({
      slides: [
        S('logo-sting', 'onyx', { tagline: t('Real gold, from your phone', 'ذهب حقيقي، من جوالك') }, { duration: 3.5, bgMotion: 'drift' }),
        S('kinetic', 'charcoal', { lines: t(['Gold has always', 'meant *family*.'], ['للذهب مكانة', 'في كل *بيت*.']) }, { duration: 3.5, transition: 'fade' }),
        S('cover', 'onyx', { kicker: t('The app', 'التطبيق'), title: t('Now it fits *in your pocket*', 'واليوم *في جيبك*'), subtitle: t('Certified 24K bars from one gram.', 'سبائك عيار 24 معتمدة تبدأ من جرام واحد.'), visual: 'device', device: 'phone' }, { duration: 4.5, transition: 'slide' }),
        S('steps', 'cream', { kicker: t('How it works', 'كيف يعمل'), title: t('Choose. Lock the price. Own it.', 'اختر. ثبّت السعر. امتلك.'), items: [t('Choose a certified bar from 1 g', 'اختر سبيكة معتمدة من 1 جرام'), t('Lock the price at checkout', 'ثبّت السعر عند الدفع'), t('Hold it, gift it, sell it or collect it', 'احتفظ بها أو أهدِها أو بِعها أو استلمها')] }, { duration: 5, transition: 'wipe' }),
        S('cta', 'onyx', { title: t('Start with one gram', 'ابدأ بجرام واحد'), subtitle: t('On the App Store and Google Play.', 'على App Store و Google Play.'), button: t('Download Goldcom', 'حمّل جولدكم'), link: 'goldcom.om', disclaimer: 'no' }, { duration: 4, transition: 'zoom' }),
      ],
      caption: { text: t('Goldcom in 20 seconds.', 'جولدكم في 20 ثانية.'), hashtags: tags(lang) },
    }),
  },
];

export const libraryItem = (id) => LIBRARY.find((i) => i.id === id);

/** Build a ready-to-edit document from a library item. */
export function buildLibraryDoc(item, lang = 'ar') {
  const built = item.build(lang);
  const doc = createDocument({ name: item.name[lang] || item.name.en, format: item.format, kind: item.kind, lang, caption: built.caption });
  doc.source = { type: 'library', item: item.id };
  if (item.notes) doc.notes = item.notes;
  doc.slides = built.slides.map((s) => createSlide({ pattern: 'top', duration: 4, transition: 'fade', ...s, layers: [] }));
  return applyAllTemplates(normalizeDocument(doc));
}
