/**
 * Numbers said in an answer, however they are written: "3" or "three", "twenty-five", "90,000",
 * "15th" or "fifteenth", "2.5" or "two and a half", "5:30" or "five thirty", "3-4" or "three or four".
 * The word alignment treats a number like any other content word, so this is what catches a wrong
 * one ("Line 4" for "Line 5", "twenty" for "thirty") — and lets "3 pm" stand for "three pm".
 */
import { tokenize, words, wordsOf, type Token } from "./text";
import { COMPOUND_ORDINALS, canFollow, digitValue, wordKind, type NumberKind } from "./numwords";

export interface NumberMention {
  value: number;
  /** Word-token range [from, to) in the text's words. */
  from: number;
  to: number;
  /** The words as written. */
  raw: string;
}

/** A plain "one" is a number only next to something counted or a time ("one more week", "at one"), not "this one". */
const COUNTED = /^(more|minutes?|hours?|days?|weeks?|months?|years?|times?|nights?|person|people|pages?|slides?|rooms?|tickets?|cups?|bottles?|pieces?|dollars?|won|euros?|percent|points?|items?|units?|stops?|floors?|blocks?|meters?|kilometers?|miles?|kg|tons?|oclock|pm|am|p\.m|a\.m|hundred|thousand|million|billion|and)$/;
const BEFORE_ONE = /^(at|until|till|by|from|to|number|line|gate|platform|exit|room|floor|page|step|option|level|phase|track|terminal|channel|chapter|section|table|figure|version|round|zone|door|counter|seat|row|bay|unit)$/;

interface Part {
  s: string;
  /** Word tokens it comes from (two for "90" "," "000"). */
  t0: number;
  t1: number;
  /** Joined to the previous part inside one token ("twenty-five"). */
  hyphen: boolean;
}

/** Numbers in already-tokenized words; `text` is the string the tokens point into. */
export function numbersOf(w: Token[], text: string): NumberMention[] {
  // Split hyphenated tokens ("twenty-five", "3-4", "five-minute") and join "90,000" back together.
  const parts: Part[] = [];
  for (let i = 0; i < w.length; i++) {
    const t = w[i];
    if (t.expanded && i > 0 && w[i - 1].start === t.start) continue; // second half of a contraction
    const prev = parts[parts.length - 1];
    if (prev && /^\d+$/.test(prev.s) && /^\d{3}$/.test(t.norm) && text.slice(w[i - 1].end, t.start) === ",") {
      prev.s += t.norm;
      prev.t1 = i;
      continue;
    }
    t.norm.split("-").forEach((s, k) => s && parts.push({ s, t0: i, t1: i, hyphen: k > 0 }));
  }

  const out: NumberMention[] = [];
  const raw = (from: number, to: number) => text.slice(w[from].start, w[to - 1].end);
  const push = (value: number, fromPart: number, toPart: number) => {
    let to = parts[toPart].t1 + 1;
    let v = value;
    // "two and a half", "3 and a half": the half belongs to the number.
    const k = toPart + 1;
    if (!w[parts[toPart].t1].breakAfter && parts[k]?.s === "and" && parts[k + 1]?.s === "a" && parts[k + 2]?.s === "half") {
      v += 0.5;
      to = parts[k + 2].t1 + 1;
    }
    const from = parts[fromPart].t0;
    out.push({ value: v, from, to, raw: raw(from, to) });
  };

  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    const d = digitValue(p.s);
    if (d !== null) {
      push(d, i, i);
      i++;
      continue;
    }
    if (!wordKind(p.s)) {
      i++;
      continue;
    }
    // A run of number words: "two hundred and fifty", "twenty-five", "twenty-first".
    let cur = 0;
    let total = 0;
    let prev: NumberKind | null = null;
    const start = i;
    let end = i;
    while (i < parts.length) {
      const s = parts[i].s;
      // "nineteen hundred, two thousand": punctuation ends a number.
      if (i > start && !parts[i].hyphen && w[parts[i - 1].t1].breakAfter) break;
      if (s === "and" && (prev === "hundred" || prev === "scale") && parts[i + 1] && wordKind(parts[i + 1].s) && wordKind(parts[i + 1].s)![1] !== "hundred") {
        i++;
        continue;
      }
      const ord: number | null = parts[i].hyphen && prev === "tens" && s in COMPOUND_ORDINALS ? COMPOUND_ORDINALS[s] : null;
      const wk: [number, NumberKind] | null = ord !== null ? [ord, "unit"] : wordKind(s);
      if (!wk || !canFollow(prev, wk[1])) break;
      const [v, k]: [number, NumberKind] = wk;
      if (k === "hundred") cur = (cur || 1) * 100;
      else if (k === "scale") {
        total += (cur || 1) * v;
        cur = 0;
      } else cur += v;
      prev = k;
      end = i;
      i++;
    }
    const value = total + cur;
    const single = end === start;
    // "one" on its own counts only next to something counted or a time.
    if (single && p.s === "one") {
      const before = start > 0 ? parts[start - 1].s : "";
      const after = parts[end + 1]?.s ?? "";
      if (!COUNTED.test(after) && !BEFORE_ONE.test(before)) continue;
      if (after === "and" && parts[end + 2]?.s !== "a") continue;
    }
    push(value, start, end);
  }
  return out;
}

export function numbersIn(text: string): NumberMention[] {
  return numbersOf(words(tokenize(text)), text);
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Units a number can be converted between ("24 months" = "two years"): different units are not compared. */
const UNIT_STEM = /^(second|minut|hour|day|week|month|year|decad|night|dollar|won|euro|cent|percent|meter|metr|kilometer|km|mile|kg|kilogram|gram|ton|tonn|liter|litr|bar|degre|time|o'clock|oclock|pm|am|p\.m|a\.m|t\/h)$/;

interface Context {
  /** What is counted: the word after the number ("weeks"), or the rest of "eight-year-old". */
  next?: string;
  /** The word before it ("Line 4", "at five"). */
  prev?: string;
}

function contextOf(m: NumberMention, w: Token[]): Context {
  const last = w[m.to - 1];
  const inner = /-([a-z].*)$/.exec(last.norm)?.[1];
  const next = inner ?? (!last.breakAfter && w[m.to] ? w[m.to].stem : undefined);
  const prev = m.from > 0 && !w[m.from - 1].breakAfter ? w[m.from - 1].norm : undefined;
  return { next, prev };
}

/** Clock times: "17:00" is 5 o'clock. */
function clockValue(m: NumberMention, w: Token[], text: string): number {
  const t = w[m.to - 1];
  return text.slice(t.end, t.end + 1) === ":" && m.value > 12 && m.value < 24 ? m.value - 12 : m.value;
}

/**
 * A number in the answer that no correct answer has, where the closest correct answer has another
 * number for the same thing (the same word after it, or before it): the learner said a different
 * time, amount or number. Returns the first such slip with the number to say instead (as the closest
 * answer writes it), or null. Numbers of different units ("24 months" / "two years") are not compared.
 */
export function numberSlip(
  answerWords: Token[],
  answer: string,
  targets: string[],
  closest: string,
): { at: NumberMention; fix: NumberMention } | null {
  const mineRaw = numbersOf(answerWords, answer);
  if (!mineRaw.length) return null;
  const mine = mineRaw.map((m) => ({ m, v: clockValue(m, answerWords, answer), ctx: contextOf(m, answerWords) }));
  const sets = targets.map((t) => {
    const tw = wordsOf(t);
    return { t, nums: numbersOf(tw, t).map((m) => ({ m, v: clockValue(m, tw, t), ctx: contextOf(m, tw) })) };
  });
  // Fine when any correct answer says every number the learner said (as many times).
  const covers = (list: { v: number }[], said: { v: number }[]) => {
    const left = [...list];
    return said.every((x) => {
      const k = left.findIndex((y) => same(y.v, x.v));
      if (k < 0) return false;
      left.splice(k, 1);
      return true;
    });
  };
  if (sets.some((s) => covers(s.nums, mine))) return null;
  const best = sets.find((s) => s.t === closest) ?? sets[0];
  if (!best) return null;
  // Pair equal numbers, preferring the one that counts the same thing ("at 4" with "at 4", not with "4 pm").
  const sameThing = (a: Context, b: Context) => (!!a.next && a.next === b.next) || (!!a.prev && a.prev === b.prev);
  const left = [...best.nums];
  const extra = mine.filter((x) => {
    const equal = left.filter((y) => same(y.v, x.v));
    if (!equal.length) return true;
    left.splice(left.indexOf(equal.find((y) => sameThing(x.ctx, y.ctx)) ?? equal[0]), 1);
    return false;
  });
  for (const x of extra) {
    for (const y of left) {
      const unitsDiffer = !!x.ctx.next && !!y.ctx.next && x.ctx.next !== y.ctx.next && UNIT_STEM.test(x.ctx.next) && UNIT_STEM.test(y.ctx.next);
      if (unitsDiffer) continue;
      if (sameThing(x.ctx, y.ctx)) return { at: x.m, fix: y.m };
    }
  }
  return null;
}
