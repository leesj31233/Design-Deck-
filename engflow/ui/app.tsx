"use client";
import * as React from "react";
import { MotionConfig } from "motion/react";
import { Toaster as Sonner } from "sonner";
import { CalendarCheck2, ChartColumn, ClipboardCheck, NotebookPen, PenLine, RotateCcw, Settings } from "lucide-react";
import type { Platform } from "../platform/types";
import { AppProvider, clock, useApp, usePreferences } from "./store";
import { cn, LevelBadge, useMediaQuery } from "./kit";
import { levelEstimate } from "../core/store";
import { dueItems } from "../core/session";
import { SessionRunner, type SessionSpec } from "./practice/session";
import { TodayScreen } from "./screens/today";
import { LearnScreen } from "./screens/learn";
import { ReviewScreen } from "./screens/review";
import { MistakesScreen } from "./screens/mistakes";
import { LevelTestScreen } from "./screens/level-test";
import { ProgressScreen } from "./screens/progress";
import { SettingsScreen } from "./screens/settings";
import { GuideSheet } from "./guide";
import { ExpressionStudy } from "./expressions";
import { FreeTalk } from "./freetalk";

export type Route = "today" | "learn" | "review" | "mistakes" | "test" | "progress" | "settings";
const ROUTES: Route[] = ["today", "learn", "review", "mistakes", "test", "progress", "settings"];

export interface Nav {
  route: Route;
  go: (r: Route) => void;
  startSession: (spec: SessionSpec) => void;
  openGuide: (skill: string) => void;
  /** Practice one skill right away (from the guide, notebook or progress). */
  practiceSkill: (skill: string) => void;
  /** Hide navigation chrome (level test in progress). */
  setFocus: (on: boolean) => void;
  /** Open the study flow for one expression (grammar point). */
  openExpression: (skill: string) => void;
  /** Free talk with Claude on one topic (core/freetalk.ts). */
  startTalk: (topicId: string) => void;
}

export const NavContext = React.createContext<Nav | null>(null);
export function useNav(): Nav {
  const n = React.useContext(NavContext);
  if (!n) throw new Error("useNav outside shell");
  return n;
}

function readHash(): Route {
  const h = (typeof location !== "undefined" ? location.hash.replace("#", "") : "") as Route;
  return ROUTES.includes(h) ? h : "today";
}

const NAV_ITEMS: { id: Route; label: string; icon: React.ElementType; mobile?: boolean }[] = [
  { id: "today", label: "오늘", icon: CalendarCheck2, mobile: true },
  { id: "learn", label: "학습", icon: PenLine, mobile: true },
  { id: "review", label: "복습", icon: RotateCcw, mobile: true },
  { id: "mistakes", label: "표현 노트", icon: NotebookPen, mobile: true },
  { id: "test", label: "레벨 테스트", icon: ClipboardCheck },
  { id: "progress", label: "진도", icon: ChartColumn, mobile: true },
  { id: "settings", label: "설정", icon: Settings },
];

function Shell() {
  const app = useApp();
  usePreferences(app.state.settings);
  const [route, setRoute] = React.useState<Route>(readHash);
  const [session, setSession] = React.useState<SessionSpec | null>(null);
  const [guideSkill, setGuideSkill] = React.useState<string | null>(null);
  const [study, setStudy] = React.useState<string | null>(null);
  const [talk, setTalk] = React.useState<{ id: string; key: number } | null>(null);
  const [focus, setFocus] = React.useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const mainRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = (r: Route) => {
    setRoute(r);
    try {
      if (location.hash !== `#${r}`) history.replaceState(null, "", `#${r}`);
    } catch {
      /* sandboxed */
    }
    window.scrollTo({ top: 0 });
  };

  const nav: Nav = {
    route,
    go,
    startSession: (spec) => {
      setGuideSkill(null);
      setStudy(null);
      setSession(spec);
      window.scrollTo({ top: 0 });
    },
    openGuide: (skill) => setGuideSkill(skill),
    setFocus,
    openExpression: (skill) => {
      setGuideSkill(null);
      setStudy(skill);
      window.scrollTo({ top: 0 });
    },
    startTalk: (topicId) => {
      setGuideSkill(null);
      setStudy(null);
      setTalk({ id: topicId, key: Date.now() });
      window.scrollTo({ top: 0 });
    },
    practiceSkill: (skill) => {
      import("../core/session").then(({ buildSession }) => {
        const plan = buildSession(app.state, app.questions, { size: 6, mode: "mixed", skill, now: app.now() });
        setGuideSkill(null);
        setSession({ id: `skill-${skill}-${app.now()}`, title: "문법 집중 연습", kind: "lesson", items: plan.items, note: plan.noteKo });
      });
    },
  };

  const due = dueItems(app.state, app.now()).length;
  const lvl = levelEstimate(app.state);
  const offset = clock.offset();

  if (session) {
    return (
      <NavContext.Provider value={nav}>
        <div className="ef-root min-h-[100dvh]">
          {offset ? <TimeBanner /> : null}
          <SessionRunner key={session.id} spec={session} onExit={() => setSession(null)} onPracticeSkill={nav.practiceSkill} />
        </div>
      </NavContext.Provider>
    );
  }

  if (talk) {
    return (
      <NavContext.Provider value={nav}>
        <div className="ef-root min-h-[100dvh]">
          {offset ? <TimeBanner /> : null}
          <FreeTalk key={talk.key} topicId={talk.id} onExit={() => setTalk(null)} />
        </div>
      </NavContext.Provider>
    );
  }

  if (study) {
    return (
      <NavContext.Provider value={nav}>
        <div className="ef-root min-h-[100dvh]">
          {offset ? <TimeBanner /> : null}
          <ExpressionStudy key={study} skill={study} onExit={() => setStudy(null)} />
          {guideSkill ? <GuideSheet open onOpenChange={(o) => !o && setGuideSkill(null)} skill={guideSkill} onPractice={nav.practiceSkill} /> : null}
        </div>
      </NavContext.Provider>
    );
  }

  const Screen = {
    today: TodayScreen,
    learn: LearnScreen,
    review: ReviewScreen,
    mistakes: MistakesScreen,
    test: LevelTestScreen,
    progress: ProgressScreen,
    settings: SettingsScreen,
  }[route];

  return (
    <NavContext.Provider value={nav}>
      <div className="ef-root min-h-[100dvh]">
        {offset ? <TimeBanner /> : null}
        <div className="flex">
          {desktop && !focus ? (
            <aside className="sticky top-0 flex h-[100dvh] w-[248px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] px-3 py-4 backdrop-blur-xl">
              <Brand />
              <nav className="mt-6 flex flex-col gap-0.5" aria-label="주요 메뉴">
                {NAV_ITEMS.map((n) => (
                  <NavButton key={n.id} item={n} active={route === n.id} onClick={() => go(n.id)} badge={n.id === "review" && due ? due : undefined} />
                ))}
              </nav>
              <div className="mt-auto space-y-2 px-2 text-[12px]">
                <button onClick={() => go("test")} className="dd-focus flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2.5 text-left">
                  <span>
                    <span className="block text-[11px] text-[var(--muted)]">현재 레벨 추정</span>
                    <span className="font-semibold">{lvl.label}</span>
                  </span>
                  <ClipboardCheck className="size-4 text-[var(--muted)]" />
                </button>
                <StorageDot />
              </div>
            </aside>
          ) : null}
          <div ref={mainRef} className="min-w-0 flex-1">
            {!desktop && !focus ? (
              <header className="ef-topbar sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--background)]/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
                <div className="flex h-14 items-center gap-2 px-4">
                  <Brand compact />
                  <div className="ml-auto flex items-center gap-1.5">
                    <button onClick={() => go("test")} className="dd-focus inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] px-2.5 text-[12px]" aria-label={`레벨 테스트 · 현재 추정 ${lvl.label}`}>
                      <ClipboardCheck className="size-4 text-[var(--muted)]" />
                      <LevelBadge level={lvl.label.split(" ")[0]} className="border-0 bg-transparent px-0" />
                    </button>
                    <button onClick={() => go("settings")} className={cn("dd-focus grid size-9 place-items-center rounded-xl", route === "settings" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted)]")} aria-label="설정">
                      <Settings className="size-[18px]" />
                    </button>
                  </div>
                </div>
              </header>
            ) : null}
            <main className={cn("mx-auto w-full max-w-5xl px-4 pt-5 md:px-6 lg:px-10 lg:pt-10", desktop || focus ? "pb-16" : "pb-[calc(84px+env(safe-area-inset-bottom,0px))]")}>
              <Screen />
            </main>
          </div>
        </div>
        {!desktop && !focus ? (
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--surface-strong)]/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl" aria-label="주요 메뉴">
            <div className="mx-auto flex max-w-xl">
              {NAV_ITEMS.filter((n) => n.mobile).map((n) => {
                const Icon = n.icon;
                const active = route === n.id;
                return (
                  <button key={n.id} onClick={() => go(n.id)} className={cn("dd-focus relative flex h-[58px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium", active ? "text-[var(--foreground)]" : "text-[var(--muted)]")} aria-current={active ? "page" : undefined}>
                    <Icon className={cn("size-[21px]", active && "stroke-[2.3]")} />
                    {n.label}
                    {n.id === "review" && due ? <span className="ef-num absolute right-[calc(50%-20px)] top-1.5 min-w-4 rounded-full bg-[var(--ef-bad-fill)] px-1 text-center text-[9.5px] font-bold leading-4 text-white">{due > 99 ? "99+" : due}</span> : null}
                  </button>
                );
              })}
            </div>
          </nav>
        ) : null}
        {guideSkill ? <GuideSheet open onOpenChange={(o) => !o && setGuideSkill(null)} skill={guideSkill} onPractice={nav.practiceSkill} /> : null}
      </div>
    </NavContext.Provider>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="grid size-9 place-items-center rounded-[12px] bg-[var(--foreground)] text-[var(--background)]" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h6l3 5 3-5h6" />
          <path d="M3 17h18" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-[-.02em]">EngFlow</div>
        {!compact ? <div className="text-[10.5px] text-[var(--muted)]">Engineering English for real meetings</div> : null}
      </div>
    </div>
  );
}

function NavButton({ item, active, onClick, badge }: { item: (typeof NAV_ITEMS)[number]; active: boolean; onClick: () => void; badge?: number }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn("dd-focus flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition", active ? "bg-[var(--foreground)] text-[var(--background)] shadow-sm" : "text-[var(--ef-ink-2)] hover:bg-black/[.05] dark:hover:bg-white/[.07]")}
    >
      <Icon className="size-[18px]" />
      <span className="flex-1 text-left">{item.label}</span>
      {badge ? <span className={cn("ef-num rounded-md px-1.5 py-0.5 text-[11px] font-semibold", active ? "bg-white/20" : "bg-[var(--ef-bad-soft)] text-[var(--ef-bad)]")}>{badge}</span> : null}
    </button>
  );
}

function StorageDot() {
  const app = useApp();
  const s = app.storage;
  return (
    <div className="flex items-start gap-2 rounded-xl px-1 py-1 text-[11px] text-[var(--muted)]" title={s.detailKo}>
      <span className={cn("mt-1 size-2 shrink-0 rounded-full", s.durable ? "bg-[var(--ef-ok-fill)]" : "bg-[var(--ef-warn-fill)]")} />
      <span>
        {s.labelKo}
        <span className="block">{app.ai.available && app.state.settings.ai !== "off" ? "Claude 빠른 채점" : "규칙 기반 채점"}</span>
      </span>
    </div>
  );
}

function TimeBanner() {
  const days = Math.round(clock.offset() / 86400000);
  return (
    <div className="ef-ko sticky top-0 z-40 bg-[var(--ef-warn-fill)] px-4 py-1 text-center text-[12px] font-semibold text-black">
      테스트용 시간 이동 중: {days > 0 ? `+${days}` : days}일 (설정 → 개발자 도구에서 해제)
    </div>
  );
}

export function EngFlowApp({ platform }: { platform: Platform }) {
  return (
    <AppProvider platform={platform}>
      <MotionWrapper>
        <Shell />
      </MotionWrapper>
      <ResponsiveToaster />
    </AppProvider>
  );
}

function MotionWrapper({ children }: { children: React.ReactNode }) {
  const app = useApp();
  return <MotionConfig reducedMotion={app.state.settings.reducedMotion === "reduce" ? "always" : "user"}>{children}</MotionConfig>;
}

function ResponsiveToaster() {
  const desktop = useMediaQuery("(min-width: 1024px)");
  return (
    <Sonner
      position={desktop ? "bottom-right" : "top-center"}
      toastOptions={{ style: { borderRadius: "14px", border: "1px solid var(--line)", background: "var(--surface-strong)", color: "var(--foreground)", backdropFilter: "blur(20px)", fontFamily: "var(--ef-font)" } }}
    />
  );
}
