/**
 * Grammar rules alone (no reference answer) on an independent corpus of
 * learner sentences (scripts/bench/learner-corpus.ts, written without seeing
 * the rules): how many one-mistake sentences they flag, and how many correct
 * (often tricky) sentences they leave alone. This is what protects a learner
 * who words an answer differently from every stored answer.
 *
 *   npx tsx scripts/bench/rules-corpus.ts          # summary
 *   npx tsx scripts/bench/rules-corpus.ts --list   # also list misses and false alarms
 */
import { runRules } from "../../engflow/core/rules";
import { tokenize, words } from "../../engflow/core/text";
import { RIGHT, WRONG } from "./learner-corpus";

const fire = (s: string) => runRules(words(tokenize(s)));

export function runRulesCorpus() {
  const wrong = WRONG.map((x) => ({ ...x, hits: fire(x.wrong), fixHits: fire(x.right) }));
  const right = RIGHT.map((x) => ({ ...x, hits: fire(x.text) }));
  const caught = wrong.filter((x) => x.hits.length);
  const falseAlarms = right.filter((x) => x.hits.length);
  // The corrected version of a wrong sentence is also a correct sentence.
  const fixAlarms = wrong.filter((x) => x.fixHits.length);
  const byType = new Map<string, { n: number; caught: number }>();
  for (const x of wrong) {
    const t = byType.get(x.error) ?? { n: 0, caught: 0 };
    t.n++;
    if (x.hits.length) t.caught++;
    byType.set(x.error, t);
  }
  return { wrong, right, caught, falseAlarms, fixAlarms, byType };
}

if (process.argv[1]?.endsWith("rules-corpus.ts")) {
  const r = runRulesCorpus();
  const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
  console.log(`One-mistake sentences flagged by the rules alone: ${r.caught.length} of ${r.wrong.length} (${pct(r.caught.length, r.wrong.length)})`);
  console.log(`Correct sentences flagged (false alarms): ${r.falseAlarms.length} of ${r.right.length} (${pct(r.falseAlarms.length, r.right.length)}); corrected versions flagged: ${r.fixAlarms.length} of ${r.wrong.length}`);
  if (process.argv.includes("--list")) {
    console.log("\nBy mistake type (caught/n):");
    for (const [t, v] of [...r.byType.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${t.padEnd(28)} ${v.caught}/${v.n}`);
    console.log("\nFalse alarms:");
    for (const x of [...r.falseAlarms, ...r.fixAlarms.map((w) => ({ id: w.id, text: w.right, hits: w.fixHits }))]) console.log(`  ${x.id.padEnd(16)} ${x.text}\n      ${x.hits.map((h) => `${h.rule} → '${h.replacement}'`).join("; ")}`);
    console.log("\nMissed:");
    for (const x of r.wrong.filter((w) => !w.hits.length)) console.log(`  ${x.error.padEnd(26)} ${x.wrong}`);
  }
}
