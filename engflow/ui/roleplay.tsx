"use client";
import * as React from "react";
import { ArrowRight, Check, MessagesSquare } from "lucide-react";
import { listScenarios, recommendScenario, scenarioItems, type ScenarioInfo } from "../core/roleplay";
import { autoDifficulty } from "../core/situations";
import type { Situation } from "../core/types";
import { SITUATION_INFO } from "../content";
import { useApp } from "./store";
import { useNav } from "./app";
import { Card, Eyebrow, cn } from "./kit";

function useStartScenario() {
  const app = useApp();
  const nav = useNav();
  return (s: ScenarioInfo) =>
    nav.startSession({ id: `rp-${s.id}-${app.now()}`, title: `롤플레이 · ${s.titleKo}`, kind: "lesson", items: scenarioItems(s), note: `${s.steps.length}번 주고받는 대화` });
}

function Dots({ s }: { s: ScenarioInfo }) {
  return (
    <span className="flex items-center gap-[3px]" aria-label={`${s.steps.length}턴 중 ${s.done}턴 완료`}>
      {s.best.map((b, i) => (
        <span key={i} className={cn("h-1.5 w-3 rounded-full", b >= 85 ? "bg-[var(--ef-ok-fill)]" : b > 0 ? "bg-[var(--ef-warn-fill)]" : "bg-[var(--ef-track)]")} />
      ))}
    </span>
  );
}

/** Role-play scenarios for a scene (or all), as tappable cards. */
export function RoleplayList({ situation = "all", limit }: { situation?: Situation | "all"; limit?: number }) {
  const app = useApp();
  const start = useStartScenario();
  const all = listScenarios(app.questions, app.state).filter((s) => situation === "all" || s.situation === situation);
  const shown = limit ? all.slice(0, limit) : all;
  if (!all.length) return null;
  return (
    <section aria-label="롤플레이">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>롤플레이 · 여러 번 주고받는 대화</Eyebrow>
        <span className="ef-num text-[12px] text-[var(--muted)]">{all.length}개</span>
      </div>
      <p className="ef-ko mt-1 text-[13px] text-[var(--muted)]">한 대화 안에서 여러 번 말합니다. 내가 앞에서 한 말이 대화창에 그대로 남아 실제 회의처럼 이어집니다.</p>
      <div className="mt-2 grid gap-2.5 md:grid-cols-2">
        {shown.map((s) => (
          <button key={s.id} onClick={() => start(s)} className="dd-focus rounded-[var(--radius)] text-left" aria-label={`롤플레이 ${s.titleKo} 시작`}>
            <Card className="h-full p-4 transition hover:border-[var(--foreground)]/25">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">{s.titleKo}</div>
                  <div className="ef-num mt-0.5 text-[12px] text-[var(--muted)]">
                    {SITUATION_INFO[s.situation]?.ko ?? s.situation} · {s.steps.length}턴 · 난이도 {s.minDifficulty === s.maxDifficulty ? s.minDifficulty : `${s.minDifficulty}–${s.maxDifficulty}`}
                  </div>
                </div>
                {s.best.every((b) => b >= 85) ? <Check className="mt-0.5 size-4 shrink-0 text-[var(--ef-ok)]" /> : <ArrowRight className="mt-0.5 size-4 shrink-0 text-[var(--muted)]" />}
              </div>
              <div className="mt-3">
                <Dots s={s} />
              </div>
            </Card>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Today: one recommended role-play. */
export function RoleplayShortcut() {
  const app = useApp();
  const start = useStartScenario();
  const list = listScenarios(app.questions, app.state);
  const target = app.state.settings.difficulty?.all ?? autoDifficulty(app.state.profile.startLevel);
  const s = recommendScenario(list, target);
  if (!s) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>오늘의 롤플레이</Eyebrow>
        <MessagesSquare className="size-4 text-[var(--ef-accent-ink)]" />
      </div>
      <div className="mt-1.5 text-[17px] font-semibold">{s.titleKo}</div>
      <p className="ef-ko mt-1 text-[13px] text-[var(--muted)]">
        {SITUATION_INFO[s.situation]?.ko} · {s.steps.length}번 주고받기 · 난이도 {s.minDifficulty}–{s.maxDifficulty}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Dots s={s} />
        <button onClick={() => start(s)} className="dd-focus inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--foreground)] px-4 text-[14px] font-semibold text-[var(--background)]">
          대화 시작 <ArrowRight className="size-4" />
        </button>
      </div>
    </Card>
  );
}
