import type { Cefr, Question } from "../core/types";
import type { DiagnosticItem } from "./types";

/**
 * The level-test item pool: the hand-written diagnostic items plus items drawn from the curated, QC-validated
 * lesson bank, so a retake does not show the same 17 items.
 *
 * - Part 1 (grammar & construction): word-order items built from short sentence references (6–12 words), and
 *   "pick the sentence that says this correctly" items: the reference against two of the question's QC probes that
 *   must fail (typical mistakes or a flipped meaning).
 * - Part 2 (short phrase): phrase-mode questions.
 * - Part 3 (full sentence): sentence-mode questions without a conversation partner.
 * - Part 4 (meeting response): sentence turns that answer a colleague's line (the line is shown as promptEn).
 * - Part 5 (explain a situation): multi-sentence turns (all of difficulty 8+, half of those of difficulty 4–7).
 *
 * Difficulty b comes from the question's CEFR level, fine-tuned by its 1–10 difficulty.
 */
const LEVEL_B: Record<Cefr, number> = { A1: -2, A2: -1, B1: 0, B2: 1, C1: 2, C2: 2.6 };

function bOf(q: Question): number {
  return Math.round((LEVEL_B[q.level] + (q.difficulty - 5) * 0.08) * 100) / 100;
}

/** Split a short reference into 4–5 chunks of whole words for an ordering item. */
function orderChunks(reference: string): string[] | null {
  const words = reference.replace(/\s+/g, " ").trim().split(" ");
  // One plain sentence of 6–12 words (no inner full stops, which would give the order away).
  if (words.length < 6 || words.length > 12 || !/[.?!]$/.test(reference) || (reference.match(/[.!?]/g) ?? []).length > 1) return null;
  const n = words.length <= 8 ? 4 : 5;
  const size = Math.ceil(words.length / n);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(" "));
  // Duplicate chunks would make the order ambiguous.
  return new Set(chunks).size === chunks.length && chunks.length >= 4 ? chunks : null;
}

/** Stable 0/1 split by id, so a question always lands in the same part. */
function half(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 2;
}

export function bankDiagnosticItems(questions: Question[]): DiagnosticItem[] {
  const out: DiagnosticItem[] = [];
  for (const q of questions) {
    if (q.source === "generated" || !q.meaning.length) continue;
    const base = { level: q.level, b: bOf(q), skills: q.skills };
    const sentences = (q.reference.match(/[.!?](\s|$)/g) ?? []).length;
    const partner = q.dialogue?.length ? [...q.dialogue].reverse().find((t) => t.en)?.en : undefined;
    const chunks = orderChunks(q.reference);
    if (chunks && half(`o:${q.id}`)) out.push({ ...base, id: `dgb1:${q.id}`, part: 1, kind: "order", chunks, meaningKo: q.promptKo, explanationKo: q.explanationKo });
    const wrong = [...new Set((q.probes ?? []).filter((p) => p.expect === "fail").map((p) => p.answer.trim()))].filter((a) => a && a !== q.reference.trim() && !q.accepted.includes(a));
    if (wrong.length >= 2 && !half(`c:${q.id}`)) {
      const options = [q.reference, wrong[0], wrong[1]];
      const order = [0, 1, 2].sort((a, b) => half(`${q.id}:${a}`) - half(`${q.id}:${b}`) || ((a * 7 + q.id.length) % 3) - ((b * 7 + q.id.length) % 3));
      out.push({
        ...base, b: Math.round((base.b - 0.3) * 100) / 100, id: `dgbc:${q.id}`, part: 1, kind: "choice",
        stemKo: `이 뜻을 바르게 말한 문장을 고르세요.\n${q.contextKo ? `${q.contextKo}\n` : ""}「${q.promptKo}」`,
        options: order.map((i) => options[i]), answerIndex: order.indexOf(0), explanationKo: q.explanationKo,
      });
    }
    if (q.mode === "phrase") out.push({ ...base, id: `dgb2:${q.id}`, part: 2, kind: "produce", question: q });
    else if (sentences >= 2 && (q.difficulty >= 8 || (q.difficulty >= 4 && half(`5:${q.id}`)))) out.push({ ...base, id: `dgb5:${q.id}`, part: 5, kind: "produce", question: q, promptEn: partner });
    // A reply to a colleague tests meeting response (Part 4); without the colleague's line it is a full sentence (Part 3).
    else if (partner && half(q.id)) out.push({ ...base, id: `dgb4:${q.id}`, part: 4, kind: "produce", question: q, promptEn: partner });
    else out.push({ ...base, id: `dgb3:${q.id}`, part: 3, kind: "produce", question: q });
  }
  return out;
}
