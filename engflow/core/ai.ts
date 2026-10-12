import { aiEvaluationSchema, questionSchema, type AIEvaluationPayload } from "./schema";
import { defaultBucket } from "./evaluate";
import { validateQuestion } from "./validate";
import type { Category, Cefr, ErrorSpan, Evaluation, Question } from "./types";

/**
 * Prompt builders and response normalization for Claude-backed evaluation,
 * explanation and question generation. Used by the artifact runtime
 * (claude.use("sample")) and by the Next.js server (Anthropic SDK) so both
 * produce the same structured result.
 */

export const AI_EVALUATOR_LABEL = "Claude 분석";

const RUBRIC = `Scoring rubric (each 0–100):
- meaning: is the intended message (all Korean meaning chunks) conveyed? Wrong technical meaning must be penalized strongly.
- grammar: grammatical accuracy only. Minor spelling slips cost little (−2 to −4 each).
- terminology: correct engineering terms and collocations (receive data, run a test, feed rate, moisture content…).
- organization: sentence structure, word order, naturalness for an international meeting.
- comprehensibility: how easily a non-native English listener in an engineering meeting would understand it. This is NOT the same as grammar: "We still waiting data" is understandable but ungrammatical.`;

const PRINCIPLES = `Principles:
1. Understandable does not mean grammatically correct — score them separately.
2. Minor spelling errors must not cause disproportionate penalties.
3. Wrong technical meaning must be penalized (meaning and/or terminology).
4. Accept semantically equivalent valid answers, even if worded differently from the reference.
5. Charge each underlying error to ONE category only — never penalize the same error in several scores.
6. Do not invent errors to have something to say. If the answer is correct, return an empty errors list.
7. Style preferences are not errors. Only report a stylistic point if it would confuse an international listener, and then as severity "minor".
8. Show exactly which words are wrong and why.
The learner is a Korean process engineer (~B1). Target: simple, clear international English — not native idioms.`;

function questionBrief(q: Question): string {
  return [
    `Scenario: ${q.topic} (${q.category}, CEFR ${q.level})`,
    q.contextKo ? `Context (Korean): ${q.contextKo}` : "",
    `Korean prompt: ${q.promptKo}`,
    `Meaning chunks in English order: ${q.segments.join(" / ")}`,
    `Reference answer: ${q.reference}`,
    q.accepted.length ? `Other accepted answers: ${q.accepted.join(" | ")}` : "",
    `Target grammar skills: ${q.skills.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildEvaluationPrompt(q: Question, answer: string, local: Evaluation): string {
  const localFindings = local.errors.length
    ? local.errors.map((e) => `- ${e.category}/${e.severity}: "${e.text}" → "${e.fix}" (${e.source})`).join("\n")
    : "- none";
  const missing = local.meaning.filter((m) => !m.present).map((m) => `${m.en} (${m.ko})`);
  return `You are an English coach for Korean process engineers who work in international engineering meetings. Evaluate one learner answer.

${questionBrief(q)}

Learner answer (evaluate exactly this text): """${answer}"""

An automatic rule-based pre-check found (it can be wrong — verify, do not copy blindly):
${localFindings}
Possibly missing meaning: ${missing.length ? missing.join("; ") : "none"}

${RUBRIC}

${PRINCIPLES}

Write all Korean fields in concise, polite Korean (~입니다/~씁니다). Explanations say what is wrong, why, and the correct form.

Reply with ONLY one JSON object of this shape:
{
  "scores": {"meaning": 0-100, "grammar": 0-100, "terminology": 0-100, "organization": 0-100, "comprehensibility": 0-100},
  "notes": {"meaning": "Korean note", "grammar": "Korean note", "terminology": "Korean note", "organization": "Korean note", "comprehensibility": "Korean note"},
  "errors": [{"span": "exact substring of the learner answer, or \\"\\" for a missing word", "insertBefore": "for a missing word: the learner word it goes before, or \\"\\" for the end", "fix": "replacement text", "category": one of ["be-verb","verb-form","tense","agreement","preposition","article","word-order","word-choice","missing-content","meaning-shift","terminology","spelling","sentence-structure","countability"], "severity": "minor"|"major"|"critical", "explanationKo": "Korean explanation", "skill": "optional skill id from: ${q.skills.join(", ")} or another relevant id"}],
  "corrected": "minimal correction that keeps the learner's own words and structure where possible",
  "recommended": "simple, clear international English version",
  "advanced": "optional more precise version (still clear for non-native listeners)",
  "summaryKo": "1–2 sentence Korean verdict that mentions both what works and what is wrong",
  "grammarKo": "short Korean explanation of the most relevant grammar point",
  "alternatives": ["up to 3 other correct ways to say it"],
  "addToReview": true|false,
  "reviewReasonKo": "Korean reason",
  "confidence": "high"|"medium"|"low",
  "meaningEquivalent": true|false
}`;
}

function locate(answer: string, span: string, insertBefore?: string): { start: number; end: number } | null {
  if (span) {
    const i = answer.indexOf(span);
    if (i >= 0) return { start: i, end: i + span.length };
    const j = answer.toLowerCase().indexOf(span.toLowerCase().trim());
    if (j >= 0) return { start: j, end: j + span.trim().length };
    return null;
  }
  if (insertBefore) {
    const re = new RegExp(`\\b${insertBefore.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const m = re.exec(answer);
    if (m) return { start: m.index, end: m.index };
  }
  return { start: answer.length, end: answer.length };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Validate Claude's JSON and merge it with the deterministic findings into an Evaluation. */
export function normalizeAIEvaluation(raw: unknown, q: Question, answer: string, local: Evaluation): Evaluation {
  const parsed = aiEvaluationSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new AIFormatError(`AI 응답 형식이 올바르지 않습니다 (${where}).`);
  }
  const p: AIEvaluationPayload = parsed.data;
  const errors: ErrorSpan[] = [];
  p.errors.forEach((e, i) => {
    const pos = locate(answer, e.span, e.insertBefore);
    if (!pos) return; // the model quoted text that is not in the answer: drop it rather than mislead
    errors.push({
      id: `ai${i + 1}`,
      category: e.category,
      severity: e.severity,
      bucket: defaultBucket(e.category),
      start: pos.start,
      end: pos.end,
      text: answer.slice(pos.start, pos.end),
      fix: e.fix,
      messageKo: e.explanationKo,
      skill: e.skill && q.skills.includes(e.skill) ? e.skill : e.skill || q.skills[0],
      source: "ai",
    });
  });
  // Curated pitfalls are verified against the reference answers; keep any the model did not cover.
  for (const le of local.errors.filter((x) => x.source === "pitfall")) {
    const covered = errors.some((e) => e.start < le.end + 1 && le.start < e.end + 1);
    if (!covered) errors.push({ ...le, id: `p-${le.id}` });
  }
  errors.sort((a, b) => a.start - b.start);

  const s = p.scores;
  const isPhrase = q.mode === "phrase";
  let overall = isPhrase
    ? clamp(0.5 * s.meaning + 0.35 * s.grammar + 0.15 * s.organization)
    : clamp(0.3 * s.meaning + 0.3 * s.grammar + 0.2 * s.terminology + 0.2 * s.organization);
  if (errors.some((e) => e.category === "meaning-shift" && e.severity === "critical")) overall = Math.min(overall, 60);
  const hasMajor = errors.some((e) => e.severity !== "minor");
  return {
    ...local,
    evaluator: "ai",
    evaluatorLabel: AI_EVALUATOR_LABEL,
    scores: {
      meaning: { score: clamp(s.meaning), noteKo: p.notes.meaning },
      grammar: { score: clamp(s.grammar), noteKo: p.notes.grammar },
      terminology: { score: clamp(s.terminology), noteKo: p.notes.terminology },
      organization: { score: clamp(s.organization), noteKo: p.notes.organization },
      comprehensibility: { score: clamp(s.comprehensibility), noteKo: p.notes.comprehensibility },
      overall,
    },
    errors,
    corrected: p.corrected,
    recommended: p.recommended || q.reference,
    advanced: p.advanced || q.advanced,
    summaryKo: p.summaryKo,
    grammarKo: p.grammarKo,
    alternatives: p.alternatives.length ? p.alternatives.slice(0, 3) : local.alternatives,
    review: { add: p.addToReview || hasMajor || overall < 80, reasonKo: p.reviewReasonKo || local.review.reasonKo },
    confidence: p.confidence,
    confidenceNoteKo: undefined,
  };
}

export class AIFormatError extends Error {}

/* ───────────── Explanations ───────────── */

export type ExplainKind = "why" | "simpler" | "example" | "compare" | "ask";

export function buildExplainPrompt(kind: ExplainKind, q: Question, ev: Evaluation, question?: string): string {
  const ask: Record<ExplainKind, string> = {
    why: "Explain in Korean why the learner's sentence is wrong (or why it is right), pointing at the exact words. 3–5 short sentences.",
    simpler: "Explain the key grammar point again in very simple Korean, like to a colleague who dislikes grammar terms. Use one everyday analogy if it helps. 3–4 short sentences.",
    example: "Give 3 NEW example sentences that use the same grammar in engineering meetings (pilot plant, P&ID, dryers, vendors, schedules). Format each as: English sentence — Korean meaning.",
    compare: "Compare the learner's expression with the correct one and with 1–2 similar expressions that Korean speakers confuse. For each, give the English, its exact meaning in Korean, and when to use it.",
    ask: `Answer the learner's question in Korean, briefly and precisely: "${question ?? ""}"`,
  };
  return `You are an English coach for a Korean process engineer (~B1) who needs clear international English for engineering meetings.

${questionBrief(q)}
Learner answer: """${ev.answer}"""
Minimal correction: ${ev.corrected}
Detected issues: ${ev.errors.map((e) => `"${e.text || "(missing)"}" → "${e.fix}" [${e.category}]`).join("; ") || "none"}

Task: ${ask[kind]}
Use plain text (no Markdown headings, no tables). Keep English simple.`;
}

/* ───────────── Question generation ───────────── */

export interface GenerateRequest {
  category: Category;
  skill: string;
  level: Cefr;
  mode: "sentence" | "phrase";
  avoidReferences: string[];
}

export function buildGenerationPrompt(r: GenerateRequest, skillName: string, example: Question): string {
  return `Create ONE new English practice question for a Korean process engineer (~B1) who needs clear English in international engineering meetings (Korean and Southeast Asian teams: pilot plants, Pre-FEED, PFD/P&ID, mass balance, dryers, pumps, steam, vendors, commissioning, CAPEX/OPEX).

Requirements:
- mode: "${r.mode}", category: "${r.category}", CEFR level: "${r.level}", primary grammar skill: "${r.skill}" (${skillName}).
- Simple vocabulary; difficulty comes from grammar and reasoning, not rare words. No idioms.
- promptKo: natural Korean. segments: Korean meaning chunks in ENGLISH word order (${r.mode === "sentence" ? "at least 3" : "1–4"}).
- Tense must be unambiguous: real future condition = "~한다면" → If + present; hypothetical = "(실제로는 아니지만) ~한다고 가정하면" → If + past, would; past counterfactual = "~했더라면" → If + had p.p., would have p.p.; never "had decided … now".
- reference = simple international English. accepted = ${r.mode === "sentence" ? "2–4" : "1–3"} other fully correct answers.
- meaning units use this pattern syntax: "word" matches by stem (change ~ changed/changing), "=word" exact form, "a|b" alternatives, "tok?" optional, "..." gap. Make units lenient about grammar and generous with synonyms; every correct answer must match every unit. Mark technical terms with "term": true and essential units with "critical": true.
- pitfalls: 1–2 typical Korean-speaker mistakes for this skill; a pitfall pattern must NOT match any correct answer; "fix" replaces exactly the matched words; messageKo explains what/why in Korean.
- hints: pattern (grammar formula), skeleton (reference with ____ blanks), partial (first half + "…").
- explanationKo: 1–3 Korean sentences (rule + why).
- probes: 2 entries: one valid paraphrase with "expect": "pass", one typical mistake with "expect": "fail".
- Do not reuse these references: ${r.avoidReferences.slice(0, 12).join(" | ") || "(none)"}

Here is an example of the exact JSON shape (different topic):
${JSON.stringify(example)}

Reply with ONLY the JSON object for the new question. Use id "gen-${r.skill}-${Date.now().toString(36)}".`;
}

export function parseGeneratedQuestion(raw: unknown, ctx: { skillIds: Set<string> }): { question: Question | null; problems: string[] } {
  const parsed = questionSchema.safeParse(raw);
  if (!parsed.success) return { question: null, problems: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`) };
  const q = { ...(parsed.data as Question), source: "generated" as const };
  const issues = validateQuestion(q, ctx).filter((i) => i.level === "error");
  return issues.length ? { question: null, problems: issues.map((i) => i.message) } : { question: q, problems: [] };
}

export function buildRepairPrompt(previous: unknown, problems: string[]): string {
  return `The question JSON below failed automatic validation. Fix ONLY the listed problems and reply with ONLY the corrected JSON object.

Problems:
${problems.map((p) => `- ${p}`).join("\n")}

JSON:
${JSON.stringify(previous)}`;
}
