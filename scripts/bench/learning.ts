/**
 * What the grader gains by remembering answers Claude approved (core/learned.ts).
 *
 * The learner's own wording is simulated two ways:
 *  - bank: each curated "pass" probe (a correct answer worded differently from
 *    the stored ones) stands for an answer Claude approved earlier. Later
 *    answers are the same wording with a harmless change (contraction, final
 *    punctuation), or with one typical mistake planted in it.
 *  - blind A: the first of the three correct paraphrases is approved; the
 *    other two and the two wrong paraphrases come later.
 *
 * For each, the rule-based grade is compared without and with the remembered
 * answer: how many correct answers are shown at once, how many mistakes are
 * still caught, and how many wrong answers would be shown at once as fine
 * (must stay 0).
 *
 *   npx tsx scripts/bench/learning.ts
 */
import { evaluateLocal, scoredErrors } from "../../engflow/core/evaluate";
import { ruleBasedIsEnough } from "../../engflow/core/grader";
import { QUESTIONS, QUESTION_BY_ID } from "../../engflow/content";
import type { Evaluation, Question } from "../../engflow/core/types";
import { MUTATIONS } from "../grader-bench";
import { PARAPHRASES } from "./paraphrase-corpus";

const caught = (ev: Evaluation) => ev.scores.overall < 85 || scoredErrors(ev.errors).some((e) => e.category !== "spelling");
const falseAlarm = (ev: Evaluation) => ev.scores.overall < 85 || scoredErrors(ev.errors).some((e) => e.severity !== "minor");
const instantFine = (ev: Evaluation) => ruleBasedIsEnough(ev) && !caught(ev);

const HARMLESS: ((s: string) => string | null)[] = [
  (s) => s, // the same answer again
  (s) => (/[.!?]$/.test(s) ? s.slice(0, -1) : `${s}.`),
  (s) => { const t = s.replace(/\bI will\b/, "I'll").replace(/\bdo not\b/, "don't").replace(/\bwe are\b/i, (m) => (m[0] === "W" ? "We're" : "we're")).replace(/\bit is\b/i, (m) => (m[0] === "I" ? "It's" : "it's")); return t === s ? null : t; },
  (s) => { const t = s.replace(/\bI'll\b/, "I will").replace(/\bdon't\b/, "do not").replace(/\bWe're\b/, "We are").replace(/\bcan't\b/, "cannot"); return t === s ? null : t; },
];

interface Tally { n: number; before: number; after: number }
const tally = (): Tally => ({ n: 0, before: 0, after: 0 });
const add = (t: Tally, a: boolean, b: boolean) => { t.n++; if (a) t.before++; if (b) t.after++; };

export function runLearning(questions: Question[] = QUESTIONS) {
  const rightInstant = tally();
  const rightAlarm = tally();
  const wrongCaught = tally();
  const wrongInstantFine = tally();
  const bRightInstant = tally();
  const bRightAlarm = tally();
  const bWrongCaught = tally();
  const bWrongInstantFine = tally();

  for (const q of questions.filter((x) => !x.variation)) {
    for (const p of (q.probes ?? []).filter((x) => x.expect === "pass")) {
      const learned = [p.answer];
      for (const h of HARMLESS) {
        const a = h(p.answer);
        if (!a) continue;
        const e0 = evaluateLocal(q, a);
        const e1 = evaluateLocal(q, a, { learned });
        add(rightInstant, ruleBasedIsEnough(e0), ruleBasedIsEnough(e1));
        add(rightAlarm, falseAlarm(e0), falseAlarm(e1));
      }
      for (const m of MUTATIONS) {
        const wrong = m.apply(p.answer);
        if (!wrong || [q.reference, ...q.accepted].some((x) => x.toLowerCase() === wrong.toLowerCase())) continue;
        const e0 = evaluateLocal(q, wrong);
        const e1 = evaluateLocal(q, wrong, { learned });
        add(wrongCaught, caught(e0), caught(e1));
        add(wrongInstantFine, instantFine(e0), instantFine(e1));
      }
    }
  }

  for (const item of PARAPHRASES) {
    const q = QUESTION_BY_ID[item.qid];
    if (!q || item.right.length < 2) continue;
    const learned = [item.right[0]];
    for (const a of item.right.slice(1)) {
      const e0 = evaluateLocal(q, a);
      const e1 = evaluateLocal(q, a, { learned });
      add(bRightInstant, ruleBasedIsEnough(e0), ruleBasedIsEnough(e1));
      add(bRightAlarm, falseAlarm(e0), falseAlarm(e1));
    }
    for (const w of item.wrong) {
      const e0 = evaluateLocal(q, w.text);
      const e1 = evaluateLocal(q, w.text, { learned });
      add(bWrongCaught, caught(e0), caught(e1));
      add(bWrongInstantFine, instantFine(e0), instantFine(e1));
    }
  }

  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "–");
  const row = (label: string, t: Tally, asPct = true) => `| ${label} | ${t.n} | ${asPct ? pct(t.before, t.n) : t.before} | ${asPct ? pct(t.after, t.n) : t.after} |`;
  const lines = [
    "| Learner's own wording, approved once by Claude | answers | without memory | with memory |",
    "| --- | ---: | ---: | ---: |",
    row("bank: same wording again (harmless changes), shown at once", rightInstant),
    row("bank: same wording again, marked wrong", rightAlarm, false),
    row("bank: one mistake in that wording, caught", wrongCaught),
    row("bank: one mistake in that wording, shown at once as fine", wrongInstantFine, false),
    row("blind A: another correct paraphrase, shown at once", bRightInstant),
    row("blind A: another correct paraphrase, marked wrong", bRightAlarm, false),
    row("blind A: a wrong paraphrase, caught", bWrongCaught),
    row("blind A: a wrong paraphrase, shown at once as fine", bWrongInstantFine, false),
  ];
  return { lines, rightInstant, rightAlarm, wrongCaught, wrongInstantFine, bRightInstant, bRightAlarm, bWrongCaught, bWrongInstantFine };
}

if (process.argv[1]?.endsWith("learning.ts")) console.log(runLearning().lines.join("\n"));
