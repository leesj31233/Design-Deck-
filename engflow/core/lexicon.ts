/**
 * Verb lexicon for rule-based grammar checks. Restricted to verbs that occur
 * in engineering meetings so the rules stay precise (a rule only fires when
 * the word is known to be a verb in that position).
 */

const IRREGULAR: Record<string, [past: string, pp: string]> = {
  be: ["was", "been"], begin: ["began", "begun"], bring: ["brought", "brought"], build: ["built", "built"],
  buy: ["bought", "bought"], choose: ["chose", "chosen"], come: ["came", "come"], cut: ["cut", "cut"],
  do: ["did", "done"], draw: ["drew", "drawn"], find: ["found", "found"], forget: ["forgot", "forgotten"],
  get: ["got", "got"], give: ["gave", "given"], go: ["went", "gone"], have: ["had", "had"], hold: ["held", "held"],
  keep: ["kept", "kept"], know: ["knew", "known"], lead: ["led", "led"], leave: ["left", "left"], lose: ["lost", "lost"],
  make: ["made", "made"], mean: ["meant", "meant"], meet: ["met", "met"], pay: ["paid", "paid"], put: ["put", "put"],
  read: ["read", "read"], run: ["ran", "run"], say: ["said", "said"], see: ["saw", "seen"], sell: ["sold", "sold"],
  send: ["sent", "sent"], set: ["set", "set"], show: ["showed", "shown"], shut: ["shut", "shut"], speak: ["spoke", "spoken"],
  spend: ["spent", "spent"], stand: ["stood", "stood"], take: ["took", "taken"], tell: ["told", "told"],
  think: ["thought", "thought"], understand: ["understood", "understood"], write: ["wrote", "written"],
  rise: ["rose", "risen"], fall: ["fell", "fallen"], grow: ["grew", "grown"], feel: ["felt", "felt"],
  hear: ["heard", "heard"], shake: ["shook", "shaken"], break: ["broke", "broken"], feed: ["fed", "fed"],
};

/** Verbs common in engineering meetings (base forms). */
export const BASE_VERBS = new Set<string>([
  ...Object.keys(IRREGULAR),
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
]);

/** Verbs that are rarely nouns — safe for rules like "have + base verb". */
export const UNAMBIGUOUS_VERBS = new Set<string>([
  "decide", "complete", "finish", "receive", "confirm", "send", "install", "select", "submit", "approve", "prepare",
  "calculate", "verify", "discuss", "finalize", "finalise", "analyze", "analyse", "evaluate", "investigate", "inform",
  "clarify", "identify", "modify", "postpone", "propose", "recommend", "resolve", "simulate", "validate", "explain",
  "choose", "understand", "give", "take", "write", "begin", "bring", "buy", "find", "forget", "know", "see", "speak",
  "tell", "think", "agree", "assume", "ensure", "deliver", "reduce", "improve", "inspect", "replace", "revise",
]);

/** Past participles identical to the base form; excluded from "be + base verb". */
const SAME_FORM = new Set(["put", "set", "cut", "shut", "read", "run", "come"]);

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
  return FORM_INDEX.get(w) ?? null;
}

export function isSameFormParticiple(base: string): boolean {
  return SAME_FORM.has(base);
}

/** -ing words that are not progressive verbs in the patterns we check. */
export const ING_NOUNS = new Set([
  "during", "something", "nothing", "anything", "everything", "morning", "evening", "meeting", "building", "engineering",
  "piping", "drawing", "drawings", "training", "spring", "string", "ceiling", "bring", "thing", "king", "ring", "sing",
]);

/** Uncountable nouns frequently pluralized by learners. */
export const UNCOUNTABLE_PLURALS: Record<string, string> = {
  informations: "information", equipments: "equipment", feedbacks: "feedback", advices: "advice",
  researches: "research", softwares: "software", datas: "data", staffs: "staff", knowledges: "knowledge",
  progresses: "progress", evidences: "evidence", machineries: "machinery", baggages: "baggage",
};

/** Learner non-words with their likely intended form. */
export const NON_WORDS: Record<string, { fix: string; noteKo: string }> = {
  lated: { fix: "delayed", noteKo: "'lated'는 영어 단어가 아닙니다. 일정이 늦어진 것은 'delayed', 늦은 것은 'late'입니다." },
  delaied: { fix: "delayed", noteKo: "delay의 과거분사는 'delayed'입니다." },
  informated: { fix: "informed", noteKo: "inform의 과거분사는 'informed'입니다." },
};

/** Words starting with a vowel letter but a consonant sound, and vice versa. */
export const CONSONANT_SOUND_VOWEL_START = /^(uni|use|usu|uti|eu|one|once|ur[aei])/;
export const VOWEL_SOUND_CONSONANT_START = /^(hour|honest|honou?r|heir|mba|fmea|hazop|lng|lpg|r&d|sop|msds|hmb|fat\b|sat\b|ms\b)/;
