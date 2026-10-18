"use client";
import * as React from "react";
import { ArrowRight, CalendarClock, History, RotateCcw } from "lucide-react";
import { DAY_MS } from "../../core/fsrs";
import { isOverdue, itemRetrievability, GRADE_LABEL_KO, LADDER_DAYS } from "../../core/scheduler";
import { dueItems } from "../../core/session";
import type { ReviewItem } from "../../core/types";
import { skillName } from "../../content";
import { useApp } from "../store";
import { useNav } from "../app";
import { useStartLesson } from "./today";
import { Button, Card, EmptyState, Eyebrow, NumberTicker, Tag, cn, relTimeKo } from "../kit";

function ItemRow({ item, now }: { item: ReviewItem; now: number }) {
  const nav = useNav();
  const r = itemRetrievability(item, now);
  const last = item.history[item.history.length - 1];
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[14px] font-semibold">{item.label}</span>
            <Tag tone={item.origin === "imported" ? "accent" : "neutral"} className={cn("px-1.5 text-[10px]", item.origin !== "imported" && "text-[var(--ef-ink-2)]")}>
              {item.origin === "imported" ? "가져온 기록" : item.origin === "error" ? "학습 중 오류" : "학습"}
            </Tag>
            {isOverdue(item, now) ? <Tag tone="bad" className="px-1.5 text-[10px]">밀림</Tag> : null}
          </div>
          {item.originalAnswer ? (
            <p className="ef-en mt-1 truncate text-[13px]">
              <span className="ef-del">{item.originalAnswer}</span>
              {item.correctedAnswer ? <span className="text-[var(--muted)]"> → </span> : null}
              {item.correctedAnswer ? <span className="text-[var(--ef-ok)]">{item.correctedAnswer}</span> : null}
            </p>
          ) : null}
          <p className="ef-ko mt-1 text-[12px] text-[var(--muted)]">{item.scheduleNote}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn("ef-num text-[13px] font-semibold", item.due <= now ? "text-[var(--ef-bad)]" : "")}>{item.due <= now ? "지금" : relTimeKo(item.due, now)}</div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">
            {r !== null ? `기억 확률 ${Math.round(r * 100)}%` : "첫 복습 전"}
          </div>
          {last ? <div className="mt-0.5 text-[11px] text-[var(--muted)]">최근: {GRADE_LABEL_KO[last.grade]}</div> : null}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => nav.openGuide(item.skill)} className="-ml-2 mt-1 h-7 px-2 text-[12px] font-normal text-[var(--ef-accent-ink)]">
        {skillName(item.skill)} 설명
      </Button>
    </li>
  );
}

export function ReviewScreen() {
  const app = useApp();
  const start = useStartLesson();
  const now = app.now();
  const s = app.state;
  const due = dueItems(s, now);
  const overdue = due.filter((i) => isOverdue(i, now));
  const all = Object.values(s.items).filter((i) => !i.suspended);
  const upcoming = all.filter((i) => i.due > now).sort((a, b) => a.due - b.due);
  const week = upcoming.filter((i) => i.due - now < 7 * DAY_MS);
  const reviewedToday = Object.values(s.daily).length ? s.daily[new Date(now).toISOString().slice(0, 10)]?.reviews ?? 0 : 0;
  const graduated = all.filter((i) => i.successes >= 2).length;

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>복습</Eyebrow>
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.04em]">잊기 전에, 다른 문장으로.</h1>
        <p className="ef-ko mt-1 max-w-[62ch] text-[14px] text-[var(--muted)]">
          같은 문장을 외우지 않도록 복습할 때마다 같은 문법을 새 문장으로 묻습니다: 짧은 구문 → 새 상황 → 긴 문장 → 회의 응답.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["지금 복습", due.length, due.length ? "text-[var(--ef-bad)]" : ""],
          ["밀린 복습", overdue.length, overdue.length ? "text-[var(--ef-warn)]" : ""],
          ["7일 안에 예정", week.length, ""],
          ["적응형 단계 진입", graduated, ""],
        ].map(([label, n, cls]) => (
          <Card key={label as string} className="p-4">
            <div className="text-[12px] text-[var(--muted)]">{label}</div>
            <div className={cn("ef-num mt-1 text-[24px] font-semibold", cls as string)}><NumberTicker value={n as number} /></div>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center md:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <RotateCcw className="size-4" /> {due.length ? `복습 ${Math.min(15, due.length)}문항 시작` : "지금 복습할 항목이 없습니다"}
          </div>
          <p className="ef-ko mt-1 text-[13px] text-[var(--muted)]">
            {s.settings.scheduler === "adaptive"
              ? `처음에는 ${LADDER_DAYS.slice(1).join(" → ")}일 간격으로, 두 번 성공하면 FSRS가 기억 상태에 맞춰 간격을 정합니다.`
              : `고정 간격: ${LADDER_DAYS.slice(1).join(" → ")}일.`}{" "}
            힌트·응답 시간·반복 오류가 간격에 반영됩니다. {reviewedToday ? `오늘 ${reviewedToday}개 복습함.` : ""}
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          disabled={!due.length}
          onClick={() => start({ reviewOnly: true, size: Math.min(15, due.length), title: "복습" })}
          className="px-6 text-[15px] font-semibold"
        >
          시작 <ArrowRight className="size-4" />
        </Button>
      </Card>

      {due.length ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
            <History className="size-4" /> 지금 복습할 항목
          </h2>
          <Card>
            <ul className="divide-y divide-[var(--line)]">
              {due.map((i) => (
                <ItemRow key={i.id} item={i} now={now} />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
          <CalendarClock className="size-4" /> 예정된 복습
        </h2>
        {upcoming.length ? (
          <Card>
            <ul className="divide-y divide-[var(--line)]">
              {upcoming.slice(0, 30).map((i) => (
                <ItemRow key={i.id} item={i} now={now} />
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState className="ef-ko min-h-40" icon={<CalendarClock className="size-5" />} title="예정된 복습이 없습니다." />
        )}
      </section>
    </div>
  );
}
