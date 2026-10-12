import { align, type AlignOp, type Alignment } from "./align";
import { compilePattern, matchAny, matchPattern } from "./pattern";
import { runRules } from "./rules";
import { numberSlip } from "./numbers";
import {
  ARTICLES, AUXILIARIES, BE_FORMS, CONJUNCTIONS, DETERMINERS, MODALS, NEGATIONS, PREPOSITIONS, SUBJECT_PRONOUNS,
  capitalizeSentence, isFunctionWord, joinWords, normalizeForMatch, tokenize, words, type Token,
} from "./text";
import { isBaseVerb, participleOf, verbInfo } from "./lexicon";
import type {
  ErrorCategory, ErrorSpan, Evaluation, MeaningCheck, Question, ScoreBucket, Severity,
} from "./types";

export const LOCAL_EVALUATOR_LABEL = "규칙 기반 분석 (오프라인)";

/**
 * Scoring is grammar-centred: grammar accuracy decides most of the score, the
 * key meaning/expression chunks come next, structure last. Site-specific
 * terminology (raw vs feed composition) is reference only and never scored;
 * spelling slips cost almost nothing.
 */
export const SCORE_WEIGHTS = { grammar: 0.55, meaning: 0.35, organization: 0.1 } as const;
export const PENALTY: Record<Severity, number> = { minor: 10, major: 30, critical: 45 };
export const SPELLING_PENALTY = 1;
export const SPELLING_CAP = 3;
/** Alignment findings are heuristic: their total cost per bucket is capped. */
const ALIGN_CAP = 45;
const CLOSE_DISTANCE = 0.45;
/** Close enough to a known correct answer to trust the rule-based grade ("high" confidence). */
const HIGH_DISTANCE = 0.2;
const CONSENSUS_MARGIN = 0.08;

/** Overall score from the three scored buckets (terminology is reference only). */
export function overallFrom(meaning: number, grammar: number, organization: number): number {
  return clamp(SCORE_WEIGHTS.grammar * grammar + SCORE_WEIGHTS.meaning * meaning + SCORE_WEIGHTS.organization * organization);
}

/** Errors that count toward the score (advisory word-choice notes do not). */
export function scoredErrors<T extends { advisory?: boolean }>(errors: T[]): T[] {
  return errors.filter((e) => !e.advisory);
}

/** Penalty points per bucket; spelling is nearly free, heuristic alignment findings are capped. */
export function bucketPenalties(errors: ErrorSpan[]): Record<ScoreBucket, number> {
  const scored = scoredErrors(errors);
  const spelling = Math.min(SPELLING_CAP, scored.filter((e) => e.category === "spelling").length * SPELLING_PENALTY);
  const of = (bucket: ScoreBucket) => {
    const list = scored.filter((e) => e.bucket === bucket && e.category !== "spelling");
    const firm = list.filter((e) => e.source !== "alignment").reduce((sum, e) => sum + PENALTY[e.severity], 0);
    const heuristic = Math.min(ALIGN_CAP, list.filter((e) => e.source === "alignment").reduce((sum, e) => sum + PENALTY[e.severity], 0));
    return firm + heuristic;
  };
  return { grammar: of("grammar") + spelling, meaning: of("meaning"), organization: of("organization"), terminology: 0 };
}

/**
 * Word order and sentence structure ("How long the warranty is?", a missing
 * subject) are grammar for a learner, so they cost grammar points; the
 * organization score keeps only completeness (too short / too long).
 */
export function defaultBucket(c: ErrorCategory): ScoreBucket {
  if (c === "meaning-shift" || c === "missing-content") return "meaning";
  if (c === "terminology") return "terminology";
  return "grammar";
}

interface Edit {
  from: number;
  to: number;
  replacement: string;
  priority: number; // 3 pitfall, 2 rule, 1 alignment
}

interface Finding {
  from: number;
  to: number;
  category: ErrorCategory;
  severity: Severity;
  bucket: ScoreBucket;
  fix: string;
  messageKo: string;
  skill?: string;
  source: ErrorSpan["source"];
  priority: number;
}

function overlaps(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  const aIns = a.from === a.to;
  const bIns = b.from === b.to;
  if (aIns && bIns) return a.from === b.from;
  if (aIns) return a.from > b.from && a.from < b.to;
  if (bIns) return b.from > a.from && b.from < a.to;
  return a.from < b.to && b.from < a.to;
}

function charRange(w: Token[], from: number, to: number, text: string): { start: number; end: number } {
  if (!w.length) return { start: 0, end: 0 };
  if (from === to) {
    const pos = from < w.length ? w[from].start : w[w.length - 1].end;
    return { start: pos, end: pos };
  }
  return { start: w[from].start, end: Math.min(text.length, w[Math.min(to, w.length) - 1].end) };
}

function wordClass(w: string): "be" | "aux" | "modal" | "article" | "prep" | "pronoun" | "conj" | "neg" | "content" {
  if (BE_FORMS.has(w)) return "be";
  if (NEGATIONS.has(w)) return "neg";
  if (MODALS.has(w) && !AUXILIARIES.has(w)) return "modal";
  if (AUXILIARIES.has(w)) return "aux";
  if (ARTICLES.has(w)) return "article";
  if (PREPOSITIONS.has(w)) return "prep";
  if (SUBJECT_PRONOUNS.has(w) || /^(us|them|him|me)$/.test(w)) return "pronoun";
  if (CONJUNCTIONS.has(w)) return "conj";
  return "content";
}

/** Choose the closest correct target (reference or accepted) by alignment distance. */
export function correctTargets(q: Question): string[] {
  return [q.reference, ...q.accepted, ...(q.advanced ? [q.advanced] : [])];
}

/** All correct targets ranked by alignment distance (closest first). */
export function rankTargets(q: Question, w: Token[]): { target: string; tw: Token[]; al: Alignment }[] {
  return correctTargets(q)
    .map((t) => {
      const tw = words(tokenize(t));
      return { target: t, tw, al: align(w, tw) };
    })
    .sort((a, b) => a.al.distance - b.al.distance);
}

export function closestTarget(q: Question, w: Token[]): { target: string; tw: Token[]; al: Alignment } {
  return rankTargets(q, w)[0];
}

export function checkMeaning(q: Question, w: Token[]): MeaningCheck[] {
  return q.meaning.map((u) => {
    const m = matchAny(u.any, w, 2, true);
    return { id: u.id, en: u.en, ko: u.ko, present: !!m, fuzzy: m?.fuzzy || undefined, term: !!u.term, critical: !!u.critical };
  });
}

const PREP_SYNONYMS = [new Set(["in", "within", "during"]), new Set(["about", "on", "regarding"]), new Set(["to", "toward", "towards"])];
const APPROX = /^(about|around|approximately|roughly|nearly|almost)$/;
const QUANTITY_START = /^([0-9][0-9.,%]*|twice|half|double|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|several|few)$/;
const MODAL_LIKE = new Set(["can", "could", "may", "might", "must", "should", "will", "would", "shall"]);
const CONJ_SYNONYMS = [
  new Set(["because", "since", "as"]), new Set(["so", "therefore", "and"]), new Set(["when", "once", "after", "while"]),
  new Set(["although", "though", "but"]), new Set(["if", "whether"]), new Set(["that", "which", "who"]),
];
/** Verb + preposition pairs that are correct English: an extra or different preposition here is a paraphrase, not an error. */
const VERB_PREPS: Record<string, string[]> = {
  know: ["about", "of"], think: ["about", "of", "over"], talk: ["about", "to", "with", "over"], hear: ["about", "of", "from"],
  care: ["about", "for"], worry: ["about"], ask: ["about", "for"], learn: ["about", "from"], speak: ["about", "to", "with"],
  agree: ["with", "on", "to"], decide: ["on", "about"], wait: ["for", "on"], look: ["at", "for", "into", "over", "through", "after", "up"],
  deal: ["with"], work: ["on", "with", "for", "at"], depend: ["on"], focus: ["on"], apply: ["for", "to"], pay: ["for"], listen: ["to"],
  reply: ["to"], respond: ["to"], refer: ["to"], belong: ["to"], get: ["to", "back", "on", "through", "over"], go: ["over", "through", "on", "to", "with", "ahead"],
  come: ["back", "up", "to", "from"], check: ["on", "with", "in", "out"], follow: ["up"], complain: ["about", "to"], dream: ["about", "of"],
  forget: ["about"], hope: ["for"], read: ["about"], write: ["about", "to"], tell: ["about"], remind: ["about", "of"], warn: ["about", "of"],
  arrive: ["at", "in"], stay: ["at", "in", "with"], meet: ["with", "up"], plan: ["for", "on"], prepare: ["for"], search: ["for"], vote: ["for", "on"],
  send: ["over", "out", "back"], thank: ["for"], apologize: ["for", "to"], apologise: ["for", "to"], consist: ["of"], succeed: ["in"], believe: ["in"], participate: ["in"],
  insist: ["on"], comment: ["on"], concentrate: ["on"], rely: ["on"], count: ["on"], result: ["in", "from"], invest: ["in"], specialize: ["in"],
  cooperate: ["with"], communicate: ["with"], cope: ["with"], help: ["with"], start: ["with", "on"], finish: ["with"], share: ["with"],
  catch: ["up"], set: ["up"], sort: ["out"], figure: ["out"], find: ["out"], point: ["out"], fill: ["in", "out"], hand: ["over", "in"], run: ["out", "into"],
};
/** Words that require one preposition: another one there is a real error ("depend of" → "depend on"). */
const REQUIRED_PREP: Record<string, string[]> = {
  depend: ["on"], interested: ["in"], consist: ["of"], listen: ["to"], wait: ["for"], responsible: ["for"], focus: ["on"], rely: ["on"],
  insist: ["on"], succeed: ["in"], participate: ["in"], belong: ["to"], reply: ["to"], respond: ["to"], similar: ["to"], different: ["from"],
  afraid: ["of"], proud: ["of"], aware: ["of"], capable: ["of"], famous: ["for"], married: ["to"], good: ["at"], forward: ["to"],
  according: ["to"], due: ["to"], apply: ["for", "to"], arrive: ["in", "at"], look: ["at", "for", "into", "forward"], talk: ["to", "about", "with"],
  agree: ["with", "on", "to"], worry: ["about"], think: ["about", "of"], ask: ["for", "about"], pay: ["for"], deal: ["with"],
};
const DETERMINERS_NP = new Set([...DETERMINERS].filter((d) => !/^(more|enough|other|all|no)$/.test(d)));
/** Particles of separable phrasal verbs: "turn on the camera" = "turn the camera on". */
const PARTICLES = new Set(["on", "off", "up", "down", "out", "in", "over", "back", "away", "around"]);
/** Verbs of thinking and wanting: "I plan to" and "I'm planning to" are both natural. */
const STATE_VERBS = new Set(["plan", "hope", "think", "wonder", "look", "consider", "expect", "intend", "feel", "want", "need", "mean", "like", "love", "wish", "guess", "try"]);
/** Verbs of change: "went up (by) 5%" — "by" before the amount is optional. */
const CHANGE_VERBS = new Set(["increase", "decrease", "rise", "drop", "fall", "grow", "reduce", "cut", "raise", "improve", "climb", "jump", "go", "come", "lower", "delay", "postpone", "extend", "shorten"]);
/** -ing / -ed feeling adjectives: "I'm interesting in" means "interested". */
const FEELING_ADJ = /^(interest|bor|excit|confus|tir|surpris|disappoint|worr|embarrass|amaz|annoy|frustrat|satisf|exhaust|shock|relax|please|terrify|frighten)(ed|ing|ied|ying)$/;

/** "made with/of/from rice": all natural. */
const MATERIAL_PREPS = new Set(["of", "with", "from"]);
const PLACE_PREPS = new Set(["in", "at", "on"]);
const DEADLINE_PREPS = new Set(["before", "by", "until"]);

function alignmentFindings(al: Alignment, w: Token[], tw: Token[], skill: string, raw = false): { findings: Finding[]; edits: Edit[] } {
  const findings: Finding[] = [];
  const edits: Edit[] = [];
  const moves = al.moves.filter((mv) => isMisplacedAdverb(w, mv.li));
  const movedL = new Set(moves.map((m) => m.li));
  const movedT = new Map(moves.map((m) => [m.ti, m]));

  const push = (f: Omit<Finding, "priority" | "source" | "bucket"> & { bucket?: ScoreBucket }, e?: Omit<Edit, "priority">) => {
    findings.push({ ...f, bucket: f.bucket ?? defaultBucket(f.category), source: "alignment", priority: 1 });
    if (e) edits.push({ ...e, priority: 1 });
  };

  // Separable phrasal verbs: "turn your cameras on" = "turn on your cameras".
  const particleT = new Set<number>();
  for (const mv of al.moves) {
    if (PARTICLES.has(w[mv.li].norm) && !movedL.has(mv.li)) {
      movedL.add(mv.li);
      particleT.add(mv.ti);
    }
  }
  // A tag question at the end (", aren't we?", ", isn't it?") is extra, never an error.
  const tagStart = (() => {
    const n = w.length;
    if (n < 3 || !w[n - 1].question) return n;
    const a = n - 1;
    if (!SUBJECT_PRONOUNS.has(w[a].norm)) return n;
    let b = a - 1;
    if (w[b]?.norm === "not") b--;
    if (!/^(am|is|are|was|were|do|does|did|have|has|had|can|could|will|would|should|isn|aren)$/.test(w[b]?.norm ?? "") || !w[b - 1]?.breakAfter) return n;
    return b;
  })();
  const inTag = (li: number) => li >= tagStart;
  // Learner clauses start at the beginning or after clause punctuation.
  const clauseStart = (i: number) => {
    let k = Math.max(0, Math.min(i, w.length - 1));
    while (k > 0 && !w[k - 1].breakAfter) k--;
    return k;
  };
  const isSubjectWord = (x?: Token) =>
    !!x && (SUBJECT_PRONOUNS.has(x.norm) || DETERMINERS_NP.has(x.norm) || /^(there|this|that|everything|everyone|anyone|someone|anything|something)$/.test(x.norm) || /^[A-Z0-9]/.test(x.raw));
  const OPENER = /^(am|is|are|was|were|do|does|did|have|has|had|can|could|will|would|should|shall|may|might|must)$/;
  // An inverted question ("Is it possible…?", "Should it be…?") has its finite verb up front.
  const openerAt = (i: number) => {
    let c = clauseStart(i);
    while (c < i && /^(so|and|but|then|well|okay|ok|also)$/.test(w[c].norm)) c++; // "…, so is it possible …?"
    return c;
  };
  const inverted = (i: number) => {
    const c = openerAt(i);
    return OPENER.test(w[c]?.norm ?? "") && isSubjectWord(w[c + 1]) && i > c + 1;
  };
  const governorBase = (li: number) => {
    const g = w[li - 1];
    return g ? (verbInfo(g.norm)?.base ?? g.norm) : "";
  };
  // Target words inside a discourse marker the learner said in one word ("to be honest" ↔ "honestly").
  const inIdiomSpan = new Set<number>();
  const learnerSays = new Set(w.map((x) => x.norm));
  const MARKERS: [string[], RegExp][] = [
    [["to", "be", "honest"], /^(honestly|frankly)$/], [["to", "be", "frank"], /^(honestly|frankly)$/],
    [["to", "tell", "the", "truth"], /^(honestly|frankly|actually)$/], [["in", "fact"], /^(actually|indeed|really)$/], [["as", "well"], /^(too|also)$/],
  ];
  for (const [phrase, single] of MARKERS) {
    if (![...learnerSays].some((x) => single.test(x))) continue;
    for (let t = 0; t + phrase.length <= tw.length; t++) {
      if (phrase.every((p, k) => tw[t + k].norm === p)) for (let k = 0; k < phrase.length; k++) inIdiomSpan.add(t + k);
    }
  }
  // "I plan to" for "I'm planning to": a state verb in a simple form that agrees with its subject.
  const simpleState = new Set<number>();
  for (const op of al.ops) {
    if (op.type !== "inflect") continue;
    const vt = verbInfo(tw[op.ti].norm);
    const vl = verbInfo(w[op.li].norm);
    if (!vt || !vl || vt.form !== "ing" || !STATE_VERBS.has(vl.base)) continue;
    let sj = op.li - 1;
    while (sj > 0 && /^(really|also|still|just|always|usually|actually|truly|certainly|already)$/.test(w[sj].norm)) sj--;
    const subj = w[sj]?.norm ?? "";
    if ((/^(i|we|you|they)$/.test(subj) && vl.form === "base") || (/^(he|she|it)$/.test(subj) && vl.form === "3sg") || vl.form === "past") simpleState.add(op.li);
  }

  for (const mv of moves) {
    const lw = w[mv.li];
    push(
      {
        from: mv.li, to: mv.li + 1, category: "word-order", severity: "major", fix: lw.raw, skill: "word-order",
        messageKo: `'${lw.raw}'의 위치가 어색합니다. 영어는 '동사 + 목적어'를 먼저 완성하고 부사(${lw.raw})는 보통 뒤에 둡니다.`,
      },
      { from: mv.li, to: mv.li + 1, replacement: "" },
    );
    edits.push({ from: mv.at, to: mv.at, replacement: lw.raw, priority: 1 });
  }

  // Only trust a difference that sits next to words the learner and target share;
  // differences inside a rephrased stretch are paraphrase, not error.
  const contentSub = (o: AlignOp | undefined) => !!o && o.type === "sub" && !(isFunctionWord(w[o.li].norm) && isFunctionWord(tw[o.ti].norm));
  const solid = (o: AlignOp | undefined) => !o || o.type === "match" || o.type === "spell" || o.type === "inflect";
  const rephrased = (o: AlignOp | undefined) =>
    contentSub(o) ||
    (!!o && o.type === "ins" && !movedT.has(o.ti) && !isFunctionWord(tw[o.ti].norm)) ||
    (!!o && o.type === "del" && !movedL.has(o.li) && !isFunctionWord(w[o.li].norm));
  // A run of consecutive insertions (or deletions) that contains a content word is an
  // inserted/omitted phrase ("at the site", "to us", "Could you"): rephrasing, not an error.
  const runOf = (k: number, type: "ins" | "del") => {
    let a = k;
    let b = k;
    while (a > 0 && al.ops[a - 1].type === type) a--;
    while (b < al.ops.length - 1 && al.ops[b + 1].type === type) b++;
    return al.ops.slice(a, b + 1);
  };
  const phraseRun = (k: number) => {
    const op = al.ops[k];
    if (op.type !== "ins" && op.type !== "del") return false;
    // Moved words are reported as word-order errors; they do not make a run "rephrased".
    const run = runOf(k, op.type).filter((o) => !(o.type === "del" && movedL.has(o.li)) && !(o.type === "ins" && movedT.has(o.ti)));
    if (run.length < 2) return false;
    const wordsInRun = run.map((o) => (o.type === "ins" ? tw[o.ti].norm : o.type === "del" ? w[o.li].norm : ""));
    // "(on that)", "(about it)", "(to you)": an optional prepositional phrase with a pronoun.
    if (PREPOSITIONS.has(wordsInRun[0]) && wordsInRun.slice(1).every((x) => /^(it|this|that|them|you|me|us|him|her|these|those|all|everyone|everything)$/.test(x))) return true;
    return wordsInRun.some((x) => !isFunctionWord(x) || /^(us|them|him|me|please)$/.test(x)) || wordsInRun.some((x) => MODALS.has(x) || AUXILIARIES.has(x));
  };
  const anchored = (k: number) => {
    if (phraseRun(k)) return false;
    const prev = al.ops[k - 1];
    const next = al.ops[k + 1];
    // Small words added or left out right next to a reworded stretch belong to that rewording
    // ("discuss it after the meeting" ↔ "discuss it later").
    if (al.ops[k].type === "ins" || al.ops[k].type === "del") {
      let a = k;
      let b = k;
      while (a > 0 && (al.ops[a - 1].type === "ins" || al.ops[a - 1].type === "del")) a--;
      while (b < al.ops.length - 1 && (al.ops[b + 1].type === "ins" || al.ops[b + 1].type === "del")) b++;
      if ((a !== k || b !== k) && (contentSub(al.ops[a - 1]) || contentSub(al.ops[b + 1]))) return false;
    }
    // Prepositions depend on the word that governs them: look one step further back.
    const op = al.ops[k];
    const isPrep = (op.type === "ins" && PREPOSITIONS.has(tw[op.ti].norm)) || ((op.type === "del" || op.type === "sub") && PREPOSITIONS.has(w[op.li].norm));
    let governor: AlignOp | undefined;
    if (isPrep) {
      for (let j = k - 1; j >= 0; j--) {
        const o = al.ops[j];
        const word = o.type === "ins" ? tw[o.ti].norm : w[o.li].norm;
        if (isFunctionWord(word) || /^(it|them|this|that|us)$/.test(word)) continue;
        governor = o;
        break;
      }
    }
    return (solid(prev) || solid(next)) && !rephrased(prev) && !rephrased(next) && !(isPrep && rephrased(governor));
  };

  // "has been limited" for "is limited" (or the other way round): the same passive state, not an error.
  const samePassiveL = new Set<number>();
  const samePassiveT = new Set<number>();
  for (const op of al.ops) {
    if (op.type !== "inflect" && op.type !== "sub") continue;
    const l = w[op.li]?.norm ?? "";
    const t = tw[op.ti]?.norm ?? "";
    const lp = w[op.li + 1]?.norm;
    const info = lp ? verbInfo(lp) : null;
    // The same participle after both ("limited" may be unknown to the lexicon, but it ends in -ed).
    if (!lp || lp !== tw[op.ti + 1]?.norm || !(info ? info.form === "pp" || info.form === "past" : /[a-z]ed$/.test(lp))) continue;
    if (l === "been" && /^(is|are|am)$/.test(t) && /^(has|have)$/.test(w[op.li - 1]?.norm ?? "")) {
      samePassiveL.add(op.li);
      samePassiveL.add(op.li - 1);
    } else if (/^(is|are|am)$/.test(l) && t === "been" && /^(has|have)$/.test(tw[op.ti - 1]?.norm ?? "")) {
      samePassiveL.add(op.li);
      samePassiveT.add(op.ti - 1);
    }
  }

  for (let k = 0; k < al.ops.length; k++) {
    const op = al.ops[k];
    if (op.type === "match") continue;
    if ((op.type !== "ins" && samePassiveL.has(op.li)) || (op.type === "ins" && samePassiveT.has(op.ti))) continue;
    if (!raw && op.type !== "spell" && !anchored(k)) continue;
    if (op.type === "spell") {
      push(
        { from: op.li, to: op.li + 1, category: "spelling", severity: "minor", fix: tw[op.ti].norm, messageKo: `철자: '${w[op.li].raw}' → '${tw[op.ti].norm}'.`, skill },
        { from: op.li, to: op.li + 1, replacement: tw[op.ti].norm },
      );
      continue;
    }
    if (op.type === "inflect") {
      const lt = w[op.li].norm;
      const tt = tw[op.ti].norm;
      const vt = verbInfo(tt);
      const vl = verbInfo(lt);
      const isVerb = !!(vt && vl);
      if (simpleState.has(op.li)) continue;
      if ((lt === "thank" && tt === "thanks") || (lt === "thanks" && tt === "thank")) continue;
      if ((lt === "lots" && tt === "lot") || (lt === "lot" && tt === "lots")) continue; // "lots of" / "a lot of"
      // A question's opening auxiliary agrees with its own subject ("Do any of you …?" / "Does anyone …?").
      if (/^(do|does|have|has|is|are|was|were)$/.test(lt) && op.li === clauseStart(op.li)) continue;
      const lprev = w[op.li - 1]?.norm ?? "";
      // "start by checking" (-ing after a preposition), "thanks for the call" (a noun after a determiner).
      if (/ing$/.test(lt) && PREPOSITIONS.has(lprev) && lprev !== "to") continue;
      if (DETERMINERS_NP.has(lprev) || /^(the|a|an)$/.test(lprev)) continue;
      // "is pouring" (progressive) vs "pours": the learner's verb group is correct either way.
      if (/ing$/.test(lt) && !FEELING_ADJ.test(lt) && (BE_FORMS.has(lprev) || BE_FORMS.has(w[op.li - 2]?.norm ?? "") && /^(still|also|just|now|really|not)$/.test(lprev))) continue;
      // Feeling adjectives: "I'm interesting in" means "interested" — a real error, whatever the lexicon knows.
      if (FEELING_ADJ.test(lt) && FEELING_ADJ.test(tt) && lt.replace(/(ed|ing|ied|ying)$/, "") === tt.replace(/(ed|ing|ied|ying)$/, "")) {
        push(
          {
            from: op.li, to: op.li + 1, category: "verb-form", severity: "major", fix: tt, skill: "be-adj",
            messageKo: /ed$/.test(tt)
              ? `'${w[op.li].raw}'는 '(남을) ~하게 만드는'이라는 뜻입니다. 사람이 느끼는 감정은 과거분사 '${tt}'로 말합니다.`
              : `'${w[op.li].raw}'는 사람이 느끼는 감정입니다. 무엇이 그런 느낌을 주는지 말할 때는 '${tt}'를 씁니다.`,
          },
          { from: op.li, to: op.li + 1, replacement: tt },
        );
        continue;
      }
      if (isVerb && vt!.form === "base" && (vl!.form === "3sg" || vl!.form === "past" || BE_FORMS.has(lt))) continue;
      // A base form right after a modal, "to" or do-support is what the grammar requires ("can send", "doesn't work").
      if (isVerb && vl!.form === "base" && vt!.form !== "ing") {
        let p = op.li - 1;
        if (w[p]?.norm === "not") p--;
        if (/^(can|could|may|might|must|should|will|would|shall|do|does|did|to|let's)$/.test(w[p]?.norm ?? "")) continue;
      }
      // A finite verb with its own subject instead of a gerund: "recommend (that) you stay" = "recommend staying".
      if (isVerb && vt!.form === "ing" && vl!.form !== "ing" && SUBJECT_PRONOUNS.has(w[op.li - 1]?.norm ?? "")) continue;
      if (BE_FORMS.has(lt) && (tt === "been" || tt === "be")) continue; // "was damaged" vs "may have been damaged": both valid
      if (/^(every|each|one)$/.test(w[op.li - 1]?.norm ?? "")) continue; // "every flange" vs "all flanges": both valid
      // "testing data" vs "test data": an -ing/base swap only matters after to/modals or prepositions.
      if (isVerb && vt!.form === "base" && vl!.form === "ing" && !/^(to|can|could|may|might|must|should|will|would)$/.test(tw[op.ti - 1]?.norm ?? "")) continue;
      const prevT = tw[op.ti - 1]?.norm;
      const gerund = isVerb && vt!.form === "ing" && prevT && PREPOSITIONS.has(prevT);
      push(
        {
          from: op.li, to: op.li + 1, category: isVerb ? "verb-form" : "countability", severity: isVerb ? "major" : "minor", fix: tt,
          skill: gerund ? "prep-gerund" : skill,
          messageKo: isVerb
            ? gerund
              ? `전치사 '${prevT}' 뒤에는 동사ing 형태가 옵니다: '${w[op.li].raw}' → '${tt}'.`
              : `동사 형태가 맞지 않습니다: '${w[op.li].raw}' → '${tt}'.`
            : `단수/복수 형태를 확인하세요: '${w[op.li].raw}' → '${tt}'.`,
        },
        { from: op.li, to: op.li + 1, replacement: tt },
      );
      continue;
    }
    if (op.type === "sub") {
      const lt = w[op.li].norm;
      const tt = tw[op.ti].norm;
      if (!isFunctionWord(lt) || !isFunctionWord(tt)) continue; // content paraphrase: meaning units judge it
      if (/^(every|each)$/.test(lt) && tt === "all") continue; // "every flange" = "all flanges"
      const lc = wordClass(lt);
      const tc = wordClass(tt);
      // Two ways to open a question: "Is it possible…?" / "Would it be possible…?"
      if (/^(be|aux|modal)$/.test(lc) && /^(be|aux|modal)$/.test(tc) && op.li === clauseStart(op.li) && isSubjectWord(w[op.li + 1])) continue;
      // A tense/voice difference only shows when the same verb follows ("is changed" vs "has changed");
      // "when you're free" vs "when you have a moment", "do the call" vs "have the call" are rewordings.
      const nextOp = al.ops[k + 1];
      const sameNext = !!nextOp && (nextOp.type === "match" || nextOp.type === "inflect" || nextOp.type === "spell");
      const verbNext = /^(not|been|being)$/.test(w[op.li + 1]?.norm ?? "") || !!verbInfo(w[op.li + 1]?.norm ?? "");
      if ((lc === "be" || lc === "aux") && (tc === "be" || tc === "aux") && lc !== tc && !sameNext) continue;
      if ((lc === "aux" || lc === "modal") && (tc === "aux" || tc === "modal") && !verbNext) continue;
      let category: ErrorCategory = "word-choice";
      let severity: Severity = "minor";
      let msg = `'${w[op.li].raw}' 대신 '${tt}'가 자연스럽습니다.`;
      if (lc === "be" && tc === "be") {
        category = "agreement";
        severity = "major";
        msg = `be동사 형태가 주어/시제와 맞지 않습니다: '${w[op.li].raw}' → '${tt}'.`;
      } else if (tc === "prep" && lc === "prep" && PREP_SYNONYMS.some((g) => g.has(tt) && g.has(lt))) {
        continue;
      } else if (MATERIAL_PREPS.has(tt) && MATERIAL_PREPS.has(lt) && tw[op.ti - 1]?.norm === "made") {
        continue;
      } else if (/^(do|does|would|could|can|will)$/.test(lt) && /^(do|does|would|could|can|will)$/.test(tt) && SUBJECT_PRONOUNS.has(w[op.li + 1]?.norm ?? "")) {
        continue; // "Do you want …?" vs "Would you like …?": politeness, not tense
      } else if (tc === "prep" && lc === "prep") {
        const gov = governorBase(op.li);
        const timeObject = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(:\d{2})?|noon|midnight|night|weekend)$/.test(w[op.li + 1]?.norm ?? "");
        if (VERB_PREPS[gov]?.includes(lt) && !timeObject) continue; // "go through" / "go over", "talk to" / "talk with"
        category = "preposition";
        // Only a word that needs one particular preposition makes another one a clear error ("depend of").
        severity = REQUIRED_PREP[gov]?.includes(tt) && !REQUIRED_PREP[gov].includes(lt) ? "major" : "minor";
        msg = severity === "major" ? `'${w[op.li - 1].raw}' 뒤에는 '${tt}'를 씁니다: '${w[op.li - 1].raw} ${tt}'.` : `전치사 선택: '${w[op.li].raw}' → '${tt}'가 더 자연스럽습니다.`;
      } else if (tc === "article" && lc === "article") {
        category = "article";
        msg = `관사: '${w[op.li].raw}' → '${tt}'.`;
      } else if (lc === "be" && tc === "aux" && /^(has|have|had)$/.test(tt)) {
        category = "tense";
        severity = "major";
        const part = w[op.li + 1]?.raw ?? "";
        msg = part
          ? `'${w[op.li].raw} ${part}'는 수동태(누가 바꾸었나)처럼 들립니다. 바뀐 결과가 지금 영향을 줄 때는 현재완료 '${tt} ${part}'를 씁니다.`
          : `시제: '${w[op.li].raw}' → '${tt}'(현재완료).`;
      } else if (lc === "aux" && tc === "be" && /^(has|have|had)$/.test(lt)) {
        category = "verb-form";
        severity = "major";
        msg = `주어가 동작을 받는 쪽이면 수동태(be + 과거분사)가 필요합니다: '${w[op.li].raw}' → '${tt}'.`;
      } else if (MODAL_LIKE.has(tt) && MODAL_LIKE.has(lt)) {
        continue; // can/could/may/might/would/should: a nuance judged by meaning units and pitfalls, not a tense error
      } else if (CONJ_SYNONYMS.some((g) => g.has(tt) && g.has(lt))) {
        continue; // because/since/as, so/therefore: equally correct
      } else if ((tc === "aux" || tc === "modal") && (lc === "aux" || lc === "modal")) {
        // "haven't received" / "don't receive", "won't work" / "doesn't work": both grammatical, a nuance of time.
        category = "tense";
        severity = "minor";
        msg = `시제/조동사: '${w[op.li].raw}' 대신 '${tt}'가 이 상황에 더 자연스럽습니다.`;
      } else if (lc === "prep" && tc === "article" && VERB_PREPS[governorBase(op.li)]?.includes(lt) && op.li + 1 < w.length) {
        // "decide on date" vs "decide the date": "decide on" is fine — the article after it is what is missing.
        push(
          { from: op.li + 1, to: op.li + 1, category: "article", severity: "minor", fix: tt, messageKo: `명사 앞에 관사 '${tt}'가 필요합니다.`, skill: "articles" },
          { from: op.li + 1, to: op.li + 1, replacement: tt },
        );
        continue;
      } else if (lc === "prep" && tc === "article") {
        category = "preposition";
        severity = "major";
        msg = `'${w[op.li].raw}'는 필요 없는 전치사입니다. 이 동사는 목적어를 바로 받고, 명사 앞에는 '${tt}'가 필요합니다.`;
      } else if (tc === "conj" && lc === "conj") {
        // Connector choice is meaning, not grammar: noted, not a major grammar error.
        category = "word-choice";
        severity = "minor";
        msg = `연결어 선택: '${w[op.li].raw}' → '${tt}'. 두 말은 뜻이 조금 다르니 문맥에 맞는지 확인하세요.`;
      }
      push({ from: op.li, to: op.li + 1, category, severity, fix: tt, messageKo: msg, skill }, { from: op.li, to: op.li + 1, replacement: tt });
      continue;
    }
    if (op.type === "del") {
      if (movedL.has(op.li)) continue;
      const lt = w[op.li].norm;
      const c = wordClass(lt);
      if (c === "content" || c === "conj" || c === "modal" || c === "neg") continue;
      if (inTag(op.li)) continue; // ", aren't we?"
      // An extra be is an error only before a verb form it cannot take ("is depends"); "can't be opened",
      // "isn't working", "That's no problem", "as it is" are all correct groups.
      if (c === "be") {
        let n = op.li + 1;
        while (n < w.length && /^(not|still|also|just|really|always|never|already|now)$/.test(w[n].norm)) n++;
        const vi = verbInfo(w[n]?.norm ?? "");
        const participle = !!vi && (vi.form === "pp" || (vi.form === "past" && participleOf(vi.base) === w[n].norm));
        // "I was received it": a passive with an object after it is wrong, so that extra be stays an error.
        const objectAfter = /^(it|them|us|me|him|her|the|a|an|this|that|your|our|my|their)$/.test(w[n + 1]?.norm ?? "");
        const adjectiveToo = /^(free|clear|open|close|clean|dry|ready|complete|correct|separate|secure|empty|busy|right|wrong|fine|sure|calm|quiet|warm|cool|slow|fast|full|tired|late|light|clear|safe|present|due|like)$/.test(w[n]?.norm ?? "");
        if (op.li === w.length - 1 || w[op.li].breakAfter || !vi || vi.form === "ing" || adjectiveToo || (participle && !objectAfter)) continue;
      }
      // "need to make": an infinitive "to", not a preposition.
      if (lt === "to" && isBaseVerb(w[op.li + 1]?.norm ?? "")) continue;
      // A clause-final particle ("the meeting is over", "hang up") is not an extra preposition.
      if (c === "prep" && (op.li === w.length - 1 || w[op.li].breakAfter)) continue;
      if (APPROX.test(lt) && QUANTITY_START.test(w[op.li + 1]?.norm ?? "")) continue; // "about twice as high"
      // Indirect questions end with the verb: "let me know what the design pressure is".
      if (c === "be" && w.slice(0, op.li).some((x) => /^(what|which|how|where|when|why|who|whether|if)$/.test(x.norm)) && (op.li === w.length - 1 || w[op.li + 1]?.punct)) continue;
      // "decide on the date", "wait for a few minutes", "known about it": the verb takes this preposition.
      if (c === "prep" && VERB_PREPS[governorBase(op.li)]?.includes(lt)) continue;
      // "any changes to the design": a noun after a determiner, not a verb taking an object.
      const prevIsVerb = op.li > 0 && !!verbInfo(w[op.li - 1].norm) && !/^(a|an|the|any|some|no|many|few|more|our|your|their|my|this|that|these|those)$/.test(w[op.li - 2]?.norm ?? "");
      const map: Record<string, [ErrorCategory, Severity, string]> = {
        be: ["be-verb", "major", `불필요한 be동사 '${w[op.li].raw}'가 있습니다.`],
        aux: ["tense", "minor", `불필요한 조동사 '${w[op.li].raw}'가 있습니다.`],
        article: ["article", "minor", `여기서는 관사 '${w[op.li].raw}'가 필요 없습니다.`],
        prep: ["preposition", prevIsVerb ? "major" : "minor", prevIsVerb ? `'${w[op.li - 1].raw}'는 목적어를 바로 받는 동사라서 '${w[op.li].raw}'가 필요 없습니다.` : `불필요한 전치사 '${w[op.li].raw}'가 있습니다.`],
        pronoun: ["sentence-structure", "major", `'${w[op.li].raw}'가 다른 말과 겹칩니다(목적어 중복).`],
      };
      // An extra "it/them" is a duplicated object only when another object follows ("check it the rate").
      let k = op.li + 1;
      while (k < w.length && MOVABLE_ADVERBS.has(w[k].norm)) k++; // "check it first the rate"
      const nextL = w[k]?.norm ?? "";
      const objectFollows = ARTICLES.has(nextL) || /^(this|that|these|those|our|your|their|my|his|her|its)$/.test(nextL);
      if (c === "pronoun" && !(/^(it|them)$/.test(lt) && op.li > 0 && verbInfo(w[op.li - 1].norm) && objectFollows)) continue;
      const entry = map[c];
      if (!entry) continue;
      push({ from: op.li, to: op.li + 1, category: entry[0], severity: entry[1], fix: "", messageKo: entry[2], skill }, { from: op.li, to: op.li + 1, replacement: "" });
      continue;
    }
    if (op.type === "ins") {
      if (movedT.has(op.ti) || particleT.has(op.ti)) continue;
      const tt = tw[op.ti].norm;
      const c = wordClass(tt);
      if (c === "content" || c === "modal") continue;
      if (c === "be") {
        let a = op.at;
        while (a < w.length && /^(really|also|still|just|always|usually|actually|truly|certainly|already)$/.test(w[a].norm)) a++;
        if (simpleState.has(a)) continue; // "I (am) really looking forward" ↔ "I really look forward"
      }
      // "when you have a moment" ↔ "when you're free": an inserted have/do followed by a noun is a main verb (rewording).
      if (c === "aux") {
        const nt = tw[op.ti + 1]?.norm ?? "";
        if (!/^(not|been|being)$/.test(nt) && !verbInfo(nt)) continue;
      }
      // "because the flow has gone up" vs "because of the higher flow": a clause instead of a noun phrase.
      if (tt === "of" && w[op.at - 1]?.norm === "because") continue;
      // "makes the pressure drop too high": a causative verb takes object + adjective, no be.
      if (c === "be") {
        const cs = clauseStart(op.at);
        if (w.slice(cs, op.at).some((x) => /^(make|makes|made|making|keep|keeps|kept|find|finds|found|get|gets|got|let|lets|leave|leaves|left|consider|considers|considered|see|saw|want|wants|need|needs)$/.test(x.norm))) continue;
      }
      // "before deciding" ↔ "before we decide": a gerund after a preposition needs no subject.
      if (c === "pronoun" && /ing$/.test(w[op.at]?.norm ?? "") && PREPOSITIONS.has(w[op.at - 1]?.norm ?? "")) continue;
      // "the area reopens" ↔ "is reopened": verbs of change work both ways.
      if (c === "be") {
        const vi = verbInfo(w[op.at]?.norm ?? "");
        if (vi && (vi.form === "3sg" || vi.form === "past") && /^(open|reopen|close|start|begin|finish|end|change|increase|decrease|improve|stop|continue|resume|break|melt|dry|move)$/.test(vi.base)) continue;
      }
      // "…yesterday but (it) won't arrive…": a repeated subject may be left out after and/but/or.
      if (c === "pronoun" && /^(and|but|or|then)$/.test(w[op.at - 1]?.norm ?? "") && (verbInfo(w[op.at]?.norm ?? "") || OPENER.test(w[op.at]?.norm ?? ""))) continue;
      // "(for) this weekend", "(on) next Monday": deictic time words need no preposition.
      if (c === "prep" && /^(this|next|last|today|tomorrow|tonight|yesterday|every)$/.test(w[op.at]?.norm ?? "")) continue;
      // "My flight is (on) Friday night": on before a weekday is optional in speech.
      if (tt === "on" && /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(w[op.at]?.norm ?? "")) continue;
      // "To be honest," / "Honestly,", "In fact," / "Actually,": the same discourse marker.
      if (inIdiomSpan.has(op.ti)) continue;
      // "Is it possible…?" needs no second be: the question already opens with its be.
      // ("Will we (be) able…?" still needs it: a modal opener takes a verb after the subject.)
      if ((c === "be" || c === "aux") && inverted(op.at) && BE_FORMS.has(w[openerAt(op.at)]?.norm ?? "")) continue;
      // Casual replies leave out "I (am)": "Hope so.", "Don't think so.", "Sorry, …".
      if ((tt === "i" || tt === "am") && op.at === clauseStart(op.at) && /^(hope|think|guess|don't|do|didn't|wish|bet|suppose|love|appreciate|agree|sorry|afraid|glad|happy|sure|not)$/.test(w[op.at]?.norm ?? "")) continue;
      // "went up (by) 5%": by before the amount of a change is optional.
      if (tt === "by" && QUANTITY_START.test(w[op.at]?.norm ?? "")) {
        const pv = w[op.at - 1]?.norm ?? "";
        if (CHANGE_VERBS.has(verbInfo(pv)?.base ?? pv) || /^(up|down)$/.test(pv)) continue;
      }
      if (tt === "that") continue; // usually optional
      if (tt === "at" && tw[op.ti + 1]?.norm === "all") continue; // "(not spicy) at all" is optional emphasis
      // "I('d) suggest …": would softens the suggestion; leaving it out is not a grammar error.
      if (tt === "would" && /^(suggest|recommend|propose|say|think|advise|prefer|imagine|guess)$/.test(tw[op.ti + 1]?.norm ?? "")) continue;
      if (APPROX.test(tt) && QUANTITY_START.test(tw[op.ti + 1]?.norm ?? "")) continue; // "about 20%" is optional precision
      if (c === "pronoun" && /^(than|as)$/.test(tw[op.ti - 1]?.norm ?? "")) continue; // "than (we) expected"
      if (/^(us|them|him|me|it|you)$/.test(tt) && op.at > 0) continue; // optional objects ("send (us)", "tell (you)")
      const nextT = tw[op.ti + 1]?.norm ?? "";
      let entry: [ErrorCategory, Severity, string, ScoreBucket?] | null = null;
      if (c === "be") entry = ["be-verb", "major", `'${tt}'(be동사)가 빠졌습니다.`];
      else if (c === "aux" && tt === "will" && /^(base|3sg)$/.test(verbInfo(w[op.at]?.norm ?? "")?.form ?? "")) {
        // "You need to sign in" is fine for a rule; "I rejoin as soon as I can" promises an action and needs will.
        const stative = /^(need|have|want|think|know|like|hope|must|seem|mean|depend|cost|expect|believe|guess|suppose|prefer|plan)$/.test(verbInfo(w[op.at].norm)!.base);
        entry = stative ? ["tense", "minor", "앞으로의 일이라 'will'을 쓰면 더 자연스럽습니다. 현재형도 뜻은 통합니다."] : ["tense", "major", "앞으로 할 일(약속·계획)은 'will + 동사원형'으로 말합니다."];
      } else if (c === "aux" && /^(have|has|had)$/.test(tt) && !/present-perfect|cond-3/.test(skill) && /^(past|pp)$/.test(verbInfo(w[op.at]?.norm ?? "")?.form ?? "")) {
        // "make sure I understood" ↔ "I've understood", "was losing" ↔ "had been losing": a tense nuance here.
        entry = ["tense", "minor", `'${tt}'를 쓰는 완료형이 더 자연스럽지만 과거형도 뜻은 통합니다.`];
      }
      else if (c === "aux") entry = ["tense", "major", `시제를 만드는 '${tt}'가 빠졌습니다.`];
      else if (c === "article") entry = ["article", "minor", `명사 앞에 관사 '${tt}'가 필요합니다.`];
      else if (c === "prep" && tt === "to" && isBaseVerb(nextT)) entry = ["verb-form", "major", `'to + 동사원형'이 필요합니다: 'to ${nextT}'.`];
      else if (c === "prep") entry = ["preposition", "major", `전치사 '${tt}'가 빠졌습니다.`];
      else if (c === "pronoun") entry = ["sentence-structure", "major", `주어/목적어 '${tt}'가 빠졌습니다.`];
      else if (c === "conj") entry = ["sentence-structure", "minor", `연결어 '${tt}'가 빠졌습니다.`];
      else if (c === "neg") {
        // "Should it be …?" for "Shouldn't it be …?": a checking question either way, not a reversed meaning.
        const negQuestion = op.at > 0 && clauseStart(op.at - 1) === op.at - 1 && OPENER.test(w[op.at - 1].norm) && isSubjectWord(w[op.at]);
        // "Nobody has tested it" / "It has never been tested": the negation is in another word.
        if (w.some((x) => /^(nobody|nothing|none|neither|nor|never|without|no|fail|fails|failed)$/.test(x.norm))) continue;
        // "Oh no, …" / "No, …" as an interjection: leaving it out does not reverse anything.
        if (tt === "no" && (tw[op.ti].breakAfter || tw[op.ti - 1]?.norm === "oh" || op.ti === tw.length - 1)) continue;
        entry = negQuestion
          ? ["word-choice", "minor", `'~하지 않나요?'라고 확인할 때는 부정 의문문(예: Shouldn't it …?)이 더 자연스럽습니다. 뜻은 통합니다.`]
          : ["meaning-shift", "critical", `부정어 '${tt}'가 빠져 의미가 반대가 됩니다.`, "meaning"];
      }
      if (!entry) continue;
      push({ from: op.at, to: op.at, category: entry[0], severity: entry[1], bucket: entry[3], fix: tt, messageKo: entry[2], skill }, { from: op.at, to: op.at, replacement: tt });
    }
  }
  return { findings, edits };
}

/**
 * Consensus across equally close correct answers. Another valid answer vetoes a
 * finding only when it accepts the learner's word(s) there as they are (or, for a
 * missing word, does not need a word there). A word that other answers merely
 * align differently is still wrong, so "raw composition are changed" keeps its error
 * even though "…composition changed" aligns the words another way.
 */
function consensusFilter(
  findings: Finding[], w: Token[], others: { al: Alignment; tw: Token[] }[], skill: string,
): Finding[] {
  if (!others.length) return findings;
  const views = others.map((o) => {
    const raw = alignmentFindings(o.al, w, o.tw, skill, true).findings;
    const flagged = new Set<number>();
    const inserts = new Set<number>();
    for (const f of raw) {
      if (f.from === f.to) inserts.add(f.from);
      for (let i = f.from; i < f.to; i++) flagged.add(i);
    }
    const accepted = new Set<number>();
    for (const op of o.al.ops) {
      if (op.type === "ins") continue;
      if (op.type === "match") accepted.add(op.li);
      else if (!flagged.has(op.li) && op.type !== "del") {
        // An unflagged difference between two function words (since/because, in/within) or an
        // accepted inflection means this answer is fine with the learner's word.
        const lt = w[op.li].norm;
        const tt = o.tw[op.ti].norm;
        if (op.type === "inflect" || op.type === "spell" || (isFunctionWord(lt) && isFunctionWord(tt))) accepted.add(op.li);
      }
    }
    return { accepted, inserts };
  });
  return findings.filter((f) => {
    if (f.from === f.to) return views.every((v) => v.inserts.has(f.from));
    return views.every((v) => {
      for (let i = f.from; i < f.to; i++) if (v.accepted.has(i)) return false;
      return true;
    });
  });
}

const MOVABLE_ADVERBS = new Set(["first", "later", "also", "only", "already", "still", "yet", "again", "now", "today", "tomorrow", "together", "soon", "then", "carefully", "quickly", "again", "immediately", "regularly", "every", "next"]);

/** Korean-style "verb + adverb + object" order: "check first the rate". */
function isMisplacedAdverb(w: Token[], li: number): boolean {
  const t = w[li];
  if (!MOVABLE_ADVERBS.has(t.norm)) return false;
  const prev = w[li - 1]?.norm ?? "";
  const next = w[li + 1]?.norm ?? "";
  const prevIsVerbOrObj = !!verbInfo(prev) || /^(it|them|this|that)$/.test(prev);
  const nextStartsObject = ARTICLES.has(next) || /^(our|your|their|this|that|these|those|its|his|her)$/.test(next);
  return prevIsVerbOrObj && nextStartsObject;
}

/** Word-index ranges of sentences (split on . ! ? tokens). */
function sentenceRanges(tokens: Token[], w: Token[]): [number, number][] {
  const idx = new Map<Token, number>();
  w.forEach((t, i) => idx.set(t, i));
  const out: [number, number][] = [];
  let start = 0;
  let count = 0;
  for (const t of tokens) {
    if (t.punct) {
      if (/^[.!?]$/.test(t.norm) && count > start) {
        out.push([start, count]);
        start = count;
      }
      continue;
    }
    count = idx.get(t)! + 1;
  }
  if (count > start) out.push([start, count]);
  return out;
}

/**
 * Multi-sentence answers: align each learner sentence with its closest target
 * sentence (from any correct answer) instead of the whole answer at once.
 */
function sentenceAlignedFindings(q: Question, tokens: Token[], w: Token[], skill: string): { findings: Finding[]; edits: Edit[] } | null {
  const ranges = sentenceRanges(tokens, w);
  if (ranges.length < 2) return null;
  const targetSentences = correctTargets(q).flatMap((t) => {
    const tt = tokenize(t);
    const tw = words(tt);
    return sentenceRanges(tt, tw).map(([a, b]) => tw.slice(a, b));
  });
  const findings: Finding[] = [];
  const edits: Edit[] = [];
  for (const [a, b] of ranges) {
    const part = w.slice(a, b);
    const ranked = targetSentences.map((ts) => ({ ts, al: align(part, ts) })).sort((x, y) => x.al.distance - y.al.distance);
    const best = ranked[0];
    if (!best || best.al.distance > CLOSE_DISTANCE || best.ts.length < 2) continue;
    const r = alignmentFindings(best.al, part, best.ts, skill);
    const others = ranked.slice(1).filter((o) => o.al.distance <= Math.min(CLOSE_DISTANCE, best.al.distance + CONSENSUS_MARGIN) && o.ts.length >= 2);
    const kept = consensusFilter(r.findings, part, others.map((o) => ({ al: o.al, tw: o.ts })), skill);
    const ranges2 = new Set(kept.map((f) => `${f.from}:${f.to}`));
    findings.push(...kept.map((f) => ({ ...f, from: f.from + a, to: f.to + a })));
    edits.push(...r.edits.filter((e) => ranges2.has(`${e.from}:${e.to}`)).map((e) => ({ ...e, from: e.from + a, to: e.to + a })));
  }
  return { findings, edits };
}

function applyEdits(tokens: Token[], w: Token[], edits: Edit[]): string {
  // Resolve overlaps by priority (higher wins), then by order.
  const sorted = [...edits].sort((a, b) => b.priority - a.priority);
  const kept: Edit[] = [];
  for (const e of sorted) {
    if (!kept.some((k) => overlaps(k, e) || (k.from === k.to && e.from === e.to && k.from === e.from && k.replacement === e.replacement))) kept.push(e);
  }
  const byStart = new Map<number, Edit[]>();
  for (const e of kept) byStart.set(e.from, [...(byStart.get(e.from) ?? []), e]);

  const wordIndex = new Map<Token, number>();
  w.forEach((t, i) => wordIndex.set(t, i));
  const touched = new Set<number>();
  for (const e of kept) for (let i = e.from; i < Math.max(e.to, e.from + 1); i++) touched.add(i);

  const parts: { text: string; punct?: boolean }[] = [];
  let skipUntil = -1;
  let lastSpan = -1;
  const emitInsertions = (i: number) => {
    for (const e of (byStart.get(i) ?? []).filter((x) => x.from === x.to)) parts.push({ text: e.replacement });
  };
  const lastWordTok = w[w.length - 1];
  let endInserted = false;
  for (const t of tokens) {
    if (t.punct) {
      if (!endInserted && lastWordTok && t.start >= lastWordTok.end) {
        emitInsertions(w.length);
        endInserted = true;
      }
      // Punctuation inside a replaced span goes with it; punctuation right after the span stays ("This side, please." → "This way, please.").
      if (skipUntil < 0 || t.start >= (w[skipUntil - 1]?.end ?? 0) || t.start >= (lastWordTok?.end ?? 0)) parts.push({ text: t.raw, punct: true });
      continue;
    }
    const i = wordIndex.get(t)!;
    emitInsertions(i);
    if (i < skipUntil) continue;
    skipUntil = -1;
    const rep = (byStart.get(i) ?? []).find((x) => x.to > x.from);
    if (rep) {
      if (rep.replacement) parts.push({ text: rep.replacement });
      skipUntil = rep.to;
      continue;
    }
    if (t.expanded) {
      const spanTouched = w.some((o, k) => o.start === t.start && touched.has(k));
      if (!spanTouched) {
        if (lastSpan !== t.start) parts.push({ text: t.raw });
        lastSpan = t.start;
        continue;
      }
      parts.push({ text: t.norm });
      continue;
    }
    parts.push({ text: t.raw });
  }
  if (!endInserted) emitInsertions(w.length);
  return capitalizeSentence(joinWords(parts));
}

/**
 * The grammar point an alignment difference is about, when the words make it
 * unambiguous ("are changed" → "has changed" is present perfect whatever the
 * question was mainly practising). Null keeps the question's main skill.
 */
function grammarSkillFor(e: ErrorSpan, text: string): string | null {
  const fix = e.fix.toLowerCase();
  const next = (text.slice(e.end).match(/[A-Za-z']+/)?.[0] ?? "").toLowerCase();
  switch (e.category) {
    case "tense":
      return /^(has|have|had)$/.test(fix) ? "present-perfect" : null;
    case "be-verb":
      return /ing$/.test(next) ? "progressive" : "be-adj";
    case "article":
      return "articles";
    case "countability":
      return "countability";
    case "word-order":
      return "word-order";
    case "agreement":
      return "agreement";
    case "preposition":
      return e.text === "" ? "verb-prep" : null;
    default:
      return null;
  }
}

function grammarNote(scored: ErrorSpan[]): string {
  const g = scored.filter((e) => e.bucket === "grammar" && e.category !== "spelling");
  const sp = scored.filter((e) => e.category === "spelling").length;
  if (!g.length) return sp ? `문법 오류 없음 · 철자 ${sp}개(감점 거의 없음)` : "문법 오류를 찾지 못했습니다.";
  return `문법 오류 ${g.length}개${sp ? ` · 철자 ${sp}개` : ""}`;
}

function termNote(termUnits: MeaningCheck[]): string {
  if (!termUnits.length) return "이 문항은 용어 부담이 적습니다.";
  const other = termUnits.filter((m) => !m.present);
  return other.length
    ? `기준 답안 용어: ${other.map((m) => m.en).join(", ")} — 현장마다 달라 점수에 반영하지 않습니다.`
    : "기준 답안과 같은 용어를 썼습니다(점수에는 반영하지 않음).";
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Clause punctuation right after word i (a comma, a full stop …). */
function brokenAfterW(w: Token[], i: number): boolean {
  return !!w[i] && !!w[i + 1] && !!w[i].breakAfter;
}

export interface LocalEvalOptions {
  /** Used only to annotate the summary. */
  hintLevel?: number;
  /** This learner's answers that Claude graded fully correct (core/learned.ts): accepted like stored answers. */
  learned?: string[];
}

export function evaluateLocal(q: Question, answer: string, opts: LocalEvalOptions = {}): Evaluation {
  const text = answer.trim();
  const tokens = tokenize(text);
  const w = words(tokens);
  const primarySkill = q.skills[0];
  const base: Omit<Evaluation, "scores" | "errors" | "meaning" | "corrected" | "summaryKo" | "grammarKo" | "review" | "confidence" | "exact" | "target"> = {
    questionId: q.id,
    answer: text,
    mode: q.mode,
    evaluator: "local",
    evaluatorLabel: LOCAL_EVALUATOR_LABEL,
    recommended: q.reference,
    advanced: q.advanced,
    alternatives: q.accepted.slice(0, 3),
  };

  if (!w.length) {
    const zero = { score: 0, noteKo: "답이 없습니다." };
    return {
      ...base,
      scores: { meaning: zero, grammar: zero, terminology: zero, organization: zero, comprehensibility: zero, overall: 0 },
      errors: [],
      meaning: checkMeaning(q, w),
      corrected: q.reference,
      summaryKo: "답을 입력하지 않았습니다. 기준 답안을 보고 구조를 익힌 뒤 다시 시도하세요.",
      grammarKo: q.explanationKo,
      review: { add: true, reasonKo: "답하지 못한 문항은 복습 목록에 추가됩니다." },
      confidence: "high",
      exact: false,
      target: q.reference,
    };
  }

  const norm = normalizeForMatch(text);
  const learned = opts.learned ?? [];
  const storedExact = correctTargets(q).find((t) => normalizeForMatch(t) === norm);
  const learnedExact = storedExact ? undefined : learned.find((t) => normalizeForMatch(t) === norm);
  const exactTarget = storedExact ?? learnedExact;
  const meaning = checkMeaning(q, w);
  // Claude approved this exact wording, so every meaning chunk is in it (some in words the question does not list).
  if (learnedExact) for (const m of meaning) m.present = true;
  if (exactTarget) {
    const full = { score: 100, noteKo: "정확합니다." };
    return {
      ...base,
      scores: { meaning: full, grammar: full, terminology: full, organization: full, comprehensibility: { score: 100, noteKo: "국제 회의에서 바로 이해되는 문장입니다." }, overall: 100 },
      errors: [],
      meaning,
      corrected: capitalizeSentence(text),
      summaryKo: learnedExact ? "정확합니다. 전에 Claude가 정확하다고 확인한 내 표현과 같아 바로 채점했습니다." : "정확합니다. 회의에서 그대로 써도 좋은 문장입니다.",
      grammarKo: q.explanationKo,
      review: { add: false, reasonKo: "오류가 없어 별도 복습이 필요 없습니다. 기술 숙련도 기록에는 반영됩니다." },
      confidence: "high",
      exact: true,
      ...(learnedExact ? { learned: true } : {}),
      target: exactTarget,
    };
  }

  const ranked = rankTargets(q, w);
  const { target, tw, al } = ranked[0];
  // Close to the learner's own wording that Claude approved: a meaning chunk that wording says in other words
  // (no listed synonym matches) is not missing here either, as long as every content word of that wording outside
  // the listed chunks is here too ("the previous one" for "the previous slide"; "ordered" for "got" is not excused).
  // Approved wordings never raise confidence: a near variant can carry a new mistake the rules do not see.
  let usedLearned = false;
  const here = new Set(w.map((t) => t.norm));
  for (const t of learned) {
    const ltw = words(tokenize(t));
    if (align(w, ltw).distance > CLOSE_DISTANCE) continue;
    const listed = new Set<number>();
    for (const u of q.meaning) {
      const mm = matchAny(u.any, ltw, 2);
      if (mm) for (let i = mm.from; i < mm.to; i++) listed.add(i);
    }
    if (!ltw.every((x, i) => listed.has(i) || isFunctionWord(x.norm) || here.has(x.norm))) continue;
    const inApproved = checkMeaning(q, ltw);
    for (const m of meaning) {
      if (m.present || inApproved.find((x) => x.id === m.id)?.present) continue;
      m.present = true;
      usedLearned = true;
    }
  }
  const close = al.distance <= CLOSE_DISTANCE && tw.length >= 2;
  const findings: Finding[] = [];
  const edits: Edit[] = [];

  // 1) Question-specific pitfalls (highest priority, carry the best explanations).
  for (const p of q.pitfalls ?? []) {
    const m = matchPattern(compilePattern(p.pattern), w, 0);
    if (!m) continue;
    findings.push({
      from: m.from, to: m.to, category: p.category, severity: p.severity, bucket: p.bucket ?? defaultBucket(p.category),
      fix: p.fix, messageKo: p.messageKo, skill: p.skill ?? primarySkill, source: "pitfall", priority: 3,
    });
    edits.push({ from: m.from, to: m.to, replacement: p.fix, priority: 3 });
  }

  // 2) General grammar rules.
  for (const r of runRules(w)) {
    findings.push({
      from: r.from, to: r.to, category: r.category, severity: r.severity, bucket: defaultBucket(r.category),
      fix: r.replacement, messageKo: r.messageKo, skill: r.skill, source: "rule", priority: 2,
    });
    edits.push({ from: r.from, to: r.to, replacement: r.replacement, priority: 2 });
  }

  // 3) Alignment against the closest correct answer (only when the learner attempted that structure).
  //    A finding survives only if every other close target agrees, so mixing two valid variants is not an error.
  const multi = sentenceAlignedFindings(q, tokens, w, primarySkill);
  if (multi) {
    findings.push(...multi.findings);
    edits.push(...multi.edits);
  } else if (close) {
    const a = alignmentFindings(al, w, tw, primarySkill);
    // Only answers about as close as the best one get a vote (a learner mixing two valid variants).
    const others = ranked.slice(1).filter((r) => r.al.distance <= Math.min(CLOSE_DISTANCE, al.distance + CONSENSUS_MARGIN) && r.tw.length >= 2);
    const keptFindings = consensusFilter(a.findings, w, others, primarySkill);
    const keptRanges = new Set(keptFindings.map((f) => `${f.from}:${f.to}`));
    findings.push(...keptFindings);
    edits.push(...a.edits.filter((e) => keptRanges.has(`${e.from}:${e.to}`) || keptFindings.some((f) => f.category === "word-order" && e.replacement === w[f.from]?.raw)));
  }

  // 4) Reversed meaning: a close answer that adds or drops the verb's "not" (or "never") says the opposite
  //    ("We don't need to update the PFD" for "We need to update the PFD"). Checked only against close answers,
  //    statements of 4+ words, and when no other close answer has the same polarity; words that carry negation
  //    themselves ("unable", "nothing", "without") leave it to Claude.
  const negationFlip = (() => {
    if (!close || tw.length < 4 || w.length < 4) return null;
    const lexical = (ws: Token[]) =>
      ws.some(
        (t) =>
          /^(un|im|in|dis)(able|sure|clear|available|possible|likely|aware|happy|comfortable|agree|agrees|agreed|like|likes)$/.test(t.norm) ||
          /^(nothing|nobody|none|neither|nor|without|hardly|barely|fail|fails|failed|lack|lacks|instead|rather|unless|until|no|miss|missed|missing|forget|forgot|forgotten|lose|lost|refuse|refused|avoid|avoided|doubt|skip|skipped|cancel|cancelled|canceled|postpone|postponed|wrong|late|behind|short|less|fewer|still|anymore|longer|broken|stopped|dead|down|out|off|empty|closed|shut|nope|nah)$/.test(t.norm),
      );
    // Polarity of statements only: questions ("Why don't we …?", "…, aren't we?"), commands ("Don't worry") and
    // conditions ("If that doesn't work, …") are paraphrased with either polarity.
    const sentencesOf = (ws: Token[]) => {
      const out: Token[][] = [];
      for (let i = 0, from = 0; i < ws.length; i++) {
        if (!ws[i].sentenceEnd && i < ws.length - 1) continue;
        out.push(ws.slice(from, i + 1));
        from = i + 1;
      }
      return out;
    };
    const negCount = (ws: Token[], statementsOnly: boolean) => {
      let n = 0;
      for (const sent of sentencesOf(ws)) {
        if (statementsOnly && sent[sent.length - 1]?.question) continue;
        for (let i = 0; i < sent.length; i++) {
          const t = sent[i];
          if (!(t.norm === "never" || (t.norm === "not" && i > 0 && (AUXILIARIES.has(sent[i - 1].norm) || MODALS.has(sent[i - 1].norm) || BE_FORMS.has(sent[i - 1].norm) || /^(need|dare|could|can)$/.test(sent[i - 1].norm))))) continue;
          let c = i - 1;
          while (c > 0 && !brokenAfterW(sent, c - 1)) c--;
          // "Don't worry", "Don't forget …": a command added to the answer ("Don't think so." is a statement without "I");
          // "please don't hesitate …" is one too, even without a comma before it.
          if (sent[i - 1]?.norm === "do" && (c === i - 1 || /^(please|just|and|so)$/.test(sent[i - 2]?.norm ?? "")) && /^(worry|hesitate|forget|rush|panic|mention|bother|touch|be|get|take|let|go|miss|wait|stress)$/.test(sent[i + 1]?.norm ?? "")) continue;
          // "Why don't we …", "can't we …", "don't you think …": a suggestion or question, also when said without "?".
          // ("That's not it." keeps its "not": only a contracted n't before a subject is an inverted question.)
          if (sent[i - 2]?.norm === "why" || (sent[i].expanded && SUBJECT_PRONOUNS.has(sent[i + 1]?.norm ?? ""))) continue;
          // A condition close before the negation ("If that doesn't work, …"); far back, the "if" clause has ended
          // even when no comma marks it ("if we had cleaned the strainer last week the pump wouldn't have tripped").
          if (sent.slice(Math.max(c, i - 6), i).some((x) => /^(if|unless|whether|or|when|before|until)$/.test(x.norm))) continue;
          n++;
        }
      }
      return n;
    };
    if (lexical(w) || lexical(tw)) return null;
    // 1) The whole answer and the closest answer differ in polarity, counting every negation (a "never" inside
    //    "…, but why not?" still counts) …
    if ((negCount(w, false) === 0) === (negCount(tw, false) === 0)) return null;
    const near = ranked.filter((r) => r.al.distance <= CLOSE_DISTANCE && r.tw.length >= 4);
    if (near.some((r) => lexical(r.tw) || (negCount(r.tw, false) === 0) === (negCount(w, false) === 0))) return null;
    // 2) … and one statement of the answer says the opposite of the matching statement of a close answer
    //    (an extra sentence the stored answers do not have is not compared).
    const targetSentences = near.flatMap((r) => sentencesOf(r.tw)).filter((ts) => ts.length >= 3 && !ts[ts.length - 1]?.question);
    for (const sent of sentencesOf(w)) {
      if (sent.length < 3 || sent[sent.length - 1]?.question) continue;
      const scored = targetSentences.map((ts) => ({ ts, d: align(sent, ts).distance })).sort((a, b) => a.d - b.d);
      const best = scored[0];
      if (!best || best.d > CLOSE_DISTANCE) continue;
      const mine = negCount(sent, true);
      if ((mine === 0) === (negCount(best.ts, true) === 0)) continue;
      if (scored.some((x) => x.d <= best.d + CONSENSUS_MARGIN && (negCount(x.ts, true) === 0) === (mine === 0))) continue;
      const offset = w.indexOf(sent[0]);
      const k = sent.findIndex((t, i) => t.norm === "never" || (t.norm === "not" && i > 0));
      return { extra: mine > 0, at: k >= 0 ? offset + k : -1 };
    }
    return null;
  })();
  if (negationFlip) {
    const i = negationFlip.extra ? negationFlip.at : -1;
    findings.push({
      from: i >= 0 ? i : 0, to: i >= 0 ? i + 1 : 0, category: "meaning-shift", severity: "major", bucket: "meaning", fix: negationFlip.extra ? "" : "not",
      messageKo: negationFlip.extra
        ? "부정어(not/never)가 들어가 하려던 말과 뜻이 반대가 됩니다. 한국어 문장에는 부정의 뜻이 없습니다."
        : "부정어(not/never)가 빠져 하려던 말과 뜻이 반대가 됩니다. 한국어 문장은 부정문입니다.",
      skill: primarySkill, source: "alignment", priority: 3,
    });
  }

  // 5) A wrong number: the answer says a time, amount or number that no correct answer has, where the closest one
  //    has another ("Line 4" for "Line 5"). Alignment treats numbers as content words, so this is checked here;
  //    "3" for "three" is the same number; numbers of different units ("24 months" / "two years") are not compared.
  //    A meaning chunk that also misses the number is not charged twice (meaning takes the worse of the two).
  const slip = numberSlip(w, text, [...correctTargets(q), ...learned], target);
  if (slip) {
    const startsSentence = slip.at.from === 0 || !!w[slip.at.from - 1]?.sentenceEnd;
    const fix = startsSentence ? slip.fix.raw : slip.fix.raw.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
    findings.push({
      from: slip.at.from, to: slip.at.to, category: "meaning-shift", severity: "major", bucket: "meaning", fix,
      messageKo: `숫자가 다릅니다: '${slip.at.raw}' → '${fix}'. 한국어 문장의 시간·수량·번호를 그대로 말해야 뜻이 맞습니다.`,
      skill: primarySkill, source: "meaning", priority: 3,
    });
    edits.push({ from: slip.at.from, to: slip.at.to, replacement: fix, priority: 3 });
  }

  // Alignment insertions next to a pitfall/rule fix that already supplies the word are redundant.
  const explained = (f: { from: number; to: number; fix: string; priority: number }) =>
    f.priority === 1 && f.from === f.to &&
    [...findings, ...edits.map((e) => ({ from: e.from, to: e.to, fix: e.replacement, priority: e.priority }))].some(
      (o) => o.priority > 1 && (o.from === f.from || o.to === f.from) && words(tokenize(o.fix)).some((t) => t.norm === f.fix.toLowerCase()),
    );
  for (let i = findings.length - 1; i >= 0; i--) if (explained(findings[i])) findings.splice(i, 1);
  for (let i = edits.length - 1; i >= 0; i--) if (explained({ ...edits[i], fix: edits[i].replacement })) edits.splice(i, 1);

  // Deduplicate: one error per location, highest priority wins.
  findings.sort((a, b) => b.priority - a.priority || a.from - b.from);
  const kept: Finding[] = [];
  for (const f of findings) {
    const dup = kept.some((k) => overlaps(k, f) || (k.from === f.from && k.to === f.to) || (k.to === f.from && k.to > k.from && f.from === f.to && k.category === f.category));
    if (!dup) kept.push(f);
  }
  kept.sort((a, b) => a.from - b.from || a.to - b.to);

  // Missing critical meaning units become meaning errors (charged once, to meaning/terminology).
  const missingUnits = meaning.filter((m) => !m.present);

  const errors: ErrorSpan[] = kept.map((f, i) => {
    const r = charRange(w, f.from, f.to, text);
    return {
      id: `e${i + 1}`,
      category: f.category,
      severity: f.severity,
      bucket: f.bucket,
      start: r.start,
      end: r.end,
      text: text.slice(r.start, r.end),
      fix: f.fix,
      messageKo: f.messageKo,
      skill: f.skill,
      source: f.source,
    };
  });
  // Alignment findings carry the question's main skill; file them under the grammar they are about.
  for (const e of errors) if (e.source === "alignment" && e.skill === primarySkill) e.skill = grammarSkillFor(e, text) ?? e.skill;
  for (const m of meaning.filter((x) => x.fuzzy)) {
    if (!errors.some((e) => e.category === "spelling")) {
      // Spelling inside a meaning unit is reported by alignment when close; otherwise note it lightly.
      if (!close) errors.push({ id: `s-${m.id}`, category: "spelling", severity: "minor", bucket: "grammar", start: text.length, end: text.length, text: "", fix: m.en, messageKo: `'${m.en}' 부분의 철자를 확인하세요.`, skill: primarySkill, source: "meaning" });
    }
  }

  // ── Scores ──
  // Site-specific word choice is advisory: never scored, never reviewed, never "corrected" away.
  for (const e of errors) if (e.category === "terminology") e.advisory = true;
  const weight = (id: string) => q.meaning.find((u) => u.id === id)?.weight ?? 1;
  // Meaning counts the message chunks; a term slot counts only when the message cannot work without it.
  const scoredUnits = meaning.filter((m) => !m.term || m.critical);
  const termUnits = meaning.filter((m) => m.term);
  const cover = (list: MeaningCheck[]) => {
    const total = list.reduce((s, m) => s + weight(m.id), 0);
    if (!total) return 1;
    return list.filter((m) => m.present).reduce((s, m) => s + weight(m.id), 0) / total;
  };
  const pen = bucketPenalties(errors);
  // A missing unit and a meaning-shift error usually describe the same problem: take the worse, never the sum.
  let meaningScore = 100 * cover(scoredUnits);
  if (scoredUnits.some((m) => m.critical && !m.present)) meaningScore = Math.min(meaningScore, 45);
  meaningScore = Math.min(meaningScore, 100 - pen.meaning);
  const grammarScore = 100 - pen.grammar;
  // Words the learner left out that are already reported as errors do not count again as "too short".
  const explainedMissing = errors.filter((e) => e.start === e.end && e.source !== "meaning").length;
  const ratio = (w.length + explainedMissing) / Math.max(1, tw.length);
  const lengthPenalty = ratio < 0.5 ? 25 : ratio < 0.7 ? 10 : ratio > 2.2 ? 10 : 0;
  const orgScore = 100 - pen.organization - lengthPenalty;

  const M = clamp(meaningScore);
  const G = clamp(grammarScore);
  const T = clamp(100 * cover(termUnits));
  const O = clamp(orgScore);
  const C = clamp(0.6 * M + 0.2 * O + 0.2 * Math.max(G, 40));
  let overall = overallFrom(M, G, O);
  if (errors.some((e) => e.category === "meaning-shift" && e.severity === "critical")) overall = Math.min(overall, 60);

  // ── Corrections: never output a correction our own rules reject ──
  const validCorrection = (text: string) => {
    const cw = words(tokenize(text));
    return runRules(cw).length === 0 && !(q.pitfalls ?? []).some((p) => matchPattern(compilePattern(p.pattern), cw, 0));
  };
  const closer = (text: string) => {
    const cw = words(tokenize(text));
    return Math.min(...correctTargets(q).map((t) => align(cw, words(tokenize(t))).distance)) <= al.distance + 1e-9;
  };
  // Advisory word-choice notes keep the learner's own (site) wording in the correction.
  const advisoryRanges = new Set(kept.filter((f) => f.category === "terminology").map((f) => `${f.from}:${f.to}`));
  for (let i = edits.length - 1; i >= 0; i--) if (advisoryRanges.has(`${edits[i].from}:${edits[i].to}`)) edits.splice(i, 1);
  let corrected = applyEdits(tokens, w, edits);
  if (negationFlip) corrected = capitalizeSentence(target);
  else if (!validCorrection(corrected) || !closer(corrected)) {
    const strong = applyEdits(tokens, w, edits.filter((e) => e.priority > 1));
    corrected = validCorrection(strong) ? strong : capitalizeSentence(target);
  }
  const scored = scoredErrors(errors);
  const majorErrors = scored.filter((e) => e.severity !== "minor");
  const grammarErrors = scored.filter((e) => e.bucket !== "meaning" && e.category !== "spelling");
  const mainError = [...scored].sort((a, b) => PENALTY[b.severity] - PENALTY[a.severity] || Number(a.category === "spelling") - Number(b.category === "spelling"))[0];

  const compNote = C >= 85 ? "국제 회의에서 쉽게 이해됩니다." : C >= 65 ? "대체로 이해되지만 듣는 사람이 한 번 더 생각해야 합니다." : "의미가 정확히 전달되기 어렵습니다.";

  const spellingOnly = scored.length > 0 && scored.every((e) => e.category === "spelling");
  const scoredMissing = missingUnits.filter((m) => !m.term || m.critical);
  let summaryKo: string;
  if ((!scored.length || spellingOnly) && !scoredMissing.length) {
    summaryKo = !close
      ? "규칙 기반 검사에서는 오류를 찾지 못했지만, 기준 답안과 표현이 많이 달라 문법을 모두 확인하지는 못했습니다."
      : spellingOnly
        ? "문법은 정확합니다. 철자 실수만 있어 점수에는 거의 영향이 없습니다."
        : "기준 답안과 표현은 다르지만 문법과 의미 모두 문제를 찾지 못했습니다.";
  } else {
    const lead = !grammarErrors.length
      ? close
        ? "문법은 정확합니다."
        : "규칙 기반 검사에서는 문법 오류를 찾지 못했지만, 표현이 기준 답안과 많이 달라 모두 확인하지는 못했습니다."
      : M >= 85 ? "의미는 잘 전달되지만 문법을 고쳐야 합니다." : "문법과 의미 모두 다시 확인하세요.";
    const issue = mainError && mainError.category !== "spelling" ? mainError.messageKo.split(/(?<=[.。])\s/)[0] : "";
    const parts = [lead];
    if (issue) parts.push(`핵심: ${issue}`);
    if (scoredMissing.length) parts.push(`빠진 의미: ${scoredMissing.map((m) => `'${m.ko}'`).join(", ")}.`);
    summaryKo = parts.join(" ").replace(/\s+/g, " ").trim();
  }

  const add = majorErrors.length > 0 || overall < 80 || (opts.hintLevel ?? 0) >= 2 || missingUnits.some((m) => m.critical);
  const reasonKo = add
    ? majorErrors.length
      ? `${majorErrors.length}개의 주요 오류가 있어 다른 문장으로 다시 연습합니다.`
      : missingUnits.some((m) => m.critical)
        ? "핵심 의미가 빠져 다시 연습합니다."
        : (opts.hintLevel ?? 0) >= 2
          ? "힌트 도움을 받은 답이라 독립적으로 다시 확인합니다."
          : "점수가 기준(80)보다 낮아 다시 연습합니다."
    : scored.length
      ? "사소한 오류만 있어 복습 목록에는 넣지 않고 숙련도 기록에만 반영합니다."
      : "정확합니다. 숙련도 기록에 반영됩니다.";

  const confidence: Evaluation["confidence"] = close ? (al.distance <= HIGH_DISTANCE ? "high" : "medium") : "low";
  const confidenceNoteKo =
    confidence === "low"
      ? "기준 답안과 표현이 많이 달라 의미 단위와 일반 문법 규칙으로만 검사했습니다. 이 방식은 처음 보는 문장의 오류를 놓칠 수 있습니다."
      : confidence === "medium"
        ? "가장 가까운 기준 답안과 비교한 결과입니다."
        : undefined;

  return {
    ...base,
    scores: {
      meaning: { score: M, noteKo: scoredMissing.length ? `빠진 의미: ${scoredMissing.map((m) => `'${m.ko}'`).join(", ")}.` : M >= 85 ? "핵심 의미와 표현이 모두 들어 있습니다." : "의미가 일부 달라졌습니다." },
      grammar: { score: G, noteKo: grammarNote(scored) },
      terminology: { score: T, noteKo: termNote(termUnits) },
      organization: { score: O, noteKo: errors.some((e) => e.category === "word-order") ? "어순을 다시 확인하세요." : ratio < 0.7 ? "문장이 불완전하거나 너무 짧습니다." : "문장 구성이 자연스럽습니다." },
      comprehensibility: { score: C, noteKo: compNote },
      overall,
    },
    errors,
    meaning,
    corrected,
    summaryKo,
    grammarKo: mainError ? `${mainError.messageKo}\n\n${q.explanationKo}` : q.explanationKo,
    review: { add, reasonKo },
    confidence,
    confidenceNoteKo,
    exact: false,
    ...(usedLearned ? { learned: true } : {}),
    target,
  };
}
