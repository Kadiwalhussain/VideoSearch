/**
 * Lexicons for topic labelling: stopwords, boilerplate and the discourse cues
 * speakers use to announce a new topic.
 *
 * Covers English plus romanized Hindi/Urdu ("Hinglish"), which is how a large
 * share of lecture content on YouTube is actually spoken. Devanagari and other
 * scripts are handled by the Unicode-aware tokenizer, not by word lists.
 */

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

/** Function words that must never carry a topic label on their own. */
export const STOP = new Set([
  ...words(`
  a an the and or but if then else when while of in on at to for from by with
  as is are was were be been being have has had do does did will would can could
  should may might must shall about into through during before after above below
  between out off over under again further once here there all each few more most
  other some such no nor not only own same so than too very just also now
  this that these those it its i you he she we they them my your our their
  me him her us what which who whom whose how why where whether
  don't doesn't didn't isn't aren't wasn't weren't won't can't cannot
  because however therefore thus hence since although though unless until
  `),
  // Spoken filler — dominates ASR output and never means anything
  ...words(`
  yeah yes ok okay um uh hmm ah oh wow nice great super cool alright right well
  like really actually basically literally honestly obviously definitely
  going go goes get got gets getting gonna wanna let lets
  says said say tell tells know knows think thinks want wants need needs
  look looks see sees make makes made take takes taken took come comes came
  use uses used using put puts give gives given keep keeps kept
  called call calls known based doing done goes kicks starts start begin begins
  handles handle handled running runs ran spin spins bounce bounces
  drops dropped jump jumps turns turned moves moved works worked
  controlled applied compute computes computed accumulates combines
  something anything everything nothing someone anyone everyone
  guy guys folks people everybody without within upon toward towards per via
  kind sort thing things stuff way ways lot lots bit little much many
  today tomorrow yesterday then again still even ever never always forever
  maybe probably perhaps somehow anyway quite pretty rather almost
  `),
  // Spelled-out numbers and bare units — "zero point two five", "eleven hours"
  ...words(`
  zero one two three four five six seven eight nine ten eleven twelve
  thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty
  thirty forty fifty sixty seventy eighty ninety hundred thousand million billion
  first second third fourth fifth last next another half double triple
  point points percent degrees hour hours minute minutes seconds day days week weeks
  month months year years time times number numbers
  `),
  // Romanized Hindi/Urdu function words — the Hinglish equivalent of the above
  ...words(`
  hai hain ho hota hoti hote hona hue huye tha thi the raha rahi rahe
  hum ham main mein mai tum aap ye yeh wo woh is us in un ka ki ke ko se
  aur ya par pe bhi hi to toh na nahi nahin mat kya kyun kyon kaise kahan kab
  jo jis jab tab agar lekin magar phir fir ab abhi aaj kal
  jise jisme jisse jinme jinhe jinka jiska jiski jinki uska uski unka
  kar karo karna karte karta karti karenge kiya kare karen karke
  liye lia liya lena dena diya de do dijiye milta milti milte mile
  bahut thoda zyada kam sab sabhi kuch kuchh koi apna apne apni
  wala wali wale hoga hogi honge chahiye zaroori zaroorat
  chaliye chalo dekho dekhte dekhenge dekhna samajh samajhna samajhte samajhenge
  baat baare bare matlab yaani isliye kyunki taki jaise waise
  acha achha theek sahi galat pehle baad phir tak sath saath bina
  yahan wahan andar bahar upar neeche aage peeche
  ise iske isko isme usme unme uske poora poori pure puri
  waqt samay tarike tarika zyadatar aksar log logon
  kehte kehta kehti kaha kehna bolte bolta naam
  banta banti bante banana padhte padhna padhenge padhengi
  sakte sakta sakti lete leta leti rakhte rakhna
  baar poocha poochha gaya gayi gaye cheez cheezein tarah alag har
  ek do teen char paanch sabse point view
  doston dosto namaste hello dhanyawaad shukriya
  `),
]);

/**
 * Brands and platform names that saturate captions. Allowed inside a longer
 * phrase, never as the whole label.
 */
export const BRAND_NOISE = new Set(
  words(`
  youtube netflix google gmail alexa amazon facebook instagram twitter
  microsoft apple openai chatgpt github linkedin whatsapp telegram discord
  zoom slack reddit tiktok spotify uber airbnb paypal stripe squarespace
  nordvpn skillshare audible brilliant honey raid shadow legends
  patreon subscribe channel
  `)
);

/**
 * Sponsor reads, intros and sign-offs. A section whose text matches these is
 * not a topic no matter how distinctive its vocabulary is.
 */
const BOILERPLATE_PATTERNS: RegExp[] = [
  /\bsponsored by\b/i,
  /\bthis (?:video|episode) is brought to you\b/i,
  /\buse (?:my |the )?(?:code|link)\b.*\b(?:off|discount)\b/i,
  /\b(?:hit|smash) (?:the )?(?:like|bell)\b/i,
  /\blike (?:and|&) subscribe\b/i,
  /\bsubscribe to (?:the|my) channel\b/i,
  /\bbell icon\b/i,
  /\bthanks? for watching\b/i,
  /\bsee you (?:in the )?next (?:one|video|time|lecture)\b/i,
  /\bwelcome back to (?:the|my) channel\b/i,
  /\bwhat(?:'s| is) up (?:guys|everyone|everybody)\b/i,
  /\blink(?:s)? (?:in|below) the description\b/i,
  /\bpercent off\b/i,
  /\bfollow me on\b/i,
  /\bagle video mein\b/i,
  /\bis video ko like\b/i,
  /\bchannel ko subscribe\b/i,
];

export function isBoilerplate(text: string): boolean {
  return BOILERPLATE_PATTERNS.some((re) => re.test(text));
}

/**
 * Phrases a speaker uses right before naming the thing they're about to cover.
 * Whatever follows is a strong topic candidate — this is the highest-precision
 * signal available without a model.
 */
const CUE_PATTERNS: RegExp[] = [
  // English
  /\b(?:let'?s|let us|we(?:'| a)?re going to|we will|we'll|i'?m going to|i will)\s+(?:now\s+)?(?:talk about|discuss|look at|cover|go over|dive into|explore|see|study|understand|learn about)\b/i,
  /\b(?:now|next|first|finally|moving on to|coming to|so)\s+(?:let'?s\s+)?(?:we\s+)?(?:talk about|discuss|look at|cover)\b/i,
  /\b(?:today|in this (?:video|lecture|lesson))\s+(?:we(?:'| a)?re going to|we will|we'll|i will)?\s*(?:talk about|discuss|cover|learn about|see)\b/i,
  /\bwhat is\b/i,
  /\bthe (?:key )?(?:idea|intuition|point|problem|trick|fix|solution) (?:here )?is\b/i,
  /\bthis is (?:called|known as)\b/i,
  /\bis called\b/i,
  /\bwe call (?:this|it)\b/i,
  /\banother (?:technique|method|approach|problem|way) (?:that )?(?:helps|is|we)\b/i,
  /\bthe (?:most )?common problem\b/i,
  // Hinglish
  /\b(?:ab|chaliye|aaj|abhi)\s+(?:hum\s+)?(?:log\s+)?(?:baat karte hain|baat karenge|dekhte hain|dekhenge|padhenge|samajhte hain|samajhenge)\b/i,
  /\bke baare mein\b/i,
  /\bkya hota hai\b/i,
  /\bise\s+\w+\s+kehte hain\b/i,
  /\bkehte hain\b/i,
];

/**
 * Text that follows a topic-announcing cue, if any. Returns the remainder of
 * the caption after the cue so callers can mine it for the actual noun phrase.
 */
export function afterCue(text: string): string | null {
  for (const re of CUE_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length).trim();
    if (rest.length >= 3) return rest;
  }
  return null;
}

/**
 * Weak phrase endings — a label should land on a noun, not trail off into an
 * adverb or a comparison.
 */
export const WEAK_ENDING = new Set(
  words(`
  very really quite rather more most less least better best worse worst
  such same other another each every both either neither
  here there where when while because since although
  recursively basically actually literally honestly obviously genuinely
  consistent consistently smoother smooth faster slower larger smaller
  important different similar possible available excellent respectable
  impressive stunning surprised surprising disappointing compared comparing
  value usage wise stay stays
  `)
);

/** Endings that are almost always adverbs in English. */
export function isWeakEnding(word: string): boolean {
  const w = word.toLowerCase();
  if (WEAK_ENDING.has(w)) return true;
  if (/ly$/.test(w) && w.length > 4) return true;
  return false;
}
