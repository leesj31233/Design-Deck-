/**
 * Blind test of the rule-based grader on answers written by someone who never
 * saw the grader (scripts/bench/paraphrase-corpus.ts): correct answers worded
 * differently from the stored ones, and reworded answers with one real
 * grammar mistake each.
 *
 *   npx tsx scripts/bench/blind.ts            # summary (set A)
 *   npx tsx scripts/bench/blind.ts --list     # also list every miss and false alarm
 *   npx tsx scripts/bench/blind.ts --set b    # held-out set B (paraphrase-corpus-b.ts)
 *   npx tsx scripts/bench/blind.ts --set b --causes   # counts by cause only (no items: keeps B held out)
 *
 * "Shown at once" means the app would show the rule-based grade without
 * waiting for Claude (core/grader.ts ruleBasedIsEnough). A wrong answer shown
 * at once as fine is the failure that matters most.
 */
import { evaluateLocal, rankTargets, scoredErrors } from "../../engflow/core/evaluate";
import { tokenize, words } from "../../engflow/core/text";
import { ruleBasedIsEnough } from "../../engflow/core/grader";
import { QUESTION_BY_ID } from "../../engflow/content";
import type { Evaluation } from "../../engflow/core/types";
import { PARAPHRASES, type ParaphraseItem } from "./paraphrase-corpus";

const majorOrLow = (ev: Evaluation) => ev.scores.overall < 85 || scoredErrors(ev.errors).some((e) => e.severity !== "minor");
const anyGrammar = (ev: Evaluation) => scoredErrors(ev.errors).some((e) => e.category !== "spelling");

export function runBlind(items: ParaphraseItem[] = PARAPHRASES) {
  const right: { qid: string; text: string; ev: Evaluation }[] = [];
  const wrong: { qid: string; text: string; error: string; ev: Evaluation }[] = [];
  for (const item of items) {
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const r = runBlind(process.argv.includes("--set") && process.argv[process.argv.indexOf("--set") + 1] === "b" ? (require("./paraphrase-corpus-b").PARAPHRASES as ParaphraseItem[]) : PARAPHRASES);
  console.log(r.lines.join("\n"));
  if (process.argv.includes("--bands")) {
    // Where would a different "close enough to trust" cut-off put right and wrong answers that show nothing?
    const bands = [0.1, 0.2, 0.25, 0.3, 0.35, 0.45, 1];
    const rows = bands.map((b) => ({ b, right: 0, rightClean: 0, wrong: 0, wrongClean: 0 }));
    const clean = (ev: Evaluation) => !anyGrammar(ev) && ev.scores.overall >= 85;
    const dist = (qid: string, text: string) => rankTargets(QUESTION_BY_ID[qid]!, words(tokenize(text)))[0].al.distance;
    for (const x of r.right) { const row = rows.find((k) => dist(x.qid, x.text) <= k.b)!; row.right++; if (clean(x.ev)) row.rightClean++; }
    for (const x of r.wrong) { const row = rows.find((k) => dist(x.qid, x.text) <= k.b)!; row.wrong++; if (clean(x.ev)) row.wrongClean++; }
    console.log("\n| distance ≤ | right | right, nothing found | wrong | wrong, nothing found |\n| ---: | ---: | ---: | ---: | ---: |");
    for (const k of rows) console.log(`| ${k.b} | ${k.right} | ${k.rightClean} | ${k.wrong} | ${k.wrongClean} |`);
  }
  if (process.argv.includes("--causes")) {
    // Counts only (safe for the held-out set): why correct answers were marked wrong, and which kinds of mistakes slip through.
    const tally = (keys: string[]) => Object.entries(keys.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
    const causes = r.falseAlarm.flatMap((x) => {
      const out = scoredErrors(x.ev.errors).filter((e) => e.severity !== "minor").map((e) => `${e.severity} ${e.category} [${e.source}]`);
      const missing = x.ev.meaning.filter((m) => !m.present);
      if (missing.some((m) => m.critical)) out.push("critical meaning chunk missing");
      else if (missing.length) out.push("meaning chunk missing (not critical)");
      if (!out.length) out.push(`only minor notes (score ${x.ev.scores.overall < 80 ? "<80" : "80-84"})`);
      return [...new Set(out)];
    });
    console.log("\nFalse alarm causes (an answer can have several):");
    for (const [k, n] of tally(causes)) console.log(`  ${String(n).padStart(3)}  ${k}`);
    const bankOf = (qid: string) => qid.replace(/-[^-]+(-[^-]+)*$/, (m) => m.split("-").slice(0, 2).join("-")).split("-").slice(0, 2).join("-");
    console.log("\nFalse alarms by question family (id prefix):");
    for (const [k, n] of tally(r.falseAlarm.map((x) => bankOf(x.qid)))) console.log(`  ${String(n).padStart(3)}  ${k}`);
    console.log("\nMissed mistakes by kind (no grammar note):");
    for (const [k, n] of tally(r.wrong.filter((w) => !r.caughtAny.includes(w)).map((w) => w.error))) console.log(`  ${String(n).padStart(3)}  ${k}`);
  }
  if (process.argv.includes("--list")) {
    console.log("\nFalse alarms (correct answers marked wrong):");
    for (const x of r.falseAlarm) console.log(`  ${x.ev.scores.overall} ${x.ev.confidence.padEnd(6)} ${x.qid.padEnd(40)} ${x.text}\n      ${scoredErrors(x.ev.errors).filter((e) => e.category !== "spelling").map((e) => `${e.severity} ${e.category} [${e.source}] '${e.text}'→'${e.fix}'`).join("; ")}`);
    console.log("\nMissed (wrong answers with no grammar note):");
    for (const x of r.wrong.filter((w) => !r.caughtAny.includes(w))) console.log(`  ${x.ev.scores.overall} ${x.ev.confidence.padEnd(6)} ${x.error.padEnd(28)} ${x.text}`);
  }
}
