"use client";
import * as React from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { SKILLS, SKILL_GROUPS, skillName } from "../../content";
import type { SkillGroup } from "../../content/skills";
import { masteryGapKo, newSkillState, localDayKey } from "../../core/mastery";
import { weakSkills } from "../../core/session";
import { levelEstimate, streakDays } from "../../core/store";
import { DAY_MS } from "../../core/fsrs";
import { useApp } from "../store";
import { useNav } from "../app";
import { Card, Eyebrow, StatusChip, cn, dateKo, relTimeKo } from "../kit";
import { Heatmap, TrendLine } from "../charts";
import { SITUATIONS } from "../../core/types";
import { situationOf } from "../../core/situations";
import { listScenarios } from "../../core/roleplay";
import { SITUATION_INFO } from "../../content";
import { useStartLesson } from "./today";
import { BadgeShelf } from "../badges";

export function ProgressScreen() {
  const app = useApp();
  const nav = useNav();
  const now = app.now();
  const s = app.state;
  const [openGroup, setOpenGroup] = React.useState<SkillGroup | null>(null);
  const attempts = s.attempts.filter((a) => !a.skipped);
  const last7 = attempts.filter((a) => now - a.at < 7 * DAY_MS);
  const acc7 = last7.length ? Math.round((last7.filter((a) => a.grade >= 3).length / last7.length) * 100) : null;
  const reviews = attempts.filter((a) => a.context === "review").length;
  const lvl = levelEstimate(s);
  const weak = weakSkills(s, now);
  const skipped = Object.values(s.skills).filter((k) => k.skippedCount > 0).sort((a, b) => b.skippedCount - a.skippedCount);

  // Daily average score, last 30 days.
  const trend = Array.from({ length: 30 }, (_, i) => {
    const t = now - (29 - i) * DAY_MS;
    const key = localDayKey(t);
    const xs = attempts.filter((a) => localDayKey(a.at) === key).map((a) => a.overall);
    return { label: `${new Date(t).getMonth() + 1}/${new Date(t).getDate()}`, value: xs.length ? Math.round(xs.reduce((x, y) => x + y, 0) / xs.length) : null };
  });

  const statusCount = (st: string) => SKILLS.filter((k) => (s.skills[k.id]?.status ?? "new") === st).length;

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>진도</Eyebrow>
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.04em]">문법별 숙련도와 학습 흐름</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-[12px] text-[var(--muted)]">총 답변</div>
          <div className="ef-num mt-1 text-[24px] font-semibold">{attempts.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] text-[var(--muted)]">7일 통과율</div>
          <div className="ef-num mt-1 text-[24px] font-semibold">{acc7 === null ? "—" : `${acc7}%`}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] text-[var(--muted)]">연속 학습</div>
          <div className="ef-num mt-1 text-[24px] font-semibold">{streakDays(s, now)}일</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] text-[var(--muted)]">복습 완료</div>
          <div className="ef-num mt-1 text-[24px] font-semibold">{reviews}</div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4 md:p-5">
          <div className="flex items-baseline justify-between">
            <Eyebrow>CEFR 진행</Eyebrow>
            <button onClick={() => nav.go("test")} className="text-[12px] text-[var(--ef-accent-ink)] hover:underline">레벨 테스트</button>
          </div>
          <div className="mt-1.5 text-[22px] font-semibold">{lvl.label}</div>
          <p className="ef-ko mt-0.5 text-[12px] text-[var(--muted)]">현재 학습 기준 레벨 {s.profile.startLevel} · 목표 B2–C1 회의 소통</p>
          {s.diagnostics.length ? (
            <ul className="mt-3 divide-y divide-[var(--line)] text-[13px]">
              {[...s.diagnostics].reverse().slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2">
                  <span>{dateKo(d.at)} · {d.length === "extended" ? "정밀" : "기본"} {d.items}문항</span>
                  <span className="font-semibold">
                    {d.cefrLow === d.cefrHigh ? d.cefrPoint : `${d.cefrLow}–${d.cefrHigh}`}
                    <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">신뢰도 {d.confidence === "high" ? "높음" : d.confidence === "medium" ? "보통" : "낮음"}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ef-ko mt-3 text-[13px] text-[var(--muted)]">레벨 테스트 기록이 없습니다.</p>
          )}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
            {(["new", "learning", "improving", "mastered"] as const).map((st) => (
              <div key={st} className="rounded-xl bg-[var(--background)] py-2">
                <div className="ef-num text-[18px] font-semibold">{statusCount(st)}</div>
                <StatusChip status={st} className="mt-1 border-0 bg-transparent px-0" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 md:p-5">
          <Eyebrow>일별 평균 점수 · 30일</Eyebrow>
          <div className="mt-3">
            <TrendLine points={trend} />
          </div>
        </Card>
      </div>

      <BadgeShelf />

      <SceneMap />

      <Card className="p-4 md:p-5">
        <Eyebrow>복습 꾸준함 · 최근 12주</Eyebrow>
        <div className="mt-3">
          <Heatmap daily={s.daily} now={now} />
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <div className="flex items-baseline justify-between">
          <Eyebrow>약점 문법</Eyebrow>
          <span className="text-[12px] text-[var(--muted)]">항상 표시됩니다</span>
        </div>
        {weak.length ? (
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {weak.slice(0, 8).map((w) => (
              <li key={w.skill} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                    {skillName(w.skill)}
                    {w.neglected ? <span className="rounded-full bg-[var(--ef-warn-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ef-warn)]">7일+ 미연습</span> : null}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--ef-track)]">
                    <div className="h-full rounded-full bg-[var(--ef-bad-fill)]" style={{ width: `${Math.round(w.mastery * 100)}%` }} />
                  </div>
                </div>
                <button onClick={() => nav.practiceSkill(w.skill)} className="dd-focus h-9 shrink-0 rounded-xl border border-[var(--line)] px-3 text-[13px] font-medium">연습</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ef-ko mt-2 text-[13px] text-[var(--muted)]">약점으로 분류된 문법이 없습니다.</p>
        )}
        {skipped.length ? (
          <p className="ef-ko mt-3 text-[12px] text-[var(--muted)]">
            건너뛴 문법: {skipped.slice(0, 5).map((k) => `${skillName(k.skill)} ${k.skippedCount}회`).join(" · ")} — 건너뛴 문법은 숙련도에 0점으로 반영됩니다.
          </p>
        ) : null}
      </Card>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold">문법별 숙련도</h2>
        <div className="space-y-2">
          {(Object.keys(SKILL_GROUPS) as SkillGroup[]).map((g) => {
            const skills = SKILLS.filter((k) => k.group === g);
            const open = openGroup === g;
            const avg = skills.reduce((a, k) => a + (s.skills[k.id]?.mastery ?? 0), 0) / skills.length;
            return (
              <Card key={g} className="overflow-hidden">
                <button onClick={() => setOpenGroup(open ? null : g)} className="dd-focus flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{SKILL_GROUPS[g].ko}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--ef-track)]">
                      <span className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-700" style={{ width: `${Math.round(avg * 100)}%` }} />
                    </span>
                  </span>
                  <span className="ef-num text-[12px] text-[var(--muted)]">{Math.round(avg * 100)}%</span>
                  <ChevronDown className={cn("size-4 text-[var(--muted)] transition", open && "rotate-180")} />
                </button>
                {open ? (
                  <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                    {skills.map((k) => {
                      const st = s.skills[k.id] ?? newSkillState(k.id);
                      const gap = masteryGapKo(st);
                      return (
                        <li key={k.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] font-medium">{k.nameKo}</span>
                            <StatusChip status={st.status} />
                            <span className="ef-num ml-auto text-[12px] text-[var(--muted)]">{Math.round(st.mastery * 100)}%</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--ef-track)]">
                            <div className={cn("h-full rounded-full transition-[width] duration-700", st.status === "mastered" ? "bg-[var(--ef-ok-fill)]" : st.status === "improving" ? "bg-[var(--ef-warn-fill)]" : "bg-[var(--ef-bad-fill)]")} style={{ width: `${Math.round(st.mastery * 100)}%` }} />
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                            <span>
                              답변 {st.attempts} · 힌트 없이 정답 {st.independentSuccesses} · 힌트 사용 {st.hintedAttempts}
                              {st.lastAt ? ` · ${relTimeKo(st.lastAt, now)}` : ""}
                              {st.imported && !st.attempts ? " · 가져온 오류에서 확인된 약점" : ""}
                            </span>
                            <button onClick={() => nav.openGuide(k.id)} className="inline-flex items-center gap-1 text-[var(--ef-accent-ink)]">
                              <BookOpen className="size-3" /> 설명
                            </button>
                          </div>
                          {st.status !== "mastered" && st.attempts ? <p className="ef-ko mt-1 text-[11px] text-[var(--muted)]">숙달까지: {gap.join(" · ")}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/**
 * Scene × difficulty map: which difficulties of each scene the learner can
 * already handle (best 85+ on at least one question there), which were tried,
 * and a one-tap "next step" one difficulty above the highest one reached.
 */
function SceneMap() {
  const app = useApp();
  const start = useStartLesson();
  const bank = app.questions.filter((q) => !q.variation && !q.id.startsWith("dg-"));
  const rows = SITUATIONS.map((sc) => {
    const qs = bank.filter((q) => situationOf(q) === sc);
    const cells = Array.from({ length: 10 }, (_, k) => {
      const at = qs.filter((q) => q.difficulty === k + 1);
      const best = Math.max(0, ...at.map((q) => app.state.seen[q.id]?.best ?? 0));
      const tried = at.some((q) => app.state.seen[q.id]);
      return { d: k + 1, n: at.length, state: best >= 85 ? "done" : tried ? "tried" : at.length ? "open" : "none" } as const;
    });
    const reached = Math.max(0, ...cells.filter((c) => c.state === "done").map((c) => c.d));
    return { sc, cells, reached };
  });
  const scenarios = listScenarios(app.questions, app.state);
  const finished = scenarios.filter((x) => x.best.every((b) => b >= 85)).length;
  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>상황별 도달 난이도</Eyebrow>
        <span className="ef-num text-[12px] text-[var(--muted)]">롤플레이 완주 {finished}/{scenarios.length}</span>
      </div>
      <p className="ef-ko mt-1 text-[12px] text-[var(--muted)]">초록 = 85점 이상으로 말해 본 난이도 · 노랑 = 시도함 · 회색 = 아직</p>
      <ul className="mt-3 space-y-2">
        {rows.map(({ sc, cells, reached }) => {
          const next = Math.min(10, reached + 1);
          return (
            <li key={sc} className="flex items-center gap-2">
              <span className="w-[86px] shrink-0 truncate text-[12px] font-medium sm:w-[120px] sm:text-[13px]">{SITUATION_INFO[sc].ko}</span>
              <span className="grid flex-1 grid-cols-10 gap-[3px]" aria-label={`${SITUATION_INFO[sc].ko} 도달 난이도 ${reached}`}>
                {cells.map((c) => (
                  <span
                    key={c.d}
                    title={`난이도 ${c.d} · ${c.n}문항`}
                    className={cn(
                      "h-3.5 rounded-[3px]",
                      c.state === "done" ? "bg-[var(--ef-ok-fill)]" : c.state === "tried" ? "bg-[var(--ef-warn-fill)]" : c.state === "open" ? "bg-[var(--ef-track)]" : "bg-transparent",
                    )}
                  />
                ))}
              </span>
              <button
                onClick={() => start({ size: 6, situation: sc, difficulty: next, title: `${SITUATION_INFO[sc].ko} · 난이도 ${next} 도전` })}
                className="dd-focus ef-num h-7 shrink-0 rounded-lg border border-[var(--line)] px-2 text-[11px] font-semibold"
                aria-label={`${SITUATION_INFO[sc].ko} 난이도 ${next} 도전`}
              >
                {next}단계 도전
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
