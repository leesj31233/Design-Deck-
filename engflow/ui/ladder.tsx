"use client";
import * as React from "react";
import { motion } from "motion/react";
import { ArrowRight, TrendingUp } from "lucide-react";
import { buildLadder, ladderRange, ladderSteps } from "../core/ladder";
import { autoDifficulty } from "../core/situations";
import type { Situation } from "../core/types";
import { SITUATION_INFO } from "../content";
import { useApp } from "./store";
import { useNav } from "./app";
import { Card, Eyebrow, cn, useReduced } from "./kit";

const LADDER_SIZE = 8;

/** Starts a short-to-long climb in a scene (or across scenes). */
export function useStartLadder() {
  const app = useApp();
  const nav = useNav();
  return (situation: Situation | "all") => {
    const target = app.state.settings.difficulty?.[situation] ?? app.state.settings.difficulty?.all ?? autoDifficulty(app.state.profile.startLevel);
    const { from, to } = ladderRange(target);
    const items = buildLadder(app.state, app.questions, { situation, from, to, size: LADDER_SIZE, now: app.now() });
    if (!items.length) return false;
    const scene = situation === "all" ? "상황 섞기" : SITUATION_INFO[situation].ko;
    nav.startSession({ id: `ladder-${app.now()}`, title: `짧은 말 → 긴 말 · ${scene}`, kind: "lesson", items, note: `난이도 ${from}에서 ${to}까지 한 계단씩`, ladder: true });
    return true;
  };
}

/** Bars rising like stairs; with scores, each step is coloured by how it went. */
export function Staircase({ steps, scores, className }: { steps: number[]; scores?: (number | undefined)[]; className?: string }) {
  const reduced = useReduced();
  const max = Math.max(...steps, 1);
  return (
    <div className={cn("flex h-14 items-end gap-1", className)} aria-hidden>
      {steps.map((d, i) => {
        const s = scores?.[i];
        const tone = s === undefined ? "bg-[var(--ef-track)]" : s >= 85 ? "bg-[var(--ef-ok-fill)]" : s >= 60 ? "bg-[var(--ef-warn-fill)]" : "bg-[var(--ef-bad-fill)]";
        return (
          <motion.div
            key={i}
            className={cn("relative flex-1 rounded-t-[5px]", tone)}
            initial={reduced ? false : { height: 0 }}
            animate={{ height: `${18 + (82 * d) / max}%` }}
            transition={{ delay: reduced ? 0 : 0.05 * i, type: "spring", stiffness: 260, damping: 24 }}
          >
            <span className="ef-num absolute inset-x-0 -top-4 text-center text-[10px] text-[var(--muted)]">{d}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

/** "Short to long" entry card for a scene. */
export function LadderCard({ situation, compact }: { situation: Situation | "all"; compact?: boolean }) {
  const app = useApp();
  const start = useStartLadder();
  const target = app.state.settings.difficulty?.[situation] ?? app.state.settings.difficulty?.all ?? autoDifficulty(app.state.profile.startLevel);
  const { from, to } = ladderRange(target);
  const steps = ladderSteps(from, to, LADDER_SIZE);
  const scene = situation === "all" ? "여러 상황" : SITUATION_INFO[situation].ko;
  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-[var(--ef-accent-ink)]" />
            <Eyebrow>짧은 말 → 긴 말</Eyebrow>
          </div>
          <div className="mt-1 text-[16px] font-semibold">{compact ? "오늘의 계단 오르기" : `${scene}에서 한 계단씩`}</div>
          <p className="ef-ko mt-1 text-[13px] text-[var(--muted)]">
            "Sounds good." 같은 한마디에서 시작해 이유와 제안을 붙인 긴 설명까지, {scene}의 대화를 난이도 {from}→{to}로 {LADDER_SIZE}번 말합니다.
          </p>
        </div>
        <div className="flex shrink-0 items-end gap-3 sm:w-[260px]">
          <Staircase steps={steps} className="flex-1 pt-4" />
          <button
            onClick={() => start(situation)}
            className="dd-focus inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--foreground)] px-4 text-[14px] font-semibold text-[var(--background)]"
            aria-label={`짧은 말에서 긴 말까지 ${scene} 계단 시작`}
          >
            시작 <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
