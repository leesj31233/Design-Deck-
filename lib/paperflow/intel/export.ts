import { KIND_LABEL, RELIABILITY_LABEL, STATUS_LABEL, STAGE_LABEL, type IntelItem } from "./types";

const cell = (value: unknown) => { const text = String(value ?? "").replace(/\s+/g, " ").trim(); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };

/** The evidence and source register (⑦) as CSV for Excel: one row per item, with its key figures. */
export function registerCsv(items: IntelItem[]) {
  const head = ["구분", "제목(원문)", "제목(한국어)", "발행기관·기업", "저자", "발행일", "국가", "언어", "출처 유형", "신뢰도", "확인 상태", "단계", "핵심 데이터", "원문 URL", "PDF URL", "확인일"];
  const rows = items.map(item => [
    KIND_LABEL[item.kind], item.title, item.titleKo, item.org, item.authors, item.date, item.country, item.lang, item.sourceType,
    item.reliability ? `${item.reliability} ${RELIABILITY_LABEL[item.reliability] ?? ""}` : "", item.status ? STATUS_LABEL[item.status] : "", item.stage ? STAGE_LABEL[item.stage] : "",
    (item.data ?? []).map(datum => `${datum.label}: ${datum.value}${datum.unit ? ` ${datum.unit}` : ""}${datum.basis ? ` (${datum.basis})` : ""}${datum.where ? ` [${datum.where}]` : ""}`).join(" / "),
    item.url, item.pdfUrl, item.checkedAt
  ]);
  // A byte-order mark so Excel reads the Korean as UTF-8.
  return "﻿" + [head, ...rows].map(row => row.map(cell).join(",")).join("\r\n");
}

/** The same register as Markdown, grouped by kind, for a report or a note. */
export function registerMarkdown(items: IntelItem[], title = "Evidence & Source Register") {
  const lines = [`# ${title}`, "", `${items.length}건 · ${new Date().toISOString().slice(0, 10)} 기준`, ""];
  for (const kind of Object.keys(KIND_LABEL) as IntelItem["kind"][]) {
    const group = items.filter(item => item.kind === kind);
    if (!group.length) continue;
    lines.push(`## ${KIND_LABEL[kind]} (${group.length})`, "");
    for (const item of group) {
      lines.push(`### ${item.titleKo ?? item.title}`, `- 원문: ${item.title}`, `- ${[item.org, item.date, item.country].filter(Boolean).join(" · ")}`);
      lines.push(`- 신뢰도 ${item.reliability ?? "?"} (${item.reliability ? RELIABILITY_LABEL[item.reliability] : "미분류"}) · ${item.status ? STATUS_LABEL[item.status] : "상태 미기재"}${item.stage ? ` · ${STAGE_LABEL[item.stage]}` : ""}`);
      if (item.url) lines.push(`- 링크: ${item.url}${item.pdfUrl ? ` · PDF: ${item.pdfUrl}` : ""}`);
      for (const datum of item.data ?? []) lines.push(`  - ${datum.label}: **${datum.value}**${datum.unit ? ` ${datum.unit}` : ""}${datum.basis ? ` (${datum.basis})` : ""}${datum.where ? ` — ${datum.where}` : ""}`);
      if (item.summaryKo) lines.push("", item.summaryKo);
      lines.push("");
    }
  }
  return lines.join("\n");
}
