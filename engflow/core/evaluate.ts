import { align, type AlignOp, type Alignment } from "./align";
import { compilePattern, matchAny, matchPattern } from "./pattern";
import { runRules } from "./rules";
import {
  ARTICLES, AUXILIARIES, BE_FORMS, CONJUNCTIONS, MODALS, NEGATIONS, PREPOSITIONS, SUBJECT_PRONOUNS,
  capitalizeSentence, isFunctionWord, joinWords, normalizeForMatch, tokenize, words, type Token,
} from "./text";
import { isBaseVerb, verbInfo } from "./lexicon";
import type {
  ErrorCategory, ErrorSpan, Evaluation, MeaningCheck, Question, ScoreBucket, Severity,
} from "./types";

export const LOCAL_EVALUATOR_LABEL = "규칙 기반 분석 (오프라인)";

const PENALTY: Record<Severity, number> = { minor: 8, major: 18, critical: 30 };
const SPELLING_PENALTY = 3;
const CLOSE_DISTANCE = 0.45;
const CONSENSUS_MARGIN = 0.08;

export function defaultBucket(c: ErrorCategory): ScoreBucket {
  if (c === "meaning-shift" || c === "missing-content") return "meaning";
  if (c === "terminology") return "terminology";
  if (c === "word-order" || c === "sentence-structure") return "organization";
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
    const m = matchAny(u.any, w, 2);
    return { id: u.id, en: u.en, ko: u.ko, present: !!m, fuzzy: m?.fuzzy || undefined, term: !!u.term, critical: !!u.critical };
  });
}

const PREP_SYNONYMS = [new Set(["in", "within", "during"]), new Set(["about", "on", "regarding"]), new Set(["to", "toward", "towards"])];
const APPROX = /^(about|around|approximately|roughly|nearly|almost)$/;
const QUANTITY_START = /^([0-9]|twice|half|double|three|two|four|five|ten|one)/;
const MODAL_LIKE = new Set(["can", "could", "may", "might", "must", "should", "will", "would", "shall"]);
const CONJ_SYNONYMS = [new Set(["because", "since", "as"]), new Set(["so", "therefore", "and"]), new Set(["when", "once", "after"]), new Set(["although", "though", "but"]), new Set(["if", "whether"])];
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
    contentSub(o) || (!!o && o.type === "ins" && !isFunctionWord(tw[o.ti].norm)) || (!!o && o.type === "del" && !isFunctionWord(w[o.li].norm));
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
    const run = runOf(k, op.type);
    if (run.length < 2) return false;
    const wordsInRun = run.map((o) => (o.type === "ins" ? tw[o.ti].norm : o.type === "del" ? w[o.li].norm : ""));
    return wordsInRun.some((x) => !isFunctionWord(x) || /^(us|them|him|me|please)$/.test(x)) || wordsInRun.some((x) => MODALS.has(x) || AUXILIARIES.has(x));
  };
  const anchored = (k: number) => {
    if (phraseRun(k)) return false;
    const prev = al.ops[k - 1];
    const next = al.ops[k + 1];
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

  for (let k = 0; k < al.ops.length; k++) {
    const op = al.ops[k];
    if (op.type === "match") continue;
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
      if (isVerb && vt!.form === "base" && (vl!.form === "3sg" || vl!.form === "past" || BE_FORMS.has(lt))) continue;
      if (BE_FORMS.has(lt) && (tt === "been" || tt === "be")) continue; // "was damaged" vs "may have been damaged": both valid
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
      const lc = wordClass(lt);
      const tc = wordClass(tt);
      let category: ErrorCategory = "word-choice";
      let severity: Severity = "minor";
      let msg = `'${w[op.li].raw}' 대신 '${tt}'가 자연스럽습니다.`;
      if (lc === "be" && tc === "be") {
        category = "agreement";
        severity = "major";
        msg = `be동사 형태가 주어/시제와 맞지 않습니다: '${w[op.li].raw}' → '${tt}'.`;
      } else if (tc === "prep" && lc === "prep" && PREP_SYNONYMS.some((g) => g.has(tt) && g.has(lt))) {
        continue;
      } else if (tc === "prep" && lc === "prep") {
        category = "preposition";
        severity = (PLACE_PREPS.has(tt) && PLACE_PREPS.has(lt)) || (DEADLINE_PREPS.has(tt) && DEADLINE_PREPS.has(lt)) ? "minor" : "major";
        msg = `전치사 선택: '${w[op.li].raw}' → '${tt}'.`;
      } else if (tc === "article" && lc === "article") {
        category = "article";
        msg = `관사: '${w[op.li].raw}' → '${tt}'.`;
      } else if (MODAL_LIKE.has(tt) && MODAL_LIKE.has(lt)) {
        continue; // can/could/may/might/would/should: a nuance judged by meaning units and pitfalls, not a tense error
      } else if (CONJ_SYNONYMS.some((g) => g.has(tt) && g.has(lt))) {
        continue; // because/since/as, so/therefore: equally correct
      } else if ((tc === "aux" || tc === "modal") && (lc === "aux" || lc === "modal")) {
        category = "tense";
        severity = "major";
        msg = `시제/조동사: '${w[op.li].raw}' → '${tt}'. 의미(가능성·시점)가 달라집니다.`;
      } else if (lc === "prep" && tc === "article") {
        category = "preposition";
        severity = "major";
        msg = `'${w[op.li].raw}'는 필요 없는 전치사입니다. 이 동사는 목적어를 바로 받고, 명사 앞에는 '${tt}'가 필요합니다.`;
      } else if (tc === "conj" && lc === "conj") {
        category = "word-choice";
        severity = "major";
        msg = `연결어 선택: '${w[op.li].raw}' → '${tt}'. 두 말은 의미가 다릅니다.`;
      }
      push({ from: op.li, to: op.li + 1, category, severity, fix: tt, messageKo: msg, skill }, { from: op.li, to: op.li + 1, replacement: tt });
      continue;
    }
    if (op.type === "del") {
      if (movedL.has(op.li)) continue;
      const lt = w[op.li].norm;
      const c = wordClass(lt);
      if (c === "content" || c === "conj" || c === "modal" || c === "neg") continue;
      if (APPROX.test(lt) && QUANTITY_START.test(w[op.li + 1]?.norm ?? "")) continue; // "about twice as high"
      // Indirect questions end with the verb: "let me know what the design pressure is".
      if (c === "be" && w.slice(0, op.li).some((x) => /^(what|which|how|where|when|why|who|whether|if)$/.test(x.norm)) && (op.li === w.length - 1 || w[op.li + 1]?.punct)) continue;
      const prevIsVerb = op.li > 0 && !!verbInfo(w[op.li - 1].norm);
      const map: Record<string, [ErrorCategory, Severity, string]> = {
        be: ["be-verb", "major", `불필요한 be동사 '${w[op.li].raw}'가 있습니다.`],
        aux: ["tense", "minor", `불필요한 조동사 '${w[op.li].raw}'가 있습니다.`],
        article: ["article", "minor", `여기서는 관사 '${w[op.li].raw}'가 필요 없습니다.`],
        prep: ["preposition", prevIsVerb ? "major" : "minor", prevIsVerb ? `'${w[op.li - 1].raw}'는 목적어를 바로 받는 동사라서 '${w[op.li].raw}'가 필요 없습니다.` : `불필요한 전치사 '${w[op.li].raw}'가 있습니다.`],
        pronoun: ["sentence-structure", "major", `'${w[op.li].raw}'가 다른 말과 겹칩니다(목적어 중복).`],
      };
      if (c === "pronoun" && !(/^(it|them)$/.test(lt) && op.li > 0 && verbInfo(w[op.li - 1].norm))) continue;
      const entry = map[c];
      if (!entry) continue;
      push({ from: op.li, to: op.li + 1, category: entry[0], severity: entry[1], fix: "", messageKo: entry[2], skill }, { from: op.li, to: op.li + 1, replacement: "" });
      continue;
    }
    if (op.type === "ins") {
      if (movedT.has(op.ti)) continue;
      const tt = tw[op.ti].norm;
      const c = wordClass(tt);
      if (c === "content" || c === "modal") continue;
      if (tt === "that") continue; // usually optional
      if (APPROX.test(tt) && QUANTITY_START.test(tw[op.ti + 1]?.norm ?? "")) continue; // "about 20%" is optional precision
      if (c === "pronoun" && /^(than|as)$/.test(tw[op.ti - 1]?.norm ?? "")) continue; // "than (we) expected"
      if (/^(us|them|him|me|it|you)$/.test(tt) && op.at > 0) continue; // optional objects ("send (us)", "tell (you)")
      const nextT = tw[op.ti + 1]?.norm ?? "";
      let entry: [ErrorCategory, Severity, string, ScoreBucket?] | null = null;
      if (c === "be") entry = ["be-verb", "major", `'${tt}'(be동사)가 빠졌습니다.`];
      else if (c === "aux") entry = ["tense", "major", `시제를 만드는 '${tt}'가 빠졌습니다.`];
      else if (c === "article") entry = ["article", "minor", `명사 앞에 관사 '${tt}'가 필요합니다.`];
      else if (c === "prep" && tt === "to" && isBaseVerb(nextT)) entry = ["verb-form", "major", `'to + 동사원형'이 필요합니다: 'to ${nextT}'.`];
      else if (c === "prep") entry = ["preposition", "major", `전치사 '${tt}'가 빠졌습니다.`];
      else if (c === "pronoun") entry = ["sentence-structure", "major", `주어/목적어 '${tt}'가 빠졌습니다.`];
      else if (c === "conj") entry = ["sentence-structure", "minor", `연결어 '${tt}'가 빠졌습니다.`];
      else if (c === "neg") entry = ["meaning-shift", "critical", `부정어 '${tt}'가 빠져 의미가 반대가 됩니다.`, "meaning"];
      if (!entry) continue;
      push({ from: op.at, to: op.at, category: entry[0], severity: entry[1], bucket: entry[3], fix: tt, messageKo: entry[2], skill }, { from: op.at, to: op.at, replacement: tt });
    }
  }
  return { findings, edits };
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
    const keyOf = (f: { from: number; to: number; category: string }) => `${f.from}:${f.to}:${f.category}`;
    const agreed = others.map((o) => new Set(alignmentFindings(o.al, part, o.ts, skill, true).findings.map(keyOf)));
    const kept = r.findings.filter((f) => agreed.every((set) => set.has(keyOf(f))));
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
      if (skipUntil < 0 || t.start >= (lastWordTok?.end ?? 0)) parts.push({ text: t.raw, punct: true });
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

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export interface LocalEvalOptions {
  /** Used only to annotate the summary. */
  hintLevel?: number;
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
  const exactTarget = correctTargets(q).find((t) => normalizeForMatch(t) === norm);
  const meaning = checkMeaning(q, w);
  if (exactTarget) {
    const full = { score: 100, noteKo: "정확합니다." };
    return {
      ...base,
      scores: { meaning: full, grammar: full, terminology: full, organization: full, comprehensibility: { score: 100, noteKo: "국제 회의에서 바로 이해되는 문장입니다." }, overall: 100 },
      errors: [],
      meaning,
      corrected: capitalizeSentence(text),
      summaryKo: "정확합니다. 회의에서 그대로 써도 좋은 문장입니다.",
      grammarKo: q.explanationKo,
      review: { add: false, reasonKo: "오류가 없어 별도 복습이 필요 없습니다. 기술 숙련도 기록에는 반영됩니다." },
      confidence: "high",
      exact: true,
      target: exactTarget,
    };
  }

  const ranked = rankTargets(q, w);
  const { target, tw, al } = ranked[0];
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
    const keyOf = (f: { from: number; to: number; category: string }) => `${f.from}:${f.to}:${f.category}`;
    // Other targets confirm with their raw differences (no paraphrase filter), so a synonym elsewhere cannot hide a real error.
    const agreed = others.map((o) => new Set(alignmentFindings(o.al, w, o.tw, primarySkill, true).findings.map(keyOf)));
    const keep = (f: { from: number; to: number; category: string }) => agreed.every((set) => set.has(keyOf(f)));
    const keptFindings = a.findings.filter(keep);
    const keptRanges = new Set(keptFindings.map((f) => `${f.from}:${f.to}`));
    findings.push(...keptFindings);
    edits.push(...a.edits.filter((e) => keptRanges.has(`${e.from}:${e.to}`) || keptFindings.some((f) => f.category === "word-order" && e.replacement === w[f.from]?.raw)));
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
  for (const m of meaning.filter((x) => x.fuzzy)) {
    if (!errors.some((e) => e.category === "spelling")) {
      // Spelling inside a meaning unit is reported by alignment when close; otherwise note it lightly.
      if (!close) errors.push({ id: `s-${m.id}`, category: "spelling", severity: "minor", bucket: "grammar", start: text.length, end: text.length, text: "", fix: m.en, messageKo: `'${m.en}' 부분의 철자를 확인하세요.`, skill: primarySkill, source: "meaning" });
    }
  }

  // ── Scores ──
  const sumPenalty = (bucket: ScoreBucket) =>
    errors.filter((e) => e.bucket === bucket).reduce((s, e) => s + (e.category === "spelling" ? SPELLING_PENALTY : PENALTY[e.severity]), 0);
  const spellingTotal = Math.min(9, errors.filter((e) => e.category === "spelling").length * SPELLING_PENALTY);
  const weight = (id: string) => q.meaning.find((u) => u.id === id)?.weight ?? 1;

  const nonTerm = meaning.filter((m) => !m.term);
  const termUnits = meaning.filter((m) => m.term);
  const cover = (list: MeaningCheck[]) => {
    const total = list.reduce((s, m) => s + weight(m.id), 0);
    if (!total) return 1;
    return list.filter((m) => m.present).reduce((s, m) => s + weight(m.id), 0) / total;
  };
  const isPhrase = q.mode === "phrase";
  // A missing unit and a meaning-shift error usually describe the same problem: take the worse, never the sum.
  let meaningScore = 100 * (isPhrase ? cover(meaning) : cover(nonTerm));
  if ((isPhrase ? meaning : nonTerm).some((m) => m.critical && !m.present)) meaningScore = Math.min(meaningScore, 45);
  meaningScore = Math.min(meaningScore, 100 - sumPenalty("meaning"));
  let termScore = 100 * cover(termUnits);
  if (termUnits.some((m) => m.critical && !m.present)) termScore = Math.min(termScore, 45);
  termScore = Math.min(termScore, 100 - sumPenalty("terminology"));
  // Alignment findings are heuristic: their total cost per bucket is capped so a long valid answer cannot collapse to zero.
  const ALIGN_CAP = 40;
  const bucketPenalty = (bucket: ScoreBucket) => {
    const list = errors.filter((e) => e.bucket === bucket && e.category !== "spelling");
    const firm = list.filter((e) => e.source !== "alignment").reduce((s, e) => s + PENALTY[e.severity], 0);
    const heuristic = Math.min(ALIGN_CAP, list.filter((e) => e.source === "alignment").reduce((s, e) => s + PENALTY[e.severity], 0));
    return firm + heuristic;
  };
  const grammarPenalty = bucketPenalty("grammar") + spellingTotal;
  const grammarScore = 100 - grammarPenalty;
  const orgPenalty = bucketPenalty("organization");
  // Words the learner left out that are already reported as errors do not count again as "too short".
  const explainedMissing = errors.filter((e) => e.start === e.end && e.source !== "meaning").length;
  const ratio = (w.length + explainedMissing) / Math.max(1, tw.length);
  const lengthPenalty = ratio < 0.5 ? 25 : ratio < 0.7 ? 10 : ratio > 2.2 ? 10 : 0;
  const orgScore = 100 - orgPenalty - lengthPenalty;

  const M = clamp(meaningScore);
  const G = clamp(grammarScore);
  const T = clamp(termScore);
  const O = clamp(orgScore);
  const C = clamp(0.55 * M + 0.15 * T + 0.15 * O + 0.15 * Math.max(G, 40));
  // Phrase quiz: meaning and form (grammar + structure) weigh equally.
  const form = clamp(100 - grammarPenalty - orgPenalty - lengthPenalty);
  let overall = isPhrase ? clamp(0.5 * M + 0.5 * form) : clamp(0.3 * M + 0.3 * G + 0.2 * T + 0.2 * O);
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
  let corrected = applyEdits(tokens, w, edits);
  if (!validCorrection(corrected) || !closer(corrected)) {
    const strong = applyEdits(tokens, w, edits.filter((e) => e.priority > 1));
    corrected = validCorrection(strong) ? strong : capitalizeSentence(target);
  }
  const majorErrors = errors.filter((e) => e.severity !== "minor");
  const mainError = [...errors].sort((a, b) => PENALTY[b.severity] - PENALTY[a.severity])[0];

  const compNote = C >= 85 ? "국제 회의에서 쉽게 이해됩니다." : C >= 65 ? "대체로 이해되지만 듣는 사람이 한 번 더 생각해야 합니다." : "의미가 정확히 전달되기 어렵습니다.";
  const missingText = missingUnits.length ? `빠진 의미: ${missingUnits.map((m) => `'${m.ko}'`).join(", ")}.` : "";

  let summaryKo: string;
  if (!errors.length && !missingUnits.length) {
    summaryKo = "기준 답안과 표현은 다르지만 의미와 문법 모두 문제를 찾지 못했습니다.";
  } else {
    const lead = M >= 85 ? "의미는 잘 전달됩니다." : M >= 60 ? "의미는 대체로 전달됩니다." : "의미가 제대로 전달되지 않습니다.";
    const issue = mainError ? mainError.messageKo.split(/(?<=[.。])\s/)[0] : "";
    const parts = [lead];
    if (issue) parts.push(M >= 60 ? `다만 ${issue}` : `가장 큰 문제: ${issue}`);
    if (missingText) parts.push(missingText);
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
    : errors.length
      ? "사소한 오류만 있어 복습 목록에는 넣지 않고 숙련도 기록에만 반영합니다."
      : "정확합니다. 숙련도 기록에 반영됩니다.";

  const confidence: Evaluation["confidence"] = close ? (al.distance <= 0.2 ? "high" : "medium") : "low";
  const confidenceNoteKo =
    confidence === "low"
      ? "기준 답안과 표현이 많이 달라 의미 단위와 일반 문법 규칙만으로 검사했습니다. 새로운 오류는 놓칠 수 있으니 Claude 분석으로 확인하세요."
      : confidence === "medium"
        ? "가장 가까운 기준 답안과 비교한 결과입니다."
        : undefined;

  return {
    ...base,
    scores: {
      meaning: { score: M, noteKo: missingUnits.filter((m) => !m.term).length ? missingText : M >= 85 ? "핵심 의미가 모두 들어 있습니다." : "의미가 일부 달라졌습니다." },
      grammar: { score: G, noteKo: errors.some((e) => e.bucket === "grammar") ? `문법 오류 ${errors.filter((e) => e.bucket === "grammar").length}개` : "문법 오류를 찾지 못했습니다." },
      terminology: { score: T, noteKo: termUnits.some((m) => !m.present) ? `빠진 기술 용어: ${termUnits.filter((m) => !m.present).map((m) => m.en).join(", ")}` : termUnits.length ? "기술 용어가 정확합니다." : "이 문항은 용어 부담이 적습니다." },
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
    target,
  };
}
