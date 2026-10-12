"use client";
import * as React from "react";
import { ArrowRight, BookOpen, RotateCcw } from "lucide-react";
import { SearchField } from "@/components/ui/search-field";
import { SKILL_BY_ID, SKILL_GROUPS, SEED_BY_ID, GUIDE, skillName } from "../../content";
import type { SkillGroup } from "../../content/skills";
import type { MasteryStatus, MistakeRecord } from "../../core/types";
import { STATUS_LABEL_KO, masteryGapKo, newSkillState } from "../../core/mastery";
import { useApp } from "../store";
import { useNav } from "../app";
import { Card, Eyebrow, MasteryTrack, Sheet, StatusChip, cn, dateKo, relTimeKo } from "../kit";
import { CATEGORY_KO } from "../practice/parts";
import { pickReviewQuestion } from "../../core/session";
import { ExpressionCollection, ExpressionIndex } from "../expressions";

type Filter = "all" | Exclude<MasteryStatus, "new">;

export function MistakesScreen() {
  const app = useApp();
  const nav = useNav();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [open, setOpen] = React.useState<MistakeRecord | null>(null);
  const now = app.now();
  const s = app.state;
  const statusOf = (m: MistakeRecord): MasteryStatus => s.skills[m.skill]?.status ?? "learning";
  const all = Object.values(s.mistakes);
  const filtered = all.filter((m) => {
    if (filter !== "all" && statusOf(m) !== filter) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return [m.incorrect, m.correct, m.whyKo, skillName(m.skill), CATEGORY_KO[m.category] ?? ""].some((x) => x.toLowerCase().includes(needle));
  });
  // Group by grammar group → skill, groups ordered by total frequency.
  const groups = new Map<SkillGroup, Map<string, MistakeRecord[]>>();
  for (const m of filtered) {
    const g = SKILL_BY_ID[m.skill]?.group ?? "structure";
    if (!groups.has(g)) groups.set(g, new Map());
    const bySkill = groups.get(g)!;
    bySkill.set(m.skill, [...(bySkill.get(m.skill) ?? []), m]);
  }
  const freq = (ms: MistakeRecord[]) => ms.reduce((a, m) => a + m.count, 0);
  const ordered = [...groups.entries()].sort((a, b) => freq([...b[1].values()].flat()) - freq([...a[1].values()].flat()));
  const counts = { learning: 0, improving: 0, mastered: 0 } as Record<Filter, number>;
  for (const m of all) counts[statusOf(m) as Filter] = (counts[statusOf(m) as Filter] ?? 0) + 1;

  const reviewNow = (m: MistakeRecord) => {
    const item = s.items[m.reviewItemId];
    if (!item) {
      nav.practiceSkill(m.skill);
      return;
    }
    const qq = pickReviewQuestion(item, app.questions, "mixed");
    if (!qq) {
      nav.practiceSkill(m.skill);
      return;
    }
    nav.startSession({ id: `m-${m.id}-${now}`, title: `복습 · ${item.label}`, kind: "review", items: [{ kind: "review", questionId: qq.id, reviewItemId: item.id, reasonKo: `복습 · ${item.label}` }] });
  };

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>표현 노트</Eyebrow>
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.04em]">자주 틀리는 표현을 모아 익히기</h1>
        <p className="ef-ko mt-1 max-w-[62ch] text-[14px] text-[var(--muted)]">틀린 문법은 표현별로 자동으로 모입니다. 표현을 누르면 내 실수 → 규칙·비교 → 확인 퀴즈 → 대화로 말해 보기 순서로 익힙니다.</p>
      </div>

      <ExpressionCollection />
      <ExpressionIndex />

      <div className="pt-2">
        <Eyebrow>틀린 문장 기록</Eyebrow>
        <p className="ef-ko mt-1 text-[13px] text-[var(--muted)]">주요 오류는 자동으로 저장되고 복습 일정에 들어갑니다. 숙달은 서로 다른 날·다른 문장에서 힌트 없이 반복해 맞혀야 인정됩니다.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <SearchField value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder="문장·문법·설명 검색" className="h-11 md:w-80" aria-label="실수 검색" />
        <div className="ef-scroll-x">
          <div className="flex w-max gap-1.5">
            {(["all", "learning", "improving", "mastered"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn("dd-focus h-9 rounded-full border px-3.5 text-[13px] font-medium", filter === f ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--line)] text-[var(--ef-ink-2)]")}
              >
                {f === "all" ? `전체 ${all.length}` : `${STATUS_LABEL_KO[f]} ${counts[f] ?? 0}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!filtered.length ? <Card className="p-6 text-center text-[14px] text-[var(--muted)]">{all.length ? "조건에 맞는 실수가 없습니다." : "아직 저장된 실수가 없습니다."}</Card> : null}

      {ordered.map(([g, bySkill]) => (
        <section key={g}>
          <h2 className="mb-2 flex items-baseline justify-between text-[15px] font-semibold">
            {SKILL_GROUPS[g].ko}
            <span className="ef-num text-[12px] font-medium text-[var(--muted)]">{freq([...bySkill.values()].flat())}회</span>
          </h2>
          <div className="space-y-3">
            {[...bySkill.entries()]
              .sort((a, b) => freq(b[1]) - freq(a[1]))
              .map(([skill, ms]) => {
                const st = s.skills[skill] ?? newSkillState(skill);
                return (
                  <Card key={skill} className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3">
                      <span className="text-[14px] font-semibold">{skillName(skill)}</span>
                      <span className="ef-mono text-[12px] text-[var(--muted)]">{SKILL_BY_ID[skill]?.formula}</span>
                      <StatusChip status={st.status} className="ml-auto" />
                    </div>
                    <div className="px-4 pt-3">
                      <MasteryTrack status={st.status} mastery={st.mastery} />
                    </div>
                    <ul className="divide-y divide-[var(--line)]">
                      {ms
                        .sort((a, b) => b.lastAt - a.lastAt)
                        .map((m) => {
                          const item = s.items[m.reviewItemId];
                          return (
                            <li key={m.id}>
                              <button onClick={() => setOpen(m)} className="dd-focus block w-full px-4 py-3 text-left hover:bg-black/[.02] dark:hover:bg-white/[.03]">
                                <div className="flex items-start gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="ef-en text-[15px]">
                                      <span className="ef-del">{m.incorrect}</span>
                                    </p>
                                    <p className="ef-en mt-0.5 text-[15px] font-medium text-[var(--ef-ok)]">{m.correct}</p>
                                    <p className="ef-ko mt-1 line-clamp-2 text-[13px] text-[var(--ef-ink-2)]">{m.whyKo}</p>
                                  </div>
                                  <div className="shrink-0 text-right text-[11px] text-[var(--muted)]">
                                    {m.origin === "imported" ? <div className="mb-1 rounded-full bg-[var(--ef-accent-soft)] px-1.5 py-0.5 font-semibold text-[var(--ef-accent-ink)]">가져온 기록</div> : null}
                                    <div className="ef-num">{m.count}회</div>
                                    <div>{item ? (item.due <= now ? "복습 대기" : `다음 ${relTimeKo(item.due, now)}`) : ""}</div>
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  </Card>
                );
              })}
          </div>
        </section>
      ))}

      {open ? <MistakeDetail m={open} onClose={() => setOpen(null)} onReview={() => reviewNow(open)} /> : null}
    </div>
  );
}

function MistakeDetail({ m, onClose, onReview }: { m: MistakeRecord; onClose: () => void; onReview: () => void }) {
  const app = useApp();
  const nav = useNav();
  const now = app.now();
  const st = app.state.skills[m.skill] ?? newSkillState(m.skill);
  const item = app.state.items[m.reviewItemId];
  const seed = m.origin === "imported" ? SEED_BY_ID[m.id.replace(/^mistake-/, "")] : undefined;
  const g = GUIDE[m.skill];
  const examples = seed?.examples ?? g?.examples.slice(0, 3) ?? [];
  const lastReview = item?.history[item.history.length - 1];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={skillName(m.skill)} description={`${CATEGORY_KO[m.category] ?? m.category} · ${m.origin === "imported" ? "가져온 과거 오류" : `${dateKo(m.firstAt)} 처음 발생`}`}>
      <div className="space-y-4">
        <div className="space-y-1.5 rounded-2xl border border-[var(--line)] p-4">
          <p className="ef-en text-[16px]">
            <span className="ef-del">{m.incorrect}</span>
          </p>
          <p className="ef-en text-[17px] font-semibold text-[var(--ef-ok)]">{m.correct}</p>
        </div>
        <div>
          <Eyebrow>왜 틀렸나요</Eyebrow>
          <p className="ef-ko mt-1.5 text-[15px]">{m.whyKo}</p>
        </div>
        <div>
          <Eyebrow>문법 규칙</Eyebrow>
          <p className="ef-ko mt-1.5 text-[15px] text-[var(--ef-ink-2)]">{seed?.ruleKo ?? g?.summaryKo ?? SKILL_BY_ID[m.skill]?.formula}</p>
        </div>
        {examples.length ? (
          <div>
            <Eyebrow>기술 문맥 예문</Eyebrow>
            <ul className="mt-2 space-y-2">
              {examples.map((e) => (
                <li key={e.en} className="rounded-xl bg-[var(--background)] px-3 py-2">
                  <p className="ef-en text-[15px]">{e.en}</p>
                  <p className="ef-ko text-[12px] text-[var(--muted)]">{e.ko}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <div className="rounded-xl border border-[var(--line)] p-3">
            <div className="text-[11px] text-[var(--muted)]">마지막 복습</div>
            <div className="mt-0.5 font-medium">{lastReview ? relTimeKo(lastReview.at, now) : "아직 없음"}</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <div className="text-[11px] text-[var(--muted)]">다음 복습</div>
            <div className="mt-0.5 font-medium">{item ? (item.due <= now ? "지금" : relTimeKo(item.due, now)) : "—"}</div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Eyebrow>숙련도</Eyebrow>
            <StatusChip status={st.status} />
          </div>
          <div className="mt-2">
            <MasteryTrack status={st.status} mastery={st.mastery} />
          </div>
          {st.status !== "mastered" ? (
            <ul className="ef-ko mt-2 list-disc space-y-0.5 pl-5 text-[12px] text-[var(--muted)]">
              {masteryGapKo(st).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : null}
          {item ? <p className="ef-ko mt-2 text-[12px] text-[var(--muted)]">{item.scheduleNote}</p> : null}
        </div>
        <div className="flex gap-2">
          <button onClick={onReview} className="dd-focus inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[var(--foreground)] text-[15px] font-semibold text-[var(--background)]">
            <RotateCcw className="size-4" /> 지금 복습 <ArrowRight className="size-4" />
          </button>
          <button
            onClick={() => {
              onClose();
              nav.openGuide(m.skill);
            }}
            className="dd-focus inline-flex h-12 items-center gap-2 rounded-[14px] border border-[var(--line)] px-4 text-[14px] font-medium"
          >
            <BookOpen className="size-4" /> 문법
          </button>
        </div>
      </div>
    </Sheet>
  );
}
