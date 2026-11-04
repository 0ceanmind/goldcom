// Curated briefs, not colour-swapped copies. Each entry has its own premise and copy.
// Arabic is conversational Omani; approved legal text remains exact and formal.
import { ART_DIRECTIONS } from './creative.js';

const stills = [
  ['one-small-step','editorial','Your pace. Your first gram.','على راحتك، أول جرام','weight','No need to rush the decision.','خذ راحتك قبل لا تقرّر.'],
  ['gift-without-guessing','paper-cut','Skip guessing their size','ما يحتاج تخمّن مقاسهم','gift','A different way to think about gifts.','خلّ هديتك هالمرة بفكرة غير.'],
  ['purity-decoded','mosaic','What does 24K mean?','وش يعني عيار 24؟','purity','Karat describes purity, not weight.','العيار للنقاء، والجرام للوزن.'],
  ['weight-vs-price','blueprint','Grams and rials are different','الجرام غير عن الريال','weight','One measures weight. One measures price.','واحد يقيس الوزن، والثاني السعر.'],
  ['pause-before-pay','ticket','Read it before you confirm','اقرأها قبل لا تأكّد','process','Check the weight, price and fees.','شيّك الوزن والسعر والرسوم.'],
  ['two-sides','contrast','A price can move both ways','السعر يطلع وينزل','risk','No promise of a future gain.','ما حد يضمن لك سعر باكر.'],
  ['family-thread','weave','Some gifts connect generations','هدايا توصل بين الأجيال','connection','A thought for someone close.','فكرة هدية لحد غالي عليك.'],
  ['ask-first','comic','Ask the small questions','اسأل، حتى لو سؤال بسيط','conversation','What would you like to understand first?','وش أول شي ودّك تفهمه؟'],
  ['weight-not-size','blueprint','Weight tells a different story','الوزن له حكاية ثانية','scale','A bigger picture is not a heavier bar.','كبر الصورة ما يعني وزن أكثر.'],
  ['all-your-options','orbit','Know your options first','اعرف خياراتك أول','choice','Buy, gift, sell or request collection.','شراء، إهداء، بيع أو طلب استلام.'],
  ['birthday-thought','ticket','A birthday beyond the usual','عيد ميلاد بفكرة غير','gift','Start with the person, then the present.','فكّر في الشخص قبل الهدية.'],
  ['no-perfect-day','calendar','There is no promised perfect day','ما نعرف سعر باكر','risk','A calendar cannot predict gold prices.','التقويم ما يعرف سعر الذهب الجاي.'],
  ['gold-vs-jewellery','contrast','Gold is not always jewellery','الذهب مب دايم حُلي','purity','A bar and a bracelet serve different purposes.','السبيكة والإسوارة، لكل وحدة غرض.'],
  ['the-review-screen','diagram','Three things worth checking','ثلاثة أشياء شيّك عليها','process','Weight. Price. Fees.','الوزن. السعر. الرسوم.',['Weight','Price','Fees'],['الوزن','السعر','الرسوم']],
  ['occasion-not-pressure','paper-cut','An occasion, not an obligation','مناسبة، مب واجب','gift','Choose what suits you and your budget.','اختار اللي يناسبك ويناسب ميزانيتك.'],
  ['one-gram-explained','construct','Small weight. Clear meaning.','وزن بسيط، ومعنى واضح','weight','1 gram is a unit of weight.','1 جرام وحدة لقياس الوزن.'],
  ['learn-before-buying','editorial','Understanding comes first','الفهم يجي أول','conversation','Save your questions before your next decision.','دوّن أسئلتك قبل قرارك الجاي.'],
  ['the-recipient','weave','Who came to mind?','من طرى على بالك؟','connection','A mother, a sister, a friend.','أمك، أختك، أو ربيعك.'],
  ['a-number-not-a-promise','mosaic','A number is not a promise','الرقم مب وعد','risk','Yesterday’s price cannot promise tomorrow’s.','سعر أمس ما يضمن سعر باكر.'],
  ['slow-down','comic','Take another look','تمهّل وشيّك مرة ثانية','process','There is time to read before confirming.','عندك وقت تقرأ قبل لا تأكّد.'],
  ['keep-the-receipt','ticket','Keep the details together','خلّ التفاصيل عندك','layers','A simple habit for any purchase.','عادة بسيطة لأي شي تشتريه.'],
  ['twenty-four','mosaic','Purity has a name','النقاء له عيار','purity','24K describes the gold’s karat.','24K يعني عيار الذهب.'],
  ['more-than-packaging','paper-cut','The thought outlasts the wrapping','المعنى يبقى بعد التغليف','gift','For someone you know by heart.','الهدية بمعناها، مب بس شكلها.'],
  ['read-the-label','blueprint','Read what is on the bar','اقرأ اللي على السبيكة','weight','Weight and purity describe different things.','الوزن والنقاء، كل واحد يخبرك شي.'],
  ['no-rush','calendar','Not everything needs deciding today','مب كل شي لازم اليوم','time','Make room to understand.','عط نفسك وقت تفهم.'],
  ['questions-to-save','diagram','Keep these questions handy','خلّ هالأسئلة معك','conversation','What weight? What fees? What next?','كم الوزن؟ كم الرسوم؟ وبعدين؟',['Weight?','Fees?','Next?'],['الوزن؟','الرسوم؟','بعدين؟']],
  ['meaningful-distance','weave','Close, even from afar','قريب ولو من بعيد','connection','Think of the people you want to celebrate.','فكّر في الناس اللي ودّك تفرّحهم.'],
  ['choose-the-weight','orbit','Start with the weight','ابدأ بالوزن','choice','Compare the available options in the app.','قارن الأوزان الموجودة في التطبيق.'],
  ['your-own-reason','editorial','What is your reason?','وش السبب عندك؟','choice','A gift, a first purchase, or learning more.','هدية، أول شراء، أو بس تتعلّم أكثر.'],
  ['not-a-race','construct','There is no finish line','ما فيه سباق','time','Choose your own pace.','امشِ على راحتك.'],
  ['gift-message','comic','What would your message say?','وش بتكتب في الرسالة؟','conversation','The words can be the most personal part.','يمكن كلامك يكون أحلى شي فيها.'],
  ['price-snapshot','blueprint','A snapshot has a date','كل لقطة لها تاريخ','risk','Check when a price was recorded.','شيّك متى تسجّل السعر.'],
];

const sequences = [
  { id:'carousel-label', kind:'carousel', family:'blueprint', motif:'purity', name:['Read a gold label','نفهم ختم الذهب'], beats:[['What is the stamp telling you?','وش يقول لك الختم؟'],['Karat tells you purity','العيار يخبرك عن النقاء'],['Grams tell you weight','الجرام يخبرك عن الوزن'],['Two labels. Two meanings.','ختمين، ومعنيين مختلفين']] },
  { id:'carousel-gift', kind:'carousel', family:'paper-cut', motif:'gift', name:['A thoughtful gift, in layers','هدية نفكّر فيها شوي'], beats:[['Start with who, not what','ابدأ بمن، مب بماذا'],['What would matter to them?','وش اللي يهمّهم؟'],['Choose within your budget','اختار على قد ميزانيتك'],['Add words only you would say','اكتب كلام ما يقوله غيرك']] },
  { id:'carousel-before-buy', kind:'carousel', family:'diagram', motif:'process', name:['Before you confirm','قبل لا تأكّد'], beats:[['Pause on the details','وقّف شوي عند التفاصيل'],['Check the weight','شيّك الوزن'],['Read the price and fees','اقرأ السعر والرسوم'],['Decide when you understand','قرّر يوم تكون فاهم']] },
  { id:'carousel-misconceptions', kind:'carousel', family:'contrast', motif:'risk', name:['Gold, without the assumptions','ذهب بدون افتراضات'], beats:[['Let us separate a few things','خلّنا نفرّق بين كم شي'],['Weight is not purity','الوزن مب هو النقاء'],['A past price is not a forecast','سعر أمس مب توقّع لباكر'],['A question is worth asking','اسأل، سؤالك له قيمة']] },
  { id:'carousel-budget', kind:'carousel', family:'calendar', motif:'time', name:['Make room to decide','عط القرار وقته'], beats:[['You do not need to rush','ما يحتاج تستعجل'],['Start with your budget','ابدأ بميزانيتك'],['Leave room for other needs','خلّ مجال لباقي احتياجاتك'],['The decision stays yours','القرار يظل قرارك']] },
  { id:'carousel-sisters', kind:'carousel', family:'comic', motif:'conversation', name:['Two sisters, one question','أختين وسؤال'], beats:[['What should we get Mum?','وش نهدي الوالدة؟'],['Something she would choose?','شي هي بتختاره؟'],['Something with a message?','ولا شي مع رسالة؟'],['Start by thinking of her','خلّونا نفكّر فيها أول']] },
  { id:'reel-choices', kind:'reel', family:'orbit', motif:'choice', name:['Four paths, one decision','أربع خيارات وقرارك'], beats:[['What do you want to do?','وش ودّك تسوّي؟'],['Buy, gift, sell, collect','شراء، إهداء، بيع، استلام'],['Explore the options in Goldcom','شوف الخيارات في جولدكم']] },
  { id:'reel-stamp', kind:'reel', family:'blueprint', motif:'purity', name:['Anatomy of a stamp','نقرّب على الختم'], beats:[['Look a little closer','خلّنا نقرّب شوي'],['This describes purity','هنا تعرف النقاء'],['This describes weight','وهنا تعرف الوزن'],['Different details. Clearer choice.','تفاصيل مختلفة، واختيار أوضح']] },
  { id:'reel-no-predictions', kind:'reel', family:'construct', motif:'risk', name:['Tomorrow is not on the receipt','باكر مب مكتوب في الفاتورة'], beats:[['Can this tell you tomorrow?','هذا يخبرك عن باكر؟'],['Prices move in both directions','الأسعار تطلع وتنزل'],['Read the present carefully','اقرأ تفاصيل اليوم زين']] },
  { id:'reel-gift-note', kind:'reel', family:'weave', motif:'connection', name:['Write the note first','اكتب الرسالة أول'], beats:[['Before choosing a gift…','قبل لا تختار الهدية…'],['Who are you thinking of?','من في بالك؟'],['Say it in your words','قولها بكلامك']] },
  { id:'story-quiz-weight', kind:'story', family:'mosaic', motif:'weight', name:['Weight or purity?','وزن ولا نقاء؟'], beats:[['What does a gram measure?','الجرام يقيس وش؟'],['Weight, not purity','الوزن، مب النقاء'],['Karat answers the other question','والعيار يجاوب السؤال الثاني']] },
  { id:'story-ask-us', kind:'story', family:'comic', motif:'conversation', name:['Your question belongs here','سؤالك مكانه هنا'], beats:[['What are you wondering?','وش في خاطرك تسأل؟'],['No question is too small','ولا سؤال بسيط علينا'],['Keep it for our next Q&A','خلّه لسوالفنا الجاية']] },
  { id:'story-gifting-poll', kind:'story', family:'ticket', motif:'gift', name:['Whose occasion is next?','مناسبة من الجاية؟'], beats:[['A birthday or graduation?','عيد ميلاد ولا تخرّج؟'],['Who are you celebrating?','من بتحتفل فيه؟'],['Think of their kind of gift','فكّر في الهدية اللي تعجبهم']] },
  { id:'story-weekend', kind:'story', family:'editorial', motif:'time', name:['A weekend to understand','وقت الويكند نفهم أكثر'], beats:[['One question for the weekend','سؤال واحد للويكند'],['What would you like to learn?','وش ودّك تتعلّم؟'],['Start with the basics','خلّ البداية من الأساس']] },
  { id:'video-gold-vocabulary', kind:'video', family:'diagram', motif:'purity', name:['Gold vocabulary, illustrated','كلمات الذهب بالصور'], beats:[['Three words. Different meanings.','ثلاث كلمات، معاني مختلفة'],['Gram: weight','جرام: الوزن'],['Karat: purity','عيار: النقاء'],['Price: what it costs now','السعر: كم قيمته الحين']] },
  { id:'video-gifting-film', kind:'video', family:'paper-cut', motif:'gift', name:['A gift begins with a thought','الهدية تبدأ بفكرة'], beats:[['It begins with someone','تبدأ بشخص في بالك'],['Then a reason to celebrate','وبعدها سبب نفرح فيه'],['Then a message of your own','ورسالة من عندك'],['Make it personal','خلّها تشبهك']] },
];

const loops = [
  ['motion-woven','weave','Connections, woven','خيوط تجمعنا','connection'],
  ['motion-mosaic','mosaic','One idea. Many pieces.','فكرة وحدة، وقطع كثيرة','purity'],
  ['motion-orbits','orbit','Your options, connected','خياراتك مترابطة','choice'],
  ['motion-paper','paper-cut','A thought taking shape','فكرة تاخذ شكلها','gift'],
  ['motion-calendar','calendar','Make time to understand','عط الفهم وقته','time'],
  ['motion-steps','construct','Every step is your choice','كل خطوة باختيارك','scale'],
  ['motion-ticket','ticket','For someone on your mind','لحد في بالك','gift'],
  ['motion-blueprint','blueprint','Closer to the details','أقرب للتفاصيل','weight'],
];

const pick = (lang, pair) => pair[lang === 'ar' ? 1 : 0];
const moods = { 'photo-story':'onyx', 'painted-story':'cream', 'paper-cut':'cream', editorial:'onyx', diagram:'cream', comic:'charcoal', ticket:'cream', mosaic:'onyx', orbit:'onyx', blueprint:'charcoal', calendar:'cream', weave:'onyx', contrast:'cream', construct:'onyx' };
const paired = { 'paper-cut':'ticket', editorial:'weave', diagram:'blueprint', comic:'paper-cut', ticket:'comic', mosaic:'contrast', orbit:'diagram', blueprint:'mosaic', calendar:'editorial', weave:'orbit', contrast:'diagram', construct:'blueprint' };

function item({ id, kind='post', family, motif, name, beats, detail, labels }) {
  return {
    id, category: kind, kind, medium: family, tags: [family, motif, '2d', 'illustration'],
    format: ['reel','story'].includes(kind) ? 'story' : kind === 'video' ? 'video' : 'feed-portrait',
    name: { en: name[0], ar: name[1] },
    build(lang) {
      return {
        slides: beats.map((beat, i) => ({
          template: i % 2 ? paired[family] : family,
          theme: moods[family], pattern: 'none', duration: kind === 'motion' ? 6 : 4,
          transition: i ? 'push' : 'fade',
          content: { title: pick(lang,beat), detail: i === 0 && detail ? pick(lang,detail) : '', image:ART_DIRECTIONS[family]?.image||'', motif, seed: [...id].reduce((n,c)=>n+c.charCodeAt(0),0)+i, labels: i === 0 && labels ? pick(lang,labels) : [], disclaimer: motif === 'risk' || /budget|before-buy/.test(id) ? 'yes' : 'no' },
        })),
        caption: { text: `${pick(lang,name)}${detail ? `\n${pick(lang,detail)}` : ''}`, hashtags: lang === 'ar' ? ['#جولدكم','#عمان','#ذهب'] : ['#Goldcom','#Oman','#Gold'] },
      };
    },
  };
}

export const SHOWCASE_LIBRARY = [
  item({id:'post-words-before-gift',family:'photo-story',motif:'gift',name:['Some words are the gift','بعض الكلام هو الهدية'],beats:[['Some words are the gift','بعض الكلام هو الهدية']]}),
  item({id:'post-muscat-connections',family:'painted-story',motif:'connection',name:['From our home to yours','من بيتنا لبيتكم'],beats:[['From our home to yours','من بيتنا لبيتكم']]}),
  ...stills.map(([id,family,en,ar,motif,de,da,le,la]) => item({ id:`post-${id}`, family, motif, name:[en,ar], beats:[[en,ar]], detail:[de,da], labels:le?[le,la]:null })),
  ...sequences.map(s => item(s)),
  ...loops.map(([id,family,en,ar,motif]) => item({id,kind:'motion',family,motif,name:[en,ar],beats:[[en,ar]]})),
];

export const LIBRARY_MEDIA = { all:{en:'All visual styles',ar:'كل الأساليب'}, ...Object.fromEntries(Object.entries(ART_DIRECTIONS).filter(([id])=>SHOWCASE_LIBRARY.some(i=>i.medium===id))), '3d':{en:'3D studio',ar:'استوديو ثلاثي الأبعاد'} };
