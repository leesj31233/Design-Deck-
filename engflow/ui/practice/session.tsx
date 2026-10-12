"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CheckCircle2, ChevronDown, CornerDownLeft, Eye, Languages, Lightbulb, Loader2, RotateCcw, SkipForward, Trophy, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { evaluateLocal } from "../../core/evaluate";
import { createGrader, gradeBudgetMs, type GradeVia } from "../../core/grader";
import { claudeLatencyQuantiles, recordClaudeLatency } from "../latency";
import { celebrationFor, isSuccess, type Celebration } from "../../core/celebration";
import { Burst, StreakChip } from "../celebrate";
import { speak, stopSpeaking } from "../speech";
import { pickReviewQuestion, type SessionItem } from "../../core/session";
import type { RecordResult } from "../../core/store";
import type { Evaluation, HintLevel, Question } from "../../core/types";
import { STATUS_LABEL_KO, localDayKey } from "../../core/mastery";
import { GRADE_LABEL_KO } from "../../core/scheduler";
import { skillName } from "../../content";
import { AIUnavailableError } from "../../platform/types";
import { useApp } from "../store";
import { Card, ConfirmDialog, Eyebrow, LevelBadge, ScoreRing, StatusChip, TONE_TEXT, cn, relTimeKo, scoreTone, useReduced } from "../kit";
import { ChatThread, MeaningChunks, MyTurn, type SaidLine } from "./parts";
import { situationOf } from "../../core/situations";
import { SITUATION_INFO } from "../../content";
import { FeedbackPanel } from "./feedback";
import { weaknessNote } from "../../core/weakness";
import { GuideSheet, type GuideTab } from "../guide";
import { RoleplayReplay } from "../roleplay";
import { Staircase } from "../ladder";


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
  /** A short-to-long climb: the summary shows the staircase of answers. */
  ladder?: boolean;
  /** A speed round: a live response timer and the response times in the summary. */
  speed?: boolean;
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
  const [phase, setPhase] = React.useState<"answer" | "grading" | "feedback">("answer");
  // The one result shown for this answer. It is set once and never replaced.
  const [evaluation, setEvaluation] = React.useState<Evaluation | null>(null);
  const [gradeNote, setGradeNote] = React.useState<string | null>(null);
  const [gradeInfo, setGradeInfo] = React.useState<{ ms: number; via: GradeVia } | null>(null);
  const [slow, setSlow] = React.useState(false);
  const [committed, setCommitted] = React.useState<RecordResult | null>(null);
  const [practiceRetry, setPracticeRetry] = React.useState(false);
  const [done, setDone] = React.useState<Done[]>([]);
  // Consecutive clean answers, and the learner's own lines per role-play (by step) for the chat.
  const [streak, setStreak] = React.useState(0);
  const [bestStreak, setBestStreak] = React.useState(0);
  const [said, setSaid] = React.useState<Record<string, SaidLine[]>>({});
  const [celebration, setCelebration] = React.useState<Celebration | null>(null);
  const [finished, setFinished] = React.useState(false);
  const [showNatural, setShowNatural] = React.useState(app.state.settings.showNaturalKorean);
  const [showKo, setShowKo] = React.useState(false);
  const [confirmExit, setConfirmExit] = React.useState(false);
  const [guide, setGuide] = React.useState<{ skill: string; tab: GuideTab } | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [nudge, setNudge] = React.useState(false);
  const t0 = React.useRef(app.now());
  const firstKey = React.useRef<number | null>(null);
  // Response time ends at submit: grading and reading the feedback do not count as "slow".
  const submittedAt = React.useRef<number | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const nextRef = React.useRef<HTMLButtonElement>(null);

  const item = queue[idx];
  const q = item ? app.qIndex[item.questionId] : undefined;
  const settings = app.state.settings;
  const aiPossible = app.ai.available && settings.ai !== "off";
  const gradeMode = settings.gradeMode ?? "auto";
  const live = React.useRef({ aiPossible, gradeMode, seen: app.state.seen });
  live.current = { aiPossible, gradeMode, seen: app.state.seen };
  // While grading: how long the bar runs, and whether the wait is because the answer is reworded.
  const [wait, setWait] = React.useState<{ budgetMs: number; reworded: boolean } | null>(null);
  // One grader per session: background grading while typing, one result per submit within the budget.
  const grader = React.useMemo(
    () =>
      createGrader({
        evaluate: (question, text, local, signal) => app.platform.ai.evaluate(question, text, local, "quick", signal),
        aiEnabled: () => live.current.aiPossible,
        budgetMs: (local) => gradeBudgetMs(live.current.gradeMode, local, claudeLatencyQuantiles()),
        onLatency: recordClaudeLatency,
        learned: (question) => live.current.seen[question.id]?.ok,
      }),
    [app.platform.ai],
  );
  // Guards against a grade arriving for a question the learner already left.
  const gradeToken = React.useRef(0);

  // Reset per question.
  React.useEffect(() => {
    setAnswer("");
    setHint(0);
    setPhase("answer");
    setEvaluation(null);
    setGradeNote(null);
    setGradeInfo(null);
    setSlow(false);
    setShowKo(false);
    setCelebration(null);
    stopSpeaking();
    setCommitted(null);
    setPracticeRetry(false);
    t0.current = app.now();
    firstKey.current = null;
    submittedAt.current = null;
    gradeToken.current++;
    grader.reset();
    const t = setTimeout(() => {
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) inputRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, item?.questionId]);

  React.useEffect(() => () => grader.reset(), [grader]);

  // Optional: read the colleague's latest line aloud when a question opens.
  React.useEffect(() => {
    if (!settings.autoSpeak || !q?.dialogue?.length) return;
    const line = [...q.dialogue].reverse().find((t) => t.speaker !== "Minsu");
    if (!line) return;
    const t = setTimeout(() => speak(line.en, { slow: settings.slowSpeech }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id, settings.autoSpeak]);

  // While the learner types: a pause on a fairly complete sentence starts Claude grading in the background,
  // so the grade is usually ready the moment they submit.
  React.useEffect(() => {
    if (phase !== "answer" || !q || !aiPossible) return;
    const text = answer.trim();
    if (!text) return;
    const t = setTimeout(() => grader.prefetch(q, text, hint), /[.?!]$/.test(text) ? 150 : 450);
    return () => clearTimeout(t);
  }, [answer, hint, phase, q, aiPossible, grader]);

  const pulse = (id: string) => {
    setFlash(id);
    setTimeout(() => setFlash(null), 450);
  };

  const show = (ev: Evaluation, info: { ms: number; via: GradeVia }, note: string | null) => {
    // Decided once, from the learner state before this answer is recorded, so it never changes on screen.
    setCelebration(
      q && !practiceRetry
        ? celebrationFor({
            evaluation: ev, question: q, prev: app.state, streak: isSuccess(ev, hint) ? streak + 1 : 0, hint, now: app.now(),
            skillOf: (id) => app.qIndex[id]?.skills[0],
            responseMs: submittedAt.current !== null ? submittedAt.current - t0.current : undefined,
          })
        : null,
    );
    setEvaluation(ev);
    setGradeInfo(info);
    setGradeNote(note);
    setSlow(false);
    setPhase("feedback");
    setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 50);
  };

  /** One grade per answer, within the budget (1 s by default); see core/grader.ts. */
  const submit = () => {
    if (!q || phase !== "answer") return;
    const text = answer.trim();
    if (!text) {
      setNudge(true);
      setTimeout(() => setNudge(false), 1600);
      inputRef.current?.focus();
      return;
    }
    submittedAt.current = app.now();
    const quick = grader.peek(q, text, hint);
    if (quick) {
      show(quick.evaluation, quick, quick.noteKo);
      return;
    }
    const token = ++gradeToken.current;
    const local = grader.local(q, text, hint);
    const budget = gradeBudgetMs(gradeMode, local, claudeLatencyQuantiles());
    setWait({ budgetMs: budget, reworded: local.confidence !== "high" });
    setPhase("grading");
    const slowTimer = budget > 1500 ? setTimeout(() => token === gradeToken.current && setSlow(true), 1500) : null;
    grader.grade(q, text, hint).then((out) => {
      if (slowTimer) clearTimeout(slowTimer);
      if (token !== gradeToken.current) return;
      show(out.evaluation, out, out.noteKo);
    });
  };

  const commit = (opts: { skipped?: boolean } = {}): RecordResult | null => {
    if (!q || !item || committed || practiceRetry) return committed;
    const ev = opts.skipped ? evaluateLocal(q, "") : evaluation;
    if (!ev) return null;
    const responseMs = (submittedAt.current ?? app.now()) - t0.current;
    const result = app.record({
      question: q,
      evaluation: ev,
      hint,
      responseMs,
      firstKeyMs: firstKey.current ? firstKey.current - t0.current : null,
      context: item.kind === "review" ? "review" : "lesson",
      reviewItemId: item.reviewItemId,
      skipped: opts.skipped,
      gradeMs: opts.skipped ? undefined : gradeInfo?.ms,
    });
    setCommitted(result);
    setDone((d) => [...d, { item, question: q, result, evaluation: ev }]);
    const ok = !opts.skipped && isSuccess(ev, hint);
    setStreak((n) => {
      const v = ok ? n + 1 : 0;
      setBestStreak((b) => Math.max(b, v));
      return v;
    });
    if (q.scenario && !opts.skipped) {
      const sc = q.scenario;
      setSaid((m) => {
        const lines = [...(m[sc.id] ?? [])];
        const text = ev.exact ? ev.answer : ev.corrected;
        lines[sc.step - 1] = { text, fixed: text.trim() !== ev.answer.trim() };
        return { ...m, [sc.id]: lines };
      });
    }
    // Significant error → immediate retry with a different sentence for the same grammar.
    // A ladder keeps its climb: a missed step goes to review later instead of an immediate retry.
    if (result.grade === 1 && !item.retry && !spec.ladder && !spec.speed) {
      const target = result.scheduled[0] ? result.state.items[result.scheduled[0].itemId] : undefined;
      const rq = target ? pickReviewQuestion({ ...target, recentQuestionIds: [...target.recentQuestionIds, q.id] }, app.questions, "mixed") : null;
      if (target && rq && rq.id !== q.id && !queue.some((x, k) => k > idx && x.questionId === rq.id)) {
        // Never break into a role-play: the retry comes after the conversation ends.
        const at = q.scenario ? queue.length : Math.min(queue.length, idx + 3);
        setQueue((qq) => [...qq.slice(0, at), { kind: "review", questionId: rq.id, reviewItemId: target.id, reasonKo: "즉시 재시도 · 같은 문법, 다른 문장", retry: true }, ...qq.slice(at)]);
      }
    }
    return result;
  };

  const next = () => {
    if (phase === "grading") return;
    if (phase === "feedback") commit();
    if (idx + 1 >= queue.length) setFinished(true);
    else setIdx((i) => i + 1);
  };

  const skip = () => {
    if (phase === "grading") return;
    commit({ skipped: true });
    if (idx + 1 >= queue.length) setFinished(true);
    else setIdx((i) => i + 1);
  };

  const retry = () => {
    if (phase !== "feedback") return;
    commit();
    setPracticeRetry(true);
    setAnswer("");
    setPhase("answer");
    setEvaluation(null);
    setGradeNote(null);
    setGradeInfo(null);
    grader.reset();
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
    if ((phase === "answer" && answer.trim()) || phase === "grading") setConfirmExit(true);
    else {
      if (phase === "feedback") commit();
      onExit();
    }
  };

  if (finished) return <SessionSummary spec={spec} done={done} bestStreak={bestStreak} onExit={onExit} />;
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
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-semibold">{spec.title}</span>
                <StreakChip n={streak} />
                {spec.speed && q ? <SpeedTimer key={`${idx}-${q.id}`} stoppedAt={phase === "answer" ? null : submittedAt.current} now={app.now} /> : null}
              </span>
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
            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 font-medium text-[var(--ef-ink-2)]">{isSentence ? "문장 말하기" : "짧은 표현"}</span>
            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--ef-ink-2)]">
              {SITUATION_INFO[situationOf(q)].ko}
              {situationOf(q) === "technical" ? ` · ${CATEGORY_LABEL[q.category]}` : ""}
            </span>
            <LevelBadge level={q.level} />
            <span className="ef-num rounded-full bg-[var(--ef-track)] px-2 py-0.5 font-semibold text-[var(--ef-ink-2)]" aria-label={`난이도 ${q.difficulty}/10`}>
              난이도 {q.difficulty}
            </span>
            {item.kind === "review" ? <span className="rounded-full bg-[var(--ef-warn-soft)] px-2 py-0.5 font-semibold text-[var(--ef-warn)]">{item.reasonKo}</span> : <span className="text-[var(--muted)]">{item.reasonKo}</span>}
          </div>

          <h1 className="mt-3 text-[22px] font-semibold tracking-[-.03em] md:text-[26px]" style={{ textWrap: "balance" }}>
            {q.topic}
            <span className="ml-2 align-middle text-[14px] font-medium tracking-normal text-[var(--muted)]">{q.topicKo}</span>
          </h1>
          {q.contextKo ? <p className="ef-ko mt-1.5 max-w-[62ch] text-[14px] text-[var(--ef-ink-2)]">{q.contextKo}</p> : null}

          {/* Conversation so far, then the learner's turn */}
          {q.dialogue?.length ? (
            <div className="mt-5">
              <ChatThread turns={q.dialogue} showKo={showKo} slow={settings.slowSpeech} mine={q.scenario ? said[q.scenario.id]?.slice(0, q.scenario.step - 1) : undefined} />
              <button onClick={() => setShowKo((v) => !v)} className="dd-focus ml-10 mt-1.5 inline-flex items-center gap-1 rounded-lg text-[12px] text-[var(--muted)]" aria-expanded={showKo}>
                <Languages className="size-3.5" /> 번역 {showKo ? "숨기기" : "보기"}
              </button>
            </div>
          ) : null}

          {/* Prompt */}
          <div className="mt-5">
            {q.dialogue?.length ? (
              <MyTurn>
                {isSentence ? (
                  <>
                    <MeaningChunks segments={q.segments} size="md" />
                    <button onClick={() => setShowNatural((v) => !v)} className="dd-focus mt-2.5 inline-flex items-center gap-1 rounded-lg text-[12px] text-[var(--muted)]" aria-expanded={showNatural}>
                      <ChevronDown className={cn("size-3.5 transition", showNatural && "rotate-180")} /> 자연스러운 한국어 {showNatural ? "숨기기" : "보기"}
                    </button>
                    {showNatural ? <p className="ef-ko mt-1 text-[14px] text-[var(--ef-ink-2)]">{q.promptKo}</p> : null}
                  </>
                ) : (
                  <>
                    <p className="ef-ko text-[19px] font-semibold leading-snug tracking-[-.02em] md:text-[22px]">{q.promptKo}</p>
                    {q.segments.length > 1 ? (
                      <div className="mt-2.5">
                        <MeaningChunks segments={q.segments} size="md" />
                      </div>
                    ) : null}
                  </>
                )}
              </MyTurn>
            ) : isSentence ? (
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
            {phase === "answer" || phase === "grading" ? (
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
                      readOnly={phase === "grading"}
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
                      readOnly={phase === "grading"}
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
                  <button
                    type="submit"
                    disabled={phase === "grading"}
                    className={cn("dd-focus ml-auto inline-flex h-11 min-w-[92px] items-center justify-center gap-2 rounded-xl bg-[var(--foreground)] px-5 text-[15px] font-semibold text-[var(--background)] transition active:scale-[.98] disabled:opacity-80", flash === "submit" && "opacity-80")}
                  >
                    {phase === "grading" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> 채점 중
                      </>
                    ) : (
                      <>
                        제출 <CornerDownLeft className="ef-kbd-hint size-4 opacity-70" />
                      </>
                    )}
                  </button>
                </div>
                {phase === "grading" && wait ? (
                  <div className="mt-2" aria-live="polite">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--ef-track)]">
                      <div className="ef-grade-bar h-full rounded-full bg-[var(--accent)]" style={{ animationDuration: `${wait.budgetMs}ms` }} />
                    </div>
                    {wait.reworded && wait.budgetMs > 1500 ? (
                      <p className="ef-ko mt-1.5 text-[12px] text-[var(--muted)]">표현이 기준 답안과 달라 Claude가 문법을 확인하고 있습니다.</p>
                    ) : null}
                    {slow ? (
                      <button type="button" onClick={() => grader.skip()} className="dd-focus mt-1 text-[12px] text-[var(--muted)] underline underline-offset-4">
                        기다리지 않고 바로 보기 (규칙 기반 — 놓친 오류가 있을 수 있음)
                      </button>
                    ) : null}
                  </div>
                ) : null}
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
                question={q}
                evaluation={evaluation}
                note={gradeNote}
                celebration={celebration}
                effects={settings.celebrate !== false}
                sound={!!settings.sound}
                slowSpeech={settings.slowSpeech}
                gradeMs={gradeInfo?.ms ?? null}
                weakNote={committed ? null : weaknessNote(app.state, evaluation, q)}
                compact={!isSentence}
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

/** Seconds since the question appeared; stops at submit. Green under 5 s, amber under 10 s. */
function SpeedTimer({ stoppedAt, now }: { stoppedAt: number | null; now: () => number }) {
  // Keyed per question, so mounting is when the question appeared.
  const [startedAt] = React.useState(() => now());
  const [t, setT] = React.useState(() => now());
  React.useEffect(() => {
    if (stoppedAt !== null) return;
    const id = setInterval(() => setT(now()), 100);
    return () => clearInterval(id);
  }, [stoppedAt, now]);
  const s = Math.max(0, ((stoppedAt ?? t) - startedAt) / 1000);
  return (
    <span
      className={cn(
        "ef-num inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        s < 5 ? "bg-[var(--ef-ok-soft)] text-[var(--ef-ok)]" : s < 10 ? "bg-[var(--ef-warn-soft)] text-[var(--ef-warn)]" : "bg-[var(--ef-bad-soft)] text-[var(--ef-bad)]",
      )}
      aria-label={`응답 시간 ${s.toFixed(1)}초`}
    >
      ⏱ {s.toFixed(1)}초
    </span>
  );
}

function SessionSummary({ spec, done, bestStreak, onExit }: { spec: SessionSpec; done: Done[]; bestStreak: number; onExit: () => void }) {
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
  const perfects = answered.filter((d) => d.result.attempt.overall === 100).length;
  // A role-play session ends with the whole conversation; finishing every turn cleanly counts as a trophy.
  const roleplay = done.length > 0 && done.every((d) => d.question.scenario) ? done.filter((d) => !d.result.attempt.skipped) : null;
  const roleplayClean = !!roleplay && roleplay.length > 0 && new Set(roleplay.map((d) => d.question.scenario!.step)).size === roleplay[0].question.scenario!.total && roleplay.every((d) => d.result.attempt.overall >= 85 || done.some((x) => x.question.id === d.question.id && x !== d && x.result.attempt.overall >= 85));
  // Today's goal reached during this session (counted from the daily log after it).
  const todayAnswered = app.state.daily[localDayKey(app.now())]?.answered ?? 0;
  const goalNow = todayAnswered >= app.state.settings.dailyTarget && todayAnswered - done.length < app.state.settings.dailyTarget;
  // A short-to-long climb: the first answer per question, in climbing order.
  const ladder = spec.ladder ? spec.items.map((it) => done.find((d) => d.question.id === it.questionId && !d.item.retry)) : null;
  const ladderTop = !!ladder && ladder.every((d) => d && !d.result.attempt.skipped && d.result.attempt.overall >= 85);
  // A speed round: how fast the answers came (time from the question to submit).
  const speedTimes = spec.speed ? answered.map((d) => d.result.attempt.responseMs / 1000) : [];
  const speedAvg = speedTimes.length ? speedTimes.reduce((a, b) => a + b, 0) / speedTimes.length : 0;
  const speedTop = spec.speed && speedTimes.length >= 5 && speedAvg <= 6 && good >= Math.ceil(done.length * 0.7);
  // A great session earns a trophy and confetti: every answer clean, or an average of 90+.
  const trophy = (answered.length >= 3 && (good === done.length || avg >= 90)) || roleplayClean || ladderTop || speedTop;
  // Not a single miss (or three 100s and more): fireworks instead of confetti.
  const allClear = answered.length >= 3 && good === done.length;
  const [party, setParty] = React.useState(trophy && app.state.settings.celebrate !== false);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10">
      {party ? <Burst kind={allClear || perfects >= 3 ? "fireworks" : "confetti"} shells={6} onDone={() => setParty(false)} /> : null}
      <motion.div initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div
          className={cn("mx-auto grid size-14 place-items-center rounded-full", trophy ? "bg-[#f2a516]/15 text-[#c27c00] dark:text-[#ffbf47]" : "bg-[var(--ef-ok-soft)] text-[var(--ef-ok)]")}
          style={{ animation: reduced ? undefined : "ef-pop .5s ease" }}
        >
          {trophy ? <Trophy className="size-7" /> : <CheckCircle2 className="size-7" />}
        </div>
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-.03em]">{roleplay ? (roleplayClean ? "대화 완주!" : "대화 끝") : ladder ? (ladderTop ? "꼭대기까지 올랐어요!" : "계단 오르기 끝") : spec.speed ? (speedTop ? "순발력 만점!" : "순발력 훈련 끝") : allClear ? "한 문제도 놓치지 않았어요!" : trophy ? "멋진 세션이었어요!" : spec.kind === "review" ? "복습 완료" : "세션 완료"}</h1>
        <p className="ef-ko mt-1 text-[14px] text-[var(--muted)]">{spec.title}</p>
        {perfects || bestStreak >= 3 || goalNow ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-[12px]">
            {goalNow ? <span className="rounded-full bg-[var(--ef-ok-soft)] px-2.5 py-1 font-semibold text-[var(--ef-ok)]">오늘 목표 달성 · {todayAnswered}문항</span> : null}
            {perfects ? <span className="rounded-full bg-[var(--ef-accent-soft)] px-2.5 py-1 font-semibold text-[var(--ef-accent-ink)]">100점 {perfects}개</span> : null}
            {bestStreak >= 3 ? <span className="rounded-full bg-[#ff9f0a]/15 px-2.5 py-1 font-semibold text-[#c25e00] dark:text-[#ffb340]">최고 {bestStreak}연속 정답</span> : null}
          </div>
        ) : null}
      </motion.div>
      {spec.speed && speedTimes.length ? (
        <Card className="mt-6 p-4">
          <Eyebrow>순발력</Eyebrow>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className={cn("ef-num text-[22px] font-semibold", speedAvg < 5 ? "text-[var(--ef-ok)]" : speedAvg < 10 ? "text-[var(--ef-warn)]" : "text-[var(--ef-bad)]")}>{speedAvg.toFixed(1)}초</div>
              <div className="text-[11px] text-[var(--muted)]">평균 응답</div>
            </div>
            <div>
              <div className="ef-num text-[22px] font-semibold">{Math.min(...speedTimes).toFixed(1)}초</div>
              <div className="text-[11px] text-[var(--muted)]">가장 빠른 대답</div>
            </div>
            <div>
              <div className="ef-num text-[22px] font-semibold">{speedTimes.filter((x) => x < 5).length}/{speedTimes.length}</div>
              <div className="text-[11px] text-[var(--muted)]">5초 안에</div>
            </div>
          </div>
          <p className="ef-ko mt-3 text-[13px] text-[var(--muted)]">
            {good < Math.ceil(done.length / 2)
              ? "빠르게 대답했지만 틀린 표현이 많아요. 피드백의 자연스러운 표현을 소리 내 읽어 보고 다시 해 보세요."
              : speedAvg < 5
                ? "실제 대화처럼 바로 나왔어요. 이 속도를 유지하세요."
                : speedAvg < 10
                  ? "조금만 더 빨라지면 대화가 자연스러워집니다. 같은 표현을 한 번 더 해 보세요."
                  : "생각하는 시간이 길어요. 짧은 대답은 통째로 외워 두면 바로 나옵니다."}
          </p>
        </Card>
      ) : null}
      {ladder ? (
        <Card className="mt-6 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <Eyebrow>짧은 말 → 긴 말</Eyebrow>
            <span className="ef-num text-[12px] text-[var(--muted)]">
              {ladder.filter((d) => d && d.result.attempt.overall >= 85).length}/{ladder.length}계단 통과
            </span>
          </div>
          <Staircase className="mt-5" steps={ladder.map((d, i) => d?.question.difficulty ?? i + 1)} scores={ladder.map((d) => (d && !d.result.attempt.skipped ? d.result.attempt.overall : undefined))} />
          <p className="ef-ko mt-3 text-[13px] text-[var(--muted)]">
            {(() => {
              const firstMiss = ladder.findIndex((d) => !d || d.result.attempt.overall < 85);
              if (firstMiss < 0) return "한마디부터 긴 설명까지 모두 자연스럽게 말했어요. 다음엔 난이도를 한 단계 올려 보세요.";
              const dd = ladder[firstMiss]?.question.difficulty;
              return `난이도 ${dd ?? firstMiss + 1} 계단에서 막혔어요. 그 길이의 문장을 몇 번 더 연습하면 다음 계단이 쉬워집니다.`;
            })()}
          </p>
        </Card>
      ) : null}
      {roleplay?.length ? (
        <div className="mt-6">
          <RoleplayReplay turns={roleplay.map((d) => ({ question: d.question, evaluation: d.evaluation }))} slow={app.state.settings.slowSpeech} />
        </div>
      ) : null}
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
