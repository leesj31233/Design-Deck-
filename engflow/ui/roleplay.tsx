"use client";
import * as React from "react";
import { motion } from "motion/react";
import { ArrowRight, Check, MessagesSquare, Play, Square } from "lucide-react";
import { listScenarios, recommendScenario, scenarioItems, type ScenarioInfo } from "../core/roleplay";
import { sceneDifficulty } from "../core/situations";
import type { Evaluation, Question, Situation } from "../core/types";
import { SITUATION_INFO } from "../content";
import { useApp } from "./store";
import { useNav } from "./app";
import { Button, Card, Eyebrow, Pressable, Tag, cn, useReduced } from "./kit";
import { LEARNER_SPEAKER } from "./practice/parts";
import { canSpeak, speakSequence, stopSpeaking } from "./speech";

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
          <Pressable key={s.id} type="button" onClick={() => start(s)} className="rounded-[var(--radius)]" aria-label={`롤플레이 ${s.titleKo} 시작`}>
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
          </Pressable>
        ))}
      </div>
    </section>
  );
}

/** One finished turn of a role-play: the question and the learner's final answer to it. */
export interface PlayedTurn {
  question: Question;
  evaluation: Evaluation;
}

/**
 * The whole conversation after a role-play: the partner's lines, what the
 * learner actually said (with the score), and the natural version under any
 * line that was not perfect. "전체 듣기" reads it all aloud, using the natural
 * version for the learner's lines.
 */
export function RoleplayReplay({ turns, slow }: { turns: PlayedTurn[]; slow?: boolean }) {
  const reduced = useReduced();
  const [playing, setPlaying] = React.useState<number | null>(null);
  const [supported, setSupported] = React.useState(false);
  React.useEffect(() => setSupported(canSpeak()), []);
  React.useEffect(() => () => stopSpeaking(), []);
  // Last answer per step, in order.
  const byStep = new Map<number, PlayedTurn>();
  for (const t of turns) if (t.question.scenario) byStep.set(t.question.scenario.step, t);
  const steps = [...byStep.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  if (!steps.length) return null;
  const lines: { who: "them" | "me"; speaker: string; en: string; ko?: string; turn?: PlayedTurn }[] = [];
  for (const t of steps) {
    const d = t.question.dialogue ?? [];
    const lastMine = d.map((x) => x.speaker).lastIndexOf(LEARNER_SPEAKER);
    for (const x of d.slice(lastMine + 1)) lines.push({ who: "them", speaker: x.speaker, en: x.en, ko: x.ko });
    lines.push({ who: "me", speaker: LEARNER_SPEAKER, en: t.evaluation.answer, turn: t });
  }
  const audio = lines.map((l) => (l.who === "me" && l.turn && l.turn.evaluation.scores.overall < 100 ? l.turn.evaluation.recommended || l.en : l.en));
  const clean = steps.filter((t) => t.evaluation.scores.overall >= 85).length;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Eyebrow>대화 다시 보기</Eyebrow>
          <p className="ef-ko mt-0.5 text-[13px] text-[var(--muted)]">
            {steps.length}번 주고받음 · 자연스럽게 말한 턴 {clean}/{steps.length}
          </p>
        </div>
        {supported ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (playing !== null) {
                stopSpeaking();
                setPlaying(null);
                return;
              }
              setPlaying(0);
              speakSequence(audio, { slow, onLine: setPlaying, onEnd: () => setPlaying(null) });
            }}
            className={cn(
              "shrink-0 gap-1.5 px-3 text-[13px] font-semibold",
              playing !== null && "border-transparent bg-[var(--ef-accent-soft)] text-[var(--ef-accent-ink)] hover:bg-[var(--ef-accent-soft)] dark:hover:bg-[var(--ef-accent-soft)]",
            )}
            aria-pressed={playing !== null}
          >
            {playing !== null ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
            {playing !== null ? "멈추기" : "전체 듣기"}
          </Button>
        ) : null}
      </div>
      <ol className="mt-3 space-y-2.5" aria-label="대화 기록">
        {lines.map((l, i) => {
          const me = l.who === "me";
          const ev = l.turn?.evaluation;
          const natural = ev && ev.scores.overall < 100 && ev.recommended && ev.recommended.trim() !== ev.answer.trim() ? ev.recommended : null;
          return (
            <motion.li
              key={i}
              className={cn("flex items-end gap-2", me && "flex-row-reverse")}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.05 * i, duration: 0.2 }}
            >
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                style={{ background: me ? "var(--ef-accent-ink)" : "#8e8e93" }}
                aria-hidden
              >
                {me ? "나" : l.speaker.replace(/^(Mr|Ms|Mrs|Dr)\.\s*/, "").charAt(0)}
              </span>
              <div
                className={cn(
                  "min-w-0 max-w-[85%] rounded-[18px] px-3.5 py-2 transition-shadow",
                  me ? "rounded-br-[6px] bg-[var(--ef-accent-soft)]" : "rounded-bl-[6px] border border-[var(--line)] bg-[var(--surface-strong)]",
                  playing === i && "ring-2 ring-[var(--ef-accent-ink)]/50",
                )}
              >
                <div className={cn("flex items-center gap-1.5 text-[11px] font-semibold", me ? "justify-end text-[var(--ef-accent-ink)]" : "text-[var(--muted)]")}>
                  {me ? "나" : l.speaker}
                  {ev ? (
                    <Tag tone={ev.scores.overall >= 85 ? "ok" : "warn"} className="ef-num px-1.5 py-px text-[10px]">
                      {ev.scores.overall}
                    </Tag>
                  ) : null}
                </div>
                <p className={cn("ef-en text-[15px] leading-snug", me && "text-right")}>{l.en}</p>
                {natural ? (
                  <p className="ef-en mt-1 border-t border-[var(--ef-accent-ink)]/15 pt-1 text-right text-[13px] text-[var(--ef-ink-2)]">
                    <span className="ef-ko mr-1 text-[11px] font-semibold text-[var(--ef-accent-ink)]">자연스럽게</span>
                    {natural}
                  </p>
                ) : null}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Today: one recommended role-play. */
export function RoleplayShortcut() {
  const app = useApp();
  const start = useStartScenario();
  const list = listScenarios(app.questions, app.state);
  const target = sceneDifficulty(app.state.settings.difficulty, "all", app.state.profile.startLevel);
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
        <Button variant="primary" onClick={() => start(s)} className="h-11 gap-1.5 text-[14px] font-semibold">
          대화 시작 <ArrowRight className="size-4" />
        </Button>
      </div>
    </Card>
  );
}
