"use client";
import * as React from "react";
import { ArrowRight, Loader2, Sparkles, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { similarQuestions, weakGrammar, type WeakGrammar } from "../core/weakness";
import type { Category } from "../core/types";
import { AIUnavailableError } from "../platform/types";
import { useApp } from "./store";
import { useNav } from "./app";
import { Card, Eyebrow, cn, relTimeKo } from "./kit";

/**
 * The grammar points the learner keeps getting wrong, with their own latest
 * mistake, and two ways to drill them: curated questions with the same kind of
 * trap, or a new Claude-written question built around the learner's mistake.
 */
export function WeakGrammarCard({ limit = 3, className }: { limit?: number; className?: string }) {
  const app = useApp();
  const nav = useNav();
  const now = app.now();
  const points = weakGrammar(app.state, now).slice(0, limit);
  const [busy, setBusy] = React.useState<string | null>(null);

  const practice = (p: WeakGrammar) => {
    const qs = similarQuestions(p, app.questions, app.state, now, 5);
    if (!qs.length) {
      nav.practiceSkill(p.skill);
      return;
    }
    nav.startSession({
      id: `w-${p.id}-${now}`,
      title: `자주 틀리는 문법 · ${p.labelKo}`,
      kind: "lesson",
      items: qs.map((q) => ({ kind: "new" as const, questionId: q.id, reasonKo: `비슷한 문제 · ${p.labelKo}` })),
    });
  };

  const generate = async (p: WeakGrammar) => {
    const example = app.questions.find((q) => q.skills[0] === p.skill && !q.variation);
    const category: Category = example?.category ?? "meeting";
    setBusy(p.id);
    try {
      const q = await app.platform.ai.generate({
        category,
        skill: p.skill,
        level: app.state.profile.startLevel,
        mode: "sentence",
        avoidReferences: app.questions.filter((x) => x.skills.includes(p.skill)).map((x) => x.reference),
        weakness: { labelKo: p.labelKo, examples: p.examples.slice(-4).map((x) => ({ wrong: x.wrong, right: x.right })) },
      });
      app.addGenerated(q);
      toast.success("내 실수를 바탕으로 새 문제를 만들었습니다(자동 검증 통과).");
      const more = similarQuestions(p, app.questions, app.state, now, 3).filter((x) => x.id !== q.id);
      nav.startSession({
        id: `wg-${q.id}`,
        title: `자주 틀리는 문법 · ${p.labelKo}`,
        kind: "lesson",
        items: [
          { kind: "new", questionId: q.id, reasonKo: "내 실수로 만든 새 문제 · Claude" },
          ...more.map((x) => ({ kind: "new" as const, questionId: x.id, reasonKo: `비슷한 문제 · ${p.labelKo}` })),
        ],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "문제를 만들지 못했습니다.";
      toast.error(`${msg} 검수된 비슷한 문제로 연습하세요.`);
      if (!(e instanceof AIUnavailableError)) console.warn(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>자주 틀리는 문법</Eyebrow>
        <TrendingDown className="size-4 text-[var(--ef-warn)]" />
      </div>
      {points.length ? (
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {points.map((p) => {
            const last = p.examples[p.examples.length - 1];
            return (
              <li key={p.id} className="py-3 first:pt-1 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[15px] font-semibold">{p.labelKo}</span>
                  <span className="ef-num text-[12px] text-[var(--muted)]">
                    {p.count}회 · {relTimeKo(p.lastAt, now)}
                  </span>
                </div>
                {last ? (
                  <p className="ef-en mt-1 text-[13px] text-[var(--ef-ink-2)]">
                    <span className="ef-del">{last.fix.split(" → ")[0]}</span>
                    <span className="mx-1 text-[var(--muted)]">→</span>
                    <span className="ef-ins">{last.fix.split(" → ")[1]}</span>
                    <span className="ef-ko ml-2 text-[12px] text-[var(--muted)]">“{last.wrong}”</span>
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => practice(p)} className="dd-focus inline-flex h-9 items-center gap-1 rounded-xl bg-[var(--foreground)] px-3 text-[13px] font-semibold text-[var(--background)]">
                    비슷한 문제 풀기 <ArrowRight className="size-3.5" />
                  </button>
                  {app.ai.available ? (
                    <button
                      onClick={() => generate(p)}
                      disabled={busy !== null}
                      className="dd-focus inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--line)] px-3 text-[13px] font-medium disabled:opacity-50"
                    >
                      {busy === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} 내 실수로 새 문제
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ef-ko mt-2 text-[14px] text-[var(--muted)]">
          문법 실수가 쌓이면 여기에 자주 틀리는 순서로 표시하고, 다음 세션에서 같은 문법 문제를 더 냅니다. 철자와 현장 용어 차이는 기록하지 않습니다.
        </p>
      )}
    </Card>
  );
}
