/**
 * Verb lexicon for rule-based grammar checks. Restricted to verbs that occur
 * in engineering meetings so the rules stay precise (a rule only fires when
 * the word is known to be a verb in that position).
 */

const IRREGULAR: Record<string, [past: string, pp: string]> = {
  be: ["was", "been"], freeze: ["froze", "frozen"], stick: ["stuck", "stuck"], begin: ["began", "begun"], bring: ["brought", "brought"], build: ["built", "built"],
  buy: ["bought", "bought"], choose: ["chose", "chosen"], come: ["came", "come"], cut: ["cut", "cut"],
  do: ["did", "done"], draw: ["drew", "drawn"], find: ["found", "found"], forget: ["forgot", "forgotten"],
  get: ["got", "got"], give: ["gave", "given"], go: ["went", "gone"], have: ["had", "had"], hold: ["held", "held"],
  keep: ["kept", "kept"], know: ["knew", "known"], lead: ["led", "led"], leave: ["left", "left"], lose: ["lost", "lost"],
  make: ["made", "made"], mean: ["meant", "meant"], meet: ["met", "met"], pay: ["paid", "paid"], put: ["put", "put"],
  read: ["read", "read"], run: ["ran", "run"], say: ["said", "said"], see: ["saw", "seen"], sell: ["sold", "sold"],
  send: ["sent", "sent"], set: ["set", "set"], show: ["showed", "shown"], shut: ["shut", "shut"], speak: ["spoke", "spoken"],
  spend: ["spent", "spent"], stand: ["stood", "stood"], take: ["took", "taken"], tell: ["told", "told"],
  think: ["thought", "thought"], understand: ["understood", "understood"], misunderstand: ["misunderstood", "misunderstood"], misread: ["misread", "misread"], write: ["wrote", "written"],
  rise: ["rose", "risen"], fall: ["fell", "fallen"], grow: ["grew", "grown"], feel: ["felt", "felt"],
  hear: ["heard", "heard"], shake: ["shook", "shaken"], break: ["broke", "broken"], feed: ["fed", "fed"],
  teach: ["taught", "taught"], catch: ["caught", "caught"], drive: ["drove", "driven"], eat: ["ate", "eaten"],
  drink: ["drank", "drunk"], fly: ["flew", "flown"], forgive: ["forgave", "forgiven"], lend: ["lent", "lent"],
  seek: ["sought", "sought"], sit: ["sat", "sat"], sleep: ["slept", "slept"], throw: ["threw", "thrown"],
  wear: ["wore", "worn"], win: ["won", "won"], let: ["let", "let"], spread: ["spread", "spread"], fight: ["fought", "fought"],
  steal: ["stole", "stolen"], wake: ["woke", "woken"], withdraw: ["withdrew", "withdrawn"],
};

/** Verbs common in engineering meetings (base forms). */
export const BASE_VERBS = new Set<string>([
  ...Object.keys(IRREGULAR),
  // Plant troubles and everyday verbs the bank uses ("the pump's leaking", "let me recap").
  "leak", "drip", "overheat", "vibrate", "crack", "rust", "slip", "melt", "boil", "spill", "flood", "clog", "jam", "recap",
  "smell", "burn", "taste", "pour", "grill", "toast", "celebrate", "congratulate", "recommend", "order", "book", "pay",
  "save", "rejoin", "reopen", "swim", "hike", "relax", "enjoy", "invite", "introduce", "welcome", "miss", "pick", "drop", "fill",
  // Everyday verbs for hobbies and home life ("I enjoy cooking", "she live in Busan").
  "cook", "bake", "sing", "jog", "climb", "study", "chop", "stir", "fry", "wrap", "pack", "unpack", "laugh", "cry", "marry",
  "hurry", "greet", "decorate", "shave", "tidy", "sew", "fold", "knit", "sneeze", "whisper", "shout", "yell", "scream", "play",
  "dance", "live", "practice", "practise", "exercise", "trip", "crash", "stall", "overflow",
  "ignore", "misunderstand", "misread", "notice", "notify", "admit", "drain", "switch", "suit", "fit", "sign", "escalate",
  "enter", "access", "reply", "respond", "listen", "die", "belong", "consist", "occur", "happen", "exist", "appear", "disappear", "remain", "message",
  "accept", "adjust", "agree", "allow", "analyze", "analyse", "answer", "apply", "approve", "arrange", "ask", "assign",
  "assume", "attach", "avoid", "calculate", "call", "cancel", "change", "check", "clarify", "clean", "close", "collect",
  "commission", "compare", "complete", "confirm", "consider", "contact", "continue", "control", "correct", "cover",
  "decide", "decrease", "define", "delay", "deliver", "design", "discuss", "dry", "email", "ensure", "estimate",
  "evaluate", "expect", "explain", "extend", "finalize", "finalise", "finish", "fix", "follow", "help", "identify",
  "improve", "include", "increase", "inform", "inspect", "install", "investigate", "issue", "measure", "mention",
  "modify", "monitor", "move", "need", "note", "open", "operate", "order", "plan", "prepare", "present", "proceed",
  "produce", "propose", "provide", "purchase", "receive", "recheck", "recommend", "reduce", "remind", "repair",
  "replace", "report", "request", "require", "resolve", "respond", "restart", "review", "revise", "schedule",
  "select", "share", "shutdown", "simulate", "size", "start", "stop", "submit", "suggest", "summarize", "summarise",
  "supply", "support", "test", "track", "train", "try", "update", "upgrade", "use", "validate", "verify", "wait",
  "want", "wash", "work", "explore", "postpone", "prioritize", "record", "remove", "repeat", "return", "scale",
  "separate", "specify", "transfer", "visit", "warn", "assess", "check", "secure", "handle", "align", "reach",
  "cause", "prevent", "affect", "happen", "occur", "exceed", "drop", "consume", "achieve", "maintain", "perform", "reject", "trip",
  // Everyday meeting and conversation verbs.
  "satisfy", "fulfill", "fulfil", "attend", "appreciate", "apologize", "apologise", "belong", "borrow", "complain",
  "connect", "contain", "create", "depend", "describe", "determine", "develop", "disagree", "enjoy", "exist", "imagine",
  "introduce", "join", "listen", "obtain", "participate", "persuade", "prefer", "pretend", "prove", "realize", "realise",
  "recognize", "recognise", "refer", "refuse", "rely", "remember", "represent", "seem", "solve", "succeed", "suppose",
  "survive", "translate", "wonder", "arrive", "believe", "discover", "encourage", "expand", "fail", "invite", "involve",
  "learn", "manage", "organize", "organise", "protect", "react", "serve", "stay", "suffer", "thank", "add", "advise",
  "announce", "appear", "argue", "celebrate", "coordinate", "download", "eliminate", "emphasize", "enable", "examine",
  "gather", "generate", "highlight", "implement", "indicate", "integrate", "interpret", "interrupt", "locate", "minimize",
  "negotiate", "predict", "preserve", "promote", "raise", "register", "remain", "reserve", "restore", "resume", "retain",
  "simplify", "stabilize", "strengthen", "supervise", "troubleshoot", "utilize", "weigh",
  "look", "talk", "sound", "matter", "like", "love", "hope", "worry", "relax", "rest", "travel", "walk", "watch", "wish",
]);

/** Verbs that are rarely nouns — safe for rules like "have + base verb". */
export const UNAMBIGUOUS_VERBS = new Set<string>([
  "decide", "complete", "finish", "receive", "confirm", "send", "install", "select", "submit", "approve", "prepare",
  "calculate", "verify", "discuss", "finalize", "finalise", "analyze", "analyse", "evaluate", "investigate", "inform",
  "clarify", "identify", "modify", "postpone", "propose", "recommend", "resolve", "simulate", "validate", "explain",
  "choose", "understand", "give", "take", "write", "begin", "bring", "buy", "find", "forget", "know", "see", "speak",
  "tell", "think", "agree", "assume", "ensure", "deliver", "reduce", "improve", "inspect", "replace", "revise",
  "satisfy", "fulfill", "fulfil", "meet", "attend", "appreciate", "apologize", "apologise", "belong", "borrow", "complain",
  "connect", "contain", "create", "depend", "describe", "determine", "develop", "disagree", "enjoy", "exist", "imagine",
  "introduce", "join", "listen", "obtain", "participate", "persuade", "prefer", "pretend", "prove", "realize", "realise",
  "recognize", "recognise", "refuse", "rely", "remember", "represent", "seem", "solve", "succeed", "suppose", "survive",
  "translate", "wonder", "arrive", "believe", "discover", "encourage", "expand", "fail", "invite", "involve", "learn",
  "manage", "organize", "organise", "protect", "react", "serve", "suffer", "thank", "accept", "achieve", "maintain",
  "perform", "require", "provide", "operate", "consider", "continue", "expect", "follow", "happen", "include", "mention",
  "occur", "prevent", "reject", "respond", "want", "teach", "eat", "drink", "drive", "forgive", "lend", "advise",
  "announce", "appear", "argue", "coordinate", "eliminate", "emphasize", "enable", "examine", "generate", "implement",
  "indicate", "integrate", "interpret", "interrupt", "locate", "negotiate", "predict", "remain", "simplify", "supervise",
]);

/** Past participles identical to the base form; excluded from "be + base verb". */
const SAME_FORM = new Set(["put", "set", "cut", "shut", "read", "run", "come", "let", "spread"]);

export function isBaseVerb(w: string): boolean {
  return BASE_VERBS.has(w);
}

export function pastOf(base: string): string {
  if (IRREGULAR[base]) return IRREGULAR[base][0];
  return regularEd(base);
}

export function participleOf(base: string): string {
  if (IRREGULAR[base]) return IRREGULAR[base][1];
  return regularEd(base);
}

function regularEd(base: string): string {
  if (base.endsWith("e")) return base + "d";
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + "ied";
  if (/^(stop|plan|ship|drop|scrap|trim|commit|submit|admit|transfer|occur|refer|prefer)$/.test(base)) return base + base.slice(-1) + "ed";
  return base + "ed";
}

export function ingOf(base: string): string {
  if (base === "be") return "being";
  if (base.endsWith("ie")) return base.slice(0, -2) + "ying";
  if (base.endsWith("ee")) return base + "ing";
  if (base.endsWith("e") && base.length > 2) return base.slice(0, -1) + "ing";
  if (/^(stop|plan|ship|drop|scrap|trim|commit|submit|admit|transfer|occur|refer|prefer|run|put|set|cut|get|begin|shut)$/.test(base)) return base + base.slice(-1) + "ing";
  return base + "ing";
}

export function thirdPersonOf(base: string): string {
  if (base === "have") return "has";
  if (base === "be") return "is";
  if (base === "do") return "does";
  if (base === "go") return "goes";
  if (/(s|sh|ch|x|z|o)$/.test(base)) return base + "es";
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + "ies";
  return base + "s";
}

const FORM_INDEX = new Map<string, { base: string; form: "base" | "past" | "pp" | "ing" | "3sg" }>();
for (const b of BASE_VERBS) {
  FORM_INDEX.set(thirdPersonOf(b), { base: b, form: "3sg" });
  FORM_INDEX.set(ingOf(b), { base: b, form: "ing" });
  FORM_INDEX.set(participleOf(b), { base: b, form: "pp" });
  FORM_INDEX.set(pastOf(b), { base: b, form: "past" });
  FORM_INDEX.set(b, { base: b, form: "base" });
}

export function verbInfo(w: string): { base: string; form: "base" | "past" | "pp" | "ing" | "3sg" } | null {
  const hit = FORM_INDEX.get(w);
  if (hit) return hit;
  // "resend", "rescheduled", "rechecking": re- + a known verb is that verb again.
  if (w.length > 4 && w.startsWith("re")) {
    const inner = FORM_INDEX.get(w.slice(2));
    if (inner && inner.base.length >= 3) return { base: `re${inner.base}`, form: inner.form };
  }
  return null;
}

export function isSameFormParticiple(base: string): boolean {
  return SAME_FORM.has(base);
}

/** -ing words that are not progressive verbs in the patterns we check. */
export const ING_NOUNS = new Set([
  "during", "something", "nothing", "anything", "everything", "morning", "evening", "meeting", "building", "engineering",
  "piping", "drawing", "drawings", "training", "spring", "string", "ceiling", "bring", "thing", "king", "ring", "sing",
  // Nouns only (never a verb in these lessons): "my cousin's wedding" is not "cousin is wedding".
  "wedding", "weddings", "clothing", "housing", "earring", "earrings", "pudding", "sibling", "siblings", "dumpling", "dumplings",
]);

/** Uncountable nouns frequently pluralized by learners. */
export const UNCOUNTABLE_PLURALS: Record<string, string> = {
  informations: "information", equipments: "equipment", feedbacks: "feedback", advices: "advice",
  researches: "research", softwares: "software", datas: "data", staffs: "staff", knowledges: "knowledge",
  progresses: "progress", evidences: "evidence", machineries: "machinery", baggages: "baggage",
  breads: "bread", luggages: "luggage", furnitures: "furniture", homeworks: "homework", damages: "damage", traffics: "traffic",
  advertisings: "advertising", accommodations: "accommodation", sceneries: "scenery", jewelries: "jewelry",
};

/** Learner non-words with their likely intended form. */
export const NON_WORDS: Record<string, { fix: string; noteKo: string; skill?: string }> = {
  stucked: { fix: "stuck", noteKo: "stick의 과거·과거분사는 'stuck'입니다: 'The valve is stuck.'" },
  sticked: { fix: "stuck", noteKo: "stick의 과거·과거분사는 'stuck'입니다." },
  shutted: { fix: "shut", noteKo: "shut의 과거·과거분사는 'shut' 그대로입니다." },
  hitted: { fix: "hit", noteKo: "hit의 과거·과거분사는 'hit' 그대로입니다." },
  spreaded: { fix: "spread", noteKo: "spread의 과거·과거분사는 'spread' 그대로입니다." },
  leaded: { fix: "led", noteKo: "lead(이끌다)의 과거·과거분사는 'led'입니다." },
  holded: { fix: "held", noteKo: "hold의 과거·과거분사는 'held'입니다: 'The meeting was held online.'" },
  feeded: { fix: "fed", noteKo: "feed의 과거·과거분사는 'fed'입니다." },
  shooted: { fix: "shot", noteKo: "shoot의 과거·과거분사는 'shot'입니다." },
  splitted: { fix: "split", noteKo: "split의 과거·과거분사는 'split' 그대로입니다." },
  fighted: { fix: "fought", noteKo: "fight의 과거·과거분사는 'fought'입니다." },
  readed: { fix: "read", noteKo: "read의 과거·과거분사는 철자가 'read' 그대로입니다(발음만 [red])." },
  lated: { fix: "delayed", noteKo: "'lated'는 영어 단어가 아닙니다. 일정이 늦어진 것은 'delayed', 늦은 것은 'late'입니다.", skill: "be-adj" },
  delaied: { fix: "delayed", noteKo: "delay의 과거분사는 'delayed'입니다.", skill: "be-adj" },
  informated: { fix: "informed", noteKo: "inform의 과거분사는 'informed'입니다." },
  sended: { fix: "sent", noteKo: "send는 불규칙 동사입니다: send – sent – sent." },
  builded: { fix: "built", noteKo: "build는 불규칙 동사입니다: build – built – built." },
  buyed: { fix: "bought", noteKo: "buy는 불규칙 동사입니다: buy – bought – bought." },
  choosed: { fix: "chose", noteKo: "choose는 불규칙 동사입니다: choose – chose – chosen." },
  maked: { fix: "made", noteKo: "make는 불규칙 동사입니다: make – made – made." },
  taked: { fix: "took", noteKo: "take는 불규칙 동사입니다: take – took – taken." },
  gived: { fix: "gave", noteKo: "give는 불규칙 동사입니다: give – gave – given." },
  writed: { fix: "wrote", noteKo: "write는 불규칙 동사입니다: write – wrote – written." },
  finded: { fix: "found", noteKo: "find는 불규칙 동사입니다: find – found – found." },
  spended: { fix: "spent", noteKo: "spend는 불규칙 동사입니다: spend – spent – spent." },
  teached: { fix: "taught", noteKo: "teach는 불규칙 동사입니다: teach – taught – taught." },
  meeted: { fix: "met", noteKo: "meet는 불규칙 동사입니다: meet – met – met." },
  leaved: { fix: "left", noteKo: "leave는 불규칙 동사입니다: leave – left – left." },
  runned: { fix: "ran", noteKo: "run은 불규칙 동사입니다: run – ran – run." },
  losed: { fix: "lost", noteKo: "lose는 불규칙 동사입니다: lose – lost – lost." },
  hurted: { fix: "hurt", noteKo: "hurt는 불규칙 동사입니다: hurt – hurt – hurt." },
  drived: { fix: "drove", noteKo: "drive는 불규칙 동사입니다: drive – drove – driven." },
  falled: { fix: "fell", noteKo: "fall은 불규칙 동사입니다: fall – fell – fallen." },
  feeled: { fix: "felt", noteKo: "feel은 불규칙 동사입니다: feel – felt – felt." },
  catched: { fix: "caught", noteKo: "catch는 불규칙 동사입니다: catch – caught – caught." },
  thinked: { fix: "thought", noteKo: "think는 불규칙 동사입니다: think – thought – thought." },
  bringed: { fix: "brought", noteKo: "bring은 불규칙 동사입니다: bring – brought – brought." },
  eated: { fix: "ate", noteKo: "eat은 불규칙 동사입니다: eat – ate – eaten." },
  drinked: { fix: "drank", noteKo: "drink는 불규칙 동사입니다: drink – drank – drunk." },
  speaked: { fix: "spoke", noteKo: "speak은 불규칙 동사입니다: speak – spoke – spoken." },
  telled: { fix: "told", noteKo: "tell은 불규칙 동사입니다: tell – told – told." },
  sayed: { fix: "said", noteKo: "say는 불규칙 동사입니다: say – said – said." },
  payed: { fix: "paid", noteKo: "pay의 과거·과거분사는 'paid'입니다." },
  keeped: { fix: "kept", noteKo: "keep은 불규칙 동사입니다: keep – kept – kept." },
  sleeped: { fix: "slept", noteKo: "sleep은 불규칙 동사입니다: sleep – slept – slept." },
  meaned: { fix: "meant", noteKo: "mean은 불규칙 동사입니다: mean – meant – meant." },
  breaked: { fix: "broke", noteKo: "break는 불규칙 동사입니다: break – broke – broken." },
  forgetted: { fix: "forgot", noteKo: "forget은 불규칙 동사입니다: forget – forgot – forgotten." },
  knowed: { fix: "knew", noteKo: "know는 불규칙 동사입니다: know – knew – known." },
  understanded: { fix: "understood", noteKo: "understand는 불규칙 동사입니다: understand – understood – understood." },
  winned: { fix: "won", noteKo: "win은 불규칙 동사입니다: win – won – won." },
  throwed: { fix: "threw", noteKo: "throw는 불규칙 동사입니다: throw – threw – thrown." },
  growed: { fix: "grew", noteKo: "grow는 불규칙 동사입니다: grow – grew – grown." },
  freezed: { fix: "froze", noteKo: "freeze는 불규칙 동사입니다: freeze – froze – frozen." },
  cutted: { fix: "cut", noteKo: "cut은 과거·과거분사도 'cut'입니다." },
  putted: { fix: "put", noteKo: "put은 과거·과거분사도 'put'입니다." },
  setted: { fix: "set", noteKo: "set은 과거·과거분사도 'set'입니다." },
  getted: { fix: "got", noteKo: "get은 불규칙 동사입니다: get – got – got(ten)." },
  goed: { fix: "went", noteKo: "go는 불규칙 동사입니다: go – went – gone." },
  sitted: { fix: "sat", noteKo: "sit은 불규칙 동사입니다: sit – sat – sat." },
  standed: { fix: "stood", noteKo: "stand는 불규칙 동사입니다: stand – stood – stood." },
};

/** Words starting with a vowel letter but a consonant sound, and vice versa. */
export const CONSONANT_SOUND_VOWEL_START = /^(uni|use|usu|uti|eu|one|once|ur[aei])/;
export const VOWEL_SOUND_CONSONANT_START = /^(hour|honest|honou?r|heir|mba|fmea|hazop|lng|lpg|r&d|sop|msds|hmb|fat\b|sat\b|ms\b)/;
