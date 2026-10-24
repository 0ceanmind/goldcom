// Starter packs: ready-made, on-brand slide sets. Each returns { name, format, kind, lang, slides: [{ template, theme, content }] }.
export const STARTERS = {
  launch: {
    name: 'App launch carousel',
    description: '7-slide launch carousel: cover, problem, gifting, live screen, steps, price, call to action.',
    kind: 'carousel', format: 'feed-portrait',
    build: (lang) => ({
      ar: [
        { template: 'cover', theme: 'onyx', content: { kicker: 'جديد من جولدكم', title: 'ذهب حقيقي، *من جوالك*', subtitle: 'ابدأ من جرام واحد. تابع ذهبك، أهدِه، بِعه أو استلمه.', visual: 'device', device: 'phone' } },
        { template: 'statement', theme: 'charcoal', content: { kicker: 'التحدي', title: 'شراء الذهب لا يجب أن يكون *معقدًا*.', body: 'الأسعار تتغير، والتحقق من النقاء صعب، والتخزين غير مريح.' } },
        { template: 'feature', theme: 'onyx', content: { icon: 'gift', kicker: 'الإهداء', title: 'أهدِ ذهبًا حقيقيًا في ثوانٍ', body: 'اختر الوزن، أضف رسالتك، وتصل هديتك فورًا.', device: 'phone' } },
        { template: 'screenshot', theme: 'bullion', content: { title: 'تصفح أسعار الذهب الفورية', caption: 'أسعار استرشادية تتحدث على مدار اليوم.', device: 'phone', label: 'yes' } },
        { template: 'steps', theme: 'cream', content: { kicker: 'كيف تعمل', title: 'امتلك الذهب في ثلاث خطوات', items: ['اختر سبيكة معتمدة من 1 جرام', 'ثبّت السعر عند الشراء', 'احتفظ بها، أهدِها، بِعها أو استلمها'] } },
        { template: 'price', theme: 'onyx', content: { title: 'اعرف سعرك قبل أن تشتري', label: 'ذهب عيار 24 · للجرام', price: '31.204 ر.ع.', change: '+0.42%', time: 'استرشادي · 24 أكتوبر 2026 · 14:05' } },
        { template: 'cta', theme: 'onyx', content: { title: 'ابدأ قصتك مع الذهب اليوم', subtitle: 'حمّل جولدكم من App Store و Google Play.', button: 'حمّل التطبيق', link: 'goldcom.om', disclaimer: 'yes' } },
      ],
      en: [
        { template: 'cover', theme: 'onyx', content: { kicker: 'New on Goldcom', title: 'Real gold, *from your phone*', subtitle: 'Start from one gram. Track, gift, sell or collect.', visual: 'device', device: 'phone' } },
        { template: 'statement', theme: 'charcoal', content: { kicker: 'The problem', title: 'Buying gold should not feel *complicated*.', body: 'Prices change, purity is hard to judge and storage is inconvenient.' } },
        { template: 'feature', theme: 'onyx', content: { icon: 'gift', kicker: 'Gifting', title: 'Send real gold in seconds', body: 'Choose a weight, add a message and your gift arrives instantly.', device: 'phone' } },
        { template: 'screenshot', theme: 'bullion', content: { title: 'Browse live gold prices', caption: 'Indicative prices update throughout the day.', device: 'phone', label: 'yes' } },
        { template: 'steps', theme: 'cream', content: { kicker: 'How it works', title: 'Own gold in three steps', items: ['Choose a certified bar from 1 g', 'Lock the price at checkout', 'Hold, gift, sell or collect'] } },
        { template: 'price', theme: 'onyx', content: { title: 'Know your price before you buy', label: 'Gold 24K · per gram', price: 'OMR 31.204', change: '+0.42%', time: 'Indicative · 24 Oct 2026 · 14:05' } },
        { template: 'cta', theme: 'onyx', content: { title: 'Start your gold story today', subtitle: 'Download Goldcom on the App Store and Google Play.', button: 'Download the app', link: 'goldcom.om', disclaimer: 'yes' } },
      ],
    })[lang],
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
    description: 'Single post with a price card, chart and the mandatory disclaimer.',
    kind: 'post', format: 'feed-portrait',
    build: (lang) => ({
      ar: [{ template: 'price', theme: 'onyx', content: { title: 'سعر الذهب اليوم', label: 'ذهب عيار 24 · للجرام', price: '31.204 ر.ع.', change: '+0.42%', time: 'استرشادي · 24 أكتوبر 2026 · 14:05' } }],
      en: [{ template: 'price', theme: 'onyx', content: { title: 'Gold today', label: 'Gold 24K · per gram', price: 'OMR 31.204', change: '+0.42%', time: 'Indicative · 24 Oct 2026 · 14:05' } }],
    })[lang],
  },
  gift: {
    name: 'Gifting reel',
    description: 'Short animated story video for gifting occasions (Eid, weddings, newborns).',
    kind: 'reel', format: 'story',
    build: (lang) => ({
      ar: [
        { template: 'statement', theme: 'bullion', duration: 3.5, content: { kicker: 'هدية العيد', title: 'هدية *تدوم*.', body: 'أهدِ من تحب ذهبًا حقيقيًا.' } },
        { template: 'cover', theme: 'onyx', duration: 4, transition: 'wipe', content: { kicker: 'الإهداء', title: 'أرسل الذهب *في ثوانٍ*', subtitle: 'اختر الوزن وأضف رسالتك.', visual: 'goldbar', barLabel: '5 g' } },
        { template: 'cta', theme: 'onyx', duration: 4, transition: 'fade', content: { title: 'أهدِ من تحب ذهبًا حقيقيًا', button: 'أهدِ ذهبًا', link: 'goldcom.om', disclaimer: 'no' } },
      ],
      en: [
        { template: 'statement', theme: 'bullion', duration: 3.5, content: { kicker: 'Eid gifting', title: 'A gift that *lasts*.', body: 'Gift real gold to the people you love.' } },
        { template: 'cover', theme: 'onyx', duration: 4, transition: 'wipe', content: { kicker: 'Gifting', title: 'Send gold *in seconds*', subtitle: 'Choose a weight and add your message.', visual: 'goldbar', barLabel: '5 g' } },
        { template: 'cta', theme: 'onyx', duration: 4, transition: 'fade', content: { title: 'Gift real gold to the people you love', button: 'Gift gold', link: 'goldcom.om', disclaimer: 'no' } },
      ],
    })[lang],
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
