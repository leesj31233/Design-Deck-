import { aiEvaluationSchema, questionSchema, type AIEvaluationPayload } from "./schema";
import { bucketPenalties, defaultBucket, overallFrom, scoredErrors } from "./evaluate";
import { SKILLS } from "../content/skills";
import { SITUATION_INFO } from "../content/situations";
import { situationOf } from "./situations";
import { validateQuestion } from "./validate";
import type { Category, Cefr, ErrorSpan, Evaluation, Question, Situation } from "./types";

/**
 * Prompt builders and response normalization for Claude-backed evaluation,
 * explanation and question generation. Used by the artifact runtime
 * (claude.use("sample")) and by the Next.js server (Anthropic SDK) so both
 * produce the same structured result.
 */

export const AI_EVALUATOR_LABEL = "Claude 채점";

const PRINCIPLES = `Grading principles:
1. Grammar first. Check every word for grammar precisely: tense and aspect, be + verb forms, passive vs active, subject–verb agreement, articles, countability, prepositions after verbs, word order, clause structure, conditionals. Report each real grammar error with the exact words.
2. Site-specific word choice is NOT an error. Plants name things differently (raw vs feed composition, material vs feedstock, unit vs plant, vessel vs tank). If the word is understandable in context, accept it. At most add it as category "terminology", severity "minor" — it is shown as a suggestion and never scored.
3. Common meeting expressions matter: wrong collocations that change or block the meaning ("turn a simulation", "make a meeting") are "word-choice" errors.
4. Spelling slips are "spelling", severity "minor" (almost no penalty). Never call a spelling slip a grammar error.
5. Understandable does not mean grammatically correct: "We still waiting data" is understandable but has two grammar errors.
6. Charge each underlying error ONE category only. Do not invent errors; a correct answer gets an empty list. Style preferences are not errors.
7. Speak first. The learner practises saying their thinking in meetings, not writing one long sentence. An answer that splits the content into 2–3 short sentences, puts the main point first, or links ideas with "but/so/the reason is" instead of "although/because" is fully correct when it keeps the meaning — never an error, never "organization" points off. The reference is one good way to say it, not the only structure: a complex one-sentence form is never required.
Severity: "critical" = meaning becomes wrong or opposite; "major" = clear grammar error a listener notices (wrong tense, missing be, wrong verb form, agreement); "minor" = small slip (article, plural -s, preposition nuance).`;

function questionBrief(q: Question): string {
  return [
    `Scene: ${SITUATION_INFO[situationOf(q)].en} — ${q.topic} (CEFR ${q.level}, difficulty ${q.difficulty}/10)`,
    q.contextKo ? `Context (Korean): ${q.contextKo}` : "",
    q.dialogue?.length ? `Conversation so far:\n${q.dialogue.map((t) => `  ${t.speaker}: ${t.en}`).join("\n")}\n  (the learner answers next)` : "",
    `Korean prompt: ${q.promptKo}`,
    `Reference answer: ${q.reference}`,
    q.accepted.length ? `Other accepted answers: ${q.accepted.join(" | ")}` : "",
    `Target grammar: ${q.skills.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const CATEGORIES = '"be-verb","verb-form","tense","agreement","preposition","article","word-order","word-choice","missing-content","meaning-shift","terminology","spelling","sentence-structure","countability"';

/**
 * One compact, grammar-focused grading request. The reply is kept short (no
 * summaries or alternatives — the app writes those from the error list), because
 * output length is what decides how fast the learner sees the grade.
 */
export function buildEvaluationPrompt(q: Question, answer: string, local: Evaluation): string {
  const pre = scoredErrors(local.errors);
  const localFindings = pre.length ? pre.map((e) => `"${e.text || "(missing)"}" → "${e.fix}" (${e.category}, ${e.severity})`).join("; ") : "none";
  return `You grade one spoken-English answer from a Korean process engineer (~B1) in an international online meeting or business conversation (meetings, presentations, small talk, meals, site visits).

${questionBrief(q)}

Learner answer (grade exactly this text): """${answer}"""
Automatic pre-check (may be wrong or incomplete — verify): ${localFindings}

${PRINCIPLES}

Be brief: the learner is waiting. explanationKo = ONE short polite Korean sentence (~입니다): what is wrong and the right form.
Skill ids for errors: ${SKILL_IDS}.

Reply with ONLY this JSON (no other keys):
{"meaning":0-100,"comprehensibility":0-100,"errors":[{"span":"exact substring of the answer, or \"\" for a missing word","insertBefore":"for a missing word: the answer word it goes before, \"\" = end","fix":"replacement","category":one of [${CATEGORIES}],"severity":"minor"|"major"|"critical","explanationKo":"…","skill":"skill id"}],"corrected":"the answer with only its errors fixed — keep the learner's own words, including site terms; \"\" when errors is empty"}`;
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

/** The answer with each error's fix applied (right to left, so earlier positions stay valid). */
function applyFixes(answer: string, errors: ErrorSpan[]): string {
  let out = answer;
  for (const e of [...errors].sort((a, b) => b.start - a.start)) {
    const fix = e.start === e.end && e.fix ? (e.start >= out.length ? ` ${e.fix}` : `${e.fix} `) : e.fix;
    out = out.slice(0, e.start) + fix + out.slice(e.end);
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

const KNOWN_CATEGORIES = new Set(CATEGORIES.replace(/"/g, "").split(","));
const CATEGORY_ALIASES: Record<string, string> = { grammar: "verb-form", collocation: "word-choice", vocabulary: "word-choice", "subject-verb-agreement": "agreement", plural: "countability", order: "word-order" };

/**
 * Fast models occasionally overshoot list lengths, scores or the category list.
 * Fix those small slips so the one grading pass is not wasted; anything
 * structurally wrong is still rejected by the schema.
 */
function tidy(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const r = { ...(raw as Record<string, unknown>) };
  for (const k of ["meaning", "comprehensibility"]) if (typeof r[k] === "number") r[k] = Math.max(0, Math.min(100, r[k] as number));
  if (Array.isArray(r.errors)) {
    r.errors = r.errors.slice(0, 10).map((e) => {
      if (!e || typeof e !== "object") return e;
      const x = { ...(e as Record<string, unknown>) };
      if (typeof x.category === "string" && !KNOWN_CATEGORIES.has(x.category)) x.category = CATEGORY_ALIASES[x.category] ?? "sentence-structure";
      if (x.insertBefore === null) delete x.insertBefore;
      if (x.skill === null) delete x.skill;
      return x;
    });
  }
  return r;
}

/**
 * Validate Claude's JSON and turn it into an Evaluation. Scores are computed
 * from the error list with the same penalty table and weights as the
 * rule-based grader, so the two can never disagree about how much an error costs.
 */
export function normalizeAIEvaluation(raw: unknown, q: Question, answer: string, local: Evaluation): Evaluation {
  const parsed = aiEvaluationSchema.safeParse(tidy(raw));
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new AIFormatError(`AI 응답 형식이 올바르지 않습니다 (${where}).`);
  }
  const p: AIEvaluationPayload = parsed.data;
  const errors: ErrorSpan[] = [];
  p.errors.forEach((e, i) => {
    const pos = locate(answer, e.span, e.insertBefore);
    if (!pos) return; // the model quoted text that is not in the answer: drop it rather than mislead
    const advisory = e.category === "terminology";
    errors.push({
      id: `ai${i + 1}`,
      category: e.category,
      severity: advisory ? "minor" : e.category === "spelling" ? "minor" : e.severity,
      bucket: defaultBucket(e.category),
      start: pos.start,
      end: pos.end,
      text: answer.slice(pos.start, pos.end),
      fix: e.fix,
      messageKo: advisory ? `${e.explanationKo} (현장 용어는 점수에 반영하지 않습니다.)` : e.explanationKo,
      skill: e.skill && SKILL_SET.has(e.skill) ? e.skill : q.skills[0],
      source: "ai",
      advisory: advisory || undefined,
    });
  });
  // Curated pitfalls are verified against the reference answers, and major grammar-rule findings never fired on
  // any correct sentence in the bank or the blind test sets (docs/engflow/GRADER_BENCH.md): keep any the model did not cover,
  // so a lenient reply cannot pass "is not satisfy" or "I'm interesting in".
  // An empty correction means nothing was wrong (the prompt asks for "" then, to keep the reply short); if the
  // model listed errors anyway, apply its fixes to the answer.
  let corrected = p.corrected.trim() || applyFixes(answer, errors);
  for (const le of local.errors.filter((x) => (x.source === "pitfall" || (x.source === "rule" && x.severity !== "minor")) && !x.advisory)) {
    const covered = errors.some((e) => e.start < le.end + 1 && le.start < e.end + 1);
    if (covered) continue;
    errors.push({ ...le, id: `p-${le.id}` });
    // The model's correction left this mistake in: fix it there too, so the correction matches the error list.
    if (le.text && corrected.includes(le.text)) corrected = corrected.replace(le.text, le.fix).replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1");
    else if (!le.text && le.fix && le.start >= 0) {
      const before = answer.slice(0, le.start).trimEnd();
      if (before && corrected.startsWith(before)) corrected = `${before} ${le.fix} ${corrected.slice(before.length).trimStart()}`.replace(/\s{2,}/g, " ");
    }
  }
  errors.sort((a, b) => a.start - b.start);

  const pen = bucketPenalties(errors);
  const scored = scoredErrors(errors);
  const M = clamp(Math.min(p.meaning, 100 - pen.meaning));
  const G = clamp(100 - pen.grammar);
  const O = clamp(100 - pen.organization);
  let overall = overallFrom(M, G, O);
  if (scored.some((e) => e.category === "meaning-shift" && e.severity === "critical")) overall = Math.min(overall, 60);
  const major = scored.filter((e) => e.severity !== "minor");
  const grammarCount = scored.filter((e) => e.bucket === "grammar" && e.category !== "spelling").length;
  const spelling = scored.filter((e) => e.category === "spelling").length;
  const add = major.length > 0 || overall < 80;
  // The verdict and grammar note are written here from the errors, so the model's reply stays short.
  const main = [...scored].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || Number(a.category === "spelling") - Number(b.category === "spelling"))[0];
  const firstSentence = (t: string) => t.split(/(?<=[.。])\s/)[0];
  const summaryKo = !scored.length
    ? M >= 85 ? "문법 오류가 없고 의미도 잘 전달됩니다." : "문법 오류는 없지만 의미가 일부 달라졌습니다."
    : !grammarCount && spelling
      ? "문법은 정확합니다. 철자 실수만 있어 점수에는 거의 영향이 없습니다."
      : `${grammarCount ? `문법 오류 ${grammarCount}개.` : "의미를 다시 확인하세요."} 핵심: ${firstSentence(main.messageKo)}`;
  return {
    ...local,
    evaluator: "ai",
    evaluatorLabel: AI_EVALUATOR_LABEL,
    scores: {
      meaning: { score: M, noteKo: M >= 85 ? "핵심 의미와 표현이 전달됩니다." : M >= 60 ? "의미가 일부 달라졌습니다." : "의미가 제대로 전달되지 않습니다." },
      grammar: { score: G, noteKo: grammarCount ? `문법 오류 ${grammarCount}개${spelling ? ` · 철자 ${spelling}개` : ""}` : spelling ? `문법 오류 없음 · 철자 ${spelling}개(감점 거의 없음)` : "문법 오류를 찾지 못했습니다." },
      terminology: termAdvice(errors, local),
      organization: { score: O, noteKo: scored.some((e) => e.bucket === "organization") ? "어순·문장 구조를 확인하세요." : "문장 구성이 자연스럽습니다." },
      comprehensibility: { score: clamp(p.comprehensibility), noteKo: p.comprehensibility >= 85 ? "국제 회의에서 쉽게 이해됩니다." : p.comprehensibility >= 65 ? "대체로 이해되지만 듣는 사람이 한 번 더 생각해야 합니다." : "의미가 정확히 전달되기 어렵습니다." },
      overall,
    },
    errors,
    corrected,
    recommended: p.recommended || q.reference,
    summaryKo,
    grammarKo: main && main.category !== "spelling" ? `${main.messageKo}\n\n${q.explanationKo}` : q.explanationKo,
    alternatives: local.alternatives,
    review: {
      add,
      reasonKo: add
        ? major.length
          ? `${major.length}개의 주요 문법 오류가 있어 같은 문법을 다른 문장으로 다시 연습합니다.`
          : "점수가 기준(80)보다 낮아 다시 연습합니다."
        : scored.length
          ? "사소한 오류만 있어 복습 목록에는 넣지 않고 숙련도 기록에만 반영합니다."
          : "정확합니다. 숙련도 기록에 반영됩니다.",
    },
    confidence: "high",
    confidenceNoteKo: undefined,
  };
}

/** Reference-only note on site wording: names the learner's term next to the common one. */
function termAdvice(errors: ErrorSpan[], local: Evaluation): Evaluation["scores"]["terminology"] {
  const notes = errors.filter((e) => e.advisory && e.text && e.fix);
  if (!notes.length) return local.scores.terminology;
  return { score: local.scores.terminology.score, noteKo: `${notes.map((e) => `${e.text} → ${e.fix}`).join(", ")}도 많이 씁니다. 현장마다 달라 점수에 반영하지 않습니다.` };
}

export class AIFormatError extends Error {}

const SEVERITY_RANK = { minor: 1, major: 2, critical: 3 } as const;
const SKILL_SET = new Set(SKILLS.map((k) => k.id));
const SKILL_IDS = SKILLS.map((k) => k.id).join(", ");

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
  /** Conversation scene; the question is a turn in that conversation. */
  situation?: Situation;
  /** 1–10 (see the difficulty table in the prompt). */
  difficulty?: number;
  avoidReferences: string[];
  /** The learner's own recurring mistakes on this grammar point: the new question must test exactly this context. */
  weakness?: { labelKo: string; examples: { wrong: string; right: string }[] };
}

export function buildGenerationPrompt(r: GenerateRequest, skillName: string, example: Question): string {
  const scene = r.situation ?? "discussion";
  const d = r.difficulty;
  return `Create ONE new "how do I say this?" practice turn for a Korean process engineer (~B1) who works with international colleagues (Indonesian, Malaysian, Vietnamese, Indian and European teams) in online meetings, presentations, small talk, business meals and site visits.

Requirements:
- mode: "${r.mode}", category: "${r.category}", CEFR level: "${r.level}", primary grammar skill: "${r.skill}" (${skillName}).
- situation: "${scene}" (${SITUATION_INFO[scene].en}: ${SITUATION_INFO[scene].descKo}). The question is a turn in that conversation: "dialogue" holds 1–2 earlier lines { "speaker", "en", "ko" } from a colleague (Budi, Sari, Mr. Tan, Linh, Priya or Daniel), and the learner (Minsu) answers next. The colleague's line must not give away the target structure. "expression" = the key spoken expression practised.${d ? `
- difficulty: ${d} (1 = fixed 3–6 word expression, 3 = one clause, 5 = two clauses, 7 = passive/relative clause/polite hedging, 9 = several sentences with hypothesis or reporting, 10 = long diplomatic turn). Match length and grammar to it.` : ""}${scene === "technical" ? "" : `
- Keep the topic everyday and relationship-focused for this scene; light engineering context only if natural.`}
- Simple vocabulary; difficulty comes from grammar and reasoning, not rare words.
- reference = how native-speaking engineers most commonly say it in a real meeting: natural, everyday spoken phrasing (e.g. "Could you take a look at…", "We're still waiting on…", "Let's go with…"), not textbook English and no rare idioms.${r.weakness ? `
- This learner keeps making this mistake (${r.weakness.labelKo}). Build the question so the SAME grammar context appears, in a new situation:
${r.weakness.examples.slice(0, 4).map((x) => `  wrong: "${x.wrong}" → right: "${x.right}"`).join("\n")}
  Add a pitfall that catches this exact mistake.` : ""}
- Speak first (priority: clarity > easy to say on the spot > natural > grammatically complex). Order the content main point → reason → extra detail. Prefer 2–3 short sentences over one sentence with stacked clauses ("I don't think we should scale up yet. The lab results look good, but the site feed could be different." rather than "Although …, I don't think … because …"); put a complex one-sentence form in "advanced" or "accepted" only.
- promptKo: natural Korean in the same speaking order. segments: Korean meaning chunks in SPEAKING order, each one a unit said in one breath (${r.mode === "sentence" ? "2–5 chunks" : "1–4"}); a linking word (하지만, 왜냐하면, 비록) goes inside the chunk it introduces, never as a chunk of its own.
- Tense must be unambiguous: real future condition = "~한다면" → If + present; hypothetical = "(실제로는 아니지만) ~한다고 가정하면" → If + past, would; past counterfactual = "~했더라면" → If + had p.p., would have p.p.; never "had decided … now".
- accepted = ${r.mode === "sentence" ? "2–4" : "1–3"} other fully correct answers.
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

/** The example shown to the model: a conversation turn, same scene and mode if possible, different skill. */
export function generationExample(req: GenerateRequest, bank: Question[]): Question {
  const rank = (q: Question) =>
    (q.dialogue?.length ? 4 : 0) + (q.situation && q.situation === req.situation ? 2 : 0) + (q.mode === req.mode ? 3 : 0) + (q.skills[0] !== req.skill ? 1 : -5) + (q.variation ? -5 : 0);
  return [...bank].sort((a, b) => rank(b) - rank(a))[0];
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
