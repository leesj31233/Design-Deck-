"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Flame, PartyPopper, ShieldCheck, Sparkles, TrendingUp, Trophy } from "lucide-react";
import type { Celebration } from "../core/celebration";
import { cn, useReduced } from "./kit";

/* ───────────── Particle bursts (canvas, no dependencies) ───────────── */

const COLORS = ["#0a84ff", "#30b158", "#f2a516", "#ff453a", "#8e4ec6", "#0aa5a5", "#ff9f0a"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  shape: 0 | 1 | 2; // rectangle, circle, star
  life: number;
}

function drawStar(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * A one-shot burst over the page. "confetti" rains from the top and bursts
 * from the origin; "sparkle" is a small ring of stars around the origin.
 * Respects reduced motion (renders nothing) and cleans up after itself.
 */
export function Burst({ kind, origin, onDone }: { kind: "confetti" | "sparkle"; origin?: { x: number; y: number } | null; onDone?: () => void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const reduced = useReduced();
  React.useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const ox = origin?.x ?? W / 2;
    const oy = origin?.y ?? H * 0.3;
    const parts: Particle[] = [];
    const add = (p: Partial<Particle> & Pick<Particle, "x" | "y" | "vx" | "vy">) =>
      parts.push({ size: 6 + Math.random() * 6, color: COLORS[Math.floor(Math.random() * COLORS.length)], rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, shape: 0, life: 1, ...p });
    if (kind === "confetti") {
      for (let i = 0; i < 90; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
        const v = 7 + Math.random() * 7;
        add({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, shape: (i % 3) as 0 | 1 | 2 });
      }
      for (let i = 0; i < 50; i++) add({ x: Math.random() * W, y: -20 - Math.random() * 120, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3 });
    } else {
      for (let i = 0; i < 18; i++) {
        const a = (Math.PI * 2 * i) / 18;
        const v = 3 + Math.random() * 2.5;
        add({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, shape: 2, size: 7 + Math.random() * 5 });
      }
    }
    const started = performance.now();
    const duration = kind === "confetti" ? 2200 : 1100;
    let raf = 0;
    const tick = (t: number) => {
      const k = (t - started) / duration;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += kind === "confetti" ? 0.22 : 0.05;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - k);
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
          ctx.fill();
        } else drawStar(ctx, p.size / 2);
        ctx.restore();
      }
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        ctx.clearRect(0, 0, W, H);
        onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, reduced]);
  if (reduced || typeof document === "undefined") return null;
  return createPortal(<canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />, document.body);
}

/* ───────────── Sounds (synthesized; off unless enabled in Settings) ───────────── */

let audio: AudioContext | null = null;

export function playChime(kind: "perfect" | "good" | "streak"): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio = audio ?? new Ctx();
    const notes = kind === "perfect" ? [523.25, 659.25, 783.99, 1046.5] : kind === "streak" ? [587.33, 880] : [659.25, 880];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = audio!.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(audio!.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {
    /* audio unavailable */
  }
}

/* ───────────── Banner ───────────── */

const ICONS = { perfect: PartyPopper, streak: Flame, "weak-cleared": ShieldCheck, improved: TrendingUp, comeback: Trophy, great: Sparkles } as const;
const TONES = {
  perfect: "from-[#0a84ff]/15 via-[#30b158]/12 to-[#f2a516]/15 text-[var(--foreground)]",
  streak: "from-[#ff9f0a]/18 to-[#ff453a]/12 text-[var(--foreground)]",
  "weak-cleared": "from-[#30b158]/16 to-[#0aa5a5]/10 text-[var(--foreground)]",
  improved: "from-[#0a84ff]/14 to-[#30b158]/10 text-[var(--foreground)]",
  comeback: "from-[#8e4ec6]/14 to-[#0a84ff]/10 text-[var(--foreground)]",
  great: "from-[var(--ef-ok-soft)] to-transparent text-[var(--foreground)]",
} as const;

/** The celebration line above the verdict; fires its burst (and chime) once. */
export function CelebrationBanner({ c, effects, sound }: { c: Celebration; effects: boolean; sound: boolean }) {
  const reduced = useReduced();
  const ref = React.useRef<HTMLDivElement>(null);
  const [burst, setBurst] = React.useState<{ x: number; y: number } | null>(null);
  const Icon = ICONS[c.kind];
  React.useEffect(() => {
    if (c.burst !== "none" && effects) {
      const r = ref.current?.getBoundingClientRect();
      setBurst(r ? { x: r.left + 28, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight * 0.3 });
    }
    if (sound) playChime(c.kind === "perfect" ? "perfect" : c.kind === "streak" ? "streak" : "good");
    if (c.kind === "perfect") navigator.vibrate?.(30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <motion.div
        ref={ref}
        role="status"
        initial={reduced ? false : { opacity: 0, y: -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
        className={cn("flex items-center gap-3 rounded-2xl bg-gradient-to-r px-4 py-3", TONES[c.kind])}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface-strong)] shadow-sm" style={{ animation: reduced ? undefined : "ef-pop .5s ease" }}>
          <Icon className={cn("size-5", c.kind === "streak" ? "text-[#ff6b00]" : c.kind === "perfect" ? "text-[var(--ef-accent-ink)]" : "text-[var(--ef-ok)]")} />
        </span>
        <div className="min-w-0">
          <div className="text-[16px] font-semibold tracking-[-.01em]">{c.titleKo}</div>
          {c.detailKo ? <div className="ef-ko text-[13px] text-[var(--ef-ink-2)]">{c.detailKo}</div> : null}
        </div>
      </motion.div>
      {burst && c.burst !== "none" ? <Burst kind={c.burst} origin={burst} onDone={() => setBurst(null)} /> : null}
    </>
  );
}

/** "🔥 3" chip in the session header while a streak runs. */
export function StreakChip({ n }: { n: number }) {
  const reduced = useReduced();
  if (n < 2) return null;
  return (
    <motion.span
      key={n}
      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
      className="ef-num inline-flex items-center gap-0.5 rounded-full bg-[#ff9f0a]/15 px-2 py-0.5 text-[11px] font-semibold text-[#c25e00] dark:text-[#ffb340]"
      aria-label={`${n}연속 정답`}
    >
      <Flame className="size-3" /> {n}
    </motion.span>
  );
}
