"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Loader2, MessageCircle, NotebookPen, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { buildExpressionQuiz, collectExpressions, practiceQuestionsFor, type ExpressionEntry, type QuizItem } from "../core/expressions";
import { mulberry32 } from "../core/session";
import { situationOf } from "../core/situations";
import { GUIDE, SITUATION_INFO, SKILLS, SKILL_GROUPS, skillName } from "../content";
import { EXPRESSION_TITLES } from "../content/expressions";
import { AIUnavailableError } from "../platform/types";
import { useApp } from "./store";
import { useNav } from "./app";
import { Button, Card, EmptyState, Eyebrow, IconButton, NumberTicker, Pressable, RevealGroup, RevealItem, StatusChip, cn, relTimeKo, useReduced } from "./kit";
import { Anatomy, RuleList } from "./guide";
import { ChatThread, DiffLine } from "./practice/parts";

/* ───────────── Collected expressions (notebook + Today) ───────────── */

function StrengthBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.round((value / 3) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ef-track)]" aria-hidden>
      <div className="h-full rounded-full bg-[var(--ef-warn-fill)]" style={{ width: `${Math.max(6, pct)}%` }} />
    </div>
  );
}

export function ExpressionCard({ e, onOpen }: { e: ExpressionEntry; onOpen: () => void }) {
  const app = useApp();
  const last = e.examples[0];
  return (
    <Pressable type="button" onClick={onOpen} className="w-full rounded-[var(--radius)]" aria-label={`${e.titleEn} 학습하기`}>
      <Card className="h-full p-4 transition hover:border-[var(--foreground)]/25">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="ef-en text-[17px] font-semibold leading-snug">{e.titleEn}</div>
            <div className="ef-ko mt-0.5 text-[13px] text-[var(--ef-ink-2)]">{e.coreKo}</div>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-[var(--muted)]" />
        </div>
        {last ? (
          <div className="mt-2.5 rounded-xl bg-[var(--background)] px-3 py-2 text-[13px]">
            <DiffLine from={last.wrong} to={last.right} />
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <StrengthBar value={e.strength} />
          <span className="ef-num shrink-0 text-[11px] text-[var(--muted)]">
            {e.count}회{e.lastAt ? ` · ${relTimeKo(e.lastAt, app.now())}` : ""}
            {e.imported ? " · 가져온 기록" : ""}
          </span>
        </div>
      </Card>
    </Pressable>
  );
}

/** The learner's most urgent expressions; the notebook shows all, Today shows a few. */
export function ExpressionCollection({ limit, title = "내가 자주 틀리는 표현" }: { limit?: number; title?: string }) {
  const app = useApp();
  const nav = useNav();
  const list = collectExpressions(app.state, app.now());
  const shown = limit ? list.slice(0, limit) : list;
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>{title}</Eyebrow>
        {limit && list.length > limit ? (
          <Button variant="ghost" size="sm" onClick={() => nav.go("mistakes")} className="-mr-2 h-7 gap-0.5 px-2 text-[12px] font-normal text-[var(--muted)]">
            전체 {list.length}개 보기 <ChevronRight className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {shown.length ? (
        <RevealGroup className="mt-2 grid gap-2.5 md:grid-cols-2">
          {shown.map((e) => (
            <RevealItem key={e.skill}>
              <ExpressionCard e={e} onOpen={() => nav.openExpression(e.skill)} />
            </RevealItem>
          ))}
        </RevealGroup>
      ) : (
        <EmptyState
          className="ef-ko mt-2 min-h-0 py-7"
          icon={<NotebookPen className="size-5" />}
          title="아직 모은 표현이 없습니다"
          description="문법 실수가 쌓이면 표현별로 모아 여기에 보여 줍니다. 철자와 현장 용어 차이는 모으지 않습니다."
        />
      )}
    </section>
  );
}

/** Every grammar point as an expression, to open any part even without mistakes. */
export function ExpressionIndex() {
  const nav = useNav();
  const app = useApp();
  return (
    <section aria-label="표현 둘러보기">
      <Eyebrow>모든 표현 둘러보기</Eyebrow>
      <div className="mt-2 space-y-3">
        {Object.entries(SKILL_GROUPS).map(([g, info]) => (
          <div key={g}>
            <div className="text-[12px] font-semibold text-[var(--muted)]">{info.ko}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SKILLS.filter((s) => s.group === g).map((s) => {
                const st = app.state.skills[s.id]?.status;
                return (
                  <Button key={s.id} variant="secondary" size="sm" onClick={() => nav.openExpression(s.id)} className="h-9 gap-1.5 rounded-full px-3 text-[13px] font-normal">
                    <span className="ef-en font-medium">{(EXPRESSION_TITLES[s.id]?.en ?? s.nameEn).split(" / ")[0]}</span>
                    {st === "mastered" ? <Check className="size-3.5 text-[var(--ef-ok)]" /> : null}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────── Study flow for one expression ───────────── */

type Step = "mine" | "rules" | "quiz" | "speak";
const STEPS: { id: Step; label: string }[] = [
  { id: "mine", label: "내 실수" },
  { id: "rules", label: "규칙·비교" },
  { id: "quiz", label: "확인 퀴즈" },
  { id: "speak", label: "말해 보기" },
];

export function ExpressionStudy({ skill, onExit }: { skill: string; onExit: () => void }) {
  const app = useApp();
  const nav = useNav();
  const reduced = useReduced();
  const now = app.now();
  const entry = React.useMemo(() => collectExpressions(app.state, now).find((e) => e.skill === skill) ?? null, [app.state, now, skill]);
  const title = EXPRESSION_TITLES[skill] ?? { en: skillName(skill), ko: skillName(skill) };
  const g = GUIDE[skill];
  const [step, setStep] = React.useState<Step>("mine");
  const [simple, setSimple] = React.useState(false);
  const quiz = React.useMemo(() => buildExpressionQuiz(skill, entry, app.questions, mulberry32(skill.length * 7919 + Math.floor(now / 86_400_000))), [skill, entry, app.questions, now]);
  const practice = React.useMemo(() => practiceQuestionsFor(skill, app.questions, app.state, now, 6), [skill, app.questions, app.state, now]);
  const [gen, setGen] = React.useState(false);
  const idx = STEPS.findIndex((s) => s.id === step);

  React.useEffect(() => window.scrollTo({ top: 0 }), [step]);

  const startSpeaking = () => {
    if (!practice.length) {
      nav.practiceSkill(skill);
      return;
    }
    nav.startSession({
      id: `x-${skill}-${now}`,
      title: `표현 연습 · ${title.en.split(" / ")[0]}`,
      kind: "lesson",
      items: practice.map((q) => ({ kind: "new" as const, questionId: q.id, reasonKo: `표현 연습 · ${skillName(skill)}` })),
    });
  };

  const generate = async () => {
    const example = practice[0];
    setGen(true);
    try {
      const q = await app.platform.ai.generate({
        category: example?.category ?? "meeting",
        skill,
        level: app.state.profile.startLevel,
        mode: "sentence",
        situation: example ? situationOf(example) : "discussion",
        difficulty: example?.difficulty,
        avoidReferences: app.questions.filter((x) => x.skills.includes(skill)).map((x) => x.reference),
        weakness: entry?.examples.length ? { labelKo: `${skillName(skill)} (${title.en})`, examples: entry.examples.slice(0, 4).map((x) => ({ wrong: x.wrong, right: x.right })) } : undefined,
      });
      app.addGenerated(q);
      toast.success("내 실수를 바탕으로 새 대화 문제를 만들었습니다(자동 검증 통과).");
      nav.startSession({
        id: `xg-${q.id}`,
        title: `표현 연습 · ${title.en.split(" / ")[0]}`,
        kind: "lesson",
        items: [{ kind: "new", questionId: q.id, reasonKo: "내 실수로 만든 새 문제 · Claude" }, ...practice.slice(0, 3).map((x) => ({ kind: "new" as const, questionId: x.id, reasonKo: `표현 연습 · ${skillName(skill)}` }))],
      });
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : "문제를 만들지 못했습니다."} 검수된 문제로 연습하세요.`);
      if (!(e instanceof AIUnavailableError)) console.warn(e);
    } finally {
      setGen(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-[var(--line)] bg-[var(--background)]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <IconButton label="표현 노트로 돌아가기" variant="ghost" onClick={onExit} className="-ml-2 text-[var(--muted)]">
            <ArrowLeft className="size-5" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold">표현 학습 · {skillName(skill)}</div>
            <div className="mt-1.5 flex gap-[3px]" role="tablist" aria-label="학습 단계">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={step === s.id}
                  onClick={() => setStep(s.id)}
                  className={cn("h-1 flex-1 rounded-full transition-colors", i <= idx ? "bg-[var(--accent)]" : "bg-[var(--ef-track)]")}
                  aria-label={s.label}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-5 md:pt-8">
        <h1 className="ef-en text-[24px] font-semibold leading-tight tracking-[-.03em] md:text-[28px]">{title.en}</h1>
        <p className="ef-ko mt-1 text-[15px] text-[var(--ef-ink-2)]">{title.ko}</p>
        <div className="ef-scroll-x -mx-1 mt-4 px-1">
          <div className="flex w-max gap-1.5">
            {STEPS.map((s, i) => (
              <Button
                key={s.id}
                variant={step === s.id ? "primary" : "secondary"}
                size="sm"
                onClick={() => setStep(s.id)}
                aria-pressed={step === s.id}
                className={cn("h-9 whitespace-nowrap rounded-full px-3.5 text-[13px] shadow-none", step !== s.id && "text-[var(--ef-ink-2)]")}
              >
                {i + 1}. {s.label}
              </Button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.1 : 0.2 }}
            className="mt-5 space-y-3"
          >
            {step === "mine" ? (
              <>
                <Card className="p-4 md:p-5">
                  <Eyebrow>왜 헷갈릴까</Eyebrow>
                  <p className="ef-ko mt-2 text-[15px]">{g?.summaryKo}</p>
                  {g ? (
                    <Button variant="ghost" size="sm" onClick={() => setSimple((v) => !v)} className="-ml-2 mt-1.5 h-7 px-2 text-[12px] font-normal text-[var(--muted)] underline underline-offset-4" aria-expanded={simple}>
                      {simple ? "짧게 보기" : "더 쉽게 설명"}
                    </Button>
                  ) : null}
                  {simple && g ? <p className="ef-ko mt-2 text-[14px] text-[var(--ef-ink-2)]">{g.simpleKo}</p> : null}
                </Card>
                <Card className="p-4 md:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <Eyebrow>내가 틀린 문장</Eyebrow>
                    {entry ? <StatusChip status={entry.status} /> : null}
                  </div>
                  {entry?.examples.length ? (
                    <ul className="mt-2 space-y-2">
                      {entry.examples.map((x, i) => (
                        <li key={i} className="rounded-xl border border-[var(--line)] p-3">
                          <DiffLine from={x.wrong} to={x.right} />
                          <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-[var(--muted)]">
                            {x.fix ? <span className="ef-en">{x.fix}</span> : null}
                            <span>{relTimeKo(x.at, now)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ef-ko mt-2 text-[14px] text-[var(--muted)]">아직 이 표현에서 틀린 기록이 없습니다. 규칙과 퀴즈로 먼저 익혀 두세요.</p>
                  )}
                </Card>
              </>
            ) : null}

            {step === "rules" && g ? (
              <>
                <Card className="p-4 md:p-5">
                  <Eyebrow>규칙</Eyebrow>
                  <div className="mt-2">
                    <RuleList g={g} />
                  </div>
                </Card>
                {g.anatomy[0] ? (
                  <Card className="p-4 md:p-5">
                    <Eyebrow>문장 구조</Eyebrow>
                    <div className="mt-2 space-y-2">
                      {g.anatomy.map((a) => (
                        <Anatomy key={a.sentence} entry={a} />
                      ))}
                    </div>
                  </Card>
                ) : null}
                <Card className="p-4 md:p-5">
                  <Eyebrow>비슷한 표현 비교</Eyebrow>
                  <ul className="mt-2 space-y-2">
                    {g.compare.map((c, i) => (
                      <li key={i} className="rounded-xl border border-[var(--line)] p-3">
                        <div className="ef-en grid gap-1 text-[15px] sm:grid-cols-2">
                          <span className="font-medium">{c.a}</span>
                          <span className="font-medium text-[var(--ef-ink-2)]">{c.b}</span>
                        </div>
                        <p className="ef-ko mt-1.5 text-[13px] text-[var(--ef-ink-2)]">{c.ko}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            ) : null}

            {step === "quiz" ? <Quiz items={quiz} onDone={() => setStep("speak")} /> : null}

            {step === "speak" ? (
              <>
                <Card className="p-4 md:p-5">
                  <Eyebrow>대화에서 말해 보기</Eyebrow>
                  <p className="ef-ko mt-1.5 text-[14px] text-[var(--ef-ink-2)]">이 표현이 들어간 대화 문제 {practice.length}개를 이어서 풉니다. 채점은 제출할 때 한 번만 합니다.</p>
                  <ul className="mt-3 divide-y divide-[var(--line)]">
                    {practice.map((q) => (
                      <li key={q.id} className="flex items-center gap-3 py-2.5">
                        <MessageCircle className="size-4 shrink-0 text-[var(--muted)]" />
                        <div className="min-w-0 flex-1">
                          <div className="ef-ko truncate text-[14px]">{q.promptKo}</div>
                          <div className="text-[11px] text-[var(--muted)]">
                            {SITUATION_INFO[situationOf(q)].ko} · 난이도 {q.difficulty}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" onClick={startSpeaking} className="h-11 gap-1.5 text-[14px] font-semibold">
                      대화 연습 시작 <ArrowRight className="size-4" />
                    </Button>
                    {app.ai.available ? (
                      <Button variant="secondary" onClick={generate} disabled={gen} className="h-11 gap-1.5 text-[14px]">
                        {gen ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} 내 실수로 새 문제
                      </Button>
                    ) : null}
                    <Button variant="secondary" onClick={() => nav.openGuide(skill)} className="h-11 gap-1.5 text-[14px]">
                      <BookOpen className="size-4" /> 예문 더 보기
                    </Button>
                  </div>
                </Card>
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </main>

      {step !== "quiz" ? (
        <div className="ef-safe-bottom sticky bottom-0 z-20 border-t border-[var(--line)] bg-[var(--background)]/90 pt-2 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4">
            <Button variant="secondary" size="lg" onClick={() => (idx > 0 ? setStep(STEPS[idx - 1].id) : onExit())} className="gap-1.5 px-4 text-[14px]">
              <ArrowLeft className="size-4" /> {idx > 0 ? "이전" : "목록"}
            </Button>
            {idx < STEPS.length - 1 ? (
              <Button variant="primary" size="lg" onClick={() => setStep(STEPS[idx + 1].id)} className="ml-auto flex-1 text-[15px] font-semibold sm:min-w-44 sm:flex-none">
                다음: {STEPS[idx + 1].label} <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={startSpeaking} className="ml-auto flex-1 text-[15px] font-semibold sm:min-w-44 sm:flex-none">
                대화 연습 시작 <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Quiz({ items, onDone }: { items: QuizItem[]; onDone: () => void }) {
  const [i, setI] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [correct, setCorrect] = React.useState(0);
  const reduced = useReduced();
  if (!items.length) {
    return (
      <Card className="p-4 md:p-5">
        <p className="ef-ko text-[14px] text-[var(--muted)]">이 표현은 아직 퀴즈 문항이 없습니다. 바로 말해 보기로 넘어가세요.</p>
        <Button variant="primary" onClick={onDone} className="mt-3 h-11 gap-1.5 text-[14px] font-semibold">
          말해 보기 <ArrowRight className="size-4" />
        </Button>
      </Card>
    );
  }
  if (i >= items.length) {
    return (
      <Card className="p-5 text-center">
        <div className="ef-num text-[32px] font-semibold">
          <NumberTicker value={correct} />/{items.length}
        </div>
        <p className="ef-ko mt-1 text-[14px] text-[var(--ef-ink-2)]">{correct === items.length ? "모두 맞혔습니다. 이제 대화에서 직접 말해 보세요." : "틀린 문장은 한 번 더 읽어 보고, 대화에서 직접 말해 보세요."}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setI(0);
              setPicked(null);
              setCorrect(0);
            }}
            className="h-11 text-[14px]"
          >
            다시 풀기
          </Button>
          <Button variant="primary" onClick={onDone} className="h-11 gap-1.5 text-[14px] font-semibold">
            말해 보기 <ArrowRight className="size-4" />
          </Button>
        </div>
      </Card>
    );
  }
  const q = items[i];
  const answered = picked !== null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
        <span>어느 쪽이 자연스러울까요?</span>
        <span className="ef-num">
          {i + 1} / {items.length}
        </span>
      </div>
      {q.dialogue ? <ChatThread turns={[q.dialogue]} showKo={answered} /> : null}
      {q.promptKo ? <p className="ef-ko text-[15px] font-medium">하고 싶은 말: {q.promptKo}</p> : q.source === "mine" ? <p className="ef-ko text-[13px] text-[var(--muted)]">내가 예전에 쓴 문장입니다.</p> : null}
      <div className="grid gap-2" role="radiogroup" aria-label="보기">
        {q.options.map((o, k) => {
          const isAnswer = k === q.answer;
          const state = !answered ? "idle" : isAnswer ? "right" : k === picked ? "wrong" : "idle";
          return (
            <Pressable
              key={k}
              type="button"
              lift={1}
              role="radio"
              aria-checked={picked === k}
              disabled={answered}
              onClick={() => {
                setPicked(k);
                if (isAnswer) setCorrect((c) => c + 1);
              }}
              className={cn(
                "flex w-full items-start gap-2 rounded-2xl border p-3.5 transition-colors",
                state === "right" ? "border-[var(--ef-ok)]/50 bg-[var(--ef-ok-soft)]" : state === "wrong" ? "border-[var(--ef-bad)]/50 bg-[var(--ef-bad-soft)]" : "border-[var(--line)] hover:bg-black/[.03] dark:hover:bg-white/[.05]",
              )}
            >
              <span className="ef-mono mt-0.5 text-[12px] font-semibold text-[var(--muted)]">{String.fromCharCode(65 + k)}</span>
              <span className="ef-en flex-1 text-[16px]">{o}</span>
              {state === "right" ? <Check className="size-4 shrink-0 text-[var(--ef-ok)]" /> : state === "wrong" ? <X className="size-4 shrink-0 text-[var(--ef-bad)]" /> : null}
            </Pressable>
          );
        })}
      </div>
      {answered ? (
        <motion.div initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-4">
            <div className={cn("text-[14px] font-semibold", picked === q.answer ? "text-[var(--ef-ok)]" : "text-[var(--ef-bad)]")}>{picked === q.answer ? "맞았습니다" : "다시 보세요"}</div>
            <p className="ef-ko mt-1 text-[14px] text-[var(--ef-ink-2)]">{q.explainKo}</p>
          </Card>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setI((x) => x + 1);
              setPicked(null);
            }}
            className="mt-3 w-full text-[15px] font-semibold"
          >
            {i + 1 < items.length ? "다음 문항" : "결과 보기"} <ArrowRight className="size-4" />
          </Button>
        </motion.div>
      ) : null}
    </div>
  );
}
