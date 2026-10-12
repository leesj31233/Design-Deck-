import { questionSchema } from "./schema";
import { compilePattern, matchAny, matchPattern, PatternSyntaxError } from "./pattern";
import { runRules } from "./rules";
import { tokenize, words } from "./text";
import { evaluateLocal } from "./evaluate";
import type { Question } from "./types";

/**
 * Question quality control. Used by `npm run content:check` for the curated
 * bank and at runtime before an AI-generated question is shown.
 *  - errors block the question
 *  - warnings flag likely problems (tense ambiguity, thin alternatives)
 */
export interface QcIssue {
  level: "error" | "warning";
  questionId: string;
  message: string;
}

const HANGUL = /[가-힣]/;

export function validateQuestion(q: Question, ctx: { skillIds: Set<string>; seedIds?: Set<string> }): QcIssue[] {
  const issues: QcIssue[] = [];
  const err = (message: string) => issues.push({ level: "error", questionId: q?.id ?? "?", message });
  const warn = (message: string) => issues.push({ level: "warning", questionId: q?.id ?? "?", message });

  const parsed = questionSchema.safeParse(q);
  if (!parsed.success) {
    for (const i of parsed.error.issues) err(`schema: ${i.path.join(".")} ${i.message}`);
    return issues;
  }

  for (const s of q.skills) if (!ctx.skillIds.has(s)) err(`unknown skill "${s}"`);
  for (const p of q.pitfalls ?? []) if (p.skill && !ctx.skillIds.has(p.skill)) err(`pitfall ${p.id}: unknown skill "${p.skill}"`);
  if (q.variation && ctx.seedIds && !ctx.seedIds.has(q.variation.seed)) err(`unknown variation seed "${q.variation.seed}"`);
  if (!HANGUL.test(q.promptKo)) err("promptKo has no Korean text");
  if (!HANGUL.test(q.explanationKo)) err("explanationKo has no Korean text");
  q.segments.forEach((s, i) => {
    if (!HANGUL.test(s)) err(`segment ${i + 1} has no Korean text`);
  });
  if (q.mode === "sentence" && q.segments.length < 3) err("sentence mode needs at least 3 meaning segments");
  if (q.mode === "phrase" && q.segments.length > 5) warn("phrase mode has more than 5 segments");
  if (q.mode === "sentence" && q.accepted.length < 2) warn("sentence mode should list at least 2 accepted alternatives");
  if (new Set(q.meaning.map((m) => m.id)).size !== q.meaning.length) err("duplicate meaning unit ids");
  for (const [i, t] of (q.dialogue ?? []).entries()) {
    if (HANGUL.test(t.en)) err(`dialogue ${i + 1}: English line contains Korean`);
    if (t.ko !== undefined && !HANGUL.test(t.ko)) err(`dialogue ${i + 1}: ko has no Korean text`);
    if (!t.speaker.trim()) err(`dialogue ${i + 1}: speaker is empty`);
  }

  // Patterns compile.
  const patterns = [...q.meaning.flatMap((u) => u.any.map((p) => ({ p, where: `unit ${u.id}` }))), ...(q.pitfalls ?? []).map((p) => ({ p: p.pattern, where: `pitfall ${p.id}` }))];
  let compileOk = true;
  for (const { p, where } of patterns) {
    try {
      compilePattern(p);
    } catch (e) {
      compileOk = false;
      err(`${where}: ${e instanceof PatternSyntaxError ? e.message : String(e)}`);
    }
  }
  if (!compileOk) return issues;

  // Every correct answer must contain every meaning unit and trigger no pitfall or rule.
  const answers = [{ label: "reference", text: q.reference }, ...q.accepted.map((a, i) => ({ label: `accepted[${i}]`, text: a }))];
  for (const a of answers) {
    const w = words(tokenize(a.text));
    for (const u of q.meaning) {
      if (!matchAny(u.any, w, 2)) err(`${a.label} "${a.text}" does not match meaning unit "${u.id}" (${u.any.join(" / ")})`);
    }
    for (const p of q.pitfalls ?? []) {
      if (matchPattern(compilePattern(p.pattern), w, 0)) err(`pitfall "${p.id}" (${p.pattern}) matches the correct ${a.label} "${a.text}"`);
    }
    for (const r of runRules(w)) err(`grammar rule "${r.rule}" fires on the correct ${a.label} "${a.text}" — fix the answer or report a rule false positive`);
  }
  if (q.advanced) {
    const w = words(tokenize(q.advanced));
    for (const r of runRules(w)) err(`grammar rule "${r.rule}" fires on the advanced answer "${q.advanced}"`);
  }

  // Tense/hypothesis disambiguation heuristics.
  const ref = q.reference.toLowerCase();
  if (/\bif\b[^,]*\bhad\b\s+(?!(?:one|none)\b)\w+(ed|en|ne|wn|t)\b/.test(ref) && !/(더라면|었다면|았다면|했다면|였다면)/.test(q.promptKo)) {
    warn("third-conditional reference but the Korean prompt lacks a past-counterfactual marker (~했더라면/~였다면)");
  }
  if (/\bif\b[^,]*\b(had decided|had known)\b[^,]*\bnow\b/.test(ref)) err("'had + p.p.' combined with 'now' in the if-clause mixes past and present");
  if (/\bwould\b/.test(ref) && /\bif\b/.test(ref) && !/(가정|라면|다면|면 좋|면)/.test(q.promptKo)) warn("conditional with 'would' but the Korean prompt may not signal a hypothesis");
  for (const probe of q.probes ?? []) {
    const e = evaluateLocal(q, probe.answer);
    const serious = e.errors.filter((x) => x.severity !== "minor");
    if (probe.expect === "pass" && (e.scores.overall < 85 || serious.length)) {
      err(`probe should PASS but scored ${e.scores.overall} "${probe.answer}"${serious.length ? ` — errors: ${serious.map((x) => `${x.category}:"${x.text}"→"${x.fix}"`).join(", ")}` : ""}${e.meaning.filter((m) => !m.present).map((m) => ` — missing unit ${m.id}`).join("")}`);
    }
    if (probe.expect === "fail" && e.scores.overall >= 85 && !serious.length) {
      err(`probe should FAIL but scored ${e.scores.overall} with no major error "${probe.answer}" — add a pitfall or tighten meaning units`);
    }
  }
  for (const k of ["pattern", "skeleton", "partial"] as const) if (q.hints[k].length > 140) warn(`hint ${k} is long (${q.hints[k].length} chars)`);
  return issues;
}

export function validateBank(questions: Question[], ctx: { skillIds: Set<string>; seedIds?: Set<string> }): QcIssue[] {
  const issues: QcIssue[] = [];
  const seen = new Map<string, number>();
  for (const q of questions) {
    seen.set(q.id, (seen.get(q.id) ?? 0) + 1);
    issues.push(...validateQuestion(q, ctx));
  }
  for (const [id, n] of seen) if (n > 1) issues.push({ level: "error", questionId: id, message: `duplicate id (${n}×)` });
  const refs = new Map<string, string>();
  for (const q of questions) {
    const key = q.reference.toLowerCase().replace(/[^a-z ]/g, "");
    if (refs.has(key)) issues.push({ level: "warning", questionId: q.id, message: `same reference as ${refs.get(key)}` });
    else refs.set(key, q.id);
  }
  return issues;
}
