import type { ErrorCategory, Severity } from "./types";
import { type Token, BE_FORMS, SUBJECT_PRONOUNS, DETERMINERS, MODALS, PREPOSITIONS } from "./text";
import { wordKind } from "./numwords";

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
 * True when clause punctuation (a comma, a full stop, a dash, a bracket)
 * separates word i from word i+1 — marked by the tokenizer, so "15% is" or a
 * quoted word is not a break. Parts of one contraction are never split.
 */
function brokenAfter(w: Token[], i: number): boolean {
  return !!w[i] && !!w[i + 1] && !!w[i].breakAfter;
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
    // "Sorry to keep you waiting", "I saw it coming": you/it right after a verb is its object.
    // "I appreciate you telling us", "I remember you saying that": a gerund with its own subject.
    if ((subj === "you" || subj === "it") && i > 0 && !brokenAfter(w, i - 1) && /^(keep|keeps|kept|keeping|see|saw|seen|seeing|find|found|finding|hear|heard|hearing|leave|left|leaving|watch|watching|catch|caught|catching|imagine|mind|get|got|getting|notice|noticed|have|had|having|spot|spotted|set|start|started|send|sent|appreciate|appreciated|appreciates|remember|remembered|recall|like|liked|love|loved|hate|hated|prefer|dislike|risk|stop|stopped|prevent|prevented|picture|understand|excuse|forgive)$/.test(w[i - 1].norm)) continue;
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
    if (brokenAfter(w, i)) continue; // "keep you waiting. The meeting ran over."
    const next = w[i + 1].norm;
    const after = w[i + 2]?.norm;
    const isObj = WAIT_OBJECTS.has(next) || (OBJECT_DETERMINERS.has(next) && !!after && !/^(to|until|for|minute|minutes|day|days|week|weeks|while|few|couple|little|bit|moment|second|hour|hours|month|months|long|much)$/.test(after));
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
    // "after work", "before lunch": everyday nouns.
    // ("before use it" still needs "using": an object follows.)
    if (/^(work|school|class|practice|use|lunch|dinner|breakfast|sleep|rest|shutdown|startup|maintenance|commissioning)$/.test(v.norm) && /^(before|after|without)$/.test(p) && !/^(it|them|this|that)$/.test(w[k + 1]?.norm ?? "")) continue;
    // "by email the next day": after "by", a word that is also a noun is usually that noun.
    if (p === "by" && !UNAMBIGUOUS_VERBS.has(v.norm)) continue;
    // "before start-up", "before test results" — only fire when an object/determiner or end follows, or the verb is unambiguous.
    const next = w[k + 1]?.norm;
    const objectFollows = !!next && (DETERMINERS.has(next) || OBJECT_DETERMINERS.has(next) || /^(me|him|us|them|it)$/.test(next));
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
    if (!MODALS.has(w[i].norm)) continue;
    // "must never to open": adverbs between the modal and "to" do not change anything.
    let a = i + 1;
    while (a < w.length && /^(never|not|also|really|still|just|always|definitely|probably|actually|first)$/.test(w[a].norm)) a++;
    if (a > i + 1 && w[a]?.norm === "to" && isBaseVerb(w[a + 1]?.norm ?? "")) {
      out.push({
        rule: "modal-to", from: a, to: a + 1, replacement: "", category: "verb-form", severity: "major", skill: "modal-necessity",
        messageKo: `조동사 '${w[i].raw}' 뒤에는 to 없이 동사원형이 옵니다: '${w.slice(i, a).map((x) => x.raw).join(" ")} ${w[a + 1].raw}'.`,
      });
      continue;
    }
    if (w[i + 1].norm !== "to") continue;
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
    // "Would working from home be possible?" has a gerund subject; "you can adding" does not.
    if (info.form === "ing" && (i === 0 || brokenAfter(w, i - 1) || ING_NOUNS.has(v.norm) || !SUBJECT_PRONOUNS.has(w[i - 1].norm))) continue;
    if (info.form === "pp" && isSameFormParticiple(info.base)) continue;
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
    if (!/^(might|may|will|would|should|must|can|could)$/.test(w[i].norm)) continue;
    const second = w[i + 1].norm;
    // "might can" → "might be able to"; "will must" → "will have to".
    const replacement = /^(can|could)$/.test(second) && w[i].norm !== "can" && w[i].norm !== "could" ? "be able to" : second === "must" ? "have to" : null;
    if (!replacement) continue;
    out.push({
      rule: "double-modal", from: i + 1, to: i + 2, replacement, category: "verb-form", severity: "major", skill: second === "must" ? "modal-necessity" : "modal-possibility",
      messageKo: `조동사는 두 개를 연달아 쓸 수 없습니다. '${w[i].raw} ${w[i + 1].raw}' 대신 '${w[i].raw} ${replacement}'를 쓰세요.`,
    });
  }
  return out;
};

/** Verbs that are also nouns, wrong right after "I am / we are / they are": "I am plan to bring" → "I plan to bring". */
const PRONOUN_BE_VERBS = new Set(["have", "plan", "need", "hope", "work", "use", "help", "try", "support", "check", "review", "request", "mean", "visit", "call", "feel", "start", "look", "wait", "go", "come", "leave", "stay", "focus", "think", "want", "know", "agree", "understand", "remember", "forget", "miss", "owe", "love", "enjoy", "live", "believe", "guess", "wonder", "appreciate", "prefer"]);

/** Words that are also adjectives after be ("isn't complete yet", "is clear"). */
const BE_ADJECTIVE_OK = new Set(["complete", "correct", "separate", "open", "close", "clean", "dry", "free", "clear", "ready", "secure"]);

/** be + base verb: "I am agree", "it is need" → "I agree", "it needs". */
const beBaseVerb: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm === "be" || w[i].norm === "been") {
      // "to be change", "will be finish", "has been deliver" → the past participle.
      let j = i + 1;
      while (j < w.length && /^(really|also|still|just|already|fully|properly)$/.test(w[j].norm)) j++;
      const v = w[j];
      if (!v || BE_ADJECTIVE_OK.has(v.norm) || isSameFormParticiple(v.norm)) continue;
      const vi = verbInfo(v.norm);
      if (!vi || vi.form !== "base" || v.norm !== vi.base) continue;
      if (!UNAMBIGUOUS_VERBS.has(v.norm) && !/^(change|use|check|test|fix|finish|approve|deliver|send|install|replace|repair|update|review|move|cancel|delay|postpone|schedule|ship|solve|discuss|complete|inform|ask|tell|pay|serve|eat|cook|make|do|give|take)$/.test(v.norm)) continue;
      if (v.norm === "able" || w[j + 1]?.norm === "to" && v.norm === "able") continue;
      const pp = participleOf(v.norm);
      if (pp === v.norm) continue;
      out.push({
        rule: "be-participle", from: j, to: j + 1, replacement: pp, category: "verb-form", severity: "major", skill: "passive",
        messageKo: `'${w[i].raw}' 뒤에 동사가 오면 과거분사(수동태)입니다: '${w[i].raw} ${pp}'.`,
      });
      continue;
    }
    if (!BE_FORMS.has(w[i].norm) || w[i].norm === "being") continue;
    let j = i + 1;
    let negated = false;
    while (j < w.length && /^(not|really|also|still|just|always|never|usually|actually|already|so|truly)$/.test(w[j].norm)) {
      if (w[j].norm === "not" || w[j].norm === "never") negated = true;
      j++;
    }
    const v = w[j];
    // "All we need to do is confirm …", "All I did was ask": the base verb is right after "do is/was".
    if (/^(do|did|does)$/.test(w[i - 1]?.norm ?? "")) continue;
    // After I/we/they/you, also common verbs that double as nouns: "I am plan to…", "we are need…", "I'm look forward…".
    const personal = /^(i|we|they|you)$/.test(w[i - 1]?.norm ?? "") && /^(am|are|was|were)$/.test(w[i].norm);
    // "I'm head out now" → "I'm heading out" (head as a verb: out, home, back …; "I'm head of sales" is the noun).
    if (v && personal && v.norm === "head" && /^(out|home|back|off|over|to|down|up)$/.test(w[j + 1]?.norm ?? "")) {
      out.push({
        rule: "be-base-verb", from: j, to: j + 1, replacement: "heading", category: "verb-form", severity: "major", skill: "progressive",
        messageKo: `be동사 뒤에 동사원형을 쓸 수 없습니다. 지금 가는 중이면 '${w[i].raw} heading ${w[j + 1].raw}'입니다.`,
      });
      continue;
    }
    if (v && personal && v.norm === "worry" && !negated) {
      out.push({
        rule: "be-participle", from: j, to: j + 1, replacement: "worried", category: "verb-form", severity: "major", skill: "be-adj",
        messageKo: `'걱정된다'는 'be worried'입니다: '${w[i].raw} ${v.raw}' → '${w[i].raw} worried'. (동사로 쓰면 'I worry about…')`,
      });
      continue;
    }
    // "If it still is not work", "that is not suit you": a negated be with a verb that is rarely a noun there.
    const subjBefore = /^(still|really|also|just|now|probably)$/.test(w[i - 1]?.norm ?? "") ? w[i - 2]?.norm : w[i - 1]?.norm;
    // A day or time that "is not work for me" is the verb too ("Thursday doesn't work for me").
    const timeSubject = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|time|date|day|slot)$/.test(subjBefore ?? "") && v?.norm === "work";
    const thingNeg = !!v && negated && (/^(it|this|that)$/.test(subjBefore ?? "") || timeSubject) && /^(work|suit|fit|match|include|cover|mean|matter|help|need|make|take|look|seem|support|affect|change|happen|exist|apply|depend|belong|get)$/.test(v.norm);
    // "It's not work, it's fun" uses the noun; a following word or an if/when clause shows the verb.
    const clauseHasConj = w.slice(Math.max(0, i - 4), i).some((x) => /^(if|when|because|unless|once)$/.test(x.norm));
    const verbUse = thingNeg && ((j < w.length - 1 && !brokenAfter(w, j)) || clauseHasConj);
    const nounVerb = !!v && ((personal && PRONOUN_BE_VERBS.has(v.norm)) || verbUse);
    if (!v || (!UNAMBIGUOUS_VERBS.has(v.norm) && !nounVerb) || isSameFormParticiple(v.norm) || BE_ADJECTIVE_OK.has(v.norm)) continue;
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
    const fix = v.norm === "agree" || !third ? v.norm : thirdPersonOf(v.norm);
    const advs = w.slice(i + 1, j).map((x) => x.norm);
    // A thing that undergoes the action with no object after it was meant as passive:
    // "Samgyetang is usually eat in summer" → "is usually eaten", "The report is not finish yet" → "is not finished".
    const nextW = w[j + 1]?.norm ?? "";
    const objectFollows = DETERMINERS.has(nextW) || /^(me|you|him|her|us|them|it|this|that|these|those|everything|something)$/.test(nextW);
    const passive = !personal && !/^(i|we|you|they|he|she)$/.test(subj) && !objectFollows && UNAMBIGUOUS_VERBS.has(v.norm) && !/^(work|happen|exist|matter|depend|belong|seem|look|apply|agree|arrive|wait|go|come|stay|suit|fit)$/.test(v.norm);
    // Negative: "is not meet" → "does not meet"; adverbs only: "is usually eat" → "usually eats".
    const replacement = passive
      ? [w[i].norm, ...advs, participleOf(v.norm)].join(" ")
      : !advs.length ? fix : negated ? `${third ? "does" : "do"} ${advs.join(" ")} ${v.norm}` : `${advs.join(" ")} ${fix}`;
    out.push({
      rule: "be-base-verb", from: i, to: j + 1, replacement,
      category: "verb-form", severity: "major", skill: "agreement",
      messageKo: `be동사와 일반동사를 함께 쓸 수 없습니다. '${w.slice(i, j + 1).map((x) => x.raw).join(" ")}' → '${replacement}'. 부정은 do/does + not + 동사원형입니다. (예: It does not meet … / We do not agree.)`,
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
    const pronounOrModal = SUBJECT_PRONOUNS.has(prev) || /^(not|already|we|they|you|i|will|would|might|could|should|must)$/.test(prev);
    // A noun subject counts only with "not" in between ("The parts haven't arrive"): "have" right after a noun may be a main verb.
    const nounSubject = !!prev && !pronounOrModal && w[i + 1]?.norm === "not" && !DETERMINERS.has(prev) && !PREPOSITIONS.has(prev) && !brokenAfter(w, i - 1);
    if (!pronounOrModal && !nounSubject) continue;
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
    // "to do that", "can do it": the main verb do; "Yes, I did. The match was …" said without punctuation: a short answer.
    if (i > 0 && /^(to|can|could|will|would|should|must|might|may|please|let's)$/.test(w[i - 1].norm)) continue;
    if (i > 0 && SUBJECT_PRONOUNS.has(w[i - 1].norm) && w[i + 1]?.norm !== "not" && !SUBJECT_PRONOUNS.has(w[i + 1]?.norm ?? "")) continue;
    let j = i + 1;
    const INDEF = /^(anyone|anybody|everyone|everybody|someone|somebody|nobody|anything|everything|something)$/;
    if (w[j]?.norm === "not") j++;
    else if (SUBJECT_PRONOUNS.has(w[j]?.norm ?? "")) j++;
    else if (INDEF.test(w[j]?.norm ?? "")) j += w[j + 1]?.norm === "else" ? 2 : 1; // "Does anyone else has …?"
    else if (/^(the|this|that|your|our|their|my|his|her)$/.test(w[j]?.norm ?? "") && w[j + 1] && !verbInfo(w[j + 1].norm)) j += 2; // "Does the pump works?"
    else continue;
    const v = w[j];
    if (!v) continue;
    const info = verbInfo(v.norm);
    // "Does the shuttle runs?" is clear; only a past form that equals the base ("did put") cannot be told apart.
    if (!info || (info.form !== "past" && info.form !== "3sg" && info.form !== "ing") || (info.form === "past" && isSameFormParticiple(info.base))) continue;
    if (info.form === "ing" && ING_NOUNS.has(v.norm)) continue;
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
      // "Got it do you know where …" (said without punctuation): "do you" starts a new question.
      if (SUBJECT_PRONOUNS.has(w[i + 2]?.norm ?? "") && /^(do|have|are|were)$/.test(v)) continue;
      out.push({
        rule: "agreement-3sg", from: i + 1, to: i + 2, replacement: third[v], category: "agreement", severity: "major", skill: "agreement",
        messageKo: `주어 '${w[i].raw}'는 3인칭 단수라서 '${w[i + 1].raw}' 대신 '${third[v]}'를 씁니다.`,
      });
    } else if (/^(we|they|you)$/.test(s) && plural[v] && !(i > 0 && verbInfo(w[i - 1].norm)) && !(i > 0 && /^(with|to|for|about|from|of|at|by|on|in|without)$/.test(w[i - 1].norm))) {
      // ("Working with you has been great": "you" is the object of "with"; the subject is the -ing phrase.)
      out.push({
        rule: "agreement-plural", from: i + 1, to: i + 2, replacement: plural[v], category: "agreement", severity: "major", skill: "agreement",
        messageKo: `주어 '${w[i].raw}'는 복수라서 '${w[i + 1].raw}' 대신 '${plural[v]}'를 씁니다.`,
      });
    } else if (s === "i" && (v === "is" || v === "are" || v === "has") && !(v === "are" && /^(and|or)$/.test(w[i - 1]?.norm ?? ""))) {
      // ("Mina and I are having a baby": a compound subject is plural.)
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
    if (n === "better" || n === "worse" || (/er$/.test(n) && /^(fast|high|low|early|earli|late|big|small|easi|cheap|safe|short|long|quick|slow|strong|weak|large|wide|hot|cold|dry|wet|loud|quiet|clear|warm|cool|nice|busi|heavi|happi|simple|smooth|tight|clean|light|bright|deep|near|close|fresh|soft|hard|thick|thin|young|old|new|great|rich|poor|tall)/.test(n) && n.length > 4)) {
      out.push({
        rule: "double-comparative", from: i, to: i + 1, replacement: "", category: "word-choice", severity: "major", skill: "comparative",
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
    const isTime = /^(if|when|whenever|before|after|until|unless|once)$/.test(c) || (c === "soon" && w[i - 1]?.norm === "as" && w[i + 1]?.norm === "as");
    if (!isTime) continue;
    // Noun clauses ("I don't know when they will…", "not sure if they will…") may take will.
    // ("tell me when it will …" asks a question; "call me when you will get a chance" is a time clause.)
    const objectOf = /^(me|us|him|her|them)$/.test(w[i - 1]?.norm ?? "") && !/^(tell|told|ask|asked|show|remind|update|inform|teach|email|text|message|let)$/.test(w[i - 2]?.norm ?? "");
    if ((c === "if" || c === "when") && !objectOf && /^(know|sure|ask|asked|asking|wonder|wondering|wondered|check|checking|confirm|tell|clear|decide|understand|see|unclear|certain|idea|whether|about|out|me|us|him|her|them|learn|guess|predict|say|said|note|update)$/.test(w[i - 1]?.norm ?? "")) continue;
    let s = c === "soon" ? i + 2 : i + 1;
    let subj = w[s]?.norm ?? "";
    // "when Mr. Park will join": a name is a third-person subject.
    if (/^(mr|ms|mrs|dr)$/.test(subj) && /^[A-Z]/.test(w[s + 1]?.raw ?? "") && w[s + 2]?.norm === "will") { subj = "he"; s = s + 1; }
    else if (/^[A-Z]/.test(w[s]?.raw ?? "") && !SUBJECT_PRONOUNS.has(subj) && w[s + 1]?.norm === "will" && i + 1 === s) subj = "he";
    // A noun-phrase subject ("the pump", "our vendor") stands where a pronoun would.
    // "After the meeting, I will…" and "after that we will…" are adverbials before the main clause, not subjects.
    // "If something really urgent will come up": an indefinite pronoun with words after it.
    if (/^(something|someone|somebody|anything|anyone|anybody|everyone|everybody|nothing|nobody)$/.test(subj) && w[s + 1]?.norm !== "will") {
      const k = w.findIndex((x, m) => m > s && m <= s + 3 && x.norm === "will");
      if (k > 0 && !w.slice(s, k).some((_, m) => brokenAfter(w, s + m))) { subj = "it"; s = k - 1; }
    } else if (/^(something|someone|somebody|anything|anyone|anybody|everyone|everybody|nothing|nobody)$/.test(subj)) subj = "it";
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
    // "If you ever will want to …": an adverb between the subject and will.
    // ("If it still won't work" is a refusal: "will not" is left alone.)
    if (SUBJECT_PRONOUNS.has(subj) && /^(ever|really|also|just|actually)$/.test(w[s + 1]?.norm ?? "") && w[s + 2]?.norm === "will" && w[s + 3]?.norm !== "not") s++;
    if (!SUBJECT_PRONOUNS.has(subj) || w[s + 1]?.norm !== "will") continue;
    if (w[s + 2]?.norm === "be" && w[s + 3]?.norm === "able") continue;
    const v = w[s + 2];
    const info = v ? verbInfo(v.norm) : null;
    const third = /^(he|she|it)$/.test(subj);
    const repl = info ? (third ? (info.base === "be" ? "is" : info.base === "have" ? "has" : thirdPersonOf(info.base)) : info.base === "be" ? (subj === "i" ? "am" : "are") : info.base) : "";
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
    // "…, so now we will have to move it": an obligation, not a third-conditional result.
    if (w[i].norm === "will" && w[i + 1].norm === "have" && w[i + 2].norm !== "to") {
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
    // "the most cheap option" → "the cheapest".
    if (w[i].norm === "most" && w[i - 1]?.norm === "the" && SHORT_COMPARATIVE[w[i + 1].norm] && !brokenAfter(w, i)) {
      const comp = SHORT_COMPARATIVE[w[i + 1].norm];
      const sup = comp === "better" ? "best" : comp === "worse" ? "worst" : comp.replace(/er$/, "est");
      out.push({
        rule: "most-short-adjective", from: i, to: i + 2, replacement: sup, category: "word-choice", severity: "major", skill: "comparative",
        messageKo: `짧은 형용사의 최상급은 'most'가 아니라 '-est'를 붙입니다: 'the most ${w[i + 1].raw}' → 'the ${sup}'.`,
      });
      continue;
    }
    if (w[i].norm !== "more" || brokenAfter(w, i)) continue;
    const a = w[i + 1];
    const comp = SHORT_COMPARATIVE[a.norm];
    if (!comp) continue;
    const next = w[i + 2];
    const prev = w[i - 1]?.norm ?? "";
    // "more big dryers", "more good news": more counts the noun phrase, which is fine.
    const clauseEnds = !next || brokenAfter(w, i + 1) || /^(than|in|on|at|for|to|because|so|and|but|or|if|when|now|today|tonight|tomorrow|this|next|during|after|before|with|from|by|until|please|enough|then|again|soon|later|already|still|too|overall|anyway|these|every|over|about)$/.test(next.norm);
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
    if (!/^(like|want|need|appreciate|enjoy|hope|agree|love|thank|understand|recommend|prefer|worry|wish|miss|respect|regret|likes|wants|needs|loves|enjoys|hopes|appreciates|prefers|liked|loved|enjoyed|wanted)$/.test(w[i + 1].norm)) continue;
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
      /^(still|too|so|very|really|already|not|just|quite|pretty|fine|okay|ok|good|great|nice|ready|done|important|possible|necessary|difficult|easy|hard|hot|cold|warm|true|better|worse|late|early|delicious|expensive|cheap|interesting|raining|snowing|sunny|cloudy|windy|freezing|humid|normal|totally|completely|absolutely|definitely|probably|always|never|usually|perfect|amazing|beautiful|wonderful|terrible|strange|weird|funny|on|in|at|for|from|over|up|down|about|black|white|blank|empty|dark|frozen|broken|stuck|full|closed|open|off)$/.test(n.norm);
    // A statement (it ends with "." or "!") that starts with is/was has lost its subject: "Is a small world!", "Is nearly done."
    const sentEnd = w.slice(i).find((t) => t.sentenceEnd);
    // (A question typed with a full stop still has its subject: "Is that right.", "Is the room ready.")
    const statement = !!sentEnd && !sentEnd.question && !/^(there|here|this|that|it|he|she|you|we|they|everything|everyone|anything|anyone|someone|something|the|your|my|our|his|her|their|its)$/.test(n.norm);
    if (!predicate && !statement) continue;
    // "Is early check-in possible?", "Is hot water available?": the adjective begins the subject of a question.
    const nn = w[i + 2];
    if (nn && !brokenAfter(w, i + 1) && /^[a-z]/.test(nn.norm) && !verbInfo(nn.norm) && !/^(to|that|than|and|or|but|so|for|with|in|on|at|of|now|today|here|there|enough|yet|again|outside|inside)$/.test(nn.norm) && w.slice(i + 2).some((t) => /^(possible|available|necessary|okay|ok|fine|included|ready|allowed|free)$/.test(t.norm))) continue;
    const fix = be === "is" ? (/^[A-Z]/.test(w[i].raw) ? "It's" : "it's") : /^[A-Z]/.test(w[i].raw) ? "It was" : "it was";
    out.push({
      rule: "missing-subject-it", from: i, to: i + 1, replacement: fix, category: "sentence-structure", severity: "major", skill: "be-adj",
      messageKo: `영어 문장에는 주어가 꼭 있어야 합니다. 날씨·상황·앞에서 말한 것을 가리킬 때는 'it'을 씁니다: '${w[i].raw} ${n.raw}' → '${fix} ${n.raw}'.`,
    });
  }
  return out;
};

/** "I sorry", "we ready", "they busy" → be + adjective. */
// "close" is left out: "Before we close, …" is the verb.
const PREDICATE_ADJECTIVES = /^(sorry|ready|late|sure|available|busy|happy|glad|afraid|okay|ok|aware|able|unable|careful|sick|hungry|full|fine|right|wrong|serious|free|alright|tired|responsible)$/;
const missingBeAdjective: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const s = w[i].norm;
    if (!SUBJECT_PRONOUNS.has(s) || brokenAfter(w, i)) continue;
    const prev = w[i - 1]?.norm ?? "";
    // Question order ("Are you ready?") or an object pronoun ("make it ready", "keep you busy").
    if (i > 0 && !brokenAfter(w, i - 1) && (BE_FORMS.has(prev) || /^(do|does|did|have|has|had|will|would|can|could|should|to|than|as)$/.test(prev))) continue;
    // "it"/"you" are also objects ("resend it right away", "get it right"): only a clause-initial one is a subject.
    if ((s === "it" || s === "you") && i > 0 && !brokenAfter(w, i - 1) && !/^(and|but|so|because|if|when|that|since|or|then|maybe|actually|well|yes|no|oh|okay|ok|sure|hope|think|guess|believe|know|wonder)$/.test(prev)) continue;
    const a = w[i + 1];
    if (!PREDICATE_ADJECTIVES.test(a.norm)) continue;
    // "You okay?", "You ready?", "You free tonight?": casual spoken questions drop "Are".
    if (s === "you" && (i === 0 || brokenAfter(w, i - 1)) && w[w.length - 1]?.question) continue;
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
    let v = i + 3;
    while (v < w.length && /^(just|quickly|briefly|first|really|also|now)$/.test(w[v].norm)) v++;
    if (!w[v] || !isBaseVerb(w[v].norm)) continue;
    out.push({
      rule: "let-make-to", from: i + 2, to: i + 3, replacement: "", category: "verb-form", severity: "major", skill: "verb-object",
      messageKo: `'${w[i].norm} + 사람 + 동사원형'입니다. to를 쓰지 않습니다: '${w[i].raw} ${w[i + 1].raw} ${w[v].raw}'.`,
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
    // "lots of food" is uncountable: only "lots of" + a plural noun needs "are".
    const plural = /^(two|three|four|five|six|seven|eight|nine|ten|several|many|both)$/.test(q) ||
      (q === "lots" && w[j + 1]?.norm === "of" && /^[a-z]{3,}[^s']s$/.test(w[j + 2]?.norm ?? "")) ||
      (q === "a" && w[j + 1]?.norm === "few") || (q === "some" && /^[a-z]{3,}[^s']s$/.test(w[j + 1]?.norm ?? "") && verbInfo(w[j + 1].norm)?.form !== "3sg");
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
    if (next && !brokenAfter(w, i + 1) && !/^(of|for|to|in|on|at|with|from|about|by|and|or|but|because|so|that|which|ago|later|left|instead|before|after|is|are|was|were|will|can|could|should|would|might|must|have|has|had|now|until|per|each|maybe|this|next|last|tonight|tomorrow|today|please)$/.test(next.norm)) continue;
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
    // "A is cheaper to buy, but B uses less steam": option A as the subject, not an article.
    if (w[i].raw === "A" && /^(is|was|has|uses|costs|needs|will|would|can|could|looks|seems|gives|takes|and|or)$/.test(n)) continue;
    if (!/^[a-z]/.test(n)) continue;
    const raw = w[i + 1].raw;
    // Acronyms are read letter by letter ("an RFQ"), except those read as words ("a SIM card", "a PIN").
    // A single capital letter is read as a letter: "an H", "an F", "a B".
    if (/^[A-Z]$/.test(raw)) {
      const vs = /^[AEFHILMNORSX]$/.test(raw);
      if (a === "a" && vs) out.push({ rule: "article-an", from: i, to: i + 1, replacement: "an", category: "article", severity: "minor", skill: "articles", messageKo: `'${raw}'는 모음 소리로 읽으므로 'an'을 씁니다.` });
      if (a === "an" && !vs) out.push({ rule: "article-a", from: i, to: i + 1, replacement: "a", category: "article", severity: "minor", skill: "articles", messageKo: `'${raw}'는 자음 소리로 읽으므로 'a'를 씁니다.` });
      continue;
    }
    const acronym = /^[A-Z][A-Z0-9&]+$/.test(raw.replace(/[^A-Za-z0-9&]/g, "")) && !/^(SIM|PIN|NASA|SCADA|LASER|RADAR|COVID|ASAP|LAN|WAN|RAM|ROM|PET)$/.test(raw.replace(/[^A-Za-z]/g, ""));
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
  const pairs: Record<string, string[]> = { discuss: ["about"], mention: ["about"], contact: ["to", "with"], explain: [], emphasize: ["on"], answer: ["to"], approach: ["to"], enter: ["into"], attend: ["to"], review: ["about"], reach: ["to"], exceed: ["over"], marry: ["with"], resemble: ["to"], visit: ["to"] };
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
    if (!n || !/^[a-z]{2,}[^suia']s$/.test(n.norm) || verbInfo(n.norm)?.form === "3sg") return [];
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
  "weekend", "team", "lobby", "station", "price",
  "message", "discount", "opinion", "helmet", "person", "reply", "ticket", "receipt", "seat", "passport", "visa", "car",
  // Everyday life ("I need taxi", "I have headache", "Is there bank near here?").
  "taxi", "cab", "table", "headache", "bank", "pharmacy", "umbrella", "menu", "reservation", "appointment", "interview",
  "area", "terminal", "concert", "museum", "printer", "cabinet",
  "apartment", "doctor", "dentist", "map", "suitcase", "souvenir", "sandwich", "toothache", "stomachache", "fever", "friend",
]);
const NP_DETERMINERS = new Set([
  ...DETERMINERS, "my", "one", "two", "three", "first", "second", "last", "next", "which", "what", "whose", "such", "many", "much", "less", "little", "extra",
  "either", "neither", "per", "each", "every", "same",
]);
const bareSingularCountable: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length; i++) {
    const n = w[i];
    if (!COUNTABLE_NOUNS.has(n.norm) || n.expanded) continue;
    const before = w[i - 1]?.norm ?? "";
    // "the data and report" shares its determiner; "and report at the meeting", "to report", "we report": a verb.
    if (/^(and|or)$/.test(before)) continue;
    // "a lot of friend" is a missing plural (reported elsewhere), not a missing article.
    if (before === "of" && /^(lot|lots)$/.test(w[i - 2]?.norm ?? "")) continue;
    // "How about meeting at six?": a gerund after how/what about.
    if (before === "about" && /ing$/.test(n.norm) && /^(how|what)$/.test(w[i - 2]?.norm ?? "")) continue;
    // "in person", "per person": fixed phrases.
    if (n.norm === "person" && /^(in|per|to)$/.test(before)) continue;
    // "by train", "by email": transport and means take no article; "an increase in price" is uncountable use.
    // "too far apart on price", "Price is our main concern": price in general takes no article.
    if (n.norm === "price" && (/^(on|about|over)$/.test(before) || i === 0 || brokenAfter(w, i - 1))) continue;
    if (before === "by" || (n.norm === "price" && before === "in" && /^(increase|decrease|rise|drop|change|difference|increases|changes)$/.test(w[i - 2]?.norm ?? ""))) continue;
    if (verbInfo(n.norm) && /^(to|will|would|can|could|should|must|may|might|please|let's|lets|i|we|you|they|not|also|then|and|or|just|always|usually|often)$/.test(before)) continue;
    // Heads its phrase only: followed by the end, a function word or a verb (not by another noun or an object).
    const next = w[i + 1];
    if (next) {
      const nn = next.norm;
      const isVerb = !!verbInfo(nn) && !COUNTABLE_NOUNS.has(nn);
      const isFunction = /^(of|for|to|in|on|at|with|from|about|by|and|or|but|because|so|that|which|who|is|was|has|had|will|would|can|could|should|must|may|might|does|did|do|are|were|near|nearby|here|there|around|please|today|tomorrow|tonight|now|again)$/.test(nn);
      if (!isVerb && !isFunction && !SUBJECT_PRONOUNS.has(nn) && !brokenAfter(w, i)) continue;
      // "meeting the client", "drawing a line": a gerund, not a noun.
      if (/ing$/.test(n.norm) && (DETERMINERS.has(nn) || SUBJECT_PRONOUNS.has(nn))) continue;
    }
    // Walk back over modifiers ("new", "revised", "control", "Malaysian") to find a determiner or a possessive.
    let k = i - 1;
    let ok = false;
    let uncertain = false;
    let start = i;
    while (k >= 0 && i - k <= 6) {
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
        // A real verb ends the noun phrase: "satisfy (the) customer", "we sent (the) quotation", "take (a) message".
        // ("open drain valve": after a real verb, the next verb-like word is a noun modifier, so the guess is safe.)
        // ("the only open question": a verb-like word after a determiner or "only" is an adjective.)
        if (vi.form === "base" && /^(the|a|an|only|this|that|our|your|their|my|one)$/.test(w[k - 1]?.norm ?? "")) {
          start = k;
          k--;
          continue;
        }
        if (UNAMBIGUOUS_VERBS.has(vi.base) || vi.form === "3sg" || vi.form === "past" || /^(take|give|wear|make|get|need|want|find|book|use|buy|bring|leave|open|close|fix|see|repeat|answer|have)$/.test(t.norm)) {
          if (uncertain && k === start - 1 && start === i - 1) uncertain = false;
          break;
        }
        // "control valve", "test report": maybe a noun modifier — keep looking, but never guess.
        uncertain = true;
      }
      start = k;
      k--;
    }
    if (!ok && uncertain) continue;
    if (ok) continue;
    // "Pangyo Station", "Tower B Lobby": a capitalized name needs no article.
    if (/^[A-Z]/.test(n.raw) && i > 0) continue;
    if (start < i && start > 0 && /^[A-Z]/.test(w[start].raw) && !brokenAfter(w, start - 1)) continue;
    // "Quick question about …", "Small update on …": a spoken headline at the start of a turn.
    if ((start === 0 || brokenAfter(w, start - 1)) && start < i && /^(question|idea|point|thought|update|reminder|suggestion|request|comment|note|favor|favour)$/.test(n.norm)) continue;
    // "Good question.", "Great idea!": a short reply that is only a noun phrase stands without an article.
    if ((start === 0 || brokenAfter(w, start - 1)) && (i === w.length - 1 || brokenAfter(w, i)) && start < i) continue;
    // "kind of problem", "type of valve": the bare noun is idiomatic.
    if (w[start - 1]?.norm === "of" && /^(kind|type|sort|form|lack|piece|size|model|brand|make|grade|variety|class|category|style)$/.test(w[start - 2]?.norm ?? "")) continue;
    // "promoted to plant manager", "appointed as project lead": a job title after these takes no article.
    if (/^(to|as)$/.test(w[start - 1]?.norm ?? "") && /^(promoted|appointed|elected|named|made|became|become|becomes)$/.test(w[start - 2]?.norm ?? "")) continue;
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
  // ("the pumps have shipped" is fine in American business English, so "shipped" is not listed.)
  "finalized", "finalised", "underestimated", "overestimated", "damaged", "updated", "revised", "tested", "inspected", "scheduled", "rescheduled",
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

/** Words that are verbs too but after "he/she" are usually an adverb or adjective ("she last saw it", "he still works"). */
const NOT_VERB_AFTER_SUBJECT = /^(last|still|even|better|well|free|clean|clear|close|open|ready|fine|right|wrong|home|back|near|slow|fast|early|late|hard|alone|later|once|first|second|sure|kind|sort|quiet|quite|calm|cool|warm|dry|empty|full|busy|safe|short|long|light|round|down|up|out|over|off|in|on|yet|soon|then|now|today|together)$/;

/** "it look good", "he need it" → third person -s (not after let/make/help or in questions). */
const thirdPersonBase: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(he|she|it)$/.test(w[i].norm)) continue;
    const prev = w[i - 1]?.norm ?? "";
    if (/^(let|make|makes|made|help|helps|see|saw|watch|hear|have|has|had|do|does|did|will|would|can|could|should|may|might|must|to|let's|if|that|which|whether)$/.test(prev)) continue;
    const prev2 = w[i - 2]?.norm ?? "";
    // "Do I just eat it like this?": "it" after a verb is its object, not a subject.
    if (w[i].norm === "it" && i > 0 && verbInfo(prev) && !/^(is|was|does|did|has|think|guess|hope|believe|know|feel|say|said|bet|suppose|hear|heard|sure)$/.test(prev)) continue;
    // "Doesn't he know?", "Won't she come?": an inverted negative question keeps the base form.
    if (prev === "not" && /^(do|does|did|will|would|can|could|should|may|might|must|shall|is|are|was|were|am|have|has|had)$/.test(prev2)) continue;
    // "Is she free?" (an inverted be-question), "he or she" (two people), "I'd rather she stay".
    if (/^(is|was|are|were|am|rather)$/.test(prev) || (/^(or|and)$/.test(prev) && /^(he|she|i|you|we|they)$/.test(prev2))) continue;
    // "I got it. Thank you": the pronoun ends one sentence and the verb starts the next.
    if (brokenAfter(w, i)) continue;
    const v = w[i + 1];
    const info = verbInfo(v.norm);
    if (!info || info.form !== "base" || v.norm !== info.base || isSameFormParticiple(info.base) || /^(be|have|do)$/.test(info.base)) continue;
    // After he/she the next word is the verb unless it is an adverb or adjective that is also a verb ("she last saw").
    const anyVerb = w[i].norm !== "it" && !NOT_VERB_AFTER_SUBJECT.test(v.norm);
    if (!anyVerb && !UNAMBIGUOUS_VERBS.has(info.base) && !/^(look|seem|need|want|work|take|make|mean|depend|cost|sound|feel|happen|matter|go|come|get|run|say|know|think|like|take|give)$/.test(info.base)) continue;
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
      (v === "make" && /^(sense|a|no|any|it|me|us|everything|things|more)$/.test(after)) ||
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

/** "since a few hours" → "for a few hours": since takes a starting point, for a length of time. */
const sinceDuration: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (w[i].norm !== "since") continue;
    let j = i + 1;
    if (w[j].norm === "a" && /^(few|couple)$/.test(w[j + 1]?.norm ?? "")) j += 2;
    else if (/^(two|three|four|five|six|seven|eight|nine|ten|several|many|\d+)$/.test(w[j].norm)) j++;
    else continue;
    if (w[j]?.norm === "of") j++;
    if (!/^(seconds|minutes|hours|days|weeks|months|years|decades)$/.test(w[j]?.norm ?? "")) continue;
    // "since six months is a long time": "since" means "because" when a verb follows the amount.
    if (/^(is|was|are|were|will|would|seems|sounds|feels)$/.test(w[j + 1]?.norm ?? "")) continue;
    out.push({
      rule: "since-duration", from: i, to: i + 1, replacement: "for", category: "preposition", severity: "major", skill: "present-perfect",
      messageKo: `기간(얼마 동안)은 'for'를 씁니다: 'for ${w.slice(i + 1, j + 1).map((x) => x.raw).join(" ")}'. 'since'는 시작 시점과 함께 씁니다(since Monday, since 2020).`,
    });
  }
  return out;
};

/** "much numbers" → "many numbers": much is for uncountable nouns. */
const PLURAL_COUNTABLES = /^(numbers|problems|questions|issues|people|things|options|samples|changes|days|hours|meetings|emails|documents|details|mistakes|errors|ideas|points|units|tests|parts|items|drawings|reports|calls|times|cases|steps|tasks|customers|visitors|engineers)$/;
const muchPlural: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm !== "much" || brokenAfter(w, i)) continue;
    let j = i + 1;
    if (/^(more|too)$/.test(w[j].norm)) continue; // "much more people" is a comparison
    while (j < w.length && j <= i + 2 && /^(new|small|big|different|other|technical|important)$/.test(w[j].norm)) j++;
    if (!PLURAL_COUNTABLES.test(w[j]?.norm ?? "")) continue;
    out.push({
      rule: "much-plural", from: i, to: i + 1, replacement: "many", category: "countability", severity: "major", skill: "countability",
      messageKo: `셀 수 있는 복수 명사('${w[j].raw}')에는 'much'가 아니라 'many'(또는 a lot of)를 씁니다.`,
    });
  }
  return out;
};

/** "I'd suggest to stay" → "I'd suggest staying": suggest/recommend take -ing or a that-clause, not to + verb. */
const suggestTo: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (!/^(suggest|suggested|suggests|recommend|recommended|recommends|avoid|avoided|enjoy|enjoyed|finish|finished|mind|consider|considered|keep|kept)$/.test(w[i].norm)) continue;
    if (w[i + 1].norm !== "to" || brokenAfter(w, i)) continue;
    const v = w[i + 2];
    if (!isBaseVerb(v.norm) || /^(me|you|him|her|us|them|everyone|the|a|an|our|your)$/.test(v.norm)) continue;
    const ing = ingOf(v.norm);
    const base = verbInfo(w[i].norm)?.base ?? w[i].norm;
    out.push({
      rule: "verb-gerund-to", from: i + 1, to: i + 3, replacement: ing, category: "verb-form", severity: "major", skill: base === "suggest" || base === "recommend" ? "opinion" : "prep-gerund",
      messageKo: base === "suggest" || base === "recommend"
        ? `'${base}' 뒤에는 to부정사가 아니라 동사ing나 that절이 옵니다: '${w[i].raw} ${ing}' 또는 '${w[i].raw} (that) we ${v.norm}'.`
        : `'${base}' 뒤에는 동사ing가 옵니다: '${w[i].raw} ${ing}'.`,
    });
  }
  return out;
};

/** "Let me quick recap" → "quickly recap": an adjective cannot describe a verb. */
const adjectiveBeforeVerb: Rule = (w) => {
  const out: RuleFinding[] = [];
  const ADV: Record<string, string> = { quick: "quickly", careful: "carefully", clear: "clearly", brief: "briefly", proper: "properly", slow: "slowly", easy: "easily", final: "finally", direct: "directly", immediate: "immediately", simple: "simply" };
  for (let i = 1; i < w.length - 1; i++) {
    const a = w[i].norm;
    if (!ADV[a]) continue;
    const prev = w[i - 1].norm;
    if (!/^(me|us|i|we|you|they|please|to|will|would|can|could|should|must|let's)$/.test(prev)) continue;
    if (prev === "me" && w[i - 2]?.norm !== "let") continue;
    if (prev === "us" && w[i - 2]?.norm !== "let") continue;
    const v = w[i + 1];
    const info = verbInfo(v.norm);
    // "a quick recap" has an article; "Let me quick recap" / "I'll quick check" use the word as a verb.
    // After "let me/us" the next word must be a verb, even one the lexicon does not know ("recap").
    const verbSlot = (prev === "me" || prev === "us") && !DETERMINERS.has(v.norm) && /^[a-z]{3,}$/.test(v.norm) && !/(s|ly)$/.test(v.norm);
    if (!(info ? info.form === "base" : verbSlot) || COUNTABLE_NOUNS.has(v.norm)) continue;
    out.push({
      rule: "adjective-before-verb", from: i, to: i + 1, replacement: ADV[a], category: "word-choice", severity: "major", skill: "word-order",
      messageKo: `동사 '${v.raw}'를 꾸밀 때는 부사를 씁니다: '${ADV[a]} ${v.raw}'. (명사로 쓰려면 'do a ${a} ${v.raw}')`,
    });
  }
  return out;
};

/** Prepositions of time: on Monday, in May, at 3 pm. */
const WEEKDAY = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;
const MONTH = /^(january|february|march|april|june|july|august|september|october|november|december)$/; // "may" is also a modal
const timePreposition: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const p = w[i].norm;
    if (!/^(in|on|at)$/.test(p) || brokenAfter(w, i)) continue;
    let j = i + 1;
    if (/^(next|last|this)$/.test(w[j].norm)) continue; // "on next Monday" is handled elsewhere; "next Monday" needs none
    const n = w[j].norm;
    let fix = "";
    const dated = /^\d{1,2}(st|nd|rd|th)?$/.test(w[j + 1]?.norm ?? ""); // "on March 15"
    if ((WEEKDAY.test(n) || (MONTH.test(n) && dated)) && p !== "on") fix = "on";
    else if (((MONTH.test(n) && !dated) || (/^(19|20)\d\d$/.test(n) && p === "on")) && p !== "in") fix = "in";
    else if (/^\d{1,2}(:\d{2})?$/.test(n) && /^(am|pm|a\.m|p\.m|o'clock|oclock)$/.test(w[j + 1]?.norm ?? "") && p !== "at") fix = "at";
    if (!fix) continue;
    out.push({
      rule: "time-preposition", from: i, to: i + 1, replacement: fix, category: "preposition", severity: "major", skill: "verb-prep",
      messageKo: `시간 전치사: 요일·날짜는 on, 월·연도는 in, 시각은 at입니다: '${fix} ${w[j].raw}'.`,
    });
  }
  return out;
};

/** Fixed phrases that need "the": "at the latest", "at the moment", "on the other hand", "in the meantime". */
/** Phrases that need "the" ("at the latest"), keyed by the words without it. */
const IDIOM_THE = new Map<string, string>([
  ["at latest", "at the latest"], ["at earliest", "at the earliest"], ["at moment", "at the moment"],
  ["in meantime", "in the meantime"], ["on other hand", "on the other hand"], ["at same time", "at the same time"],
  ["for first time", "for the first time"], ["at end", "at the end"], ["in middle of", "in the middle of"], ["at end of", "at the end of"], ["by end of", "by the end of"],
  // "brings me to end of my presentation", "for rest of the day", "from beginning of the list".
  ...["to", "until", "till", "near", "toward", "towards", "from", "before", "after", "since", "for", "at", "by", "in"].flatMap((p) =>
    ["end", "beginning", "middle", "start", "rest", "bottom"]
      .filter((n) => !(/^(at|by)$/.test(p) && n === "end") && !(p === "in" && n === "middle"))
      .map((n): [string, string] => [`${p} ${n} of`, `${p} the ${n} of`]),
  ),
]);
const IDIOM_LENGTHS = [...new Set([...IDIOM_THE.keys()].map((k) => k.split(" ").length))];
const idiomArticle: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    for (const n of IDIOM_LENGTHS) {
      if (i + n > w.length) continue;
      const phrase = w.slice(i, i + n).map((t) => t.norm).join(" ");
      const fix = IDIOM_THE.get(phrase);
      if (!fix) continue;
      // "at end of …" is matched by its own longer entry; "at end" alone needs a clause end after it.
      if (phrase === "at end" && !(i + 2 >= w.length || brokenAfter(w, i + 1))) continue;
      // "by end of day" (EOD) is common business English.
      if (/end of$/.test(phrase) && /^(day|business)$/.test(w[i + n]?.norm ?? "")) continue;
      out.push({
        rule: "idiom-the", from: i + 1, to: i + 1, replacement: "the", category: "article", severity: "minor", skill: "articles",
        messageKo: `'${fix}'는 the가 들어가는 굳어진 표현입니다.`,
      });
    }
  }
  return out;
};

/** "It has was", "we have are": a perfect auxiliary never takes a finite be (also catches broken corrections). */
const perfectFiniteBe: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(has|have|had)$/.test(w[i].norm) || !/^(was|were|is|are|am)$/.test(w[i + 1].norm) || w[i + 1].expanded) continue;
    out.push({
      rule: "perfect-finite-be", from: i + 1, to: i + 2, replacement: "been", category: "verb-form", severity: "major", skill: "present-perfect",
      messageKo: `have/has 뒤에는 be동사의 과거분사 'been'이 옵니다: '${w[i].raw} been'.`,
    });
  }
  return out;
};

/** "Sari said me" → "Sari told me": say takes no person object (say to me / tell me). */
const saidMe: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const info = verbInfo(w[i].norm);
    if (!info || info.base !== "say" || !/^(me|us|him|them)$/.test(w[i + 1].norm) || brokenAfter(w, i)) continue;
    const told = { base: "tell", "3sg": "tells", past: "told", pp: "told", ing: "telling" }[info.form];
    out.push({
      rule: "said-me", from: i, to: i + 1, replacement: told, category: "verb-form", severity: "major", skill: "reporting",
      messageKo: `'say'는 사람을 바로 목적어로 쓰지 않습니다: '${told} ${w[i + 1].raw}' 또는 '${w[i].raw} to ${w[i + 1].raw}'.`,
    });
  }
  return out;
};

/* ───────────── Korean-speaker patterns found by the blind test ───────────── */

const NOT_A_PERSON = (x: string) => !/^(i|we|you|they|he|she|who)$/.test(x) && !PERSON_NOUNS.has(x);

/** "the commissioning is delaying a little" → "is delayed": things undergo a delay. */
const progressiveNeedsPassive: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 1; i < w.length - 1; i++) {
    if (!/^(is|are|was|were)$/.test(w[i].norm) || !NOT_A_PERSON(w[i - 1].norm) || SUBJECT_PRONOUNS.has(w[i - 1].norm) && w[i - 1].norm !== "it") continue;
    const v = w[i + 1];
    const info = verbInfo(v.norm);
    if (!info || info.form !== "ing" || !PASSIVE_PERFECT.has(participleOf(info.base))) continue;
    const next = w[i + 2]?.norm ?? "";
    // "is delaying a little / a bit / a few days" is how long, not an object ("is delaying a few shipments" is one).
    const n3 = w[i + 3]?.norm ?? "";
    const howLong =
      next === "a" &&
      ((/^(little|bit|lot)$/.test(n3) && w[i + 4]?.norm !== "of") ||
        /^(week|day|month|while)$/.test(n3) ||
        (/^(few|couple)$/.test(n3) && /^(of )?(days|weeks|months|hours|minutes)$/.test([w[i + 4]?.norm, w[i + 5]?.norm].filter(Boolean).join(" ").replace(/^(days|weeks|months|hours|minutes).*/, "$1"))));
    if (!howLong && (DETERMINERS.has(next) || /^(it|them|us|me|him|her|everything|something)$/.test(next))) continue; // "the vendor is delaying the shipment"
    const pp = participleOf(info.base);
    out.push({
      rule: "progressive-needs-passive", from: i + 1, to: i + 2, replacement: pp, category: "verb-form", severity: "major", skill: "passive",
      messageKo: `'${w[i - 1].raw}'는 스스로 ${info.base}하는 것이 아니라 그렇게 '되는' 것이라 수동태입니다: '${w[i].raw} ${pp}' (진행 중이면 '${w[i].raw} being ${pp}').`,
    });
  }
  return out;
};

/** "one more drying tests" → "test": one/another take a singular noun. */
const oneMorePlural: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(one|another|single)$/.test(w[i].norm)) continue;
    let j = i + 1;
    if (w[j]?.norm === "more") j++;
    if (/^(of|or|and|by|\d+|few|couple)$/.test(w[j]?.norm ?? "") || (w[j] && wordKind(w[j].norm))) continue; // "one of the tests", "another forty minutes"
    let n = w[j];
    if (n && !PLURAL_NOUN_SINGULAR(n.norm) && w[j + 1] && PLURAL_NOUN_SINGULAR(w[j + 1].norm) && !DETERMINERS.has(n.norm)) n = w[++j]; // one modifier
    const single = n ? PLURAL_NOUN_SINGULAR(n.norm) : null;
    if (!n || !single || brokenAfter(w, j - 1)) continue;
    out.push({
      rule: "one-plural", from: j, to: j + 1, replacement: single, category: "countability", severity: "minor", skill: "countability",
      messageKo: `'${w[i].raw}' 뒤에는 단수 명사가 옵니다: '${single}'.`,
    });
  }
  return out;
};

/** Known plural nouns → singular ("tests" → "test"), else null. */
let SINGULAR_OF: Map<string, string> | null = null;
function PLURAL_NOUN_SINGULAR(x: string): string | null {
  SINGULAR_OF ??= new Map(Object.entries(PLURAL_OF).map(([sg, pl]) => [pl, sg]));
  const irregular = SINGULAR_OF.get(x);
  if (irregular) return irregular;
  if (/ies$/.test(x) && COUNTABLE_NOUNS.has(x.replace(/ies$/, "y"))) return x.replace(/ies$/, "y");
  if (/s$/.test(x) && COUNTABLE_NOUNS.has(x.replace(/s$/, ""))) return x.replace(/s$/, "");
  return null;
}

/** "You don't must open it", "Does everybody can hear me?": do never goes with a modal. */
const doModal: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (!/^(do|does|did)$/.test(w[i].norm)) continue;
    let j = i + 1;
    if (w[j].norm === "not") j++;
    else if (SUBJECT_PRONOUNS.has(w[j].norm) || /^(anyone|anybody|everyone|everybody|someone|somebody)$/.test(w[j].norm)) j++;
    else continue;
    if (!/^(can|could|must|should|will|would|may|might|shall)$/.test(w[j]?.norm ?? "")) continue;
    const neg = w[i + 1].norm === "not";
    out.push({
      rule: "do-modal", from: i, to: j + 1, replacement: neg ? `${w[j].norm} not` : `${w[j].norm} ${w.slice(i + 1, j).map((x) => x.norm).join(" ")}`, category: "verb-form", severity: "major", skill: "modal-necessity",
      messageKo: neg
        ? `조동사(${w[j].raw})는 do와 함께 쓰지 않습니다. 부정은 '${w[j].norm} not' (예: must not, can't)입니다.`
        : `조동사(${w[j].raw}) 의문문은 do 없이 조동사를 앞으로: '${w[j].norm[0].toUpperCase()}${w[j].norm.slice(1)} ${w.slice(i + 1, j).map((x) => x.norm).join(" ")} …?'.`,
    });
  }
  return out;
};

/** "Do anyone have …?", "Don't everyone know?" → does: indefinite pronouns are singular. */
const doIndefinite: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm !== "do" || w[i].expanded && w[i + 1]?.norm !== "not") continue;
    let j = i + 1;
    if (w[j].norm === "not") j++;
    if (!/^(anyone|anybody|everyone|everybody|someone|somebody|nobody|anything|everything|something)$/.test(w[j]?.norm ?? "")) continue;
    // Only a question or negative opener: "Do anyone have …?" (not "what do anyone…" which is rare).
    if (i > 0 && !brokenAfter(w, i - 1) && !/^(so|and|but|then|well|okay|ok|sari|budi|linh|priya|daniel)$/.test(w[i - 1].norm)) continue;
    out.push({
      rule: "agreement-indefinite", from: i, to: i + 1, replacement: "does", category: "agreement", severity: "major", skill: "agreement",
      messageKo: `'${w[j].raw}'는 단수로 취급해서 'does'를 씁니다: 'Does ${w[j].raw} …?'.`,
    });
  }
  return out;
};

/** "Because X, so Y" / "Although X, but Y": English uses one connector, not two. */
const doubleConjunction: Rule = (w) => {
  const out: RuleFinding[] = [];
  const first = w.findIndex((t) => !/^(sorry|well|oh|yes|no|ok|okay|actually|so|and)$/.test(t.norm));
  if (first < 0) return out;
  const c = w[first].norm;
  const pair = /^(because|since)$/.test(c) && w[first + 1]?.norm !== "of" ? "so" : /^(although|though)$/.test(c) || (c === "even" && w[first + 1]?.norm === "though") ? "but" : null;
  if (!pair) return out;
  // Only right after the first clause: "Because X, so Y". In "Because X, Y, so Z" the so joins Y and Z.
  const firstBreak = w.findIndex((t, k) => k > first && brokenAfter(w, k));
  for (let i = firstBreak + 1; i === firstBreak + 1 && firstBreak > 0 && i < w.length; i++) {
    if (w[i].norm !== pair) continue;
    out.push({
      rule: "double-conjunction", from: i, to: i + 1, replacement: "", category: "sentence-structure", severity: "major", skill: "cause-effect",
      messageKo: `'${w[first].raw} …'로 시작했으면 뒤에 '${pair}'를 다시 쓰지 않습니다. 둘 중 하나만 씁니다.`,
    });
    break;
  }
  return out;
};

/** "too much high" → "too high" (or "much too high"). */
const tooMuchAdjective: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (w[i].norm !== "too" || w[i + 1].norm !== "much") continue;
    if (!/^(high|low|big|small|hot|cold|expensive|cheap|early|late|wet|dry|long|short|busy|difficult|hard|heavy|fast|slow|strong|weak|spicy|salty|sweet|loud|noisy|far|close|complicated|risky|tired|tight|large|tough|crowded|full|old|young)$/.test(w[i + 2].norm)) continue;
    out.push({
      rule: "too-much-adjective", from: i + 1, to: i + 2, replacement: "", category: "word-choice", severity: "major", skill: "too-adj",
      messageKo: `형용사 앞에는 'too much'가 아니라 'too'(또는 much too)를 씁니다: 'too ${w[i + 2].raw}'.`,
    });
  }
  return out;
};

/** "too wet for the dryer to deal with it" → no "it": the subject is already the object. */
const tooToObject: Rule = (w) => {
  const out: RuleFinding[] = [];
  const t = w.findIndex((x, k) => x.norm === "too" && k < w.length - 1);
  if (t < 0) return out;
  for (let k = t + 2; k < Math.min(w.length - 2, t + 9); k++) {
    // "to deal with it": a verb the lexicon does not know still counts when a preposition and it/them end the clause.
    const verbPrepIt = /^[a-z]+$/.test(w[k + 1]?.norm ?? "") && !DETERMINERS.has(w[k + 1].norm) && PREPOSITIONS.has(w[k + 2]?.norm ?? "") && /^(it|them)$/.test(w[k + 3]?.norm ?? "");
    if (w[k].norm !== "to" || (!isBaseVerb(w[k + 1].norm) && !verbPrepIt)) continue;
    let p = k + 2;
    if (PREPOSITIONS.has(w[p]?.norm ?? "")) p++;
    if (!/^(it|them)$/.test(w[p]?.norm ?? "") || (p < w.length - 1 && !brokenAfter(w, p))) continue;
    out.push({
      rule: "too-to-object", from: p, to: p + 1, replacement: "", category: "sentence-structure", severity: "major", skill: "too-adj",
      messageKo: `'too + 형용사 + to 동사' 구문에서는 문장의 주어가 곧 목적어라 '${w[p].raw}'를 다시 쓰지 않습니다.`,
    });
    break;
  }
  return out;
};

/** "Is my voice come through okay?", "Is this dish contain pork?" → do-question or -ing. */
const beQuestionBaseVerb: Rule = (w) => {
  const out: RuleFinding[] = [];
  if (!w.length || !/^(is|are|was|were)$/.test(w[0].norm) || w[0].expanded) return out;
  let j = 1;
  const nounish = (x?: Token) => !!x && !verbInfo(x.norm) && !SUBJECT_PRONOUNS.has(x.norm) && !DETERMINERS.has(x.norm) && !/^(all|both|you|me|us|them|there|here|not|so|very|really)$/.test(x.norm);
  if (SUBJECT_PRONOUNS.has(w[j]?.norm ?? "") || /^(everyone|everybody|anyone|anybody|someone|somebody|everything)$/.test(w[j]?.norm ?? "")) j++;
  else if (/^(the|this|that|my|your|our|their|his|her|its)$/.test(w[j]?.norm ?? "") && nounish(w[j + 1])) {
    j += 2; // "this dish contain", "my voice come"
    if (nounish(w[j]) && verbInfo(w[j + 1]?.norm ?? "")?.form === "base") j++; // "the new pump work"
  } else return out;
  const v = w[j];
  const info = v ? verbInfo(v.norm) : null;
  if (!v || !info || info.form !== "base" || v.norm !== info.base || BE_ADJECTIVE_OK.has(v.norm) || isSameFormParticiple(v.norm)) return out;
  if (!UNAMBIGUOUS_VERBS.has(v.norm) && !/^(contain|come|work|need|want|know|have|like|mean|include|take|cost|go|sound|seem|look|agree|think|hear|see|run|start|finish|arrive|leave)$/.test(v.norm)) return out;
  const fix = { is: "Does", are: "Do", was: "Did", were: "Did" }[w[0].norm as "is"];
  out.push({
    rule: "be-question-base-verb", from: 0, to: 1, replacement: fix, category: "verb-form", severity: "major", skill: "question-form",
    messageKo: `일반동사(${v.raw}) 의문문은 be동사가 아니라 do/does로 만듭니다: '${fix} … ${v.raw} …?' (진행형이면 '${w[0].raw} … ${ingOf(v.norm)}').`,
  });
  return out;
};

/** "speak little bit louder" → "a little bit". */
const littleBit: Rule = (w) =>
  w.flatMap((t, i) =>
    t.norm === "little" && w[i + 1]?.norm === "bit" && w[i - 1]?.norm !== "a"
      ? [{ rule: "little-bit-a", from: i, to: i, replacement: "a", category: "article" as const, severity: "minor" as const, skill: "degree", messageKo: "'조금'은 'a little (bit)'입니다. a를 빼면 '거의 없는'이라는 뜻이 됩니다." }]
      : [],
  );

/** "after the meeting finish" → "finishes": a singular noun subject in a time/if clause. */
const nounClauseThirdPerson: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 3; i++) {
    if (!/^(after|when|before|until|once|if|unless|because|since|while)$/.test(w[i].norm)) continue;
    if (!/^(the|this|that|our|your|their|my|his|her)$/.test(w[i + 1].norm)) continue;
    const n = w[i + 2];
    if (/s$/.test(n.norm) || /^(team|staff|family|crew|police|management|data|people|equipment)$/.test(n.norm) || verbInfo(n.norm)?.form === "base" && !COUNTABLE_NOUNS.has(n.norm)) continue;
    const v = w[i + 3];
    const info = verbInfo(v.norm);
    if (!info || info.form !== "base" || v.norm !== info.base || isSameFormParticiple(info.base) || /^(be|have|do)$/.test(info.base)) continue;
    if (!UNAMBIGUOUS_VERBS.has(v.norm) && !/^(finish|start|arrive|end|come|go|work|run|stop|need|look|seem|break|leak|fail|change|happen|open|close|begin)$/.test(v.norm)) continue;
    // "because the piping work is finished": the word is part of a compound noun when a verb follows it.
    const after = w[i + 4]?.norm ?? "";
    if (/ing$/.test(n.norm) || BE_FORMS.has(after) || /^(has|have|had|will|would|can|could|should|must|may|might|does|did)$/.test(after)) continue;
    const fix = thirdPersonOf(info.base);
    out.push({
      rule: "third-person-s", from: i + 3, to: i + 4, replacement: fix, category: "agreement", severity: "major", skill: "agreement",
      messageKo: `주어 '${w[i + 1].raw} ${n.raw}'는 3인칭 단수라서 동사에 -s를 붙입니다: '${fix}'.`,
    });
  }
  return out;
};

/** "by the email" → "by email": means of transport and communication take no article. */
const byTheMeans: Rule = (w) =>
  w.flatMap((t, i) =>
    t.norm === "by" && w[i + 1]?.norm === "the" && /^(email|e-mail|phone|train|car|bus|plane|taxi|post|mail|courier|fax|subway|ktx|air|sea|text)$/.test(w[i + 2]?.norm ?? "") && (i + 3 >= w.length || brokenAfter(w, i + 2) || !/^[a-z]/.test(w[i + 3].norm) || PREPOSITIONS.has(w[i + 3].norm) || /^(and|or|so|but|tomorrow|today|instead)$/.test(w[i + 3].norm))
      ? [{ rule: "by-the-means", from: i + 1, to: i + 2, replacement: "", category: "article" as const, severity: "minor" as const, skill: "articles", messageKo: `'by + 수단'에는 관사를 쓰지 않습니다: 'by ${w[i + 2].raw}'.` }]
      : [],
  );

/** "All the tests was carried out", "Both of them is good" → plural verb. */
/** Plural nouns the countable list leaves out (it also drives article checks, where these would be noisy). */
const SUBJECT_PLURALS = /^(suppliers|vendors|competitors|questions|answers|emails|calls|decisions|parents|grandparents|brothers|sisters|cousins|neighbors|neighbours|coworkers|bosses|teachers|guys|boys|girls|results|tests|numbers|figures|plans|shipments|orders|products|parts|costs|prices|levels|values|readings|samples|conditions|changes|issues|problems|items|files|documents|emails|messages|meetings|guests|visitors|members|people|children|kids|friends|students|workers|employees|prices|sales|rooms|tickets|reports|slides|drawings|specs|specifications|suppliers|vendors|clients|customers|engineers|operators|colleagues|managers|pumps|valves|dryers|tanks|machines|units|lines|trains|flights|buses|cars)$/;
const isPluralNoun = (x: string) => !!PLURAL_NOUN_SINGULAR(x) || SUBJECT_PLURALS.test(x);
const PLURAL_SUBJECT_VERB = /^(show|need|want|work|look|seem|take|make|give|offer|charge|pay|ask|expect|goe|come|say|know|think|use|require|include|depend|cost|run|help|mean|happen|matter|sound|feel|cause|affect|contain|produce|indicate|suggest|remain|stay|keep|get|live|like|love|play|visit|call|speak|eat|drink|enjoy|travel)s$/;
const pluralSubjectAgreement: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    let v = -1;
    if (w[i].norm === "both" && w[i + 1]?.norm === "of" && /^(them|us|you|these|those)$/.test(w[i + 2]?.norm ?? "")) v = i + 3;
    else if (/^(the|these|those|our|their|all|both|my|your)$/.test(w[i].norm) && i + 1 < w.length) {
      let n = i + 1;
      if (w[n].norm === "the" && w[i].norm === "all") n++;
      if (w[n] && !isPluralNoun(w[n].norm) && w[n + 1] && isPluralNoun(w[n + 1].norm)) n++; // "the pressure tests"
      if (w[n] && isPluralNoun(w[n].norm) && w[n].norm !== "news") v = n + 1;
    }
    if (v < 0 || !w[v] || brokenAfter(w, v - 1)) continue;
    // "one of the boilers is", "the delivery time for these pumps is": the noun after a preposition is not the subject.
    if (w[i - 1] && PREPOSITIONS.has(w[i - 1].norm)) continue;
    // "The results shows a clear trend": a common verb with -s, followed by what it does (an object or adverb).
    const lexical = PLURAL_SUBJECT_VERB.exec(w[v].norm);
    if (lexical && w[v + 1] && !brokenAfter(w, v) && (DETERMINERS.has(w[v + 1].norm) || /^(that|to|on|for|like|good|great|fine|well|very|really|so|more|less|much|about|it|them|us|me|him|her|everything|something|nothing|in|at|with|near|here|there|together)$/.test(w[v + 1].norm))) {
      out.push({
        rule: "agreement-plural-noun", from: v, to: v + 1, replacement: lexical[1] === "goe" ? "go" : lexical[1] === "doe" ? "do" : lexical[1] === "say" ? "say" : lexical[1],
        category: "agreement", severity: "major", skill: "agreement",
        messageKo: `주어가 복수라서 동사에 -s를 붙이지 않습니다: '${lexical[1] === "goe" ? "go" : lexical[1]}'.`,
      });
      continue;
    }
    // Unpunctuated speech: "I just saw your missed calls is everything all right" — "is everything …" is a new question.
    if (/^(is|was|does|has)$/.test(w[v].norm) && /^(everything|everyone|anything|anyone|there|it|this|that|he|she)$/.test(w[v + 1]?.norm ?? "")) continue;
    const fix = { was: "were", is: "are", has: "have", does: "do" }[w[v].norm as "was"];
    if (!fix || w[v].expanded && w[v].norm === "is" && /'s$/i.test(w[v].raw)) continue;
    out.push({
      rule: "agreement-plural-noun", from: v, to: v + 1, replacement: fix, category: "agreement", severity: "major", skill: "agreement",
      messageKo: `주어가 복수라서 '${w[v].raw}' 대신 '${fix}'를 씁니다.`,
    });
  }
  return out;
};

/** "they won't ready" → "won't be ready": an adjective after a modal needs be. */
const modalAdjective: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(will|would|can|could|should|might|may|must)$/.test(w[i].norm)) continue;
    let j = i + 1;
    if (w[j].norm === "not") j++;
    // "It must very expensive": an intensifier before the adjective.
    if (/^(very|really|so|too|quite|pretty|extremely)$/.test(w[j]?.norm ?? "") && !brokenAfter(w, j)) j++;
    // A question puts the subject after the modal: "Will we still able to …?"
    if (SUBJECT_PRONOUNS.has(w[j]?.norm ?? "") && (i === 0 || brokenAfter(w, i - 1) || /^(then|so|and|but)$/.test(w[i - 1].norm))) {
      j++;
      while (j < w.length && /^(still|also|really|even)$/.test(w[j].norm)) j++;
    }
    const a = w[j];
    if (
      !a ||
      !/^(ready|late|available|sure|able|busy|happy|sorry|careful|possible|necessary|enough|free|done|okay|ok|fine|different|similar|difficult|expensive|cheaper|higher|bigger|smaller|larger|faster|slower|wetter|drier|hotter|colder|longer|shorter|worse|easier|harder|safer|riskier|ready|useful|helpful|important|impossible|unlikely|likely|tired|exhausted|hungry|thirsty|sad|worried|excited|interested|surprised|bored|confused|nervous|glad|upset|angry|sick|ill|here|full|early|jealous|proud|afraid|scared|lucky|right)$/.test(a.norm)
    )
      continue;
    // "could longer" never happens, but "no longer"/"any longer" after a modal is an adverb: "can no longer run".
    if (/^(longer)$/.test(a.norm) && /^(no|any)$/.test(w[j - 1]?.norm ?? "")) continue;
    if (a.norm === "free" && w[j + 1]?.norm === "up") continue;
    if (a.norm === "done" && j === i + 1) continue; // "it can done"? rare; "will done" is wrong but leave to Claude
    out.push({
      rule: "modal-adjective", from: j, to: j, replacement: "be", category: "be-verb", severity: "major", skill: "be-adj",
      messageKo: `형용사 '${a.raw}'는 동사가 아니라서 조동사 뒤에 be가 필요합니다: '${w.slice(i, j).map((x) => x.raw).join(" ")} be ${a.raw}'.`,
    });
  }
  return out;
};

/** "a great weekends" → "weekend": a/an with a singular noun. */
/** "a moments", "a minutes": time words after a/an. */
const TIME_PLURAL: Record<string, string> = { moments: "moment", seconds: "second", minutes: "minute", hours: "hour", days: "day", weeks: "week", months: "month", years: "year" };
const articlePlural: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(a|an)$/.test(w[i].norm)) continue;
    if (/^(lot|few|couple|number|series|pair|bit|little|half|dozen|hundred|thousand)$/.test(w[i + 1].norm)) continue;
    let j = i + 1;
    if (!PLURAL_NOUN_SINGULAR(w[j].norm) && w[j + 1] && PLURAL_NOUN_SINGULAR(w[j + 1].norm) && !verbInfo(w[j].norm)) j++;
    const single = PLURAL_NOUN_SINGULAR(w[j]?.norm ?? "") ?? TIME_PLURAL[w[j]?.norm ?? ""] ?? null;
    if (!single || (w[j + 1] && !brokenAfter(w, j) && !PREPOSITIONS.has(w[j + 1].norm) && !/^(and|or|but|so|too|today|tomorrow|now)$/.test(w[j + 1].norm))) continue;
    out.push({
      rule: "article-plural", from: j, to: j + 1, replacement: single, category: "countability", severity: "minor", skill: "articles",
      messageKo: `'${w[i].raw}'는 하나를 가리키므로 단수 명사가 옵니다: '${w[i].raw} … ${single}'.`,
    });
  }
  return out;
};

/** "Thank you for send a driver" → "sending": after thank/sorry + for, a verb takes -ing. */
const forBaseVerb: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (w[i].norm !== "for") continue;
    const before = w.slice(Math.max(0, i - 3), i).map((x) => x.norm);
    if (!before.some((x) => /^(thank|thanks|sorry|apologize|apologise|apologies|excuse|forgive|blame|grateful|thankful)$/.test(x))) continue;
    const v = w[i + 1];
    const info = verbInfo(v.norm);
    if (!info || info.form !== "base" || v.norm !== info.base || COUNTABLE_NOUNS.has(v.norm)) continue;
    const objectFollows = DETERMINERS.has(w[i + 2]?.norm ?? "") || /^(me|us|him|her|them|it|you|everything)$/.test(w[i + 2]?.norm ?? "");
    if (!objectFollows && !UNAMBIGUOUS_VERBS.has(v.norm)) continue; // "thanks for help" may be the noun
    const fix = ingOf(v.norm);
    out.push({
      rule: "preposition-base-verb", from: i + 1, to: i + 2, replacement: fix, category: "verb-form", severity: "major", skill: "thanks-looking-forward",
      messageKo: `'for'는 전치사라서 뒤에 동사ing가 옵니다: 'for ${fix}'.`,
    });
  }
  return out;
};

/** "How were you doing since then?" → present perfect with since + a starting point. */
const sinceWithPast: Rule = (w) => {
  const out: RuleFinding[] = [];
  const s = w.findIndex((t, k) => t.norm === "since" && /^(then|last|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|\d{4}|we|i|you|the|this)$/.test(w[k + 1]?.norm ?? ""));
  if (s < 0) return out;
  if (/^(we|i|you|the|this)$/.test(w[s + 1].norm) && !/^(then|last)$/.test(w[s + 1].norm)) {
    // "since we met" is temporal only with a past verb after it; "since the bus was late" is a reason. Keep to clear cases.
    if (!(w[s + 2] && verbInfo(w[s + 2].norm)?.form === "past" && /^(met|started|joined|arrived|moved|came|left|began|graduated)$/.test(w[s + 2].norm))) return out;
  }
  const before = w.slice(0, s);
  if (before.some((t) => /^(have|has|had|been)$/.test(t.norm))) return out;
  const pv = before.findIndex((t) => /^(was|were|did)$/.test(t.norm) || (verbInfo(t.norm)?.form === "past" && !isSameFormParticiple(verbInfo(t.norm)!.base)));
  if (pv < 0) return out;
  out.push({
    rule: "since-past", from: pv, to: pv + 1, replacement: w[pv].norm === "was" ? "has been" : w[pv].norm === "were" ? "have been" : w[pv].norm === "did" ? "have" : `have ${participleOf(verbInfo(w[pv].norm)!.base)}`,
    category: "tense", severity: "major", skill: "present-perfect",
    messageKo: "'since + 시점'(그때부터 지금까지)은 현재완료(have/has + 과거분사)와 씁니다.",
  });
  return out;
};

/** Question word order: "How your wife is doing?", "Where the station is?", "You have ever tasted …?" */
const questionWordOrder: Rule = (w) => {
  const out: RuleFinding[] = [];
  if (!w.length || !w[w.length - 1].question) return out;
  let i = 0;
  while (i < w.length && /^(so|and|but|oh|well|sorry|excuse|me|hi|hello|congratulations|great|okay|ok)$/.test(w[i].norm)) i++;
  const q = w[i]?.norm ?? "";
  if (/^(how|what|where|when|why|which|whose)$/.test(q)) {
    let j = i + 1;
    if (q === "how" && /^(long|much|many|often|far|old|soon)$/.test(w[j]?.norm ?? "")) j++;
    const n = w[j]?.norm ?? "";
    // wh-word + subject (no auxiliary in between) = statement order; "When you say 'soon', do you mean …?" is a clause + question.
    if (!(SUBJECT_PRONOUNS.has(n) || /^(the|your|my|our|his|her|their|this|that)$/.test(n)) || n === "it" && q === "what") return out;
    if (w.slice(j, w.length - 1).some((_, k) => brokenAfter(w, j + k))) return out;
    // "So what you're saying is that …?": the wh-clause is the subject of a later "is".
    if (w.some((t, k) => k > j + 1 && /^(is|was)$/.test(t.norm) && /^(that|a|an|the|not|to|very|really|we|you|it)$/.test(w[k + 1]?.norm ?? ""))) return out;
    if (q === "what" && /^(the)$/.test(n) && /^(heck|hell)$/.test(w[j + 1]?.norm ?? "")) return out;
    out.push({
      rule: "question-word-order", from: j, to: j, replacement: "", category: "word-order", severity: "major", skill: "question-form",
      messageKo: `의문사 의문문은 '의문사 + 조동사/be동사 + 주어' 순서입니다 (예: How is your wife doing? / Where is the station? / What do you think?).`,
    });
    return out;
  }
  // "You have ever tasted bibimbap?" → "Have you ever tasted …?"
  if (SUBJECT_PRONOUNS.has(q) && /^(have|has)$/.test(w[i + 1]?.norm ?? "") && w[i + 2]?.norm === "ever") {
    out.push({
      rule: "question-word-order", from: i, to: i + 2, replacement: `${w[i + 1].norm} ${w[i].norm}`, category: "word-order", severity: "major", skill: "question-form",
      messageKo: `경험을 묻는 질문은 'Have/Has + 주어 + ever + 과거분사?' 순서입니다: '${w[i + 1].norm[0].toUpperCase()}${w[i + 1].norm.slice(1)} ${w[i].norm} ever …?'.`,
    });
  }
  return out;
};

/** "Could you tell me if is there any pork?" → "if there is": indirect questions keep statement order. */
const embeddedQuestionOrder: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 1; i < w.length - 2; i++) {
    if (!/^(if|whether|where|what|when|how|why|who)$/.test(w[i].norm)) continue;
    // Only words in the same clause introduce an indirect question: "Sure, how was your flight?" is a direct one.
    let from = Math.max(0, i - 3);
    for (let k = i - 1; k >= from; k--) if (brokenAfter(w, k)) { from = k + 1; break; }
    const before = w.slice(from, i).map((x) => x.norm);
    // "Sure, what do you need?" said without the comma is a reply and a direct question; "I'm not sure what …" is not.
    const sureIntro = (k: number) => before[k] === "sure" && /^(not|am|is|are|be|make|was|were|so|really|quite)$/.test(before[k - 1] ?? w[from - 1]?.norm ?? "");
    if (!before.some((x, k) => (x === "sure" ? sureIntro(k) : /^(tell|know|wonder|wondering|ask|asking|idea|explain|check|confirm|remember|understand|show|out|find|learn|decide|forget|see)$/.test(x)))) continue;
    // "what time does it start", "how much does it cost", "which gate is it": the question word can bring a word along.
    let a = i + 1;
    if (/^(what|which)$/.test(w[i].norm) && /^(time|day|date|kind|sort|type|size|color|colour|room|gate|floor|platform|one|way|part|line)$/.test(w[a]?.norm ?? "")) a++;
    else if (w[i].norm === "how" && /^(much|many|long|often|far|old|soon|big|late|early)$/.test(w[a]?.norm ?? "")) {
      a++;
      if (/^(much|many)$/.test(w[a - 1].norm) && w[a] && !/^(is|are|was|were|do|does|did|can|could|will|would|has|have)$/.test(w[a].norm) && /^[a-z]+s?$/.test(w[a].norm) && !verbInfo(w[a].norm)) a++;
    }
    if (a + 1 >= w.length || !/^(is|are|was|were|do|does|did|can|could|will|would|has|have)$/.test(w[a].norm) || w[a].expanded) continue;
    if (!(SUBJECT_PRONOUNS.has(w[a + 1].norm) || /^(there|the|this|that|your|our|my|their|his|her|its)$/.test(w[a + 1].norm))) continue;
    // "what time does it start" → "what time it starts": drop do/does/did and put the tense on the verb.
    const v = w[a + 2];
    const vi = v ? verbInfo(v.norm) : null;
    const doSupport = /^(do|does|did)$/.test(w[a].norm) && SUBJECT_PRONOUNS.has(w[a + 1].norm) && vi && vi.form === "base" && v!.norm === vi.base && !brokenAfter(w, a + 1);
    if (doSupport) {
      const verb = w[a].norm === "did" ? pastOf(vi!.base) : w[a].norm === "does" ? thirdPersonOf(vi!.base) : vi!.base;
      out.push({
        rule: "embedded-question-order", from: a, to: a + 3, replacement: `${w[a + 1].raw} ${verb}`, category: "word-order", severity: "major", skill: "question-form",
        messageKo: `문장 속 의문문(간접의문문)은 평서문 순서이고 do/does/did를 쓰지 않습니다: '${w.slice(i, a).map((x) => x.raw).join(" ")} ${w[a + 1].raw} ${verb}'.`,
      });
      continue;
    }
    out.push({
      rule: "embedded-question-order", from: a, to: a + 1, replacement: "", category: "word-order", severity: "major", skill: "question-form",
      messageKo: `문장 속 의문문(간접의문문)은 평서문 순서입니다: '${w.slice(i, a).map((x) => x.raw).join(" ")} ${w[a + 1].raw} … ${w[a].raw}'.`,
    });
  }
  return out;
};

/** "I recommend you the bulgogi" → "I recommend the bulgogi (to you)". */
const recommendPersonThing: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    const base = verbInfo(w[i].norm)?.base;
    if (!base || !/^(recommend|suggest|explain|describe|introduce)$/.test(base)) continue;
    if (!/^(you|me|him|her|us|them)$/.test(w[i + 1].norm) || !/^(the|a|an|this|that|our|some|your|my|their|these|those)$/.test(w[i + 2].norm)) continue;
    out.push({
      rule: "verb-person-thing", from: i + 1, to: i + 2, replacement: "", category: "verb-form", severity: "major", skill: "verb-object",
      messageKo: `'${base}'는 '${base} + 사람 + 물건' 순서로 쓰지 않습니다: '${w[i].raw} ${w.slice(i + 2, i + 4).map((x) => x.raw).join(" ")} … to ${w[i + 1].raw}'.`,
    });
  }
  return out;
};

/** "you keep cut out" → "keep cutting out": keep/stop/finish/enjoy/avoid/mind take -ing. */
const keepBaseVerb: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const base = verbInfo(w[i].norm)?.base;
    if (!base || !/^(keep|stop|finish|enjoy|avoid|mind|quit)$/.test(base)) continue;
    // "Great minds think alike": the plural noun "minds".
    if (w[i].norm === "minds" && i > 0 && !SUBJECT_PRONOUNS.has(w[i - 1].norm)) continue;
    const v = w[i + 1];
    const info = verbInfo(v.norm);
    if (!info || info.form !== "base" || v.norm !== info.base || COUNTABLE_NOUNS.has(v.norm)) continue;
    if (!UNAMBIGUOUS_VERBS.has(v.norm) && !/^(cut|drop|freeze|lose|break|fail|go|ask|call|try|make|get|say|forget|happen|change|come|interrupt|crash|disconnect|work|talk|eat|drink|smoke|send)$/.test(v.norm)) continue;
    if (base === "stop" && /^(work|talk)$/.test(v.norm) && !w[i + 2]) continue; // "stop work" (noun)
    const fix = ingOf(v.norm);
    out.push({
      rule: "verb-gerund", from: i + 1, to: i + 2, replacement: fix, category: "verb-form", severity: "major", skill: "prep-gerund",
      messageKo: `'${base}' 뒤에는 동사ing가 옵니다: '${w[i].raw} ${fix}'.`,
    });
  }
  return out;
};

/** "talk the pump quotation" → "talk about". */
const talkObject: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (verbInfo(w[i].norm)?.base !== "talk") continue;
    if (!/^(the|this|that|our|your|my|their|his|her)$/.test(w[i + 1].norm)) continue;
    out.push({
      rule: "talk-about", from: i + 1, to: i + 1, replacement: "about", category: "preposition", severity: "major", skill: "verb-prep",
      messageKo: "'talk'는 자동사라서 주제 앞에 'about'이 필요합니다: 'talk about + 주제' (사람은 'talk to').",
    });
  }
  return out;
};

/** "come to this way" → "come this way"; "Let's going" → "Let's go". */
const smallPhrases: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (/^(come|go|walk|step|move)$/.test(verbInfo(w[i].norm)?.base ?? "") && w[i + 1].norm === "to" && w[i + 2].norm === "this" && w[i + 3]?.norm === "way") {
      out.push({ rule: "to-this-way", from: i + 1, to: i + 2, replacement: "", category: "preposition", severity: "major", skill: "verb-prep", messageKo: "'this way'(이쪽으로) 앞에는 전치사를 쓰지 않습니다: 'come this way'." });
    }
  }
  for (let i = 0; i < w.length - 2; i++) {
    if (w[i].norm !== "let" || !/^(us|me)$/.test(w[i + 1].norm)) continue;
    const v = w[i + 2];
    const info = verbInfo(v.norm);
    if (!info || info.form !== "ing" || ING_NOUNS.has(v.norm)) continue;
    out.push({ rule: "let-ing", from: i + 2, to: i + 3, replacement: info.base, category: "verb-form", severity: "major", skill: "offer-suggest", messageKo: `'Let's / Let me' 뒤에는 동사원형이 옵니다: '${info.base}'.` });
  }
  // "because of the traffic is heavy" → "because the traffic is heavy"
  for (let i = 0; i < w.length - 3; i++) {
    if (w[i].norm !== "because" || w[i + 1].norm !== "of") continue;
    for (let k = i + 2; k < Math.min(w.length, i + 7); k++) {
      if (brokenAfter(w, k - 1)) break;
      // "because of the rain that was …", "because of the rain, which …": the verb belongs to a relative clause.
      if (/^(that|which|who|where|when|and|but|so)$/.test(w[k].norm)) break;
      if (/^(is|are|was|were|has|have|had|will|can|could|would|should)$/.test(w[k].norm) && !w[k].expanded) {
        out.push({ rule: "because-of-clause", from: i + 1, to: i + 2, replacement: "", category: "sentence-structure", severity: "major", skill: "cause-effect", messageKo: "'because of' 뒤에는 명사만 옵니다. 주어와 동사가 있는 절이 오면 'because'만 씁니다." });
        break;
      }
    }
  }
  return out;
};

/** "I was received it" → "I received it": a passive cannot have an object. */
const passiveWithObject: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 1; i < w.length - 2; i++) {
    // A person does the action: "we were followed the steps", "the operators were followed every step".
    const person = /^(i|we|they|he|she|you)$/.test(w[i - 1].norm) || PERSON_NOUNS.has(w[i - 1].norm) || /^(operators|engineers|workers|colleagues|people|staff|technicians|managers|customers|clients)$/.test(w[i - 1].norm);
    if (!person || !/^(was|were|am|are|is)$/.test(w[i].norm) || w[i].expanded) continue;
    const v = w[i + 1];
    const info = verbInfo(v.norm);
    if (!info || !(info.form === "pp" || (info.form === "past" && participleOf(info.base) === v.norm)) || isSameFormParticiple(info.base)) continue;
    if (!/^(it|them|the|this|that|your|our|my|their|his|her|every|each|all)$/.test(w[i + 2].norm)) continue;
    if (/^(given|sent|shown|told|asked|offered|paid|taught|promised|allowed|called|named|elected|considered)$/.test(v.norm)) continue; // "I was given the file", "we were told the date"
    out.push({
      rule: "passive-with-object", from: i, to: i + 1, replacement: "", category: "be-verb", severity: "major", skill: "passive",
      messageKo: `내가 직접 한 일(목적어가 있음)은 능동태입니다: '${w[i - 1].raw} ${v.raw} ${w[i + 2].raw}' (be동사 없이).`,
    });
  }
  return out;
};

/* ───────────── Prepositions and collocations (learner corpus round) ───────────── */

/** Word + the preposition Koreans often use instead of the right one. */
const PREP_FIX: Record<string, { wrong: string[]; right: string }> = {
  proud: { wrong: ["with", "about", "for"], right: "of" }, related: { wrong: ["with", "on"], right: "to" }, different: { wrong: ["with"], right: "from" },
  familiar: { wrong: ["to", "about"], right: "with" }, married: { wrong: ["with"], right: "to" }, depend: { wrong: ["of", "from", "to"], right: "on" },
  interested: { wrong: ["about", "on", "for", "with"], right: "in" }, similar: { wrong: ["with", "as"], right: "to" }, responsible: { wrong: ["of", "about"], right: "for" },
  afraid: { wrong: ["about", "for"], right: "of" }, capable: { wrong: ["to"], right: "of" }, aware: { wrong: ["about"], right: "of" },
  satisfied: { wrong: ["about", "for"], right: "with" }, famous: { wrong: ["about", "with"], right: "for" }, consist: { wrong: ["with", "in"], right: "of" },
  arrive: { wrong: ["to"], right: "at" }, focus: { wrong: ["in", "to"], right: "on" }, belong: { wrong: ["in", "for"], right: "to" },
  good: { wrong: ["in"], right: "at" }, angry: { wrong: ["to", "on"], right: "with" }, worried: { wrong: ["for", "on"], right: "about" },
};
const prepositionCollocation: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const base = verbInfo(w[i].norm)?.base ?? w[i].norm;
    const entry = PREP_FIX[base] ?? PREP_FIX[w[i].norm];
    if (!entry || !entry.wrong.includes(w[i + 1].norm) || brokenAfter(w, i)) continue;
    if (base === "good" && w[i - 1]?.norm !== "am" && !BE_FORMS.has(w[i - 1]?.norm ?? "")) continue; // "a good in-house team"
    // "worried for my dad": worried for + a person is fine (concern for someone's safety).
    if (w[i].norm === "worried" && w[i + 1].norm === "for" && /^(my|your|his|her|our|their|him|her|them|you|me|us|the)$/.test(w[i + 2]?.norm ?? "") && !/^(the)$/.test(w[i + 2]?.norm ?? "")) continue;
    if (base === "arrive" && /^(a|an|the)$/.test(w[i + 2]?.norm ?? "") === false && !/^[A-Z]/.test(w[i + 2]?.raw ?? "")) continue;
    const right = base === "arrive" && /^[A-Z]/.test(w[i + 2]?.raw ?? "") ? "in" : entry.right;
    out.push({
      rule: "preposition-collocation", from: i + 1, to: i + 2, replacement: right, category: "preposition", severity: "major", skill: "verb-prep",
      messageKo: `'${w[i].raw}' 뒤에는 '${right}'를 씁니다: '${w[i].raw} ${right}'.`,
    });
  }
  return out;
};

/** "go to home", "near from", "call to me", "access to the folder", "consider about", "on next Monday". */
const extraPreposition: Rule = (w) => {
  const out: RuleFinding[] = [];
  const drop = (i: number, msg: string, skill = "verb-prep") =>
    out.push({ rule: "extra-preposition", from: i, to: i + 1, replacement: "", category: "preposition", severity: "major", skill, messageKo: msg });
  for (let i = 1; i < w.length - 1; i++) {
    const prevBase = verbInfo(w[i - 1].norm)?.base ?? w[i - 1].norm;
    const p = w[i].norm;
    const n = w[i + 1].norm;
    if (p === "to" && (/^(go|come|get|head|arrive|return|walk|drive|leave)$/.test(prevBase) || /^(heads|heading|headed|walking|walked|driving|drove|returning|returned|arriving|coming|going|getting)$/.test(w[i - 1].norm)) && /^(home|here|there|abroad|downtown|upstairs|downstairs|overseas)$/.test(n))
      drop(i, `'${n}'는 부사라서 앞에 to를 쓰지 않습니다: '${w[i - 1].raw} ${n}'.`);
    else if (p === "from" && w[i - 1].norm === "near") drop(i, "'near'는 전치사라서 바로 장소를 씁니다: 'near the plant'.");
    else if (p === "to" && /^(call|phone|text|email|contact|meet|tell|ask)$/.test(prevBase) && /^(me|us|him|her|them|you)$/.test(n) && !/^(talk|speak)$/.test(prevBase))
      drop(i, `'${prevBase}'는 사람을 바로 목적어로 씁니다: '${w[i - 1].raw} ${n}'.`, "verb-object");
    else if (p === "to" && prevBase === "access" && /^(the|our|your|this|that|my|their)$/.test(n) && w[i - 2] && (SUBJECT_PRONOUNS.has(w[i - 2].norm) || /^(can|could|to|will|cannot|not)$/.test(w[i - 2].norm)))
      drop(i, "동사 'access'는 목적어를 바로 씁니다: 'access the folder'. (명사로 쓸 때만 'access to')", "verb-object");
    else if (p === "about" && /^(consider|discuss|mention|describe|explain|emphasize|research)$/.test(prevBase) && !/^(it|this|that)$/.test(w[i - 2]?.norm ?? "x"))
      drop(i, `'${prevBase}'는 타동사라서 about 없이 목적어를 씁니다.`, "verb-object");
    else if (p === "into" && prevBase === "enter") drop(i, "'enter'는 타동사라서 into 없이 씁니다: 'enter the area'.", "verb-object");
    else if (
      /^(on|in|at)$/.test(p) && /^(next|last)$/.test(n) && /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weekend|month|year|time)$/.test(w[i + 2]?.norm ?? "") &&
      !/'s$/i.test(w[i + 2].raw) && // "at next week's meeting"
      !/^(agree|decide|work|focus|depend|count|rely|plan|vote|comment|insist|put|come|go|log|check|fill|hand|sign|call|turn|bring|take|move|settle|join|drop|stop|pop|swing|get|start|kick)$/.test(prevBase) // "agreed on last time", "put in last month", "moved in last week"
    )
      drop(i, `'next/last + 시간' 앞에는 전치사를 쓰지 않습니다: '${n} ${w[i + 2].raw}'.`);
    else if (
      ((p === "in" && /^(week|month|year|quarter|morning|afternoon|evening|weekend)$/.test(w[i + 2]?.norm ?? "")) ||
        (p === "on" && /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(w[i + 2]?.norm ?? ""))) &&
      n === "this" && !/'s$/i.test(w[i + 2].raw) && w[i + 3]?.norm !== "of" && // "in this year's budget", "in this month of"
      !/^(put|fill|hand|sign|log|check|bring|take|come|go|plug|turn|move|settle|join|drop|stop|pop|swing|get|start|kick)$/.test(prevBase)
    )
      drop(i, `'this + 시간' 앞에는 전치사를 쓰지 않습니다: 'this ${w[i + 2].raw}'.`);
  }
  return out;
};

/** "agree your point", "wait us", "replied me", "look this graph": the preposition is missing. */
const missingPreposition: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const info = verbInfo(w[i].norm);
    if (!info || brokenAfter(w, i)) continue;
    const n = w[i + 1].norm;
    let prep = "";
    // "agree your point" → "agree with"; "agree that …" is a clause and fine.
    if (info.base === "agree" && /^(your|his|her|their|our|you|him|them)$/.test(n)) prep = "with";
    else if (info.base === "wait" && /^(me|us)$/.test(n)) prep = "for";
    else if (/^(reply|respond|listen|talk|speak)$/.test(info.base) && /^(me|us|him|her|them)$/.test(n)) prep = "to";
    else if (info.base === "look" && /^(this|that|these|those|the|my|your|our)$/.test(n) && w[i + 2] && !/^(way|up|over|out|forward|time|morning|week|year)$/.test(w[i + 2].norm) && !/^(is|are|was|were)$/.test(w[i + 2].norm) && w[i - 1]?.norm !== "to" && (i === 0 || /^(please|let's|us|can|could|you|we|i|just|now|and)$/.test(w[i - 1].norm))) prep = "at";
    if (!prep) continue;
    out.push({
      rule: "missing-preposition", from: i + 1, to: i + 1, replacement: prep, category: "preposition", severity: "major", skill: "verb-prep",
      messageKo: `'${info.base}' 뒤에는 '${prep}'가 필요합니다: '${w[i].raw} ${prep} ${w[i + 1].raw}'.`,
    });
  }
  return out;
};

/** "during three years" → "for"; "send it until Thursday" → "by" (a deadline, not a duration). */
const durationDeadline: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm === "during" && /^(two|three|four|five|six|seven|eight|nine|ten|several|many|\d+|a)$/.test(w[i + 1].norm) && /^(few|couple)?$/.test(w[i + 1].norm === "a" ? w[i + 2].norm : "") && /^(minutes|hours|days|weeks|months|years)$/.test(w[i + (w[i + 1].norm === "a" ? 3 : 2)]?.norm ?? "")) {
      out.push({ rule: "during-duration", from: i, to: i + 1, replacement: "for", category: "preposition", severity: "major", skill: "verb-prep", messageKo: "'몇 년/며칠 동안'처럼 기간의 길이는 'for'를 씁니다. 'during'은 'during the meeting'처럼 특정 기간 앞에 씁니다." });
    }
    // "I stayed there during a week" → "for a week" (a length of time at the end of the clause).
    if (w[i].norm === "during" && /^(a|an|one)$/.test(w[i + 1].norm) && /^(minute|hour|day|week|month|year)$/.test(w[i + 2]?.norm ?? "") && (i + 3 >= w.length || brokenAfter(w, i + 2) || /^(or|and|so|but|because)$/.test(w[i + 3]?.norm ?? ""))) {
      out.push({ rule: "during-duration", from: i, to: i + 1, replacement: "for", category: "preposition", severity: "major", skill: "verb-prep", messageKo: "'일주일 동안'처럼 기간의 길이는 'for a week'입니다. 'during'은 'during the meeting'처럼 특정 기간 앞에 씁니다." });
    }
    if (w[i].norm === "until") {
      const clause = w.slice(Math.max(0, i - 7), i).map((x) => verbInfo(x.norm)?.base ?? x.norm);
      const point = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|noon|next|\d+)$/.test(w[i + 1].norm) || (w[i + 1].norm === "the" && w[i + 2]?.norm === "end");
      if (point && clause.some((x) => /^(send|submit|finish|complete|deliver|confirm|return|decide|pay|reply|share|upload|prepare)$/.test(x)) && !clause.some((x) => /^(wait|stay|keep|continue|work|run|last|not|every|each|regularly|daily|weekly)$/.test(x))) {
        out.push({ rule: "until-deadline", from: i, to: i + 1, replacement: "by", category: "preposition", severity: "major", skill: "verb-prep", messageKo: "마감(그때까지 끝내기)은 'by'입니다. 'until'은 그때까지 계속되는 일에 씁니다(wait until Friday)." });
      }
    }
  }
  return out;
};

/* ───────────── Verb forms (learner corpus round) ───────────── */

/** "was happened", "is consisted of": verbs that never take the passive. */
const passiveIntransitive: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!/^(is|are|was|were|been|be)$/.test(w[i].norm) || w[i].expanded && w[i].norm === "is" && /'s$/i.test(w[i].raw) && w[i + 1]?.norm === "happened" === false) continue;
    const v = w[i + 1].norm;
    if (!/^(happened|occurred|consisted|existed|appeared|disappeared|died|belonged|resulted|emerged|arrived|remained|seemed|depended)$/.test(v)) continue;
    const base = verbInfo(v)?.base ?? v.replace(/ed$/, "");
    const tense = /^(was|were)$/.test(w[i].norm) ? v : /^(is|are)$/.test(w[i].norm) ? (w[i].norm === "is" ? thirdPersonOf(base) : base) : v;
    out.push({
      rule: "passive-intransitive", from: i, to: i + 2, replacement: tense, category: "verb-form", severity: "major", skill: "passive",
      messageKo: `'${base}'는 목적어를 갖지 않는 동사라서 수동태(be + p.p.)로 쓰지 않습니다: '${tense}'.`,
    });
  }
  return out;
};

/** "was broke", "has ever eat", "was build in 1998": the past participle is needed. */
const participleNeeded: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const n = w[i + 1];
    const info = verbInfo(n.norm);
    if (!info) continue;
    const pp = participleOf(info.base);
    // be + simple past that differs from the participle: "was broke" → "broken".
    if (/^(is|are|was|were|been|be|being)$/.test(w[i].norm) && info.form === "past" && pp !== n.norm && !/^(was|were)$/.test(n.norm)) {
      out.push({ rule: "participle-needed", from: i + 1, to: i + 2, replacement: pp, category: "verb-form", severity: "major", skill: "passive", messageKo: `수동태·완료형에는 과거분사를 씁니다: '${n.raw}' → '${pp}'.` });
      continue;
    }
    // Question perfect: "Have you ever eat …?" → "eaten".
    if (/^(have|has)$/.test(w[i].norm) && (i === 0 || brokenAfter(w, i - 1)) && SUBJECT_PRONOUNS.has(n.norm)) {
      let j = i + 2;
      while (j < w.length && /^(ever|never|already|just|really|recently)$/.test(w[j].norm)) j++;
      const v = w[j];
      const vi = v ? verbInfo(v.norm) : null;
      if (v && vi && (vi.form === "base" || vi.form === "past") && participleOf(vi.base) !== v.norm && !isSameFormParticiple(vi.base)) {
        out.push({ rule: "participle-needed", from: j, to: j + 1, replacement: participleOf(vi.base), category: "verb-form", severity: "major", skill: "present-perfect", messageKo: `현재완료 의문문도 'Have + 주어 + 과거분사'입니다: '${participleOf(vi.base)}'.` });
      }
    }
    // A thing + was/were + base verb + a time or place: "This building was build in 1998".
    if (/^(was|were)$/.test(w[i].norm) && info.form === "base" && n.norm === info.base && pp !== n.norm && !isSameFormParticiple(info.base) && i > 0 && !/^(i|we|you|they|he|she)$/.test(w[i - 1].norm) &&
      /^(in|at|on|by|last|yesterday|ago|this|and|before|after)$/.test(w[i + 2]?.norm ?? "") && !COUNTABLE_NOUNS.has(n.norm)) {
      out.push({ rule: "participle-needed", from: i + 1, to: i + 2, replacement: pp, category: "verb-form", severity: "major", skill: "passive", messageKo: `'~되었다'는 수동태 'was + 과거분사'입니다: '${pp}'.` });
    }
  }
  return out;
};

/** "we need replace it" → "need to replace"; "My hobby is play golf" → "playing". */
const infinitiveNeeded: Rule = (w) => {
  const out: RuleFinding[] = [];
  const CLEAR = /^(replace|repair|send|finish|start|change|call|go|come|leave|buy|make|take|ask|tell|see|eat|meet|check|confirm|discuss|reduce|increase|install|prepare|order|book|visit|contact|update|clean|close|open|stop|delay|cancel|postpone|move|fix|wait|talk|speak|explain|share|review|inform)$/;
  for (let i = 0; i < w.length - 1; i++) {
    const info = verbInfo(w[i].norm);
    const v = w[i + 1];
    const vi = verbInfo(v.norm);
    if (info && /^(need|want|plan|decide|hope|try|forget|promise|agree|expect)$/.test(info.base) && info.form !== "ing" && vi && vi.form === "base" && v.norm === vi.base && CLEAR.test(v.norm) && !brokenAfter(w, i)) {
      // "need check" is wrong; "need help", "need time" are nouns. Only clear verbs, followed by an object or a particle.
      const after = w[i + 2]?.norm ?? "";
      if (!(DETERMINERS.has(after) || /^(it|them|us|me|him|her|you|up|back|out|off|on|home|to|with|about|for)$/.test(after) || UNAMBIGUOUS_VERBS.has(v.norm))) continue;
      if (/^(i|we|you|they|he|she|it)$/.test(w[i - 1]?.norm ?? "") === false && !/^(will|would|may|might|can|could|should|must|really|also|just|not|still|to|and)$/.test(w[i - 1]?.norm ?? "")) continue;
      out.push({ rule: "missing-to", from: i + 1, to: i + 1, replacement: "to", category: "verb-form", severity: "major", skill: "purpose-to", messageKo: `'${info.base}' 뒤에 동사가 오면 'to + 동사원형'입니다: '${w[i].raw} to ${v.raw}'.` });
    }
    // "The plan is reduce …" → -ing / to ("My hobby is play golf" has its own message: hobby-ing).
    if (/^(job|plan|goal|dream|idea|task|role)$/.test(w[i - 1]?.norm ?? "") && /^(is|was)$/.test(w[i].norm) && vi && vi.form === "base" && v.norm === vi.base && (CLEAR.test(v.norm) || /^(play|watch|read|cook|travel|swim|hike|run|draw|sing|dance|fish|camp|shop|walk)$/.test(v.norm))) {
      out.push({ rule: "missing-to", from: i + 1, to: i + 2, replacement: ingOf(v.norm), category: "verb-form", severity: "major", skill: "prep-gerund", messageKo: `be동사 뒤에 동사를 쓸 때는 동사ing(또는 to + 동사원형)입니다: '${w[i].raw} ${ingOf(v.norm)}'.` });
    }
  }
  // "busy to prepare" → "busy preparing"; "looking forward to meet" → "meeting"; "feel free to asking" → "ask".
  for (let i = 0; i < w.length - 2; i++) {
    if (w[i].norm === "busy" && w[i + 1].norm === "to" && isBaseVerb(w[i + 2].norm))
      out.push({ rule: "busy-ing", from: i + 1, to: i + 3, replacement: ingOf(w[i + 2].norm), category: "verb-form", severity: "major", skill: "prep-gerund", messageKo: `'~하느라 바쁘다'는 'busy + 동사ing'입니다: 'busy ${ingOf(w[i + 2].norm)}'.` });
    if (w[i].norm === "forward" && w[i + 1].norm === "to" && verbInfo(w[i + 2].norm)?.form === "base" && w[i + 2].norm === verbInfo(w[i + 2].norm)!.base && !COUNTABLE_NOUNS.has(w[i + 2].norm))
      out.push({ rule: "forward-to-ing", from: i + 2, to: i + 3, replacement: ingOf(w[i + 2].norm), category: "verb-form", severity: "major", skill: "thanks-looking-forward", messageKo: `'look forward to'의 to는 전치사라서 동사ing가 옵니다: 'to ${ingOf(w[i + 2].norm)}'.` });
    if (w[i].norm === "free" && w[i + 1].norm === "to" && verbInfo(w[i + 2].norm)?.form === "ing" && !ING_NOUNS.has(w[i + 2].norm))
      out.push({ rule: "to-base", from: i + 2, to: i + 3, replacement: verbInfo(w[i + 2].norm)!.base, category: "verb-form", severity: "major", skill: "purpose-to", messageKo: `'feel free to' 뒤에는 동사원형이 옵니다: '${verbInfo(w[i + 2].norm)!.base}'.` });
  }
  return out;
};

/** "Take photos is not allowed" → "Taking photos": a verb as the subject takes -ing. */
const gerundSubject: Rule = (w) => {
  const out: RuleFinding[] = [];
  let s = 0;
  while (s < w.length && /^(sorry|so|but|and|also|please|well|actually)$/.test(w[s].norm)) s++;
  const v = w[s];
  const vi = v ? verbInfo(v.norm) : null;
  if (!v || !vi || vi.form !== "base" || v.norm !== vi.base) return out;
  if (!/^(take|make|eat|use|drink|smoke|park|bring|enter|wear|learn|speak|work|drive|travel|swim|climb|walk|run|cook|read|check|follow|change|install|open)$/.test(v.norm)) return out;
  for (let k = s + 2; k < Math.min(w.length - 1, s + 5); k++) {
    if (brokenAfter(w, k - 1)) return out;
    if (/^(is|was)$/.test(w[k].norm) && /^(not|very|really|so|too|important|necessary|allowed|prohibited|forbidden|dangerous|difficult|easy|fun|hard|good|bad|healthy|required|essential|possible|impossible)$/.test(w[k + 1].norm)) {
      out.push({ rule: "gerund-subject", from: s, to: s + 1, replacement: ingOf(v.norm), category: "verb-form", severity: "major", skill: "prep-gerund", messageKo: `동사가 주어가 될 때는 동사ing로 씁니다: '${ingOf(v.norm)} …'.` });
      return out;
    }
  }
  return out;
};

/** "make the operators to follow" → no "to" after make/let + a noun object. */
const makeNounTo: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 3; i++) {
    if (!/^(make|makes|made|let|lets|have|had)$/.test(w[i].norm) || !/^(the|our|your|my|all|his|her|their|everyone|everybody)$/.test(w[i + 1].norm)) continue;
    let j = i + 2;
    while (j < w.length && j <= i + 3 && w[j].norm !== "to") j++;
    if (w[j]?.norm !== "to" || !isBaseVerb(w[j + 1]?.norm ?? "") || brokenAfter(w, j - 1)) continue;
    if (/^(have|had)$/.test(w[i].norm)) continue; // "have the team to thank" is rare; skip have
    out.push({ rule: "let-make-to", from: j, to: j + 1, replacement: "", category: "verb-form", severity: "major", skill: "verb-object", messageKo: `'${w[i].norm} + 사람 + 동사원형'입니다. to를 쓰지 않습니다.` });
  }
  return out;
};

/** "I want that you explain" → "I want you to explain". */
const wantThat: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (verbInfo(w[i].norm)?.base !== "want" || w[i + 1].norm !== "that") continue;
    if (!(SUBJECT_PRONOUNS.has(w[i + 2].norm) || /^(the|our|your|my|everyone)$/.test(w[i + 2].norm))) continue;
    out.push({ rule: "want-that", from: i + 1, to: i + 2, replacement: "", category: "sentence-structure", severity: "major", skill: "verb-object", messageKo: "'want'는 that절을 쓰지 않습니다: 'want + 사람 + to + 동사원형' (예: I want you to explain …)." });
  }
  return out;
};

/** "I call you back in ten minutes" → "I'll call": a promise needs will. */
const promiseWill: Rule = (w) => {
  const out: RuleFinding[] = [];
  if (w.length < 3 || !/^(i|we)$/.test(w[0].norm)) return out;
  const v = w[1];
  if (!/^(call|send|check|email|text|get|bring|pick|give|tell|let|come|finish|ask|contact|forward|share|update)$/.test(v.norm)) return out;
  if (!w.slice(2).some((t, k) => /^(tomorrow|later|soon|tonight|asap)$/.test(t.norm) || (t.norm === "in" && /^(\d+|a|an|one|two|five|ten|fifteen|twenty|thirty|few)$/.test(w[k + 3]?.norm ?? "")) || (/^(next|this)$/.test(t.norm) && /^(week|month|monday|tuesday|wednesday|thursday|friday|afternoon|evening)$/.test(w[k + 3]?.norm ?? "")))) return out;
  out.push({ rule: "promise-will", from: 1, to: 1, replacement: "will", category: "tense", severity: "major", skill: "future-plan", messageKo: `앞으로 하겠다는 약속은 'will'을 씁니다: '${w[0].raw}'ll ${v.raw} …'.` });
  return out;
};

/* ───────────── Nouns, articles and number (learner corpus round) ───────────── */

const PLURAL_EXTRA: Record<string, string> = {
  daughter: "daughters", son: "sons", child: "children", brother: "brothers", sister: "sisters", dish: "dishes", reason: "reasons",
  kind: "kinds", type: "types", friend: "friends", country: "countries", city: "cities", year: "years", room: "rooms", result: "results",
  problem: "problems", customer: "customers", company: "companies", product: "products", part: "parts", change: "changes", plant: "plants",
  condition: "conditions", term: "terms", item: "items", detail: "details", issue: "issues", step: "steps", point: "points",
};
const pluralOf = (n: string) => PLURAL_OF[n] ?? PLURAL_EXTRA[n];
const singularOf = (n: string) => PLURAL_NOUN_SINGULAR(n) ?? Object.entries(PLURAL_EXTRA).find(([, p]) => p === n)?.[0] ?? null;

/** "two daughter", "5 degree", "two more test", "one of the main reason", "many kind of". */
const pluralNeeded: Rule = (w) => {
  const out: RuleFinding[] = [];
  const push = (k: number, pl: string, why: string) =>
    out.push({ rule: "number-singular", from: k, to: k + 1, replacement: pl, category: "countability", severity: "minor", skill: "countability", messageKo: why });
  for (let i = 0; i < w.length - 1; i++) {
    const q = w[i].norm;
    let j = i + 1;
    if (w[j].norm === "more") j++;
    const n = w[j];
    if (!n || n.expanded) continue;
    const pl = pluralOf(n.norm);
    if (!pl) continue;
    const next = w[j + 1]?.norm ?? "";
    const headEnds = !next || brokenAfter(w, j) || /^(of|for|to|in|on|at|with|from|and|or|but|so|that|which|ago|later|left|before|after|is|are|was|were|will|can|should|would|have|has|had|now|this|next|last|today|tomorrow|share|and|than)$/.test(next);
    if (!headEnds) continue;
    // "1204 room", "line 5 bus": a number used as a label, not a count.
    if (/^\d{3,}$/.test(q) && /^(room|floor|gate|line|bus|number|page|platform|exit|terminal|seat|row|track)$/.test(n.norm)) continue;
    const bigNumber = /^(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|many|both)$/.test(q) || (/^\d+$/.test(q) && Number(q) > 1);
    if (bigNumber && !(q === "many" && n.norm === "time")) push(j, pl, `'${w[i].raw}' 뒤의 셀 수 있는 명사는 복수형입니다: '${pl}'.`);
    else if (q === "few" && w[i - 1]?.norm === "a") push(j, pl, `'a few' 뒤에는 복수형이 옵니다: '${pl}'.`);
  }
  // "one of the main reason" → "reasons"
  for (let i = 0; i < w.length - 3; i++) {
    if (w[i].norm !== "one" || w[i + 1].norm !== "of" || !/^(the|my|our|your|his|her|their|these|those)$/.test(w[i + 2].norm)) continue;
    let j = i + 3;
    if (w[j + 1] && pluralOf(w[j + 1].norm) && !pluralOf(w[j].norm)) j++;
    const pl = pluralOf(w[j]?.norm ?? "");
    if (pl) push(j, pl, `'one of the + 복수 명사'입니다: '${pl}'.`);
  }
  // "many kind of" → "many kinds of"
  for (let i = 0; i < w.length - 2; i++) {
    if (/^(many|several|different|various|all)$/.test(w[i].norm) && /^(kind|type|sort)$/.test(w[i + 1].norm) && w[i + 2].norm === "of" && !/^(a|an|one|the|this|that)$/.test(w[i - 1]?.norm ?? "")) push(i + 1, `${w[i + 1].norm}s`, `'${w[i].raw}' 뒤에는 복수형입니다: '${w[i + 1].norm}s of'.`);
  }
  return out;
};

/** "this results" → "these results", "a 60-days term" → "60-day", "two millions won" → "two million". */
const determinerNumber: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const n = w[i + 1];
    if (/^(this|that)$/.test(w[i].norm) && !n.expanded) {
      const single = singularOf(n.norm);
      // "the reason that people like it", "I know that engineers are busy": that + subject + verb is a clause.
      const clause = w[i].norm === "that" && !!w[i + 2] && (!!verbInfo(w[i + 2].norm) || BE_FORMS.has(w[i + 2].norm) || MODALS.has(w[i + 2].norm));
      if (single && !clause && !/^(in|from|for)$/.test(w[i + 2]?.norm ?? "") && !brokenAfter(w, i)) {
        const fix = w[i].norm === "this" ? "these" : "those";
        out.push({ rule: "determiner-number", from: i, to: i + 1, replacement: fix, category: "countability", severity: "major", skill: "countability", messageKo: `복수 명사(${n.raw}) 앞에서는 '${fix}'를 씁니다.` });
      }
    }
    if (/^(a|an)$/.test(w[i].norm) && /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty)-(days|weeks|months|years|hours|minutes|tons|meters|people|persons|steps|pages)$/.test(n.norm)) {
      const fix = n.norm.replace(/-(\w+?)s$/, (_m, u) => `-${u === "people" ? "person" : u}`);
      out.push({ rule: "compound-adjective", from: i + 1, to: i + 2, replacement: fix, category: "countability", severity: "minor", skill: "countability", messageKo: `명사 앞에서 꾸미는 '숫자-단위'는 단수형입니다: '${fix}'.` });
    }
    if (/^(hundreds|thousands|millions|billions|dozens)$/.test(n.norm) && /^(two|three|four|five|six|seven|eight|nine|ten|several|a|\d+)$/.test(w[i].norm) && w[i + 2] && w[i + 2].norm !== "of") {
      const fix = n.norm.replace(/s$/, "");
      out.push({ rule: "number-word-plural", from: i + 1, to: i + 2, replacement: fix, category: "countability", severity: "minor", skill: "countability", messageKo: `숫자 뒤의 hundred/thousand/million에는 -s를 붙이지 않습니다: '${w[i].raw} ${fix}'.` });
    }
  }
  return out;
};

const UNCOUNTABLE = /^(news|advice|information|equipment|furniture|luggage|baggage|feedback|progress|research|homework|weather|money|traffic|noise|water|work|software|knowledge|evidence|machinery|bread|damage|accommodation|scenery|staff)$/;
/** "a good news", "an advice" → no article; "many money" → "much money". */
const uncountableDeterminer: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    let j = i + 1;
    if (/^(good|great|bad|useful|important|new|big|small|little|nice|helpful|valuable|terrible|wonderful|exciting|sad|quick|short)$/.test(w[j].norm)) j++;
    const n = w[j]?.norm ?? "";
    if (/^(a|an)$/.test(w[i].norm) && /^(news|advice|information|equipment|furniture|luggage|feedback|progress|homework|weather|traffic|software|knowledge|evidence|machinery)$/.test(n) && !/^(of|piece|bit)$/.test(w[j + 1]?.norm ?? "x") && !(w[j + 1] && !brokenAfter(w, j) && !PREPOSITIONS.has(w[j + 1].norm) && !/^(and|but|so|for|today|now|too)$/.test(w[j + 1].norm))) {
      out.push({ rule: "article-uncountable", from: i, to: i + 1, replacement: "", category: "countability", severity: "minor", skill: "countability", messageKo: `'${n}'는 셀 수 없는 명사라서 a/an을 쓰지 않습니다 (하나를 말할 때는 'a piece of ${n}').` });
    }
    if (w[i].norm === "many" && UNCOUNTABLE.test(w[i + 1].norm) && w[i + 1].norm !== "staff") {
      out.push({ rule: "many-uncountable", from: i, to: i + 1, replacement: "much", category: "countability", severity: "major", skill: "countability", messageKo: `셀 수 없는 명사(${w[i + 1].raw})에는 'many'가 아니라 'much'를 씁니다.` });
    }
  }
  return out;
};

/** "I had same problem" → "the same", "This is most important slide" → "the most", "most of engineers" → "most of the". */
const theNeeded: Rule = (w) => {
  const out: RuleFinding[] = [];
  const add = (k: number, msg: string) => out.push({ rule: "the-needed", from: k, to: k, replacement: "the", category: "article", severity: "minor", skill: "articles", messageKo: msg });
  for (let i = 1; i < w.length - 1; i++) {
    const prev = w[i - 1].norm;
    if (w[i].norm === "same" && !/^(the|this|that|our|your|my|his|her|their|its|at|all|exactly|almost)$/.test(prev) && !/^(here|as|to|thing)$/.test(w[i + 1].norm) && !brokenAfter(w, i))
      add(i, "'같은'은 항상 'the same'입니다.");
    if (w[i].norm === "most" && BE_FORMS.has(prev) && /^(important|difficult|expensive|popular|common|famous|beautiful|interesting|useful|serious|efficient|reliable|delicious|exciting|critical)$/.test(w[i + 1].norm) && w[i + 2] && !brokenAfter(w, i + 1) && !PREPOSITIONS.has(w[i + 2].norm) && !/^(and|but|so|to|for|now|than)$/.test(w[i + 2].norm))
      add(i, "최상급 + 명사 앞에는 'the'가 필요합니다: 'the most …'.");
  }
  for (let i = 0; i < w.length - 2; i++) {
    if (!/^(most|some|many|all|none|each|both|half|several|any)$/.test(w[i].norm) || w[i + 1].norm !== "of") continue;
    const n = w[i + 2].norm;
    if (DETERMINERS.has(n) || /^(us|them|you|these|those|it|which|whom|my|your)$/.test(n) || /^[A-Z]/.test(w[i + 2].raw)) continue;
    if (!singularOf(n) && !/^(engineers|operators|people|customers|participants|employees|members|students|visitors|companies)$/.test(n)) continue;
    add(i + 2, `'${w[i].norm} of' 뒤의 명사에는 the/our 같은 한정어가 필요합니다: '${w[i].norm} of the ${w[i + 2].raw}' (또는 '${w[i].norm} ${w[i + 2].raw}').`);
  }
  return out;
};

/** "go to the work", "have a lunch together" → no article. */
const extraArticle: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 1; i < w.length - 2; i++) {
    const base = verbInfo(w[i - 1].norm)?.base ?? "";
    if (/^(go|come|get|leave|head)$/.test(base) && w[i].norm === "to" && w[i + 1].norm === "the" && /^(work|school|bed|church|home)$/.test(w[i + 2].norm) && (i + 3 >= w.length || brokenAfter(w, i + 2) || /^(by|early|late|today|now|and|at|on|after|before)$/.test(w[i + 3].norm)))
      out.push({ rule: "extra-article", from: i + 1, to: i + 2, replacement: "", category: "article", severity: "minor", skill: "articles", messageKo: `'go to ${w[i + 2].raw}'(일하러/학교에 가다)에는 the를 쓰지 않습니다.` });
  }
  for (let i = 1; i < w.length - 1; i++) {
    const base = verbInfo(w[i - 1].norm)?.base ?? "";
    if (/^(have|eat|grab)$/.test(base) && w[i].norm === "a" && /^(lunch|dinner|breakfast)$/.test(w[i + 1].norm) && (i + 2 >= w.length || brokenAfter(w, i + 1) || /^(together|with|now|today|tomorrow|tonight|at|after|before|first|later)$/.test(w[i + 2].norm)))
      out.push({ rule: "extra-article", from: i, to: i + 1, replacement: "", category: "article", severity: "minor", skill: "articles", messageKo: `식사(${w[i + 1].raw}) 앞에는 보통 관사를 쓰지 않습니다: 'have ${w[i + 1].raw}'. (형용사가 붙으면 'a nice ${w[i + 1].raw}')` });
  }
  return out;
};

/* ───────────── Agreement, word order and the rest (learner corpus round) ───────────── */

const FEEL_ING = /^(confusing|embarrassing|surprising|interesting|boring|exciting|tiring|satisfying|disappointing|annoying|frustrating|exhausting|amazing|shocking|relaxing|terrifying|frightening|worrying)$/;
const FEEL_ED = /^(confused|embarrassed|surprised|interested|bored|excited|tired|satisfied|disappointed|annoyed|frustrated|exhausted|amazed|shocked|relaxed|terrified|frightened|worried)$/;
const PEOPLE = /^(i|we|you|they|he|she|everyone|everybody|people|team|staff|customer|customers|client|clients|operators|engineers|guests|visitors|participants|audience|family|wife|husband|boss|son|daughter|kids|children|manager|vendor)$/;

/** "I'm interesting in photography" → interested; "The food was very satisfied" → satisfying. */
const feelingAdjective: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 1; i < w.length; i++) {
    if (!/^(am|is|are|was|were|be|been|feel|feels|felt|look|looks|looked|seem|seems|seemed|get|got)$/.test(w[i - 1].norm)) continue;
    let k = i;
    while (k < w.length && /^(very|so|really|quite|a|bit|little|too|not|pretty|extremely|totally|a lot)$/.test(w[k].norm)) k++;
    const a = w[k];
    if (!a || k > i + 3) continue;
    // Subject: the word before the verb (skip one adverb).
    let s = i - 2;
    if (/^(still|also|always|really|just|not)$/.test(w[s]?.norm ?? "")) s--;
    const subj = w[s]?.norm ?? "";
    const person = PEOPLE.test(subj) || PERSON_NOUNS.has(subj);
    const thing = /^(it|this|that|food|meal|dinner|lunch|movie|trip|tour|news|result|results|presentation|meeting|game|match|book|show|job|work|plant|city|weather|day|week|test|data|process|system|method|idea|logic|situation|talk|class|course|story|view|food|design)$/.test(subj);
    if (person && FEEL_ING.test(a.norm) && !(a.norm === "interesting" && w[k + 1]?.norm === "to")) {
      const fix = a.norm === "worrying" ? "worried" : a.norm.replace(/ying$/, "ied").replace(/ing$/, "ed").replace(/tireded$/, "tired");
      out.push({ rule: "feeling-adjective", from: k, to: k + 1, replacement: fix.replace(/satisfyed/, "satisfied"), category: "verb-form", severity: "major", skill: "be-adj", messageKo: `사람이 느끼는 감정은 과거분사(-ed)로 말합니다: '${fix}'. ('${a.raw}'는 '남을 ~하게 만드는'이라는 뜻입니다.)` });
    } else if (thing && FEEL_ED.test(a.norm) && !/^(with|by|about|in|at|that|of)$/.test(w[k + 1]?.norm ?? "")) {
      const fix = a.norm === "tired" ? "tiring" : a.norm.replace(/ied$/, "ying").replace(/ed$/, "ing").replace(/^satisfing$/, "satisfying");
      out.push({ rule: "feeling-adjective", from: k, to: k + 1, replacement: fix, category: "verb-form", severity: "major", skill: "be-adj", messageKo: `무엇이 그런 감정을 줄 때는 -ing 형용사입니다: '${fix}'. ('${a.raw}'는 사람이 느끼는 감정입니다.)` });
    }
  }
  return out;
};

/** "are very loudly", "worked very hardly", "increased sharp", "speak English very good". */
const adverbAdjectiveMore: Rule = (w) => {
  const out: RuleFinding[] = [];
  const ADJ_OF: Record<string, string> = { loudly: "loud", slowly: "slow", heavily: "heavy", quickly: "quick", nicely: "nice", quietly: "quiet", busily: "busy", easily: "easy", noisily: "noisy", coldly: "cold", warmly: "warm" };
  for (let i = 0; i < w.length - 1; i++) {
    // be (+ degree) + -ly at the end of the clause
    if (BE_FORMS.has(w[i].norm)) {
      let k = i + 1;
      while (k < w.length && /^(very|so|too|really|quite|a|bit|little)$/.test(w[k].norm)) k++;
      const a = w[k];
      if (a && ADJ_OF[a.norm] && (k === w.length - 1 || brokenAfter(w, k) || /^(because|so|and|but|today|now|this|in|at|for|when|that)$/.test(w[k + 1].norm)) && !verbInfo(w[k + 1]?.norm ?? "")?.form?.match(/pp|past/)) {
        out.push({ rule: "adverb-for-adjective", from: k, to: k + 1, replacement: ADJ_OF[a.norm], category: "word-choice", severity: "major", skill: "word-order", messageKo: `be동사 뒤에는 부사가 아니라 형용사가 옵니다: '${ADJ_OF[a.norm]}'.` });
      }
    }
    // worked very hardly → hard
    if (/^(work|works|worked|working|try|tries|tried|trying|study|studied|train|trained|push|pushed)$/.test(w[i].norm)) {
      let k = i + 1;
      while (k < w.length && /^(very|so|really|too)$/.test(w[k].norm)) k++;
      if (w[k]?.norm === "hardly") out.push({ rule: "hardly-hard", from: k, to: k + 1, replacement: "hard", category: "word-choice", severity: "major", skill: "word-order", messageKo: "'열심히'는 'hard'입니다. 'hardly'는 '거의 ~않다'라는 반대 뜻입니다." });
    }
    // increased sharp → sharply
    if (/^(increase|increased|increases|decrease|decreased|decreases|rise|rose|rises|fall|fell|falls|drop|dropped|drops|grow|grew|grows|change|changed|changes|improve|improved|improves)$/.test(w[i].norm) && /^(sharp|steady|sudden|gradual|significant|rapid|slight|quick|slow|dramatic)$/.test(w[i + 1].norm) && (i + 2 >= w.length || brokenAfter(w, i + 1) || PREPOSITIONS.has(w[i + 2].norm) || /^(and|but|so|after|since|last|this)$/.test(w[i + 2].norm))) {
      const adv = w[i + 1].norm === "gradual" ? "gradually" : w[i + 1].norm === "dramatic" ? "dramatically" : w[i + 1].norm === "steady" ? "steadily" : w[i + 1].norm + "ly";
      out.push({ rule: "adjective-for-adverb", from: i + 1, to: i + 2, replacement: adv, category: "word-choice", severity: "major", skill: "word-order", messageKo: `동사를 꾸밀 때는 부사를 씁니다: '${w[i].raw} ${adv}'.` });
    }
    // speak English very good / check the flow rate careful
    if (/^(speak|speaks|spoke|check|checked|explain|explained|eat|cook|cooks|cooked|play|plays|played|drive|drives|sing|sings|write|writes|handle|handled|do|did|does)$/.test(w[i].norm)) {
      let k = i + 1;
      const objStart = k;
      if (/^(the|a|an|your|our|my|this|that|it|them)$/.test(w[k]?.norm ?? "") || /^[A-Z]/.test(w[k]?.raw ?? "")) {
        k++;
        while (k < w.length && k <= objStart + 3 && !/^(very|so|really|good|well|careful|easy|bad|quick|clear|perfect)$/.test(w[k].norm) && !brokenAfter(w, k - 1)) k++;
        while (k < w.length && /^(very|so|really)$/.test(w[k].norm)) k++;
        const a = w[k];
        const ADV: Record<string, string> = { good: "well", careful: "carefully", easy: "easily", bad: "badly", quick: "quickly", clear: "clearly", perfect: "perfectly" };
        if (a && ADV[a.norm] && k > objStart + 1 && (k === w.length - 1 || brokenAfter(w, k) || /^(and|but|so|because|today|now)$/.test(w[k + 1].norm)) && !(w[i].norm === "do" || w[i].norm === "did" || w[i].norm === "does")) {
          out.push({ rule: "adjective-for-adverb", from: k, to: k + 1, replacement: ADV[a.norm], category: "word-choice", severity: "major", skill: "word-order", messageKo: `동사를 꾸밀 때는 부사를 씁니다: '${ADV[a.norm]}'.` });
        }
      }
    }
  }
  return out;
};

/** Agreement with indefinite pronouns, "people", "this pump make", "Who decide …?". */
const agreementMore: Rule = (w) => {
  const out: RuleFinding[] = [];
  const push = (k: number, fix: string, msg: string) => out.push({ rule: "agreement-more", from: k, to: k + 1, replacement: fix, category: "agreement", severity: "major", skill: "agreement", messageKo: msg });
  for (let i = 0; i < w.length - 1; i++) {
    const s = w[i].norm;
    const v = w[i + 1].norm;
    // "Anyone have any questions?" is spoken shorthand for "Does anyone have …?".
    const elliptical = /^(anyone|anybody)$/.test(s) && v === "have" && (i === 0 || brokenAfter(w, i - 1)) && !!w[w.length - 1]?.question;
    if (/^(everybody|everyone|somebody|someone|nobody|anybody|anyone|each|every)$/.test(s) && /^(are|were|have)$/.test(v) && !elliptical && !(i > 0 && /^(do|does|did|have|has|are|is|were|was|can|will)$/.test(w[i - 1].norm)))
      push(i + 1, { are: "is", were: "was", have: "has" }[v as "are"], `'${w[i].raw}'는 단수로 취급합니다: '${w[i].raw} ${{ are: "is", were: "was", have: "has" }[v as "are"]}'.`);
    if (s === "people" && /^(is|was|has)$/.test(v) && !w[i + 1].expanded)
      push(i + 1, { is: "are", was: "were", has: "have" }[v as "is"], `'people'은 복수입니다: 'people ${{ is: "are", was: "were", has: "have" }[v as "is"]}'.`);
  }
  // "This pump make a strange noise" / "This slide show three results": this/that + noun + base verb + object.
  for (let i = 0; i < w.length - 3; i++) {
    if (!/^(this|that)$/.test(w[i].norm) || (i > 0 && !brokenAfter(w, i - 1) && !/^(and|but|so|because)$/.test(w[i - 1].norm))) continue;
    const n = w[i + 1].norm;
    // The word after this/that must be a noun: not a modal, auxiliary, adverb or determiner ("That would explain …").
    if (/s$/.test(n) || verbInfo(n) || MODALS.has(n) || BE_FORMS.has(n) || DETERMINERS.has(n) || PREPOSITIONS.has(n) || /^(also|really|just|only|still|already|probably|actually|sounds|looks|seems|is|was|way|time|one|kind|sort|type|much|many|said|means)$/.test(n) || /ly$/.test(n)) continue;
    const v = w[i + 2];
    const vi = verbInfo(v.norm);
    if (!vi || vi.form !== "base" || v.norm !== vi.base || /^(be|have|do)$/.test(vi.base)) continue;
    const obj = w[i + 3].norm;
    if (!(DETERMINERS.has(obj) || /^(\d+|two|three|four|five|a|an|me|us|you|it|them)$/.test(obj) || PREPOSITIONS.has(obj))) continue;
    push(i + 2, thirdPersonOf(vi.base), `주어 '${w[i].raw} ${w[i + 1].raw}'는 3인칭 단수라서 동사에 -s를 붙입니다: '${thirdPersonOf(vi.base)}'.`);
  }
  // "Who decide the final price?"
  if (w.length > 2 && w[0].norm === "who") {
    const vi = verbInfo(w[1].norm);
    if (vi && vi.form === "base" && w[1].norm === vi.base && !/^(be|have|do)$/.test(vi.base) && (UNAMBIGUOUS_VERBS.has(vi.base) || /^(make|take|know|need|want|pay|send|run|lead|manage|own|control|decide)$/.test(vi.base))) push(1, thirdPersonOf(vi.base), `'Who'가 주어인 질문은 3인칭 단수 동사를 씁니다: 'Who ${thirdPersonOf(vi.base)} …?'.`);
  }
  // "Do your boss know …?" / "Does your kids go …?"
  for (let i = 0; i < w.length - 3; i++) {
    if (!/^(do|does)$/.test(w[i].norm) || !/^(your|my|our|his|her|their|the|this|that)$/.test(w[i + 1].norm)) continue;
    // A question starts its clause: "planning to do the pilot test" is not "Do the pilot test …?".
    if (!(i === 0 || brokenAfter(w, i - 1) || /^(so|and|but|then|also|okay|ok|well|sorry|now)$/.test(w[i - 1].norm))) continue;
    const n = w[i + 2].norm;
    const vi = verbInfo(w[i + 3].norm);
    if (!vi || vi.form !== "base" || verbInfo(n)) continue;
    const plural = /[^s]s$/.test(n) || /^(people|children|kids)$/.test(n);
    if (w[i].norm === "do" && !plural && !/^(staff|team|family|police|data)$/.test(n)) push(i, "does", `단수 주어(${w[i + 1].raw} ${w[i + 2].raw}) 의문문은 'Does'로 시작합니다.`);
    if (w[i].norm === "does" && plural && !/^(news|series|physics|class|bus|glass|business|process|address|status)$/.test(n)) push(i, "do", `복수 주어(${w[i + 1].raw} ${w[i + 2].raw}) 의문문은 'Do'로 시작합니다.`);
  }
  // "There are a lot of noise" / "there is any other points"
  for (let i = 0; i < w.length - 3; i++) {
    if (w[i].norm !== "there") continue;
    if (/^(are|were)$/.test(w[i + 1].norm) && w[i + 2].norm === "a" && w[i + 3].norm === "lot" && w[i + 4]?.norm === "of" && UNCOUNTABLE.test(w[i + 5]?.norm ?? ""))
      push(i + 1, w[i + 1].norm === "are" ? "is" : "was", `셀 수 없는 명사(${w[i + 5].raw})는 단수 취급: 'there ${w[i + 1].norm === "are" ? "is" : "was"} a lot of …'.`);
    if (/^(is|was)$/.test(w[i + 1].norm) && !w[i + 1].expanded && /^(any|some|other|more|no)$/.test(w[i + 2].norm)) {
      let j = i + 3;
      if (/^(other|more)$/.test(w[j]?.norm ?? "")) j++;
      if (singularOf(w[j]?.norm ?? "") || /^(points|questions|issues|problems|things|ideas|changes|comments|options)$/.test(w[j]?.norm ?? ""))
        push(i + 1, w[i + 1].norm === "is" ? "are" : "were", `복수 명사(${w[j].raw})가 오면 'there ${w[i + 1].norm === "is" ? "are" : "were"}'입니다.`);
    }
  }
  return out;
};

/** Word order: "Always I check", "share again the link", "like very much Indonesian food", "pick up you". */
const wordOrderMore: Rule = (w) => {
  const out: RuleFinding[] = [];
  const push = (k: number, to: number, fix: string, msg: string) => out.push({ rule: "word-order", from: k, to, replacement: fix, category: "word-order", severity: "major", skill: "word-order", messageKo: msg });
  // ("Sometimes I wonder", "Usually we meet" are fine at the start; "Always I check" is not.)
  if (w.length > 2 && /^(always|never)$/.test(w[0].norm) && /^(i|we|you|they|he|she)$/.test(w[1].norm) && verbInfo(w[2].norm)) {
    push(0, 3, `${w[1].raw} ${w[0].norm} ${w[2].raw}`, `빈도 부사(${w[0].raw})는 주어 뒤, 일반동사 앞에 둡니다: '${w[1].raw} ${w[0].norm} ${w[2].raw}'.`);
  }
  for (let i = 0; i < w.length - 3; i++) {
    const vi = verbInfo(w[i].norm);
    if (vi && /^(share|send|check|explain|show|repeat|try|do|say|play)$/.test(vi.base) && /^(again|first|also|quickly|briefly)$/.test(w[i + 1].norm) && /^(the|a|an|my|your|our|this|that)$/.test(w[i + 2].norm) && !brokenAfter(w, i + 1)) {
      push(i + 1, i + 2, "", `'${w[i + 1].raw}'는 목적어 뒤에 둡니다: '${w[i].raw} ${w[i + 2].raw} … ${w[i + 1].raw}'.`);
    }
    if (vi && /^(like|love|enjoy|want|need|appreciate)$/.test(vi.base) && w[i + 1].norm === "very" && w[i + 2].norm === "much" && w[i + 3] && !brokenAfter(w, i + 2) && !/^(to|for|and|but|so|because)$/.test(w[i + 3].norm)) {
      push(i + 1, i + 3, "", `'very much'는 목적어 뒤에 둡니다: '${w[i].raw} ${w[i + 3].raw} … very much'.`);
    }
    // Separable phrasal verb with a pronoun object: "pick up you" → "pick you up".
    if (vi && /^(pick|put|turn|give|take|set|call|bring|fill|figure|drop|hand|write|send|switch|look|try|throw|clean|back|cheer|check)$/.test(vi.base) && /^(up|off|out|on|down|back|in|over|away)$/.test(w[i + 1].norm) && /^(you|me|him|her|it|them|us)$/.test(w[i + 2].norm)) {
      if (vi.base === "look" && /^(up|out|after|into)$/.test(w[i + 1].norm) === false) continue;
      push(i, i + 3, `${w[i].raw} ${w[i + 2].raw} ${w[i + 1].raw}`, `대명사 목적어는 동사와 부사(up/off/out…) 사이에 둡니다: '${w[i].raw} ${w[i + 2].raw} ${w[i + 1].raw}'.`);
    }
  }
  // "How much discount you can offer?"
  if (w.length > 4 && w[w.length - 1].question && w[0].norm === "how" && /^(much|many)$/.test(w[1].norm) && SUBJECT_PRONOUNS.has(w[3].norm) && /^(can|could|will|would|should|do|does|did|have|has|are|is)$/.test(w[4].norm)) {
    push(3, 5, `${w[4].raw} ${w[3].raw}`, `의문문은 '조동사 + 주어' 순서입니다: 'How ${w[1].norm} ${w[2].raw} ${w[4].raw} ${w[3].raw} …?'.`);
  }
  return out;
};

/** The rest: almost + noun, the most best, would + base after "if … had p.p.", double subject, dropped object, myself, since + present, past time + present/perfect. */
const miscPatterns: Rule = (w) => {
  const out: RuleFinding[] = [];
  const push = (rule: string, k: number, to: number, fix: string, category: ErrorCategory, skill: string, msg: string) =>
    out.push({ rule, from: k, to, replacement: fix, category, severity: "major", skill, messageKo: msg });
  // "Almost companies" → "Most companies" / "Almost all companies"
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm === "almost" && (i === 0 || brokenAfter(w, i - 1)) && /[^s]s$/.test(w[i + 1].norm) && !verbInfo(w[i + 1].norm)) push("almost-noun", i, i + 1, "most", "word-choice", "degree", "'대부분의 ~'는 'most + 명사' 또는 'almost all + 명사'입니다.");
    if (w[i].norm === "most" && /^(best|worst|biggest|largest|highest|lowest|smallest|fastest|cheapest|easiest|hardest|latest|earliest|greatest)$/.test(w[i + 1].norm)) push("double-superlative", i, i + 1, "", "word-choice", "comparative", `'${w[i + 1].raw}'는 이미 최상급이라 'most'를 함께 쓰지 않습니다.`);
    if (/^(enjoy|enjoyed|enjoys)$/.test(w[i].norm) && (i === w.length - 1 || brokenAfter(w, i)) && i > 0 && SUBJECT_PRONOUNS.has(w[i - 1].norm) || (/^(enjoy|enjoyed)$/.test(w[i].norm) && i > 1 && w[i - 1].norm === "really" && SUBJECT_PRONOUNS.has(w[i - 2].norm) && (i === w.length - 1 || brokenAfter(w, i))))
      push("missing-object", i + 1, i + 1, "it", "sentence-structure", "verb-object", "'enjoy'는 목적어가 꼭 필요합니다: 'I enjoyed it.'");
    // The subject must be "I" in this clause ("I can't help me"), not "so store credit won't help me".
    const iSubject = (() => {
      for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
        if (brokenAfter(w, k)) return false;
        if (w[k].norm === "i") return true;
        if (!/^(can|could|will|would|should|must|might|may|not|do|did|does|just|really|also|always|never|to|want|wanted|tried|try|have|had|'ll)$/.test(w[k].norm)) return false;
      }
      return false;
    })();
    if (/^(introduce|enjoy|enjoyed|hurt|blame|help|explain)$/.test(w[i].norm) && w[i + 1].norm === "me" && (i >= 2 && w[i - 2].norm === "let" && w[i - 1].norm === "me" || iSubject) && (i + 2 >= w.length || brokenAfter(w, i + 1) || /^(first|briefly|again)$/.test(w[i + 2].norm)))
      push("reflexive", i + 1, i + 2, "myself", "sentence-structure", "verb-object", "주어와 목적어가 같은 사람이면 재귀대명사를 씁니다: 'myself'.");
  }
  // Double subject: "My manager he thinks"
  for (let i = 0; i < w.length - 3; i++) {
    if (!/^(my|our|your|the|their|his|her)$/.test(w[i].norm) || verbInfo(w[i + 1].norm)) continue;
    // "The more we order, the cheaper it gets": a comparative, not a subject.
    if (/^(more|less|better|worse|fewer)$/.test(w[i + 1].norm) || /er$/.test(w[i + 1].norm) && w[i].norm === "the") continue;
    let j = i + 2;
    if (!/^(he|she|it|they)$/.test(w[j].norm) && !verbInfo(w[j].norm) && /^(he|she|it|they)$/.test(w[j + 1]?.norm ?? "")) j++;
    if (!/^(he|she|it|they)$/.test(w[j]?.norm ?? "") || brokenAfter(w, j - 1)) continue;
    const vi = verbInfo(w[j + 1]?.norm ?? "");
    if (!vi || !/^(3sg|past|base)$/.test(vi.form) && !BE_FORMS.has(w[j + 1].norm)) continue;
    if (i > 0 && !brokenAfter(w, i - 1) && !/^(and|but|so|because)$/.test(w[i - 1].norm)) continue;
    push("double-subject", j, j + 1, "", "sentence-structure", "agreement", `주어 '${w.slice(i, j).map((x) => x.raw).join(" ")}' 뒤에 대명사 '${w[j].raw}'를 다시 쓰지 않습니다.`);
  }
  // "If we had known …, we would prepare" → "would have prepared"
  const ifAt = w.findIndex((t) => t.norm === "if");
  if (ifAt >= 0 && w[ifAt + 2]?.norm === "had" && verbInfo(w[ifAt + 3]?.norm ?? "")?.form === "pp" || ifAt >= 0 && w[ifAt + 2]?.norm === "had" && /ed$/.test(w[ifAt + 3]?.norm ?? "")) {
    for (let k = ifAt + 4; k < w.length - 1; k++) {
      if (/^(would|could|might)$/.test(w[k].norm) && w[k + 1].norm !== "have" && w[k + 1].norm !== "be" && verbInfo(w[k + 1].norm)?.form === "base" && !w.slice(k).some((x) => /^(now|today|still)$/.test(x.norm))) {
        push("third-conditional-would", k + 1, k + 2, `have ${participleOf(verbInfo(w[k + 1].norm)!.base)}`, "tense", "cond-3", "과거 사실의 반대(If + had p.p.)이면 결과도 'would have + 과거분사'입니다.");
        break;
      }
    }
  }
  // Present tense with a finished past time: "Last weekend I go hiking"; perfect with a finished time: "I have visited it last year".
  // ("in last week's log" is a possessive, not when something happened.)
  const pastTime = w.findIndex((t, k) => t.norm === "yesterday" || (t.norm === "last" && /^(week|weekend|month|year|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday|time)$/.test(w[k + 1]?.norm ?? "") && !/['’]s$/.test(w[k + 1]?.raw ?? "")) || (t.norm === "ago" && k > 0) || (t.norm === "in" && /^(19|20)\d\d$/.test(w[k + 1]?.norm ?? "") && Number(w[k + 1].norm) < 2026));
  if (pastTime >= 0 && !w.some((t) => /^(will|would|usually|always|every|often|normally|since|going|next|tomorrow)$/.test(t.norm))) {
    for (let k = 0; k < w.length - 1; k++) {
      if (/^(have|has)$/.test(w[k].norm) && (!w[k].expanded || /['’]ve$/i.test(w[k].raw)) && SUBJECT_PRONOUNS.has(w[k - 1]?.norm ?? "") && verbInfo(w[k + 1]?.norm ?? "")?.form?.match(/^(pp|past)$/) && w[k + 1].norm !== "to" && Math.abs(pastTime - k) < 8 && !w.slice(Math.min(k, pastTime), Math.max(k, pastTime)).some((_, m) => brokenAfter(w, Math.min(k, pastTime) + m))) {
        push("perfect-past-time", k, k + 1, "", "tense", "present-perfect", "'yesterday, last year, ~ago, in 2023'처럼 끝난 과거 시점과는 현재완료가 아니라 과거형을 씁니다.");
        break;
      }
      const vi = verbInfo(w[k].norm);
      // The verb and the past time must be in one clause: "Last weekend I go …" / "… nobody answer the phone yesterday",
      // not "Before we start, let me review what we agreed last time".
      const lo = Math.min(k, pastTime);
      const hi = Math.max(k, pastTime);
      const sameClause = hi - lo < 9 && !w.slice(lo, hi).some((t, m) => brokenAfter(w, lo + m) && lo + m !== pastTime + 1 && pastTime > k) && !w.slice(lo + 1, hi).some((t) => /^(what|that|which|who|when|before|after|if|because|let|until|while)$/.test(t.norm));
      // "We cut energy use … last year": cut/put/set are their own past forms.
      if (vi && (isSameFormParticiple(vi.base) || pastOf(vi.base) === vi.base)) continue;
      // "I see the washing conditions changed last week": a past verb in between carries the past time.
      if (k < pastTime && w.slice(k + 1, pastTime).some((x) => verbInfo(x.norm)?.form === "past")) continue;
      if (vi && sameClause && /^(base|3sg)$/.test(vi.form) && (/^(i|we|they|he|she|nobody|everyone|someone)$/.test(w[k - 1]?.norm ?? "")) && !/^(to|can|will|would|should|must|might|may|could|do|does|did|not|let)$/.test(w[k - 2]?.norm ?? "x") && !/^(be|have|do|think|hope|know|want|need|guess|believe|mean|remember|say)$/.test(vi.base)) {
        push("present-for-past", k, k + 1, verbInfo(w[k].norm)!.base === "go" ? "went" : pastOf(vi.base), "tense", "agreement", "끝난 과거의 일(yesterday, last week, ~ago)은 과거형으로 말합니다.");
        break;
      }
    }
  }
  // "I'm living in Ulsan since 2015" → "I've lived / I've been living"
  const sinceAt = w.findIndex((t, k) => t.norm === "since" && /^(\d{4}|last|then|monday|tuesday|wednesday|thursday|friday|january|february|march|april|june|july|august|september|october|november|december|yesterday|morning)$/.test(w[k + 1]?.norm ?? ""));
  if (sinceAt > 1 && !w.slice(0, sinceAt).some((t) => /^(have|has|had|been)$/.test(t.norm))) {
    // "I'm living …" (a contraction) is rewritten with its subject by sinceWithPresent.
    const be = w.findIndex((t, k) => k < sinceAt && /^(am|is|are)$/.test(t.norm) && !t.expanded && verbInfo(w[k + 1]?.norm ?? "")?.form === "ing");
    const simple = w.findIndex((t, k) => k < sinceAt && SUBJECT_PRONOUNS.has(w[k - 1]?.norm ?? "") && /^(base|3sg)$/.test(verbInfo(t.norm)?.form ?? "") && /^(live|work|know|stay|use|study|teach|run|manage|lead)$/.test(verbInfo(t.norm)!.base));
    const at = be >= 0 ? be : simple;
    if (at >= 0) push("since-present", at, at + 1, be >= 0 ? (w[at].norm === "is" ? "has been" : "have been") : `have ${participleOf(verbInfo(w[at].norm)!.base)}`, "tense", "present-perfect", "'since + 시점'(그때부터 지금까지)은 현재완료(have + p.p. / have been + ing)와 씁니다.");
  }
  // "You presented it yourself, isn't it?" → "didn't you?"
  const n = w.length;
  if (n > 4 && w[n - 1].question && w[n - 1].norm === "it" && w[n - 2].norm === "not" && /^(is|was)$/.test(w[n - 3].norm) && /^(you|i|we|they|he|she)$/.test(w[0].norm) && brokenAfter(w, n - 4)) {
    push("question-tag", n - 3, n, "", "word-order", "question-form", `부가의문문은 앞 문장의 주어·동사에 맞춥니다 (예: You presented it, didn't you?). 'isn't it'은 주어가 it일 때만 씁니다.`);
  }
  // "very danger" → "very dangerous"
  const WORD_FORM: Record<string, string> = { danger: "dangerous", success: "successful", safety: "safe", comfort: "comfortable", beauty: "beautiful", health: "healthy", luck: "lucky", stress: "stressful", tradition: "traditional", noise: "noisy", importance: "important", difference: "different", convenience: "convenient", efficiency: "efficient" };
  for (let i = 0; i < w.length - 1; i++) {
    if (/^(very|so|too|really|quite)$/.test(w[i].norm) && WORD_FORM[w[i + 1].norm]) push("word-form", i + 1, i + 2, WORD_FORM[w[i + 1].norm], "word-choice", "be-adj", `'${w[i + 1].raw}'는 명사입니다. 형용사 '${WORD_FORM[w[i + 1].norm]}'를 씁니다.`);
  }
  return out;
};
function pastOf(base: string): string {
  const pp = participleOf(base);
  const IRREG: Record<string, string> = { go: "went", see: "saw", eat: "ate", take: "took", come: "came", get: "got", give: "gave", make: "made", have: "had", buy: "bought", meet: "met", leave: "left", find: "found", tell: "told", say: "said", run: "ran", drive: "drove", swim: "swam", write: "wrote", speak: "spoke", drink: "drank", begin: "began", forget: "forgot", answer: "answered", call: "called", visit: "visited" };
  return IRREG[base] ?? pp;
}

/** Missing be: "She will back at three", "I very nervous", "The price too high". */
const missingBeMore: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (/^(will|would|can|could|should|might|may|must)$/.test(w[i].norm) && w[i + 1].norm === "back" && (i + 2 >= w.length || brokenAfter(w, i + 1) || /^(at|in|by|soon|tomorrow|later|on|after|before|from)$/.test(w[i + 2].norm)))
      out.push({ rule: "modal-adjective", from: i + 1, to: i + 1, replacement: "be", category: "be-verb", severity: "major", skill: "be-adj", messageKo: "'돌아오다'는 'will be back'입니다. back은 동사가 아닙니다." });
    if (/^(i|we|they|you|he|she)$/.test(w[i].norm) && /^(very|so|really|too|a)$/.test(w[i + 1].norm) && (i === 0 || brokenAfter(w, i - 1) || /^(and|but|so|because|sorry|today|now)$/.test(w[i - 1].norm))) {
      let k = i + 1;
      while (k < w.length && /^(very|so|really|too|a|bit|little)$/.test(w[k].norm)) k++;
      if (w[k] && /^(nervous|tired|busy|happy|sad|sorry|excited|worried|hungry|sick|late|sure|glad|afraid|ready|full|cold|hot|sleepy|stressed|lucky|proud)$/.test(w[k].norm)) {
        const be = w[i].norm === "i" ? "am" : /^(he|she)$/.test(w[i].norm) ? "is" : "are";
        out.push({ rule: "missing-be-adjective", from: i + 1, to: i + 1, replacement: be, category: "be-verb", severity: "major", skill: "be-adj", messageKo: `형용사(${w[k].raw})는 동사가 아니라서 be동사가 필요합니다: '${w[i].raw} ${be} ${w.slice(i + 1, k + 1).map((x) => x.raw).join(" ")}'.` });
      }
    }
  }
  // "The price too high for us." (a subject noun phrase straight before too/very + adjective)
  if (w.length >= 4 && /^(the|this|that|my|our|your|it)$/.test(w[0].norm)) {
    let k = w[0].norm === "it" ? 1 : 2;
    if (w[0].norm !== "it" && w[k] && !verbInfo(w[k].norm) && /^(too|very|so|really)$/.test(w[k + 1]?.norm ?? "")) k++;
    if (/^(too|very|so|really)$/.test(w[k]?.norm ?? "") && /^(high|low|expensive|cheap|big|small|late|early|hot|cold|long|short|heavy|busy|difficult|hard|far|close|slow|fast|good|bad|nice|spicy|salty|loud|noisy|tight)$/.test(w[k + 1]?.norm ?? "") && !verbInfo(w[k - 1].norm) && !w.slice(1, k).some((x) => BE_FORMS.has(x.norm))) {
      out.push({ rule: "missing-be-adjective", from: k, to: k, replacement: "is", category: "be-verb", severity: "major", skill: "be-adj", messageKo: `주어 뒤에 be동사가 필요합니다: '${w.slice(0, k).map((x) => x.raw).join(" ")} is ${w[k].raw} ${w[k + 1].raw}'.` });
    }
  }
  return out;
};

/**
 * Inverted questions and requests keep the base form: "Could you sending …?", "Can you hearing me?",
 * "Could you to repeat …?", "Would you please confirmed …?" → base form, no "to".
 */
const invertedModalForm: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (!/^(can|could|would|will|should|may|might|must|shall)$/.test(w[i].norm)) continue;
    if (!(i === 0 || brokenAfter(w, i - 1) || /^(so|and|but|then|also|please|okay|ok|sorry)$/.test(w[i - 1].norm))) continue;
    if (!SUBJECT_PRONOUNS.has(w[i + 1].norm)) continue;
    let j = i + 2;
    while (j < w.length && /^(please|kindly|just|also|still|maybe|possibly|quickly|not)$/.test(w[j].norm)) j++;
    const v = w[j];
    if (!v || brokenAfter(w, j - 1)) continue;
    if (v.norm === "to" && isBaseVerb(w[j + 1]?.norm ?? "")) {
      out.push({
        rule: "inverted-modal-form", from: j, to: j + 1, replacement: "", category: "verb-form", severity: "major", skill: "polite-request",
        messageKo: `'${w[i].raw} ${w[i + 1].raw}' 뒤에는 to 없이 동사원형이 옵니다: '${w[i].raw} ${w[i + 1].raw} ${w[j + 1].raw} …?'`,
      });
      continue;
    }
    const info = verbInfo(v.norm);
    if (!info || info.form === "base" || info.base === "be" || info.base === "have") continue;
    if (info.form === "ing" && ING_NOUNS.has(v.norm)) continue;
    if ((info.form === "pp" || info.form === "past") && isSameFormParticiple(info.base)) continue;
    out.push({
      rule: "inverted-modal-form", from: j, to: j + 1, replacement: info.base, category: "verb-form", severity: "major", skill: "polite-request",
      messageKo: `'${w[i].raw} ${w[i + 1].raw} …?' 뒤에는 동사원형이 옵니다: '${v.raw}' → '${info.base}'.`,
    });
  }
  return out;
};

/** "have to updating", "might have to changed", "need to sent": after the infinitive "to" comes the base form. */
const toInflected: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 1; i < w.length - 1; i++) {
    if (w[i].norm !== "to") continue;
    const g = w[i - 1].norm;
    if (!/^(have|has|had|need|needs|needed|want|wants|wanted|able|plan|plans|planned|try|tries|tried|decide|decided|hope|hoped|expect|expected|agree|agreed|promise|promised|manage|managed|forget|forgot|remember|ought|going|trying|planning|hoping|supposed|allowed|likely|unable|ready|asked|told)$/.test(g)) continue;
    // "going to meetings" / "going to training": motion, not the future.
    const v = w[i + 1];
    const info = verbInfo(v.norm);
    if (!info || info.form === "base" || info.base === "be") continue;
    if (info.form === "ing" && (ING_NOUNS.has(v.norm) || g === "going")) continue;
    if ((info.form === "pp" || info.form === "past") && isSameFormParticiple(info.base)) continue;
    if (info.form === "3sg" && g === "going") continue;
    out.push({
      rule: "to-inflected", from: i + 1, to: i + 2, replacement: info.base, category: "verb-form", severity: "major", skill: "purpose-to",
      messageKo: `'${g} to' 뒤에는 동사원형이 옵니다: '${v.raw}' → '${info.base}'.`,
    });
  }
  return out;
};

/** "Please opening the valve", "Please sent it" → "Please open", "Please send". */
const pleaseForm: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].norm !== "please" || brokenAfter(w, i)) continue;
    const v = w[i + 1];
    const info = verbInfo(v.norm);
    if (!info || info.form === "base" || info.base === "be") continue;
    if (info.form === "ing" && ING_NOUNS.has(v.norm)) continue;
    if ((info.form === "pp" || info.form === "past") && isSameFormParticiple(info.base)) continue;
    // "please find attached", "please note": base forms; "please, …" across a comma is not a request verb.
    out.push({
      rule: "please-form", from: i + 1, to: i + 2, replacement: info.base, category: "verb-form", severity: "major", skill: "polite-request",
      messageKo: `please 뒤에는 동사원형이 옵니다: '${v.raw}' → '${info.base}'.`,
    });
  }
  return out;
};

/** "might be differ" → "might be different" / "might differ". */
const beDiffer: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (!BE_FORMS.has(w[i].norm)) continue;
    const j = w[i + 1].norm === "not" ? i + 2 : i + 1;
    if (w[j]?.norm !== "differ") continue;
    out.push({
      rule: "be-differ", from: j, to: j + 1, replacement: "different", category: "be-verb", severity: "major", skill: "be-adj",
      messageKo: "'differ'는 동사입니다. be 뒤에는 형용사 'different'를 쓰거나, be 없이 'differ'를 씁니다: 'might be different' / 'might differ'.",
    });
  }
  return out;
};

/** "Because the higher steam flow, …" → "Because of": "because" needs a clause; before a noun phrase it is "because of". */
const becauseOf: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 2; i++) {
    if (w[i].norm !== "because" || w[i + 1].norm === "of") continue;
    if (!/^(the|a|an|this|that|these|those|our|your|their|its|his|her|my|some|bad|heavy|high|low|higher|lower)$/.test(w[i + 1].norm)) continue;
    // The noun phrase runs to the end of the clause without a verb.
    let k = i + 1;
    let verb = false;
    while (k < w.length) {
      const t = w[k];
      const info = verbInfo(t.norm);
      if (BE_FORMS.has(t.norm) || MODALS.has(t.norm) || /^(has|have|had|do|does|did|not)$/.test(t.norm) || t.expanded) verb = true;
      else if (info && (info.form === "past" || info.form === "3sg") && !/s$/.test(w[k - 1]?.norm ?? "") && k > i + 1) verb = true;
      else if (info && info.form === "base" && k > i + 2 && /s$/.test(w[k - 1].norm) && !/ss$/.test(w[k - 1].norm)) verb = true; // "because the pumps leak"
      else if (info && info.form === "pp" && /ed$/.test(t.norm) && k > i + 2) verb = true;
      else if (!info && /^[a-z]{3,}ed$/.test(t.norm) && k > i + 2) verb = true; // "because the power supply tripped"
      if (verb || brokenAfter(w, k)) break;
      k++;
    }
    if (verb || k - i < 2 || k - i > 6) continue;
    out.push({
      rule: "because-of", from: i + 1, to: i + 1, replacement: "of", category: "preposition", severity: "major", skill: "cause-effect",
      messageKo: "because 뒤에는 '주어 + 동사'가 옵니다. 명사만 올 때는 'because of + 명사'입니다: 'because of the higher steam flow'.",
    });
  }
  return out;
};

/** "I think is too early" → "I think it is": a clause after think/hope/guess needs its own subject. */
const thinkMissingIt: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let k = 1; k < w.length - 1; k++) {
    if (!/^(think|hope|guess|believe|feel|suppose|bet)$/.test(w[k].norm)) continue;
    if (!/^(i|we|you|they)$/.test(w[k - 1].norm)) continue;
    // "What I think is …", "All I know is …": the clause is the subject itself.
    const before = w[k - 2]?.norm ?? "";
    if (k >= 2 && !brokenAfter(w, k - 2) && !/^(and|but|so|because|actually|honestly|well|also|really|just|still|personally|yes|yeah|no|oh|um|anyway|now)$/.test(before)) continue;
    const next = w[k + 1];
    if (brokenAfter(w, k) || next.expanded) continue;
    if (!/^(is|was|will|would|can|could|might|may|should|seems|looks|sounds|makes|needs|works)$/.test(next.norm)) continue;
    out.push({
      rule: "think-missing-it", from: k + 1, to: k + 1, replacement: "it", category: "sentence-structure", severity: "major", skill: "opinion",
      messageKo: `'${w[k - 1].raw} ${w[k].raw}' 뒤의 문장에도 주어가 필요합니다: '${w[k - 1].raw} ${w[k].raw} it ${next.raw} …'.`,
    });
  }
  return out;
};

/* ───────────── Everyday slips from the learner corpus (wave 2) ───────────── */

const SOUND_COMPLEMENT = /^(great|good|nice|interesting|fine|perfect|amazing|fun|lovely|wonderful|exciting|awesome|terrible|bad|strange|weird|easy|difficult|hard|reasonable|fair|right|wrong|familiar|delicious|like)$/;
const HOBBY_VERBS = /^(play|watch|read|cook|travel|swim|run|hike|listen|draw|sing|dance|fish|ride|bake|collect|take|go|walk|climb|camp|write|paint|jog|make|learn|study|visit|try|grow|build|fix)$/;
const TIME_PHRASE_AFTER = /^(next|day|week|month|year|morning|afternoon|evening|night|weekend|same|following|rest|whole|first|last)$/;
const PURPOSE_VERBS = /^(check|confirm|discuss|ask|get|make|see|find|send|explain|share|review|inform|tell|request|arrange|book|reserve|order|pick|collect|meet|visit|thank|introduce|update|report|clarify|solve|fix|repair|replace|install|change|cancel|reschedule|postpone|buy|return|exchange|pay|follow|prepare|show|give|take|bring|deliver|submit|sign|apply)$/;
const OBJECT_START = (n: string) => /^(the|a|an|our|your|my|their|his|her|its|this|that|these|those|some|any|it|them|me|us|him|you)$/.test(n);
const MEASURE_NOUNS = /^(level|quality|temperature|pressure|number|amount|cost|price|rate|value|concentration|flow|performance|capacity|efficiency|yield|size|weight|speed|content|density|viscosity|purity|output|consumption|demand|total|average|result)$/;
const ONE_VERBS = /^(use|need|work|look|run|cost|take|have|make|seem|go|come|show|give|get|consume|produce|require|include|weigh|last|fit|hold|sell|feel|taste|smell|sound|break|stop|start|open|close|save|cause)$/;
const DEVICE_NOUNS = /^(camera|phone|laptop|mic|microphone|computer|printer|screen|monitor|sensor|pump|machine|system|card|key|elevator|lift|ac|wifi|wi-fi|internet|connection|link|app|software|headset|speaker|projector|charger|battery|light|heater|shower|toilet|door|lock|button|remote|keyboard|mouse|valve|meter|scale|website|site|server|vpn|audio|video|sound)$/;

const everydaySlips: Rule = (w) => {
  const out: RuleFinding[] = [];
  const push = (f: Omit<RuleFinding, "skill"> & { skill?: string }) => out.push({ skill: "agreement", ...f });
  for (let i = 0; i < w.length; i++) {
    const t = w[i].norm;
    const n1 = w[i + 1]?.norm ?? "";
    const n2 = w[i + 2]?.norm ?? "";
    const brk = (k: number) => k >= w.length - 1 || brokenAfter(w, k);

    // "That's sound great" → "That sounds great" ("That's sound advice" is fine).
    if (t === "is" && w[i].expanded && i > 0 && /^(that|it|this)$/.test(w[i - 1].norm) && n1 === "sound" && SOUND_COMPLEMENT.test(n2) && !brk(i + 1)) {
      const subj = w[i - 1].raw.replace(/['’]s$/i, "");
      push({
        rule: "be-sound", from: i - 1, to: i + 2, replacement: `${subj} sounds`, category: "verb-form", severity: "major", skill: "agreement",
        messageKo: `'~하게 들린다'는 동사 sound에 -s를 붙입니다: '${subj} sounds ${w[i + 2].raw}'. ('That's'와 'sound'를 함께 쓰지 않습니다.)`,
      });
      continue;
    }

    // "My hobby is play golf" → "playing golf" (a verb with an object or adverb after it).
    if ((t === "hobby" && n1 === "is") || (t === "hobbies" && n1 === "are")) {
      const v = w[i + 2];
      if (v && HOBBY_VERBS.test(v.norm) && (UNAMBIGUOUS_VERBS.has(v.norm) || !brk(i + 2))) {
        push({
          rule: "hobby-ing", from: i + 2, to: i + 3, replacement: ingOf(v.norm), category: "verb-form", severity: "major", skill: "prep-gerund",
          messageKo: `'취미는 ~하는 것이다'는 동명사입니다: 'My hobby is ${ingOf(v.norm)}…'.`,
        });
      }
      continue;
    }

    // "I really enjoyed. Thank you." → "enjoyed it": enjoy always takes an object.
    if (/^(enjoy|enjoyed|enjoys)$/.test(t) && brk(i) && i > 0) {
      let s = i - 1;
      while (s > 0 && /^(really|so|truly|very|much|also|all|both|just|certainly|definitely)$/.test(w[s].norm)) s--;
      if (SUBJECT_PRONOUNS.has(w[s].norm) || /^(did|do|does|will|would)$/.test(w[s].norm)) {
        push({
          rule: "enjoy-object", from: i, to: i + 1, replacement: `${w[i].raw} it`, category: "sentence-structure", severity: "major", skill: "agreement",
          messageKo: "enjoy는 목적어가 꼭 필요합니다: 'I enjoyed it.' / 'I really enjoyed the dinner.'",
        });
      }
      continue;
    }

    // "How many time did you …" → "times".
    if (t === "many" && n1 === "time" && !w[i + 1].expanded) {
      push({
        rule: "many-times", from: i + 1, to: i + 2, replacement: "times", category: "countability", severity: "minor", skill: "countability",
        messageKo: "'몇 번'은 'how many times'입니다(횟수의 time은 셀 수 있는 명사).",
      });
      continue;
    }

    // "Have you ever eat …?" → "eaten": a question or "had we" puts the subject between have and the participle.
    if (/^(have|has|had)$/.test(t) && /^(you|we|they|i|he|she|it)$/.test(n1) && (i === 0 || brokenAfter(w, i - 1) || /^(why|how|what|where|when|who|so|and|but|or)$/.test(w[i - 1].norm))) {
      let j = i + 2;
      while (j < w.length && /^(ever|never|already|just|really|all|both|also|recently)$/.test(w[j].norm)) j++;
      const v = w[j];
      const vi = v ? verbInfo(v.norm) : null;
      if (v && vi && vi.form === "base" && v.norm === vi.base && (UNAMBIGUOUS_VERBS.has(v.norm) || (j > i + 2 && OBJECT_START(w[j + 1]?.norm ?? "")) || OBJECT_START(w[j + 1]?.norm ?? ""))) {
        const pp = participleOf(v.norm);
        if (pp !== v.norm && !/^(to|got)$/.test(w[j + 1]?.norm ?? "")) {
          push({
            rule: "perfect-base-verb", from: j, to: j + 1, replacement: pp, category: "verb-form", severity: "major", skill: "present-perfect",
            messageKo: `완료형은 'have/has + 과거분사'입니다: '${v.raw}' → '${pp}'.`,
          });
        }
      }
      continue;
    }

    // "It is always crowded in weekends" → "on weekends".
    if (t === "in" && n1 === "weekends") {
      push({
        rule: "time-preposition", from: i, to: i + 1, replacement: "on", category: "preposition", severity: "minor", skill: "verb-prep",
        messageKo: "'주말마다'는 'on weekends' (또는 at the weekend)입니다.",
      });
      continue;
    }

    // "I'm calling for check the delivery date" → "to check": purpose is to + verb.
    if (t === "for" && PURPOSE_VERBS.test(n1) && !w[i + 1].expanded && OBJECT_START(n2) && !brk(i + 1)) {
      const before = w.slice(Math.max(0, i - 3), i).map((x) => x.norm);
      const timePhrase = /^(the|this|that|next|last)$/.test(n2) && TIME_PHRASE_AFTER.test(w[i + 3]?.norm ?? "");
      const vi = verbInfo(n1);
      if (!timePhrase && vi && vi.form === "base" && !before.some((x) => /^(thank|thanks|sorry|apologize|apologise|apologies|excuse|forgive|blame|grateful|thankful|ready|time|responsible|reason|need|chance|way)$/.test(x))) {
        push({
          rule: "for-purpose", from: i, to: i + 1, replacement: "to", category: "verb-form", severity: "major", skill: "prep-gerund",
          messageKo: `'~하려고'(목적)는 'to + 동사원형'입니다: 'to ${w[i + 1].raw} …'. 'for' 뒤에는 동사원형이 올 수 없습니다.`,
        });
      }
      continue;
    }

    // "The operator forgot closing the valve" → "forgot to close": a duty that was not done.
    if (/^(forgot|forget|forgets)$/.test(t) && !w[i + 1]?.expanded) {
      const v = w[i + 1];
      const vi = v ? verbInfo(v.norm) : null;
      const before = w.slice(Math.max(0, i - 3), i).map((x) => x.norm);
      if (v && vi && vi.form === "ing" && !ING_NOUNS.has(v.norm) && OBJECT_START(n2) && !before.some((x) => /^(never|not|can|cannot|could|will|won|ever)$/.test(x))) {
        push({
          rule: "forget-to", from: i + 1, to: i + 2, replacement: `to ${vi.base}`, category: "verb-form", severity: "major", skill: "prep-gerund",
          messageKo: `해야 할 일을 잊었다면 'forget to + 동사원형'입니다: '${w[i].raw} to ${vi.base}'. ('forget + -ing'는 '전에 한 일을 잊다'라는 뜻입니다.)`,
        });
      }
      continue;
    }

    // "the moisture level of the last batch were higher" → "was": the head noun before "of" decides.
    // "the moisture level of …": one modifier noun may come before the measure noun.
    const ofAt = MEASURE_NOUNS.test(n1) && n2 === "of" ? i + 2 : /^[a-z]+$/.test(n1) && !verbInfo(n1) && !DETERMINERS.has(n1) && MEASURE_NOUNS.test(n2) && w[i + 3]?.norm === "of" ? i + 3 : -1;
    // The phrase must start a clause: "…, and the level of …" does, "A and the level of B are" (two subjects) does not.
    const clauseStart = i === 0 || brokenAfter(w, i - 1) || /^(that|but|so|because|if|when|found|showed|shows|think|believe|said|says)$/.test(w[i - 1].norm) || (w[i - 1].norm === "and" && i >= 2 && brokenAfter(w, i - 2));
    if (t === "the" && ofAt > 0 && clauseStart) {
      for (let k = ofAt + 1; k < Math.min(w.length, ofAt + 9); k++) {
        const x = w[k].norm;
        if (brk(k - 1) && k > ofAt + 1) break;
        if (/^(and|or|that|which|who|where|when|with)$/.test(x)) break;
        if (x === "were" || x === "are") {
          push({
            rule: "of-agreement", from: k, to: k + 1, replacement: x === "were" ? "was" : "is", category: "agreement", severity: "major", skill: "agreement",
            messageKo: `주어는 '${w.slice(i, ofAt).map((y) => y.raw).join(" ")}'(단수)입니다. 'of …' 뒤의 복수 명사에 맞추지 않습니다: '${x === "were" ? "was" : "is"}'.`,
          });
          break;
        }
        const ki = verbInfo(x);
        if (ki && ki.form !== "base" && !/^(ing|pp)$/.test(ki.form)) break;
        if (/^(is|was|has|have|had|will|would|can|could|should|may|might|must|do|does|did)$/.test(x)) break;
      }
      continue;
    }

    // "The safety is our first priority" → "Safety is": safety in general takes no article.
    if (t === "the" && n1 === "safety" && (i === 0 || brokenAfter(w, i - 1)) && /^(is|was|comes|must|should|will|always)$/.test(n2)) {
      push({
        rule: "extra-article", from: i, to: i + 1, replacement: "", category: "article", severity: "minor", skill: "articles",
        messageKo: "일반적인 '안전'은 관사 없이 'Safety is …'라고 합니다.",
      });
      continue;
    }

    // "the new one use thirty percent less water" → "uses".
    if (t === "one" && i > 0) {
      let d = i - 1;
      if (/^(new|old|other|first|second|last|big|small|bigger|smaller|cheaper|larger|blue|red|black|white|green|left|right|current|existing|original|second-hand|used)$/.test(w[d].norm) && d > 0) d--;
      const det = w[d].norm;
      const clauseStart = d === 0 || brokenAfter(w, d - 1) || /^(and|but|so|because|while|although|since|if|when)$/.test(w[d - 1].norm);
      const v = w[i + 1];
      if (/^(the|this|that)$/.test(det) && clauseStart && v && ONE_VERBS.test(v.norm) && verbInfo(v.norm)?.form === "base" && !v.expanded && !brk(i)) {
        const fix = thirdPersonOf(v.norm);
        push({
          rule: "one-agreement", from: i + 1, to: i + 2, replacement: fix, category: "agreement", severity: "major", skill: "agreement",
          messageKo: `'${w.slice(d, i + 1).map((x) => x.raw).join(" ")}'은 단수 주어라서 동사에 -s를 붙입니다: '${fix}'.`,
        });
      }
      continue;
    }

    // "in the basement of building" → "of the building".
    if (t === "of" && n1 === "building" && brk(i + 1) && !w[i + 1].expanded) {
      push({
        rule: "missing-article", from: i + 1, to: i + 1, replacement: "the", category: "article", severity: "minor", skill: "articles",
        messageKo: "셀 수 있는 명사 building 앞에는 관사가 필요합니다: 'of the building'.",
      });
      continue;
    }

    // "My camera is not work." / "The sensor is not need calibration." → "doesn't work" / "doesn't need".
    if (/^(is|was)$/.test(t) && i > 0 && DEVICE_NOUNS.test(w[i - 1].norm) && w.slice(i + 1, i + 3).some((x) => x.norm === "not")) {
      let j = i + 1;
      while (j < w.length && /^(still|really|just|also)$/.test(w[j].norm)) j++;
      const v = w[j]?.norm === "not" ? w[j + 1] : undefined;
      const verbHere = v && (v.norm === "work" ? brk(j + 1) || /^(at|with|on|anymore|properly|well|now|again|today)$/.test(w[j + 2]?.norm ?? "") : (/^(need|include|require|contain|support|fit|match|charge|connect|respond|load|start|turn)$/.test(v.norm) && !brk(j + 1)) || (/^(open|close|lock|unlock|accept|read|print|show|display|play|recognize|detect)$/.test(v.norm) && OBJECT_START(w[j + 2]?.norm ?? "")));
      if (verbHere && !v.expanded) {
        const past = /^was/.test(t);
        const fix = `${past ? "did" : "does"} not ${v.norm}`;
        push({
          rule: "be-base-verb", from: i, to: j + 2, replacement: fix, category: "verb-form", severity: "major", skill: "agreement",
          messageKo: `be동사와 일반동사를 함께 쓸 수 없습니다. '${w.slice(i, j + 2).map((x) => x.raw).join(" ")}' → '${fix}' (또는 'isn't working').`,
        });
      }
      continue;
    }

    // "first thing in morning", "in afternoon" → "in the morning".
    // ("in morning meetings" uses morning as a modifier and is fine.)
    if (t === "in" && /^(morning|afternoon|evening)$/.test(n1) && !w[i + 1].expanded && (brk(i + 1) || /^(and|so|but|because|before|after|when|then|i|we|you|they|he|she|it|too|instead)$/.test(n2))) {
      push({
        rule: "missing-article", from: i + 1, to: i + 1, replacement: "the", category: "article", severity: "minor", skill: "articles",
        messageKo: `'오전/오후/저녁에'는 'in the ${w[i + 1].raw}'입니다.`,
      });
      continue;
    }

    // "It's on way" → "on the way"; "the hottest days of year" → "of the year".
    if ((t === "on" && n1 === "way") || (t === "of" && /^(year|month)$/.test(n1) && brk(i + 1) && /^(end|rest|time|days|day|start|beginning|middle|half)$/.test(w[i - 1]?.norm ?? ""))) {
      push({
        rule: "missing-article", from: i + 1, to: i + 1, replacement: "the", category: "article", severity: "minor", skill: "articles",
        messageKo: t === "on" ? "'가는 길에'는 'on the way' (또는 on my way)입니다." : `'${w[i - 1].raw} of the ${w[i + 1].raw}'처럼 the가 필요합니다.`,
      });
      continue;
    }

    // "a clinic that take walk-ins" → "takes": a singular noun before who/that/which decides the verb.
    if (/^(a|an|one|each|every)$/.test(t) && i + 3 < w.length) {
      let k = i + 1;
      while (k < i + 3 && k < w.length && !/^(that|who|which)$/.test(w[k + 1]?.norm ?? "") && /^[a-z]+$/.test(w[k].norm) && !verbInfo(w[k].norm)) k++;
      const noun = w[k];
      const rel = w[k + 1];
      const v = w[k + 2];
      const vi = v ? verbInfo(v.norm) : null;
      if (noun && rel && /^(that|who|which)$/.test(rel.norm) && !noun.norm.endsWith("s") && !/^(people|staff|police|data|media|crew|team|couple|family)$/.test(noun.norm) && v && vi && vi.form === "base" && v.norm === vi.base && !MODALS.has(v.norm) && !brokenAfter(w, k) && !/^(i|you|we|they|he|she|it)$/.test(v.norm)) {
        const fix = thirdPersonOf(v.norm);
        if (fix !== v.norm) {
          push({
            rule: "relative-agreement", from: k + 2, to: k + 3, replacement: fix, category: "agreement", severity: "major", skill: "agreement",
            messageKo: `'${noun.raw}'(단수)를 꾸미는 ${rel.raw}절의 동사에는 -s를 붙입니다: '${rel.raw} ${fix}'.`,
          });
        }
      }
    }

    // "reduce size of the dryer" → "the size of": a measured quantity of something takes "the".
    if (/^(size|level|cost|price|quality|temperature|pressure|capacity|efficiency|amount|speed|weight|length|width|height|volume|concentration|performance|output|yield|number)$/.test(t) && n1 === "of" && i > 0 && !w[i].expanded && !brokenAfter(w, i - 1)) {
      const prev = w[i - 1].norm;
      const pv = verbInfo(prev);
      // "the design pressure of", "the contact number of": a noun before it that has its own determiner.
      const modifier = i > 1 && (DETERMINERS.has(w[i - 2].norm) || /^(the|a|an|its|whose)$/.test(w[i - 2].norm) || !!w[i - 2].num);
      if (!modifier && ((pv && pv.base !== "be" && !/^(have|has|had|do|does|did)$/.test(prev) && !DETERMINERS.has(prev)) || /^(to|for|about|with)$/.test(prev))) {
        push({
          rule: "missing-article", from: i, to: i, replacement: "the", category: "article", severity: "minor", skill: "articles",
          messageKo: `'~의 ${w[i].raw}'처럼 정해진 대상의 크기·양을 말할 때는 'the ${w[i].raw} of …'입니다.`,
        });
      }
    }

    // "after the meeting finish" → "finishes": a singular subject in a when/after/if clause.
    if (/^(after|before|until|when|once|if|because|since|unless)$/.test(t) && /^(the|this|that|our|my|your|their|his|her)$/.test(n1) && COUNTABLE_NOUNS.has(n2) && w[i + 3]) {
      const v = w[i + 3];
      const vi = verbInfo(v.norm);
      if (vi && vi.form === "base" && v.norm === vi.base && /^(start|finish|end|begin|arrive|leave|work|run|need|take|look|seem|cost|go|come|happen|change|stop|close|open|fail|break|get|become|show|include|require|depend|exceed|reach|drop|rise|increase|decrease|want|know|say|agree|approve|send|reply|call)$/.test(v.norm) && !/^(time|date|point|button|line|level|up|off|to)$/.test(w[i + 4]?.norm ?? "") && !v.expanded) {
        const fix = thirdPersonOf(v.norm);
        push({
          rule: "clause-agreement", from: i + 3, to: i + 4, replacement: fix, category: "agreement", severity: "major", skill: "agreement",
          messageKo: `'${w[i + 1].raw} ${w[i + 2].raw}'는 단수 주어라서 동사에 -s를 붙입니다: '${fix}'.`,
        });
      }
    }

    // "I'll go back to previous one" → "the previous one"; "at same time" → "at the same time".
    if (/^(previous|same|following)$/.test(t) && /^(one|slide|page|meeting|version|step|point|question|section|item|chart|time|day|thing|way|problem|issue|place|result|size|level|price|team|project|reason|year|month|week|email|report|graph|table|figure)$/.test(n1)) {
      const prev = w[i - 1]?.norm ?? "";
      if (i > 0 && !DETERMINERS.has(prev) && !/^(the|a|an|this|that|my|our|your|their|his|her|its|same|very)$/.test(prev) && !brokenAfter(w, i - 1)) {
        push({
          rule: "missing-article", from: i, to: i, replacement: "the", category: "article", severity: "minor", skill: "articles",
          messageKo: `'${w[i].raw}'는 정해진 하나를 가리키므로 'the ${w[i].raw} ${w[i + 1].raw}'입니다.`,
        });
      }
    }

    // "If there are any questions, I'd be glad to answer it." → "them".
    if (t === "answer" && n1 === "it" && brk(i + 1) && w.slice(0, i).some((x) => x.norm === "questions")) {
      push({
        rule: "pronoun-agreement", from: i + 1, to: i + 2, replacement: "them", category: "agreement", severity: "minor", skill: "agreement",
        messageKo: "앞의 'questions'(복수)를 가리키므로 'them'입니다.",
      });
    }

    // "It has been really long time" → "a really long time"; "for long time" → "for a long time".
    if (/^(been|for|in|such|quite|took|takes|take)$/.test(t)) {
      let j = i + 1;
      if (/^(really|very|so|pretty)$/.test(w[j]?.norm ?? "")) j++;
      if (w[j]?.norm === "long" && w[j + 1]?.norm === "time") {
        push({
          rule: "missing-article", from: i + 1, to: i + 1, replacement: "a", category: "article", severity: "minor", skill: "articles",
          messageKo: "'오랜 시간'은 'a long time'입니다(예: for a long time, It's been a long time).",
        });
      }
    }

    // "accept 10% increase" → "a 10% increase".
    if (/^(accept|offer|give|get|got|see|saw|seen|expect|propose|request|want|need|consider|approve|apply|announce|achieve|show|showed|shows|offered|accepted|expected|proposed|requested|approved|announced|achieved)$/.test(t) && /^\d+(\.\d+)?$/.test(n1)) {
      let j = i + 2;
      if (w[j]?.norm === "percent") j++;
      if (/^(increase|decrease|discount|reduction|rise|drop|cut|improvement|raise|increment|delay|extension|price)$/.test(w[j]?.norm ?? "")) {
        const an = /^8/.test(n1) || /^(11|18)$/.test(n1);
        push({
          rule: "missing-article", from: i + 1, to: i + 1, replacement: an ? "an" : "a", category: "article", severity: "minor", skill: "articles",
          messageKo: `'${w[j].raw}'는 셀 수 있는 명사라서 '${an ? "an" : "a"} ${w[i + 1].raw}% ${w[j].raw}'처럼 관사가 필요합니다.`,
        });
      }
    }

    // "How about put it in an appendix?" → "putting": after "how about" comes a noun or V-ing.
    if (t === "how" && n1 === "about" && w[i + 2]) {
      const v = w[i + 2];
      const vi = verbInfo(v.norm);
      if (vi && vi.base === v.norm && !ING_NOUNS.has(v.norm) && !COUNTABLE_NOUNS.has(v.norm) && (UNAMBIGUOUS_VERBS.has(v.norm) || OBJECT_START(w[i + 3]?.norm ?? "") || /^(it|them)$/.test(w[i + 3]?.norm ?? ""))) {
        push({
          rule: "how-about-ing", from: i + 2, to: i + 3, replacement: ingOf(v.norm), category: "verb-form", severity: "major", skill: "prep-gerund",
          messageKo: `'How about' 뒤에는 동사ing가 옵니다: 'How about ${ingOf(v.norm)} …?'`,
        });
      }
      continue;
    }

    // "If not, Friday morning also fine." → "Friday morning is also fine": a day or time with no verb in its clause.
    if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|morning|afternoon|evening|weekend)$/.test(t) && !brk(i)) {
      let j = i + 1;
      while (j < w.length && /^(also|too|still|really)$/.test(w[j].norm) && !brk(j - 1)) j++;
      const adj = w[j];
      const endsHere = adj && (j === w.length - 1 || brokenAfter(w, j) || (w[j + 1]?.norm === "for" && /^(me|you|us|them|everyone|both)$/.test(w[j + 2]?.norm ?? "")));
      let c = i;
      while (c > 0 && !brokenAfter(w, c - 1)) c--;
      // Any verb or preposition before it ("see you Friday morning okay", "on Friday …") means another structure.
      const clauseHasVerb = w.slice(c, i).some((x) => BE_FORMS.has(x.norm) || MODALS.has(x.norm) || x.expanded || PREPOSITIONS.has(x.norm) || /^(do|does|did|have|has|had|if|when)$/.test(x.norm) || !!verbInfo(x.norm));
      if (adj && endsHere && j > i && /^(fine|okay|ok|good|great|available|possible|free|better|perfect|busy)$/.test(adj.norm) && !clauseHasVerb) {
        push({
          rule: "missing-be-adjective", from: i + 1, to: i + 1, replacement: "is", category: "be-verb", severity: "major", skill: "be-adj",
          messageKo: `형용사 '${adj.raw}' 앞에 be동사가 필요합니다: '${w.slice(c, i + 1).map((x) => x.raw).join(" ")} is ${w.slice(i + 1, j + 1).map((x) => x.raw).join(" ")}'.`,
        });
      }
    }

    // "my friend birthday" → "my friend's birthday": people and what belongs to them ("my company car" is a compound).
    if (/^(friend|mother|father|mom|dad|mum|brother|sister|wife|husband|son|daughter|cousin|uncle|aunt|grandmother|grandfather|boss|colleague|coworker|neighbor|neighbour|roommate|girlfriend|boyfriend)$/.test(t) && !brk(i) && i > 0 && /^(my|your|our|his|her|their|a|the)$/.test(w[i - 1].norm) && !/['’]s?$/.test(w[i].raw) && /^(birthday|wedding|house|home|car|name|phone|number|idea|party|office|desk|family|kids|children|parents|dog|cat|place|room|email|bag|laptop|son|daughter|husband|wife)$/.test(n1) && !w[i + 1].expanded) {
      push({
        rule: "missing-possessive", from: i, to: i + 1, replacement: `${w[i].raw}'s`, category: "word-order", severity: "minor", skill: "articles",
        messageKo: `'~의'(소유)는 'X's Y'입니다: '${w[i].raw}'s ${w[i + 1].raw}'.`,
      });
    }

    // "My battery is almost die" → "is almost dead".
    if (BE_FORMS.has(t) && n1 === "almost" && n2 === "die") {
      push({
        rule: "be-adjective", from: i + 2, to: i + 3, replacement: "dead", category: "verb-form", severity: "major", skill: "be-adj",
        messageKo: "'(배터리가) 거의 다 됐다'는 'is almost dead'입니다. be동사 뒤에 동사원형 die를 쓰지 않습니다.",
      });
      continue;
    }
  }
  return out;
};

/** "I'm living in Ulsan since 2015" → "I've been living": a present tense with "since + a point in time". */
const SINCE_PRESENT_PP: Record<string, string> = {
  live: "lived", work: "worked", know: "known", stay: "stayed", teach: "taught", study: "studied", use: "used", own: "owned", manage: "managed", lead: "led",
};
const sinceWithPresent: Rule = (w) => {
  const out: RuleFinding[] = [];
  const s = w.findIndex((t, k) => t.norm === "since" && /^(last|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{4}|childhood|then)$/.test(w[k + 1]?.norm ?? ""));
  if (s < 0) return out;
  const before = w.slice(0, s);
  // Already perfect ("have lived", "has been") or past: nothing to say. "have" as the main verb ("I have a fever") is checked below.
  const participle = (x: string) => /(ed|en|wn|ne)$/.test(x) || verbInfo(x)?.form === "pp" || (verbInfo(x)?.form === "past" && participleOf(verbInfo(x)!.base) === x);
  const perfect = before.some((t, k) => /^(have|has|had)$/.test(t.norm) && (/^(been|not|already|just|always|never)$/.test(before[k + 1]?.norm ?? "") || participle(before[k + 1]?.norm ?? "")));
  if (perfect || before.some((t) => /^(been|was|were|did|ago)$/.test(t.norm) || t.breakAfter)) return out;
  // "My throat is sore since yesterday" → "has been sore": a noun subject with be + an adjective.
  const beAt = before.findIndex((t) => /^(is|are|am)$/.test(t.norm) && !t.expanded);
  if (beAt > 0 && !SUBJECT_PRONOUNS.has(before[beAt - 1].norm) && before.slice(beAt + 1).every((x) => !verbInfo(x.norm)) && before.slice(beAt + 1).length <= 3) {
    const fix = before[beAt].norm === "are" ? "have been" : "has been";
    out.push({
      rule: "since-present", from: beAt, to: beAt + 1, replacement: fix, category: "tense", severity: "major", skill: "present-perfect",
      messageKo: `'since + 시점'(그때부터 지금까지)은 현재완료입니다: '${fix} …'.`,
    });
    return out;
  }
  for (let i = 0; i < before.length - 1; i++) {
    const subj = before[i].norm;
    if (!/^(i|we|you|they|he|she)$/.test(subj)) continue;
    const third = /^(he|she)$/.test(subj);
    const be = before[i + 1];
    const v = before[i + 2];
    // "I am living …": progressive after a personal subject.
    // The subject and its "'m/'re/'s" share one written word, so the correction rewrites both.
    const subjText = before[i].raw.replace(/['’](m|re|s)$/i, "");
    if (/^(am|is|are)$/.test(be.norm) && v && /^[a-z]{3,}ing$/.test(v.norm) && !ING_NOUNS.has(v.norm)) {
      const fix = `${third ? "has" : "have"} been`;
      out.push({
        rule: "since-present", from: i, to: i + 2, replacement: `${subjText} ${fix}`, category: "tense", severity: "major", skill: "present-perfect",
        messageKo: `'since + 시점'(그때부터 지금까지 계속)은 현재완료진행형입니다: '${subjText} ${fix} ${v.raw}'.`,
      });
      break;
    }
    // "I have a sore throat since Sunday" → "I've had" ("have" with an object, not "have lived").
    if (/^(have|has)$/.test(be.norm) && !be.expanded && /^(a|an|the|my|some|no|any|this|that|bad|terrible|high|slight)$/.test(before[i + 2]?.norm ?? "") && before.slice(i + 2).every((x) => !verbInfo(x.norm) || x.norm === "sore")) {
      const fix = `${be.norm} had`;
      out.push({
        rule: "since-present", from: i + 1, to: i + 2, replacement: fix, category: "tense", severity: "major", skill: "present-perfect",
        messageKo: `'since + 시점'(그때부터 지금까지)은 현재완료입니다: '${before[i].raw} ${fix} …'.`,
      });
      break;
    }
    // "I live here since 2015" → "I've lived".
    const base = be.norm.replace(/(ies)$/, "y").replace(/(ches)$/, "ch").replace(/s$/, "");
    if (SINCE_PRESENT_PP[be.norm] || (be.norm.endsWith("s") && SINCE_PRESENT_PP[base])) {
      const fix = `${third ? "has" : "have"} ${SINCE_PRESENT_PP[be.norm] ?? SINCE_PRESENT_PP[base]}`;
      out.push({
        rule: "since-present", from: i + 1, to: i + 2, replacement: fix, category: "tense", severity: "major", skill: "present-perfect",
        messageKo: `'since + 시점'(그때부터 지금까지)은 현재완료입니다: '${before[i].raw} ${fix}'.`,
      });
      break;
    }
  }
  return out;
};

/** "a 18 percent increase" → "an 18": numbers read with a vowel sound (8, 11, 18, 80 …) take "an". */
const articleBeforeNumber: Rule = (w) => {
  const out: RuleFinding[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i].norm;
    if (a !== "a" && a !== "an") continue;
    const n = w[i + 1].norm;
    const m = /^(\d+)/.exec(n);
    if (!m || (w[i].raw === "A" && i > 0)) continue;
    const d = m[1];
    // eight…, eleven, eighteen (and eleven/eighteen hundred/thousand) begin with a vowel sound.
    const vowel = /^8/.test(d) || /^(11|18)$/.test(d) || /^(11|18)\d{2}$/.test(d) || /^(11|18)\d{3}$/.test(d);
    if (a === "a" && vowel) {
      out.push({ rule: "article-an", from: i, to: i + 1, replacement: "an", category: "article", severity: "minor", skill: "articles", messageKo: `'${w[i + 1].raw}'은 모음 소리(eight, eleven, eighteen …)로 읽으므로 'an'을 씁니다.` });
    } else if (a === "an" && !vowel) {
      out.push({ rule: "article-a", from: i, to: i + 1, replacement: "a", category: "article", severity: "minor", skill: "articles", messageKo: `'${w[i + 1].raw}'은 자음 소리로 읽으므로 'a'를 씁니다.` });
    }
  }
  return out;
};

/* ───────────── Basic forms after modals, do, be and have (wave 2, from the robustness passes) ───────────── */

const SUBJ = /^(i|you|we|they|he|she|it)$/;
const LABEL_NOUN = /^(room|floor|gate|line|bus|number|page|platform|exit|terminal|seat|row|bay|track)s?$/;
const COMMON_NOUNS = new Set([
  "picture", "photo", "ticket", "receipt", "key", "card", "bag", "seat", "table", "chair", "file", "document", "sample", "question", "problem",
  "idea", "minute", "hour", "day", "week", "month", "year", "moment", "second", "meeting", "report", "email", "message", "call", "plan",
  "chance", "friend", "item", "part", "step", "option", "slide", "page", "chart", "graph", "product", "order", "box", "cup", "bottle", "shoe",
  "glass", "room", "phone", "laptop", "car", "bus", "train", "flight", "hotel", "restaurant", "store", "shop", "test", "result", "number",
]);
/** The singular of a plural of a common noun ("pictures" → "picture", "boxes" → "box", "glasses" → "glass"), or null. */
const pluralNoun = (x: string): string | null => {
  if (/es$/.test(x) && COMMON_NOUNS.has(x.slice(0, -2))) return x.slice(0, -2);
  if (/[^s]s$/.test(x) && COMMON_NOUNS.has(x.slice(0, -1))) return x.slice(0, -1);
  return null;
};

const basicForms: Rule = (w) => {
  const out: RuleFinding[] = [];
  const push = (f: Omit<RuleFinding, "skill"> & { skill?: string }) => out.push({ skill: "agreement", ...f });
  const brk = (k: number) => k >= w.length - 1 || brokenAfter(w, k);
  for (let i = 0; i < w.length; i++) {
    const t = w[i].norm;
    const n1 = w[i + 1]?.norm ?? "";
    const n2 = w[i + 2]?.norm ?? "";

    // Modal + (subject in a question) + a form that is not the base: "How can I using …?", "will it takes",
    // "Could you came …?", "I might being late", "Can I having …?".
    if (MODALS.has(t) && !(t === "may" && w[i].raw === "May" && i > 0) && !w[i].expanded && !brk(i)) {
      let j = i + 1;
      if (SUBJ.test(w[j]?.norm ?? "") && !brk(j)) j++;
      while (j < w.length && /^(not|also|just|really|still|please|ever|never|already|always|probably|definitely)$/.test(w[j].norm)) j++;
      const v = w[j];
      const vi = v ? verbInfo(v.norm) : null;
      // Any form other than the base is wrong here; a past form equal to the base ("put") is the base.
      const bad = !!v && !v.expanded && !BE_FORMS.has(v.norm) && !!vi && v.norm !== vi.base && (vi.form === "ing" || vi.form === "3sg" || vi.form === "past" || vi.form === "pp");
      const being = v?.norm === "being" && j > i;
      if ((bad && !(vi!.form === "ing" && ING_NOUNS.has(v!.norm))) || being) {
        const base = being ? "be" : vi!.base;
        push({
          rule: "modal-base", from: j, to: j + 1, replacement: base, category: "verb-form", severity: "major", skill: "modal-possibility",
          messageKo: `조동사 '${w[i].raw}' 뒤에는 동사원형이 옵니다: '${v!.raw}' → '${base}'.`,
        });
      }
      continue;
    }

    // "Does you …?" → "Do you"; "Do this bus go …?" → "Does this bus go".
    if (t === "does" && /^(i|you|we|they)$/.test(n1)) {
      push({ rule: "do-agreement", from: i, to: i + 1, replacement: w[i].raw[0] === "D" ? "Do" : "do", category: "agreement", severity: "major", messageKo: `주어 '${w[i + 1].raw}'에는 'do'를 씁니다.` });
      continue;
    }
    if (t === "do" && !w[i].expanded && /^(this|that)$/.test(n1) && COMMON_NOUNS.has(n2) && w[i + 3] && verbInfo(w[i + 3].norm)?.form === "base" && w[i + 3].norm === verbInfo(w[i + 3].norm)!.base) {
      push({ rule: "do-agreement", from: i, to: i + 1, replacement: w[i].raw[0] === "D" ? "Does" : "does", category: "agreement", severity: "major", messageKo: `주어 '${w[i + 1].raw} ${w[i + 2].raw}'는 단수라서 'does'를 씁니다.` });
      continue;
    }
    // "I doesn't know" → "I don't know".
    if (/^(i|you|we|they)$/.test(t) && (n1 === "does" || n1 === "doesn") && !brk(i)) {
      push({ rule: "do-agreement", from: i + 1, to: i + 2, replacement: "do", category: "agreement", severity: "major", messageKo: `주어 '${w[i].raw}'에는 'do / don't'를 씁니다.` });
      continue;
    }

    // "Are anyone free?" → "Is anyone".
    if (/^(are|were)$/.test(t) && /^(anyone|anybody|someone|somebody|everyone|everybody|nobody|everything|anything|something|nothing)$/.test(n1) && (i === 0 || brokenAfter(w, i - 1))) {
      const fix = t === "are" ? "is" : "was";
      push({ rule: "indefinite-agreement", from: i, to: i + 1, replacement: w[i].raw[0] === "A" || w[i].raw[0] === "W" ? fix[0].toUpperCase() + fix.slice(1) : fix, category: "agreement", severity: "major", messageKo: `'${w[i + 1].raw}'는 단수로 받습니다: '${fix} ${w[i + 1].raw}'.` });
      continue;
    }

    // "The people next door has a dog" → "have".
    if (/^(the|these|those|our|my|your|their)$/.test(t) && /^(people|children|men|women)$/.test(n1)) {
      for (let k = i + 2; k < Math.min(w.length, i + 6); k++) {
        if (brk(k - 1)) break;
        const x = w[k].norm;
        if (/^(has|is|was|does)$/.test(x) && !w[k].expanded) {
          const fix = { has: "have", is: "are", was: "were", does: "do" }[x]!;
          push({ rule: "plural-agreement", from: k, to: k + 1, replacement: fix, category: "agreement", severity: "major", messageKo: `주어 '${w[i + 1].raw}'는 복수라서 '${fix}'를 씁니다.` });
          break;
        }
        if (verbInfo(x) || MODALS.has(x) || BE_FORMS.has(x) || /^(who|that|which)$/.test(x)) break;
      }
      continue;
    }

    // "The parts hasn't came yet" → "come": a perfect needs the past participle ("hasn't", "I've" count; "it's" is "is").
    if (/^(have|has|had)$/.test(t) && !/['’]s$/i.test(w[i].raw)) {
      let j = i + 1;
      while (j < w.length && /^(not|already|just|never|ever|still|also|really|recently)$/.test(w[j].norm)) j++;
      const v = w[j];
      const vi = v ? verbInfo(v.norm) : null;
      const pp = vi ? participleOf(vi.base) : "";
      if (v && vi && vi.form === "past" && pp !== v.norm && v.norm !== vi.base && (j > i + 1 || (i > 0 && (SUBJ.test(w[i - 1].norm) || COMMON_NOUNS.has(w[i - 1].norm.replace(/s$/, "")))))) {
        push({ rule: "perfect-participle", from: j, to: j + 1, replacement: pp, category: "verb-form", severity: "major", skill: "present-perfect", messageKo: `완료형은 'have/has + 과거분사'입니다: '${v.raw}' → '${pp}'.` });
      }
      continue;
    }

    // "a pictures" → "a picture"; "the our team" → "our team"; "this shoes" → "these shoes"; "these Excel file" → "this".
    if (/^(a|an)$/.test(t) && pluralNoun(n1) && (brk(i + 1) || PREPOSITIONS.has(n2) || /^(and|or|but|so|please|for)$/.test(n2))) {
      push({ rule: "article-plural", from: i + 1, to: i + 2, replacement: pluralNoun(n1)!, category: "countability", severity: "minor", skill: "articles", messageKo: `'${w[i].raw}'는 하나를 가리키므로 단수 명사가 옵니다: '${pluralNoun(n1)}'.` });
      continue;
    }
    if (t === "the" && /^(our|my|your|their|his|her|its)$/.test(n1)) {
      push({ rule: "double-determiner", from: i, to: i + 1, replacement: "", category: "article", severity: "minor", skill: "articles", messageKo: `'the'와 '${w[i + 1].raw}'를 함께 쓰지 않습니다: '${w[i + 1].raw} ${w[i + 2]?.raw ?? ""}'.` });
      continue;
    }
    if (/^(this|that)$/.test(t) && pluralNoun(n1) && !w[i + 1].expanded && (brk(i + 1) || /^(are|were|look|cost|fit|feel|and|for|in|on|at|please)$/.test(n2))) {
      const fix = t === "this" ? "these" : "those";
      push({ rule: "determiner-number", from: i, to: i + 1, replacement: fix, category: "countability", severity: "major", skill: "countability", messageKo: `복수 명사(${w[i + 1].raw}) 앞에서는 '${fix}'를 씁니다.` });
      continue;
    }
    if (/^(these|those)$/.test(t)) {
      const k = /^[A-Z]/.test(w[i + 1]?.raw ?? "") && i + 2 < w.length ? i + 2 : i + 1;
      if (w[k] && COMMON_NOUNS.has(w[k].norm) && !w[k].poss && (brk(k) || PREPOSITIONS.has(w[k + 1]?.norm ?? "") || /^(is|was|please|and)$/.test(w[k + 1]?.norm ?? ""))) {
        const fix = t === "these" ? "this" : "that";
        push({ rule: "determiner-number", from: i, to: i + 1, replacement: fix, category: "countability", severity: "major", skill: "countability", messageKo: `단수 명사(${w[k].raw}) 앞에서는 '${fix}'를 씁니다.` });
      }
      continue;
    }

    // "How long takes it?" → "How long does it take?"
    if (t === "how" && n1 === "long" && w[i + 2] && verbInfo(n2)?.form === "3sg" && !/^(does|is|has|was|did|do)$/.test(n2) && /^(it|this|that)$/.test(w[i + 3]?.norm ?? "")) {
      const base = verbInfo(n2)!.base;
      push({ rule: "question-word-order", from: i + 2, to: i + 4, replacement: `does ${w[i + 3].raw} ${base}`, category: "word-order", severity: "major", skill: "question-form", messageKo: `의문문은 'How long does it ${base}?'처럼 do를 앞에 씁니다.` });
      continue;
    }

    // "Could you turn down it?" → "turn it down": a pronoun object goes between the verb and its particle.
    if (/^(turn|turns|turned|keep|keeps|kept|try|tried|pick|picked|put|take|took|fill|filled|write|wrote|look|looked|give|gave|throw|threw|set|call|called|hand|handed|shut|figure|check|checked|print|printed|send|sent|bring|brought|clean|cleaned|switch|switched|throw|wake|woke)$/.test(t)) {
      const particle = /^(up|down|off|out|back|away|over|in)$/.test(n1) || (n1 === "on" && /^(try|tried|put|turn|turned|switch|switched)$/.test(t));
      if (particle && /^(it|them|him|her|me|us)$/.test(n2) && (brk(i + 2) || /^(for|to|please|now|again|later|and|first|tomorrow|today|right)$/.test(w[i + 3]?.norm ?? "")) && !w[i + 2].expanded) {
        push({ rule: "particle-order", from: i, to: i + 3, replacement: `${w[i].raw} ${w[i + 2].raw} ${w[i + 1].raw}`, category: "word-order", severity: "major", skill: "phrasal-verb", messageKo: `대명사 목적어는 동사와 부사 사이에 옵니다: '${w[i].raw} ${w[i + 2].raw} ${w[i + 1].raw}'.` });
      }
      continue;
    }

    // "I feel not well" → "I don't feel well".
    if (/^(feel|feels)$/.test(t) && n1 === "not" && /^(well|good|great|so|very|too)$/.test(n2)) {
      push({ rule: "feel-not", from: i, to: i + 2, replacement: t === "feels" ? "doesn't feel" : "don't feel", category: "word-order", severity: "major", skill: "agreement", messageKo: "'몸이 안 좋다'는 'I don't feel well.'입니다(not은 feel 앞, don't로)." });
      continue;
    }

    // "an hour early" (not "early an hour").
    if (/^(early|late)$/.test(t) && /^(a|an)$/.test(n1) && /^(hour|minute|day|week|bit)$/.test(n2) && !brokenAfter(w, i)) {
      push({ rule: "word-order", from: i, to: i + 3, replacement: `${w[i + 1].raw} ${w[i + 2].raw} ${w[i].raw}`, category: "word-order", severity: "minor", skill: "word-order", messageKo: `시간 표현은 '${w[i + 1].raw} ${w[i + 2].raw} ${w[i].raw}' 순서입니다.` });
      continue;
    }

    // "Thanks you" → "Thank you" (or "Thanks").
    if (t === "thanks" && n1 === "you" && !brokenAfter(w, i) && (i === 0 || brokenAfter(w, i - 1)) && !/^(too|all|guys|so)$/.test(n2)) {
      push({ rule: "thanks-you", from: i, to: i + 1, replacement: w[i].raw[0] === "T" ? "Thank" : "thank", category: "word-choice", severity: "minor", skill: "thanks-looking-forward", messageKo: "'Thank you' 또는 'Thanks'입니다('Thanks you'는 쓰지 않습니다)." });
      continue;
    }

    // "How long time does it take?" → "How long does it take?"
    if (t === "how" && n1 === "long" && n2 === "time" && !w[i + 2].expanded) {
      push({ rule: "how-long-time", from: i + 2, to: i + 3, replacement: "", category: "word-choice", severity: "minor", skill: "question-form", messageKo: "'얼마나 오래'는 'How long'입니다('time' 없이)." });
      continue;
    }

    // "You are welcome to join with us" → "join us".
    if (/^(join|joined|joining)$/.test(t) && n1 === "with" && /^(us|me|them|him|her|you)$/.test(n2)) {
      push({ rule: "extra-preposition", from: i + 1, to: i + 2, replacement: "", category: "preposition", severity: "major", skill: "verb-object", messageKo: "'join'은 목적어를 바로 받습니다: 'join us'." });
      continue;
    }

    // "too busy for go" → "too busy to go".
    if (t === "for" && i > 1 && w[i - 2].norm === "too" && w[i + 1] && isBaseVerb(n1) && !COUNTABLE_NOUNS.has(n1) && (UNAMBIGUOUS_VERBS.has(n1) || /^(go|come|do|make|take|get|see|eat|sleep|talk|help|join|stay|leave|finish|start|wait)$/.test(n1))) {
      push({ rule: "too-to", from: i, to: i + 1, replacement: "to", category: "verb-form", severity: "major", skill: "too-adj", messageKo: "'너무 ~해서 …할 수 없다'는 'too + 형용사 + to + 동사원형'입니다." });
      continue;
    }

    // "at yesterday", "on tomorrow" → no preposition.
    if (/^(at|on)$/.test(t) && /^(yesterday|today|tomorrow|tonight)$/.test(n1) && !w[i + 1].poss && !brokenAfter(w, i) && !(t === "on" && /^(come|came|get|got|go|went|be|is|am|are|was|log|hold|carry)$/.test(w[i - 1]?.norm ?? ""))) {
      // ("in yesterday's meeting" is a possessive; "come in today", "I'm not in tomorrow" use "in" as a particle.)
      push({ rule: "time-preposition", from: i, to: i + 1, replacement: "", category: "preposition", severity: "major", skill: "verb-prep", messageKo: `'${w[i + 1].raw}' 앞에는 전치사를 쓰지 않습니다.` });
      continue;
    }

    // "I visited there before one week" → "a week ago".
    if (t === "before" && /^(one|a|an|two|three|four|five|six|seven|eight|nine|ten|\d+)$/.test(n1) && /^(minutes?|hours?|days?|weeks?|months?|years?)$/.test(n2) && brk(i + 2)) {
      const amount = /^(one|a|an)$/.test(n1) ? (n2.startsWith("hour") ? "an" : "a") : w[i + 1].raw;
      push({ rule: "ago", from: i, to: i + 3, replacement: `${amount} ${w[i + 2].raw} ago`, category: "word-choice", severity: "major", skill: "verb-prep", messageKo: `'(지금부터) ~ 전에'는 '${amount} ${w[i + 2].raw} ago'입니다. 'before'는 '어떤 일 전에'에 씁니다.` });
      continue;
    }

    // "I want get a refund" → "want to get"; "Do you want I help you?" → "want me to help".
    if (/^(want|wants|wanted|need|needs|needed|would like|hope|hopes|plan|plans|decided|forgot|tried|try)$/.test(t) && w[i + 1] && i > 0) {
      const v = w[i + 1];
      const vi = verbInfo(v.norm);
      const everyday = /^(get|go|come|buy|see|know|ask|tell|book|order|cancel|send|pay|return|exchange|eat|leave|stay|meet|talk|visit|start|finish|join|learn|bring|give|find|make|take|keep|speak|call|confirm|check)$/.test(v.norm);
      if (vi && vi.form === "base" && v.norm === vi.base && (UNAMBIGUOUS_VERBS.has(v.norm) || everyday) && !/^(to|help)$/.test(v.norm) && SUBJ.test(w[i - 1].norm)) {
        push({ rule: "want-to", from: i + 1, to: i + 1, replacement: "to", category: "verb-form", severity: "major", skill: "purpose-to", messageKo: `'${w[i].raw}' 뒤에 동사가 오면 'to + 동사원형'입니다: '${w[i].raw} to ${v.raw}'.` });
      } else if (/^(want|wants|wanted)$/.test(t) && /^(i|he|she|we|they)$/.test(v.norm) && w[i + 2] && verbInfo(w[i + 2].norm)?.form === "base") {
        const obj = { i: "me", he: "him", she: "her", we: "us", they: "them" }[v.norm]!;
        push({ rule: "want-object-to", from: i + 1, to: i + 2, replacement: `${obj} to`, category: "sentence-structure", severity: "major", skill: "purpose-to", messageKo: `'(누가) ~하기를 원하다'는 'want + 목적격 + to + 동사원형'입니다: 'want ${obj} to ${w[i + 2].raw}'.` });
      }
      continue;
    }

    // "1204 room" is a label: no plural suggestion (see pluralNeeded); nothing to do here.
    if (/^\d{3,}$/.test(t) && LABEL_NOUN.test(n1)) continue;
  }
  return out;
};

/** Things handed over that take "the" (or "a"): "text me phone number" → "text me the phone number". */
const HANDED: Record<string, string> = {
  number: "the", address: "the", link: "the", file: "the", report: "the", name: "the", location: "the", password: "the", schedule: "the",
  agenda: "the", invoice: "the", quote: "the", quotation: "the", contract: "the", document: "the", photo: "the", picture: "the", map: "the",
  way: "the", copy: "a", email: "an", message: "a", answer: "an", update: "an", tour: "a", refund: "a", text: "a", call: "a", hand: "a", minute: "a", moment: "a", chance: "a", hint: "a", ride: "a", lift: "a",
};
const HANDED_FIRST = /^(phone|email|contact|room|flight|order|tracking|home|delivery|meeting|zoom|teams|file|office|hotel|account)$/;
const HANDED_SECOND = /^(number|address|link|name|location)$/;
const AFTER_NOUN_PHRASE = /^(of|for|to|again|now|today|tomorrow|please|when|by|before|after|later|soon|asap|if|so|and|as|in|on|at|with|too|right|first|once|twice|yesterday|later|one|this|every|because|but|together)$/;

/** Slips from the blind test: "do drying test", "text me phone number", "Who calls?", "Do you enjoy your weekend?" (on Monday). */
const conversationSlips: Rule = (w) => {
  const out: RuleFinding[] = [];
  const end = (k: number) => k >= w.length - 1 || brokenAfter(w, k);
  const ends = (k: number) => end(k) || AFTER_NOUN_PHRASE.test(w[k + 1].norm);
  const anOf = (x: string) => (/^[aeiou]/.test(x) && !CONSONANT_SOUND_VOWEL_START.test(x) ? "an" : "a");
  for (let i = 0; i < w.length - 1; i++) {
    const t = w[i].norm;

    // "we'll do drying test one more time" → "do the drying test"; "let's run quick check" → "a quick check".
    if (/^(do|does|did|doing|run|runs|ran|running|conduct|conducts|conducted|conducting|perform|performs|performed|performing|repeat|repeats|repeated|repeating|redo|redid|redoing)$/.test(t) && !end(i)) {
      let k = i + 1;
      const mods: number[] = [];
      while (k < w.length && mods.length < 2 && !TEST_NOUN.test(w[k].norm) && /^[a-z]+(-[a-z]+)?$/.test(w[k].norm) && !DETERMINERS.has(w[k].norm) && !NOT_A_MODIFIER.test(w[k].norm) && !end(k)) {
        mods.push(k);
        k++;
      }
      if (k < w.length && TEST_NOUN.test(w[k].norm) && ends(k) && !(mods.length && end(mods[mods.length - 1]))) {
        const again = w.slice(k + 1).some((x, n, all) => x.norm === "again" || x.norm === "once" && all[n + 1]?.norm === "more" || x.norm === "more" && all[n + 1]?.norm === "time");
        const art = again ? "the" : anOf(w[i + 1].norm);
        out.push({
          rule: "missing-article", from: i + 1, to: i + 1, replacement: art, category: "article", severity: "minor", skill: "articles",
          messageKo: `'${w[k].raw}'는 셀 수 있는 명사라서 관사가 필요합니다: '${w[i].raw} ${art} ${w.slice(i + 1, k + 1).map((x) => x.raw).join(" ")}'.`,
        });
      }
    }

    // "Would you mind texting me phone number of the engineer?" → "me the phone number".
    if (/^(send|sends|sent|sending|give|gives|gave|giving|text|texts|texted|texting|tell|tells|told|telling|show|shows|showed|showing|forward|forwards|forwarded|forwarding|email|emails|emailed|emailing|bring|brings|brought|bringing|pass|passes|passed|passing|lend|lends|lent)$/.test(t) && /^(me|us|him|her|them|you)$/.test(w[i + 1]?.norm ?? "") && !end(i) && !end(i + 1)) {
      const k = i + 2;
      const n = w[k]?.norm ?? "";
      const single = n in HANDED && ends(k);
      const compound = HANDED_FIRST.test(n) && HANDED_SECOND.test(w[k + 1]?.norm ?? "") && !end(k) && ends(k + 1);
      if (w[k] && (single || compound)) {
        const art = single ? HANDED[n] : "the";
        const phrase = compound ? `${w[k].raw} ${w[k + 1].raw}` : w[k].raw;
        out.push({
          rule: "missing-article", from: k, to: k, replacement: art, category: "article", severity: "minor", skill: "articles",
          messageKo: `'${phrase}'는 셀 수 있는 명사라서 관사가 필요합니다: '${w[i].raw} ${w[i + 1].raw} ${art} ${phrase}'.`,
        });
      }
    }

    // "You have point there" → "a point"; "That's good idea" → "a good idea".
    if (/^(have|has|had|got)$/.test(t) && w[i + 1].norm === "point" && (end(i + 1) || /^(there|here|too|actually|though)$/.test(w[i + 2]?.norm ?? ""))) {
      out.push({
        rule: "missing-article", from: i + 1, to: i + 1, replacement: "a", category: "article", severity: "minor", skill: "articles",
        messageKo: "point(일리, 요점)는 셀 수 있는 명사라서 'You have a point.'처럼 a가 필요합니다.",
      });
    }
    if (/^(is|was)$/.test(t) && /^(good|fair|great|valid|interesting|excellent|nice|smart|brilliant|tough|difficult|hard)$/.test(w[i + 1].norm) && /^(point|idea|question|suggestion|plan|choice|option)$/.test(w[i + 2]?.norm ?? "") && ends(i + 2)) {
      out.push({
        rule: "missing-article", from: i + 1, to: i + 1, replacement: "a", category: "article", severity: "minor", skill: "articles",
        messageKo: `'${w[i + 2].raw}'는 셀 수 있는 명사라서 'a ${w[i + 1].raw} ${w[i + 2].raw}'처럼 a가 필요합니다.`,
      });
    }

    // "May I ask who calls?" → "who's calling": on the phone the call is happening now.
    if (t === "who" && /^(calls|speaks)$/.test(w[i + 1].norm) && end(i + 1) && (i === 0 || brokenAfter(w, i - 1) || /^(ask|know|see|check|tell)$/.test(w[i - 1].norm))) {
      const ing = w[i + 1].norm === "calls" ? "calling" : "speaking";
      out.push({
        rule: "progressive-now", from: i, to: i + 2, replacement: `who's ${ing}`, category: "tense", severity: "major", skill: "progressive",
        messageKo: `전화를 건 사람을 물을 때는 지금 일어나는 일이라 진행형입니다: 'May I ask who's ${ing}?'`,
      });
    }

    // "Do you enjoy your weekend?" on Monday → "Did you enjoy …": the weekend is over ("Do you enjoy …" asks about habits).
    if (t === "do" && w[i + 1].norm === "you" && w[i + 2]?.norm === "enjoy" && /^(your|the)$/.test(w[i + 3]?.norm ?? "") && /^(weekend|trip|holiday|holidays|vacation|flight|meal|dinner|lunch|party|evening|break|concert|game|match)$/.test(w[i + 4]?.norm ?? "") && (i === 0 || brokenAfter(w, i - 1))) {
      out.push({
        rule: "tense-did", from: i, to: i + 1, replacement: w[i].raw[0] === "D" ? "Did" : "did", category: "tense", severity: "major", skill: "agreement",
        messageKo: `이미 끝난 ${w[i + 4].raw}에 대해 묻는 것이라 과거형입니다: 'Did you enjoy your ${w[i + 4].raw}?' ('Do you enjoy …?'는 '평소에 즐기나요?'라는 뜻입니다.)`,
      });
    }
  }
  return out;
};
const TEST_NOUN = /^(test|trial|check|inspection|experiment|simulation|demo|presentation|survey|walkthrough|walk-through)$/;

const LANGUAGES = /^(english|korean|japanese|chinese|spanish|french|german|vietnamese|indonesian|malay|thai|hindi|italian|russian|arabic)$/;
const SOUND_ADJ = /^(great|good|nice|interesting|amazing|perfect|wonderful|terrible|bad|delicious|exciting|easy|hard|difficult|lovely|fantastic|awesome|expensive|cheap|boring|reasonable|fair|tough|serious|dangerous|strange|weird|familiar|busy|tiring|relaxing|healthy|crazy|cool|funny|beautiful|scary|stressful|complicated|simple|useful|helpful|fine|okay|ok)$/;
const WEATHER_WORD = /^(raining|snowing|windy|sunny|cloudy|foggy|rainy|snowy|humid|freezing|hot|cold|warm|chilly)$/;
const GERUND_VERBS = /^(enjoy|enjoys|enjoyed|enjoying|finish|finishes|finished|avoid|avoids|avoided|mind|minds|minded|imagine|imagined|quit|quits|deny|denied|risk|risked|miss|missed)$/;
const TAKE_NOUN = /^(break|look|decision|mistake|walk|nap|seat|shower|step|photo|picture|call|chance|try|guess|choice|bath|trip|day)$/;
const MODIFIER_ADJ = /^(short|quick|long|little|big|good|final|hard|tough|wise|smart|great|nice|quick|brief|careful|close|real|bad|wrong|right|second|first|new|different|better)$/;
const BE_ADJ_NOUN = /^(experience|idea|day|week|trip|meeting|question|point|choice|plan|decision|opportunity|job|time|suggestion|option|game|movie|party|night|year)$/;

/**
 * More slips Korean speakers make, found with a battery of typical mistakes: missing prepositions
 * ("depends the weather", "looking forward meeting"), verb patterns ("would like going", "mind send",
 * "enjoy to cook", "thinking to change"), "There is raining", "sounds like great", "I really like." and others.
 */
const learnerSlips: Rule = (w) => {
  const out: RuleFinding[] = [];
  const end = (k: number) => k >= w.length - 1 || brokenAfter(w, k);
  const ends = (k: number) => end(k) || AFTER_NOUN_PHRASE.test(w[k + 1].norm);
  const anOf = (x: string) => (/^[aeiou]/.test(x) && !CONSONANT_SOUND_VOWEL_START.test(x) ? "an" : "a");
  const insert = (k: number, word: string, category: ErrorCategory, severity: Severity, skill: string, messageKo: string, rule = "missing-preposition") =>
    out.push({ rule, from: k, to: k, replacement: word, category, severity, skill, messageKo });
  const baseVerbAt = (k: number) => {
    const v = w[k];
    const vi = v ? verbInfo(v.norm) : null;
    return !!vi && vi.form === "base" && v!.norm === vi.base && !/^(be|have|do)$/.test(vi.base) ? vi.base : null;
  };
  for (let i = 0; i < w.length - 1; i++) {
    const t = w[i].norm;
    const n1 = w[i + 1].norm;
    if (end(i)) continue;

    // "It depends the weather" → "depends on"; "responsible the budget" → "responsible for".
    if (/^(depend|depends|depended|depending)$/.test(t) && (DETERMINERS.has(n1) || /^(how|what|whether|when|where|who|which|this|that|it|them|him|her|me|us|you|your|my|our|their)$/.test(n1)) && !(n1 === "a" && /^(lot|bit|little|great)$/.test(w[i + 2]?.norm ?? ""))) {
      insert(i + 1, "on", "preposition", "major", "verb-prep", `'~에 달려 있다'는 'depend on'입니다: '${w[i].raw} on ${w[i + 1].raw}'.`);
      continue;
    }
    if (t === "responsible" && (DETERMINERS.has(n1) || /^(this|that|it|all|everything|them)$/.test(n1) || (verbInfo(n1)?.form === "ing" && !ING_NOUNS.has(n1)))) {
      insert(i + 1, "for", "preposition", "major", "verb-prep", `'~을 책임지다/담당하다'는 'responsible for'입니다: 'responsible for ${w[i + 1].raw}'.`);
      continue;
    }
    // "I'm looking forward meeting you" → "looking forward to meeting you".
    if (t === "forward" && i > 0 && /^(look|looks|looking|looked)$/.test(w[i - 1].norm) && n1 !== "to" && (DETERMINERS.has(n1) || /^(it|this|that|seeing|hearing|meeting|working|your|our|my)$/.test(n1) || (verbInfo(n1)?.form === "ing" && !ING_NOUNS.has(n1)))) {
      insert(i + 1, "to", "preposition", "major", "verb-prep", "'~을 기대하다'는 'look forward to + 명사/-ing'입니다: 'looking forward to meeting you'.");
      continue;
    }
    // "I'll arrive Jakarta on Monday" → "arrive in Jakarta"; "arrive the airport" → "arrive at the airport".
    if (/^(arrive|arrives|arrived|arriving)$/.test(t)) {
      if (/^[A-Z][a-z]/.test(w[i + 1].raw) && !/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)$/.test(w[i + 1].raw)) {
        insert(i + 1, "in", "preposition", "major", "verb-prep", `도시·나라에 도착할 때는 'arrive in + 장소'입니다: 'arrive in ${w[i + 1].raw}'.`);
        continue;
      }
      if (n1 === "the" && /^(airport|station|office|hotel|plant|site|venue|gate|terminal|meeting|restaurant|building|factory|port|reception)$/.test(w[i + 2]?.norm ?? "")) {
        insert(i + 1, "at", "preposition", "major", "verb-prep", `건물·장소에 도착할 때는 'arrive at + 장소'입니다: 'arrive at the ${w[i + 2].raw}'.`);
        continue;
      }
    }
    // "Let's talk it later" → "talk about it later" ("talk it over" is fine).
    if (/^(talk|talked|talking|talks|discuss)$/.test(t) && t !== "discuss" && /^(it|this|that)$/.test(n1) && (end(i + 1) || /^(later|tomorrow|next|again|now|today|soon|first|with|when|after|before)$/.test(w[i + 2]?.norm ?? ""))) {
      insert(i + 1, "about", "preposition", "major", "verb-prep", `talk는 목적어를 바로 받지 않습니다: 'talk about ${w[i + 1].raw}'.`);
      continue;
    }

    // "I would like going home" → "would like to go".
    if (t === "like" && i > 0 && /^(would|should)$/.test(w[i - 1].norm) && verbInfo(n1)?.form === "ing" && !ING_NOUNS.has(n1)) {
      const base = verbInfo(n1)!.base;
      out.push({ rule: "would-like-to", from: i + 1, to: i + 2, replacement: `to ${base}`, category: "verb-form", severity: "major", skill: "prep-gerund", messageKo: `'would like' 뒤에는 'to + 동사원형'이 옵니다: 'would like to ${base}'.` });
      continue;
    }
    // "Would you mind send me the file?" → "mind sending".
    if (/^(mind|minds)$/.test(t) && i > 0 && /^(you|i|we|they|he|she)$/.test(w[i - 1].norm)) {
      const base = baseVerbAt(i + 1);
      if (base && (UNAMBIGUOUS_VERBS.has(base) || /^(send|check|wait|close|open|help|move|call|repeat|share|turn|say|tell|give|show|take|bring|speak|sign|pick|hold|come|join|explain)$/.test(base))) {
        out.push({ rule: "mind-ing", from: i + 1, to: i + 2, replacement: ingOf(base), category: "verb-form", severity: "major", skill: "prep-gerund", messageKo: `'mind' 뒤에는 -ing가 옵니다: 'mind ${ingOf(base)}'.` });
        continue;
      }
    }
    // "I enjoy to cook" → "enjoy cooking"; "Do you mind to wait?" → "mind waiting".
    if (GERUND_VERBS.test(t) && n1 === "to") {
      const base = baseVerbAt(i + 2);
      if (base) {
        out.push({ rule: "gerund-not-to", from: i + 1, to: i + 3, replacement: ingOf(base), category: "verb-form", severity: "major", skill: "prep-gerund", messageKo: `'${w[i].raw}' 뒤에는 -ing가 옵니다: '${w[i].raw} ${ingOf(base)}'.` });
        continue;
      }
    }
    // "I'm thinking to change jobs" → "thinking of changing".
    if (t === "thinking" && n1 === "to") {
      const base = baseVerbAt(i + 2);
      if (base) {
        out.push({ rule: "thinking-of", from: i + 1, to: i + 3, replacement: `of ${ingOf(base)}`, category: "verb-form", severity: "major", skill: "prep-gerund", messageKo: `'~할까 생각 중이다'는 'thinking of/about + -ing'입니다: 'thinking of ${ingOf(base)}'.` });
        continue;
      }
    }
    // "Is it possible finish today?" → "possible to finish".
    // Only as a predicate ("Is it possible …", "it's important …"), not before a noun ("the most important test points").
    const predicate = i > 0 && (/^(is|was|be|are|were|it|not)$/.test(w[i - 1].norm) || (/^(very|really|so|quite|also|absolutely|still)$/.test(w[i - 1].norm) && /^(is|was|be|are|were|it|not)$/.test(w[i - 2]?.norm ?? "")));
    if (/^(possible|impossible|necessary|important)$/.test(t) && predicate) {
      // "Is it possible for you send me …" → "for you to send".
      if (n1 === "for" && /^(you|me|us|them|him|her|everyone)$/.test(w[i + 2]?.norm ?? "")) {
        const b = baseVerbAt(i + 3);
        if (b && (UNAMBIGUOUS_VERBS.has(b) || /^(send|check|finish|come|go|get|make|take|call|meet|join|move|change|pay|book|share|give|tell|show|bring|help|wait|stay|start)$/.test(b))) {
          insert(i + 3, "to", "verb-form", "major", "purpose-to", `'for + 사람' 뒤에 동사가 오면 'to + 동사원형'입니다: 'for ${w[i + 2].raw} to ${w[i + 3].raw}'.`, "infinitive-needed");
          continue;
        }
      }
      const base = baseVerbAt(i + 1);
      if (base && (UNAMBIGUOUS_VERBS.has(base) || /^(finish|check|send|get|go|come|meet|call|change|find|make|take|see|tell|buy|pay|leave|stay|keep|start|stop|visit|book|order|move|use|test|fix|run)$/.test(base))) {
        insert(i + 1, "to", "verb-form", "major", "purpose-to", `'${w[i].raw}' 뒤에 동사가 오면 'to + 동사원형'입니다: '${w[i].raw} to ${w[i + 1].raw}'.`, "infinitive-needed");
        continue;
      }
    }
    // "It makes me to happy" → "makes me happy".
    if (/^(make|makes|made|making)$/.test(t) && /^(me|you|him|her|us|them|everyone)$/.test(n1) && w[i + 2]?.norm === "to" && /^(happy|sad|tired|nervous|angry|upset|excited|bored|sick|feel|laugh|cry|worry|smile|think)$/.test(w[i + 3]?.norm ?? "")) {
      out.push({ rule: "let-make-to", from: i + 2, to: i + 3, replacement: "", category: "verb-form", severity: "major", skill: "verb-object", messageKo: `'make + 사람 + 형용사/동사원형'에는 to를 쓰지 않습니다: '${w[i].raw} ${w[i + 1].raw} ${w[i + 3].raw}'.` });
      continue;
    }

    // "The meeting will hold next week" → "will be held"; "The meeting is holding" → "is being held".
    if (/^(meeting|meetings|conference|event|party|ceremony|workshop|seminar|session|training|exhibition|festival|wedding|competition|interview|briefing|call)$/.test(t)) {
      let k = i + 1;
      if (/^(will|would|can|could|should|must|may|might)$/.test(w[k].norm)) {
        k++;
        if (w[k]?.norm === "not") k++;
        if (/^(hold)$/.test(w[k]?.norm ?? "") && (end(k) || !DETERMINERS.has(w[k + 1].norm))) {
          out.push({ rule: "passive-needed", from: k, to: k + 1, replacement: "be held", category: "verb-form", severity: "major", skill: "passive", messageKo: `회의·행사는 '열리는' 것이라 수동태입니다: '${w[i].raw} ${w.slice(i + 1, k).map((x) => x.raw).join(" ")} be held'.` });
          continue;
        }
      }
    }
    // "This dish calls bibimbap" → "is called bibimbap".
    if (/^(calls|call)$/.test(n1) && !end(i + 1) && /^(this|that|it|dish|food|place|area|machine|tool|process|method|word|thing|game|dance|song|drink|soup|snack|city|town|street|station|restaurant|team|unit|system|software|app|program)$/.test(t) && (t === "it" || t === "this" || t === "that" || (i > 0 && /^(this|that|the|our|my)$/.test(w[i - 1].norm))) && w[i + 2] && (/^[A-Z]/.test(w[i + 2].raw) || (end(i + 2) && !/^(me|you|him|her|us|them|back|in|off|out|it)$/.test(w[i + 2].norm))) && !/^(for|me|you|him|her|us|them|the|a|an|on|back|in|off|out|it)$/.test(w[i + 2].norm)) {
      out.push({ rule: "passive-needed", from: i + 1, to: i + 2, replacement: "is called", category: "verb-form", severity: "major", skill: "passive", messageKo: `이름이 '~라고 불린다'는 수동태입니다: '${w[i].raw} is called ${w[i + 2].raw}'.` });
      continue;
    }

    // "There is raining a lot" → "It is raining": weather takes "it".
    if (t === "there" && /^(is|was)$/.test(n1) && WEATHER_WORD.test(w[i + 2]?.norm ?? "") && !end(i + 1)) {
      out.push({ rule: "it-for-weather", from: i, to: i + 1, replacement: /^[A-Z]/.test(w[i].raw) ? "It" : "it", category: "sentence-structure", severity: "major", skill: "be-adj", messageKo: `날씨는 'it'을 주어로 씁니다: 'It ${w[i + 1].raw} ${w[i + 2].raw}'.` });
      continue;
    }
    // "That sounds like great." → "That sounds great" (like + a noun: "sounds like a great idea").
    if (/^(sound|sounds|sounded)$/.test(t) && n1 === "like") {
      let a = i + 2;
      const intensified = /^(very|really|so|pretty|quite|super|too)$/.test(w[a]?.norm ?? "");
      if (intensified) a++;
      const adj = w[a]?.norm ?? "";
      const tail = end(a) || (/^(to|for)$/.test(w[a + 1]?.norm ?? "") && /^(me|us|you|him|her|them)$/.test(w[a + 2]?.norm ?? "") && end(a + 2));
      if ((SOUND_ADJ.test(adj) || (intensified && adj === "fun")) && tail) {
        out.push({ rule: "sound-like-adjective", from: i + 1, to: i + 2, replacement: "", category: "word-choice", severity: "major", skill: "be-adj", messageKo: `형용사 앞에서는 like 없이 'sound + 형용사'입니다: '${w[i].raw} ${w.slice(i + 2, a + 1).map((x) => x.raw).join(" ")}' (명사 앞에서는 'sounds like a great idea').` });
        continue;
      }
    }
    // "She speaks well English" → "speaks English well".
    if (/^(speak|speaks|spoke|speaking)$/.test(t) && /^(well|fluently)$/.test(n1) && LANGUAGES.test(w[i + 2]?.norm ?? "")) {
      out.push({ rule: "adverb-position", from: i + 1, to: i + 3, replacement: `${w[i + 2].raw} ${w[i + 1].raw}`, category: "word-order", severity: "major", skill: "word-order", messageKo: `부사는 목적어 뒤에 둡니다: '${w[i].raw} ${w[i + 2].raw} ${w[i + 1].raw}'.` });
      continue;
    }
    // "I always am late" → "I am always late": frequency adverbs go after be.
    if (/^(always|usually|often|never|sometimes|rarely|seldom|normally|generally)$/.test(t) && /^(am|is|are|was|were)$/.test(n1) && !w[i + 1].expanded && i > 0 && SUBJECT_PRONOUNS.has(w[i - 1].norm) && !end(i + 1)) {
      out.push({ rule: "adverb-position", from: i, to: i + 2, replacement: `${w[i + 1].raw} ${w[i].raw}`, category: "word-order", severity: "minor", skill: "word-order", messageKo: `빈도 부사(${w[i].raw})는 be동사 뒤에 둡니다: '${w[i - 1].raw} ${w[i + 1].raw} ${w[i].raw}'.` });
      continue;
    }
    // "I really like." → "I really like it": like/love need an object ("if you like" is fine).
    // The subject must start its clause: "the Italian place you like" is a relative clause (its object is "place").
    const subj = SUBJECT_PRONOUNS.has(t) ? i : /^(really|also|just|so|both|all|definitely|actually)$/.test(t) && i > 0 && SUBJECT_PRONOUNS.has(w[i - 1].norm) ? i - 1 : -1;
    const clauseStart = subj === 0 || (subj > 0 && (brokenAfter(w, subj - 1) || /^(and|but|so|because|yes|yeah|oh|well|honestly|actually|really)$/.test(w[subj - 1].norm)));
    if (/^(like|love|liked|loved|likes|loves)$/.test(n1) && end(i + 1) && subj >= 0 && clauseStart) {
      const before = w.slice(0, i).map((x) => x.norm);
      if (!before.some((x) => /^(if|as|what|whatever|anything|anyone|how|when|where|who|which|whichever|wherever|whenever|much|whatever|would|do|did|does|you'd)$/.test(x)) && !/^(would|do|did|does)$/.test(t)) {
        out.push({ rule: "like-object", from: i + 2, to: i + 2, replacement: "it", category: "sentence-structure", severity: "major", skill: "verb-object", messageKo: `like/love는 목적어가 필요합니다: '${w[i + 1].raw} it'.` });
        continue;
      }
    }

    // "Let's take short break" → "take a short break"; "We need to make decision" → "make a decision".
    if (/^(take|takes|took|taking|taken|make|makes|made|making|have|has|had|having|give|gives|gave|giving)$/.test(t)) {
      let k = i + 1;
      if (MODIFIER_ADJ.test(w[k].norm) && !end(k)) k++;
      const n = w[k]?.norm ?? "";
      const fits = TAKE_NOUN.test(n);
      // "have lunch", "take care", "make sense" are not in the list; "had look" / "have chance to" are.
      if (fits && ends(k) && !(/^(have|has|had|having)$/.test(t) && /^(break|day|trip|step|try|bath)$/.test(n) && k === i + 1)) {
        insert(i + 1, anOf(w[i + 1].norm), "article", "minor", "articles", `'${w[k].raw}'는 셀 수 있는 명사라서 관사가 필요합니다: '${w[i].raw} ${anOf(w[i + 1].norm)} ${w.slice(i + 1, k + 1).map((x) => x.raw).join(" ")}'.`, "missing-article");
        continue;
      }
    }
    // "I'm in meeting right now" → "in a meeting"; "I'll be there in hour" → "in an hour".
    if (t === "in" && /^(meeting|hurry|rush|minute|moment|second|hour|while|bit|week|day|month|year)$/.test(n1) && ends(i + 1) && !/^(room|rooms|minutes|notes|point|points|time)$/.test(w[i + 2]?.norm ?? "")) {
      insert(i + 1, anOf(n1), "article", "minor", "articles", `'${w[i + 1].raw}'는 셀 수 있는 명사라서 'in ${anOf(n1)} ${w[i + 1].raw}'처럼 관사가 필요합니다.`, "missing-article");
      continue;
    }
    // "It was great experience" → "a great experience"; "It's very good restaurant" → "a very good restaurant".
    if (/^(is|was)$/.test(t)) {
      let a = i + 1;
      if (/^(very|really|so|quite|pretty|such)$/.test(w[a].norm) && w[a].norm !== "such") a++;
      const adj = w[a]?.norm ?? "";
      const noun = w[a + 1]?.norm ?? "";
      if (/^(great|good|nice|wonderful|amazing|interesting|bad|terrible|big|long|short|busy|productive|useful|lovely|tough|hard|difficult|fun|fantastic|perfect|real|popular|famous|beautiful|small|new|old|cheap|expensive)$/.test(adj) && (BE_ADJ_NOUN.test(noun) || COUNTABLE_NOUNS.has(noun) || /^(place|city|town|restaurant|hotel|person|company|book|song|show|area|beach|park|museum|neighborhood|neighbourhood)$/.test(noun)) && !(a === i + 1 && /^(point|idea|question|suggestion|plan|choice|option)$/.test(noun)) && ends(a + 1)) {
        insert(i + 1, anOf(w[i + 1].norm), "article", "minor", "articles", `'${w[a + 1].raw}'는 셀 수 있는 명사라서 '${anOf(w[i + 1].norm)} ${w.slice(i + 1, a + 2).map((x) => x.raw).join(" ")}'처럼 관사가 필요합니다.`, "missing-article");
        continue;
      }
    }
    // "We had great time" → "a great time".
    if (/^(have|had|has|having)$/.test(t) && /^(great|good|nice|wonderful|lovely|fun|amazing|fantastic|hard|tough|busy|difficult|relaxing|quiet)$/.test(n1) && w[i + 2]?.norm === "time" && ends(i + 2)) {
      insert(i + 1, "a", "article", "minor", "articles", `'즐거운 시간을 보내다'는 'have a ${w[i + 1].raw} time'처럼 a가 필요합니다.`, "missing-article");
      continue;
    }
    // "One of the pumps need repair" → "needs"; "One of my friends are" → "is".
    if (t === "one" && n1 === "of" && /^(the|my|our|your|these|those|their|his|her)$/.test(w[i + 2]?.norm ?? "") && isPluralNoun(w[i + 3]?.norm ?? "") && w[i + 4] && !brokenAfter(w, i + 3)) {
      const v = w[i + 4];
      const be = { are: "is", were: "was", have: "has" }[v.norm as "are"];
      const base = !be && !v.expanded ? baseVerbAt(i + 4) : null;
      if (be || (base && (UNAMBIGUOUS_VERBS.has(base) || PLURAL_SUBJECT_VERB.test(thirdPersonOf(base))))) {
        const fix = be ?? thirdPersonOf(base!);
        out.push({ rule: "agreement-one-of", from: i + 4, to: i + 5, replacement: fix, category: "agreement", severity: "major", skill: "agreement", messageKo: `주어는 'one'(하나)이라서 단수 동사입니다: 'One of the ${w[i + 3].raw} ${fix}'.` });
        continue;
      }
    }
    // "Everyone in the team are ready" → "is": everyone/each is singular, whatever group follows.
    if (/^(everyone|everybody|someone|somebody|nobody|anyone|anybody|each|everything|nothing)$/.test(t) && /^(in|on|at|of|from)$/.test(n1)) {
      let k = i + 2;
      if (/^(the|our|my|your|this|that|these|those|their|us|them|you)$/.test(w[k]?.norm ?? "")) k++;
      if (w[k] && !/^(is|are|was|were|have|has)$/.test(w[k].norm)) k++;
      const v = w[k];
      const fix = v && !v.expanded ? { are: "is", were: "was", have: "has" }[v.norm as "are"] : undefined;
      if (fix && !brokenAfter(w, k - 1)) {
        out.push({ rule: "agreement-indefinite", from: k, to: k + 1, replacement: fix, category: "agreement", severity: "major", skill: "agreement", messageKo: `'${w[i].raw}'는 단수 취급이라 '${fix}'를 씁니다.` });
        continue;
      }
    }
    // "The people who works here" → "who work": the verb agrees with the noun before who/that.
    if (/^(who|that)$/.test(n1) && (SUBJECT_PLURALS.test(t) || /^(people|children|men|women|they|those)$/.test(t)) && w[i + 2] && !w[i + 2].expanded) {
      const v = w[i + 2];
      const be = { is: "are", was: "were", has: "have" }[v.norm as "is"];
      const vi = verbInfo(v.norm);
      const lexical = !be && vi && vi.form === "3sg" && PLURAL_SUBJECT_VERB.test(v.norm) ? vi.base : null;
      if ((be && t !== "that") || lexical) {
        const fix = be ?? lexical!;
        out.push({ rule: "relative-agreement", from: i + 2, to: i + 3, replacement: fix, category: "agreement", severity: "major", skill: "relative-clause", messageKo: `${w[i + 1].raw}는 앞의 '${w[i].raw}'(복수)를 가리키므로 동사도 복수형입니다: '${w[i].raw} ${w[i + 1].raw} ${fix}'.` });
        continue;
      }
    }
    // "The meeting going well" → "is going well"; "The report almost ready" → "is almost ready".
    if ((i === 0 || brokenAfter(w, i - 1)) && /^(the|our|my|your|this|that|his|her|their)$/.test(t) && /^[a-z]+$/.test(n1) && (!/^(ing|pp|past)$/.test(verbInfo(n1)?.form ?? "") || ING_NOUNS.has(n1)) && w[i + 2]) {
      const k = i + 2;
      const vi = verbInfo(w[k].norm);
      const going = vi && vi.form === "ing" && !ING_NOUNS.has(w[k].norm) && /^(well|fine|smoothly|okay|ok|great|badly|according|now|slowly|fast)$/.test(w[k + 1]?.norm ?? "") && end(k + 1 < w.length - 1 && /^(according)$/.test(w[k + 1].norm) ? w.length - 1 : k + 1);
      const ready = /^(almost|nearly|already|now|still|finally)$/.test(w[k].norm) && /^(ready|done|finished|completed)$/.test(w[k + 1]?.norm ?? "") && end(k + 1) && !/^(meeting|game|class|show|movie|session|call|match|concert|party)$/.test(n1);
      if (going || ready) {
        insert(k, "is", "be-verb", "major", "be-adj", `주어(${w[i].raw} ${w[i + 1].raw}) 뒤에 동사가 없습니다. be동사가 필요합니다: '${w[i].raw} ${w[i + 1].raw} is ${w[k].raw} ${w[k + 1].raw}'.`, "missing-be");
        continue;
      }
    }
    // "We need fewer water" → "less water": fewer is for things you count.
    if (t === "fewer" && UNCOUNTABLE.test(n1)) {
      out.push({ rule: "fewer-less", from: i, to: i + 1, replacement: "less", category: "countability", severity: "minor", skill: "countability", messageKo: `셀 수 없는 명사(${w[i + 1].raw}) 앞에서는 fewer가 아니라 less를 씁니다.` });
      continue;
    }
    // "Please reply my email" → "reply to"; "This bag belongs me" → "belongs to".
    // ("Thanks for listening everyone" said without a comma: "everyone" is who you speak to.)
    if (/^(reply|replies|replied|replying|belong|belongs|belonged|listen|listens|listened|listening)$/.test(t) && /^(my|your|his|her|our|their|this|that|these|those|the|me|him|them|us|it)$/.test(n1) && !(/^(it|that|this)$/.test(n1) && /^(is|was|will|would|can|could|has|have|had|does|did|might|must|may|should)$/.test(w[i + 2]?.norm ?? ""))) {
      insert(i + 1, "to", "preposition", "major", "verb-prep", `'${w[i].raw}'는 목적어 앞에 to가 필요합니다: '${w[i].raw} to ${w[i + 1].raw}'.`);
      continue;
    }
    // "I'm interested the new design" → "interested in"; "Thank you your help" → "for"; "Congratulations your promotion" → "on".
    const PREP_AFTER: Record<string, string> = { interested: "in", congratulations: "on", congrats: "on" };
    if (PREP_AFTER[t] && /^(the|a|an|my|your|his|her|our|their|this|that|it|these|those)$/.test(n1)) {
      insert(i + 1, PREP_AFTER[t], "preposition", "major", "verb-prep", `'${w[i].raw} ${PREP_AFTER[t]} + 명사'입니다: '${w[i].raw} ${PREP_AFTER[t]} ${w[i + 1].raw}'.`);
      continue;
    }
    // ("Thank you that's very helpful" said without a comma: "that's …" starts a new sentence.)
    if (((t === "you" && i > 0 && w[i - 1].norm === "thank") || t === "thanks") && /^(your|the|this|that|our|his|her|their|everything)$/.test(n1) && !(/^(this|that|everything)$/.test(n1) && /^(is|was|will|would|can|could|has|have|had|does|did|might|must|may|should|sounds|looks|seems|really|makes|helps|works)$/.test(w[i + 2]?.norm ?? ""))) {
      insert(i + 1, "for", "preposition", "major", "verb-prep", `'~에 감사하다'는 'thank you for + 명사'입니다: '${w[i].raw} for ${w[i + 1].raw}'.`);
      continue;
    }
    // "I'm worried the delay" → "worried about"; "Sorry the late reply" → "Sorry for" (not "I'm worried the delay will …").
    if (/^(worried|sorry|concerned|nervous|excited|upset|angry)$/.test(t) && /^(the|my|your|his|her|our|their|this|that|a|an)$/.test(n1)) {
      let k = i + 2;
      while (k < w.length && k < i + 10 && !end(k - 1) && !verbInfo(w[k].norm)?.form?.match(/^(3sg|past)$/) && !/^(will|would|is|was|are|were|can|could|might|may|has|have|had|does|did|won't|must|should)$/.test(w[k].norm)) k++;
      const clause = k < w.length && !end(k - 1) && (/^(will|would|is|was|are|were|can|could|might|may|has|have|had|does|did|must|should)$/.test(w[k].norm) || /^(3sg|past)$/.test(verbInfo(w[k].norm)?.form ?? ""));
      if (!clause) {
        const prep = t === "sorry" ? "for" : t === "excited" ? "about" : t === "upset" || t === "angry" ? "about" : "about";
        insert(i + 1, prep, "preposition", "major", "verb-prep", `'${w[i].raw}' 뒤에 명사가 오면 전치사가 필요합니다: '${w[i].raw} ${prep} ${w[i + 1].raw} …'.`);
        continue;
      }
    }
    // "apply the job" → "apply for"; "pay the dinner" → "pay for" ("pay the bill" is fine).
    if (/^(apply|applied|applying|applies)$/.test(t) && (/^(job|position|visa|loan|permit|scholarship|role|post)$/.test(n1) || (/^(the|a|this|that|my)$/.test(n1) && /^(job|position|visa|loan|permit|scholarship|role|post)$/.test(w[i + 2]?.norm ?? "")))) {
      insert(i + 1, "for", "preposition", "major", "verb-prep", `'~에 지원하다/신청하다'는 'apply for'입니다: 'apply for ${w[i + 1].raw}…'.`);
      continue;
    }
    if (/^(pay|paid|paying|pays)$/.test(t) && /^(the|my|your|our|this|that)$/.test(n1) && /^(dinner|lunch|meal|drinks|coffee|tickets|ticket|taxi|food|hotel|room|parking|breakfast|beer|wine)$/.test(w[i + 2]?.norm ?? "")) {
      insert(i + 1, "for", "preposition", "major", "verb-prep", `물건·식사 값을 내는 것은 'pay for + 명사'입니다: 'pay for ${w[i + 1].raw} ${w[i + 2].raw}' (pay the bill은 for 없이).`);
      continue;
    }
    // "I'm good at speak English" → "speaking".
    if (/^(at|of|in)$/.test(t) && i > 0 && /^(good|bad|better|great|interested|tired|afraid|capable|fond|proud|terrible|excellent)$/.test(w[i - 1].norm)) {
      const b = baseVerbAt(i + 1);
      if (b && (UNAMBIGUOUS_VERBS.has(b) || /^(speak|swim|cook|drive|sing|dance|write|read|learn|make|take|go|come|play|meet|wait|eat|talk|travel|lose|fail|miss|get)$/.test(b))) {
        out.push({ rule: "preposition-ing", from: i + 1, to: i + 2, replacement: ingOf(b), category: "verb-form", severity: "major", skill: "prep-gerund", messageKo: `전치사(${w[i].raw}) 뒤의 동사는 -ing입니다: '${w[i - 1].raw} ${w[i].raw} ${ingOf(b)}'.` });
        continue;
      }
    }
    // "How about to meet at six?" → "How about meeting".
    if (t === "about" && i > 0 && /^(how|what)$/.test(w[i - 1].norm) && n1 === "to") {
      const b = baseVerbAt(i + 2);
      if (b) {
        out.push({ rule: "how-about-ing", from: i + 1, to: i + 3, replacement: ingOf(b), category: "verb-form", severity: "major", skill: "offer-suggest", messageKo: `'How about' 뒤에는 -ing나 명사가 옵니다: 'How about ${ingOf(b)} …?'` });
        continue;
      }
    }
    // "It's same as before" → "the same" ("Same here!" and "Same to you" are fine).
    if (n1 === "same" && !/^(the|this|that|these|those|my|your|our|their|his|her|its|a|exactly|much|all)$/.test(t) && !end(i) && /^(is|was|are|were|have|has|had|it|use|using|get|got|do|did|feel|feels|like|at|in|on|of|from|with|for|order|ordered)$/.test(t)) {
      insert(i + 1, "the", "article", "minor", "articles", "same 앞에는 항상 the를 씁니다: 'the same'.", "missing-article");
      continue;
    }
    // "My boss very angry today" → "is very angry"; "We already here" → "are already here"; "She not here" → "isn't".
    if ((i === 0 || brokenAfter(w, i - 1)) && /^(the|my|our|your|his|her|their|this|that)$/.test(t) && /^[a-z]+$/.test(n1) && !verbInfo(n1) && /^(very|really|so|too|quite|extremely|always)$/.test(w[i + 2]?.norm ?? "") && /^(angry|busy|tired|happy|good|nice|expensive|cheap|hot|cold|spicy|delicious|late|slow|fast|big|small|crowded|noisy|quiet|kind|friendly|helpful|difficult|easy|important|beautiful|great|bad|high|low)$/.test(w[i + 3]?.norm ?? "")) {
      insert(i + 2, isPluralNoun(n1) ? "are" : "is", "be-verb", "major", "be-adj", `주어(${w[i].raw} ${w[i + 1].raw}) 뒤에 be동사가 필요합니다: '${w[i].raw} ${w[i + 1].raw} ${isPluralNoun(n1) ? "are" : "is"} ${w[i + 2].raw} ${w[i + 3].raw}'.`, "missing-be");
      continue;
    }
    if (/^(i|we|they|he|she|you)$/.test(t) && (i === 0 || brokenAfter(w, i - 1) || /^(and|but|so|because)$/.test(w[i - 1].norm)) && /^(already|still|not|also|just|now|almost)$/.test(n1) && /^(here|there|home|ready|late|busy|sure|available|free|done|hungry|tired|full|back|outside|inside|downstairs|upstairs|on)$/.test(w[i + 2]?.norm ?? "")) {
      const be = t === "i" ? "am" : /^(he|she)$/.test(t) ? "is" : "are";
      insert(i + 1, be, "be-verb", "major", "be-adj", `주어 뒤에 be동사가 필요합니다: '${w[i].raw} ${be} ${w[i + 1].raw} ${w[i + 2].raw}'.`, "missing-be");
      continue;
    }
    // "The report will send tomorrow" → "will be sent": a thing does not send itself.
    if (/^(report|order|shipment|file|document|parts|equipment|drawing|drawings|invoice|package|samples|sample|quotation|quote|data|results|problem|issue|contract|email|documents|files|goods|products|product|delivery|payment|slides|agenda|minutes)$/.test(t) && i > 0 && /^(the|our|your|this|that|these|those|my|their)$/.test(w[i - 1].norm) && /^(will|can|should|must|may|might|could|would)$/.test(n1)) {
      let k = i + 2;
      if (w[k]?.norm === "not") k++;
      const b = baseVerbAt(k);
      const pp = b ? participleOf(b) : "";
      const undergoes = !!b && (PASSIVE_PERFECT.has(pp) || /^(send|deliver|ship|complete|install|fix|repair|replace|check|update|prepare|review|approve|sign|cancel|postpone|solve|resolve|test|submit|process|pay|confirm|translate|print|issue|release|publish|finalize|correct|revise|forward|return|clean|inspect)$/.test(b));
      if (undergoes && (end(k) || !(DETERMINERS.has(w[k + 1].norm) || /^(it|them|us|me|him|her|you|everything|something|out|up|back)$/.test(w[k + 1].norm)))) {
        out.push({ rule: "passive-needed", from: k, to: k + 1, replacement: `be ${pp}`, category: "verb-form", severity: "major", skill: "passive", messageKo: `'${w[i - 1].raw} ${w[i].raw}'는 스스로 ${b}하는 것이 아니라 그렇게 '되는' 것이라 수동태입니다: '${w[i + 1].raw} be ${pp}'.` });
        continue;
      }
    }
    // "The meeting postponed to Friday" → "was postponed".
    if (/^(meeting|call|event|shipment|delivery|trip|flight|visit|launch|test|inspection|deadline|project|order|game|match|class|interview|appointment)$/.test(t) && i > 0 && /^(the|our|my|your|this|that)$/.test(w[i - 1].norm) && /^(postponed|cancelled|canceled|delayed|rescheduled|moved|pushed|extended)$/.test(n1) && (end(i + 1) || /^(to|until|till|because|due|by|for|again|back|until|from)$/.test(w[i + 2]?.norm ?? ""))) {
      insert(i + 1, "was", "verb-form", "major", "passive", `${w[i].raw}는 스스로 ${n1}한 것이 아니라 그렇게 '된' 것이라 수동태입니다: '${w[i - 1].raw} ${w[i].raw} was ${w[i + 1].raw}'.`, "passive-needed");
      continue;
    }
    // "The price was risen", "I was graduated in 2010": these verbs have no passive.
    if (/^(is|was|are|were|am)$/.test(t) && !w[i].expanded && /^(risen|fallen|graduated|arisen)$/.test(n1) && (n1 !== "graduated" || (i > 0 && SUBJECT_PRONOUNS.has(w[i - 1].norm)))) {
      const fix = n1 === "graduated" ? "graduated" : `${/^(are|were)$/.test(t) ? "have" : "has"} ${n1}`;
      out.push({ rule: "passive-intransitive", from: i, to: i + 2, replacement: fix, category: "verb-form", severity: "major", skill: "passive", messageKo: `'${n1}'는 목적어를 받지 않는 동사라 수동태(be + p.p.)로 쓰지 않습니다: '${fix}'.` });
      continue;
    }
    // "I'll take." → "I'll take it"; "Can you send me?" → "send it to me".
    if (t === "will" && n1 === "take" && end(i + 1) && i > 0 && /^(i|we)$/.test(w[i - 1].norm)) {
      insert(i + 2, "it", "sentence-structure", "major", "verb-object", "take는 목적어가 필요합니다: 'I'll take it.'", "missing-object");
      continue;
    }
    if (/^(send|give|show|email|forward)$/.test(t) && n1 === "me" && end(i + 1) && i > 0 && /^(you|please)$/.test(w[i - 1].norm)) {
      out.push({ rule: "missing-object", from: i + 1, to: i + 2, replacement: "it to me", category: "sentence-structure", severity: "major", skill: "verb-object", messageKo: `무엇을 보낼지 목적어가 필요합니다: '${w[i].raw} it to me' 또는 '${w[i].raw} me the file'.` });
      continue;
    }
    // "I live here for five years" → "I've lived here for five years".
    if (/^(i|we|they|you|he|she)$/.test(t) && (i === 0 || brokenAfter(w, i - 1) || /^(and|but|so)$/.test(w[i - 1].norm))) {
      const v = w[i + 1];
      const vi = verbInfo(v.norm);
      if (vi && /^(base|3sg)$/.test(vi.form) && /^(live|work|know|stay|study|teach)$/.test(vi.base)) {
        const forAt = w.findIndex((x, k) => k > i + 1 && k < i + 6 && x.norm === "for" && /^(\d+|two|three|four|five|six|seven|eight|nine|ten|a|several|many|few|over|almost|about|nearly)$/.test(w[k + 1]?.norm ?? "") && w.slice(k + 1, k + 4).some((y) => /^(years?|months?|weeks?|days?|decades?|while|long)$/.test(y.norm)));
        if (forAt > 0 && !w.slice(i + 2, forAt).some((x) => brokenAfter(w, w.indexOf(x)) || /^(will|going|next|from|until|when|if)$/.test(x.norm))) {
          const fix = `${/^(he|she)$/.test(t) ? "has" : "have"} ${participleOf(vi.base)}`;
          out.push({ rule: "present-perfect-duration", from: i + 1, to: i + 2, replacement: fix, category: "tense", severity: "major", skill: "present-perfect", messageKo: `'(지금까지) ~동안 해 왔다'는 현재완료입니다: '${w[i].raw} ${fix} … for …'.` });
          continue;
        }
      }
    }
    // "We can both talking after lunch" → "both talk": after a modal (and an adverb) comes the base form.
    if (MODALS.has(t) && /^(both|also|just|really|still|all|probably|definitely|certainly|easily|always|never)$/.test(n1) && w[i + 2] && verbInfo(w[i + 2].norm)?.form === "ing" && !ING_NOUNS.has(w[i + 2].norm) && !end(i + 1)) {
      const b = verbInfo(w[i + 2].norm)!.base;
      out.push({ rule: "modal-base", from: i + 2, to: i + 3, replacement: b, category: "verb-form", severity: "major", skill: "modal-possibility", messageKo: `조동사(${w[i].raw}) 뒤에는 동사원형이 옵니다: '${w[i].raw} ${w[i + 1].raw} ${b}'.` });
      continue;
    }
    // "I'll let you going" → "let you go".
    if (/^(let|lets|make|makes|made)$/.test(t) && /^(me|you|him|her|us|them|it)$/.test(n1) && w[i + 2] && verbInfo(w[i + 2].norm)?.form === "ing" && !ING_NOUNS.has(w[i + 2].norm) && !end(i + 1)) {
      const b = verbInfo(w[i + 2].norm)!.base;
      out.push({ rule: "let-make-base", from: i + 2, to: i + 3, replacement: b, category: "verb-form", severity: "major", skill: "verb-object", messageKo: `'${w[i].raw} + 사람 + 동사원형'입니다: '${w[i].raw} ${w[i + 1].raw} ${b}'.` });
      continue;
    }
    // "Other suppliers usually gives us 8%" → "give": an adverb between a plural subject and its verb.
    if (isPluralNoun(t) && /^(usually|always|often|normally|sometimes|never|also|still|really|just|already)$/.test(n1) && w[i + 2] && !end(i + 1) && !(i > 0 && /^(of|for|with|to|from|in|on|at|by|about)$/.test(w[i - 1].norm))) {
      const m = PLURAL_SUBJECT_VERB.exec(w[i + 2].norm);
      if (m) {
        const base = m[1] === "goe" ? "go" : m[1];
        out.push({ rule: "agreement-plural-noun", from: i + 2, to: i + 3, replacement: base, category: "agreement", severity: "major", skill: "agreement", messageKo: `주어 '${w[i].raw}'가 복수라서 동사에 -s를 붙이지 않습니다: '${base}'.` });
        continue;
      }
    }
    // "If technical questions goes through me" → "go": a plural subject without a determiner.
    if (/^(if|when|because|since|once|unless|and|but|so)$/.test(t)) {
      let k = i + 1;
      if (w[k + 1] && !verbInfo(w[k].norm) && /^[a-z]+$/.test(w[k].norm) && isPluralNoun(w[k + 1].norm) && !isPluralNoun(w[k].norm)) k++;
      const v = w[k + 1];
      const m = v ? PLURAL_SUBJECT_VERB.exec(v.norm) : null;
      if (isPluralNoun(w[k]?.norm ?? "") && !end(k) && m && !end(k + 1)) {
        const base = m[1] === "goe" ? "go" : m[1];
        out.push({ rule: "agreement-plural-noun", from: k + 1, to: k + 2, replacement: base, category: "agreement", severity: "major", skill: "agreement", messageKo: `주어 '${w.slice(i + 1, k + 1).map((x) => x.raw).join(" ")}'가 복수라서 동사에 -s를 붙이지 않습니다: '${base}'.` });
        continue;
      }
    }
    // "It was not go well" → "did not go": be + not + a verb is a do-question/negative.
    if (/^(is|was|are|were|am)$/.test(t) && !w[i].expanded && n1 === "not") {
      const b = baseVerbAt(i + 2);
      if (b && (UNAMBIGUOUS_VERBS.has(b) || /^(go|come|know|get|happen|arrive|agree|understand|see|hear|say|think|believe|seem|expect|remember|forget)$/.test(b)) && !end(i + 1) && !end(i + 2)) {
        const fix = /^(was|were)$/.test(t) ? "did" : t === "is" ? "does" : "do";
        out.push({ rule: "be-not-verb", from: i, to: i + 1, replacement: fix, category: "verb-form", severity: "major", skill: "agreement", messageKo: `일반동사의 부정은 be동사가 아니라 do/does/did + not입니다: '${fix} not ${w[i + 2].raw}'.` });
        continue;
      }
    }
    // "The fan is started vibrating" → "started vibrating": start/stop/keep + -ing is active.
    if (/^(is|was|are|were)$/.test(t) && !w[i].expanded && /^(started|stopped|finished|kept|continued|began)$/.test(n1) && w[i + 2] && verbInfo(w[i + 2].norm)?.form === "ing" && !ING_NOUNS.has(w[i + 2].norm)) {
      out.push({ rule: "be-active-verb", from: i, to: i + 1, replacement: "", category: "be-verb", severity: "major", skill: "agreement", messageKo: `'${n1} + -ing'는 능동이라 be동사가 필요 없습니다: '${w[i + 1].raw} ${w[i + 2].raw}' (또는 'has ${w[i + 1].raw} …').` });
      continue;
    }
    // "I would rather not restarting it" → "not restart"; "Sorry to keeping you waiting" → "to keep".
    if ((t === "rather" && i > 0 && /^(would|had)$/.test(w[i - 1].norm)) || (t === "to" && i > 0 && /^(sorry|nice|happy|glad|pleased|sad|ready|able|willing|unable|excited|hard|easy|love|like|want|wants|wanted|hope|plan|try|need|going|have|has|had)$/.test(w[i - 1].norm))) {
      const k = n1 === "not" && t === "rather" ? i + 2 : i + 1;
      const v = w[k];
      if (v && verbInfo(v.norm)?.form === "ing" && !ING_NOUNS.has(v.norm) && !brokenAfter(w, k - 1)) {
        const b = verbInfo(v.norm)!.base;
        out.push({ rule: t === "to" ? "to-inflected" : "rather-base", from: k, to: k + 1, replacement: b, category: "verb-form", severity: "major", skill: "purpose-to", messageKo: `'${t === "to" ? "to" : "would rather"}' 뒤에는 동사원형이 옵니다: '${b}'.` });
        continue;
      }
    }
    // "a little time more" → "a little more time".
    if (t === "a" && /^(little|few|couple)$/.test(n1) && /^(time|days|minutes|weeks|hours|money|help|information|patience|people|questions|details)$/.test(w[i + 2]?.norm ?? "") && w[i + 3]?.norm === "more") {
      out.push({ rule: "word-order", from: i + 2, to: i + 4, replacement: `more ${w[i + 2].raw}`, category: "word-order", severity: "major", skill: "word-order", messageKo: `'조금 더 ~'는 'a ${n1} more ${w[i + 2].raw}' 순서입니다.` });
      continue;
    }
    // "I'd better to get back" / "better getting back" → "better get back".
    if (t === "better" && i > 0 && /^(had|would)$/.test(w[i - 1].norm) && w[i - 1].expanded) {
      const k = n1 === "to" ? i + 2 : i + 1;
      const v = w[k];
      const vi = v ? verbInfo(v.norm) : null;
      if (v && vi && (n1 === "to" ? vi.form === "base" : vi.form === "ing" && !ING_NOUNS.has(v.norm))) {
        out.push({ rule: "had-better-base", from: i + 1, to: k + 1, replacement: vi.base, category: "verb-form", severity: "major", skill: "modal-necessity", messageKo: `'had better' 뒤에는 동사원형이 옵니다: 'I'd better ${vi.base}'.` });
        continue;
      }
    }
    // "Where are you come from?" → "do you come"; "Is you" → "Are you".
    if (/^(where|what|when|how|why)$/.test(t) && /^(are|is)$/.test(n1) && !w[i + 1].expanded && SUBJECT_PRONOUNS.has(w[i + 2]?.norm ?? "")) {
      const b = baseVerbAt(i + 3);
      if (b && /^(come|live|work|go|do|want|like|think|mean|need|know|say|feel|study|play|get)$/.test(b)) {
        out.push({ rule: "be-question-base-verb", from: i + 1, to: i + 2, replacement: /^(he|she|it)$/.test(w[i + 2].norm) ? "does" : "do", category: "verb-form", severity: "major", skill: "question-form", messageKo: `일반동사(${w[i + 3].raw})가 있는 의문문은 be동사가 아니라 do/does를 씁니다: '${w[i].raw} ${/^(he|she|it)$/.test(w[i + 2].norm) ? "does" : "do"} ${w[i + 2].raw} ${w[i + 3].raw}…?'` });
        continue;
      }
    }
    if (t === "is" && !w[i].expanded && /^(you|we|they)$/.test(n1) && (i === 0 || brokenAfter(w, i - 1))) {
      out.push({ rule: "agreement-plural", from: i, to: i + 1, replacement: /^[A-Z]/.test(w[i].raw) ? "Are" : "are", category: "agreement", severity: "major", skill: "agreement", messageKo: `주어 '${w[i + 1].raw}'에는 are를 씁니다: 'Are ${w[i + 1].raw} …?'` });
      continue;
    }
    // "It really suit you" → "suits"; "He already have" → "has": an adverb between he/she/it and the verb.
    if (/^(he|she|it)$/.test(t) && /^(really|also|always|usually|often|never|just|still|sometimes|already|only|even|probably)$/.test(n1) && !end(i + 1) && !(i > 0 && /^(do|does|did|will|would|can|could|should|may|might|must|let|make|help|to)$/.test(w[i - 1].norm))) {
      const v = w[i + 2];
      const vi = v ? verbInfo(v.norm) : null;
      if (v && vi && vi.form === "base" && v.norm === vi.base && !isSameFormParticiple(vi.base) && vi.base !== "be" && !w[i + 2].expanded) {
        const fix = vi.base === "have" ? "has" : vi.base === "do" ? "does" : thirdPersonOf(vi.base);
        out.push({ rule: "third-person-s", from: i + 2, to: i + 3, replacement: fix, category: "agreement", severity: "major", skill: "agreement", messageKo: `주어 '${w[i].raw}'는 3인칭 단수라서 '${fix}'입니다.` });
        continue;
      }
    }
    // "It's really suit you" → "It really suits you"; "It's call bingsu" → "It's called".
    if (t === "is" && w[i].expanded && i > 0 && /^(it|this|that)$/.test(w[i - 1].norm)) {
      if (n1 === "call") {
        out.push({ rule: "passive-needed", from: i + 1, to: i + 2, replacement: "called", category: "verb-form", severity: "major", skill: "passive", messageKo: "이름이 '~라고 불린다'는 수동태 'It's called …'입니다." });
        continue;
      }
      const k = /^(really|very|so)$/.test(n1) ? i + 2 : -1;
      const b = k > 0 ? baseVerbAt(k) : null;
      if (b && /^(suit|fit|look|sound|taste|smell|feel|work|help|matter|seem)$/.test(b)) {
        out.push({ rule: "be-base-verb", from: i - 1, to: k + 1, replacement: `${w[i - 1].raw.replace(/['’]s$/i, "")} ${n1 === "very" ? "really" : n1} ${thirdPersonOf(b)}`, category: "verb-form", severity: "major", skill: "agreement", messageKo: `be동사와 일반동사를 함께 쓰지 않습니다: 'It ${n1 === "very" ? "really" : n1} ${thirdPersonOf(b)} …'.` });
        continue;
      }
    }
    // "It very suits you" → "It really suits you": very does not modify a verb.
    if (/^(he|she|it|i|we|you|they)$/.test(t) && n1 === "very" && w[i + 2] && /^(base|3sg|past)$/.test(verbInfo(w[i + 2].norm)?.form ?? "") && !/^(much|well|good|bad|nice|busy)$/.test(w[i + 2].norm)) {
      out.push({ rule: "very-verb", from: i + 1, to: i + 2, replacement: "really", category: "word-choice", severity: "major", skill: "degree", messageKo: `very는 동사를 꾸미지 않습니다: '${w[i].raw} really ${w[i + 2].raw}' (또는 '… very much').` });
      continue;
    }
    // "I think I have cold" → "a cold"; "My son is fever" → "has a fever".
    if (/^(have|has|had|got|caught|catch)$/.test(t) && n1 === "cold" && end(i + 1)) {
      insert(i + 1, "a", "article", "minor", "articles", "감기에 걸렸다는 'have a cold'처럼 a가 필요합니다.", "missing-article");
      continue;
    }
    if (/^(is|am|are|was)$/.test(t) && !w[i].expanded && /^(fever|cold|headache|toothache|stomachache|flu)$/.test(n1) && i > 0) {
      const has = /^(am|are)$/.test(t) ? "have" : t === "was" ? "had" : "has";
      out.push({ rule: "have-symptom", from: i, to: i + 2, replacement: `${has} ${n1 === "flu" ? "the flu" : `a ${n1}`}`, category: "verb-form", severity: "major", skill: "collocation", messageKo: `증상은 be가 아니라 have로 말합니다: '${has} ${n1 === "flu" ? "the flu" : `a ${n1}`}'.` });
      continue;
    }
    // "It has been rained all week" / "It's been rain" → "raining".
    if (t === "been" && /^(rained|rain|snowed|snow)$/.test(n1)) {
      const ing = /^rain/.test(n1) ? "raining" : "snowing";
      out.push({ rule: "weather-progressive", from: i + 1, to: i + 2, replacement: ing, category: "verb-form", severity: "major", skill: "present-perfect", messageKo: `계속 비/눈이 온 것은 'It has been ${ing}'입니다.` });
      continue;
    }
    // "I haven't could go" → "I couldn't go"; a modal never follows have.
    if (/^(have|has|had)$/.test(t) && n1 === "not" && MODALS.has(w[i + 2]?.norm ?? "")) {
      out.push({ rule: "have-modal", from: i, to: i + 3, replacement: `${w[i + 2].raw} not`, category: "verb-form", severity: "major", skill: "modal-possibility", messageKo: `have 뒤에 조동사를 쓸 수 없습니다: '${w[i + 2].raw} not …' (또는 'haven't been able to …').` });
      continue;
    }
    // "I'll show around you" → "show you around".
    if (/^(show|showed|showing|shows)$/.test(t) && n1 === "around" && /^(you|him|her|them|us|me)$/.test(w[i + 2]?.norm ?? "")) {
      out.push({ rule: "particle-order", from: i + 1, to: i + 3, replacement: `${w[i + 2].raw} around`, category: "word-order", severity: "major", skill: "phrasal-verb", messageKo: `대명사는 동사와 around 사이에 둡니다: '${w[i].raw} ${w[i + 2].raw} around'.` });
      continue;
    }
    // "How about have lunch?" → "having lunch".
    if (t === "about" && i > 0 && /^(how|what)$/.test(w[i - 1].norm) && /^(have|be|do|get|make|take|order|book|call|check|meet|go|try|eat|ask|send|grab|start|finish|move|ask)$/.test(n1) && !end(i + 1)) {
      out.push({ rule: "how-about-ing", from: i + 1, to: i + 2, replacement: ingOf(n1), category: "verb-form", severity: "major", skill: "offer-suggest", messageKo: `'How about' 뒤에는 -ing가 옵니다: 'How about ${ingOf(n1)} …?'` });
      continue;
    }
    // "Let's meet at downstairs" → "downstairs" (these words are already adverbs of place).
    if (/^(at|to|in)$/.test(t) && /^(downstairs|upstairs|outside|inside|abroad|overseas|here|there|home)$/.test(n1) && !(t === "at" && n1 === "home") && !(t === "in" && /^(here|there)$/.test(n1)) && !(n1 === "outside" && /^(of)$/.test(w[i + 2]?.norm ?? "")) && !(t !== "at" && /^(inside|outside)$/.test(n1) && DETERMINERS.has(w[i + 2]?.norm ?? ""))) {
      out.push({ rule: "extra-preposition", from: i, to: i + 1, replacement: "", category: "preposition", severity: "major", skill: "verb-prep", messageKo: `'${n1}'는 그 자체로 장소 부사라서 앞에 ${t}를 쓰지 않습니다: '${n1}'.` });
      continue;
    }
    // "I've always want to go" → "always wanted".
    if (/^(have|has)$/.test(t) && /^(always|never|just|already|ever|recently|finally)$/.test(n1) && i > 0 && SUBJECT_PRONOUNS.has(w[i - 1].norm)) {
      const b = baseVerbAt(i + 2);
      if (b && participleOf(b) !== b && !isSameFormParticiple(b) && !/(run|come)$/.test(b)) {
        out.push({ rule: "perfect-base-verb", from: i + 2, to: i + 3, replacement: participleOf(b), category: "verb-form", severity: "major", skill: "present-perfect", messageKo: `have + 과거분사입니다: '${w[i].raw} ${n1} ${participleOf(b)}'.` });
        continue;
      }
    }
    // "I have a lot of friend" → "friends".
    if (/^(of)$/.test(t) && i > 1 && w[i - 1].norm === "lot" && /^(a)$/.test(w[i - 2].norm) && COUNTABLE_NOUNS.has(n1) || (t === "lots" && n1 === "of" && COUNTABLE_NOUNS.has(w[i + 2]?.norm ?? ""))) {
      const k = t === "lots" ? i + 2 : i + 1;
      if (ends(k) || end(k)) {
        const pl = PLURAL_OF[w[k].norm] ?? (/(s|sh|ch|x)$/.test(w[k].norm) ? `${w[k].norm}es` : /[^aeiou]y$/.test(w[k].norm) ? w[k].norm.replace(/y$/, "ies") : `${w[k].norm}s`);
        out.push({ rule: "plural-needed", from: k, to: k + 1, replacement: pl, category: "countability", severity: "minor", skill: "countability", messageKo: `'a lot of' 뒤의 셀 수 있는 명사는 복수형입니다: '${pl}'.` });
        continue;
      }
    }
    // "That sounds great plan" → "sounds like a great plan".
    if (/^(sound|sounds|sounded)$/.test(t) && SOUND_ADJ.test(n1) && /^(plan|idea|place|time|deal|trip|choice|option|weekend|day)$/.test(w[i + 2]?.norm ?? "")) {
      out.push({ rule: "sound-like-noun", from: i + 1, to: i + 1, replacement: `like ${anOf(n1)}`, category: "word-choice", severity: "major", skill: "reaction", messageKo: `명사가 오면 'sound like + a + 명사'입니다: '${w[i].raw} like ${anOf(n1)} ${n1} ${w[i + 2].raw}'.` });
      continue;
    }
    // "you'll make friends quick", "it went by so quick" → "quickly" (spoken American English allows it: a minor note).
    if (/^(so|really|very|pretty)?$/.test(t) === false && n1 === "quick" && end(i + 1) && verbInfo(t) && !/^(be|is|am|are|was|were|been|look|looks|seem|seems|sound|sounds|get|got|stay|keep)$/.test(t)) {
      out.push({ rule: "adverb-needed", from: i + 1, to: i + 2, replacement: "quickly", category: "word-choice", severity: "minor", skill: "degree", messageKo: "동사를 꾸밀 때는 부사 quickly를 씁니다(quick은 회화체)." });
      continue;
    }
    if (/^(went|go|goes|gone|passed|pass|fly|flies|flew)$/.test(t) && n1 === "by" && /^(so|really|very|too)$/.test(w[i + 2]?.norm ?? "") && w[i + 3]?.norm === "quick") {
      out.push({ rule: "adverb-needed", from: i + 3, to: i + 4, replacement: "quickly", category: "word-choice", severity: "minor", skill: "degree", messageKo: "동사를 꾸밀 때는 부사 quickly를 씁니다(quick은 회화체)." });
      continue;
    }
    // "Could I get a box for rest?" → "for the rest".
    if (/^(for|of|with|about)$/.test(t) && n1 === "rest" && end(i + 1)) {
      insert(i + 1, "the", "article", "minor", "articles", "'나머지'는 'the rest'입니다.", "missing-article");
      continue;
    }
    // "I should have read it more careful" → "carefully": a verb is described by an adverb.
    if (/^(read|check|checked|drive|drove|speak|spoke|listen|explain|write|handle|handled|think)$/.test(t) && !end(i)) {
      let k = i + 1;
      if (/^(it|them|this|that)$/.test(w[k].norm) && !end(k)) k++;
      if (/^(more|very|so|really|too)$/.test(w[k]?.norm ?? "") && !end(k)) k++;
      if (/^(careful|clear|slow|quiet|careless|polite)$/.test(w[k]?.norm ?? "") && (end(k) || /^(next|this|from|please|because)$/.test(w[k + 1]?.norm ?? ""))) {
        out.push({ rule: "adverb-needed", from: k, to: k + 1, replacement: `${w[k].norm}ly`.replace(/lely$/, "ly"), category: "word-choice", severity: "minor", skill: "degree", messageKo: `동사를 꾸밀 때는 부사(-ly)를 씁니다: '${w[k].norm}ly'.` });
        continue;
      }
    }
    // "What would that means in practice?" → "mean": the verb after a modal is the base form, also in a question.
    if (/^(what|how|why|where|when|who|which)$/.test(t) && MODALS.has(n1) && /^(that|this|it|he|she|they|we|you|i)$/.test(w[i + 2]?.norm ?? "") && w[i + 3]) {
      const vi = verbInfo(w[i + 3].norm);
      if (vi && vi.form === "3sg" && !w[i + 3].expanded) {
        out.push({ rule: "modal-inflected", from: i + 3, to: i + 4, replacement: vi.base, category: "verb-form", severity: "major", skill: "modal-possibility", messageKo: `조동사(${w[i + 1].raw}) 뒤에는 동사원형입니다: '${vi.base}'.` });
        continue;
      }
    }
    // "the noise level already checked by the vendor" → "was already checked": a thing done by someone needs be.
    if (/^(the|our|this|that|your|their|my)$/.test(t) && /^[a-z]+$/.test(n1) && !verbInfo(n1)) {
      let k = i + 2;
      if (w[k] && !verbInfo(w[k].norm) && /^[a-z]+$/.test(w[k].norm) && !/^(already|just|also|still)$/.test(w[k].norm)) k++;
      const adv = /^(already|just|also|recently)$/.test(w[k]?.norm ?? "") ? 1 : 0;
      const v = w[k + adv];
      const vi = v ? verbInfo(v.norm) : null;
      if (v && vi && /^(pp|past)$/.test(vi.form) && /ed$/.test(v.norm) && w[k + adv + 1]?.norm === "by" && /^(the|a|an|our|their|your|his|her|my)$/.test(w[k + adv + 2]?.norm ?? "") && (i === 0 || brokenAfter(w, i - 1) || /^(and|but|so|because|that)$/.test(w[i - 1].norm))) {
        const be = isPluralNoun(w[k - 1].norm) ? "were" : "was";
        insert(k, be, "be-verb", "major", "passive", `'~에 의해 …되었다'는 수동태(be + p.p.)입니다: '… ${be} ${adv ? `${w[k].raw} ` : ""}${v.raw} by …'.`, "passive-missing-be");
        continue;
      }
    }
    // "we are all agree" → "we all agree": be + all/both + a verb.
    if (/^(are|is|am|were|was)$/.test(t) && !w[i].expanded && /^(all|both)$/.test(n1)) {
      const b = baseVerbAt(i + 2);
      if (b && /^(agree|need|want|like|think|know|feel|understand|believe|hope|see)$/.test(b)) {
        out.push({ rule: "be-base-verb", from: i, to: i + 1, replacement: "", category: "verb-form", severity: "major", skill: "agreement", messageKo: `be동사와 일반동사(${w[i + 2].raw})를 함께 쓰지 않습니다: '… ${n1} ${w[i + 2].raw}'.` });
        continue;
      }
    }
    // "It's go well", "You were freeze" → be + a bare verb.
    if (/^(is|was|are|were|am)$/.test(t) && i > 0 && /^(it|you|he|she|we|they|i|that|this)$/.test(w[i - 1].norm)) {
      const b = baseVerbAt(i + 1);
      if (b && /^(go|freeze|work|come|happen|break|stop|start|run|look|seem|need|want|know|get)$/.test(b) && w[i + 1].norm === b && !(b === "work" && end(i + 1))) {
        out.push({ rule: "be-base-verb", from: i + 1, to: i + 2, replacement: b === "freeze" ? "frozen" : ingOf(b), category: "verb-form", severity: "major", skill: "progressive", messageKo: `be동사 뒤에 동사원형을 쓰지 않습니다: '${w[i].raw} ${b === "freeze" ? "frozen" : ingOf(b)}'.` });
        continue;
      }
    }
    // "Let me helps you" → "help"; "would you like to goes" → "go".
    if ((t === "me" && i > 0 && /^(let|lets)$/.test(w[i - 1].norm)) || t === "to") {
      const v = w[i + 1];
      const vi = v ? verbInfo(v.norm) : null;
      if (vi && vi.form === "3sg" && !v!.expanded && (UNAMBIGUOUS_VERBS.has(vi.base) || /^(go|help|come|make|take|get|see|know|tell|say|ask|check|send|call|show|give|try|start|finish|meet|have|do)$/.test(vi.base)) && !(t === "to" && i > 0 && /^(next|close|due|according|thanks|compared|up|down|back|similar|related|in|on|from|go|went|goes|listen|talk|speak|reply|respond)$/.test(w[i - 1].norm))) {
        out.push({ rule: "to-inflected", from: i + 1, to: i + 2, replacement: vi.base, category: "verb-form", severity: "major", skill: "purpose-to", messageKo: `'${w[i].raw}' 뒤에는 동사원형입니다: '${vi.base}'.` });
        continue;
      }
    }
    // "Have you ever be to Korea?" → "been".
    if (/^(have|has)$/.test(t) && SUBJECT_PRONOUNS.has(n1) && w[i + 2] && (i === 0 || brokenAfter(w, i - 1))) {
      const k = /^(ever|never|already|just)$/.test(w[i + 2]?.norm ?? "") ? i + 3 : i + 2;
      // "Have you saw the notebook?" → "seen": a past form that is not the participle.
      const pv = w[k] ? verbInfo(w[k].norm) : null;
      if (pv && pv.form === "past" && participleOf(pv.base) !== w[k].norm) {
        out.push({ rule: "perfect-base-verb", from: k, to: k + 1, replacement: participleOf(pv.base), category: "verb-form", severity: "major", skill: "present-perfect", messageKo: `have + 과거분사입니다: '${participleOf(pv.base)}'.` });
        continue;
      }
      const b = w[k]?.norm === "be" ? "be" : baseVerbAt(k);
      if (b && participleOf(b) !== b && !isSameFormParticiple(b) && w[k].norm === b && (b === "be" || UNAMBIGUOUS_VERBS.has(b) || /^(go|eat|see|try|visit|meet|hear|do|make|take|get)$/.test(b))) {
        out.push({ rule: "perfect-base-verb", from: k, to: k + 1, replacement: participleOf(b), category: "verb-form", severity: "major", skill: "present-perfect", messageKo: `have + 과거분사입니다: 'Have you ever ${participleOf(b)} …?'` });
        continue;
      }
    }
    // "If there are any mistake" → "mistakes".
    if (/^(are|were)$/.test(t) && i > 0 && w[i - 1].norm === "there" && /^(any|some|many|several|no)$/.test(n1) && COUNTABLE_NOUNS.has(w[i + 2]?.norm ?? "") && ends(i + 2)) {
      const n = w[i + 2].norm;
      const pl = PLURAL_OF[n] ?? `${n}s`;
      out.push({ rule: "plural-needed", from: i + 2, to: i + 3, replacement: pl, category: "countability", severity: "minor", skill: "countability", messageKo: `'there are ${n1}' 뒤의 셀 수 있는 명사는 복수형입니다: '${pl}'.` });
      continue;
    }
    // "I shared it to everyone" → "with everyone".
    if (/^(share|shared|sharing|shares)$/.test(t) && /^(it|this|that|them|the)$/.test(n1)) {
      let k = i + 2;
      if (n1 === "the") k++;
      if (w[k]?.norm === "to" && /^(everyone|everybody|me|you|us|them|him|her|the|all)$/.test(w[k + 1]?.norm ?? "")) {
        out.push({ rule: "preposition-collocation", from: k, to: k + 1, replacement: "with", category: "preposition", severity: "major", skill: "verb-prep", messageKo: "'~와 공유하다'는 'share … with + 사람'입니다." });
        continue;
      }
    }
    // "What time starts the plant tour?" → "does the plant tour start".
    if (t === "time" && i > 0 && w[i - 1].norm === "what" && /^(starts|begins|ends|opens|closes|leaves|arrives|finishes)$/.test(n1) && /^(the|your|our|this)$/.test(w[i + 2]?.norm ?? "")) {
      out.push({ rule: "question-word-order", from: i + 1, to: i + 2, replacement: "does", category: "word-order", severity: "major", skill: "question-form", messageKo: `의문문은 'What time does + 주어 + 동사원형?'입니다: 'What time does … ${verbInfo(n1)?.base ?? n1}?'` });
      continue;
    }
    // "What does people usually eat?" → "do": does goes with a singular subject.
    if (/^(does|doesn't)$/.test(t) && (n1 === "people" || isPluralNoun(n1) || (/^(the|your|our|these|those|my)$/.test(n1) && isPluralNoun(w[i + 2]?.norm ?? "")))) {
      out.push({ rule: "agreement-plural", from: i, to: i + 1, replacement: "do", category: "agreement", severity: "major", skill: "agreement", messageKo: "주어가 복수라서 does가 아니라 do를 씁니다." });
      continue;
    }
    // "nobody mind" → "minds": nobody/everybody/someone take a singular verb.
    if (/^(nobody|everybody|everyone|someone|somebody|anyone|no-one)$/.test(t) && !(i > 0 && /^(if|whether|let|make|help|see|saw|hear|do|does|did|will|would|can|could|should|may|might|must|shall)$/.test(w[i - 1].norm))) {
      const b = baseVerbAt(i + 1);
      if (b && w[i + 1].norm === b && /^(mind|know|care|want|need|like|think|work|live|come|go|say|understand|agree|remember|wants)$/.test(b)) {
        out.push({ rule: "agreement-indefinite", from: i + 1, to: i + 2, replacement: thirdPersonOf(b), category: "agreement", severity: "major", skill: "agreement", messageKo: `'${w[i].raw}'는 단수 취급이라 '${thirdPersonOf(b)}'입니다.` });
        continue;
      }
    }
    // "we might have skip the warehouse" → "have skipped".
    if (MODALS.has(t) && n1 === "have" && w[i + 2]) {
      const b = baseVerbAt(i + 2);
      if (b && w[i + 2].norm === b && participleOf(b) !== b && !isSameFormParticiple(b) && !/^(to|got)$/.test(w[i + 2].norm) && (UNAMBIGUOUS_VERBS.has(b) || /^(skip|miss|go|see|forget|leave|take|make|lose|break|do|eat|meet|call|tell)$/.test(b))) {
        out.push({ rule: "perfect-base-verb", from: i + 2, to: i + 3, replacement: participleOf(b), category: "verb-form", severity: "major", skill: "present-perfect", messageKo: `'${w[i].raw} have' 뒤에는 과거분사입니다: '${w[i].raw} have ${participleOf(b)}'.` });
        continue;
      }
    }
    // "Would you like have some coffee?" → "like to have".
    if (t === "like" && i > 0 && (w[i - 1].norm === "would" || (SUBJECT_PRONOUNS.has(w[i - 1].norm) && w[i - 2]?.norm === "would"))) {
      if (/^(have|go|come|see|try|join|ask|order|eat|drink|take|make|talk|check|start|book|visit|meet|know|get|stay|sit|leave)$/.test(n1)) {
        insert(i + 1, "to", "verb-form", "major", "purpose-to", `'would like' 뒤에 동사가 오면 'to + 동사원형'입니다: 'like to ${w[i + 1].raw}'.`, "missing-to");
        continue;
      }
    }
    // "I was wondered if" → "was wondering"; "is being renovate" → "being renovated".
    if (/^(was|were|am|is|are)$/.test(t) && n1 === "wondered" && /^(if|whether)$/.test(w[i + 2]?.norm ?? "")) {
      out.push({ rule: "verb-form", from: i + 1, to: i + 2, replacement: "wondering", category: "verb-form", severity: "major", skill: "polite-request", messageKo: "'~할까 해서요'는 'I was wondering if …'입니다." });
      continue;
    }
    if (t === "being") {
      const b = baseVerbAt(i + 1);
      if (b && w[i + 1].norm === b && participleOf(b) !== b && i > 0 && /^(is|are|was|were|am)$/.test(w[i - 1].norm)) {
        out.push({ rule: "passive-needed", from: i + 1, to: i + 2, replacement: participleOf(b), category: "verb-form", severity: "major", skill: "passive", messageKo: `수동 진행형은 'being + 과거분사'입니다: 'being ${participleOf(b)}'.` });
        continue;
      }
    }
    // "Did you ever ate naengmyeon?" → "eat".
    if (/^(did|didn't)$/.test(t) && SUBJECT_PRONOUNS.has(n1) && /^(ever|really|just|already|actually)$/.test(w[i + 2]?.norm ?? "") && w[i + 3]) {
      const vi = verbInfo(w[i + 3].norm);
      if (vi && vi.form === "past" && vi.base !== w[i + 3].norm) {
        out.push({ rule: "do-past", from: i + 3, to: i + 4, replacement: vi.base, category: "verb-form", severity: "major", skill: "question-form", messageKo: `did 뒤에는 동사원형입니다: '${vi.base}'.` });
        continue;
      }
    }
    // "at least two spare seal" → "seals": a number with an adjective before the noun.
    if (/^(two|three|four|five|six|seven|eight|nine|ten|several|many|\d+)$/.test(t) && !(t === "1") && /^(spare|extra|new|more|other|different|small|big|large|main|good|old|additional|free|empty)$/.test(n1) && (COUNTABLE_NOUNS.has(w[i + 2]?.norm ?? "") || /^(seal|part|filter|bolt|gasket|unit|item|box|bag|room|day|week|hour|minute|copy|cup|bottle|chair|table|laptop|screen|monitor|cable|battery)$/.test(w[i + 2]?.norm ?? "")) && ends(i + 2) && w[i + 2].norm !== "staff") {
      const n = w[i + 2].norm;
      const pl = PLURAL_OF[n] ?? `${n}s`;
      out.push({ rule: "number-singular", from: i + 2, to: i + 3, replacement: pl, category: "countability", severity: "major", skill: "countability", messageKo: `둘 이상이면 복수형입니다: '${w[i].raw} ${n1} ${pl}'.` });
      continue;
    }
    // "Can everyone reads the numbers?" → "read".
    if (MODALS.has(t) && /^(everyone|everybody|anyone|anybody|someone|somebody|he|she|it)$/.test(n1) && w[i + 2]) {
      const vi = verbInfo(w[i + 2].norm);
      if (vi && vi.form === "3sg" && !w[i + 2].expanded) {
        out.push({ rule: "modal-inflected", from: i + 2, to: i + 3, replacement: vi.base, category: "verb-form", severity: "major", skill: "modal-possibility", messageKo: `조동사(${w[i].raw}) 뒤에는 동사원형입니다: '${vi.base}'.` });
        continue;
      }
    }
    // "It works quite good" → "quite well".
    if (/^(works|worked|work|working|went|goes|go|runs|ran|run|performs|performed)$/.test(t) && /^(quite|really|very|pretty|so|too)$/.test(n1) && w[i + 2]?.norm === "good" && end(i + 2)) {
      out.push({ rule: "adverb-needed", from: i + 2, to: i + 3, replacement: "well", category: "word-choice", severity: "major", skill: "degree", messageKo: `동사를 꾸밀 때는 good이 아니라 well입니다: '${w[i].raw} ${n1} well'.` });
      continue;
    }
    // "We agreed the price" → "agreed on the price"; "agree the terms" is British but not what a learner means.
    if (/^(agree|agreed|agrees|agreeing)$/.test(t) && /^(the|a|our|your|their|this|that)$/.test(n1) && /^(price|prices|deal|date|dates|schedule|terms|budget|plan|timeline|deadline|discount|amount|fee|rate|details|time|venue|contract)$/.test(w[i + 2]?.norm ?? "") && !(w[i + 3] && (/^(is|are|was|were|will|would|should|can|could|has|have|looks|sounds|works|seems|makes|needs)$/.test(w[i + 3].norm)))) {
      insert(i + 1, "on", "preposition", "major", "verb-prep", `'~에 합의하다'는 'agree on + 명사'입니다: '${w[i].raw} on ${n1} ${w[i + 2].raw}'.`);
      continue;
    }
    // "I graduated Seoul University" → "graduated from".
    if (/^(graduate|graduated|graduating|graduates)$/.test(t) && i > 0 && !DETERMINERS.has(w[i - 1].norm) && (/^[A-Z][a-z]/.test(w[i + 1].raw) || /^(university|college|school|high|the|my|a)$/.test(n1)) && !/^(in|from|with|last|this|next|early|soon)$/.test(n1)) {
      insert(i + 1, "from", "preposition", "major", "verb-prep", `'~를 졸업하다'는 'graduate from + 학교'입니다: '${w[i].raw} from ${w[i + 1].raw}'.`);
      continue;
    }
    // "The order delivered yesterday." → "was delivered": a thing cannot deliver itself.
    if (i >= 1 && /^(the|my|our|your|their|this|that)$/.test(w[i - 1].norm) && (i === 1 || brokenAfter(w, i - 2)) && /^(order|package|parcel|parts|part|shipment|delivery|report|file|email|invoice|contract|machine|pump|issue|problem|bug|meeting|event|samples|sample|room|car|laptop)$/.test(t) && /^(delivered|sent|fixed|repaired|cancelled|canceled|postponed|signed|approved|booked|installed|replaced|solved|resolved)$/.test(n1) && (end(i + 1) || /^(yesterday|today|already|last|this|on|at|by|in|this|early|late|two|three|an|a)$/.test(w[i + 2]?.norm ?? "")) && !(w[i + 2] && /^(it|itself|themselves|them|me|us|him|her|the|my|our|your)$/.test(w[i + 2].norm))) {
      const plural = t === "parts" || t === "samples";
      out.push({ rule: "passive-missing-be", from: i + 1, to: i + 1, replacement: plural ? "were" : "was", category: "verb-form", severity: "major", skill: "passive", messageKo: `사물이 '~되었다'는 수동태 'be + p.p.'입니다: '${w[i - 1].raw} ${w[i].raw} ${plural ? "were" : "was"} ${w[i + 1].raw}'.` });
      continue;
    }
    // "if you have any question" → "any questions": 'any' with a countable noun in a question or if-clause is plural.
    if (t === "any" && i > 0 && (/^(have|has|had)$/.test(w[i - 1].norm) || (w[i - 1].norm === "there" && w[i - 2]?.norm === "are")) && /^(question|problem|issue|comment|suggestion|concern|update|change)$/.test(n1) && ends(i + 1)) {
      out.push({ rule: "any-plural", from: i + 1, to: i + 2, replacement: `${n1}s`, category: "countability", severity: "minor", skill: "countability", messageKo: `'any' 뒤의 셀 수 있는 명사는 보통 복수형입니다: 'any ${n1}s'.` });
      continue;
    }
    // "Could you borrow me your pen?" → "lend me": borrow is taking, lend is giving.
    if (/^(borrow|borrows|borrowed)$/.test(t) && /^(me|us|him|her|them)$/.test(n1) && w[i + 2] && (DETERMINERS.has(w[i + 2].norm) || /^(some|your|his|her|their|our)$/.test(w[i + 2].norm))) {
      const lend = t === "borrowed" ? "lent" : t === "borrows" ? "lends" : "lend";
      out.push({ rule: "borrow-lend", from: i, to: i + 1, replacement: lend, category: "word-choice", severity: "major", skill: "collocation", messageKo: `빌려주는 것은 'lend', 빌리는 것은 'borrow'입니다: '${lend} ${n1} …' 또는 'Can I borrow …?'.` });
      continue;
    }
    // "How do you think about it?" → "What do you think about it?".
    if (t === "how" && /^(do|did|does)$/.test(n1) && w[i + 2] && /^(you|they|we|he|she)$/.test(w[i + 2].norm) && w[i + 3]?.norm === "think" && (end(i + 3) || /^(about|of)$/.test(w[i + 4]?.norm ?? ""))) {
      out.push({ rule: "what-think", from: i, to: i + 1, replacement: /^[A-Z]/.test(w[i].raw) ? "What" : "what", category: "word-choice", severity: "major", skill: "opinion", messageKo: "의견을 물을 때는 'How do you think?'가 아니라 'What do you think (about it)?'입니다." });
      continue;
    }
    // "I'm used to work late" → "used to working": 'be used to' takes -ing.
    if (t === "used" && i > 1 && /^(am|is|are|was|were|be|been|getting|get|got)$/.test(w[i - 1].norm) && /^(i|we|you|they|he|she)$/.test(w[i - 2].norm) && n1 === "to") {
      const base = baseVerbAt(i + 2);
      if (base && !/^(be|make|build|clean|cut|check|measure|test|open|close|fix|cover|store|hold|move|carry|connect|support|run|keep|mark|find|show|help|process|monitor|control|calculate|save|reduce|prevent|remove|seal|cool|heat|dry|mix|transport|track|treat|replace|protect)$/.test(base)) {
        out.push({ rule: "used-to-ing", from: i + 2, to: i + 3, replacement: ingOf(base), category: "verb-form", severity: "major", skill: "prep-gerund", messageKo: `'~에 익숙하다'는 'be used to + -ing'입니다: '${w[i - 1].raw} used to ${ingOf(base)}'.` });
        continue;
      }
    }
    // "I have a plan to visit there" → "visit it / go there": visit takes an object, 'there' is an adverb.
    if (/^(visit|visited|visiting|visits)$/.test(t) && n1 === "there") {
      out.push({ rule: "visit-there", from: i, to: i + 2, replacement: t === "visit" ? "go there" : `${w[i].raw} it`, category: "word-choice", severity: "minor", skill: "collocation", messageKo: "'there'는 부사라 visit의 목적어가 될 수 없습니다: 'go there' 또는 'visit it/the place'." });
      continue;
    }
    // "Let's discuss it on next meeting" → "at the next meeting"; "in next week" → "next week".
    if (/^(on|in|at)$/.test(t) && n1 === "next" && w[i + 2] && !w[i + 2].poss && !/^(s|'s)$/.test(w[i + 3]?.norm ?? "") && !(i > 0 && /^(the|a)$/.test(w[i - 1].norm)) && !(t !== "at" && i > 0 && /^(move|check|come|log|sign|hand|turn|plug|drop|fill|kick|carry|go|try|put|switch|call|clock|hold|keep|pass|send|bring|get)$/.test(verbInfo(w[i - 1].norm)?.base ?? ""))) {
      const n2 = w[i + 2].norm;
      if (/^(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|quarter|time)$/.test(n2)) {
        out.push({ rule: "extra-preposition", from: i, to: i + 1, replacement: "", category: "preposition", severity: "major", skill: "time-clause", messageKo: `'next ${w[i + 2].raw}' 앞에는 전치사를 쓰지 않습니다: 'next ${w[i + 2].raw}'.` });
        continue;
      }
      if (/^(meeting|call|session|visit)$/.test(n2)) {
        insert(i + 1, "the", "article", "major", "articles", `'다음 회의에서'는 'at/in the next ${w[i + 2].raw}'입니다.`, "missing-article");
        continue;
      }
    }
    // "I will be late about 10 minutes" → "about 10 minutes late".
    if (t === "late" && i > 0 && /^(be|am|is|are|was|were|been|running)$/.test(w[i - 1].norm) && (/^(about|around|maybe|like)$/.test(n1) ? /^(\d+|five|ten|fifteen|twenty|thirty|a|an|two|three)$/.test(w[i + 2]?.norm ?? "") : /^(\d+|five|ten|fifteen|twenty|thirty|two|three)$/.test(n1)) && /^(minutes|minute|min|mins|hour|hours)$/.test(w[i + (/^(about|around|maybe|like)$/.test(n1) ? 3 : 2)]?.norm ?? "")) {
      const span = /^(about|around|maybe|like)$/.test(n1) ? 3 : 2;
      const amount = w.slice(i + 1, i + 1 + span).map((x) => x.raw).join(" ");
      out.push({ rule: "word-order-late", from: i, to: i + 1 + span, replacement: `${amount} late`, category: "word-order", severity: "minor", skill: "word-order", messageKo: `'~분 늦다'는 시간이 먼저 옵니다: '${amount} late'.` });
      continue;
    }
    // "Sorry for late" → "Sorry I'm late" / "Sorry for being late".
    if (t === "for" && i > 0 && /^(sorry|apologize|apologise)$/.test(w[i - 1].norm) && n1 === "late") {
      insert(i + 1, "being", "verb-form", "major", "apology", "'늦어서 미안해요'는 'Sorry for being late' 또는 'Sorry I'm late'입니다.", "missing-verb");
      continue;
    }
    // "I will inform you the result" → "inform you of the result".
    if (/^(inform|informed|informs|informing)$/.test(t) && /^(you|me|us|him|her|them|everyone)$/.test(n1) && w[i + 2] && /^(the|a|our|my|your|its|this)$/.test(w[i + 2].norm)) {
      insert(i + 2, "of", "preposition", "major", "verb-prep", `'~에게 …을 알리다'는 'inform + 사람 + of + 내용'입니다: '${w[i].raw} ${w[i + 1].raw} of ${w[i + 2].raw} …'.`);
      continue;
    }
    // "I'm not sure if I can make it or no" → "or not".
    if (t === "or" && n1 === "no" && end(i + 1) && w.slice(0, i).some((x) => /^(if|whether)$/.test(x.norm))) {
      out.push({ rule: "or-not", from: i + 1, to: i + 2, replacement: "not", category: "word-choice", severity: "major", skill: "clarify-question", messageKo: "'~인지 아닌지'는 'or not'입니다: '… or not'." });
      continue;
    }
    // "I have a question to you" → "a question for you".
    if (/^(question|questions)$/.test(t) && n1 === "to" && /^(you|him|her|them)$/.test(w[i + 2]?.norm ?? "") && end(i + 2) && i > 0 && /^(a|one|some|two|few|quick|small|another|more)$/.test(w[i - 1].norm)) {
      out.push({ rule: "preposition-collocation", from: i + 1, to: i + 2, replacement: "for", category: "preposition", severity: "major", skill: "clarify-question", messageKo: `'~에게 질문이 있다'는 'a question for ${w[i + 2].raw}'입니다.` });
      continue;
    }
    // "I prefer coffee than tea" → "to tea" (or "rather than").
    if (/^(prefer|prefers|preferred)$/.test(t)) {
      for (let k = i + 2; k <= Math.min(i + 5, w.length - 2); k++) {
        if (brokenAfter(w, k - 1)) break;
        if (w[k].norm === "than" && !w.slice(i + 1, k).some((x) => /^(more|less|better|rather|other|way|much|fewer|bigger|smaller|cheaper|faster)$/.test(x.norm) || /er$/.test(x.norm) && x.norm.length > 4 && !COUNTABLE_NOUNS.has(x.norm))) {
          out.push({ rule: "prefer-to", from: k, to: k + 1, replacement: "to", category: "preposition", severity: "major", skill: "comparative", messageKo: "'B보다 A를 선호하다'는 'prefer A to B' (또는 'A rather than B')입니다." });
          break;
        }
      }
    }
    // "I can't join to the call" → "join the call".
    if (/^(join|joined|joining|joins)$/.test(t) && n1 === "to" && /^(the|our|my|your|this|a|us|them)$/.test(w[i + 2]?.norm ?? "")) {
      out.push({ rule: "extra-preposition", from: i + 1, to: i + 2, replacement: "", category: "preposition", severity: "major", skill: "verb-object", messageKo: `join은 목적어를 바로 받습니다: '${w[i].raw} ${w[i + 2].raw} …'.` });
      continue;
    }
    // "in these days" → "these days".
    if (t === "in" && n1 === "these" && w[i + 2]?.norm === "days" && end(i + 2)) {
      out.push({ rule: "extra-preposition", from: i, to: i + 1, replacement: "", category: "preposition", severity: "minor", skill: "small-talk", messageKo: "'요즘'은 전치사 없이 'these days'입니다." });
      continue;
    }
    // "He suggested me to wait" → "suggested (that) I wait".
    if (/^(suggest|suggested|suggests)$/.test(t) && /^(me|us|him|her|them)$/.test(n1) && w[i + 2]?.norm === "to" && baseVerbAt(i + 3)) {
      const subj = { me: "I", us: "we", him: "he", her: "she", them: "they" }[n1 as "me"];
      out.push({ rule: "suggest-that", from: i + 1, to: i + 3, replacement: `(that) ${subj}`, category: "sentence-structure", severity: "major", skill: "opinion", messageKo: `'suggest' 뒤에는 '사람 + to'를 쓰지 않습니다: '${w[i].raw} (that) ${subj} ${w[i + 3].raw}'.` });
      continue;
    }
    // "My boss gave me many works" → "a lot of work".
    if (/^(many|several|few|lots)$/.test(t) && n1 === "works" && ends(i + 1)) {
      out.push({ rule: "uncountable-plural", from: i, to: i + 2, replacement: "a lot of work", category: "countability", severity: "major", skill: "countability", messageKo: "'일'이라는 뜻의 work는 셀 수 없습니다: 'a lot of work'." });
      continue;
    }
    // "I'm in charge for the project" → "in charge of".
    if (t === "charge" && i > 0 && w[i - 1].norm === "in" && /^(for|about|on|to)$/.test(n1)) {
      out.push({ rule: "preposition-collocation", from: i + 1, to: i + 2, replacement: "of", category: "preposition", severity: "major", skill: "verb-prep", messageKo: "'~을 담당하다'는 'in charge of'입니다." });
      continue;
    }
    // "Was a long day." → "It was a long day": a sentence needs a subject.
    if (/^(is|was)$/.test(t) && !w[i].expanded && (i === 0 || brokenAfter(w, i - 1)) && /^(a|an)$/.test(n1) && /^(long|great|good|nice|busy|tough|hard|fun|lovely|wonderful|crazy|productive|big)$/.test(w[i + 2]?.norm ?? "") && /^(day|week|trip|time|idea|meeting|flight|night|year|month|weekend|game|movie|one)$/.test(w[i + 3]?.norm ?? "") && end(i + 3)) {
      out.push({ rule: "missing-subject-it", from: i, to: i + 1, replacement: /^[A-Z]/.test(w[i].raw) ? `It ${t}` : `it ${t}`, category: "sentence-structure", severity: "major", skill: "be-adj", messageKo: `영어 문장에는 주어가 필요합니다: 'It ${t} ${w.slice(i + 1, i + 4).map((x) => x.raw).join(" ")}'.` });
      continue;
    }
  }
  return out;
};
const NOT_A_MODIFIER = /^(it|them|us|me|him|her|you|this|that|what|which|so|some|any|more|less|many|few|several|enough|another|other|no|each|every|one|two|three|four|five|again|not|also|just|still|really|well|better|all|both|either|neither|such|out|up|down|over|the|a|an|my|our|your|his|their|its)$/;

/** All rules in the order they run (exported for the speed profile in scripts/bench). */
export const RULES: Rule[] = [
  itsContraction,
  lexicalAgreement,
  thirdConditionalWill,
  comparisonForms,
  missingBeProgressive, waitWithoutFor, prepositionBaseVerb, modalTo, modalInflected, doubleModal, beBaseVerb,
  perfectBaseVerb, doPast, agreement, doubleComparative, willInConditionClause, uncountablePlural, everyPlural, nonWords, articleSound,
  transitivePreposition, bareSingularCountable, perfectNeedsPassive, thirdPersonBase,
  moreShortAdjective, veryVerb, enoughOrder, missingSubjectIt, missingBeAdjective, letMakeTo, thereIsPlural, numberSingular,
  sinceDuration, muchPlural, suggestTo, adjectiveBeforeVerb, timePreposition, idiomArticle, perfectFiniteBe, saidMe,
  progressiveNeedsPassive, oneMorePlural, doModal, doIndefinite, doubleConjunction, tooMuchAdjective, tooToObject, beQuestionBaseVerb, littleBit,
  nounClauseThirdPerson, byTheMeans, pluralSubjectAgreement, modalAdjective, articlePlural, forBaseVerb, sinceWithPast,
  questionWordOrder, embeddedQuestionOrder, recommendPersonThing, keepBaseVerb, talkObject, smallPhrases, passiveWithObject,
  prepositionCollocation, extraPreposition, missingPreposition, durationDeadline,
  passiveIntransitive, participleNeeded, infinitiveNeeded, gerundSubject, makeNounTo, wantThat, promiseWill,
  pluralNeeded, determinerNumber, uncountableDeterminer, theNeeded, extraArticle,
  feelingAdjective, adverbAdjectiveMore, agreementMore, wordOrderMore, miscPatterns, missingBeMore,
  invertedModalForm, toInflected, pleaseForm, beDiffer, becauseOf, thinkMissingIt,
  everydaySlips, sinceWithPresent, articleBeforeNumber, basicForms, conversationSlips, learnerSlips,
];

export function runRules(words: Token[]): RuleFinding[] {
  // One sentence at a time: no rule may read across "I did! It was …" or "I'll look into it. Do you …".
  const all: RuleFinding[] = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    if (!words[i].sentenceEnd && i < words.length - 1) continue;
    const part = words.slice(start, i + 1);
    for (const r of RULES) for (const f of r(part)) all.push({ ...f, from: f.from + start, to: f.to + start });
    start = i + 1;
  }
  // Drop findings whose ranges overlap an earlier finding (first rule wins), except that on exactly the same
  // words the more serious finding wins ("mentioned about": a major extra preposition, not a minor note).
  const SEV = { minor: 0, major: 1, critical: 2 } as const;
  const kept: RuleFinding[] = [];
  for (const f of all) {
    const same = kept.findIndex((k) => f.from === k.from && f.to === k.to);
    if (same >= 0) {
      if (SEV[f.severity] > SEV[kept[same].severity]) kept[same] = f;
      continue;
    }
    const overlaps = kept.some((k) => (f.from === f.to ? f.from > k.from && f.from < k.to : f.from < k.to && k.from < f.to));
    if (!overlaps) kept.push(f);
  }
  return kept;
}
