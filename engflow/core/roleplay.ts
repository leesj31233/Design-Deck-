import type { LearnerState, Question, Situation } from "./types";
import type { SessionItem } from "./session";

/** Role-play: several turns of one conversation, played in order. */
export interface ScenarioInfo {
  id: string;
  titleKo: string;
  situation: Situation;
  steps: Question[];
  minDifficulty: number;
  maxDifficulty: number;
  /** Steps the learner has answered at least once. */
  done: number;
  /** Best score per step (0 when not answered). */
  best: number[];
}

export function listScenarios(bank: Question[], state: Pick<LearnerState, "seen">): ScenarioInfo[] {
  const by = new Map<string, Question[]>();
  for (const q of bank) if (q.scenario) by.set(q.scenario.id, [...(by.get(q.scenario.id) ?? []), q]);
  return [...by.values()]
    .map((steps) => {
      steps.sort((a, b) => a.scenario!.step - b.scenario!.step);
      const d = steps.map((q) => q.difficulty);
      const best = steps.map((q) => state.seen[q.id]?.best ?? 0);
      return {
        id: steps[0].scenario!.id,
        titleKo: steps[0].scenario!.titleKo,
        situation: (steps[0].situation ?? "discussion") as Situation,
        steps,
        minDifficulty: Math.min(...d),
        maxDifficulty: Math.max(...d),
        done: steps.filter((q) => state.seen[q.id]).length,
        best,
      };
    })
    .sort((a, b) => a.minDifficulty - b.minDifficulty || a.titleKo.localeCompare(b.titleKo));
}

/** Session items for one scenario, in order. */
export function scenarioItems(s: ScenarioInfo): SessionItem[] {
  return s.steps.map((q, i) => ({ kind: "new" as const, questionId: q.id, reasonKo: `롤플레이 ${i + 1}/${s.steps.length} · ${s.titleKo}` }));
}

/** A good next scenario: unfinished ones near the target difficulty first. */
export function recommendScenario(list: ScenarioInfo[], targetDifficulty: number): ScenarioInfo | null {
  if (!list.length) return null;
  const score = (s: ScenarioInfo) =>
    (s.done === 0 ? 3 : s.done < s.steps.length ? 2 : 0) - Math.abs((s.minDifficulty + s.maxDifficulty) / 2 - targetDifficulty) * 0.5 - (s.best.every((b) => b >= 90) ? 3 : 0);
  return [...list].sort((a, b) => score(b) - score(a))[0];
}
