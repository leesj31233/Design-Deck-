"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ClipboardCheck, ExternalLink, Info, MessageCircle, MicOff, RotateCcw, Timer, X } from "lucide-react";
import { DIAGNOSTIC_POOL, skillName } from "../../content";
import type { DiagnosticItem } from "../../content/types";
import { CEFR_DESCRIPTORS, TOEIC_SPEAKING, toeicContext } from "../../content/cefr";
import {
  PART_NAMES_KO, creditFromEvaluation, creditFromOrder, currentPart, finishDiagnostic, nextDiagnosticItem, recordDiagnosticResponse,
  startDiagnostic, totalItems, type DiagnosticLength, type DiagnosticSession,
} from "../../core/diagnostic";
import { evaluateLocal } from "../../core/evaluate";
import { tokenize, words } from "../../core/text";
import { CEFR_ORDER, type Cefr, type DiagnosticResultRecord, type DiagnosticSheet } from "../../core/types";
import { useApp } from "../store";
import { useNav } from "../app";
import { useStartLesson } from "./today";
import { Badge, Button, Card, ConfirmDialog, Eyebrow, IconButton, Kbd, LevelBadge, Meter, Pressable, Progress, RevealGroup, RevealItem, SegmentedControl, Spotlight, cn, dateKo, scoreTone, useReduced } from "../kit";
import { CefrScale } from "../charts";
import { AnswerHighlight, CATEGORY_KO, DiffLine, SEVERITY_KO, SPEAK_FIRST_HINT_KO } from "../practice/parts";

export function LevelTestScreen() {
  const app = useApp();
  const nav = useNav();
  const [view, setView] = React.useState<{ kind: "home" } | { kind: "run"; length: DiagnosticLength } | { kind: "result"; r: DiagnosticResultRecord }>({ kind: "home" });
  // The test runs in focus mode: no navigation chrome to tap by accident.
  React.useEffect(() => {
    nav.setFocus(view.kind === "run");
    return () => nav.setFocus(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.kind]);
  if (view.kind === "run")
    return (
      <TestRunner
        length={view.length}
        onCancel={() => setView({ kind: "home" })}
        onDone={(r) => {
          app.applyDiagnostic(r);
          setView({ kind: "result", r });
        }}
      />
    );
  if (view.kind === "result") return <TestResult r={view.r} onBack={() => setView({ kind: "home" })} />;
  return <TestHome onStart={(length) => setView({ kind: "run", length })} onOpen={(r) => setView({ kind: "result", r })} />;
}

function TestHome({ onStart, onOpen }: { onStart: (l: DiagnosticLength) => void; onOpen: (r: DiagnosticResultRecord) => void }) {
  const app = useApp();
  const history = [...app.state.diagnostics].reverse();
  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>레벨 테스트</Eyebrow>
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.04em]">실제 답으로 재는 회의 영어 수준</h1>
        <p className="ef-ko mt-1 max-w-[62ch] text-[14px] text-[var(--muted)]">
          자기 평가가 아니라 직접 쓴 답으로 추정합니다. 답할수록 난이도가 조정되고, 결과는 신뢰도와 함께 CEFR 범위로 보여 줍니다.
        </p>
      </div>
      <Card className="p-4 md:p-5">
        <Eyebrow>구성</Eyebrow>
        <ol className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PART_NAMES_KO.map((p, i) => (
            <li key={p} className="flex items-center gap-2.5 rounded-xl bg-[var(--background)] px-3 py-2.5 text-[14px]">
              <span className="ef-mono grid size-6 shrink-0 place-items-center rounded-lg bg-[var(--surface-strong)] text-[11px] font-semibold">{i + 1}</span>
              {p}
            </li>
          ))}
          <li className="flex items-center gap-2.5 rounded-xl border border-dashed border-[var(--line)] px-3 py-2.5 text-[14px] text-[var(--muted)]">
            <MicOff className="size-4 shrink-0" /> 6 말하기 — 녹음·채점 미구현으로 제외
          </li>
        </ol>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        <Pressable type="button" onClick={() => onStart("standard")} className="rounded-[var(--radius)]">
          <Card className="h-full overflow-hidden p-0 transition hover:border-[var(--foreground)]/30">
            <Spotlight className="h-full p-5">
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-semibold">기본 테스트</span>
              <span className="ef-num text-[13px] text-[var(--muted)]">{totalItems("standard")}문항 · 15–20분</span>
            </div>
            <p className="ef-ko mt-1.5 text-[13px] text-[var(--muted)]">학습 시작 수준을 정하기에 충분합니다.</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold">시작 <ArrowRight className="size-4" /></span>
            </Spotlight>
          </Card>
        </Pressable>
        <Pressable type="button" onClick={() => onStart("extended")} className="rounded-[var(--radius)]">
          <Card className="h-full overflow-hidden p-0 transition hover:border-[var(--foreground)]/30">
            <Spotlight className="h-full p-5">
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-semibold">정밀 테스트</span>
              <span className="ef-num text-[13px] text-[var(--muted)]">{totalItems("extended")}문항 · 25–35분</span>
            </div>
            <p className="ef-ko mt-1.5 text-[13px] text-[var(--muted)]">문항이 많을수록 추정 범위가 좁아지고 신뢰도가 올라갑니다.</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold">시작 <ArrowRight className="size-4" /></span>
            </Spotlight>
          </Card>
        </Pressable>
      </div>
      <p className="ef-ko flex items-start gap-1.5 text-[12px] text-[var(--muted)]">
        <Info className="mt-0.5 size-3.5 shrink-0" /> 테스트 중에는 힌트와 정답 피드백이 없습니다. 작문 문항은 규칙 기반 자동 채점(기준 답안·의미 단위·문법 규칙)으로 일관되게 채점됩니다.
      </p>
      {history.length ? (
        <section>
          <h2 className="mb-2 text-[15px] font-semibold">지난 결과</h2>
          <Card>
            <ul className="divide-y divide-[var(--line)]">
              {history.map((r) => (
                <li key={r.id}>
                  <Button variant="ghost" onClick={() => onOpen(r)} className="h-auto w-full justify-between rounded-none px-4 py-3 text-left text-[14px] font-normal first:rounded-t-[inherit]">
                    <span>{dateKo(r.at)} · {r.length === "extended" ? "정밀" : "기본"} {r.items}문항</span>
                    <span className="font-semibold">{r.cefrLow === r.cefrHigh ? r.cefrPoint : `${r.cefrLow}–${r.cefrHigh}`}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function shuffleFor(id: string, arr: string[]): string[] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.every((x, i) => x === arr[i]) && a.length > 1) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

function TestRunner({ length, onCancel, onDone }: { length: DiagnosticLength; onCancel: () => void; onDone: (r: DiagnosticResultRecord) => void }) {
  const app = useApp();
  const reduced = useReduced();
  const [session, setSession] = React.useState<DiagnosticSession>(() => startDiagnostic(length, app.now()));
  // Items from the last three tests are passed over, so a retake asks different questions.
  const avoid = React.useMemo(() => new Set(app.state.diagnostics.slice(-3).flatMap((d) => d.sheets?.map((x) => x.itemId) ?? [])), [app.state.diagnostics]);
  const item = React.useMemo(() => nextDiagnosticItem(session, DIAGNOSTIC_POOL, avoid), [session, avoid]);
  const [choice, setChoice] = React.useState<number | null>(null);
  const [order, setOrder] = React.useState<string[]>([]);
  const [text, setText] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const t0 = React.useRef(app.now());
  const firstKey = React.useRef<number | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const total = totalItems(length);
  const n = session.responses.length;
  const part = currentPart(session);

  React.useEffect(() => {
    setChoice(null);
    setOrder([]);
    setText("");
    t0.current = app.now();
    firstKey.current = null;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setTimeout(() => inputRef.current?.focus(), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  React.useEffect(() => {
    if (!item) onDone(finishDiagnostic(session, app.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const ready = item ? (item.kind === "choice" ? choice !== null : item.kind === "order" ? order.length === item.chunks!.length : text.trim().length > 0) : false;

  const submit = () => {
    if (!item || !ready) return;
    const responseMs = app.now() - t0.current;
    let score = 0;
    let sub: { grammar: number; organization: number; terminology: number; meaning: number; comprehensibility: number } | undefined;
    let wordCount = 0;
    // The grading sheet keeps what was asked, what was answered and how it was graded: the evidence on the result page.
    const base = { itemId: item.id, part: item.part, kind: item.kind, level: item.level, b: item.b, responseMs, explanationKo: item.explanationKo ?? item.question?.explanationKo };
    let sheet: DiagnosticSheet;
    if (item.kind === "choice") {
      score = choice === item.answerIndex ? 1 : 0;
      sheet = { ...base, score: score * 100, promptKo: item.stemKo ?? "", promptEn: item.stemEn, answer: item.options![choice!], correct: item.options![item.answerIndex!] };
    } else if (item.kind === "order") {
      score = creditFromOrder(item.chunks!, order);
      sheet = { ...base, score: Math.round(score * 100), promptKo: item.meaningKo ?? "", answer: order.join(" "), correct: item.chunks!.join(" ") };
    } else {
      const q = item.question!;
      const ev = evaluateLocal(q, text);
      score = creditFromEvaluation(ev);
      sub = { grammar: ev.scores.grammar.score, organization: ev.scores.organization.score, terminology: ev.scores.terminology.score, meaning: ev.scores.meaning.score, comprehensibility: ev.scores.comprehensibility.score };
      wordCount = words(tokenize(text)).length;
      sheet = {
        ...base, score: Math.round(score * 100), contextKo: q.contextKo, promptKo: q.promptKo, promptEn: item.promptEn, answer: text.trim(), correct: q.reference,
        corrected: ev.corrected, errors: ev.errors.filter((e) => !e.advisory), missing: ev.meaning.filter((m) => !m.present).map((m) => m.ko), sub,
      };
    }
    setSession((s) =>
      recordDiagnosticResponse(s, {
        itemId: item.id, part: item.part, kind: item.kind, b: item.b, score, skills: item.skills, responseMs,
        firstKeyMs: firstKey.current ? firstKey.current - t0.current : null, words: wordCount, sub, sheet,
      }),
    );
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!item || confirm || e.isComposing) return;
      if (item.kind === "choice" && /^Digit[1-4]$/.test(e.code)) setChoice(Number(e.code.slice(5)) - 1);
      else if (item.kind === "order" && /^Digit[1-9]$/.test(e.code)) {
        const pool = shuffleFor(item.id, item.chunks!).filter((c) => !order.includes(c));
        const pick = pool[Number(e.code.slice(5)) - 1];
        if (pick) setOrder((o) => [...o, pick]);
      } else if (e.key === "Backspace" && item.kind === "order" && !(e.target instanceof HTMLTextAreaElement)) setOrder((o) => o.slice(0, -1));
      else if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement) && ready) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) return <div className="py-20 text-center text-[14px] text-[var(--muted)]">결과를 계산하는 중…</div>;
  const q = item.question;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3">
        <IconButton label="테스트 중단" variant="ghost" onClick={() => setConfirm(true)} className="-ml-2 text-[var(--muted)]">
          <X className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between text-[12px]">
            <span className="font-semibold">Part {part} · {PART_NAMES_KO[(part ?? 1) - 1]}</span>
            <span className="ef-num text-[var(--muted)]" data-testid="test-progress">{n + 1} / {total}</span>
          </div>
          <Progress className="mt-1.5" value={(n / total) * 100} />
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={item.id} className="mt-6" initial={reduced ? { opacity: 0 } : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          {item.kind === "choice" ? (
            <div>
              {item.stemKo ? <p className="ef-ko text-[15px] text-[var(--ef-ink-2)]">{item.stemKo}</p> : null}
              {item.stemEn ? <p className="ef-en mt-2 text-[20px] font-semibold tracking-[-.01em]">{item.stemEn}</p> : null}
              <div className="mt-5 grid gap-2" role="radiogroup" aria-label="보기">
                {item.options!.map((o, i) => (
                  <Pressable
                    key={o}
                    type="button"
                    lift={1}
                    role="radio"
                    aria-checked={choice === i}
                    onClick={() => setChoice(i)}
                    className={cn("flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 transition-colors", choice === i ? "border-[var(--foreground)] bg-[var(--surface-strong)] ring-2 ring-[var(--foreground)]/10" : "border-[var(--line)] bg-[var(--surface-strong)] hover:border-[var(--foreground)]/30")}
                  >
                    <Kbd className="shrink-0">{i + 1}</Kbd>
                    <span className="ef-en text-[16px]">{o}</span>
                  </Pressable>
                ))}
              </div>
            </div>
          ) : null}

          {item.kind === "order" ? (
            <div>
              <p className="ef-ko text-[15px] text-[var(--ef-ink-2)]">단어 묶음을 올바른 영어 어순으로 배열하세요.</p>
              <p className="ef-ko mt-2 text-[20px] font-semibold">{item.meaningKo}</p>
              <div className="mt-5 min-h-[64px] rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] p-2.5" aria-label="내가 만든 문장">
                {order.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {order.map((c, i) => (
                      <Button key={`${c}-${i}`} variant="primary" data-chunk="placed" aria-label={`${c} (빼기)`} onClick={() => setOrder((o) => o.filter((_, k) => k !== i))} className="ef-en h-auto min-h-10 px-3 py-2 text-[15px] font-normal">
                        {c}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-2.5 text-[13px] text-[var(--muted)]">아래 묶음을 순서대로 누르세요.</p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {shuffleFor(item.id, item.chunks!)
                  .filter((c) => !order.includes(c))
                  .map((c, i) => (
                    <Button key={c} variant="secondary" data-chunk="pool" onClick={() => setOrder((o) => [...o, c])} className="ef-en h-auto min-h-10 px-3 py-2 text-[15px] font-normal">
                      <Kbd className="ef-kbd-hint">{i + 1}</Kbd>
                      {c}
                    </Button>
                  ))}
              </div>
              {order.length ? (
                <Button variant="ghost" size="sm" onClick={() => setOrder([])} className="-ml-2 mt-2 h-7 gap-1 px-2 text-[12px] font-normal text-[var(--muted)]">
                  <RotateCcw className="size-3" /> 처음부터
                </Button>
              ) : null}
            </div>
          ) : null}

          {item.kind === "produce" && q ? (
            <div>
              {item.promptEn ? (
                <div className="mb-4 flex gap-2.5">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--ef-track)]">
                    <MessageCircle className="size-4 text-[var(--muted)]" />
                  </div>
                  <div className="rounded-2xl rounded-tl-md bg-[var(--surface-strong)] px-4 py-3 shadow-sm">
                    <div className="text-[11px] text-[var(--muted)]">동료</div>
                    <p className="ef-en text-[16px]">{item.promptEn}</p>
                  </div>
                </div>
              ) : null}
              {q.contextKo ? <p className="ef-ko text-[14px] text-[var(--ef-ink-2)]">{q.contextKo}</p> : null}
              <p className="ef-ko mt-2 text-[18px] font-semibold">{q.promptKo}</p>
              {/* A test of how the learner would say it: no English-order chunks, any 2–3 sentence answer counts. */}
              {q.mode === "sentence" ? <p className="ef-ko mt-1.5 text-[12px] text-[var(--muted)]">{SPEAK_FIRST_HINT_KO}</p> : null}
              <label htmlFor="ef-test-answer" className="sr-only">영어 답안</label>
              <textarea
                id="ef-test-answer"
                ref={inputRef}
                value={text}
                rows={q.mode === "sentence" ? 4 : 2}
                onChange={(e) => {
                  if (firstKey.current === null) firstKey.current = app.now();
                  setText(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    submit();
                  }
                }}
                lang="en"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
                placeholder="영어로 답하세요"
                className="ef-answer dd-focus mt-4 block w-full resize-none rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3"
              />
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex items-center gap-3">
        <span className="flex items-center gap-1 text-[12px] text-[var(--muted)]">
          <Timer className="size-3.5" /> 응답 시간이 기록됩니다
        </span>
        <Button variant="primary" size="lg" onClick={submit} disabled={!ready} className="ml-auto px-6 text-[15px] font-semibold">
          {n + 1 >= total ? "결과 보기" : "다음"} <ArrowRight className="size-4" />
        </Button>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="테스트를 중단할까요?" body="지금까지의 답은 저장되지 않고, 레벨 추정도 바뀌지 않습니다." confirmLabel="중단" onConfirm={onCancel} />
    </div>
  );
}

function TestResult({ r, onBack }: { r: DiagnosticResultRecord; onBack: () => void }) {
  const app = useApp();
  const nav = useNav();
  const start = useStartLesson();
  const range = r.cefrLow === r.cefrHigh ? r.cefrPoint : `${r.cefrLow}–${r.cefrHigh}`;
  const conf = r.confidence === "high" ? "높음" : r.confidence === "medium" ? "보통" : "낮음";
  const desc = CEFR_DESCRIPTORS[r.cefrPoint];
  const nextLevel = CEFR_ORDER[Math.min(CEFR_ORDER.indexOf(r.cefrPoint) + 1, 4)] as Cefr;
  const toeic = toeicContext(r.cefrPoint);
  const lowCtx = toeicContext(r.cefrLow);
  const highCtx = toeicContext(r.cefrHigh);
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 self-start px-2 text-[13px] font-normal text-[var(--muted)] hover:text-[var(--foreground)]">← 레벨 테스트</Button>
      <div>
        <Eyebrow>Written Production / Meeting English Estimate</Eyebrow>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-.04em]">작문 기반 회의 영어 추정: {range}</h1>
        <p className="ef-ko mt-1 text-[14px] text-[var(--muted)]">
          {dateKo(r.at)} · {r.items}문항 · 신뢰도 {conf}. 말하기는 평가하지 않았으므로 공인 말하기 등급이 아닙니다.
        </p>
      </div>

      <Card className="p-4 md:p-5">
        <CefrScale theta={r.theta} sd={r.sd} low={r.cefrLow} high={r.cefrHigh} point={r.cefrPoint} />
        <p className="ef-ko mt-3 text-[13px] text-[var(--ef-ink-2)]">
          중심 추정 {r.cefrPoint}, 불확실성 범위 {range} (±1 표준편차). {r.confidence === "low" ? "문항 수가 적거나 답이 고르지 않아 범위가 넓습니다. 정밀 테스트를 권장합니다." : "범위가 좁을수록 추정이 안정적입니다."}
        </p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="grid gap-4 p-4 md:p-5">
          <Eyebrow>영역별 결과</Eyebrow>
          <Meter label="문법 정확도" value={r.sub.grammar} />
          <Meter label="문장 구성" value={r.sub.construction} delay={60} />
          <Meter label="엔지니어링 어휘" value={r.sub.vocabulary} delay={120} />
          <Meter label="의미 명확성" value={r.sub.clarity} delay={180} />
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-xl bg-[var(--background)] p-3">
              <div className="text-[var(--muted)]">작문 응답 속도</div>
              <div className="mt-0.5 font-semibold">{r.fluency ? `${r.fluency.medianWpm} 단어/분 · 첫 입력 ${r.fluency.medianFirstKeySec}초` : "측정 문항 부족"}</div>
              <div className="mt-0.5 text-[10px] text-[var(--muted)]">시간을 잰 작문 기준이며 말하기 유창성이 아닙니다.</div>
            </div>
            <div className="rounded-xl bg-[var(--background)] p-3">
              <div className="text-[var(--muted)]">말하기</div>
              <div className="mt-0.5 font-semibold">평가하지 않음</div>
              <div className="mt-0.5 text-[10px] text-[var(--muted)]">녹음·전사·채점이 구현되지 않았습니다.</div>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-4 md:p-5">
          <div>
            <Eyebrow>강점</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.strengths.length ? r.strengths.map((s) => <span key={s} className="rounded-full bg-[var(--ef-ok-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--ef-ok)]">{skillName(s)}</span>) : <span className="text-[13px] text-[var(--muted)]">뚜렷한 강점 문법이 아직 없습니다.</span>}
            </div>
          </div>
          <div>
            <Eyebrow>약점</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.weaknesses.length ? r.weaknesses.map((s) => <Button key={s} variant="ghost" size="sm" onClick={() => nav.openGuide(s)} className="h-7 rounded-full border-red-500/20 bg-[var(--ef-bad-soft)] px-2.5 text-[12px] text-[var(--ef-bad)] hover:bg-[var(--ef-bad-soft)] hover:brightness-95 dark:hover:bg-[var(--ef-bad-soft)]">{skillName(s)}</Button>) : <span className="text-[13px] text-[var(--muted)]">뚜렷한 약점 문법이 없습니다.</span>}
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--ef-accent-soft)] p-4">
            <div className="text-[12px] font-semibold text-[var(--ef-accent-ink)]">맞춤 학습 계획</div>
            <ul className="ef-ko mt-1.5 space-y-1 text-[14px]">
              <li>· 시작 레벨: <b>{r.recommendedLevel}</b> 중심, 한 단계 위 문항을 25% 섞습니다.</li>
              <li>· 하루 {app.state.settings.dailyTarget}문항: 새 학습 약 70% + 복습 30%.</li>
              <li>· {r.sub.construction < r.sub.grammar ? "문장 구성이 약해 처음 2주는 짧은 표현 비중을 높입니다." : "문장 말하기로 긴 회의 문장을 꾸준히 연습합니다."}</li>
              {r.weaknesses.length ? <li>· 집중 문법: {r.weaknesses.slice(0, 3).map(skillName).join(", ")}</li> : null}
            </ul>
            <Button variant="primary" onClick={() => start({ title: "맞춤 학습", size: 10 })} className="mt-3 h-11 gap-1.5 text-[14px] font-semibold">
              맞춤 학습 시작 <ArrowRight className="size-4" />
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-4 md:p-5">
        <Eyebrow>CEFR 기준과 엔지니어링 예시</Eyebrow>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[r.cefrPoint, nextLevel].filter((l, i, a) => a.indexOf(l) === i).map((l) => (
            <div key={l} className="rounded-2xl border border-[var(--line)] p-4">
              <div className="flex items-center gap-2">
                <LevelBadge level={l} />
                <span className="text-[14px] font-semibold">{CEFR_DESCRIPTORS[l].titleKo}</span>
                {l === r.cefrPoint ? <span className="text-[11px] text-[var(--muted)]">현재 추정</span> : <span className="text-[11px] text-[var(--muted)]">다음 목표</span>}
              </div>
              <p className="ef-ko mt-2 text-[13px] text-[var(--ef-ink-2)]">{CEFR_DESCRIPTORS[l].canDoKo}</p>
              <p className="ef-en mt-2 rounded-xl bg-[var(--background)] px-3 py-2 text-[14px] italic">“{CEFR_DESCRIPTORS[l].example}”</p>
              <p className="ef-ko mt-1 text-[12px] text-[var(--muted)]">{CEFR_DESCRIPTORS[l].exampleNoteKo}</p>
            </div>
          ))}
        </div>
        <p className="ef-ko mt-3 text-[12px] text-[var(--muted)]">{desc ? "CEFR 단계 설명은 업무 회의 상황에 맞게 풀어 쓴 것입니다." : ""}</p>
      </Card>

      <Card className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow>TOEIC Speaking 참고 (비공식 추정)</Eyebrow>
          <span className="rounded-full bg-[var(--ef-warn-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ef-warn)]">점수 아님</span>
        </div>
        <p className="ef-ko mt-2 text-[14px]">
          {toeic.minScore
            ? `ETS가 발표한 CEFR–TOEIC Speaking 대응에서 ${r.cefrPoint}의 최소 점수는 ${toeic.minScore}점입니다${toeic.nextMin ? ` (다음 단계 최소 ${toeic.nextMin}점)` : ""}. 한국 성적표 등급으로 보면 대략 ${toeic.labelsKo} 구간에 해당하는 참고값입니다.`
            : toeic.labelsKo}
          {r.cefrLow !== r.cefrHigh && lowCtx.minScore && highCtx.minScore ? ` 추정 범위 ${range}를 기준으로 하면 ${lowCtx.labelsKo}부터 ${highCtx.labelsKo}까지 넓게 걸칩니다.` : ""}
        </p>
        <div className="ef-scroll-x mt-3">
          <table className="w-full min-w-[420px] text-[12px]">
            <thead>
              <tr className="text-[var(--muted)]">
                <th className="py-1.5 text-left font-medium">CEFR</th>
                <th className="py-1.5 text-right font-medium">Speaking 최소</th>
                <th className="py-1.5 text-right font-medium">Writing 최소</th>
              </tr>
            </thead>
            <tbody className="ef-num">
              {(["A1", "A2", "B1", "B2", "C1"] as Cefr[]).map((l) => (
                <tr key={l} className={cn("border-t border-[var(--line)]", l === r.cefrPoint && "font-semibold")}>
                  <td className="py-1.5">{l}{l === r.cefrPoint ? " ◀" : ""}</td>
                  <td className="py-1.5 text-right">{TOEIC_SPEAKING.cefrMinimum[l]}</td>
                  <td className="py-1.5 text-right">{TOEIC_SPEAKING.writingCefrMinimum[l]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="ef-ko mt-3 list-disc space-y-1 pl-5 text-[12px] text-[var(--muted)]">
          {TOEIC_SPEAKING.caveatsKo.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {TOEIC_SPEAKING.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--ef-accent-ink)] hover:underline">
              {s.label} <ExternalLink className="size-3" />
            </a>
          ))}
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <Eyebrow>파트별 점수</Eyebrow>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PART_NAMES_KO.map((p, i) => (
            <div key={p} className="rounded-xl bg-[var(--background)] p-3">
              <div className="text-[11px] text-[var(--muted)]">{i + 1}. {p}</div>
              <div className="ef-num mt-0.5 text-[18px] font-semibold">{r.partScores[String(i + 1)] ?? "—"}</div>
            </div>
          ))}
        </div>
      </Card>

      <AnswerSheets r={r} />

      <Button variant="secondary" size="lg" onClick={() => nav.go("today")}>
        <ClipboardCheck className="size-4" /> 오늘 화면으로
      </Button>
    </div>
  );
}

/* ───────────── Grading sheets: the evidence behind the estimate ───────────── */

const KIND_KO = { choice: "객관식", order: "어순 배열", produce: "작문" } as const;

function AnswerSheets({ r }: { r: DiagnosticResultRecord }) {
  const sheets = r.sheets ?? [];
  const [filter, setFilter] = React.useState<"all" | "lost">("all");
  const [open, setOpen] = React.useState<string | null>(null);
  const shown = sheets.map((s, i) => ({ s, i })).filter(({ s }) => filter === "all" || s.score < 100);
  return (
    <Card className="p-4 md:p-5" data-testid="answer-sheets">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Eyebrow>문항별 채점지 · 추정 근거</Eyebrow>
          <p className="ef-ko mt-1 text-[13px] text-[var(--ef-ink-2)]">
            각 문항의 난이도(CEFR)와 받은 점수가 추정에 그대로 쓰였습니다. 어려운 문항에서 점수가 높을수록 추정이 올라가고, 쉬운 문항에서 감점되면 내려갑니다.
          </p>
        </div>
        {sheets.length ? (
          <SegmentedControl
            value={filter}
            onValueChange={(v) => setFilter(v as "all" | "lost")}
            items={[
              { value: "all", label: `전체 ${sheets.length}` },
              { value: "lost", label: `감점 ${sheets.filter((s) => s.score < 100).length}` },
            ]}
          />
        ) : null}
      </div>
      {!sheets.length ? (
        <p className="ef-ko mt-3 rounded-xl bg-[var(--background)] p-3 text-[13px] text-[var(--muted)]">
          이 결과는 채점지를 저장하기 전에 치른 테스트라 문항별 답안이 남아 있지 않습니다. 레벨 테스트를 다시 보면 여기에서 문항별 채점지를 볼 수 있습니다.
        </p>
      ) : (
        <RevealGroup as="ol" className="mt-3 divide-y divide-[var(--line)]">
          {shown.map(({ s, i }) => {
            const isOpen = open === s.itemId;
            const tone = scoreTone(s.score);
            return (
              <RevealItem as="li" key={s.itemId} className="py-1">
                <Pressable
                  type="button"
                  lift={0}
                  onClick={() => setOpen(isOpen ? null : s.itemId)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                >
                  <span className="ef-num w-6 shrink-0 text-[12px] text-[var(--muted)]">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
                      Part {s.part} · {KIND_KO[s.kind]} <LevelBadge level={s.level} />
                    </span>
                    <span className="ef-ko mt-0.5 block truncate text-[14px]">{s.promptKo || s.promptEn}</span>
                  </span>
                  <span className={cn("ef-num shrink-0 text-[17px] font-semibold", tone === "ok" ? "text-[var(--ef-ok)]" : tone === "warn" ? "text-[var(--ef-warn)]" : "text-[var(--ef-bad)]")}>{s.score}</span>
                </Pressable>
                {isOpen ? <SheetDetail s={s} /> : null}
              </RevealItem>
            );
          })}
        </RevealGroup>
      )}
    </Card>
  );
}

function SheetDetail({ s }: { s: DiagnosticSheet }) {
  const errors = s.errors ?? [];
  return (
    <div className="mb-3 ml-9 space-y-3 rounded-2xl bg-[var(--background)] p-3.5 text-[13px]">
      {s.contextKo ? <p className="ef-ko text-[var(--muted)]">{s.contextKo}</p> : null}
      {s.promptEn ? <p className="ef-en">동료: “{s.promptEn}”</p> : null}
      {s.promptKo ? <p className="ef-ko font-medium">{s.promptKo}</p> : null}
      <div>
        <div className="text-[11px] font-semibold text-[var(--muted)]">내 답</div>
        {s.kind === "produce" ? <AnswerHighlight text={s.answer} errors={errors} /> : <p className="ef-en mt-0.5 text-[15px]">{s.answer}</p>}
      </div>
      {errors.length ? (
        <ul className="space-y-1.5" aria-label="감점 이유">
          {errors.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-1.5">
              <Badge tone={e.severity === "minor" ? "neutral" : "red"}>{CATEGORY_KO[e.category] ?? e.category} · {SEVERITY_KO[e.severity]}</Badge>
              <span className="ef-en">{e.text ? <s className="opacity-70">{e.text}</s> : null}{e.fix ? <> → <b>{e.fix}</b></> : e.text ? " (빼기)" : null}</span>
              <span className="ef-ko w-full text-[12px] text-[var(--ef-ink-2)]">{e.messageKo}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {s.missing?.length ? <p className="ef-ko text-[12px] text-[var(--ef-bad)]">빠진 의미: {s.missing.join(", ")}</p> : null}
      {s.kind === "produce" && s.corrected && s.corrected.trim() !== s.answer.trim() ? (
        <div>
          <div className="text-[11px] font-semibold text-[var(--muted)]">최소 수정</div>
          <DiffLine from={s.answer} to={s.corrected} />
        </div>
      ) : null}
      <div>
        <div className="text-[11px] font-semibold text-[var(--muted)]">{s.kind === "produce" ? "추천 답안" : "정답"}</div>
        <p className="ef-en mt-0.5 text-[15px] text-[var(--ef-ok)]">{s.correct}</p>
      </div>
      {s.sub ? (
        <p className="ef-num text-[11px] text-[var(--muted)]">
          문법 {s.sub.grammar} · 구성 {s.sub.organization} · 어휘 {s.sub.terminology} · 의미 {s.sub.meaning} · 전달력 {s.sub.comprehensibility} · 응답 {Math.round(s.responseMs / 1000)}초
        </p>
      ) : (
        <p className="ef-num text-[11px] text-[var(--muted)]">응답 {Math.round(s.responseMs / 1000)}초</p>
      )}
      {s.explanationKo ? <p className="ef-ko text-[12px] text-[var(--ef-ink-2)]">{s.explanationKo}</p> : null}
    </div>
  );
}
