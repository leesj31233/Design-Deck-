"use client";
import * as React from "react";
import { motion } from "motion/react";
import { Check, ChevronRight, X } from "lucide-react";
import { cn, useReduced } from "../kit";
import type { ErrorSpan, MeaningCheck, ScoreBucket } from "../../core/types";

/* ───────────── Meaning chunks (numbered like process streams) ───────────── */

export function MeaningChunks({ segments, size = "lg" }: { segments: string[]; size?: "lg" | "md" }) {
  const reduced = useReduced();
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="한국어 의미 단위 (영어 어순)">
      {segments.map((s, i) => (
        <motion.li
          key={`${i}-${s}`}
          className="flex items-center gap-1"
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : 0.03 * i, duration: 0.2 }}
        >
          <span
            className={cn(
              "ef-ko inline-flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--ef-chunk)] shadow-[0_1px_0_rgba(16,17,20,.03)]",
              size === "lg" ? "px-3 py-2 text-[16px] font-medium md:text-[17px]" : "px-2.5 py-1.5 text-[14px]",
            )}
          >
            <span className="ef-stream-tag" aria-hidden>
              <span>{i + 1}</span>
            </span>
            <span className="leading-snug">{s}</span>
          </span>
          {i < segments.length - 1 ? <ChevronRight className="size-3.5 shrink-0 text-[var(--muted)]/60" aria-hidden /> : null}
        </motion.li>
      ))}
    </ol>
  );
}

/* ───────────── Error highlight ───────────── */

export function markClass(e: Pick<ErrorSpan, "bucket" | "category">): "grammar" | "meaning" | "terminology" | "organization" | "spelling" {
  if (e.category === "spelling") return "spelling";
  return e.bucket as Exclude<ScoreBucket, never>;
}

export const BUCKET_COLOR: Record<string, string> = {
  grammar: "var(--ef-c-grammar)",
  meaning: "var(--ef-c-meaning)",
  terminology: "var(--ef-c-term)",
  organization: "var(--ef-c-order)",
  spelling: "var(--ef-c-spell)",
};

export const CATEGORY_KO: Record<string, string> = {
  "be-verb": "be동사",
  "verb-form": "동사 형태",
  tense: "시제",
  agreement: "주어-동사 일치",
  preposition: "전치사",
  article: "관사",
  "word-order": "어순",
  "word-choice": "단어 선택",
  "missing-content": "빠진 내용",
  "meaning-shift": "의미 변화",
  terminology: "현장 용어",
  spelling: "철자",
  "sentence-structure": "문장 구조",
  countability: "셀 수 없는 명사",
};

export const SEVERITY_KO = { minor: "사소함", major: "주요", critical: "치명적" } as const;

/** The learner's sentence with error spans underlined and missing words marked with a caret. */
export function AnswerHighlight({ text, errors, active, onSelect }: { text: string; errors: ErrorSpan[]; active?: string | null; onSelect?: (id: string) => void }) {
  const sorted = [...errors].filter((e) => e.start <= text.length).sort((a, b) => a.start - b.start || a.end - b.end);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  let lastEnd = -1;
  for (const e of sorted) {
    if (e.start < lastEnd) continue; // overlapping span: shown in the list only
    if (e.start > pos) parts.push(<span key={`t${pos}`}>{text.slice(pos, e.start)}</span>);
    const cls = markClass(e);
    if (e.start === e.end) {
      parts.push(
        <button
          key={e.id}
          type="button"
          className="ef-caret dd-focus align-baseline"
          style={{ ["--caret" as string]: BUCKET_COLOR[cls] }}
          onClick={() => onSelect?.(e.id)}
          aria-label={`빠진 단어: ${e.fix}`}
          title={`+ ${e.fix}`}
        />,
      );
      pos = e.start;
    } else {
      parts.push(
        <button
          key={e.id}
          type="button"
          className="ef-mark dd-focus"
          data-c={cls}
          data-advisory={e.advisory ? "true" : undefined}
          data-active={active === e.id}
          style={{ color: "inherit" }}
          onClick={() => onSelect?.(e.id)}
          aria-label={`${CATEGORY_KO[e.category] ?? e.category} 오류: ${text.slice(e.start, e.end)}`}
        >
          {text.slice(e.start, e.end)}
        </button>,
      );
      pos = e.end;
      lastEnd = e.end;
    }
  }
  if (pos < text.length) parts.push(<span key={`t${pos}`}>{text.slice(pos)}</span>);
  return <p className="ef-en ef-answer whitespace-pre-wrap break-words">{parts.length ? parts : <span className="text-[var(--muted)]">(답 없음)</span>}</p>;
}

/* ───────────── Word diff (learner → minimal correction) ───────────── */

type DiffSeg = { t: "same" | "ins" | "del"; text: string };

export function wordDiff(a: string, b: string): DiffSeg[] {
  const A = a.trim().split(/\s+/).filter(Boolean);
  const B = b.trim().split(/\s+/).filter(Boolean);
  const norm = (w: string) => w.toLowerCase().replace(/[.,!?;:]$/, "");
  const n = A.length;
  const m = B.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = norm(A[i]) === norm(B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffSeg[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(A[i]) === norm(B[j])) {
      out.push({ t: "same", text: B[j] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: "del", text: A[i++] });
    else out.push({ t: "ins", text: B[j++] });
  }
  while (i < n) out.push({ t: "del", text: A[i++] });
  while (j < m) out.push({ t: "ins", text: B[j++] });
  return out;
}

export function DiffLine({ from, to }: { from: string; to: string }) {
  const segs = wordDiff(from, to);
  return (
    <p className="ef-en text-[16px] leading-8 md:text-[17px]">
      {segs.map((s, i) => (
        <React.Fragment key={i}>
          {i ? " " : ""}
          <span className={s.t === "ins" ? "ef-ins" : s.t === "del" ? "ef-del" : undefined}>{s.text}</span>
        </React.Fragment>
      ))}
    </p>
  );
}

/* ───────────── Meaning check chips ───────────── */

export function MeaningCheckList({ items }: { items: MeaningCheck[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="의미 단위 확인">
      {items.map((m) => {
        // A non-critical term slot is reference only: wording differs between plants.
        const reference = m.term && !m.critical;
        return (
          <li
            key={m.id}
            className={cn(
              "ef-ko inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px]",
              m.present
                ? "border-transparent bg-[var(--ef-ok-soft)] text-[var(--ef-ok)]"
                : reference
                  ? "border-dashed border-[var(--line)] text-[var(--muted)]"
                  : "border-[var(--ef-bad)]/30 bg-[var(--ef-bad-soft)] text-[var(--ef-bad)]",
            )}
            title={reference && !m.present ? `기준 답안 용어: ${m.en} (현장마다 달라 점수에 반영하지 않음)` : m.en}
          >
            {m.present ? <Check className="size-3" /> : reference ? null : <X className="size-3" />}
            {m.ko}
            {reference && !m.present ? <span className="ef-en ml-0.5 text-[11px]">· {m.en}</span> : null}
            {m.term ? <span className="ml-0.5 rounded bg-black/5 px-1 text-[9px] font-semibold tracking-wide dark:bg-white/10">{reference ? "용어 참고" : "용어"}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
