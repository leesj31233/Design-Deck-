"use client";
import * as React from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { buildSession } from "../../core/session";
import { autoDifficulty, difficultyLevel, situationOf } from "../../core/situations";
import { SITUATIONS, type Category, type QuestionMode, type Situation } from "../../core/types";
import { DIFFICULTY_INFO, SITUATION_INFO, SKILLS, SKILL_GROUPS, skillName } from "../../content";
import { AIUnavailableError } from "../../platform/types";
import { useApp } from "../store";
import { useNav } from "../app";
import { Card, Eyebrow, cn } from "../kit";
import { CATEGORY_LABEL } from "../practice/session";
import { RoleplayList } from "../roleplay";
import { toast } from "sonner";

const MODES: { id: QuestionMode | "mixed"; title: string; body: string }[] = [
  { id: "mixed", title: "혼합", body: "짧은 표현과 완전한 문장을 섞고, 약점 문법과 복습을 자동으로 배치합니다." },
  { id: "sentence", title: "문장 말하기", body: "대화 상대의 말에 이어 내가 할 말을 완전한 문장으로 씁니다." },
  { id: "phrase", title: "짧은 표현", body: "자주 쓰는 표현 하나를 짧고 빠르게. Enter로 제출하고 바로 다음으로." },
];

const TECH_CATS: (Category | "all")[] = ["all", "process", "pilot", "meeting", "collab", "operation", "business"];

function Pill({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "dd-focus h-9 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition",
        active ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--line)] text-[var(--ef-ink-2)] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
      )}
    >
      {children}
    </button>
  );
}

/** Scene for a generated question's category field. */
function categoryFor(situation: Situation | "all", techCat: Category | "all"): Category {
  if (situation === "online" || situation === "presentation" || situation === "discussion") return "meeting";
  if (situation === "smalltalk" || situation === "meal" || situation === "visit") return "collab";
  if (techCat !== "all") return techCat;
  return (["process", "pilot", "operation"] as Category[])[Math.floor(Math.random() * 3)];
}

export function LearnScreen() {
  const app = useApp();
  const nav = useNav();
  const [situation, setSituation] = React.useState<Situation | "all">("all");
  const [mode, setMode] = React.useState<QuestionMode | "mixed">("mixed");
  const [techCat, setTechCat] = React.useState<Category | "all">("all");
  const [skill, setSkill] = React.useState<string>("all");
  const [size, setSize] = React.useState(10);
  const [gen, setGen] = React.useState<"idle" | "working">("idle");

  // Difficulty is remembered per scene ("all" = the mixed session's own choice).
  const savedDifficulty = app.state.settings.difficulty?.[situation];
  const auto = autoDifficulty(app.state.profile.startLevel);
  const difficulty = savedDifficulty ?? null;
  const setDifficulty = (d: number | null) => {
    const next = { ...(app.state.settings.difficulty ?? {}) };
    if (d === null) delete next[situation];
    else next[situation] = d;
    app.updateSettings({ difficulty: next });
  };

  const lessonBank = app.questions.filter((q) => !q.variation);
  const inScene = lessonBank.filter((q) => situation === "all" || situationOf(q) === situation);
  const matching = inScene.filter((q) => (mode === "mixed" || q.mode === mode) && (skill === "all" || q.skills.includes(skill)) && (situation !== "technical" || techCat === "all" || q.category === techCat));
  const d = difficulty ?? auto;
  const exact = matching.filter((q) => q.difficulty === d).length;
  const near = matching.filter((q) => Math.abs(q.difficulty - d) <= 1).length;

  const options = {
    size,
    mode,
    situation,
    category: situation === "technical" ? techCat : ("all" as const),
    skill,
    difficulty: difficulty ?? undefined,
    now: app.now(),
  };
  const plan = React.useMemo(
    () => buildSession(app.state, app.questions, { ...options, rng: () => 0.5 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.state, app.questions, size, mode, situation, techCat, skill, difficulty],
  );

  const start = () => {
    const p = buildSession(app.state, app.questions, { ...options, now: app.now() });
    if (!p.items.length) {
      toast("조건에 맞는 문항이 없습니다. 난이도나 문법 주제를 넓혀 보세요.");
      return;
    }
    const scene = situation === "all" ? "상황 섞기" : SITUATION_INFO[situation].ko;
    const title = `${scene}${difficulty ? ` · 난이도 ${difficulty}` : ""}${skill !== "all" ? ` · ${skillName(skill)}` : ""}`;
    nav.startSession({ id: `l-${app.now()}`, title, kind: "lesson", items: p.items, note: p.noteKo });
  };

  const generate = async () => {
    const targetSkill = skill !== "all" ? skill : app.state.profile.focusSkills[0] ?? SKILLS[Math.floor(Math.random() * SKILLS.length)].id;
    const scene: Situation = situation === "all" ? SITUATIONS[Math.floor(Math.random() * 6)] : situation;
    setGen("working");
    try {
      const q = await app.platform.ai.generate({
        category: categoryFor(scene, techCat),
        skill: targetSkill,
        level: difficultyLevel(d),
        difficulty: d,
        situation: scene,
        mode: mode === "phrase" || (mode === "mixed" && d <= 3) ? "phrase" : "sentence",
        avoidReferences: app.questions.filter((x) => x.skills[0] === targetSkill).map((x) => x.reference),
      });
      app.addGenerated({ ...q, situation: q.situation ?? scene, difficulty: q.difficulty || d });
      toast.success("새 문제를 만들었고 자동 검증을 통과했습니다.");
      nav.startSession({ id: `g-${q.id}`, title: `Claude 생성 · ${SITUATION_INFO[scene].ko} · ${skillName(targetSkill)}`, kind: "lesson", items: [{ kind: "new", questionId: q.id, reasonKo: "Claude가 생성 · 자동 검증 통과" }] });
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
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.04em]">어떤 상황에서 말해 볼까요?</h1>
        <p className="ef-ko mt-1 max-w-[62ch] text-[14px] text-[var(--muted)]">상대의 말에 이어 내가 할 말을 영어로 씁니다. 상황과 난이도(1–10)를 고르면 그에 맞는 대화 문제가 나옵니다.</p>
      </div>

      {/* Scene */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="상황">
        {(["all", ...SITUATIONS] as (Situation | "all")[]).map((sc) => {
          const active = situation === sc;
          const n = sc === "all" ? lessonBank.length : lessonBank.filter((q) => situationOf(q) === sc).length;
          const saved = app.state.settings.difficulty?.[sc];
          return (
            <button key={sc} role="radio" aria-checked={active} onClick={() => setSituation(sc)} className="dd-focus rounded-[var(--radius)] text-left">
              <Card className={cn("h-full p-3.5 transition", active ? "border-[var(--foreground)]/40 ring-2 ring-[var(--foreground)]/10" : "hover:border-[var(--foreground)]/20")}>
                <div className="text-[14px] font-semibold">{sc === "all" ? "상황 섞기" : SITUATION_INFO[sc].ko}</div>
                <p className="ef-ko mt-1 line-clamp-2 text-[12px] text-[var(--muted)]">{sc === "all" ? "온라인 미팅·발표·스몰토크·식사·기술 논의를 골고루" : SITUATION_INFO[sc].descKo}</p>
                <div className="ef-num mt-2 text-[11px] text-[var(--muted)]">
                  {n}문항{saved ? ` · 난이도 ${saved}` : ""}
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Card className="space-y-5 p-4 md:p-5">
        {/* Difficulty */}
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Eyebrow>난이도 · {situation === "all" ? "상황 섞기" : SITUATION_INFO[situation].ko}</Eyebrow>
            <span className="ef-ko text-[12px] text-[var(--muted)]">상황마다 따로 기억합니다</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill active={difficulty === null} onClick={() => setDifficulty(null)} label="난이도 자동">
              자동 ({auto})
            </Pill>
            <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="난이도 1–10">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={difficulty === n}
                  aria-label={`난이도 ${n}`}
                  onClick={() => setDifficulty(n)}
                  className={cn(
                    "dd-focus ef-num grid h-9 w-[30px] place-items-center rounded-lg border text-[13px] font-semibold transition sm:w-9",
                    difficulty === n ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--line)] text-[var(--ef-ink-2)] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <p className="ef-ko mt-2 text-[13px] text-[var(--ef-ink-2)]">
            <span className="font-semibold">{d}</span> · {DIFFICULTY_INFO[d - 1].ko} <span className="text-[var(--muted)]">({difficultyLevel(d)} 수준)</span>
          </p>
          <p className="ef-ko mt-0.5 text-[12px] text-[var(--muted)]">
            난이도 {d} 문항 {exact}개 · ±1 포함 {near}개{near < 3 ? " — 부족하면 ±2까지 넓혀 출제합니다" : ""}
          </p>
        </div>

        {/* Format */}
        <div>
          <Eyebrow>형식</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <Pill key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>
                {m.title}
              </Pill>
            ))}
          </div>
          <p className="ef-ko mt-1.5 text-[12px] text-[var(--muted)]">{MODES.find((m) => m.id === mode)?.body}</p>
        </div>

        {situation === "technical" ? (
          <div>
            <Eyebrow>엔지니어링 분야</Eyebrow>
            <div className="ef-scroll-x -mx-1 mt-2 px-1">
              <div className="flex w-max gap-1.5">
                {TECH_CATS.map((c) => (
                  <Pill key={c} active={techCat === c} onClick={() => setTechCat(c)}>
                    {c === "all" ? "전체" : CATEGORY_LABEL[c]}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="ef-skill" className="block">
              <Eyebrow>문법·표현 주제</Eyebrow>
            </label>
            <select
              id="ef-skill"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="dd-focus mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-[16px] sm:text-[15px]"
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
            조건에 맞는 문항 {matching.length}개 · 최근 3일 안에 푼 문항은 제외 · 복습은 같은 문법을 다른 문장으로 출제
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
                ? `선택한 상황·난이도(${d})·문법으로 새 대화 문제를 만들고, 기준 답안·의미 단위·오답 패턴을 자동 검증한 뒤에만 보여 줍니다.`
                : "Claude 연결이 없어 사용할 수 없습니다. 검수된 기본 문제은행으로 학습하세요."}
            </p>
          </div>
          <button onClick={generate} disabled={!app.ai.available || gen === "working"} className="dd-focus inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-4 text-[14px] font-semibold disabled:opacity-40">
            {gen === "working" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {gen === "working" ? "생성·검증 중…" : "새 문제 생성"}
          </button>
        </div>
      </Card>

      <RoleplayList situation={situation} />

      <BankOverview onPick={(sc, n) => {
        setSituation(sc);
        const next = { ...(app.state.settings.difficulty ?? {}), [sc]: n };
        app.updateSettings({ difficulty: next });
      }} />
    </div>
  );
}

/** Scene × difficulty grid of the question bank; a cell selects that scene and difficulty. */
function BankOverview({ onPick }: { onPick: (s: Situation, d: number) => void }) {
  const app = useApp();
  const bank = app.questions.filter((q) => !q.variation);
  const steps = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    <Card className="p-4 md:p-5">
      <Eyebrow>문제은행 · 상황 × 난이도</Eyebrow>
      <div className="ef-scroll-x mt-3">
        <table className="w-full min-w-[520px] text-[12px]">
          <thead>
            <tr className="text-[var(--muted)]">
              <th className="py-1.5 text-left font-medium">상황</th>
              {steps.map((n) => (
                <th key={n} className="ef-num py-1.5 text-center font-medium">{n}</th>
              ))}
              <th className="py-1.5 text-right font-medium">합계</th>
            </tr>
          </thead>
          <tbody className="ef-num">
            {SITUATIONS.map((sc) => {
              const list = bank.filter((q) => situationOf(q) === sc);
              return (
                <tr key={sc} className="border-t border-[var(--line)]">
                  <td className="ef-ko whitespace-nowrap py-1 pr-2">{SITUATION_INFO[sc].ko}</td>
                  {steps.map((n) => {
                    const c = list.filter((q) => q.difficulty === n).length;
                    return (
                      <td key={n} className="py-1 text-center">
                        {c ? (
                          <button onClick={() => onPick(sc, n)} className="dd-focus h-7 min-w-7 rounded-md px-1 hover:bg-black/[.05] dark:hover:bg-white/[.08]" aria-label={`${SITUATION_INFO[sc].ko} 난이도 ${n}: ${c}문항`}>
                            {c}
                          </button>
                        ) : (
                          <span className="text-[var(--muted)]">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1 text-right font-semibold">{list.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ef-ko mt-2 text-[12px] text-[var(--muted)]">
        학습 문항 {bank.length}개 + 복습용 변형 문항 {app.questions.length - bank.length}개{app.state.generated.length ? ` (Claude 생성 ${app.state.generated.length}개 포함)` : ""} · 숫자를 누르면 그 상황·난이도로 설정됩니다
      </p>
    </Card>
  );
}
