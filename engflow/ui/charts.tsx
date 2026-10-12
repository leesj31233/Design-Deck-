"use client";
import * as React from "react";
import { cn } from "./kit";
import { CEFR_ORDER, type Cefr } from "../core/types";
import { thetaToScale } from "../core/diagnostic";

/** Small hover/focus tooltip anchored inside a relative container. */
function Tip({ x, y, children }: { x: number | string; y: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1.5 text-[11px] shadow-[var(--shadow-soft)] backdrop-blur-xl"
      style={{ left: x, top: y - 6 }}
    >
      {children}
    </div>
  );
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** Answered questions per day (last 7 days) against the daily target. */
export function WeekBars({ data, target }: { data: { day: string; answered: number; correct: number }[]; target: number }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(target, ...data.map((d) => d.answered), 1);
  const H = 96;
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div className="relative flex h-[96px] items-end justify-between gap-1.5" role="list" aria-label="최근 7일 학습량">
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--line)]" style={{ bottom: (target / max) * H }} aria-hidden />
        {data.map((d, i) => {
          const h = d.answered ? Math.max(4, (d.answered / max) * H) : 0;
          const today = i === data.length - 1;
          return (
            <button
              key={d.day}
              role="listitem"
              className="dd-focus relative flex h-full flex-1 items-end justify-center rounded-md"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${d.day}: ${d.answered}문항, 정답 ${d.correct}`}
            >
              <span
                className="block w-full max-w-[24px] rounded-t-[4px]"
                style={{ height: h, background: today ? "var(--accent)" : "color-mix(in srgb, var(--accent) 45%, transparent)" }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between gap-1.5">
        {data.map((d, i) => (
          <span key={d.day} className={cn("flex-1 text-center text-[10px]", i === data.length - 1 ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]")}>
            {WEEKDAY_KO[new Date(d.day + "T12:00:00").getDay()]}
          </span>
        ))}
      </div>
      {hover !== null ? (
        <Tip x={`${((hover + 0.5) / data.length) * 100}%`} y={H - (data[hover].answered / max) * H}>
          <span className="font-semibold">{data[hover].answered}문항</span> · 정답 {data[hover].correct}
        </Tip>
      ) : null}
    </div>
  );
}

/** Review consistency: answered per day over the last `weeks` weeks (sequential, one hue). */
export function Heatmap({ daily, now, weeks = 12 }: { daily: Record<string, { answered: number; talk?: number }>; now: number; weeks?: number }) {
  const [hover, setHover] = React.useState<{ key: string; n: number; x: number; y: number } | null>(null);
  const today = new Date(now);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOffset = end.getDay() + (weeks - 1) * 7;
  const cells: { key: string; n: number; col: number; row: number; future: boolean }[] = [];
  for (let i = startOffset; i >= -(6 - end.getDay()); i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const idx = startOffset - i;
    cells.push({ key, n: (daily[key]?.answered ?? 0) + (daily[key]?.talk ?? 0), col: Math.floor(idx / 7), row: idx % 7, future: i < 0 });
  }
  const level = (n: number) => (n === 0 ? 0 : n < 5 ? 1 : n < 10 ? 2 : n < 20 ? 3 : 4);
  const fill = ["var(--ef-track)", "color-mix(in srgb, var(--accent) 25%, transparent)", "color-mix(in srgb, var(--accent) 50%, transparent)", "color-mix(in srgb, var(--accent) 75%, transparent)", "var(--accent)"];
  const S = 13;
  const G = 3;
  return (
    <div className="relative">
      <div className="ef-scroll-x">
        <svg width={weeks * (S + G)} height={7 * (S + G)} role="img" aria-label={`최근 ${weeks}주 학습 기록`} onMouseLeave={() => setHover(null)}>
          {cells.map((c) =>
            c.future ? null : (
              <rect
                key={c.key}
                x={c.col * (S + G)}
                y={c.row * (S + G)}
                width={S}
                height={S}
                rx={3}
                fill={fill[level(c.n)]}
                onMouseEnter={() => setHover({ key: c.key, n: c.n, x: c.col * (S + G) + S / 2, y: c.row * (S + G) })}
              >
                <title>{`${c.key}: ${c.n}문항`}</title>
              </rect>
            ),
          )}
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
        적음
        {fill.map((f, i) => (
          <span key={i} className="inline-block size-2.5 rounded-[3px]" style={{ background: f }} />
        ))}
        많음
      </div>
      {hover ? (
        <Tip x={hover.x} y={hover.y}>
          {hover.key.slice(5).replace("-", "/")} · <span className="font-semibold">{hover.n}문항</span>
        </Tip>
      ) : null}
    </div>
  );
}

/** Daily average score with crosshair + tooltip. */
export function TrendLine({ points, height = 120 }: { points: { label: string; value: number | null }[]; height?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(320);
  const [hover, setHover] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 26, r: 10, t: 10, b: 18 };
  const iw = Math.max(10, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const n = points.length;
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / 100) * ih;
  const valid = points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null) as { label: string; value: number; i: number }[];
  const path = valid.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.value)}`).join(" ");
  const area = valid.length ? `${path} L${x(valid[valid.length - 1].i)},${y(0)} L${x(valid[0].i)},${y(0)} Z` : "";
  const last = valid[valid.length - 1];
  const onMove = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = e.clientX - rect.left - pad.l;
    const i = Math.round((rel / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <div ref={ref} className="relative w-full" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={height} role="img" aria-label="일별 평균 점수 추세">
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">{t}</text>
          </g>
        ))}
        {area ? <path d={area} fill="var(--accent)" opacity={0.1} /> : null}
        {path ? <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {last ? <circle cx={x(last.i)} cy={y(last.value)} r={4} fill="var(--accent)" stroke="var(--surface-strong)" strokeWidth={2} /> : null}
        {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--muted)" strokeWidth={1} opacity={0.5} /> : null}
        {hover !== null && points[hover].value !== null ? <circle cx={x(hover)} cy={y(points[hover].value!)} r={4} fill="var(--accent)" stroke="var(--surface-strong)" strokeWidth={2} /> : null}
        <text x={pad.l} y={height - 4} fontSize={9} fill="var(--muted)">{points[0]?.label}</text>
        <text x={w - pad.r} y={height - 4} fontSize={9} fill="var(--muted)" textAnchor="end">{points[n - 1]?.label}</text>
      </svg>
      {hover !== null ? (
        <Tip x={x(hover)} y={points[hover].value !== null ? y(points[hover].value!) : pad.t + ih}>
          {points[hover].label} · <span className="font-semibold">{points[hover].value === null ? "학습 없음" : `${points[hover].value}점`}</span>
        </Tip>
      ) : null}
    </div>
  );
}

/** CEFR scale with the estimate's range band and point. */
export function CefrScale({ theta, sd, low, high, point }: { theta: number; sd: number; low: Cefr; high: Cefr; point: Cefr }) {
  const levels: Cefr[] = CEFR_ORDER;
  const a = thetaToScale(theta - sd) * 100;
  const b = thetaToScale(theta + sd) * 100;
  const p = thetaToScale(theta) * 100;
  return (
    <div className="pt-6" aria-label={`추정 범위 ${low}–${high}, 중심 ${point}`}>
      <div className="relative">
        <div className="grid grid-cols-6 gap-[2px] overflow-hidden rounded-[6px]">
          {levels.map((l) => {
            const inRange = CEFR_ORDER.indexOf(l) >= CEFR_ORDER.indexOf(low) && CEFR_ORDER.indexOf(l) <= CEFR_ORDER.indexOf(high);
            return <div key={l} className="h-3" style={{ background: inRange ? "color-mix(in srgb, var(--accent) 22%, var(--ef-track))" : "var(--ef-track)" }} />;
          })}
        </div>
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--accent)] opacity-60" style={{ left: `${a}%`, width: `${Math.max(1, b - a)}%` }} />
        <div className="absolute -top-6 -translate-x-1/2 text-[11px] font-semibold text-[var(--accent)]" style={{ left: `${p}%` }}>
          {point}
        </div>
        <div className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface-strong)] bg-[var(--accent)] shadow" style={{ left: `${p}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-6 text-center text-[11px] font-medium text-[var(--muted)]">
        {levels.map((l) => (
          <span key={l} className={l === point ? "font-semibold text-[var(--foreground)]" : ""}>{l}</span>
        ))}
      </div>
    </div>
  );
}
