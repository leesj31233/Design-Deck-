/**
 * Blind test of the rule-based grader on answers written by someone who never
 * saw the grader (scripts/bench/paraphrase-corpus.ts): correct answers worded
 * differently from the stored ones, and reworded answers with one real
 * grammar mistake each.
 *
 *   npx tsx scripts/bench/blind.ts            # summary
 *   npx tsx scripts/bench/blind.ts --list     # also list every miss and false alarm
 *
 * "Shown at once" means the app would show the rule-based grade without
 * waiting for Claude (core/grader.ts ruleBasedIsEnough). A wrong answer shown
 * at once as fine is the failure that matters most.
 */
import { evaluateLocal, scoredErrors } from "../../engflow/core/evaluate";
import { ruleBasedIsEnough } from "../../engflow/core/grader";
import { QUESTION_BY_ID } from "../../engflow/content";
import type { Evaluation } from "../../engflow/core/types";
import { PARAPHRASES } from "./paraphrase-corpus";

const majorOrLow = (ev: Evaluation) => ev.scores.overall < 85 || scoredErrors(ev.errors).some((e) => e.severity !== "minor");
const anyGrammar = (ev: Evaluation) => scoredErrors(ev.errors).some((e) => e.category !== "spelling");

export function runBlind() {
  const right: { qid: string; text: string; ev: Evaluation }[] = [];
  const wrong: { qid: string; text: string; error: string; ev: Evaluation }[] = [];
  for (const item of PARAPHRASES) {
    const q = QUESTION_BY_ID[item.qid];
    if (!q) continue;
    for (const text of item.right) right.push({ qid: item.qid, text, ev: evaluateLocal(q, text) });
    for (const w of item.wrong) wrong.push({ qid: item.qid, text: w.text, error: w.error, ev: evaluateLocal(q, w.text) });
  }
  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "–");
  const falseAlarm = right.filter((r) => majorOrLow(r.ev));
  const minorNoted = right.filter((r) => !majorOrLow(r.ev) && anyGrammar(r.ev));
  const caughtStrict = wrong.filter((r) => majorOrLow(r.ev));
  const caughtAny = wrong.filter((r) => majorOrLow(r.ev) || anyGrammar(r.ev));
  const instantFine = wrong.filter((r) => ruleBasedIsEnough(r.ev) && !anyGrammar(r.ev) && r.ev.scores.overall >= 85);
  const byConf = (list: { ev: Evaluation }[], c: string) => list.filter((r) => r.ev.confidence === c).length;
  const cleanWrongBy = (c: string) => wrong.filter((r) => r.ev.confidence === c && !anyGrammar(r.ev) && r.ev.scores.overall >= 85).length;
  const cleanRightBy = (c: string) => right.filter((r) => r.ev.confidence === c && !anyGrammar(r.ev) && r.ev.scores.overall >= 85).length;
  const lines = [
    `Correct answers marked wrong (false alarm): ${falseAlarm.length} of ${right.length} (${pct(falseAlarm.length, right.length)}); with a minor note only: ${minorNoted.length}`,
    `Wrong answers caught as a major error or below 85: ${pct(caughtStrict.length, wrong.length)} of ${wrong.length}; with any grammar note: ${pct(caughtAny.length, wrong.length)}`,
    `Wrong answers shown at once as fine (must be 0): ${instantFine.length}`,
    `Correct answers shown at once: ${pct(right.filter((r) => ruleBasedIsEnough(r.ev)).length, right.length)}`,
    "",
    "| Confidence | right answers | right with nothing found | wrong answers | wrong with nothing found |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...["high", "medium", "low"].map((c) => `| ${c} | ${byConf(right, c)} | ${cleanRightBy(c)} | ${byConf(wrong, c)} | ${cleanWrongBy(c)} |`),
  ];
  return { right, wrong, falseAlarm, caughtStrict, caughtAny, instantFine, lines };
}

if (process.argv[1]?.endsWith("blind.ts")) {
  const r = runBlind();
  console.log(r.lines.join("\n"));
  if (process.argv.includes("--list")) {
    console.log("\nFalse alarms (correct answers marked wrong):");
    for (const x of r.falseAlarm) console.log(`  ${x.ev.scores.overall} ${x.ev.confidence.padEnd(6)} ${x.qid.padEnd(40)} ${x.text}\n      ${scoredErrors(x.ev.errors).filter((e) => e.category !== "spelling").map((e) => `${e.severity} ${e.category} [${e.source}] '${e.text}'→'${e.fix}'`).join("; ")}`);
    console.log("\nMissed (wrong answers with no grammar note):");
    for (const x of r.wrong.filter((w) => !r.caughtAny.includes(w))) console.log(`  ${x.ev.scores.overall} ${x.ev.confidence.padEnd(6)} ${x.error.padEnd(28)} ${x.text}`);
  }
}
