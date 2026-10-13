import { ARTICLES, BE_FORMS, MODALS, PREPOSITIONS, isFunctionWord, isSpellingVariant, type Token } from "./text";

function fnClass(w: string): string {
  if (ARTICLES.has(w)) return "article";
  if (PREPOSITIONS.has(w)) return "prep";
  if (BE_FORMS.has(w)) return "be";
  if (MODALS.has(w)) return "modal";
  return "other";
}

export type AlignOp =
  | { type: "match"; li: number; ti: number }
  | { type: "spell"; li: number; ti: number }
  | { type: "inflect"; li: number; ti: number }
  | { type: "sub"; li: number; ti: number }
  /** Target token missing in the learner answer; insert before learner index `at`. */
  | { type: "ins"; ti: number; at: number }
  /** Learner token not in the target. */
  | { type: "del"; li: number };

export interface Alignment {
  ops: AlignOp[];
  cost: number;
  /** cost / max(len) — 0 identical, ~1 unrelated. */
  distance: number;
  /** Pairs of (learner del index, target ins index) holding the same word: moved tokens. */
  moves: { li: number; ti: number; at: number }[];
}

function pairCost(a: Token, b: Token): { cost: number; type: "match" | "spell" | "inflect" | "sub" } {
  if (a.norm === b.norm) return { cost: 0, type: "match" };
  if (a.num !== undefined && a.num === b.num) return { cost: 0, type: "match" }; // "3" = "three"
  if (a.stem === b.stem) return { cost: 0.4, type: "inflect" };
  if (isSpellingVariant(a.norm, b.norm)) return { cost: 0.25, type: "spell" };
  const bothFunction = isFunctionWord(a.norm) && isFunctionWord(b.norm);
  // Prefer swapping like for like (on→at, a→the) over cross-class swaps (on→the).
  const sameClass = bothFunction && fnClass(a.norm) === fnClass(b.norm) && fnClass(a.norm) !== "other";
  return { cost: sameClass ? 0.6 : bothFunction ? 0.9 : 1.1, type: "sub" };
}

/**
 * The cost alone, memoized by the two words: it depends only on their normalized forms (stems and number
 * keys are derived from them), and the same answer is aligned against the same targets several times.
 */
const COST_CACHE = new Map<string, number>();
function costOf(a: Token, b: Token): number {
  if (a.norm === b.norm) return 0;
  const key = a.norm + "\u0000" + b.norm;
  let c = COST_CACHE.get(key);
  if (c === undefined) {
    if (COST_CACHE.size > 50_000) COST_CACHE.clear();
    c = pairCost(a, b).cost;
    COST_CACHE.set(key, c);
  }
  return c;
}

/** Needleman–Wunsch style alignment over word tokens. */
export function align(learner: Token[], target: Token[]): Alignment {
  const n = learner.length;
  const m = target.length;
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const B: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)); // 0 diag, 1 up(del), 2 left(ins)
  for (let i = 1; i <= n; i++) {
    D[i][0] = i;
    B[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    D[0][j] = j;
    B[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = D[i - 1][j - 1] + costOf(learner[i - 1], target[j - 1]);
      const up = D[i - 1][j] + 1;
      const left = D[i][j - 1] + 1;
      if (diag <= up && diag <= left) {
        D[i][j] = diag;
        B[i][j] = 0;
      } else if (up <= left) {
        D[i][j] = up;
        B[i][j] = 1;
      } else {
        D[i][j] = left;
        B[i][j] = 2;
      }
    }
  }
  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const b = i === 0 ? 2 : j === 0 ? 1 : B[i][j];
    if (b === 0) {
      const pc = pairCost(learner[i - 1], target[j - 1]);
      ops.push({ type: pc.type, li: i - 1, ti: j - 1 } as AlignOp);
      i--;
      j--;
    } else if (b === 1) {
      ops.push({ type: "del", li: i - 1 });
      i--;
    } else {
      ops.push({ type: "ins", ti: j - 1, at: i });
      j--;
    }
  }
  ops.reverse();
  const cost = D[n][m];
  const distance = cost / Math.max(1, Math.max(n, m));

  // Detect moved words: a deleted learner word equal (by stem) to an inserted target word.
  const dels = ops.filter((o): o is Extract<AlignOp, { type: "del" }> => o.type === "del");
  const inss = ops.filter((o): o is Extract<AlignOp, { type: "ins" }> => o.type === "ins");
  const moves: Alignment["moves"] = [];
  const usedIns = new Set<number>();
  for (const d of dels) {
    const lt = learner[d.li];
    const hit = inss.find((o) => !usedIns.has(o.ti) && (target[o.ti].norm === lt.norm || target[o.ti].stem === lt.stem));
    if (hit && !/^(a|an|the|to|of|and)$/.test(lt.norm)) {
      usedIns.add(hit.ti);
      moves.push({ li: d.li, ti: hit.ti, at: hit.at });
    }
  }
  return { ops, cost, distance, moves };
}
