"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, Copy, Cpu, Loader2, RotateCcw, Sparkles } from "lucide-react";
import type { Evaluation, Question } from "../../core/types";
import { Card, Eyebrow, Meter, ScoreRing, TONE_TEXT, cn, scoreTone, useReduced } from "../kit";
import { AnswerHighlight, BUCKET_COLOR, CATEGORY_KO, DiffLine, MeaningCheckList, SEVERITY_KO, markClass } from "./parts";
import type { GuideTab } from "../guide";

export interface AIState {
  status: "off" | "available" | "pending" | "done" | "error";
  message?: string;
}

export function FeedbackPanel({
  question, evaluation, ai, onRequestAI, onRetryAI, onGuide, compact, scheduleNote,
}: {
  question: Question;
  evaluation: Evaluation;
  ai: AIState;
  onRequestAI?: () => void;
  onRetryAI?: () => void;
  onGuide: (skill: string, tab: GuideTab) => void;
  compact?: boolean;
  scheduleNote?: string | null;
}) {
  const reduced = useReduced();
  const [active, setActive] = React.useState<string | null>(null);
  const [showMore, setShowMore] = React.useState(!compact);
  const e = evaluation;
  const s = e.scores;
  const tone = scoreTone(s.overall);
  const mainSkill = e.errors.find((x) => x.severity !== "minor")?.skill ?? question.skills[0];
  const correct = e.exact || (e.errors.length === 0 && s.overall >= 90);
  const stagger = (i: number) => (reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.05 * i, duration: 0.22 } });

  return (
    <div className="space-y-3" aria-live="polite">
      {/* Verdict */}
      <motion.div {...stagger(0)}>
        <Card className="p-4 md:p-5">
          <div className="flex items-start gap-4">
            <ScoreRing score={s.overall} size={compact ? 64 : 84} label="종합" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {correct ? (
                  <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--ef-ok)]">
                    <CheckCircle2 className="size-4" style={{ animation: reduced ? undefined : "ef-pop .4s ease" }} /> 정확해요
                  </span>
                ) : (
                  <span className={cn("text-[14px] font-semibold", TONE_TEXT[tone])}>{tone === "ok" ? "거의 맞았어요" : tone === "warn" ? "조금 더 다듬어요" : "다시 연습해요"}</span>
                )}
                <EvaluatorBadge evaluation={e} ai={ai} onRequestAI={onRequestAI} onRetryAI={onRetryAI} />
              </div>
              <p className="ef-ko mt-1.5 text-[15px] text-[var(--foreground)]">{e.summaryKo}</p>
              <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-full bg-[var(--background)] px-2.5 py-1 text-[12px]">
                <span className="font-medium">회의 전달력</span>
                <span className={cn("ef-num font-semibold", TONE_TEXT[scoreTone(s.comprehensibility.score)])}>{s.comprehensibility.score}</span>
                <span className="ef-ko text-[var(--muted)]">{s.comprehensibility.noteKo}</span>
              </div>
            </div>
          </div>
          {ai.status === "pending" ? <div className="ef-skeleton mt-4 h-1.5 w-full" aria-label="Claude 분석 중" /> : null}
        </Card>
      </motion.div>

      {/* Rubric */}
      <motion.div {...stagger(1)}>
        <Card className="grid gap-4 p-4 sm:grid-cols-2 md:p-5">
          <Meter label="의미 전달" weight={question.mode === "sentence" ? "30%" : "50%"} value={s.meaning.score} note={s.meaning.noteKo} compact={compact} />
          <Meter label="문법 정확도" weight={question.mode === "sentence" ? "30%" : undefined} value={s.grammar.score} note={s.grammar.noteKo} delay={60} compact={compact} />
          {question.mode === "sentence" ? <Meter label="기술 용어" weight="20%" value={s.terminology.score} note={s.terminology.noteKo} delay={120} compact={compact} /> : null}
          <Meter label="문장 구조·어순" weight={question.mode === "sentence" ? "20%" : undefined} value={s.organization.score} note={s.organization.noteKo} delay={180} compact={compact} />
        </Card>
      </motion.div>

      {/* Learner sentence with highlights + errors */}
      <motion.div {...stagger(2)}>
        <Card className="p-4 md:p-5">
          <Eyebrow>내 답</Eyebrow>
          <div className="mt-2">
            <AnswerHighlight text={e.answer} errors={e.errors} active={active} onSelect={(id) => setActive((a) => (a === id ? null : id))} />
          </div>
          {e.errors.length ? (
            <ul className="mt-3 space-y-2">
              {e.errors.map((er) => {
                const cls = markClass(er);
                return (
                  <li key={er.id}>
                    <button
                      onClick={() => setActive((a) => (a === er.id ? null : er.id))}
                      className={cn("dd-focus w-full rounded-2xl border p-3 text-left transition", active === er.id ? "border-[var(--foreground)]/30 bg-[var(--background)]" : "border-[var(--line)]")}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                          <span className="size-2 rounded-full" style={{ background: BUCKET_COLOR[cls] }} />
                          {CATEGORY_KO[er.category] ?? er.category}
                        </span>
                        <span className={cn("text-[10px] font-semibold", er.severity === "critical" ? "text-[var(--ef-bad)]" : er.severity === "major" ? "text-[var(--ef-warn)]" : "text-[var(--muted)]")}>{SEVERITY_KO[er.severity]}</span>
                        <span className="ef-en text-[14px]">
                          {er.text ? <span className="ef-del">{er.text}</span> : <span className="text-[var(--muted)]">빠짐</span>}
                          <span className="mx-1 text-[var(--muted)]">→</span>
                          {er.fix ? <span className="ef-ins">{er.fix}</span> : <span className="text-[var(--muted)]">삭제</span>}
                        </span>
                      </div>
                      <p className="ef-ko mt-1.5 text-[14px] text-[var(--ef-ink-2)]">{er.messageKo}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ef-ko mt-3 text-[14px] text-[var(--ef-ok)]">문법 오류를 찾지 못했습니다.</p>
          )}
          {e.confidenceNoteKo ? (
            <p className="ef-ko mt-3 flex items-start gap-1.5 text-[12px] text-[var(--muted)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {e.confidenceNoteKo}
            </p>
          ) : null}
        </Card>
      </motion.div>

      {/* Corrections */}
      <motion.div {...stagger(3)}>
        <Card className="divide-y divide-[var(--line)]">
          {!correct ? (
            <div className="p-4 md:p-5">
              <Eyebrow>최소 수정 · 내 표현 유지</Eyebrow>
              <div className="mt-2">
                <DiffLine from={e.answer} to={e.corrected} />
              </div>
            </div>
          ) : null}
          <div className="p-4 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <Eyebrow>추천 문장 · 국제 회의용 쉬운 영어</Eyebrow>
              <CopyButton text={e.recommended} />
            </div>
            <p className="ef-en mt-2 text-[17px] font-medium leading-7">{e.recommended}</p>
          </div>
          {e.advanced || e.alternatives.length ? (
            <div className="p-4 md:p-5">
              <button className="dd-focus flex w-full items-center justify-between rounded-lg text-left" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
                <Eyebrow>고급 표현 · 다른 정답</Eyebrow>
                <ChevronDown className={cn("size-4 text-[var(--muted)] transition", showMore && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {showMore ? (
                  <motion.div initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduced ? undefined : { height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="space-y-2 pt-2">
                      {e.advanced ? (
                        <p className="ef-en text-[15px]">
                          <span className="mr-2 rounded bg-[var(--ef-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ef-accent-ink)]">ADVANCED</span>
                          {e.advanced}
                        </p>
                      ) : null}
                      {e.alternatives.map((a) => (
                        <p key={a} className="ef-en text-[15px] text-[var(--ef-ink-2)]">· {a}</p>
                      ))}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </Card>
      </motion.div>

      {/* Meaning + grammar */}
      <motion.div {...stagger(4)}>
        <Card className="p-4 md:p-5">
          <Eyebrow>의미 단위</Eyebrow>
          <div className="mt-2">
            <MeaningCheckList items={e.meaning} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <BookOpen className="size-4 text-[var(--muted)]" />
            <Eyebrow>문법 설명</Eyebrow>
          </div>
          <p className="ef-ko mt-1.5 whitespace-pre-line text-[15px] text-[var(--ef-ink-2)]">{e.grammarKo}</p>
          <div className="ef-scroll-x -mx-1 mt-3 px-1">
            <div className="flex w-max gap-1.5">
              {(
                [
                  ["why", "왜 틀렸나요?"],
                  ["simpler", "더 쉽게 설명"],
                  ["example", "다른 예문"],
                  ["compare", "비슷한 표현 비교"],
                ] as [GuideTab, string][]
              ).map(([t, label]) => (
                <button key={t} onClick={() => onGuide(mainSkill, t)} className="dd-focus h-9 whitespace-nowrap rounded-full border border-[var(--line)] px-3 text-[13px] font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]">
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Review decision */}
      <motion.div {...stagger(5)}>
        <div className={cn("ef-ko flex items-start gap-2 rounded-2xl px-4 py-3 text-[13px]", e.review.add ? "bg-[var(--ef-warn-soft)] text-[var(--ef-warn)]" : "bg-[var(--ef-ok-soft)] text-[var(--ef-ok)]")}>
          {e.review.add ? <RotateCcw className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <div>
            <div className="font-semibold">{e.review.add ? "복습 목록에 추가" : "복습 불필요"}</div>
            <div className="text-[var(--ef-ink-2)]">{scheduleNote ?? e.review.reasonKo}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function EvaluatorBadge({ evaluation, ai, onRequestAI, onRetryAI }: { evaluation: Evaluation; ai: AIState; onRequestAI?: () => void; onRetryAI?: () => void }) {
  if (ai.status === "pending")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ef-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ef-accent-ink)]">
        <Loader2 className="size-3 animate-spin" /> Claude 검토 중
      </span>
    );
  if (evaluation.evaluator === "ai")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ef-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ef-accent-ink)]">
        <Sparkles className="size-3" /> Claude 분석
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]" title="기준 답안·의미 단위·문법 규칙으로 즉시 채점">
        <Cpu className="size-3" /> 규칙 기반
      </span>
      {ai.status === "available" && onRequestAI ? (
        <button onClick={onRequestAI} className="dd-focus inline-flex items-center gap-1 rounded-full bg-[var(--ef-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ef-accent-ink)]">
          <Sparkles className="size-3" /> Claude로 정밀 분석
        </button>
      ) : null}
      {ai.status === "error" ? (
        <button onClick={onRetryAI} className="dd-focus inline-flex items-center gap-1 rounded-full bg-[var(--ef-bad-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ef-bad)]" title={ai.message}>
          Claude 분석 실패 · 다시 시도
        </button>
      ) : null}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      className="dd-focus inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/10"
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          })
          .catch(() => undefined);
      }}
      aria-label="추천 문장 복사"
    >
      <Copy className="size-3" />
      {done ? "복사됨" : "복사"}
    </button>
  );
}
