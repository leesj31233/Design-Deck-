"use client";
/**
 * Design Deck effects — motion that explains state, never decoration on a loop.
 * Every effect honours prefers-reduced-motion, or a surrounding <MotionConfig reducedMotion> (it renders the final state at once).
 *
 * - NumberTicker   a value that counts up to its target (scores, streaks, totals)
 * - ShimmerText    a light sweep across text while something is working ("grading…")
 * - Reveal         fade-and-rise on mount; RevealGroup staggers its children
 * - Pressable      hover lift and tap press for a card or row that is one big button
 * - Spotlight      a soft highlight that follows the pointer across a panel (pointer devices only)
 * - BorderBeam     a light travelling around the border of a panel that just succeeded
 * - LiveDot        a pulsing status dot (connected, recording, working)
 */
import * as React from "react";
import { motion, useMotionValue, useReducedMotionConfig, useSpring, useTransform, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.8, 0.2, 1] as const;

/* ───────────── NumberTicker ───────────── */

export function NumberTicker({ value, delay = 0, className, format = (n) => String(Math.round(n)) }: { value: number; delay?: number; className?: string; format?: (n: number) => string }) {
  const reduced = useReducedMotionConfig();
  const mv = useMotionValue(reduced ? value : 0);
  const spring = useSpring(mv, { stiffness: 90, damping: 22, mass: 0.8 });
  const text = useTransform(spring, (n) => format(n));
  React.useEffect(() => {
    if (reduced) {
      mv.jump(value);
      spring.jump(value);
      return;
    }
    const t = setTimeout(() => mv.set(value), delay * 1000);
    return () => clearTimeout(t);
  }, [value, delay, reduced, mv, spring]);
  return <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>;
}

/* ───────────── ShimmerText ───────────── */

export function ShimmerText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("dd-shimmer", className)}>{children}</span>;
}

/* ───────────── Reveal / RevealGroup ───────────── */

export function Reveal({ children, delay = 0, y = 8, className, ...props }: { children: React.ReactNode; delay?: number; y?: number; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  const reduced = useReducedMotionConfig();
  return (
    <motion.div className={className} initial={reduced ? false : { opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: EASE, delay }} {...props}>
      {children}
    </motion.div>
  );
}

const groupVariants = { hidden: {}, shown: { transition: { staggerChildren: 0.045 } } };
const itemVariants = { hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } } };

/** Staggers its direct children in. Wrap each child in <RevealItem>. */
export function RevealGroup({ children, className, as = "div", "aria-label": ariaLabel }: { children: React.ReactNode; className?: string; as?: "div" | "ul" | "ol"; "aria-label"?: string }) {
  const reduced = useReducedMotionConfig();
  const Comp = as === "ul" ? motion.ul : as === "ol" ? motion.ol : motion.div;
  return (
    <Comp className={className} aria-label={ariaLabel} variants={groupVariants} initial={reduced ? false : "hidden"} animate="shown">
      {children}
    </Comp>
  );
}
export function RevealItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" }) {
  const Comp = as === "li" ? motion.li : motion.div;
  return (
    <Comp className={className} variants={itemVariants}>
      {children}
    </Comp>
  );
}

/* ───────────── Pressable ───────────── */

/** A card or row that is one big control: lifts on hover, presses on tap (a <button>). */
export const Pressable = React.forwardRef<HTMLButtonElement, HTMLMotionProps<"button"> & { lift?: number }>(function Pressable({ className, lift = 2, ...props }, ref) {
  const reduced = useReducedMotionConfig();
  return (
    <motion.button
      ref={ref}
      whileHover={reduced ? undefined : { y: -lift, boxShadow: "var(--shadow-soft)" }}
      whileTap={reduced ? undefined : { scale: 0.985, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={cn("dd-focus text-left", className)}
      {...props}
    />
  );
});

/* ───────────── Spotlight ───────────── */

/** Soft radial highlight under the pointer. Purely visual; children keep their own semantics. */
export function Spotlight({ children, className, color = "rgba(10,132,255,.10)" }: { children: React.ReactNode; className?: string; color?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionConfig();
  const onMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--dd-sx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--dd-sy", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onPointerMove={onMove} className={cn("dd-spotlight relative isolate", className)} style={{ ["--dd-spot" as string]: color }}>
      {children}
    </div>
  );
}

/* ───────────── BorderBeam ───────────── */

/** A light that travels once around the border (or loops while `loop`): place inside a relative, rounded panel. */
export function BorderBeam({ loop = false, duration = 2.4, className }: { loop?: boolean; duration?: number; className?: string }) {
  const reduced = useReducedMotionConfig();
  if (reduced) return null;
  return <span aria-hidden className={cn("dd-beam", loop && "dd-beam-loop", className)} style={{ ["--dd-beam-dur" as string]: `${duration}s` }} />;
}

/* ───────────── LiveDot ───────────── */

export function LiveDot({ tone = "green", className }: { tone?: "green" | "blue" | "red" | "amber"; className?: string }) {
  const reduced = useReducedMotionConfig();
  const color = { green: "bg-emerald-500", blue: "bg-[var(--accent)]", red: "bg-red-500", amber: "bg-amber-500" }[tone];
  return (
    <span className={cn("relative inline-flex size-2.5", className)} aria-hidden>
      {reduced ? null : <motion.span animate={{ scale: [1, 2], opacity: [0.55, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }} className={cn("absolute inline-flex size-full rounded-full", color)} />}
      <span className={cn("relative inline-flex size-2.5 rounded-full", color)} />
    </span>
  );
}
