"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { CalendarCheck, Crown, Flame, Library, Medal, PartyPopper, Rocket, ShieldCheck, Sparkles, Target, TrendingUp, Trophy, Zap } from "lucide-react";
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

/* Fireworks: rockets rise from the bottom and burst into rings of sparks. */

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  decay: number;
  twinkle: number; // 0 = steady, otherwise a phase for flickering
}

interface Shell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x: number;
  y: number;
  launchAt: number;
  rise: number;
  colors: [string, string];
  exploded: boolean;
}

const SHELL_COLORS: [string, string][] = [
  ["#ff453a", "#ffd60a"], ["#0a84ff", "#64d2ff"], ["#30d158", "#ffd60a"], ["#bf5af2", "#ff9f0a"], ["#ff9f0a", "#ff375f"], ["#64d2ff", "#30d158"],
];

/**
 * Runs fireworks on a canvas context; returns a cancel function. The first
 * rocket bursts just above the origin (the celebration banner), the others
 * across the upper part of the screen, about a quarter second apart.
 */
function fireworks(ctx: CanvasRenderingContext2D, W: number, H: number, ox: number, oy: number, shells: number, onEnd: () => void): () => void {
  const scale = Math.max(0.8, Math.min(1.5, Math.min(W, H) / 600));
  const list: Shell[] = Array.from({ length: shells }, (_, i) => {
    const x1 = i === 0 ? Math.min(W * 0.8, Math.max(W * 0.2, ox + 60)) : W * (0.12 + Math.random() * 0.76);
    const y1 = i === 0 ? Math.max(H * 0.14, Math.min(H * 0.6, oy - 90)) : H * (0.12 + Math.random() * 0.34);
    const x0 = x1 + (Math.random() - 0.5) * 60;
    return { x0, y0: H + 12, x1, y1, x: x0, y: H + 12, launchAt: i * 260 + Math.random() * 60, rise: 420 + Math.random() * 140, colors: SHELL_COLORS[(i + Math.floor(Math.random() * 6)) % SHELL_COLORS.length], exploded: false };
  });
  const sparks: Spark[] = [];
  const flashes: { x: number; y: number; life: number; color: string }[] = [];
  const started = performance.now();
  let raf = 0;
  const burst = (sh: Shell) => {
    const n = 64 + Math.floor(Math.random() * 20);
    for (let k = 0; k < n; k++) {
      const a = (Math.PI * 2 * k) / n + (Math.random() - 0.5) * 0.1;
      const v = (4.2 + Math.random() * 2.6) * scale;
      sparks.push({ x: sh.x, y: sh.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: sh.colors[k % 3 === 0 ? 1 : 0], life: 1, decay: 0.0105 + Math.random() * 0.006, twinkle: 0 });
    }
    // An inner ring of glitter that flickers as it falls.
    for (let k = 0; k < 22; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = (1 + Math.random() * 2) * scale;
      sparks.push({ x: sh.x, y: sh.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: "#fff4b0", life: 1, decay: 0.008 + Math.random() * 0.005, twinkle: 1 + Math.random() * 6 });
    }
    flashes.push({ x: sh.x, y: sh.y, life: 1, color: sh.colors[1] });
  };
  const ease = (k: number) => 1 - Math.pow(1 - k, 3);
  const tick = (t: number) => {
    const el = t - started;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    for (const sh of list) {
      if (sh.exploded || el < sh.launchAt) continue;
      const k = Math.min(1, (el - sh.launchAt) / sh.rise);
      const px = sh.x;
      const py = sh.y;
      sh.x = sh.x0 + (sh.x1 - sh.x0) * ease(k);
      sh.y = sh.y0 + (sh.y1 - sh.y0) * ease(k);
      // Rising trail with a bright head.
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = sh.colors[1];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py + 14);
      ctx.lineTo(sh.x, sh.y);
      ctx.stroke();
      ctx.fillStyle = "#fffbe6";
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      if (k >= 1) {
        sh.exploded = true;
        burst(sh);
      }
    }
    for (const f of flashes) {
      if (f.life <= 0) continue;
      ctx.globalAlpha = f.life * 0.5;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 30 * scale * (1.3 - f.life), 0, Math.PI * 2);
      ctx.fill();
      f.life -= 0.1;
    }
    for (const p of sparks) {
      if (p.life <= 0) continue;
      p.vx *= 0.968;
      p.vy = p.vy * 0.968 + 0.06;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      const alpha = Math.max(0, p.life) * (p.twinkle ? 0.5 + 0.5 * Math.sin(el / 40 + p.twinkle) : 1);
      ctx.globalAlpha = alpha;
      if (p.twinkle) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * 3.2, p.y - p.vy * 3.2);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    const live = list.some((sh) => !sh.exploded) || sparks.some((p) => p.life > 0);
    if (live && el < 4200) raf = requestAnimationFrame(tick);
    else {
      ctx.clearRect(0, 0, W, H);
      onEnd();
    }
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/**
 * A one-shot effect over the page. "fireworks" launches rockets that burst
 * into rings of sparks (a 100-point answer, a perfect session); "confetti"
 * rains from the top and bursts from the origin; "sparkle" is a small ring
 * of stars around the origin. Respects reduced motion (renders nothing) and
 * cleans up after itself.
 */
export function Burst({ kind, origin, onDone, shells = 4 }: { kind: "fireworks" | "confetti" | "sparkle"; origin?: { x: number; y: number } | null; onDone?: () => void; shells?: number }) {
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
    if (kind === "fireworks") return fireworks(ctx, W, H, ox, origin?.y ?? H * 0.45, shells, () => onDone?.());
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

/** Soft "pop … crackle" for each firework (noise bursts), timed roughly with the explosions. */
export function playPops(count: number): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio = audio ?? new Ctx();
    const a = audio;
    const len = Math.floor(a.sampleRate * 0.25);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    for (let i = 0; i < count; i++) {
      const src = a.createBufferSource();
      const filter = a.createBiquadFilter();
      const gain = a.createGain();
      src.buffer = buf;
      filter.type = "bandpass";
      filter.frequency.value = 900 + Math.random() * 900;
      gain.gain.value = 0.08;
      src.connect(filter).connect(gain).connect(a.destination);
      src.start(a.currentTime + 0.48 + i * 0.26);
    }
  } catch {
    /* audio unavailable */
  }
}

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

const ICONS = {
  goal: Target, days: CalendarCheck, collection: Library, "long-perfect": Crown, "first-perfect": Rocket, perfect: PartyPopper, streak: Flame, mastered: Medal,
  "weak-cleared": ShieldCheck, improved: TrendingUp, speedy: Zap, comeback: Trophy, great: Sparkles,
} as const;
const TONES = {
  "long-perfect": "from-[#f2a516]/20 via-[#ff453a]/10 to-[#8e4ec6]/14 text-[var(--foreground)]",
  "first-perfect": "from-[#0a84ff]/16 via-[#8e4ec6]/12 to-[#ff9f0a]/14 text-[var(--foreground)]",
  mastered: "from-[#30b158]/16 via-[#f2a516]/12 to-transparent text-[var(--foreground)]",
  speedy: "from-[#f2a516]/20 via-[#ffd60a]/10 to-[#0a84ff]/10 text-[var(--foreground)]",
  goal: "from-[#30b158]/18 via-[#0a84ff]/12 to-[#f2a516]/16 text-[var(--foreground)]",
  days: "from-[#ff9f0a]/18 via-[#f2a516]/12 to-[#30b158]/12 text-[var(--foreground)]",
  collection: "from-[#8e4ec6]/16 via-[#0a84ff]/12 to-[#30b158]/12 text-[var(--foreground)]",
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
    const shells = c.kind === "long-perfect" ? 6 : 4;
    if (sound) {
      playChime(c.burst === "fireworks" || c.kind === "goal" || c.kind === "collection" ? "perfect" : c.kind === "streak" || c.kind === "days" ? "streak" : "good");
      if (c.burst === "fireworks" && effects && !reduced) playPops(shells);
    }
    if (c.burst === "fireworks") navigator.vibrate?.([24, 60, 24]);
    else if (c.kind === "goal" || c.kind === "days") navigator.vibrate?.(30);
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
          <Icon
            className={cn(
              "size-5",
              c.kind === "streak" || c.kind === "days" ? "text-[#ff6b00]"
                : c.kind === "long-perfect" || c.kind === "speedy" || c.kind === "mastered" ? "text-[#c27c00] dark:text-[#ffbf47]"
                  : c.kind === "perfect" || c.kind === "first-perfect" ? "text-[var(--ef-accent-ink)]"
                    : "text-[var(--ef-ok)]",
            )}
          />
        </span>
        <div className="min-w-0">
          <div className="text-[16px] font-semibold tracking-[-.01em]">{c.titleKo}</div>
          {c.detailKo ? <div className="ef-ko text-[13px] text-[var(--ef-ink-2)]">{c.detailKo}</div> : null}
        </div>
      </motion.div>
      {burst && c.burst !== "none" ? <Burst kind={c.burst} origin={burst} shells={c.kind === "long-perfect" ? 6 : 4} onDone={() => setBurst(null)} /> : null}
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
