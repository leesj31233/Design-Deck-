import type { ErrorCategory, Severity } from "./types";
import { type Token, BE_FORMS, SUBJECT_PRONOUNS, DETERMINERS, MODALS } from "./text";

import {
  CONSONANT_SOUND_VOWEL_START, ING_NOUNS, NON_WORDS, UNAMBIGUOUS_VERBS, UNCOUNTABLE_PLURALS,
  VOWEL_SOUND_CONSONANT_START, ingOf, isBaseVerb, isSameFormParticiple, participleOf, thirdPersonOf, verbInfo,
} from "./lexicon";

/**
 * Reference-independent grammar rules. Each finding covers a range of word
 * indices [from, to); from === to means "insert before word `from`".
 * `replacement` is the corrected text for that range.
 */
export interface RuleFinding {
  rule: string;
  from: number;
  to: number;
  replacement: string;
  category: ErrorCategory;
  severity: Severity;
  messageKo: string;
  skill: string;
}

type Rule = (w: Token[]) => RuleFinding[];

/**
 * True when punctuation (a comma, a full stop, a dash) separates word i from
 * word i+1. Rules get words only, so this reads the gap between their source
 * offsets; parts of one contraction share a span and are never split.
 */
function brokenAfter(w: Token[], i: number): boolean {
  const a = w[i];
  const b = w[i + 1];
  return !!a && !!b && b.start - a.end > 1;
}

const WAIT_OBJECTS = new Set([
  "data", "result", "results", "approval", "response", "reply", "answer", "information", "confirmation", "document",
  "documents", "report", "drawing", "drawings", "vendor", "feedback", "quote", "quotation", "sample", "samples",
  "decision", "test", "analysis", "delivery", "update", "updates", "it", "them", "you", "him", "her", "comments",
  "specification", "specifications", "datasheet", "datasheets", "signal", "permission", "parts",
]);
const OBJECT_DETERMINERS = new Set(["the", "a", "an", "our", "your", "their", "more", "some", "any", "this", "that", "these", "those", "his", "her", "its", "final", "actual", "new"]);
const ADVERBS_BEFORE_ING = new Set(["still", "also", "now", "currently", "already", "just", "really", "actually", "always", "probably"]);

/** Subject + (still) + V-ing without be: "We still waiting" → "We are still waiting". */
const missingBeProgressive: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length; i++) {
    const subj = w[i].norm;
    if (!SUBJECT_PRONOUNS.has(subj)) continue;
    if (i > 0 && /^(to|than|as|let)$/.test(w[i - 1].norm)) continue;
    // Question word order ("Is it working?", "are you asking") already has the be verb before the subject.
    if (i > 0 && (BE_FORMS.has(w[i - 1].norm) || /^(do|does|did|have|has|had|will|would|can|could|should)$/.test(w[i - 1].norm))) continue;
    let j = i + 1;
    while (j < w.length && ADVERBS_BEFORE_ING.has(w[j].norm)) j++;
    const v = w[j];
    if (!v || !v.norm.endsWith("ing") || ING_NOUNS.has(v.norm)) continue;
    const info = verbInfo(v.norm);
    // Any -ing word right after a subject pronoun is a verb or adjective that needs be ("we looking", "it interesting").
    if (info ? info.form !== "ing" : v.norm.length < 5) continue;
    const be = subj === "i" ? "am" : subj === "he" || subj === "she" || subj === "it" ? "is" : "are";
    out.push({
      rule: "missing-be-progressive", from: i + 1, to: i + 1, replacement: be, category: "be-verb", severity: "major",
      skill: "progressive",
      messageKo: `진행형은 'be동사 + 동사ing'입니다. '${v.raw}' 앞에 '${be}'가 필요합니다. (${w[i].raw} ${be} ${w.slice(i + 1, j + 1).map((t) => t.raw).join(" ")})`,
    });
  }
  return out;
};

/** wait + object without "for": "waiting data" → "waiting for data". */
const waitWithoutFor: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const info = verbInfo(w[i].norm);
    if (!info || info.base !== "wait") continue;
    const next = w[i + 1].norm;
    const after = w[i + 2]?.norm;
    const isObj = WAIT_OBJECTS.has(next) || (OBJECT_DETERMINERS.has(next) && !!after && !/^(to|until|for|minute|minutes|day|days|week|weeks|while|few|couple|little|bit|moment|second|hour|hours|month|months)$/.test(after));
    if (!isObj || next === "for" || next === "until") continue;
    out.push({
      rule: "wait-without-for", from: i + 1, to: i + 1, replacement: "for", category: "preposition", severity: "major",
      skill: "verb-prep",
      messageKo: "'wait'는 자동사라서 기다리는 대상 앞에 'for'가 필요합니다: wait for + 명사 (예: waiting for the data).",
    });
  }
  return out;
};

/** before/after/without/by + base verb: "before complete" → "before completing". */
const prepositionBaseVerb: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const p = w[i].norm;
    if (!/^(before|after|without|by|instead|besides|about)$/.test(p)) continue;
    // "How about leave at seven?" → "leaving"; other "about" phrases ("about five", "talk about change") are left alone.
    if (p === "about" && !/^(how|what)$/.test(w[i - 1]?.norm ?? "")) continue;
    let k = i + 1;
    if (p === "instead") {
      if (w[k]?.norm !== "of") continue;
      k++;
    }
    const v = w[k];
    if (!v || !isBaseVerb(v.norm)) continue;
    // "by email the next day": after "by", a word that is also a noun is usually that noun.
    if (p === "by" && !UNAMBIGUOUS_VERBS.has(v.norm)) continue;
    // "before start-up", "before test results" — only fire when an object/determiner or end follows, or the verb is unambiguous.
    const next = w[k + 1]?.norm;
    const objectFollows = !!next && (DETERMINERS.has(next) || OBJECT_DETERMINERS.has(next) || /^(me|him|us|them)$/.test(next));
    // Bare motion and everyday verbs are wrong here whatever follows ("before go into", "after arrive at").
    const clearVerb = /^(go|come|get|take|make|send|leave|arrive|enter|start|begin|meet|talk|eat|drink|sign|run|move|visit|finish)$/.test(v.norm) && p !== "by";
    if (!UNAMBIGUOUS_VERBS.has(v.norm) && !objectFollows && !clearVerb) continue;
    // "before we complete" has a subject, so it is fine; we only reach here with a bare verb.
    const fix = ingOf(v.norm);
    out.push({
      rule: "preposition-base-verb", from: k, to: k + 1, replacement: fix, category: "verb-form", severity: "major",
      skill: "prep-gerund",
      messageKo: `'${w[i].raw}'는 전치사라서 뒤에 동사원형이 올 수 없습니다. '${w[i].raw} + 동사ing'(${fix}) 또는 '${w[i].raw} + 주어 + 동사'(${w[i].raw} we ${v.norm})로 쓰세요.`,
    });
  }
  return out;
};

/** modal + to: "should to check" → "should check". */
const modalTo: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!MODALS.has(w[i].norm) || w[i + 1].norm !== "to") continue;
    if (w[i].norm === "will" || w[i].norm === "would") {
      // "would like to", "will need to" are handled by the token after; only "would to" itself is wrong.
    }
    out.push({
      rule: "modal-to", from: i + 1, to: i + 2, replacement: "", category: "verb-form", severity: "major", skill: "modal-necessity",
      messageKo: `조동사 '${w[i].raw}' 뒤에는 'to' 없이 동사원형이 옵니다. (예: ${w[i].norm} check)`,
    });
  }
  return out;
};

/** modal + inflected verb: "should checked", "might changes" → base form. */
const modalInflected: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!MODALS.has(w[i].norm)) continue;
    let j = i + 1;
    if (w[j]?.norm === "not") j++;
    const v = w[j];
    if (!v) continue;
    const info = verbInfo(v.norm);
    if (!info || info.form === "base" || info.base === "be") continue;
    if (info.form === "pp" && w[j - 1].norm === "have") continue;
    if (info.form === "past" && info.base === "read") continue;
    if (info.form === "ing" || (info.form === "pp" && isSameFormParticiple(info.base))) continue;
    out.push({
      rule: "modal-inflected", from: j, to: j + 1, replacement: info.base, category: "verb-form", severity: "major",
      skill: info.form === "past" || info.form === "pp" ? "modal-possibility" : "modal-necessity",
      messageKo: `조동사 '${w[i].raw}' 뒤에는 동사원형이 와야 합니다: '${v.raw}' → '${info.base}'.`,
    });
  }
  return out;
};

/** Double modal: "might can" → "might be able to". */
const doubleModal: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(might|may|will|would|should|must)$/.test(w[i].norm) || !/^(can|could)$/.test(w[i + 1].norm)) continue;
    out.push({
      rule: "double-modal", from: i + 1, to: i + 2, replacement: "be able to", category: "verb-form", severity: "major", skill: "modal-possibility",
      messageKo: `조동사는 두 개를 연달아 쓸 수 없습니다. '${w[i].raw} ${w[i + 1].raw}' 대신 '${w[i].raw} be able to'를 쓰세요.`,
    });
  }
  return out;
};

/** Words that are also adjectives after be ("isn't complete yet", "is clear"). */
const BE_ADJECTIVE_OK = new Set(["complete", "correct", "separate", "open", "close", "clean", "dry", "free", "clear", "ready", "secure", "finish", "approve"]);

/** be + base verb: "I am agree", "it is need" → "I agree", "it needs". */
const beBaseVerb: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!BE_FORMS.has(w[i].norm) || w[i].norm === "be" || w[i].norm === "been" || w[i].norm === "being") continue;
    let j = i + 1;
    let negated = false;
    while (j < w.length && /^(not|really|also|still|just|always|never|usually|actually)$/.test(w[j].norm)) {
      if (w[j].norm === "not" || w[j].norm === "never") negated = true;
      j++;
    }
    const v = w[j];
    if (!v || !UNAMBIGUOUS_VERBS.has(v.norm) || isSameFormParticiple(v.norm) || BE_ADJECTIVE_OK.has(v.norm)) continue;
    if (w[j + 1]?.norm === "to" && v.norm === "able") continue;
    // "is" after a question word or "there" is not this pattern ("What is meet?" is not a learner sentence).
    if (i > 0 && /^(there|what|where|how|why|who)$/.test(w[i - 1].norm)) continue;
    // "be satisfy with" → "be satisfied with": feelings and states take the past participle.
    if (/^(satisfy|disappoint|interest|involve|concern|worry|surprise|please|confuse|excite|bore|tire|prepare|qualify|relate|base|locate)$/.test(v.norm) && /^(with|about|in|by|for|on|to|at)$/.test(w[j + 1]?.norm ?? "")) {
      const pp = participleOf(v.norm);
      out.push({
        rule: "be-participle", from: j, to: j + 1, replacement: pp, category: "verb-form", severity: "major", skill: "be-adj",
        messageKo: `상태·감정은 'be + 과거분사'로 말합니다: '${w[i].raw} ${v.raw} ${w[j + 1].raw}' → '${w[i].raw} ${pp} ${w[j + 1].raw}'.`,
      });
      continue;
    }
    const subj = w[i - 1]?.norm ?? "";
    // A singular subject ("this suggestion", "the plan", "it") takes does/-s; plural or I/you/we/they take do.
    const third = /^(he|she|it|this|that)$/.test(subj) || (/^(is|was|isn't|wasn't)$/.test(w[i].norm) && !/^(i|you|we|they)$/.test(subj));
    void negated;
    const fix = v.norm === "agree" || !third ? v.norm : v.norm + "s";
    out.push({
      rule: "be-base-verb", from: i, to: j + 1, replacement: (j > i + 1 ? `${third ? "does" : "do"} ${w.slice(i + 1, j).map((x) => x.norm).join(" ")} ` : "") + (j > i + 1 ? v.norm : fix),
      category: "verb-form", severity: "major", skill: "agreement",
      messageKo: `be동사와 일반동사를 함께 쓸 수 없습니다. '${w.slice(i, j + 1).map((x) => x.raw).join(" ")}' → '${j > i + 1 ? `${third ? "does" : "do"} ${w.slice(i + 1, j).map((x) => x.norm).join(" ")} ${v.norm}` : fix}'. 부정은 do/does + not + 동사원형입니다. (예: It does not meet … / We do not agree.)`,
    });
  }
  return out;
};

/** have/has/had (+adverb) + base verb: "we have already decide" → "decided". */
const perfectBaseVerb: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(have|has|had)$/.test(w[i].norm)) continue;
    const prev = w[i - 1]?.norm ?? "";
    if (!SUBJECT_PRONOUNS.has(prev) && !/^(not|already|we|they|you|i)$/.test(prev) && !(prev === "will" || prev === "would" || prev === "might" || prev === "could" || prev === "should" || prev === "must")) continue;
    let j = i + 1;
    while (j < w.length && /^(already|not|just|still|never|yet|also)$/.test(w[j].norm)) j++;
    const v = w[j];
    if (!v || !UNAMBIGUOUS_VERBS.has(v.norm)) continue;
    if (w[j - 1]?.norm === "to") continue;
    const pp = participleOf(v.norm);
    if (pp === v.norm) continue;
    out.push({
      rule: "perfect-base-verb", from: j, to: j + 1, replacement: pp, category: "verb-form", severity: "major", skill: "present-perfect",
      messageKo: `완료형은 'have/has + 과거분사'입니다: '${v.raw}' → '${pp}'.`,
    });
  }
  return out;
};

/** do/does/did (+not) + past form: "didn't decided" → "didn't decide". */
const doPast: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(do|does|did)$/.test(w[i].norm)) continue;
    let j = i + 1;
    if (w[j]?.norm === "not") j++;
    else if (!SUBJECT_PRONOUNS.has(w[j]?.norm ?? "")) continue;
    else j++;
    const v = w[j];
    if (!v) continue;
    const info = verbInfo(v.norm);
    if (!info || (info.form !== "past" && info.form !== "3sg" && info.form !== "ing") || isSameFormParticiple(info.base)) continue;
    out.push({
      rule: "do-inflected", from: j, to: j + 1, replacement: info.base, category: "verb-form", severity: "major", skill: "agreement",
      messageKo: `do/does/did 뒤에는 동사원형이 옵니다: '${v.raw}' → '${info.base}'. 시제는 do/does/did가 이미 표시합니다.`,
    });
  }
  return out;
};

/** Subject–verb agreement for be/have/do. */
const agreement: Rule = (w) => {
  const out: RuleFinding[] = [];
  const third: Record<string, string> = { have: "has", do: "does", are: "is", were: "was" };
  const plural: Record<string, string> = { has: "have", does: "do", is: "are", was: "were" };
  for (let i = 0; i < w.length - 1; i++) {
    const s = w[i].norm;
    const v = w[i + 1].norm;
    const prev = w[i - 1]?.norm ?? "";
    if (/^(if|wish|as)$/.test(prev) && v === "were") continue;
    if (/^(he|she|it)$/.test(s) && third[v] && !(prev === "if" || prev === "as")) {
      if (s === "it" && v === "were") continue;
      out.push({
        rule: "agreement-3sg", from: i + 1, to: i + 2, replacement: third[v], category: "agreement", severity: "major", skill: "agreement",
        messageKo: `주어 '${w[i].raw}'는 3인칭 단수라서 '${w[i + 1].raw}' 대신 '${third[v]}'를 씁니다.`,
      });
    } else if (/^(we|they|you)$/.test(s) && plural[v] && !(i > 0 && verbInfo(w[i - 1].norm))) {
      out.push({
        rule: "agreement-plural", from: i + 1, to: i + 2, replacement: plural[v], category: "agreement", severity: "major", skill: "agreement",
        messageKo: `주어 '${w[i].raw}'는 복수라서 '${w[i + 1].raw}' 대신 '${plural[v]}'를 씁니다.`,
      });
    } else if (s === "i" && (v === "is" || v === "are" || v === "has")) {
      const fix = v === "has" ? "have" : "am";
      out.push({
        rule: "agreement-i", from: i + 1, to: i + 2, replacement: fix, category: "agreement", severity: "major", skill: "agreement",
        messageKo: `주어 'I' 뒤에는 '${fix}'를 씁니다.`,
      });
    }
  }
  return out;
};

/** "more better" → "better". */
const doubleComparative: Rule = (w) => {
  const out: RuleFinding[] = [];
  const ER_NOUNS = /^(dryer|dryers|washer|filter|heater|cooler|boiler|mixer|feeder|operator|chiller|user|supplier|container|scrubber|separator|computer|water|paper|power|number|order|other|letter|matter|layer|buffer|transfer|header|master|cluster|meter|liter|litre|diameter|parameter|parameters|fewer|later)$/;
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm !== "more") continue;
    const n = w[i + 1].norm;
    if (ER_NOUNS.test(n)) continue;
    if (n === "better" || n === "worse" || (/er$/.test(n) && /^(fast|high|low|early|earli|late|big|small|easi|cheap|safe|short|long|quick|slow|strong|weak|large|wide|hot|cold|dry|wet)/.test(n) && n.length > 4)) {
      out.push({
        rule: "double-comparative", from: i, to: i + 1, replacement: "", category: "word-choice", severity: "minor", skill: "comparative",
        messageKo: `'${w[i + 1].raw}'는 이미 비교급이라 'more'를 함께 쓰지 않습니다.`,
      });
    }
  }
  return out;
};

/** will in if/when/time clauses: "if we will decide" → "if we decide". */
const willInConditionClause: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    const c = w[i].norm;
    const isTime = /^(if|when|before|after|until|unless|once)$/.test(c) || (c === "soon" && w[i - 1]?.norm === "as" && w[i + 1]?.norm === "as");
    if (!isTime) continue;
    // Noun clauses ("I don't know when they will…", "not sure if they will…") may take will.
    if ((c === "if" || c === "when") && /^(know|sure|ask|asked|wonder|check|confirm|tell|clear|decide|understand|see|unclear|certain|idea|whether|about)$/.test(w[i - 1]?.norm ?? "")) continue;
    let s = c === "soon" ? i + 2 : i + 1;
    let subj = w[s]?.norm ?? "";
    // A noun-phrase subject ("the pump", "our vendor") stands where a pronoun would.
    // "After the meeting, I will…" and "after that we will…" are adverbials before the main clause, not subjects.
    if (!SUBJECT_PRONOUNS.has(subj) && /^(the|our|your|their|this|that|my|his|her|its)$/.test(subj)) {
      let k = s + 1;
      while (
        k < w.length && k <= s + 3 && w[k].norm !== "will" && !SUBJECT_PRONOUNS.has(w[k].norm) && !brokenAfter(w, k - 1) &&
        !/^(and|or|but|to|of|for|in|on|at|with|is|are|was|were|has|have|had|can|could|should|must|may|might|would)$/.test(w[k].norm)
      ) k++;
      if (w[k]?.norm === "will" && k > s + 1 && !brokenAfter(w, k - 1)) {
        subj = /s$/.test(w[k - 1].norm) && !/ss$/.test(w[k - 1].norm) ? "they" : "it";
        s = k - 1;
      }
    }
    if (!SUBJECT_PRONOUNS.has(subj) || w[s + 1]?.norm !== "will") continue;
    if (w[s + 2]?.norm === "be" && w[s + 3]?.norm === "able") continue;
    const v = w[s + 2];
    const info = v ? verbInfo(v.norm) : null;
    const third = /^(he|she|it)$/.test(subj);
    const repl = info ? (third ? (info.base === "be" ? "is" : info.base === "have" ? "has" : info.base + "s") : info.base === "be" ? (subj === "i" ? "am" : "are") : info.base) : "";
    out.push({
      rule: "will-in-time-clause", from: s + 1, to: info ? s + 3 : s + 2, replacement: repl, category: "tense", severity: "major", skill: c === "if" || c === "unless" ? "cond-1" : "time-clause",
      messageKo: `'${c === "soon" ? "as soon as" : w[i].raw}'로 시작하는 조건·시간 부사절에서는 미래 일이라도 현재시제를 씁니다. 'will'을 빼세요.`,
    });
  }
  return out;
};

/** Uncountable nouns pluralized: "informations" → "information". */
const uncountablePlural: Rule = (w) =>
  w.flatMap((t, i) => {
    const fix = UNCOUNTABLE_PLURALS[t.norm];
    return fix
      ? [{
          rule: "uncountable-plural", from: i, to: i + 1, replacement: fix, category: "countability" as const, severity: "minor" as const, skill: "countability",
          messageKo: `'${fix}'는 셀 수 없는 명사라서 복수형(-s)을 쓰지 않습니다.`,
        }]
      : [];
  });

/** Known learner non-words. */
const nonWords: Rule = (w) =>
  w.flatMap((t, i) => {
    const nw = NON_WORDS[t.norm];
    return nw
      ? [{ rule: "non-word", from: i, to: i + 1, replacement: nw.fix, category: "verb-form" as const, severity: "major" as const, skill: nw.skill ?? "agreement", messageKo: nw.noteKo }]
      : [];
  });

/** we/they/I/you + third-person verb: "we needs" → "we need". */
const lexicalAgreement: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(we|they|i|you)$/.test(w[i].norm)) continue;
    // Only "you" can also be an object ("sent you", "for you"); we/they/I are always subjects.
    if (w[i].norm === "you" && i > 0 && (verbInfo(w[i - 1].norm) || PREP_LIKE.test(w[i - 1].norm))) continue;
    let j = i + 1;
    if (/^(also|still|only|always|really|often|usually|just)$/.test(w[j]?.norm ?? "")) j++;
    const v = w[j];
    const info = v ? verbInfo(v.norm) : null;
    if (!info || info.form !== "3sg" || /^(be|have|do)$/.test(info.base)) continue;
    out.push({
      rule: "agreement-lexical", from: j, to: j + 1, replacement: info.base, category: "agreement", severity: "major", skill: "agreement",
      messageKo: `주어 '${w[i].raw}' 뒤에는 동사에 -s를 붙이지 않습니다: '${v.raw}' → '${info.base}'.`,
    });
  }
  return out;
};
const PREP_LIKE = /^(for|to|with|from|about|than|of|by|let|make|help)$/;

/** "if … had p.p., … will have p.p." → "would have". */
const thirdConditionalWill: Rule = (w) => {
  const out: RuleFinding[] = [];
  const ifAt = w.findIndex((t) => t.norm === "if");
  if (ifAt < 0) return out;
  const hadAt = w.findIndex((t, k) => k > ifAt && t.norm === "had" && verbInfo(w[k + 1]?.norm ?? "")?.form === "pp");
  if (hadAt < 0) return out;
  for (let i = hadAt + 2; i < w.length - 2; i++) {
    if (w[i].norm === "will" && w[i + 1].norm === "have") {
      out.push({
        rule: "third-conditional-will", from: i, to: i + 1, replacement: "would", category: "tense", severity: "major", skill: "cond-3",
        messageKo: "과거 사실과 반대되는 가정(If + had p.p.)의 결과는 'would have + p.p.'입니다. 'will have'가 아니라 'would have'를 씁니다.",
      });
      break;
    }
  }
  return out;
};

/** "as higher as" → "as high as"; "too much higher" → "much higher"; "is little delayed" → "a little"; "running normal" → "normally". */
const comparisonForms: Rule = (w) => {
  const out: RuleFinding[] = [];
  const BASE: Record<string, string> = { higher: "high", lower: "low", faster: "fast", bigger: "big", smaller: "small", larger: "large", longer: "long", shorter: "short", wetter: "wet", drier: "dry", hotter: "hot", colder: "cold", cheaper: "cheap", better: "good", worse: "bad", heavier: "heavy", earlier: "early", later: "late" };
  for (let i = 0; i < w.length - 2; i++) {
    const a = w[i].norm;
    const b = w[i + 1].norm;
    const c = w[i + 2].norm;
    if (a === "as" && BASE[b] && c === "as") {
      out.push({ rule: "as-comparative-as", from: i + 1, to: i + 2, replacement: BASE[b], category: "word-choice", severity: "major", skill: "comparative", messageKo: `'as … as' 사이에는 비교급이 아니라 원급을 씁니다: '${w[i + 1].raw}' → '${BASE[b]}'.` });
    } else if (a === "too" && b === "much" && (BASE[c] || c === "more")) {
      out.push({ rule: "too-much-comparative", from: i, to: i + 1, replacement: "", category: "word-choice", severity: "major", skill: "comparative", messageKo: "비교급을 강조할 때는 'much / far + 비교급'입니다. 'too much higher'가 아니라 'much higher'라고 씁니다." });
    } else if (BE_FORMS.has(a) && b === "little" && /^(delayed|late|behind|higher|lower|bigger|smaller|wet|wetter|dry|drier|longer|shorter|different|unstable|high|low)$/.test(c)) {
      out.push({ rule: "little-without-a", from: i + 1, to: i + 1, replacement: "a", category: "article", severity: "major", skill: "degree", messageKo: "'조금 ~하다'는 'a little + 형용사'입니다. a가 없는 'little'은 '거의 ~하지 않다'는 반대 뜻이 됩니다." });
    }
  }
  for (let i = 0; i < w.length - 1; i++) {
    if (/^(running|operating|working|run|operate|work|runs|operates|works)$/.test(w[i].norm) && /^(normal|stable|smooth|good)$/.test(w[i + 1].norm)) {
      const adv = { normal: "normally", stable: "stably", smooth: "smoothly", good: "well" }[w[i + 1].norm as "normal"];
      out.push({ rule: "adjective-for-adverb", from: i + 1, to: i + 2, replacement: adv, category: "word-choice", severity: "major", skill: "word-order", messageKo: `동사를 꾸밀 때는 부사를 씁니다: '${w[i + 1].raw}' → '${adv}'.` });
    }
  }
  // "I can hear you clear", "check it careful": verb (+ object) + adjective at the end of the clause.
  const ADVERB_OF: Record<string, string> = { clear: "clearly", careful: "carefully", proper: "properly", correct: "correctly", smooth: "smoothly", safe: "safely", perfect: "perfectly", exact: "exactly", quick: "quickly", bad: "badly", good: "well", easy: "easily", serious: "seriously", complete: "completely" };
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(hear|heard|see|saw|explain|explained|speak|spoke|talk|understand|understood|check|checked|read|write|wrote|answer|answered|reply|replied|respond|responded|communicate|handle|handled|install|installed|finish|finished|work|worked|went|go|goes|going|do|did|done|doing)$/.test(w[i].norm)) continue;
    let j = i + 1;
    if (/^(you|me|it|them|him|her|us|this|that|everything)$/.test(w[j].norm) && !brokenAfter(w, i)) j++;
    const a = w[j];
    if (!a || !ADVERB_OF[a.norm] || brokenAfter(w, j - 1)) continue;
    // "the milk went bad", "Everything's going good" (informal) and "done good" are left to Claude; a noun after means an adjective ("see clear signs").
    if (/^(go|goes|going|went)$/.test(w[i].norm) && a.norm !== "good") continue;
    if (/^(do|did|done|doing)$/.test(w[i].norm) && !/^(good|bad)$/.test(a.norm)) continue;
    const end = j === w.length - 1 || brokenAfter(w, j) || /^(and|but|so|because|now|today|too|again|please|enough|on|in|at|with|for|during|this|next|before|after|until|by|when|if)$/.test(w[j + 1].norm);
    if (!end) continue;
    const adv = ADVERB_OF[a.norm];
    out.push({ rule: "adjective-for-adverb", from: j, to: j + 1, replacement: adv, category: "word-choice", severity: "minor", skill: "word-order", messageKo: `동사를 꾸밀 때는 형용사가 아니라 부사를 씁니다: '${a.raw}' → '${adv}'.` });
  }
  return out;
};

/** "more high than" → "higher than": short adjectives take -er. */
const SHORT_COMPARATIVE: Record<string, string> = {
  big: "bigger", small: "smaller", high: "higher", low: "lower", fast: "faster", cheap: "cheaper", late: "later", early: "earlier",
  long: "longer", short: "shorter", large: "larger", easy: "easier", safe: "safer", hot: "hotter", cold: "colder", old: "older",
  new: "newer", strong: "stronger", weak: "weaker", hard: "harder", thick: "thicker", thin: "thinner", wide: "wider", close: "closer",
  near: "nearer", deep: "deeper", tall: "taller", quick: "quicker", slow: "slower", heavy: "heavier", busy: "busier", dry: "drier",
  wet: "wetter", warm: "warmer", cool: "cooler", nice: "nicer", good: "better", bad: "worse", tight: "tighter", soon: "sooner",
  light: "lighter", great: "greater", clean: "cleaner", young: "younger",
};
const moreShortAdjective: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm !== "more" || brokenAfter(w, i)) continue;
    const a = w[i + 1];
    const comp = SHORT_COMPARATIVE[a.norm];
    if (!comp) continue;
    const next = w[i + 2];
    const prev = w[i - 1]?.norm ?? "";
    // "more big dryers", "more good news": more counts the noun phrase, which is fine.
    const clauseEnds = !next || brokenAfter(w, i + 1) || /^(than|in|on|at|for|to|because|so|and|but|or|if|when|now|today|this|next|during|after|before|with|from|by|until|please|enough|then|again)$/.test(next.norm);
    const article = /^(a|an|the|much|even|far|bit|little|lot|slightly|no)$/.test(prev);
    if (!clauseEnds && !article) continue;
    out.push({
      rule: "more-short-adjective", from: i, to: i + 2, replacement: comp, category: "word-choice", severity: "major", skill: "comparative",
      messageKo: `짧은 형용사·부사의 비교급은 'more'가 아니라 '-er'을 붙입니다: 'more ${a.raw}' → '${comp}'.`,
    });
  }
  return out;
};

/** "I very like it", "we very need" → "really": very cannot modify a verb. */
const veryVerb: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 1; i < w.length - 1; i++) {
    if (w[i].norm !== "very") continue;
    if (!/^(like|want|need|appreciate|enjoy|hope|agree|love|thank|understand|recommend|prefer|worry|wish|miss|respect|regret)$/.test(w[i + 1].norm)) continue;
    if (!/^(i|we|you|they|he|she|would|do|don't|also|all|so|really|truly)$/.test(w[i - 1].norm)) continue;
    out.push({
      rule: "very-verb", from: i, to: i + 1, replacement: "really", category: "word-choice", severity: "major", skill: "degree",
      messageKo: `'very'는 형용사·부사만 꾸밉니다. 동사 '${w[i + 1].raw}'를 강조할 때는 'really'를 씁니다: 'really ${w[i + 1].norm}' (또는 '${w[i + 1].norm} … very much').`,
    });
  }
  return out;
};

/** "enough long" → "long enough": enough comes after an adjective. */
const enoughOrder: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm !== "enough" || brokenAfter(w, i)) continue;
    const a = w[i + 1];
    if (!/^(long|big|good|large|clear|fast|strong|safe|early|high|low|stable|warm|cheap|small|short|accurate|reliable|wide|close|quick|simple|easy|hot|cold|dry|clean|old|thick|deep|tall|bright|loud|quiet|fresh|mature)$/.test(a.norm)) continue;
    const next = w[i + 2];
    // "enough big tanks" counts tanks; only the adjective at the end of its phrase is out of order.
    if (next && !brokenAfter(w, i + 1) && !/^(for|to|and|but|so|because|now|yet|already|in|at|on|than)$/.test(next.norm)) continue;
    out.push({
      rule: "enough-order", from: i, to: i + 2, replacement: `${a.norm} enough`, category: "word-order", severity: "major", skill: "word-order",
      messageKo: `'충분히 ~한'은 '형용사 + enough' 순서입니다: 'enough ${a.raw}' → '${a.raw} enough'.`,
    });
  }
  return out;
};

/**
 * Korean drops the subject; English needs "it": "Is called japchae." → "It's
 * called japchae."; "Is still too early." → "It's still too early.". A
 * question ("Is it ready?", "Is the report done?") has a subject after is.
 */
const missingSubjectIt: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const be = w[i].norm;
    if ((be !== "is" && be !== "was") || w[i].expanded) continue;
    if (i > 0 && !brokenAfter(w, i - 1)) continue;
    const n = w[i + 1];
    const info = verbInfo(n.norm);
    const predicate =
      (info && (info.form === "ing" || info.form === "pp" || (info.form === "past" && participleOf(info.base) === n.norm)) && !ING_NOUNS.has(n.norm)) ||
      /^(still|too|so|very|really|already|not|just|quite|pretty|fine|okay|ok|good|great|nice|ready|done|important|possible|necessary|difficult|easy|hard|hot|cold|warm|true|better|worse|late|early|delicious|expensive|cheap|interesting|raining|snowing|sunny|cloudy|windy|freezing|humid)$/.test(n.norm);
    if (!predicate) continue;
    const fix = be === "is" ? (/^[A-Z]/.test(w[i].raw) ? "It's" : "it's") : /^[A-Z]/.test(w[i].raw) ? "It was" : "it was";
    out.push({
      rule: "missing-subject-it", from: i, to: i + 1, replacement: fix, category: "sentence-structure", severity: "major", skill: "be-adj",
      messageKo: `영어 문장에는 주어가 꼭 있어야 합니다. 날씨·상황·앞에서 말한 것을 가리킬 때는 'it'을 씁니다: '${w[i].raw} ${n.raw}' → '${fix} ${n.raw}'.`,
    });
  }
  return out;
};

/** "I sorry", "we ready", "they busy" → be + adjective. */
const PREDICATE_ADJECTIVES = /^(sorry|ready|late|sure|available|busy|happy|glad|afraid|okay|ok|aware|able|unable|careful|sick|hungry|full|fine|right|wrong|serious|free|alright|tired|close|responsible)$/;
const missingBeAdjective: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const s = w[i].norm;
    if (!SUBJECT_PRONOUNS.has(s) || brokenAfter(w, i)) continue;
    const prev = w[i - 1]?.norm ?? "";
    // Question order ("Are you ready?") or an object pronoun ("make it ready", "keep you busy").
    if (i > 0 && !brokenAfter(w, i - 1) && (BE_FORMS.has(prev) || /^(do|does|did|have|has|had|will|would|can|could|should|to|than|as)$/.test(prev))) continue;
    if ((s === "it" || s === "you") && i > 0 && !brokenAfter(w, i - 1) && (verbInfo(prev) || PREP_LIKE.test(prev) || /^(keep|make|find|leave|get|got|call|consider|want|need|let|thank|thanks)$/.test(prev))) continue;
    const a = w[i + 1];
    if (!PREDICATE_ADJECTIVES.test(a.norm)) continue;
    // "I sure hope so" (sure as an adverb), "we free up", "they right-click" are not this pattern.
    const after = w[i + 2]?.norm ?? "";
    if (a.norm === "sure" && verbInfo(after)?.form === "base") continue;
    if (a.norm === "free" && after === "up") continue;
    // These are also verbs: "we close at six", "they free the line", "it tired me out".
    const ends = !after || brokenAfter(w, i + 1);
    if (a.norm === "close" && !ends && !/^(to|enough|now|yet|already)$/.test(after)) continue;
    if ((a.norm === "free" || a.norm === "tired") && !ends && !/^(now|today|tomorrow|tonight|yet|already|enough|too|and|but|so|because|of|for|to|with|about|at|in|on|this|next|after|before|until)$/.test(after)) continue;
    const be = s === "i" ? "am" : /^(he|she|it)$/.test(s) ? "is" : "are";
    out.push({
      rule: "missing-be-adjective", from: i + 1, to: i + 1, replacement: be, category: "be-verb", severity: "major", skill: "be-adj",
      messageKo: `형용사 '${a.raw}'는 동사가 아니라서 be동사가 필요합니다: '${w[i].raw} ${be} ${a.raw}'.`,
    });
  }
  return out;
};

/** "let me to pay", "make them to wait" → no "to" after let/make + object. */
const letMakeTo: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 3; i++) {
    if (!/^(let|lets|make|makes|made|making)$/.test(w[i].norm)) continue;
    if (!/^(me|us|him|her|them|you|it|everyone)$/.test(w[i + 1].norm) || w[i + 2].norm !== "to") continue;
    // "make it to the meeting" (= arrive) is an idiom.
    if (/^(make|makes|made|making)$/.test(w[i].norm) && w[i + 1].norm === "it") continue;
    if (!isBaseVerb(w[i + 3].norm)) continue;
    out.push({
      rule: "let-make-to", from: i + 2, to: i + 3, replacement: "", category: "verb-form", severity: "major", skill: "verb-object",
      messageKo: `'${w[i].norm} + 사람 + 동사원형'입니다. to를 쓰지 않습니다: '${w[i].raw} ${w[i + 1].raw} ${w[i + 3].raw}'.`,
    });
  }
  return out;
};

/** "there is three topics" → "there are". */
const thereIsPlural: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (w[i].norm !== "there" || !/^(is|was)$/.test(w[i + 1].norm)) continue;
    let j = i + 2;
    while (j < w.length && /^(also|still|only|just|now|already|probably)$/.test(w[j].norm)) j++;
    const q = w[j]?.norm ?? "";
    const plural = /^(two|three|four|five|six|seven|eight|nine|ten|several|many|both|lots)$/.test(q) || (q === "a" && w[j + 1]?.norm === "few") || (q === "some" && /^[a-z]{3,}[^s']s$/.test(w[j + 1]?.norm ?? "") && verbInfo(w[j + 1].norm)?.form !== "3sg");
    if (!plural) continue;
    const fix = w[i + 1].norm === "is" ? "are" : "were";
    out.push({
      rule: "there-is-plural", from: i + 1, to: i + 2, replacement: fix, category: "agreement", severity: "major", skill: "agreement",
      messageKo: `'there + be' 뒤의 명사가 복수이면 '${fix}'를 씁니다: 'there ${fix} ${w.slice(j, j + 2).map((x) => x.raw).join(" ")}'.`,
    });
  }
  return out;
};

/** "four week", "two sample" → plural after a number. */
const PLURAL_OF: Record<string, string> = {
  day: "days", week: "weeks", month: "months", year: "years", hour: "hours", minute: "minutes", sample: "samples", option: "options",
  question: "questions", issue: "issues", point: "points", unit: "units", pump: "pumps", thing: "things", idea: "ideas", slide: "slides",
  meeting: "meetings", test: "tests", batch: "batches", ton: "tons", meter: "meters", degree: "degrees", person: "people", item: "items",
  topic: "topics", step: "steps", page: "pages", document: "documents", file: "files", email: "emails", engineer: "engineers",
  member: "members", time: "times", night: "nights", drawing: "drawings", valve: "valves", tank: "tanks", supplier: "suppliers", vendor: "vendors",
};
const numberSingular: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const q = w[i].norm;
    const many = /^(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|many|both|these|those)$/.test(q) || (q === "few" && w[i - 1]?.norm === "a");
    if (!many || brokenAfter(w, i)) continue;
    const n = w[i + 1];
    const pl = PLURAL_OF[n.norm];
    if (!pl || n.expanded) continue;
    // "a four week test" (a compound modifier) and "those meeting the target" are fine.
    const next = w[i + 2];
    if (next && !brokenAfter(w, i + 1) && !/^(of|for|to|in|on|at|with|from|about|by|and|or|but|because|so|that|which|ago|later|left|instead|before|after|is|are|was|were|will|can|could|should|would|might|must|have|has|had|now|until|per|each|maybe)$/.test(next.norm)) continue;
    // "these/those" also stand alone as pronouns: "those time" is rare, but keep to clear nouns.
    if ((q === "these" || q === "those") && n.norm === "time") continue;
    out.push({
      rule: "number-singular", from: i + 1, to: i + 2, replacement: pl, category: "countability", severity: "minor", skill: "countability",
      messageKo: `'${w[i].raw}' 뒤의 셀 수 있는 명사는 복수형입니다: '${w[i].raw} ${pl}'.`,
    });
  }
  return out;
};

/** a/an before vowel/consonant sounds. */
const articleSound: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i].norm;
    const n = w[i + 1].norm;
    if (a !== "a" && a !== "an") continue;
    if (w[i].raw === "A" && i > 0) continue; // a label: "Option A is cheaper"
    if (!/^[a-z]/.test(n)) continue;
    const raw = w[i + 1].raw;
    const acronym = /^[A-Z][A-Z0-9&]+$/.test(raw.replace(/[^A-Za-z0-9&]/g, ""));
    const vowelLetter = /^[aeiou]/.test(n);
    // Acronyms are read letter by letter: "an RFQ", "an MOU", "a PFD".
    const vowelSound = acronym ? /^[AEFHILMNORSX]/.test(raw) : (vowelLetter && !CONSONANT_SOUND_VOWEL_START.test(n)) || VOWEL_SOUND_CONSONANT_START.test(n);
    if (a === "a" && vowelSound) {
      out.push({ rule: "article-an", from: i, to: i + 1, replacement: "an", category: "article", severity: "minor", skill: "articles", messageKo: `모음 소리로 시작하는 '${w[i + 1].raw}' 앞에서는 'a' 대신 'an'을 씁니다.` });
    } else if (a === "an" && !vowelSound) {
      out.push({ rule: "article-a", from: i, to: i + 1, replacement: "a", category: "article", severity: "minor", skill: "articles", messageKo: `자음 소리로 시작하는 '${w[i + 1].raw}' 앞에서는 'an' 대신 'a'를 씁니다.` });
    }
  }
  return out;
};

/** Transitive verbs used with an unnecessary preposition: "discuss about" → "discuss". */
const transitivePreposition: Rule = (w) => {
  const out: RuleFinding[] = [];
  const pairs: Record<string, string[]> = { discuss: ["about"], mention: ["about"], contact: ["to", "with"], explain: [], emphasize: ["on"], answer: ["to"], approach: ["to"], enter: ["into"], attend: ["to"], review: ["about"] };
  for (let i = 0; i < w.length - 1; i++) {
    const info = verbInfo(w[i].norm);
    if (!info || !pairs[info.base]) continue;
    // A determiner or adjective before it means the word is a noun ("the answer to", "a review about").
    const prev = w[i - 1]?.norm ?? "";
    if (DETERMINERS.has(prev) || /^(of|for|in|on|first|final|quick|short|direct|technical|design|our|your)$/.test(prev)) continue;
    const p = w[i + 1].norm;
    if (!pairs[info.base].includes(p)) continue;
    out.push({
      rule: "transitive-preposition", from: i + 1, to: i + 2, replacement: "", category: "preposition", severity: "minor", skill: "verb-object",
      messageKo: `'${info.base}'는 타동사라서 목적어를 바로 씁니다. '${w[i].raw} ${w[i + 1].raw} ~' → '${w[i].raw} ~'.`,
    });
  }
  return out;
};

/** "its too early" → "it's too early" (possessive its used as it is). */
const itsContraction: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm !== "its" || w[i].expanded) continue;
    const n = w[i + 1].norm;
    if (!/^(too|not|a|an|the|very|still|already|ready|possible|necessary|important|hard|difficult|easy|better|ok|okay|fine|late|early|good|bad|clear|true|likely|because|been|going|getting)$/.test(n)) continue;
    out.push({
      rule: "its-contraction", from: i, to: i + 1, replacement: "it's", category: "spelling", severity: "minor", skill: "agreement",
      messageKo: "'its'는 소유격(그것의)입니다. 'it is'의 줄임말은 아포스트로피가 있는 'it's'입니다.",
    });
  }
  return out;
};

/** "every flanges" → "every flange": every takes a singular noun. */
const everyPlural: Rule = (w) =>
  w.flatMap((t, i) => {
    if (t.norm !== "every") return [];
    const n = w[i + 1];
    if (!n || !/^[a-z]{3,}[^suia']s$/.test(n.norm) || verbInfo(n.norm)?.form === "3sg") return [];
    const single = n.norm.endsWith("ies") ? `${n.norm.slice(0, -3)}y` : /(ch|sh|x|ss)es$/.test(n.norm) ? n.norm.slice(0, -2) : n.norm.slice(0, -1);
    return [{
      rule: "every-plural", from: i + 1, to: i + 2, replacement: single, category: "countability" as const, severity: "major" as const, skill: "countability",
      messageKo: `'every' 뒤에는 단수 명사가 옵니다: 'every ${single}' (= all ${n.norm}).`,
    }];
  });

/**
 * Singular countable nouns need a determiner: "the requirements of customer" →
 * "of the customer". Only nouns that are almost always countable and rarely
 * used without an article in idioms are checked, and only when the noun heads
 * its phrase (not "customer requirements").
 */
const COUNTABLE_NOUNS = new Set([
  "customer", "client", "vendor", "supplier", "contractor", "consultant", "engineer", "operator", "manager", "colleague",
  "proposal", "report", "problem", "question", "suggestion", "decision", "solution", "idea", "option", "reason",
  "sample", "pump", "valve", "dryer", "tank", "reactor", "vessel", "compressor", "boiler", "heater", "plant", "factory",
  "company", "office", "department", "document", "drawing", "presentation", "slide", "chart", "graph", "agenda",
  "flight", "hotel", "restaurant", "airport", "contract", "quotation", "invoice", "requirement", "specification",
  "datasheet", "mistake", "project", "meeting", "deadline", "proposal", "machine", "laptop", "microphone",
  "promotion", "wedding", "anniversary", "award", "lab", "laboratory", "warehouse", "workshop", "supervisor",
]);
const NP_DETERMINERS = new Set([
  ...DETERMINERS, "my", "one", "two", "three", "first", "second", "last", "next", "which", "what", "whose", "such", "many",
  "either", "neither", "per", "each", "every", "same",
]);
const bareSingularCountable: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length; i++) {
    const n = w[i];
    if (!COUNTABLE_NOUNS.has(n.norm) || n.expanded) continue;
    // Heads its phrase only: followed by the end, a function word or a verb (not by another noun or an object).
    const next = w[i + 1];
    if (next) {
      const nn = next.norm;
      const isVerb = !!verbInfo(nn) && !COUNTABLE_NOUNS.has(nn);
      const isFunction = /^(of|for|to|in|on|at|with|from|about|by|and|or|but|because|so|that|which|who|is|was|has|had|will|would|can|could|should|must|may|might|does|did|do|are|were)$/.test(nn);
      if (!isVerb && !isFunction && !SUBJECT_PRONOUNS.has(nn)) continue;
      // "meeting the client", "drawing a line": a gerund, not a noun.
      if (/ing$/.test(n.norm) && (DETERMINERS.has(nn) || SUBJECT_PRONOUNS.has(nn))) continue;
    }
    // Walk back over modifiers ("new", "revised", "control", "Malaysian") to find a determiner or a possessive.
    let k = i - 1;
    let ok = false;
    let uncertain = false;
    let start = i;
    while (k >= 0 && i - k <= 4) {
      const t = w[k];
      if (NP_DETERMINERS.has(t.norm) || /^\d/.test(t.norm) || /'s$|s'$/i.test(t.raw.replace(/’/g, "'"))) {
        ok = true;
        break;
      }
      const functional = /^(of|for|to|in|on|at|with|from|about|by|into|than|as|and|or|but|because|so|if|when|is|was|are|were|be|been|not|will|would|can|could|should|must|may|might|do|does|did|have|has|had)$/.test(t.norm) || SUBJECT_PRONOUNS.has(t.norm);
      if (functional) break;
      const vi = verbInfo(t.norm);
      if (vi) {
        const before = w[k - 1]?.norm ?? "";
        const afterSubject = SUBJECT_PRONOUNS.has(before) || COUNTABLE_NOUNS.has(before);
        // "revised quotation", "updated datasheet", "leaking valve": a participle used as an adjective.
        if ((vi.form === "pp" || vi.form === "past" || vi.form === "ing") && !afterSubject) {
          start = k;
          k--;
          continue;
        }
        // A real verb ends the noun phrase: "satisfy (the) customer", "we sent (the) quotation".
        if (UNAMBIGUOUS_VERBS.has(vi.base) || vi.form === "3sg" || vi.form === "past") break;
        // "control valve", "test report": maybe a noun modifier — keep looking, but never guess.
        uncertain = true;
      }
      start = k;
      k--;
    }
    if (!ok && uncertain) continue;
    if (ok) continue;
    // "Good question.", "Great idea!": a short reply that is only a noun phrase stands without an article.
    if ((start === 0 || brokenAfter(w, start - 1)) && (i === w.length - 1 || brokenAfter(w, i)) && start < i) continue;
    // "kind of problem", "type of valve": the bare noun is idiomatic.
    if (w[start - 1]?.norm === "of" && /^(kind|type|sort|form|lack|piece)$/.test(w[start - 2]?.norm ?? "")) continue;
    out.push({
      rule: "missing-article", from: start, to: start, replacement: "the", category: "article", severity: "minor", skill: "articles",
      messageKo: `셀 수 있는 단수 명사 '${n.raw}' 앞에는 관사(a/the)나 소유격(our, their 등)이 필요합니다. 여기서는 'the ${w.slice(start, i + 1).map((x) => x.raw).join(" ")}'가 자연스럽습니다.`,
    });
  }
  return out;
};

/**
 * "the work has delayed" → "has been delayed": these verbs need an object, so a
 * thing that undergoes them takes the passive perfect.
 */
const PASSIVE_PERFECT = new Set([
  "delayed", "postponed", "cancelled", "canceled", "repaired", "fixed", "approved", "installed", "replaced", "rejected",
  "finalized", "finalised", "shipped", "damaged", "updated", "revised", "tested", "inspected", "scheduled", "rescheduled",
]);
const PERSON_NOUNS = new Set([
  "vendor", "client", "customer", "team", "company", "contractor", "supplier", "engineer", "manager", "operator", "licensor",
  "department", "consultant", "colleague", "partner", "everyone", "someone", "nobody", "somebody",
]);
const perfectNeedsPassive: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 1; i < w.length - 1; i++) {
    if (!/^(has|have|had)$/.test(w[i].norm)) continue;
    let j = i + 1;
    while (j < w.length && /^(not|already|just|finally|also|now|recently)$/.test(w[j].norm)) j++;
    const v = w[j];
    if (!v || !PASSIVE_PERFECT.has(v.norm)) continue;
    // An object after the verb means active voice: "we have fixed the pump".
    const next = w[j + 1]?.norm ?? "";
    if (DETERMINERS.has(next) || /^(it|them|us|him|her|this|that|these|those|everything|something)$/.test(next)) continue;
    const subj = w[i - 1].norm;
    if (/^(i|we|you|they|he|she|who)$/.test(subj) || PERSON_NOUNS.has(subj) || /^[A-Z]/.test(w[i - 1].raw) && i - 1 > 0) continue;
    const between = w.slice(i + 1, j).map((t) => t.norm);
    out.push({
      rule: "perfect-needs-passive", from: i, to: j + 1, replacement: [w[i].norm, ...between, "been", v.norm].join(" "), category: "verb-form", severity: "major", skill: "passive",
      messageKo: `'${w[i - 1].raw}'는 스스로 ${v.norm.replace(/ed$/, "")}하는 것이 아니라 그렇게 '된' 것이라 수동 현재완료가 필요합니다: '${[w[i].raw, ...between, "been", v.raw].join(" ")}'.`,
    });
  }
  return out;
};

/** "it look good", "he need it" → third person -s (not after let/make/help or in questions). */
const thirdPersonBase: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(he|she|it)$/.test(w[i].norm)) continue;
    const prev = w[i - 1]?.norm ?? "";
    if (/^(let|make|makes|made|help|helps|see|saw|watch|hear|have|has|had|do|does|did|will|would|can|could|should|may|might|must|to|let's|if|that|which|whether)$/.test(prev)) continue;
    // "I got it. Thank you": the pronoun ends one sentence and the verb starts the next.
    if (brokenAfter(w, i)) continue;
    const v = w[i + 1];
    const info = verbInfo(v.norm);
    if (!info || info.form !== "base" || v.norm !== info.base || isSameFormParticiple(info.base) || /^(be|have|do)$/.test(info.base)) continue;
    if (!UNAMBIGUOUS_VERBS.has(info.base) && !/^(look|seem|need|want|work|take|make|mean|depend|cost|sound|feel|happen|matter|go|come|get|run|say|know|think|like|take|give)$/.test(info.base)) continue;
    const fix = thirdPersonOf(info.base);
    out.push({
      rule: "third-person-s", from: i + 1, to: i + 2, replacement: fix, category: "agreement", severity: "major", skill: "agreement",
      messageKo: `주어 '${w[i].raw}'는 3인칭 단수라서 동사에 -s를 붙입니다: '${w[i].raw} ${fix}'.`,
    });
  }
  // "Wow, that look good", "That make sense": this/that as the subject of a reaction.
  // Only when the clause starts there and the verb's usual partner follows ("that look" alone may be a noun).
  for (let i = 0; i < w.length - 2; i++) {
    if (!/^(this|that)$/.test(w[i].norm)) continue;
    if (i > 0 && !brokenAfter(w, i - 1) && !/^(and|but|so|yes|yeah|oh|wow|well|okay|ok|great|right)$/.test(w[i - 1].norm)) continue;
    if (brokenAfter(w, i)) continue;
    const v = w[i + 1].norm;
    const after = w[i + 2].norm;
    const reaction =
      (/^(look|sound|seem|feel|taste|smell)$/.test(v) &&
        /^(so|really|very|quite|pretty|great|good|nice|fine|perfect|like|amazing|delicious|interesting|weird|strange|right|wrong|okay|ok|correct|lovely|fantastic|awesome|terrible|bad|better|worse|reasonable|fair|familiar|easy|difficult|hard|tough|exciting|fun|busy|tight|expensive|cheap|good)$/.test(after)) ||
      (v === "make" && after === "sense") ||
      (v === "depend" && after === "on") ||
      (v === "work" && /^(for|fine|well|better)$/.test(after));
    if (!reaction) continue;
    const fix = thirdPersonOf(v);
    out.push({
      rule: "third-person-s", from: i + 1, to: i + 2, replacement: fix, category: "agreement", severity: "major", skill: "agreement",
      messageKo: `주어 '${w[i].raw}'는 3인칭 단수라서 동사에 -s를 붙입니다: '${w[i].raw} ${fix}'.`,
    });
  }
  return out;
};

const RULES: Rule[] = [
  itsContraction,
  lexicalAgreement,
  thirdConditionalWill,
  comparisonForms,
  missingBeProgressive, waitWithoutFor, prepositionBaseVerb, modalTo, modalInflected, doubleModal, beBaseVerb,
  perfectBaseVerb, doPast, agreement, doubleComparative, willInConditionClause, uncountablePlural, everyPlural, nonWords, articleSound,
  transitivePreposition, bareSingularCountable, perfectNeedsPassive, thirdPersonBase,
  moreShortAdjective, veryVerb, enoughOrder, missingSubjectIt, missingBeAdjective, letMakeTo, thereIsPlural, numberSingular,
];

export function runRules(words: Token[]): RuleFinding[] {
  const all = RULES.flatMap((r) => r(words));
  // Drop findings whose ranges overlap an earlier finding (first rule wins).
  const kept: RuleFinding[] = [];
  for (const f of all) {
    const overlaps = kept.some((k) => (f.from === f.to ? f.from > k.from && f.from < k.to : f.from < k.to && k.from < f.to) || (f.from === k.from && f.to === k.to));
    if (!overlaps) kept.push(f);
  }
  return kept;
}
