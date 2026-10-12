"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CheckCircle2, ChevronDown, CornerDownLeft, Eye, Lightbulb, RotateCcw, SkipForward, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { evaluateLocal } from "../../core/evaluate";
import { pickReviewQuestion, type SessionItem } from "../../core/session";
import type { RecordResult } from "../../core/store";
import type { Evaluation, HintLevel, Question } from "../../core/types";
import { STATUS_LABEL_KO } from "../../core/mastery";
import { GRADE_LABEL_KO } from "../../core/scheduler";
import { skillName } from "../../content";
import { AIUnavailableError } from "../../platform/types";
import { useApp } from "../store";
import { Card, ConfirmDialog, Eyebrow, LevelBadge, ScoreRing, StatusChip, TONE_TEXT, cn, relTimeKo, scoreTone, useReduced } from "../kit";
import { MeaningChunks } from "./parts";
import { FeedbackPanel, type AIState } from "./feedback";
import { GuideSheet, type GuideTab } from "../guide";

export const CATEGORY_LABEL: Record<string, string> = {
  process: "공정 설계",
  pilot: "파일럿·R&D",
  meeting: "프로젝트 회의",
  collab: "국제 협업",
  operation: "플랜트 운전",
  business: "사업·프로젝트",
};

export interface SessionSpec {
  id: string;
  title: string;
  kind: "lesson" | "review";
  items: SessionItem[];
  note?: string;
}

type QueueItem = SessionItem & { retry?: boolean };

interface Done {
  item: QueueItem;
  question: Question;
  result: RecordResult;
  evaluation: Evaluation;
}

function Hints({ q, level, onReveal }: { q: Question; level: HintLevel; onReveal: () => void }) {
  const reduced = useReduced();
  const items: { label: string; body: React.ReactNode }[] = [
    { label: "문법 패턴", body: <span className="ef-mono text-[14px]">{q.hints.pattern}</span> },
    { label: "문장 뼈대", body: <span className="ef-en text-[16px]">{q.hints.skeleton}</span> },
    { label: "앞부분", body: <span className="ef-en text-[16px]">{q.hints.partial}</span> },
    {
      label: "정답과 설명",
      body: (
        <div>
          <p className="ef-en text-[16px] font-medium">{q.reference}</p>
          <p className="ef-ko mt-1 text-[13px] text-[var(--ef-ink-2)]">{q.explanationKo}</p>
        </div>
      ),
    },
  ];
  if (!level) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.slice(0, level).map((h, i) => (
          <motion.div
            key={h.label}
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex gap-3 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-3.5 py-2.5">
              <span className="ef-mono mt-0.5 text-[11px] font-semibold text-[var(--muted)]">H{i + 1}</span>
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-[var(--muted)]">{h.label}</div>
                <div className="mt-0.5">{h.body}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {level === 1 ? <p className="ef-ko px-1 text-[11px] text-[var(--muted)]">힌트를 쓰면 이 답은 독립 숙련 증거로 덜 반영됩니다(복습 간격도 짧아집니다).</p> : null}
      {level === 3 ? (
        <button onClick={onReveal} className="dd-focus inline-flex items-center gap-1 px-1 text-[12px] text-[var(--muted)] underline underline-offset-4">
          <Eye className="size-3" /> 정답 보기
        </button>
      ) : null}
    </div>
  );
}

export function SessionRunner({ spec, onExit, onPracticeSkill }: { spec: SessionSpec; onExit: () => void; onPracticeSkill: (skill: string) => void }) {
  const app = useApp();
  const reduced = useReduced();
  const [queue, setQueue] = React.useState<QueueItem[]>(spec.items);
  const [idx, setIdx] = React.useState(0);
  const [answer, setAnswer] = React.useState("");
  const [hint, setHint] = React.useState<HintLevel>(0);
  const [phase, setPhase] = React.useState<"answer" | "feedback">("answer");
  const [local, setLocal] = React.useState<Evaluation | null>(null);
  const [aiEval, setAiEval] = React.useState<Evaluation | null>(null);
  const [ai, setAi] = React.useState<AIState>({ status: "off" });
  const [committed, setCommitted] = React.useState<RecordResult | null>(null);
  const [practiceRetry, setPracticeRetry] = React.useState(false);
  const [done, setDone] = React.useState<Done[]>([]);
  const [finished, setFinished] = React.useState(false);
  const [showNatural, setShowNatural] = React.useState(app.state.settings.showNaturalKorean);
  const [confirmExit, setConfirmExit] = React.useState(false);
  const [guide, setGuide] = React.useState<{ skill: string; tab: GuideTab } | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [nudge, setNudge] = React.useState(false);
  const t0 = React.useRef(app.now());
  const firstKey = React.useRef<number | null>(null);
  const aiCtl = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const nextRef = React.useRef<HTMLButtonElement>(null);

  const item = queue[idx];
  const q = item ? app.qIndex[item.questionId] : undefined;
  const evaluation = aiEval ?? local;
  const settings = app.state.settings;
  const aiPossible = app.ai.available && settings.ai !== "off";

  // Reset per question.
  React.useEffect(() => {
    setAnswer("");
    setHint(0);
    setPhase("answer");
    setLocal(null);
    setAiEval(null);
    setAi({ status: "off" });
    setCommitted(null);
    setPracticeRetry(false);
    t0.current = app.now();
    firstKey.current = null;
    aiCtl.current?.abort();
    const t = setTimeout(() => {
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) inputRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, item?.questionId]);

  React.useEffect(() => () => aiCtl.current?.abort(), []);

  const pulse = (id: string) => {
    setFlash(id);
    setTimeout(() => setFlash(null), 450);
  };

  const runAI = React.useCallback(
    (question: Question, text: string, base: Evaluation) => {
      aiCtl.current?.abort();
      const c = new AbortController();
      aiCtl.current = c;
      setAi({ status: "pending" });
      const depth = question.mode === "sentence" ? settings.aiDepth : "quick";
      app.platform.ai
        .evaluate(question, text, base, depth, c.signal)
        .then((ev) => {
          if (c.signal.aborted) return;
          setAiEval(ev);
          setAi({ status: "done" });
        })
        .catch((e) => {
          if (c.signal.aborted || (e instanceof AIUnavailableError && e.code === "cancelled")) return;
          setAi({ status: "error", message: e instanceof Error ? e.message : String(e) });
        });
    },
    [app.platform.ai, settings.aiDepth],
  );

  const submit = () => {
    if (!q || phase !== "answer") return;
    const text = answer.trim();
    if (!text) {
      setNudge(true);
      setTimeout(() => setNudge(false), 1600);
      inputRef.current?.focus();
      return;
    }
    const ev = evaluateLocal(q, text, { hintLevel: hint });
    setLocal(ev);
    setAiEval(null);
    setPhase("feedback");
    if (aiPossible && !ev.exact) {
      const auto = settings.ai === "auto" && (q.mode === "sentence" || ev.errors.length > 0 || ev.confidence !== "high");
      if (auto) runAI(q, text, ev);
      else setAi({ status: "available" });
    }
    setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 50);
  };

  const commit = (opts: { skipped?: boolean } = {}): RecordResult | null => {
    if (!q || !item || committed || practiceRetry) return committed;
    const ev = opts.skipped ? evaluateLocal(q, "") : evaluation;
    if (!ev) return null;
    aiCtl.current?.abort();
    const responseMs = app.now() - t0.current;
    const result = app.record({
      question: q,
      evaluation: ev,
      hint,
      responseMs,
      firstKeyMs: firstKey.current ? firstKey.current - t0.current : null,
      context: item.kind === "review" ? "review" : "lesson",
      reviewItemId: item.reviewItemId,
      skipped: opts.skipped,
    });
    setCommitted(result);
    setDone((d) => [...d, { item, question: q, result, evaluation: ev }]);
    // Significant error → immediate retry with a different sentence for the same grammar.
    if (result.grade === 1 && !item.retry) {
      const target = result.scheduled[0] ? result.state.items[result.scheduled[0].itemId] : undefined;
      const rq = target ? pickReviewQuestion({ ...target, recentQuestionIds: [...target.recentQuestionIds, q.id] }, app.questions, "mixed") : null;
      if (target && rq && rq.id !== q.id && !queue.some((x, k) => k > idx && x.questionId === rq.id)) {
        const at = Math.min(queue.length, idx + 3);
        setQueue((qq) => [...qq.slice(0, at), { kind: "review", questionId: rq.id, reviewItemId: target.id, reasonKo: "즉시 재시도 · 같은 문법, 다른 문장", retry: true }, ...qq.slice(at)]);
      }
    }
    return result;
  };

  const next = () => {
    if (phase === "feedback") commit();
    if (idx + 1 >= queue.length) setFinished(true);
    else setIdx((i) => i + 1);
  };

  const skip = () => {
    commit({ skipped: true });
    if (idx + 1 >= queue.length) setFinished(true);
    else setIdx((i) => i + 1);
  };

  const retry = () => {
    commit();
    setPracticeRetry(true);
    setAnswer("");
    setPhase("answer");
    setLocal(null);
    setAiEval(null);
    setAi({ status: "off" });
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const showHint = () => {
    if (phase !== "answer") return;
    setHint((h) => (Math.min(4, h + 1) as HintLevel));
  };

  // Keyboard shortcuts (layout-independent codes; ignore IME composition).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished || guide || confirmExit) return;
      if (e.isComposing) return;
      if (e.altKey && e.code === "KeyH") {
        e.preventDefault();
        pulse("hint");
        showHint();
      } else if (e.altKey && e.code === "KeyS" && phase === "answer") {
        e.preventDefault();
        pulse("skip");
        skip();
      } else if (e.altKey && e.code === "KeyR" && phase === "feedback") {
        e.preventDefault();
        pulse("retry");
        retry();
      } else if (e.altKey && e.code === "KeyG" && phase === "feedback" && q) {
        e.preventDefault();
        setGuide({ skill: q.skills[0], tab: "why" });
      } else if (e.key === "Enter" && phase === "feedback" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement && e.target !== nextRef.current)) {
        e.preventDefault();
        pulse("next");
        next();
      } else if (e.key === "Escape" && phase === "answer") {
        e.preventDefault();
        requestExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const requestExit = () => {
    if (phase === "answer" && answer.trim()) setConfirmExit(true);
    else {
      if (phase === "feedback") commit();
      onExit();
    }
  };

  if (finished) return <SessionSummary spec={spec} done={done} onExit={onExit} />;
  if (!q || !item) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="ef-ko text-[15px] text-[var(--muted)]">이 세션에 표시할 문항이 없습니다.</p>
        <button className="mt-4 h-11 rounded-xl border border-[var(--line)] px-4" onClick={onExit}>돌아가기</button>
      </div>
    );
  }

  const isSentence = q.mode === "sentence";
  const progress = queue.length ? (idx + (phase === "feedback" ? 1 : 0)) / queue.length : 0;

  return (
    <div className="flex min-h-full flex-col">
      {/* Top bar */}
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-[var(--line)] bg-[var(--background)]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <button onClick={requestExit} className="dd-focus -ml-2 grid size-10 place-items-center rounded-xl text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/10" aria-label="세션 종료">
            <X className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate font-semibold">{spec.title}</span>
              <span className="ef-num shrink-0 text-[var(--muted)]">
                {Math.min(idx + 1, queue.length)} / {queue.length}
              </span>
            </div>
            <div className="mt-1.5 flex gap-[3px]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              {queue.map((qi, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-300",
                    i < idx || (i === idx && phase === "feedback") ? (qi.kind === "review" ? "bg-[var(--ef-warn-fill)]" : "bg-[var(--accent)]") : i === idx ? "bg-[var(--foreground)]/35" : "bg-[var(--ef-track)]",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={`${idx}-${q.id}`}
          className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-5 md:pt-8"
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24 }}
          transition={{ duration: reduced ? 0.1 : 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 font-medium text-[var(--ef-ink-2)]">{isSentence ? "문장 구성" : "구문 퀴즈"}</span>
            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--ef-ink-2)]">{CATEGORY_LABEL[q.category]}</span>
            <LevelBadge level={q.level} />
            <span className="flex items-center gap-[2px]" aria-label={`난이도 ${q.difficulty}/10`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i < Math.ceil(q.difficulty / 2) ? "bg-[var(--foreground)]/70" : "bg-[var(--ef-track)]")} />
              ))}
            </span>
            {item.kind === "review" ? <span className="rounded-full bg-[var(--ef-warn-soft)] px-2 py-0.5 font-semibold text-[var(--ef-warn)]">{item.reasonKo}</span> : <span className="text-[var(--muted)]">{item.reasonKo}</span>}
          </div>

          <h1 className="mt-3 text-[22px] font-semibold tracking-[-.03em] md:text-[26px]" style={{ textWrap: "balance" }}>
            {q.topic}
            <span className="ml-2 align-middle text-[14px] font-medium tracking-normal text-[var(--muted)]">{q.topicKo}</span>
          </h1>
          {q.contextKo ? <p className="ef-ko mt-1.5 max-w-[62ch] text-[14px] text-[var(--ef-ink-2)]">{q.contextKo}</p> : null}

          {/* Prompt */}
          <div className="mt-5">
            {isSentence ? (
              <>
                <MeaningChunks segments={q.segments} />
                <button onClick={() => setShowNatural((v) => !v)} className="dd-focus mt-3 inline-flex items-center gap-1 rounded-lg text-[12px] text-[var(--muted)]" aria-expanded={showNatural}>
                  <ChevronDown className={cn("size-3.5 transition", showNatural && "rotate-180")} /> 자연스러운 한국어 {showNatural ? "숨기기" : "보기"}
                </button>
                {showNatural ? <p className="ef-ko mt-1 text-[14px] text-[var(--ef-ink-2)]">{q.promptKo}</p> : null}
              </>
            ) : (
              <div>
                <p className="ef-ko text-[22px] font-semibold leading-snug tracking-[-.02em] md:text-[26px]">{q.promptKo}</p>
                {q.segments.length > 1 ? (
                  <div className="mt-3">
                    <MeaningChunks segments={q.segments} size="md" />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Answer */}
          <div className="mt-6">
            {phase === "answer" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <label htmlFor="ef-answer" className="sr-only">영어 답안</label>
                <div className={cn("rounded-[18px] border bg-[var(--surface-strong)] p-1.5 shadow-sm transition focus-within:border-[var(--accent)]/60 focus-within:ring-4 focus-within:ring-[var(--accent)]/10", nudge ? "border-[var(--ef-bad)]" : "border-[var(--line)]")}>
                  {isSentence ? (
                    <textarea
                      id="ef-answer"
                      ref={inputRef}
                      value={answer}
                      rows={3}
                      onChange={(e) => {
                        if (firstKey.current === null) firstKey.current = app.now();
                        setAnswer(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                          e.preventDefault();
                          pulse("submit");
                          submit();
                        }
                      }}
                      placeholder="영어 문장을 입력하세요…"
                      lang="en"
                      autoCapitalize="sentences"
                      autoCorrect={settings.autocorrect ? "on" : "off"}
                      spellCheck={settings.autocorrect}
                      enterKeyHint="send"
                      className="ef-answer block w-full resize-none bg-transparent px-3 py-2.5 outline-none placeholder:text-[var(--muted)]/70"
                    />
                  ) : (
                    <input
                      id="ef-answer"
                      ref={inputRef}
                      value={answer}
                      onChange={(e) => {
                        if (firstKey.current === null) firstKey.current = app.now();
                        setAnswer(e.target.value);
                      }}
                      placeholder="영어로 입력 후 Enter"
                      lang="en"
                      autoCapitalize="sentences"
                      autoCorrect={settings.autocorrect ? "on" : "off"}
                      spellCheck={settings.autocorrect}
                      enterKeyHint="send"
                      autoComplete="off"
                      className="ef-answer block h-12 w-full bg-transparent px-3 outline-none placeholder:text-[var(--muted)]/70"
                    />
                  )}
                </div>
                {nudge ? <p className="ef-ko mt-1.5 px-1 text-[12px] text-[var(--ef-bad)]">답을 입력하세요. 모르면 힌트를 보거나 건너뛸 수 있습니다.</p> : null}
                {practiceRetry ? <p className="ef-ko mt-1.5 px-1 text-[12px] text-[var(--muted)]">연습 재시도 — 학습 기록에는 첫 답이 반영됩니다.</p> : null}

                <div className="mt-3 flex items-center gap-2">
                  <button type="button" onClick={showHint} disabled={hint >= 4} className={cn("dd-focus inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--line)] px-3.5 text-[14px] font-medium disabled:opacity-40", flash === "hint" && "[animation:ef-flash_.45s_ease]")}>
                    <Lightbulb className="size-4" /> 힌트 {hint ? `${hint}/4` : ""}
                    <Kbd className="ef-kbd-hint ml-1">⌥H</Kbd>
                  </button>
                  {!practiceRetry ? (
                    <button type="button" onClick={skip} className={cn("dd-focus inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/10", flash === "skip" && "[animation:ef-flash_.45s_ease]")}>
                      <SkipForward className="size-4" /> 건너뛰기
                    </button>
                  ) : null}
                  <button type="submit" className={cn("dd-focus ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--foreground)] px-5 text-[15px] font-semibold text-[var(--background)] transition active:scale-[.98]", flash === "submit" && "opacity-80")}>
                    제출 <CornerDownLeft className="ef-kbd-hint size-4 opacity-70" />
                  </button>
                </div>
                <p className="ef-kbd-hint mt-2 items-center gap-1.5 px-1 text-[11px] text-[var(--muted)]">
                  <Kbd>Enter</Kbd> 제출 {isSentence ? <><Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> 줄바꿈</> : null} <Kbd>⌥S</Kbd> 건너뛰기 <Kbd>Esc</Kbd> 나가기
                </p>
              </form>
            ) : null}
            <div className="mt-3">
              <Hints q={q} level={hint} onReveal={() => setHint(4)} />
            </div>
          </div>

          {/* Feedback */}
          {phase === "feedback" && evaluation ? (
            <div className="mt-6">
              {practiceRetry ? <p className="ef-ko mb-2 text-[12px] text-[var(--muted)]">연습 재시도 결과입니다. 학습 기록에는 첫 답이 반영되었습니다.</p> : null}
              <FeedbackPanel
                key={evaluation.evaluator}
                question={q}
                evaluation={evaluation}
                ai={ai}
                compact={!isSentence}
                onRequestAI={() => local && runAI(q, local.answer, local)}
                onRetryAI={() => local && runAI(q, local.answer, local)}
                onGuide={(skill, tab) => setGuide({ skill, tab })}
                scheduleNote={committed?.scheduled[0]?.note ?? null}
              />
            </div>
          ) : null}
        </motion.main>
      </AnimatePresence>

      {/* Feedback actions: sticky so they stay reachable on phones */}
      {phase === "feedback" ? (
        <div className="ef-safe-bottom sticky bottom-0 z-20 border-t border-[var(--line)] bg-[var(--background)]/90 pt-2 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4">
            <button onClick={retry} className={cn("dd-focus inline-flex h-12 items-center gap-1.5 rounded-[14px] border border-[var(--line)] px-4 text-[14px] font-medium", flash === "retry" && "[animation:ef-flash_.45s_ease]")}>
              <RotateCcw className="size-4" /> 다시 풀기 <Kbd className="ef-kbd-hint">⌥R</Kbd>
            </button>
            <button
              ref={nextRef}
              onClick={next}
              className={cn("dd-focus ml-auto inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[var(--foreground)] px-5 text-[15px] font-semibold text-[var(--background)] sm:flex-none sm:min-w-44", flash === "next" && "opacity-80")}
            >
              {idx + 1 >= queue.length ? "결과 보기" : "다음"} <ArrowRight className="size-4" />
              <Kbd className="ef-kbd-hint border-white/20 bg-white/10 text-inherit">Enter</Kbd>
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmExit}
        onOpenChange={setConfirmExit}
        title="세션을 끝낼까요?"
        body="작성 중인 답은 저장되지 않습니다. 이미 제출한 문항의 기록은 저장되어 있습니다."
        confirmLabel="끝내기"
        onConfirm={onExit}
      />
      {guide ? (
        <GuideSheet
          open
          onOpenChange={(o) => !o && setGuide(null)}
          skill={guide.skill}
          tab={guide.tab}
          evaluation={evaluation}
          question={q}
          onPractice={(skill) => {
            setGuide(null);
            if (phase === "feedback") commit();
            onPracticeSkill(skill);
          }}
        />
      ) : null}
    </div>
  );
}

function SessionSummary({ spec, done, onExit }: { spec: SessionSpec; done: Done[]; onExit: () => void }) {
  const app = useApp();
  const reduced = useReduced();
  const answered = done.filter((d) => !d.result.attempt.skipped);
  const avg = answered.length ? Math.round(answered.reduce((s, d) => s + d.result.attempt.overall, 0) / answered.length) : 0;
  const good = done.filter((d) => d.result.grade >= 3).length;
  const created = done.flatMap((d) => d.result.scheduled.filter((s) => s.created));
  const changes = done.flatMap((d) => d.result.masteryChanges);
  const lastChange = new Map(changes.map((c) => [c.skill, c]));
  const upcoming = Object.values(app.state.items)
    .filter((i) => !i.suspended && i.due > app.now())
    .sort((a, b) => a.due - b.due)
    .slice(0, 4);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10">
      <motion.div initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--ef-ok-soft)] text-[var(--ef-ok)]" style={{ animation: reduced ? undefined : "ef-pop .5s ease" }}>
          <CheckCircle2 className="size-7" />
        </div>
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-.03em]">{spec.kind === "review" ? "복습 완료" : "세션 완료"}</h1>
        <p className="ef-ko mt-1 text-[14px] text-[var(--muted)]">{spec.title}</p>
      </motion.div>
      <div className="mt-6 grid grid-cols-3 gap-2">
        <Card className="p-4 text-center">
          <div className="ef-num text-[24px] font-semibold">{done.length}</div>
          <div className="text-[11px] text-[var(--muted)]">문항</div>
        </Card>
        <Card className="p-4 text-center">
          <div className={cn("ef-num text-[24px] font-semibold", TONE_TEXT[scoreTone(avg)])}>{avg}</div>
          <div className="text-[11px] text-[var(--muted)]">평균 점수</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="ef-num text-[24px] font-semibold">{good}/{done.length}</div>
          <div className="text-[11px] text-[var(--muted)]">통과(좋음 이상)</div>
        </Card>
      </div>

      {lastChange.size ? (
        <Card className="mt-3 p-4">
          <Eyebrow>숙련도 변화</Eyebrow>
          <ul className="mt-2 space-y-2">
            {[...lastChange.values()].map((c, i) => (
              <motion.li key={c.skill} initial={reduced ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }} className="flex flex-wrap items-center gap-2 text-[14px]">
                <span className="font-medium">{skillName(c.skill)}</span>
                <StatusChip status={c.from as never} />
                <ArrowRight className="size-3.5 text-[var(--muted)]" />
                <StatusChip status={c.to as never} />
              </motion.li>
            ))}
          </ul>
        </Card>
      ) : null}

      {created.length ? (
        <Card className="mt-3 p-4">
          <Eyebrow>새 복습 항목 {created.length}개</Eyebrow>
          <ul className="mt-2 space-y-1 text-[14px]">
            {created.map((c) => (
              <li key={c.itemId} className="ef-ko">· {c.label}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {upcoming.length ? (
        <Card className="mt-3 p-4">
          <Eyebrow>다음 복습</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-[14px]">
            {upcoming.map((u) => (
              <li key={u.id} className="flex justify-between gap-3">
                <span className="ef-ko truncate">{u.label}</span>
                <span className="ef-num shrink-0 text-[var(--muted)]">{relTimeKo(u.due, app.now())}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-3 divide-y divide-[var(--line)]">
        {done.map((d, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <ScoreRing score={d.result.attempt.overall} size={40} stroke={4} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{d.question.topic}</div>
              <div className="ef-en truncate text-[12px] text-[var(--muted)]">{d.result.attempt.skipped ? "건너뜀" : d.evaluation.answer}</div>
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">{GRADE_LABEL_KO[d.result.grade]}</span>
          </div>
        ))}
      </Card>

      <div className="mt-6 flex gap-2">
        <button onClick={onExit} className="dd-focus h-12 flex-1 rounded-[14px] bg-[var(--foreground)] text-[15px] font-semibold text-[var(--background)]">완료</button>
      </div>
      <p className="ef-ko mt-3 text-center text-[11px] text-[var(--muted)]">{Object.keys(STATUS_LABEL_KO).length ? "숙달은 서로 다른 날, 서로 다른 문장에서 힌트 없이 반복해 맞혀야 인정됩니다." : null}</p>
    </div>
  );
}
