import { creditsForUsage } from "../cloud/plans";

/** The brief reads and reasons over the whole paper: the strongest model. */
export const GUIDE_MODEL = () => (typeof process !== "undefined" && process.env.OPENAI_GUIDE_MODEL) || "gpt-5.1";
/** Page guides are many small, well-scoped calls: a fast model keeps them detailed and affordable. */
export const GUIDE_PAGE_MODEL = () => (typeof process !== "undefined" && process.env.OPENAI_GUIDE_PAGE_MODEL) || "gpt-5-mini";
/**
 * About 3.6 characters per token of English paper text. Measured (12-page paper): the brief writes
 * ~3,600 tokens on gpt-5.1 at low reasoning effort, each six-page group ~2,500 on gpt-5-mini (v4; v5 margin notes about twice as long).
 */
export function guideCreditEstimate(chars: number, mode: "brief" | "pages" | "all" = "all", groups = Math.ceil(Math.max(1, chars / 18000))) {
  const brief = creditsForUsage(GUIDE_MODEL(), { input: Math.ceil(chars / 3.6) + 1600, output: 4500 });
  const pages = creditsForUsage(GUIDE_PAGE_MODEL(), { input: Math.ceil(chars / 3.6) + 1400 * groups, output: 5500 * groups });
  return mode === "brief" ? brief : mode === "pages" ? Math.ceil(pages / groups) : brief + pages;
}
