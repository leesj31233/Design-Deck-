import type { FsrsState, Grade } from "./types";

/**
 * FSRS-5 memory model (Free Spaced Repetition Scheduler) with the published
 * default parameters. Pure functions; all times in epoch ms, intervals in days.
 * Reference: open-spaced-repetition/fsrs4anki (FSRS-5 formulas).
 */
export const FSRS_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605,
  2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

export const DECAY = -0.5;
export const FACTOR = 19 / 81; // makes R(S, S) = 0.9
export const DAY_MS = 86_400_000;
export const DESIRED_RETENTION = 0.9;

const w = FSRS_W;
const clampD = (d: number) => Math.min(10, Math.max(1, d));

export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

export function intervalForRetention(stability: number, retention = DESIRED_RETENTION): number {
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

export function initStability(g: Grade): number {
  return Math.max(0.1, w[g - 1]);
}

export function initDifficulty(g: Grade): number {
  return clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);
}

export function nextDifficulty(d: number, g: Grade): number {
  const delta = -w[6] * (g - 3);
  const dPrime = d + (delta * (10 - d)) / 9; // linear damping
  return clampD(w[7] * initDifficulty(4) + (1 - w[7]) * dPrime); // mean reversion
}

export function recallStability(d: number, s: number, r: number, g: Grade): number {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return s * (Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy + 1);
}

export function forgetStability(d: number, s: number, r: number): number {
  const sf = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(sf, s);
}

export function shortTermStability(s: number, g: Grade): number {
  return s * Math.exp(w[17] * (g - 3 + w[18]));
}

export function newFsrsState(): FsrsState {
  return { stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReview: null };
}

/** Update the memory state after a review with grade `g` at time `now`. */
export function reviewFsrs(state: FsrsState, g: Grade, now: number): { state: FsrsState; retrievability: number | null } {
  if (state.reps === 0 || state.lastReview === null) {
    return {
      state: { stability: initStability(g), difficulty: initDifficulty(g), reps: 1, lapses: g === 1 ? 1 : 0, lastReview: now },
      retrievability: null,
    };
  }
  const elapsed = (now - state.lastReview) / DAY_MS;
  let stability: number;
  let r: number | null = null;
  if (elapsed < 1) {
    stability = shortTermStability(state.stability, g);
  } else {
    r = retrievability(elapsed, state.stability);
    stability = g === 1 ? forgetStability(state.difficulty, state.stability, r) : recallStability(state.difficulty, state.stability, r, g);
  }
  return {
    state: {
      stability: Math.max(0.1, stability),
      difficulty: nextDifficulty(state.difficulty, g),
      reps: state.reps + 1,
      lapses: state.lapses + (g === 1 ? 1 : 0),
      lastReview: now,
    },
    retrievability: r,
  };
}
