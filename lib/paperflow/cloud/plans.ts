/**
 * Plans and translation credits. 1 credit = 1 translated paragraph (about 400 tokens, ~0.4 KRW);
 * an average paper is 76 paragraphs (13-paper measurement, docs/PAPERFLOW_ECONOMICS.md).
 * Paragraphs served from the shared translation cache cost nothing.
 */
export type PlanTier = "tester" | "basic" | "pro" | "admin";
export const PLAN_TIERS: PlanTier[] = ["tester", "basic", "pro", "admin"];
export const PARAGRAPHS_PER_PAPER = 76;
const MB = 1024 * 1024;

export interface PlanSpec { label: string; storageBytes: number | null; monthlyCredits: number | null }
export const PLANS: Record<PlanTier, PlanSpec> = {
  tester: { label: "Tester", storageBytes: 100 * MB, monthlyCredits: 800 },
  basic: { label: "Basic", storageBytes: 1024 * MB, monthlyCredits: 2000 },
  pro: { label: "Pro", storageBytes: 10 * 1024 * MB, monthlyCredits: 6000 },
  admin: { label: "관리자", storageBytes: null, monthlyCredits: null }
};

/** USD per 1M tokens: input, cached input, output. Unknown models are priced like gpt-4.1. */
export const MODEL_PRICES: Record<string, [number, number, number]> = { "gpt-5.1": [1.25, .125, 10], "gpt-5-mini": [.25, .025, 2], "gpt-5-nano": [.05, .005, .4], "gpt-5": [1.25, .125, 10], "gpt-4.1-mini": [.4, .1, 1.6], "gpt-4.1": [2, .5, 8], "gpt-4.1-nano": [.1, .025, .4], "gpt-4o-mini": [.15, .075, .6], "gpt-4o": [2.5, 1.25, 10] };
/** One credit is worth one translated paragraph: about $0.0003. */
export const CREDIT_USD = .0003;
export function creditsForUsage(model: string | undefined, usage: { input: number; output: number; cached?: number }) {
  const key = Object.keys(MODEL_PRICES).sort((a, b) => b.length - a.length).find(name => model?.startsWith(name)) ?? "gpt-4.1";
  const [input, cached, output] = MODEL_PRICES[key], hit = Math.min(usage.cached ?? 0, usage.input);
  return Math.max(1, Math.ceil(((usage.input - hit) * input + hit * cached + usage.output * output) / 1e6 / CREDIT_USD));
}
/** What each AI feature costs, in paragraph credits (the guide's real cost is charged by usage). */
export const CREDIT_COST = { paragraph: 1, guide: 30, concept: 3 } as const;

export const isPlanTier = (value: unknown): value is PlanTier => typeof value === "string" && (PLAN_TIERS as string[]).includes(value);
/** About how many average papers a number of credits translates. */
export const papersFor = (credits: number) => Math.max(0, Math.floor(credits / PARAGRAPHS_PER_PAPER));
/** The credit month, in Korean time ("2026-10"). Credits start over on the 1st. */
export function creditMonth(now = Date.now()) { return new Date(now + 9 * 3_600_000).toISOString().slice(0, 7); }
