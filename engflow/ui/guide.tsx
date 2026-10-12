"use client";
import * as React from "react";
import { ArrowRight, Loader2, RefreshCw, Sparkles, Square } from "lucide-react";
import { GUIDE, SKILL_BY_ID, SKILL_GROUPS, SEEDS } from "../content";
import type { GuideEntry } from "../content/types";
import type { Evaluation, Question } from "../core/types";
import type { ExplainKind } from "../core/ai";
import { AIUnavailableError } from "../platform/types";
import { Sheet, cn, Eyebrow } from "./kit";
import { CATEGORY_KO } from "./practice/parts";
import { useApp } from "./store";

export type GuideTab = "why" | "simpler" | "example" | "compare" | "ask";

const TABS: { id: GuideTab; label: string }[] = [
  { id: "why", label: "왜 틀렸나요?" },
  { id: "simpler", label: "더 쉽게 설명" },
  { id: "example", label: "다른 예문" },
  { id: "compare", label: "비슷한 표현 비교" },
  { id: "ask", label: "Claude에게 묻기" },
];

export function Anatomy({ entry }: { entry: GuideEntry["anatomy"][number] }) {
  return (
    <figure className="rounded-2xl border border-[var(--line)] bg-[var(--background)] p-3">
      <div className="flex flex-wrap items-start gap-1.5">
        {entry.parts.map((p, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "ef-en rounded-lg border px-2 py-1 text-[15px] font-medium",
                p.focus ? "border-transparent bg-[var(--ef-accent-soft)] text-[var(--ef-accent-ink)]" : "border-[var(--line)] bg-[var(--surface-strong)]",
              )}
            >
              {p.text}
            </span>
            <span className={cn("text-[10px] leading-none", p.focus ? "font-semibold text-[var(--ef-accent-ink)]" : "text-[var(--muted)]")}>{p.roleKo}</span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">{entry.sentence}</figcaption>
    </figure>
  );
}

export function RuleList({ g }: { g: GuideEntry }) {
  return (
    <ul className="space-y-2">
      {g.rules.map((r, i) => (
        <li key={i} className="rounded-2xl border border-[var(--line)] p-3">
          <div className="ef-mono text-[13px] font-semibold text-[var(--ef-accent-ink)]">{r.formula}</div>
          <p className="ef-ko mt-1 text-[14px] text-[var(--ef-ink-2)]">{r.ko}</p>
          <p className="ef-en mt-1 text-[14px] italic">{r.example}</p>
        </li>
      ))}
    </ul>
  );
}

export function GuideSheet({
  open, onOpenChange, skill, tab: initialTab = "why", evaluation, question, onPractice,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  skill: string;
  tab?: GuideTab;
  evaluation?: Evaluation | null;
  question?: Question | null;
  onPractice?: (skill: string) => void;
}) {
  const app = useApp();
  const [tab, setTab] = React.useState<GuideTab>(initialTab);
  const [exampleStart, setExampleStart] = React.useState(0);
  const [aiText, setAiText] = React.useState("");
  const [aiState, setAiState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [aiError, setAiError] = React.useState("");
  const [ask, setAsk] = React.useState("");
  const ctl = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
      setAiText("");
      setAiState("idle");
    }
  }, [open, initialTab, skill]);
  React.useEffect(() => () => ctl.current?.abort(), []);

  const def = SKILL_BY_ID[skill];
  const g = GUIDE[skill];
  const seedExamples = SEEDS.filter((s) => s.skill === skill || s.relatedSkills.includes(skill)).flatMap((s) => s.examples);
  const examples = [...(g?.examples ?? []), ...seedExamples];
  const skillErrors = evaluation?.errors.filter((e) => !e.skill || e.skill === skill || evaluation.errors.length === 1) ?? [];
  const canAsk = app.ai.available && !!question && !!evaluation;

  const runAI = async (kind: ExplainKind, q?: string) => {
    if (!question || !evaluation) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setAiState("loading");
    setAiText("");
    setAiError("");
    try {
      await app.platform.ai.explain(kind, question, evaluation, q, (t) => setAiText(t), c.signal);
      setAiState("done");
    } catch (e) {
      if (e instanceof AIUnavailableError && e.code === "cancelled") {
        setAiState("idle");
        return;
      }
      setAiError(e instanceof Error ? e.message : "설명을 가져오지 못했습니다.");
      setAiState("error");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={def?.nameKo ?? skill} description={def ? `${SKILL_GROUPS[def.group].ko} · ${def.nameEn}` : undefined} wide>
      <div className="space-y-4">
        {def ? <div className="ef-mono rounded-xl bg-[var(--ef-accent-soft)] px-3 py-2 text-[13px] font-semibold text-[var(--ef-accent-ink)]">{def.formula}</div> : null}
        <div className="ef-scroll-x -mx-5 px-5">
          <div className="flex w-max gap-1.5" role="tablist" aria-label="문법 설명 보기 방식">
            {TABS.filter((t) => t.id !== "ask" || canAsk).map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "dd-focus h-9 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition",
                  tab === t.id ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--line)] text-[var(--ef-ink-2)] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
                )}
              >
                {t.id === "ask" ? <Sparkles className="mr-1 inline size-3.5" /> : null}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {!g && tab !== "ask" ? <p className="ef-ko text-[14px] text-[var(--muted)]">이 문법의 상세 설명을 준비 중입니다.</p> : null}

        {g && tab === "why" ? (
          <div className="space-y-4">
            {skillErrors.length ? (
              <div className="space-y-2">
                <Eyebrow>내 답에서 찾은 문제</Eyebrow>
                {skillErrors.map((e) => (
                  <div key={e.id} className="rounded-2xl border border-[var(--line)] p-3">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="rounded-md bg-[var(--ef-bad-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ef-bad)]">{CATEGORY_KO[e.category] ?? e.category}</span>
                      <span className="ef-en">
                        <span className="ef-del">{e.text || "∅"}</span> <ArrowRight className="inline size-3 text-[var(--muted)]" /> <span className="ef-ins">{e.fix || "삭제"}</span>
                      </span>
                    </div>
                    <p className="ef-ko mt-1.5 text-[14px] text-[var(--ef-ink-2)]">{e.messageKo}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <div>
              <Eyebrow>핵심</Eyebrow>
              <p className="ef-ko mt-1.5 text-[15px]">{g.summaryKo}</p>
            </div>
            {g.anatomy.map((a, i) => (
              <Anatomy key={i} entry={a} />
            ))}
            <RuleList g={g} />
          </div>
        ) : null}

        {g && tab === "simpler" ? (
          <div className="space-y-4">
            <p className="ef-ko text-[16px] leading-8">{g.simpleKo}</p>
            {g.anatomy[0] ? <Anatomy entry={g.anatomy[0]} /> : null}
          </div>
        ) : null}

        {g && tab === "example" ? (
          <div className="space-y-3">
            <ul className="space-y-2">
              {[0, 1, 2].map((k) => {
                const ex = examples[(exampleStart + k) % Math.max(1, examples.length)];
                return ex ? (
                  <li key={`${exampleStart}-${k}`} className="rounded-2xl border border-[var(--line)] p-3">
                    <p className="ef-en text-[16px] font-medium">{ex.en}</p>
                    <p className="ef-ko mt-1 text-[13px] text-[var(--muted)]">{ex.ko}</p>
                  </li>
                ) : null;
              })}
            </ul>
            {examples.length > 3 ? (
              <button className="dd-focus inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] px-3.5 text-[13px] font-medium" onClick={() => setExampleStart((s) => (s + 3) % examples.length)}>
                <RefreshCw className="size-3.5" />
                다른 예문 보기
              </button>
            ) : null}
          </div>
        ) : null}

        {g && tab === "compare" ? (
          <div className="space-y-4">
            <ul className="space-y-2">
              {g.compare.map((c, i) => (
                <li key={i} className="rounded-2xl border border-[var(--line)] p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p className="ef-en rounded-xl bg-[var(--background)] px-3 py-2 text-[15px] font-medium">{c.a}</p>
                    <p className="ef-en rounded-xl bg-[var(--background)] px-3 py-2 text-[15px] font-medium">{c.b}</p>
                  </div>
                  <p className="ef-ko mt-2 text-[14px] text-[var(--ef-ink-2)]">{c.ko}</p>
                </li>
              ))}
            </ul>
            {g.mistakes.length ? (
              <div>
                <Eyebrow>자주 하는 실수</Eyebrow>
                <ul className="mt-2 space-y-2">
                  {g.mistakes.map((m, i) => (
                    <li key={i} className="rounded-2xl border border-[var(--line)] p-3">
                      <p className="ef-en text-[15px]">
                        <span className="ef-del">{m.wrong}</span>
                        <ArrowRight className="mx-1.5 inline size-3.5 text-[var(--muted)]" />
                        <span className="font-medium text-[var(--ef-ok)]">{m.right}</span>
                      </p>
                      <p className="ef-ko mt-1 text-[13px] text-[var(--ef-ink-2)]">{m.ko}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "ask" ? (
          <div className="space-y-3">
            <p className="ef-ko text-[13px] text-[var(--muted)]">Claude가 내 문장을 보고 설명합니다. {app.platform.target === "artifact" ? "내 Claude 사용량이 쓰입니다." : ""}</p>
            <div className="flex flex-wrap gap-1.5">
              {(["why", "simpler", "example", "compare"] as ExplainKind[]).map((k) => (
                <button key={k} disabled={aiState === "loading"} onClick={() => runAI(k)} className="dd-focus h-9 rounded-full border border-[var(--line)] px-3 text-[13px] disabled:opacity-50">
                  {TABS.find((t) => t.id === k)?.label}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (ask.trim()) runAI("ask", ask.trim());
              }}
            >
              <label htmlFor="ef-ask" className="sr-only">질문</label>
              <input
                id="ef-ask"
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder="예: 여기서 might 대신 may를 써도 되나요?"
                className="dd-focus h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 text-[16px]"
              />
              <button type="submit" disabled={!ask.trim() || aiState === "loading"} className="dd-focus h-11 shrink-0 rounded-xl bg-[var(--foreground)] px-4 text-[14px] font-semibold text-[var(--background)] disabled:opacity-40">
                질문
              </button>
            </form>
            {aiState === "loading" && !aiText ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                <Loader2 className="size-4 animate-spin" /> Claude가 생각하는 중…
                <button className="ml-auto inline-flex items-center gap-1 text-[12px]" onClick={() => ctl.current?.abort()}>
                  <Square className="size-3" /> 중지
                </button>
              </div>
            ) : null}
            {aiText ? <div className="ef-ko whitespace-pre-wrap rounded-2xl border border-[var(--line)] bg-[var(--background)] p-3.5 text-[15px]">{aiText}</div> : null}
            {aiState === "error" ? <p className="ef-ko text-[13px] text-[var(--ef-bad)]">{aiError}</p> : null}
          </div>
        ) : null}

        {onPractice ? (
          <button
            className="dd-focus flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--foreground)] text-[15px] font-semibold text-[var(--background)]"
            onClick={() => onPractice(skill)}
          >
            이 문법 다시 연습하기 <ArrowRight className="size-4" />
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
