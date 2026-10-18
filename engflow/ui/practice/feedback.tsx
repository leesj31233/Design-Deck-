"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, BadgeCheck, BookOpen, CheckCircle2, ChevronDown, Copy, Cpu, Info, RotateCcw, Sparkles, TrendingDown } from "lucide-react";
import type { Evaluation, Question } from "../../core/types";
import { BorderBeam, Button, Card, Eyebrow, Meter, Pressable, ScoreRing, TONE_TEXT, Tag, cn, scoreTone, useReduced } from "../kit";
import { AnswerHighlight, BUCKET_COLOR, CATEGORY_KO, DiffLine, MeaningCheckList, SEVERITY_KO, markClass } from "./parts";
import type { GuideTab } from "../guide";
import type { Celebration } from "../../core/celebration";
import { CelebrationBanner } from "../celebrate";
import { SpeakButton } from "../speech";

/** Weights shown next to each rubric meter (same as SCORE_WEIGHTS in the evaluator). */
const WEIGHT_LABEL = { grammar: "55%", meaning: "35%", organization: "10%" } as const;

export function FeedbackPanel({
  question, evaluation, note, gradeMs, weakNote, onGuide, compact, scheduleNote, celebration, effects = true, sound = false, slowSpeech,
}: {
  question: Question;
  evaluation: Evaluation;
  /** Why this grader was used (e.g. Claude was too slow), shown once under the verdict. */
  note?: string | null;
  /** Time from submit to this result (shown next to the grader's name). */
  gradeMs?: number | null;
  /** "You've missed this grammar N times" — explains why similar questions follow. */
  weakNote?: string | null;
  onGuide: (skill: string, tab: GuideTab) => void;
  compact?: boolean;
  scheduleNote?: string | null;
  /** The moment this answer is celebrated as (decided once by the session). */
  celebration?: Celebration | null;
  effects?: boolean;
  sound?: boolean;
  slowSpeech?: boolean;
}) {
  const reduced = useReduced();
  const [active, setActive] = React.useState<string | null>(null);
  const [showMore, setShowMore] = React.useState(!compact);
  const e = evaluation;
  const s = e.scores;
  const tone = scoreTone(s.overall);
  const scored = e.errors.filter((x) => !x.advisory);
  const mainSkill = scored.find((x) => x.severity !== "minor")?.skill ?? question.skills[0];
  // A reworded answer that only the rule-based grader saw cannot be called correct: it may hide errors.
  const unverified = e.evaluator === "local" && e.confidence === "low";
  const correct = !unverified && (e.exact || (scored.every((x) => x.category === "spelling") && s.overall >= 90));
  // Grammar first, then spelling, then site-wording suggestions.
  const rank = (x: (typeof e.errors)[number]) => (x.advisory ? 2 : x.category === "spelling" ? 1 : 0);
  const listed = [...e.errors].sort((a, b) => rank(a) - rank(b) || a.start - b.start);
  const stagger = (i: number) => (reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.05 * i, duration: 0.22 } });

  return (
    <div className="space-y-3" aria-live="polite">
      {celebration ? <CelebrationBanner c={celebration} effects={effects} sound={sound} /> : null}
      {/* Verdict */}
      <motion.div {...stagger(0)}>
        <Card className="relative p-4 md:p-5">
          {/* A perfect answer: one light runs around the verdict, once. */}
          {s.overall === 100 ? <BorderBeam duration={2.2} /> : null}
          <div className="flex items-start gap-4">
            <ScoreRing score={s.overall} size={compact ? 64 : 84} label="종합" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {unverified && !scored.some((x) => x.severity !== "minor") ? (
                  <span className="text-[14px] font-semibold text-[var(--ef-warn)]">규칙 검사만 통과 · 확인 못 함</span>
                ) : correct ? (
                  <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--ef-ok)]">
                    <CheckCircle2 className="size-4" style={{ animation: reduced ? undefined : "ef-pop .4s ease" }} /> 정확해요
                  </span>
                ) : (
                  <span className={cn("text-[14px] font-semibold", TONE_TEXT[tone])}>{tone === "ok" ? "거의 맞았어요" : tone === "warn" ? "조금 더 다듬어요" : "다시 연습해요"}</span>
                )}
                <EvaluatorBadge evaluation={e} ms={gradeMs ?? null} />
              </div>
              <p className="ef-ko mt-1.5 text-[15px] text-[var(--foreground)]">{e.summaryKo}</p>
              {note ? (
                <p className="ef-ko mt-1 flex items-start gap-1 text-[12px] text-[var(--muted)]">
                  <Info className="mt-0.5 size-3 shrink-0" /> {note}
                </p>
              ) : null}
              <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-full bg-[var(--background)] px-2.5 py-1 text-[12px]">
                <span className="font-medium">회의 전달력</span>
                <span className={cn("ef-num font-semibold", TONE_TEXT[scoreTone(s.comprehensibility.score)])}>{s.comprehensibility.score}</span>
                <span className="ef-ko text-[var(--muted)]">{s.comprehensibility.noteKo}</span>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Rubric */}
      <motion.div {...stagger(1)}>
        <Card className="grid gap-4 p-4 sm:grid-cols-2 md:p-5">
          <Meter label="문법 정확도" weight={WEIGHT_LABEL.grammar} value={s.grammar.score} note={s.grammar.noteKo} compact={compact} />
          <Meter label="핵심 의미·표현" weight={WEIGHT_LABEL.meaning} value={s.meaning.score} note={s.meaning.noteKo} delay={60} compact={compact} />
          <Meter label="어순·문장 구조" weight={WEIGHT_LABEL.organization} value={s.organization.score} note={s.organization.noteKo} delay={120} compact={compact} />
          <div className="ef-ko flex items-start gap-1.5 self-center text-[12px] text-[var(--muted)]">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium text-[var(--ef-ink-2)]">현장 용어 · 점수 미반영</span> — {s.terminology.noteKo}
            </span>
          </div>
        </Card>
      </motion.div>

      {/* Learner sentence with highlights + errors */}
      <motion.div {...stagger(2)}>
        <Card className="p-4 md:p-5">
          <Eyebrow>내 답</Eyebrow>
          <div className="mt-2">
            <AnswerHighlight text={e.answer} errors={e.errors} active={active} onSelect={(id) => setActive((a) => (a === id ? null : id))} />
          </div>
          {listed.length ? (
            <ul className="mt-3 space-y-2">
              {listed.map((er) => {
                const cls = markClass(er);
                return (
                  <li key={er.id}>
                    <Pressable
                      type="button"
                      lift={1}
                      onClick={() => setActive((a) => (a === er.id ? null : er.id))}
                      className={cn("w-full rounded-2xl border p-3 transition-colors", active === er.id ? "border-[var(--foreground)]/30 bg-[var(--background)]" : "border-[var(--line)]")}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                          <span className="size-2 rounded-full" style={{ background: BUCKET_COLOR[cls] }} />
                          {CATEGORY_KO[er.category] ?? er.category}
                        </span>
                        {er.advisory ? (
                          <Tag className="border-dashed bg-transparent px-1.5 py-0 text-[10px] dark:bg-transparent">참고 · 점수 미반영</Tag>
                        ) : er.category === "spelling" ? (
                          <span className="text-[10px] font-semibold text-[var(--muted)]">감점 거의 없음</span>
                        ) : (
                          <span className={cn("text-[10px] font-semibold", er.severity === "critical" ? "text-[var(--ef-bad)]" : er.severity === "major" ? "text-[var(--ef-warn)]" : "text-[var(--muted)]")}>{SEVERITY_KO[er.severity]}</span>
                        )}
                        <span className="ef-en text-[14px]">
                          {er.text ? <span className="ef-del">{er.text}</span> : <span className="text-[var(--muted)]">빠짐</span>}
                          <span className="mx-1 text-[var(--muted)]">→</span>
                          {er.fix ? <span className="ef-ins">{er.fix}</span> : <span className="text-[var(--muted)]">삭제</span>}
                        </span>
                      </div>
                      <p className="ef-ko mt-1.5 text-[14px] text-[var(--ef-ink-2)]">{er.messageKo}</p>
                    </Pressable>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={cn("ef-ko mt-3 text-[14px]", unverified ? "text-[var(--muted)]" : "text-[var(--ef-ok)]")}>
              {unverified ? "규칙 기반 검사로는 오류를 찾지 못했습니다(처음 보는 문장이라 모든 오류를 확인하지는 못했습니다)." : "문법 오류를 찾지 못했습니다."}
            </p>
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
              <Eyebrow>원어민이 회의에서 자주 쓰는 표현</Eyebrow>
              <span className="flex items-center gap-0.5">
                <SpeakButton text={e.recommended} slow={slowSpeech} label="추천 문장 읽어 주기" />
                <CopyButton text={e.recommended} />
              </span>
            </div>
            <p className="ef-en mt-2 text-[17px] font-medium leading-7">{e.recommended}</p>
            {question.expression ? (
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <Tag tone="accent" className="rounded-md px-1.5 text-[10px]">핵심 표현</Tag>
                <span className="ef-en font-medium">{question.expression}</span>
              </p>
            ) : null}
          </div>
          {e.advanced || e.alternatives.length ? (
            <div className="p-4 md:p-5">
              <Button variant="ghost" size="sm" className="-mx-2 h-8 w-[calc(100%+16px)] justify-between px-2" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
                <Eyebrow>다른 자연스러운 표현</Eyebrow>
                <ChevronDown className={cn("size-4 text-[var(--muted)] transition", showMore && "rotate-180")} />
              </Button>
              <AnimatePresence initial={false}>
                {showMore ? (
                  <motion.div initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduced ? undefined : { height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="space-y-2 pt-2">
                      {e.advanced ? (
                        <p className="ef-en text-[15px]">
                          <Tag tone="accent" className="mr-2 rounded-md px-1.5 align-[1px] text-[10px]">고급 · 선택</Tag>
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
                <Button key={t} variant="secondary" size="sm" onClick={() => onGuide(mainSkill, t)} className="h-9 whitespace-nowrap rounded-full px-3 text-[13px]">
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </motion.div>

      {weakNote ? (
        <motion.div {...stagger(5)}>
          <div className="ef-ko flex items-start gap-2 rounded-2xl border border-[var(--line)] px-4 py-3 text-[13px] text-[var(--ef-ink-2)]">
            <TrendingDown className="mt-0.5 size-4 shrink-0 text-[var(--ef-warn)]" />
            <div>{weakNote}</div>
          </div>
        </motion.div>
      ) : null}

      {/* Review decision */}
      <motion.div {...stagger(6)}>
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

/** Seconds with one decimal ("0.4초"). */
export function secondsKo(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toFixed(1)}초`;
}

function EvaluatorBadge({ evaluation, ms }: { evaluation: Evaluation; ms: number | null }) {
  const time = ms !== null ? <span className="ef-num font-normal opacity-80">· {secondsKo(ms)}</span> : null;
  if (evaluation.exact && evaluation.learned)
    return (
      <Tag tone="ok" title="전에 Claude가 정확하다고 확인한 내 표현이라 기다리지 않고 바로 채점했습니다.">
        <BadgeCheck className="size-3" /> Claude 확인한 내 표현 {time}
      </Tag>
    );
  if (evaluation.evaluator === "ai")
    return (
      <Tag tone="accent" title="Claude가 문법을 정밀 채점했습니다. 점수는 오류 목록으로 계산합니다.">
        <Sparkles className="size-3" /> Claude 채점 {time}
      </Tag>
    );
  return (
    <Tag className="font-medium" title="기준 답안·의미 단위·문법 규칙으로 즉시 채점">
      <Cpu className="size-3" /> 규칙 기반 {time}
    </Tag>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 rounded-lg px-2 text-[11px] font-normal text-[var(--muted)]"
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
    </Button>
  );
}
