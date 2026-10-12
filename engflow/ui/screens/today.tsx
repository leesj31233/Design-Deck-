"use client";
import * as React from "react";
import { ArrowRight, BookOpen, ClipboardCheck, Flame, RotateCcw, Sparkles } from "lucide-react";
import { buildSession, dueItems, weakSkills } from "../../core/session";
import { levelEstimate, streakDays, weekSeries } from "../../core/store";
import { localDayKey } from "../../core/mastery";
import { SKILLS, SKILL_BY_ID, skillName } from "../../content";
import { useApp } from "../store";
import { useNav } from "../app";
import { Card, Eyebrow, MasteryTrack, ProgressRing, StatusChip, cn, dateKo, relTimeKo } from "../kit";
import { WeekBars } from "../charts";
import { CATEGORY_LABEL } from "../practice/session";
import { WeakGrammarCard } from "../weak-grammar";

export function useStartLesson() {
  const app = useApp();
  const nav = useNav();
  return (opts: Partial<Parameters<typeof buildSession>[2]> & { title?: string } = {}) => {
    const plan = buildSession(app.state, app.questions, { size: 10, mode: "mixed", now: app.now(), ...opts });
    nav.startSession({ id: `s-${app.now()}`, title: opts.title ?? (opts.reviewOnly ? "복습" : "오늘의 학습"), kind: opts.reviewOnly ? "review" : "lesson", items: plan.items, note: plan.noteKo });
  };
}

export function TodayScreen() {
  const app = useApp();
  const nav = useNav();
  const start = useStartLesson();
  const now = app.now();
  const s = app.state;
  const today = s.daily[localDayKey(now)];
  const answered = today?.answered ?? 0;
  const target = s.settings.dailyTarget;
  const due = dueItems(s, now);
  const nextDue = Object.values(s.items).filter((i) => !i.suspended && i.due > now).sort((a, b) => a.due - b.due)[0];
  const lvl = levelEstimate(s);
  const streak = streakDays(s, now);
  const week = weekSeries(s, now);
  const weekTotal = week.reduce((a, d) => a + d.answered, 0);
  const weak = weakSkills(s, now);
  const weakest = weak[0];
  const started = new Set(Object.keys(s.skills));
  const nextNew = SKILLS.filter((k) => !started.has(k.id)).sort((a, b) => a.order - b.order)[0];
  const suggestion = weakest ? SKILL_BY_ID[weakest.skill] : nextNew;
  const suggestionCategory = suggestion ? app.questions.find((q) => q.skills[0] === suggestion.id && !q.variation)?.category : undefined;

  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>{dateKo(now)} · 오늘</Eyebrow>
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.04em] md:text-[34px]">회의에서 바로 쓰는 한 문장씩.</h1>
      </div>

      {!s.profile.onboarded ? (
        <Card className="overflow-hidden p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ef-accent-ink)]">
                <Sparkles className="size-4" /> 시작하기
              </div>
              <p className="ef-ko mt-1.5 text-[15px]">
                15–20분 레벨 테스트로 시작 수준을 정하거나, B1으로 가정하고 바로 시작할 수 있습니다. 과거 실수 7개는 이미 <b>내 실수</b>와 복습 목록에 들어 있습니다(가져온 기록 — 숙련도로 계산하지 않음).
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => nav.go("test")} className="dd-focus inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--foreground)] px-4 text-[14px] font-semibold text-[var(--background)]">
                <ClipboardCheck className="size-4" /> 레벨 테스트
              </button>
              <button onClick={() => app.updateProfile({ onboarded: true })} className="dd-focus h-11 rounded-xl border border-[var(--line)] px-4 text-[14px] font-medium">
                B1로 시작
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Card className="p-5">
          <div className="flex items-center gap-5">
            <ScoreRingTarget answered={answered} target={target} />
            <div className="min-w-0 flex-1">
              <Eyebrow>오늘의 목표</Eyebrow>
              <div className="mt-1 text-[22px] font-semibold tracking-[-.03em]">
                <span className="ef-num">{answered}</span>
                <span className="text-[var(--muted)]"> / {target}문항</span>
              </div>
              <p className="ef-ko mt-0.5 text-[13px] text-[var(--muted)]">
                {answered >= target ? "오늘 목표를 채웠습니다. 더 하면 복습 간격이 더 정확해집니다." : `새 학습 약 70% · 복습 30%로 구성됩니다.`}
              </p>
            </div>
          </div>
          <button
            onClick={() => start()}
            className="dd-focus mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--foreground)] text-[16px] font-semibold text-[var(--background)] transition active:scale-[.99]"
          >
            {answered ? "이어서 학습하기" : "학습 시작하기"} <ArrowRight className="size-4" />
          </button>
        </Card>

        <Card className="flex flex-col p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>복습</Eyebrow>
            <RotateCcw className="size-4 text-[var(--muted)]" />
          </div>
          <div className="mt-1 text-[22px] font-semibold tracking-[-.03em]">
            {due.length ? (
              <>
                <span className="ef-num">{due.length}</span>개 대기 중
              </>
            ) : (
              "대기 없음"
            )}
          </div>
          <p className="ef-ko mt-0.5 text-[13px] text-[var(--muted)]">
            {due.length ? `가장 오래된 항목: ${due[0].label}` : nextDue ? `다음 복습: ${nextDue.label} · ${relTimeKo(nextDue.due, now)}` : "틀린 문장이 생기면 여기에 쌓입니다."}
          </p>
          <button
            disabled={!due.length}
            onClick={() => start({ reviewOnly: true, size: Math.min(15, due.length), title: "복습" })}
            className="dd-focus mt-5 flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] text-[14px] font-semibold disabled:opacity-40 lg:mt-auto"
          >
            복습 시작 <ArrowRight className="size-4" />
          </button>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button onClick={() => nav.go("test")} className="dd-focus text-left">
          <Card className="h-full p-4">
            <Eyebrow>레벨 추정</Eyebrow>
            <div className="mt-1.5 text-[20px] font-semibold tracking-[-.02em]">{lvl.label}</div>
            <p className="ef-ko mt-0.5 text-[12px] text-[var(--muted)]">{lvl.source === "diagnostic" ? `작문 기반 추정 · 신뢰도 ${lvl.confidence === "high" ? "높음" : lvl.confidence === "medium" ? "보통" : "낮음"}` : "레벨 테스트 전 가정값"}</p>
          </Card>
        </button>
        <Card className="p-4">
          <Eyebrow>연속 학습</Eyebrow>
          <div className="mt-1.5 flex items-center gap-1.5 text-[20px] font-semibold">
            <Flame className={cn("size-5", streak ? "text-[var(--ef-warn-fill)]" : "text-[var(--muted)]")} />
            <span className="ef-num">{streak}</span>일
          </div>
          <p className="ef-ko mt-0.5 text-[12px] text-[var(--muted)]">하루 한 문항 이상 풀면 이어집니다.</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-baseline justify-between">
            <Eyebrow>이번 주</Eyebrow>
            <span className="ef-num text-[12px] text-[var(--muted)]">{weekTotal}문항</span>
          </div>
          <div className="mt-2">
            <WeekBars data={week} target={target} />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {suggestion ? (
          <Card className="p-5">
            <Eyebrow>추천 학습</Eyebrow>
            <div className="mt-1.5 text-[17px] font-semibold">{suggestion.nameKo}</div>
            <div className="ef-mono mt-1 text-[13px] text-[var(--ef-accent-ink)]">{suggestion.formula}</div>
            <p className="ef-ko mt-2 text-[13px] text-[var(--muted)]">
              {weakest ? "가장 약한 문법을 먼저 연습합니다." : "커리큘럼의 다음 문법입니다."}
              {suggestionCategory ? ` · ${CATEGORY_LABEL[suggestionCategory]} 상황` : ""}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => nav.practiceSkill(suggestion.id)} className="dd-focus inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--foreground)] px-4 text-[14px] font-semibold text-[var(--background)]">
                이 문법 연습 <ArrowRight className="size-4" />
              </button>
              <button onClick={() => nav.openGuide(suggestion.id)} className="dd-focus inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 text-[14px] font-medium">
                <BookOpen className="size-4" /> 설명 보기
              </button>
            </div>
          </Card>
        ) : null}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>가장 약한 문법</Eyebrow>
            {weakest ? <StatusChip status={weakest.status} /> : null}
          </div>
          {weakest ? (
            <>
              <div className="mt-1.5 text-[17px] font-semibold">{skillName(weakest.skill)}</div>
              <div className="mt-3">
                <MasteryTrack status={weakest.status} mastery={weakest.mastery} />
              </div>
              <p className="ef-ko mt-3 text-[13px] text-[var(--muted)]">
                {weakest.neglected ? "7일 넘게 연습하지 않았습니다. 다음 세션에 자동으로 포함됩니다." : weakest.lastAt ? `마지막 연습 ${relTimeKo(weakest.lastAt, now)}` : "가져온 과거 오류에서 확인된 약점입니다."}
                {weak.length > 1 ? ` · 약점 문법 ${weak.length}개` : ""}
              </p>
            </>
          ) : (
            <p className="ef-ko mt-2 text-[14px] text-[var(--muted)]">아직 약점으로 분류된 문법이 없습니다.</p>
          )}
        </Card>
      </div>

      <WeakGrammarCard />
    </div>
  );
}

function ScoreRingTarget({ answered, target }: { answered: number; target: number }) {
  return <ProgressRing value={(answered / Math.max(1, target)) * 100} label="달성" />;
}
