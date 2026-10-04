import { creditsForUsage } from "../cloud/plans";

/** The guide reads the whole paper once, so it runs on a stronger model than translation. */
export const GUIDE_MODEL = () => (typeof process !== "undefined" && process.env.OPENAI_GUIDE_MODEL) || "gpt-4.1";
/** About 3.6 characters per token for English paper text; the guide writes up to ~4,500 tokens. */
export function guideCreditEstimate(chars: number, model = "gpt-4.1") {
  return creditsForUsage(model, { input: Math.ceil(chars / 3.6) + 1400, output: 4500 });
}
