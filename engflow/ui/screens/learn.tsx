"use client";
import * as React from "react";
import { ArrowRight, Loader2, MessagesSquare, Shuffle, Sparkles, TextCursorInput } from "lucide-react";
import { buildSession } from "../../core/session";
import type { Category, Cefr, QuestionMode } from "../../core/types";
import { SKILLS, SKILL_GROUPS, skillName } from "../../content";
import { AIUnavailableError } from "../../platform/types";
import { useApp } from "../store";
import { useNav } from "../app";
import { Card, Eyebrow, cn } from "../kit";
import { CATEGORY_LABEL } from "../practice/session";
import { toast } from "sonner";

const MODES: { id: QuestionMode | "mixed"; title: string; body: string; icon: React.ElementType }[] = [
  { id: "sentence", title: "문장 구성", body: "영어 어순으로 나눈 한국어 의미 단위를 보고 완전한 문장을 씁니다. 조건문·조동사·관계절 등 회의 문장 전체를 훈련합니다.", icon: MessagesSquare },
  { id: "phrase", title: "구문 퀴즈", body: "문법 패턴 하나를 짧게 빠르게. Enter로 제출하고 바로 다음 문항으로 넘어갑니다.", icon: TextCursorInput },
  { id: "mixed", title: "혼합", body: "문장 구성과 구문 퀴즈를 섞고, 약점 문법과 복습을 자동으로 배치합니다.", icon: Shuffle },
];

const LEVELS: (Cefr | "auto")[] = ["auto", "A2", "B1", "B2", "C1"];
const CATS: (Category | "all")[] = ["all", "process", "pilot", "meeting", "collab", "operation", "business"];

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "dd-focus h-9 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition",
        active ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--line)] text-[var(--ef-ink-2)] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
      )}
    >
      {children}
    </button>
  );
}

export function LearnScreen() {
  const app = useApp();
  const nav = useNav();
  const [mode, setMode] = React.useState<QuestionMode | "mixed">("mixed");
  const [level, setLevel] = React.useState<Cefr | "auto">("auto");
  const [category, setCategory] = React.useState<Category | "all">("all");
  const [skill, setSkill] = React.useState<string>("all");
  const [size, setSize] = React.useState(10);
  const [gen, setGen] = React.useState<"idle" | "working">("idle");

  const plan = React.useMemo(
    () => buildSession(app.state, app.questions, { size, mode, level, category, skill, now: app.now(), rng: () => 0.5 }),
    [app.state, app.questions, size, mode, level, category, skill, app],
  );
  const lessonBank = app.questions.filter((q) => !q.variation);
  const available = lessonBank.filter((q) => (mode === "mixed" || q.mode === mode) && (category === "all" || q.category === category) && (skill === "all" || q.skills.includes(skill))).length;

  const start = () => {
    const p = buildSession(app.state, app.questions, { size, mode, level, category, skill, now: app.now() });
    if (!p.items.length) {
      toast("조건에 맞는 문항이 없습니다. 필터를 넓혀 보세요.");
      return;
    }
    const title = skill !== "all" ? skillName(skill) : mode === "sentence" ? "문장 구성" : mode === "phrase" ? "구문 퀴즈" : "혼합 학습";
    nav.startSession({ id: `l-${app.now()}`, title, kind: "lesson", items: p.items, note: p.noteKo });
  };

  const generate = async () => {
    const targetSkill = skill !== "all" ? skill : app.state.profile.focusSkills[0] ?? SKILLS[Math.floor(Math.random() * SKILLS.length)].id;
    const cat: Category = category !== "all" ? category : (["process", "pilot", "meeting", "collab", "operation", "business"] as Category[])[Math.floor(Math.random() * 6)];
    const lv: Cefr = level !== "auto" ? level : app.state.profile.startLevel;
    setGen("working");
    try {
      const q = await app.platform.ai.generate({
        category: cat,
        skill: targetSkill,
        level: lv,
        mode: mode === "phrase" ? "phrase" : "sentence",
        avoidReferences: app.questions.filter((x) => x.skills[0] === targetSkill).map((x) => x.reference),
      });
      app.addGenerated(q);
      toast.success("새 문제를 만들었고 자동 검증을 통과했습니다.");
      nav.startSession({ id: `g-${q.id}`, title: `Claude 생성 문제 · ${skillName(targetSkill)}`, kind: "lesson", items: [{ kind: "new", questionId: q.id, reasonKo: "Claude가 생성 · 자동 검증 통과" }] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "문제를 만들지 못했습니다.";
      toast.error(`${msg} 검수된 기본 문제로 계속하세요.`);
      if (!(e instanceof AIUnavailableError)) console.warn(e);
    } finally {
      setGen("idle");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>학습</Eyebrow>
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.04em]">무엇을 연습할까요?</h1>
      </div>

      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="학습 모드">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button key={m.id} role="radio" aria-checked={active} onClick={() => setMode(m.id)} className="dd-focus rounded-[var(--radius)] text-left">
              <Card className={cn("h-full p-4 transition", active ? "border-[var(--foreground)]/40 ring-2 ring-[var(--foreground)]/10" : "hover:border-[var(--foreground)]/20")}>
                <div className="flex items-center gap-2">
                  <span className={cn("grid size-8 place-items-center rounded-xl", active ? "bg-[var(--foreground)] text-[var(--background)]" : "bg-[var(--ef-track)] text-[var(--ef-ink-2)]")}>
                    <Icon className="size-4" />
                  </span>
                  <span className="text-[15px] font-semibold">{m.title}</span>
                </div>
                <p className="ef-ko mt-2 text-[13px] text-[var(--muted)]">{m.body}</p>
              </Card>
            </button>
          );
        })}
      </div>

      <Card className="space-y-4 p-4 md:p-5">
        <div>
          <Eyebrow>난이도</Eyebrow>
          <div className="ef-scroll-x -mx-1 mt-2 px-1">
            <div className="flex w-max gap-1.5">
              {LEVELS.map((l) => (
                <Pill key={l} active={level === l} onClick={() => setLevel(l)}>
                  {l === "auto" ? `자동 (${app.state.profile.startLevel} 중심)` : l}
                </Pill>
              ))}
            </div>
          </div>
        </div>
        <div>
          <Eyebrow>엔지니어링 분야</Eyebrow>
          <div className="ef-scroll-x -mx-1 mt-2 px-1">
            <div className="flex w-max gap-1.5">
              {CATS.map((c) => (
                <Pill key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c === "all" ? "전체" : CATEGORY_LABEL[c]}
                </Pill>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="ef-skill" className="block">
              <Eyebrow>문법 주제</Eyebrow>
            </label>
            <select
              id="ef-skill"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="dd-focus mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-[15px]"
            >
              <option value="all">전체 (약점 우선 자동 선택)</option>
              {Object.entries(SKILL_GROUPS).map(([g, info]) => (
                <optgroup key={g} label={info.ko}>
                  {SKILLS.filter((s) => s.group === g).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameKo}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <Eyebrow>문항 수</Eyebrow>
            <div className="mt-2 flex gap-1.5">
              {[5, 10, 15].map((n) => (
                <Pill key={n} active={size === n} onClick={() => setSize(n)}>
                  {n}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center md:p-5">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{plan.items.length ? plan.noteKo : "조건에 맞는 문항 없음"}</div>
          <p className="ef-ko mt-0.5 text-[13px] text-[var(--muted)]">
            조건에 맞는 문항 {available}개 · 최근 3일 안에 푼 문항은 제외 · 복습 문항은 같은 문법을 다른 문장으로 출제
          </p>
        </div>
        <button onClick={start} disabled={!plan.items.length} className="dd-focus inline-flex h-12 items-center justify-center gap-2 rounded-[14px] bg-[var(--foreground)] px-6 text-[15px] font-semibold text-[var(--background)] disabled:opacity-40">
          시작 <ArrowRight className="size-4" />
        </button>
      </Card>

      <Card className="p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[15px] font-semibold">
              <Sparkles className="size-4 text-[var(--ef-accent-ink)]" /> Claude로 새 문제 만들기
            </div>
            <p className="ef-ko mt-1 text-[13px] text-[var(--muted)]">
              {app.ai.available
                ? "위 조건(문법·분야·난이도)으로 새 문제를 만들고, 기준 답안·의미 단위·오답 패턴을 자동 검증한 뒤에만 보여 줍니다. 실패하면 검수된 기본 문제를 쓰세요."
                : "Claude 연결이 없어 사용할 수 없습니다. 검수된 기본 문제은행으로 학습하세요."}
            </p>
          </div>
          <button onClick={generate} disabled={!app.ai.available || gen === "working"} className="dd-focus inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-4 text-[14px] font-semibold disabled:opacity-40">
            {gen === "working" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {gen === "working" ? "생성·검증 중…" : "새 문제 생성"}
          </button>
        </div>
      </Card>

      <BankOverview />
    </div>
  );
}

function BankOverview() {
  const app = useApp();
  const bank = app.questions.filter((q) => !q.variation);
  const levels: Cefr[] = ["A2", "B1", "B2", "C1"];
  const cats = Object.keys(CATEGORY_LABEL) as Category[];
  return (
    <Card className="p-4 md:p-5">
      <Eyebrow>문제은행</Eyebrow>
      <div className="ef-scroll-x mt-3">
        <table className="w-full min-w-[480px] text-[12px]">
          <thead>
            <tr className="text-[var(--muted)]">
              <th className="py-1.5 text-left font-medium">분야</th>
              {levels.map((l) => (
                <th key={l} className="py-1.5 text-right font-medium">{l}</th>
              ))}
              <th className="py-1.5 text-right font-medium">합계</th>
            </tr>
          </thead>
          <tbody className="ef-num">
            {cats.map((c) => (
              <tr key={c} className="border-t border-[var(--line)]">
                <td className="py-1.5">{CATEGORY_LABEL[c]}</td>
                {levels.map((l) => (
                  <td key={l} className="py-1.5 text-right">{bank.filter((q) => q.category === c && q.level === l).length || "·"}</td>
                ))}
                <td className="py-1.5 text-right font-semibold">{bank.filter((q) => q.category === c).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ef-ko mt-2 text-[12px] text-[var(--muted)]">
        학습 문항 {bank.length}개 + 복습용 변형 문항 {app.questions.length - bank.length}개{app.state.generated.length ? ` (Claude 생성 ${app.state.generated.length}개 포함)` : ""}
      </p>
    </Card>
  );
}
