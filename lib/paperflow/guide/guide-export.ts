/**
 * The PAPERFLOW AI reading guide as Markdown, in the same order as the in-app brief: the whole paper
 * first (definition, 10-second summary, takeaway, flow), then conditions, results, mechanisms,
 * takeaways, limitations, figures, background, and finally the page-by-page guide with its highlights.
 * Pure and deterministic (dates come from the guide itself); empty sections are left out; no HTML.
 */
type Ref = { unitId: string; page: number; quote?: string };
type Section = "INTRO" | "METHOD" | "RESULT" | "DISCUSSION" | "CONCLUSION" | "OTHER";
export type PaperType = "experimental" | "computational" | "theoretical" | "review";

/** The guide as the app stores it (structural: only what the export reads). */
export interface ExportGuide {
  paperType?: PaperType; model?: string; createdAt: string;
  definition: string; intro: string;
  tenSeconds: { why: string; what: string; how: string; found: string; conclusion: string };
  takeaway: string; flow: string[];
  composition: { label: string; value: string; ref?: Ref }[];
  conditions: { label: string; value: string; ref?: Ref }[];
  results: { keyword: string; headline: string; comparison: string; ref?: Ref }[];
  mechanisms: { chain: string[]; source: "author" | "ai"; note: string; ref?: Ref }[];
  takeaways: string[];
  limitations: { keyword: string; text: string }[];
  figures: { label: string; stars: number; what: string; look: string[]; conclusion: string; ref?: Ref }[];
  terms: { term: string; korean: string; explanation: string; ref?: Ref }[];
  introParts: { problem: string; gap: string; why: string; objective: string };
  conclusionParts: { finding: string; meaning: string; limitation: string; next: string };
  pages: { page: number; section: Section; title: string; items: { label: string; keyword: string; text: string }[]; next: string; marks: { kind: string; keyword: string; note: string; unitId: string; page: number; quote: string }[] }[];
}
export interface ExportMeta { title: string; authors?: string[]; year?: number; journal?: string }

/** The conditions section is named for what the paper is. */
export const CONDITIONS_HEADING: Record<PaperType, string> = {
  experimental: "핵심 실험조건", computational: "핵심 설정 · 파라미터", theoretical: "핵심 가정 · 파라미터", review: "검토 범위 · 기준"
};

/** One line of text: no line breaks, single spaces. */
const line = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
/** A table cell: one line, "|" escaped. */
const cell = (text: string | undefined) => line(text).replace(/\|/g, "\\|");
const page = (ref?: Ref) => ref ? `p.${ref.page}` : "";
const withPage = (text: string, ref?: Ref) => ref ? `${text} (p.${ref.page})` : text;
const has = (text: string | undefined) => line(text).length > 0;

export function guideMarkdown(guide: ExportGuide, meta: ExportMeta): string {
  const out: string[] = [];
  const section = (number: string, title: string, body: string[]) => { if (body.length) out.push(`## ${number} ${title}`, "", ...body, ""); };
  const table = (head: string[], rows: string[][]) => rows.length ? [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${row.map(cell).join(" | ")} |`)] : [];

  out.push(`# ${line(meta.title) || "논문"}`, "");
  const authors = (meta.authors ?? []).map(line).filter(Boolean);
  const byline = [authors.length > 3 ? `${authors.slice(0, 3).join(", ")} 외` : authors.join(", "), meta.year ? String(meta.year) : "", line(meta.journal)].filter(Boolean);
  const made = [guide.createdAt.slice(0, 10), line(guide.model)].filter(Boolean).join(", ");
  out.push([...byline, `PAPERFLOW AI 가이드${made ? ` (${made})` : ""}`].join(" · "), "");

  const about = has(guide.definition) ? [`> ${line(guide.definition)}`] : [];
  if (has(guide.intro)) about.push(...(about.length ? [""] : []), line(guide.intro));
  section("01", "이 논문은?", about);
  const ten = guide.tenSeconds;
  section("02", "10초 요약", table(["구분", "내용"], ([["왜", ten?.why], ["무엇", ten?.what], ["어떻게", ten?.how], ["결과", ten?.found], ["결론", ten?.conclusion]] as const).filter(([, text]) => has(text)).map(([label, text]) => [label, text ?? ""])));
  section("03", "한 줄 결론", has(guide.takeaway) ? [`**${line(guide.takeaway)}**`] : []);
  const flow = (guide.flow ?? []).map(line).filter(Boolean);
  section("04", "연구 흐름", flow.length ? [flow.join(" → ")] : []);
  section("05", "연구 구성", (guide.composition ?? []).filter(item => has(item.label) || has(item.value)).map(item => `- **${line(item.label)}**: ${withPage(line(item.value), item.ref)}`));
  section("06", CONDITIONS_HEADING[guide.paperType ?? "experimental"], table(["항목", "값", "근거"], (guide.conditions ?? []).filter(item => has(item.value)).map(item => [item.label, item.value, page(item.ref)])));
  section("07", "핵심 결과", (guide.results ?? []).filter(item => has(item.headline) || has(item.comparison)).flatMap((item, index) => {
    const head = [has(item.keyword) ? `**${line(item.keyword)}**` : "", line(item.headline)].filter(Boolean).join(" · ");
    const detail = [line(item.comparison), page(item.ref)].filter(Boolean).join(" · ");
    return [`${index + 1}. ${head}`, ...(detail ? [`   - ${detail}`] : [])];
  }));
  section("08", "왜 이런 결과가 나왔나?", (guide.mechanisms ?? []).filter(item => item.chain?.some(has) || has(item.note)).flatMap(item => {
    const chain = (item.chain ?? []).map(line).filter(Boolean).join(" → ");
    return [`- **${item.source === "author" ? "저자 해석" : "AI 해석"}** ${chain || line(item.note)}`, ...(chain && has(item.note) ? [`  - ${withPage(line(item.note), item.ref)}`] : !chain && item.ref ? [`  - ${page(item.ref)}`] : [])];
  }));
  section("09", "이 논문에서 가져갈 것", (guide.takeaways ?? []).map(line).filter(Boolean).map(text => `- ${text}`));
  section("10", "한계와 주의점", (guide.limitations ?? []).filter(item => has(item.text)).map(item => `- ${has(item.keyword) ? `**${line(item.keyword)}** ` : ""}${line(item.text)}`));
  section("11", "꼭 볼 Figure · Table", (guide.figures ?? []).filter(item => has(item.label)).flatMap(item => {
    const stars = Math.max(0, Math.min(5, Math.round(item.stars || 0)));
    return [
      `- **${line(item.label)}** ${"★".repeat(stars)}${"☆".repeat(5 - stars)}${has(item.what) ? ` ${line(item.what)}` : ""}${item.ref ? ` (p.${item.ref.page})` : ""}`,
      ...(item.look ?? []).map(line).filter(Boolean).map(look => `  - 볼 것: ${look}`),
      ...(has(item.conclusion) ? [`  - 결론: ${line(item.conclusion)}`] : [])
    ];
  }));
  const intro = guide.introParts, end = guide.conclusionParts;
  const parts = (title: string, rows: [string, string | undefined][]) => { const kept = rows.filter(([, text]) => has(text)); return kept.length ? [`**${title}**`, "", ...kept.map(([label, text]) => `- **${label}** ${line(text)}`), ""] : []; };
  const background = [
    ...(guide.terms ?? []).filter(item => has(item.term)).map(item => `- **${line(item.term)}**${has(item.korean) ? ` (${line(item.korean)})` : ""}${has(item.explanation) ? `: ${line(item.explanation)}` : ""}`),
    ...((guide.terms ?? []).some(item => has(item.term)) ? [""] : []),
    ...parts("Introduction", [["PROBLEM", intro?.problem], ["GAP", intro?.gap], ["WHY", intro?.why], ["OBJECTIVE", intro?.objective]]),
    ...parts("Conclusion", [["FINAL FINDING", end?.finding], ["PRACTICAL MEANING", end?.meaning], ["LIMITATION", end?.limitation], ["NEXT STEP", end?.next]])
  ];
  while (background.length && background[background.length - 1] === "") background.pop();
  section("12", "읽기 전에 알아둘 것", background);

  const pages = [...(guide.pages ?? [])].sort((a, b) => a.page - b.page).filter(item => item.items?.length || item.marks?.length || has(item.title));
  if (pages.length) {
    out.push("## 페이지별 가이드", "");
    for (const item of pages) {
      out.push([`### p.${item.page}`, item.section, line(item.title)].filter(Boolean).join(" · "), "");
      const items = (item.items ?? []).filter(entry => has(entry.text)).map(entry => `- **${[line(entry.label), line(entry.keyword)].filter(Boolean).join(" · ")}** ${line(entry.text)}`);
      if (items.length) out.push(...items, "");
      if (has(item.next)) out.push(`다음 → ${line(item.next)}`, "");
      // One blockquote per highlight: a blank line keeps them from merging.
      for (const mark of item.marks ?? []) out.push(`> [${line(mark.kind)}] ${has(mark.quote) ? `"${line(mark.quote)}"` : ""}${has(mark.quote) && has(mark.note) ? " — " : ""}${line(mark.note)}`, "");
    }
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return `${out.join("\n")}\n`;
}
