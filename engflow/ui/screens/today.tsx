"use client";
import * as React from "react";
import { ArrowRight, BookOpen, ClipboardCheck, Flame, RotateCcw, Sparkles } from "lucide-react";
import { buildSession, dueItems, weakSkills } from "../../core/session";
import { levelEstimate, streakDays, weekSeries } from "../../core/store";
import { localDayKey } from "../../core/mastery";
import { SKILLS, SKILL_BY_ID, skillName } from "../../content";
import { useApp } from "../store";
import { useNav } from "../app";
import { Button, Card, Eyebrow, MasteryTrack, NumberTicker, Pressable, ProgressRing, Spotlight, StatusChip, cn, dateKo, relTimeKo } from "../kit";
import { WeekBars } from "../charts";
import { CATEGORY_LABEL } from "../practice/session";
import { ExpressionCollection } from "../expressions";
import { RoleplayShortcut } from "../roleplay";
import { LadderCard, MeetingCard, SpeedCard } from "../ladder";
import { TalkCard } from "../freetalk";
import { situationOf } from "../../core/situations";
import { SITUATIONS } from "../../core/types";
import { SITUATION_INFO } from "../../content";

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
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.04em] md:text-[34px]">회의와 일상에서 바로 쓰는 한마디씩.</h1>
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
              <Button variant="primary" onClick={() => nav.go("test")} className="h-11 gap-1.5 text-[14px] font-semibold">
                <ClipboardCheck className="size-4" /> 레벨 테스트
              </Button>
              <Button variant="secondary" onClick={() => app.updateProfile({ onboarded: true })} className="h-11 text-[14px]">
                B1로 시작
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Card className="overflow-hidden p-0">
          <Spotlight className="h-full p-5">
          <div className="flex items-center gap-5">
            <ScoreRingTarget answered={answered} target={target} />
            <div className="min-w-0 flex-1">
              <Eyebrow>오늘의 목표</Eyebrow>
              <div className="mt-1 text-[22px] font-semibold tracking-[-.03em]">
                <NumberTicker value={answered} className="ef-num" />
                <span className="text-[var(--muted)]"> / {target}문항</span>
              </div>
              <p className="ef-ko mt-0.5 text-[13px] text-[var(--muted)]">
                {answered >= target ? "오늘 목표를 채웠습니다. 더 하면 복습 간격이 더 정확해집니다." : `새 학습 약 70% · 복습 30%로 구성됩니다.`}
              </p>
            </div>
          </div>
          <Button variant="primary" size="lg" onClick={() => start()} className="mt-5 h-[52px] w-full text-[16px] font-semibold">
            {answered ? "이어서 학습하기" : "학습 시작하기"} <ArrowRight className="size-4" />
          </Button>
          </Spotlight>
        </Card>

        <Card className="flex flex-col p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>복습</Eyebrow>
            <RotateCcw className="size-4 text-[var(--muted)]" />
          </div>
          <div className="mt-1 text-[22px] font-semibold tracking-[-.03em]">
            {due.length ? (
              <>
                <NumberTicker value={due.length} className="ef-num" />개 대기 중
              </>
            ) : (
              "대기 없음"
            )}
          </div>
          <p className="ef-ko mt-0.5 text-[13px] text-[var(--muted)]">
            {due.length ? `가장 오래된 항목: ${due[0].label}` : nextDue ? `다음 복습: ${nextDue.label} · ${relTimeKo(nextDue.due, now)}` : "틀린 문장이 생기면 여기에 쌓입니다."}
          </p>
          <Button
            variant="secondary"
            disabled={!due.length}
            onClick={() => start({ reviewOnly: true, size: Math.min(15, due.length), title: "복습" })}
            className="mt-5 h-11 text-[14px] font-semibold lg:mt-auto"
          >
            복습 시작 <ArrowRight className="size-4" />
          </Button>
        </Card>
      </div>

      {/* Phones: one compact row; wider screens: three cards with the week chart. */}
      <Card className="grid grid-cols-3 divide-x divide-[var(--line)] p-0 sm:hidden">
        <Pressable lift={0} onClick={() => nav.go("test")} className="rounded-l-[var(--radius)] px-3 py-3">
          <div className="text-[11px] text-[var(--muted)]">레벨</div>
          <div className="mt-0.5 truncate text-[16px] font-semibold">{lvl.label}</div>
        </Pressable>
        <div className="px-3 py-3">
          <div className="text-[11px] text-[var(--muted)]">연속 학습</div>
          <div className="mt-0.5 flex items-center gap-1 text-[16px] font-semibold">
            <Flame className={cn("size-4", streak ? "text-[var(--ef-warn-fill)]" : "text-[var(--muted)]")} />
            <NumberTicker value={streak} className="ef-num" />일
          </div>
        </div>
        <div className="px-3 py-3">
          <div className="text-[11px] text-[var(--muted)]">이번 주</div>
          <div className="ef-num mt-0.5 text-[16px] font-semibold"><NumberTicker value={weekTotal} />문항</div>
        </div>
      </Card>
      <div className="hidden gap-3 sm:grid sm:grid-cols-3">
        <Pressable onClick={() => nav.go("test")} className="rounded-[var(--radius)]">
          <Card className="h-full p-4">
            <Eyebrow>레벨 추정</Eyebrow>
            <div className="mt-1.5 text-[20px] font-semibold tracking-[-.02em]">{lvl.label}</div>
            <p className="ef-ko mt-0.5 text-[12px] text-[var(--muted)]">{lvl.source === "diagnostic" ? `작문 기반 추정 · 신뢰도 ${lvl.confidence === "high" ? "높음" : lvl.confidence === "medium" ? "보통" : "낮음"}` : "레벨 테스트 전 가정값"}</p>
          </Card>
        </Pressable>
        <Card className="p-4">
          <Eyebrow>연속 학습</Eyebrow>
          <div className="mt-1.5 flex items-center gap-1.5 text-[20px] font-semibold">
            <Flame className={cn("size-5", streak ? "text-[var(--ef-warn-fill)]" : "text-[var(--muted)]")} />
            <NumberTicker value={streak} className="ef-num" />일
          </div>
          <p className="ef-ko mt-0.5 text-[12px] text-[var(--muted)]">하루 한 문항 이상 풀면 이어집니다.</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-baseline justify-between">
            <Eyebrow>이번 주</Eyebrow>
            <span className="ef-num text-[12px] text-[var(--muted)]"><NumberTicker value={weekTotal} />문항</span>
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
            {weakest && weakest.skill === suggestion.id ? (
              <div className="mt-3">
                <MasteryTrack status={weakest.status} mastery={weakest.mastery} />
              </div>
            ) : null}
            <p className="ef-ko mt-2 text-[13px] text-[var(--muted)]">
              {weakest ? "가장 약한 문법을 먼저 연습합니다." : "커리큘럼의 다음 문법입니다."}
              {suggestionCategory ? ` · ${CATEGORY_LABEL[suggestionCategory]} 상황` : ""}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={() => nav.practiceSkill(suggestion.id)} className="h-11 gap-1.5 text-[14px] font-semibold">
                이 문법 연습 <ArrowRight className="size-4" />
              </Button>
              <Button variant="secondary" onClick={() => nav.openGuide(suggestion.id)} className="h-11 gap-1.5 text-[14px]">
                <BookOpen className="size-4" /> 설명 보기
              </Button>
            </div>
          </Card>
        ) : null}
        <Card className={cn("p-5", weakest && suggestion && weakest.skill === suggestion.id && "hidden lg:block")}>
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

      <MeetingCard />
      <RoleplayShortcut />
      <LadderCard situation="all" compact />
      <SpeedCard />
      <TalkCard compact />
      <SceneShortcuts />
      <ExpressionCollection limit={4} />
    </div>
  );
}

function ScoreRingTarget({ answered, target }: { answered: number; target: number }) {
  return <ProgressRing value={(answered / Math.max(1, target)) * 100} label="달성" />;
}

/** One tap into a scene at the learner's saved difficulty for it. */
function SceneShortcuts() {
  const app = useApp();
  const start = useStartLesson();
  const bank = app.questions.filter((q) => !q.variation);
  return (
    <Card className="p-5">
      <Eyebrow>상황별로 말해 보기</Eyebrow>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SITUATIONS.map((sc) => {
          const d = app.state.settings.difficulty?.[sc];
          const n = bank.filter((q) => situationOf(q) === sc).length;
          return (
            <Pressable
              key={sc}
              onClick={() => start({ size: 6, situation: sc, difficulty: d, title: `${SITUATION_INFO[sc].ko}${d ? ` · 난이도 ${d}` : ""}` })}
              disabled={!n}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2.5 hover:bg-black/[.03] disabled:opacity-40 dark:hover:bg-white/[.05]"
            >
              <div className="text-[14px] font-semibold">{SITUATION_INFO[sc].ko}</div>
              <div className="ef-num mt-0.5 text-[11px] text-[var(--muted)]">{d ? `난이도 ${d}` : "난이도 자동"} · {n}문항</div>
            </Pressable>
          );
        })}
      </div>
    </Card>
  );
}
