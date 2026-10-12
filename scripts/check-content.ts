/**
 * Content QC: validates the curated bank, review variations, diagnostic items
 * and the grammar guide. Exit code 1 when any error is found.
 *
 *   npx tsx scripts/check-content.ts                # everything
 *   npx tsx scripts/check-content.ts --only phrases # one bank: sentences-a | sentences-b | phrases | variations | talk-online | talk-presentation | talk-discussion | talk-smalltalk | talk-meal | talk-visit | overlay | diagnostic | guide
 *   npx tsx scripts/check-content.ts --quiet        # summary + errors only
 */
import { validateBank, validateQuestion, type QcIssue } from "../engflow/core/validate";
import { SKILLS } from "../engflow/content/skills";
import { SEEDS } from "../engflow/content/seeds";
import { SENTENCES_A } from "../engflow/content/bank/sentences-a";
import { SENTENCES_B } from "../engflow/content/bank/sentences-b";
import { PHRASES } from "../engflow/content/bank/phrases";
import { VARIATIONS } from "../engflow/content/bank/variations";
import { DIAGNOSTIC_ITEMS } from "../engflow/content/bank/diagnostic";
import { GUIDE } from "../engflow/content/guide";
import { TALK_BANKS, withDialogue } from "../engflow/content";
import { DIALOGUE_OVERLAY } from "../engflow/content/bank/dialogue-overlay";
import { SITUATIONS } from "../engflow/core/types";
import type { Question } from "../engflow/core/types";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const quiet = args.includes("--quiet");
const skillIds = new Set(SKILLS.map((s) => s.id));
const seedIds = new Set(SEEDS.map((s) => s.id));
const ctx = { skillIds, seedIds };
const issues: QcIssue[] = [];

const banks: Record<string, Question[]> = { "sentences-a": SENTENCES_A, "sentences-b": SENTENCES_B, phrases: PHRASES, variations: VARIATIONS, ...TALK_BANKS };
const selected = Object.entries(banks).filter(([k]) => !only || only === k || (only === "overlay" && !k.startsWith("talk-")));
// Dialogue overlays are validated together with the questions they belong to.
const all = selected.flatMap(([, v]) => v).map(withDialogue);
if (!only || banks[only] || only === "overlay") issues.push(...validateBank(all, ctx));

// Overlay keys must name existing questions.
if (!only || only === "overlay") {
  const ids = new Set(Object.values(banks).flat().map((q) => q.id));
  for (const id of Object.keys(DIALOGUE_OVERLAY)) if (!ids.has(id)) issues.push({ level: "error", questionId: id, message: "dialogue overlay for an unknown question id" });
}

// Conversation banks: every question is a dialogue turn with a scene and a key expression,
// and every scene covers difficulty 1–10.
for (const [name, list] of Object.entries(TALK_BANKS)) {
  if (only && only !== name) continue;
  const scene = name.replace("talk-", "");
  for (const q of list) {
    const e = (message: string) => issues.push({ level: "error", questionId: q.id, message });
    if (q.situation !== scene) e(`situation must be "${scene}"`);
    if (!q.dialogue?.length) e("conversation question needs ≥1 dialogue turn");
    if (!q.expression) e("conversation question needs an expression");
    if (q.probes === undefined || q.probes.length < 2) e("needs ≥2 probes (one pass, one fail)");
  }
  const covered = new Set(list.map((q) => q.difficulty));
  const missing = Array.from({ length: 10 }, (_, i) => i + 1).filter((d) => !covered.has(d));
  if (list.length && missing.length) issues.push({ level: "error", questionId: name, message: `difficulty not covered: ${missing.join(", ")}` });
}
void SITUATIONS;

if (!only || only === "variations") {
  for (const seed of SEEDS) {
    const levels = new Set(VARIATIONS.filter((q) => q.variation?.seed === seed.id).map((q) => q.variation!.level));
    for (const l of [0, 1, 2, 3]) if (!levels.has(l as 0)) issues.push({ level: "error", questionId: seed.id, message: `variation ladder missing level ${l}` });
  }
  for (const q of VARIATIONS) if (!q.variation) issues.push({ level: "error", questionId: q.id, message: "variation question without variation field" });
}

if (!only || only === "diagnostic") {
  const ids = new Set<string>();
  for (const d of DIAGNOSTIC_ITEMS) {
    const e = (message: string) => issues.push({ level: "error", questionId: d.id, message });
    if (ids.has(d.id)) e("duplicate diagnostic id");
    ids.add(d.id);
    for (const s of d.skills) if (!skillIds.has(s)) e(`unknown skill "${s}"`);
    if (d.kind === "choice") {
      if (!d.options || d.options.length < 3) e("choice item needs ≥3 options");
      if (d.answerIndex === undefined || !d.options || d.answerIndex < 0 || d.answerIndex >= d.options.length) e("answerIndex out of range");
      if (!d.stemKo && !d.stemEn) e("choice item needs a stem");
      if (!d.explanationKo) e("choice item needs explanationKo");
      if (d.options && new Set(d.options).size !== d.options.length) e("duplicate options");
    } else if (d.kind === "order") {
      if (!d.chunks || d.chunks.length < 3) e("order item needs ≥3 chunks");
      if (!d.meaningKo) e("order item needs meaningKo");
      if (!d.explanationKo) e("order item needs explanationKo");
    } else {
      if (!d.question) e("produce item needs a question");
      else issues.push(...validateQuestion(d.question, ctx).map((i) => ({ ...i, questionId: `${d.id}/${i.questionId}` })));
      if (d.part === 4 && !d.promptEn) e("part 4 item needs promptEn (what the colleague says)");
    }
  }
  const byPart = [1, 2, 3, 4, 5].map((p) => DIAGNOSTIC_ITEMS.filter((d) => d.part === p).length);
  const need = [8, 6, 6, 5, 4];
  byPart.forEach((n, i) => {
    if (n < need[i]) issues.push({ level: "error", questionId: `part${i + 1}`, message: `diagnostic part ${i + 1} has ${n} items; needs ≥${need[i]}` });
  });
}

if (!only || only === "guide") {
  for (const s of SKILLS) {
    const g = GUIDE[s.id];
    const e = (message: string) => issues.push({ level: "error", questionId: `guide:${s.id}`, message });
    if (!g) {
      e("missing guide entry");
      continue;
    }
    if (g.skill !== s.id) e("skill id mismatch");
    if (g.examples.length < 4) e("needs ≥4 technical examples");
    if (!g.rules.length) e("needs ≥1 rule");
    if (!g.anatomy.length) e("needs ≥1 anatomy diagram");
    if (!g.mistakes.length) e("needs ≥1 typical mistake");
    for (const a of g.anatomy) {
      const joined = a.parts.map((p) => p.text).join(" ").replace(/\s+([,.?!])/g, "$1");
      if (joined.replace(/[.?!]$/, "") !== a.sentence.replace(/[.?!]$/, "")) e(`anatomy parts do not join to the sentence: "${joined}" vs "${a.sentence}"`);
    }
  }
}

// Summary.
const count = (list: Question[], key: (q: Question) => string) => list.reduce<Record<string, number>>((m, q) => ((m[key(q)] = (m[key(q)] ?? 0) + 1), m), {});
console.log(`Questions: ${all.length}  (diagnostic items: ${DIAGNOSTIC_ITEMS.length}, guide entries: ${Object.keys(GUIDE).length}/${SKILLS.length})`);
console.log("  by mode     ", count(all, (q) => q.mode));
console.log("  by level    ", count(all, (q) => q.level));
console.log("  by category ", count(all, (q) => q.category));
if (!quiet) console.log("  by skill    ", count(all, (q) => q.skills[0]));
const probes = all.reduce((n, q) => n + (q.probes?.length ?? 0), 0);
console.log(`  probes      ${probes}`);

const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");
for (const i of errors) console.log(`ERROR   ${i.questionId}: ${i.message}`);
if (!quiet) for (const i of warnings) console.log(`warning ${i.questionId}: ${i.message}`);
console.log(`\n${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
