import type { ErrorCategory, Severity } from "./types";
import { type Token, BE_FORMS, SUBJECT_PRONOUNS, DETERMINERS, MODALS } from "./text";

import {
  CONSONANT_SOUND_VOWEL_START, ING_NOUNS, NON_WORDS, UNAMBIGUOUS_VERBS, UNCOUNTABLE_PLURALS,
  VOWEL_SOUND_CONSONANT_START, ingOf, isBaseVerb, isSameFormParticiple, participleOf, verbInfo,
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
    if (!info || info.form !== "ing") continue;
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
    if (!/^(before|after|without|by|instead|besides)$/.test(p)) continue;
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
    const objectFollows = !!next && (DETERMINERS.has(next) || OBJECT_DETERMINERS.has(next));
    if (!UNAMBIGUOUS_VERBS.has(v.norm) && !objectFollows) continue;
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
    if (w[j]?.norm === "not") j++;
    const v = w[j];
    if (!v || !UNAMBIGUOUS_VERBS.has(v.norm) || isSameFormParticiple(v.norm) || BE_ADJECTIVE_OK.has(v.norm)) continue;
    if (w[j + 1]?.norm === "to" && v.norm === "able") continue;
    const subj = w[i - 1]?.norm ?? "";
    const third = /^(he|she|it|this|that)$/.test(subj);
    const fix = v.norm === "agree" || !third ? v.norm : v.norm + "s";
    out.push({
      rule: "be-base-verb", from: i, to: j + 1, replacement: (j > i + 1 ? (third ? "does not " : "do not ") : "") + (j > i + 1 ? v.norm : fix),
      category: "verb-form", severity: "major", skill: "agreement",
      messageKo: `be동사와 일반동사를 함께 쓸 수 없습니다. '${w[i].raw} ${v.raw}' → '${j > i + 1 ? (third ? "does not " : "do not ") + v.norm : fix}'. (예: I agree / We understand)`,
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
    const s = c === "soon" ? i + 2 : i + 1;
    if (!SUBJECT_PRONOUNS.has(w[s]?.norm ?? "") || w[s + 1]?.norm !== "will") continue;
    if (w[s + 2]?.norm === "be" && w[s + 3]?.norm === "able") continue;
    const subj = w[s].norm;
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
      out.push({ rule: "adjective-for-adverb", from: i + 1, to: i + 2, replacement: adv, category: "word-choice", severity: "major", skill: "agreement", messageKo: `동사를 꾸밀 때는 부사를 씁니다: '${w[i + 1].raw}' → '${adv}'.` });
    }
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

const RULES: Rule[] = [
  itsContraction,
  lexicalAgreement,
  thirdConditionalWill,
  comparisonForms,
  missingBeProgressive, waitWithoutFor, prepositionBaseVerb, modalTo, modalInflected, doubleModal, beBaseVerb,
  perfectBaseVerb, doPast, agreement, doubleComparative, willInConditionClause, uncountablePlural, everyPlural, nonWords, articleSound,
  transitivePreposition,
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
