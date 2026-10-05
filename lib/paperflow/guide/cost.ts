import { creditsForUsage } from "../cloud/plans";

/**
 * The guide reads the whole paper once and reasons over it (definition → numbers → page marks with
 * verbatim quotes), so it runs on a stronger reasoning model than translation. If that model is not
 * available to the account, the route falls back to GUIDE_FALLBACK_MODEL.
 */
export const GUIDE_MODEL = () => (typeof process !== "undefined" && process.env.OPENAI_GUIDE_MODEL) || "gpt-5";
export const GUIDE_FALLBACK_MODEL = "gpt-4.1";
/** Reasoning models (gpt-5…, o-series) take a reasoning effort and spend part of the output budget thinking. */
export const isReasoningModel = (model: string) => /^(gpt-5|o\d)/.test(model);
/** About 3.6 characters per token for English paper text; the layered guide writes ~9,000 tokens, plus light reasoning. */
export function guideCreditEstimate(chars: number, model = "gpt-5") {
  return creditsForUsage(model, { input: Math.ceil(chars / 3.6) + 2400, output: isReasoningModel(model) ? 13000 : 9000 });
}
