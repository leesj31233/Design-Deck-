"use client";
import * as React from "react";
import { motion } from "motion/react";
import { BadgeCheck, Compass, Crown, Flame, Library, MessageSquareText, MessagesSquare, Mountain, PartyPopper, Repeat, Target, Zap, MessageCircle, type LucideIcon } from "lucide-react";
import { badgeStatuses, type BadgeIcon, type BadgeStatus } from "../core/badges";
import { useApp } from "./store";
import { Card, Eyebrow, cn, useReduced } from "./kit";

const ICONS: Record<BadgeIcon, LucideIcon> = {
  perfect: PartyPopper, streak: Flame, collection: Library, roleplay: MessagesSquare, long: Crown, speed: Zap,
  scenes: Compass, hard: Mountain, review: Repeat, goal: Target, approved: BadgeCheck, talk: MessageCircle, freetalk: MessageSquareText,
};

/** Medal colours: none yet, bronze, silver, gold. */
const MEDAL = [
  "bg-[var(--ef-track)] text-[var(--muted)]",
  "bg-gradient-to-br from-[#f0b07a] to-[#b8682f] text-white shadow-[0_2px_8px_rgba(184,104,47,.35)]",
  "bg-gradient-to-br from-[#e4e8ee] to-[#98a0ab] text-white shadow-[0_2px_8px_rgba(120,128,140,.35)]",
  "bg-gradient-to-br from-[#ffe08a] to-[#f2a516] text-white shadow-[0_2px_10px_rgba(242,165,22,.45)]",
];
const TIER_KO = ["", "브론즈", "실버", "골드"];

export function Medal({ icon, tier, size = "md" }: { icon: BadgeIcon; tier: number; size?: "sm" | "md" }) {
  const Icon = ICONS[icon];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full", size === "sm" ? "size-8" : "size-11", MEDAL[Math.min(3, tier)])}>
      <Icon className={size === "sm" ? "size-4" : "size-5"} />
    </span>
  );
}

function BadgeTile({ s, i }: { s: BadgeStatus; i: number }) {
  const reduced = useReduced();
  const goal = s.next ?? s.family.goals[s.family.goals.length - 1];
  const prevGoal = s.tier > 0 ? s.family.goals[s.tier - 1] : 0;
  const pct = s.next === null ? 100 : Math.max(0, Math.min(100, ((s.value - prevGoal) / Math.max(1, goal - prevGoal)) * 100));
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduced ? 0 : 0.03 * i, duration: 0.2 }}
      className={cn("rounded-2xl border p-3", s.tier ? "border-[var(--line)] bg-[var(--surface)]" : "border-dashed border-[var(--line)]")}
    >
      <div className="flex items-center gap-2.5">
        <Medal icon={s.family.icon} tier={s.tier} />
        <div className="min-w-0">
          <div className={cn("text-[13px] font-semibold leading-[1.25] [word-break:keep-all]", !s.tier && "text-[var(--muted)]")}>{s.titleKo}</div>
          <div className="mt-0.5 flex items-center gap-1" aria-label={s.tier ? `${TIER_KO[s.tier]} 달성` : "아직 달성 전"}>
            {s.family.goals.map((_, t) => (
              <span key={t} className={cn("size-1.5 rounded-full", t < s.tier ? (t === 2 ? "bg-[#f2a516]" : t === 1 ? "bg-[#98a0ab]" : "bg-[#b8682f]") : "bg-[var(--ef-track)]")} />
            ))}
            {s.tier ? <span className="ml-1 text-[10px] font-medium text-[var(--muted)]">{TIER_KO[s.tier]}</span> : null}
          </div>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--ef-track)]">
        <div className={cn("h-full rounded-full", s.next === null ? "bg-[#f2a516]" : "bg-[var(--accent)]")} style={{ width: `${pct}%` }} />
      </div>
      <div className="ef-ko mt-1.5 text-[11px] leading-4 text-[var(--muted)]">
        {s.next === null ? (
          <span className="font-semibold text-[#c27c00] dark:text-[#ffbf47]">모두 달성! · {s.value}</span>
        ) : (
          <>
            <span className="ef-num font-semibold text-[var(--foreground)]">{s.value}</span>/<span className="ef-num">{goal}</span> · {s.family.unitKo}
          </>
        )}
      </div>
    </motion.li>
  );
}

/** Every badge family with its medal, tier and progress to the next tier. */
export function BadgeShelf() {
  const app = useApp();
  const statuses = React.useMemo(() => badgeStatuses(app.state, app.questions, app.qIndex), [app.state, app.questions, app.qIndex]);
  const earned = statuses.reduce((n, s) => n + s.tier, 0);
  const total = statuses.reduce((n, s) => n + s.family.goals.length, 0);
  // Earned families first (highest tier first), then the closest to their first tier.
  const sorted = [...statuses].sort((a, b) => b.tier - a.tier || b.value / (b.next ?? 1) - a.value / (a.next ?? 1));
  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>배지</Eyebrow>
        <span className="ef-num text-[12px] text-[var(--muted)]">획득 {earned}/{total}</span>
      </div>
      <p className="ef-ko mt-1 text-[12px] text-[var(--muted)]">100점, 연속 학습, 롤플레이 완주, 번개 대답… 연습할수록 브론즈 → 실버 → 골드로 올라갑니다.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label="배지 목록">
        {sorted.map((s, i) => (
          <BadgeTile key={s.family.id} s={s} i={i} />
        ))}
      </ul>
    </Card>
  );
}

/** "New badge" pills for the session summary. */
export function NewBadgeList({ items }: { items: { status: BadgeStatus; tier: number; titleKo: string }[] }) {
  const reduced = useReduced();
  if (!items.length) return null;
  return (
    <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="새로 받은 배지">
      {items.map((b, i) => (
        <motion.li
          key={b.status.family.id}
          initial={reduced ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: reduced ? 0 : 0.35 + 0.12 * i, type: "spring", stiffness: 420, damping: 18 }}
          className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] py-1 pl-1 pr-3 shadow-sm"
        >
          <Medal icon={b.status.family.icon} tier={b.tier} size="sm" />
          <span className="text-[12px] font-semibold">
            새 배지 · {b.titleKo}
            <span className="ml-1 font-normal text-[var(--muted)]">{TIER_KO[b.tier]}</span>
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
