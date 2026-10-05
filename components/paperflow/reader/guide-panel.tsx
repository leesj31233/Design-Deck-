"use client";
import { useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { createGuide, loadGuide } from "@/lib/paperflow/guide/client";
import { readableError } from "@/lib/paperflow/errors";
import type { GuideCite, GuideClaim, GuideSummary } from "@/lib/paperflow/guide/guide";
import { KIND_INK, SECTION_LABEL } from "./guide-notes";

const SUMMARY: [keyof GuideSummary, string][] = [["why", "왜"], ["what", "무엇"], ["how", "어떻게"], ["result", "결과"], ["conclusion", "결론"]];

/** Mark a guide item's source paragraph on its page, bring it into view, and link it with an arrow. */
function focusSource(item: string, unitId: string, page: number, quote?: string) {
  useReaderStore.getState().set({ guideFocus: { unitId, page, key: Date.now(), item, quote } });
  document.querySelector(`[data-continuous-page="${page}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  // Once the page is rendered and the mark exists, centre the paragraph itself.
  setTimeout(() => document.querySelector(`[data-guide-mark="${CSS.escape(unitId)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 650);
}

/**
 * AI 가이드 tab, read top to bottom from the whole to the detail: definition, 10-second summary and
 * one-line conclusion always open; the deeper levels fold. Every cited item links to its source passage.
 */
export function GuidePanel() {
  const documentId = useReaderStore(s => s.documentId), currentPage = useReaderStore(s => s.currentPage), focus = useReaderStore(s => s.guideFocus), overlay = useReaderStore(s => s.guideOverlay);
  const manifest = useTranslationStore(s => s.manifest);
  const reduced = useReducedMotion(), client = useQueryClient();
  const guide = useQuery({ queryKey: ["guide", documentId], enabled: Boolean(documentId), queryFn: () => loadGuide(documentId!) });
  const make = useMutation({
    mutationFn: () => { if (!documentId || !manifest || manifest.documentId !== documentId) throw new Error("논문 구조를 분석하는 중입니다. 잠시 후 다시 눌러 주세요."); return createGuide(documentId, manifest); },
    onSuccess: value => { client.setQueryData(["guide", documentId], value); useReaderStore.getState().set({ guideOverlay: true }); void client.invalidateQueries({ queryKey: ["documents"] }); }
  });
  // Leaving the paper or the tab clears the temporary mark.
  useEffect(() => () => useReaderStore.getState().set({ guideFocus: null }), []);
  const data = guide.data;
  const enter = (index: number) => reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay: index * .04, type: "spring" as const, stiffness: 300, damping: 28 } };

  if (!data) return <div className="pf-inspector-section pf-guide-intro">
    <h3><Sparkles size={16}/> AI 논문 가이드</h3>
    <p>논문 전체 → 핵심 결과 → 수치 → 원문 순서로 정리합니다. 핵심 문장에는 유형별 색으로 표시하고 여백에 키워드 메모를 남깁니다.</p>
    {make.error && <p className="pf-error" role="alert">{readableError(make.error)}</p>}
    <Button size="sm" variant="primary" disabled={make.isPending || guide.isPending} onClick={() => make.mutate()}><Sparkles size={14}/>{make.isPending ? "정리하는 중… (1–2분)" : "가이드 만들기"}</Button>
  </div>;

  /** A source link (L14 원문): jumps to the passage and marks it. */
  const source = (item: string, cite: GuideCite, quote?: string) => cite.unitId && cite.page
    ? <button type="button" className="pf-guide-cite" data-guide-item={item} data-active={focus?.item === item || undefined} onClick={() => focusSource(item, cite.unitId!, cite.page!, quote)}>p.{cite.page}</button>
    : null;
  const level = (index: number, id: string, title: string, body: ReactNode, open = true, tag = `L${index}`) => <motion.details key={id} className="pf-guide-level" open={open} {...enter(index)}>
    <summary><span className="pf-guide-level-no">{tag}</span>{title}</summary>{body}
  </motion.details>;
  const who = (claim: GuideClaim) => <span className="pf-guide-who" data-source={claim.source}>{claim.source === "author" ? "저자 해석" : "AI 해석"}</span>;
  const current = data.pages.find(page => page.page === currentPage)?.page ?? data.pages[0]?.page;

  return <div className="pf-guide">
    <div className="pf-guide-toggle"><Button size="sm" variant={overlay ? "primary" : "secondary"} onClick={() => useReaderStore.getState().set({ guideOverlay: !overlay })}><Sparkles size={13}/>{overlay ? "논문 위 표시 숨기기" : "논문 위에 표시하기"}</Button></div>
    <motion.section className="pf-guide-hero" {...enter(0)}>
      <span className="pf-guide-label">이 논문은?</span>
      <p className="pf-guide-definition">{data.definition}</p>
    </motion.section>
    <motion.section className="pf-guide-block" {...enter(1)}>
      <span className="pf-guide-label">10초 요약</span>
      <dl className="pf-guide-summary">{SUMMARY.map(([key, label]) => data.summary[key] && <div key={key}><dt>{label}</dt><dd>{data.summary[key]}</dd></div>)}</dl>
    </motion.section>
    {data.takeaway && <motion.p className="pf-guide-takeaway" {...enter(2)}><span className="pf-guide-label">한 줄 결론</span>{data.takeaway}</motion.p>}
    {data.flow.length > 0 && level(4, "flow", "연구 흐름", <ol className="pf-guide-flowchart">{data.flow.map((step, index) => <li key={step.label + index}><b>{step.label}</b>{step.detail && <span>{step.detail}</span>}</li>)}</ol>)}
    {data.structure.length > 0 && level(5, "structure", "연구 구성", <dl className="pf-guide-facts">{data.structure.map((fact, index) => <div key={fact.label + index}><dt>{fact.label}</dt><dd>{fact.value}{source(`structure-${index}`, fact)}</dd></div>)}</dl>)}
    {data.conditions.length > 0 && level(6, "conditions", "핵심 실험조건", <dl className="pf-guide-facts" data-kind="condition">{data.conditions.map((fact, index) => <div key={fact.label + index}><dt>{fact.label}</dt><dd>{fact.value}{source(`condition-${index}`, fact)}</dd></div>)}</dl>)}
    {data.results.length > 0 && level(7, "results", "핵심 결과", <ol className="pf-guide-results">{data.results.map((result, index) => <li key={result.claim + index}>
      <button type="button" data-guide-item={`result-${index}`} data-active={focus?.item === `result-${index}` || undefined} disabled={!result.unitId} onClick={() => result.unitId && result.page && focusSource(`result-${index}`, result.unitId, result.page, result.quote)}>
        <span className="pf-guide-index">{index + 1}</span>
        <span className="pf-guide-body"><b>{result.claim}</b>{result.detail && <small>{result.detail}</small>}{result.quote && <q>{result.quote}</q>}{result.page && <em>원문 p.{result.page}</em>}</span>
      </button>
    </li>)}</ol>)}
    {data.mechanisms.length > 0 && level(8, "mechanisms", "왜? (메커니즘)", <ul className="pf-guide-claims">{data.mechanisms.map((claim, index) => <li key={index}>{who(claim)}<span>{claim.text}</span>{source(`mechanism-${index}`, claim)}</li>)}</ul>, false)}
    {data.applications.length > 0 && level(9, "applications", "가져갈 것", <ul className="pf-guide-list">{data.applications.map(item => <li key={item}>{item}</li>)}</ul>, false)}
    {data.limitations.length > 0 && level(10, "limitations", "한계", <ul className="pf-guide-claims">{data.limitations.map((claim, index) => <li key={index}>{who(claim)}<span>{claim.text}</span>{source(`limitation-${index}`, claim)}</li>)}</ul>, false)}
    {data.figures.length > 0 && level(11, "figures", "Figure · Table 가이드", <ul className="pf-guide-figures">{data.figures.map((figure, index) => <li key={figure.label + index}>
      <div className="pf-guide-figure-head"><b>{figure.label}</b><span className="pf-guide-stars" aria-label={`중요도 ${figure.importance}/5`}>{"★".repeat(figure.importance)}<i>{"★".repeat(5 - figure.importance)}</i></span>{source(`figure-${index}`, figure)}</div>
      {figure.title && <p>{figure.title}</p>}
      {figure.look.length > 0 && <ul>{figure.look.map(item => <li key={item}><span className="pf-guide-label">볼 것</span>{item}</li>)}</ul>}
    </li>)}</ul>, false)}
    {data.pages.length > 0 && level(12, "pages", "페이지 가이드", <div className="pf-guide-pages">{data.pages.map(page => <details key={page.page} className="pf-guide-pagecard" open={page.page === current}>
      <summary><span className="pf-guide-page-no">p.{page.page}</span><span className="pf-guide-label">{SECTION_LABEL[page.section]}</span><span className="pf-guide-page-about">{page.about}</span></summary>
      {page.key && <p className="pf-guide-page-key"><b>핵심</b>{page.key}</p>}
      {page.numbers.length > 0 && <ul className="pf-guide-page-numbers">{page.numbers.map(number => <li key={number}>{number}</li>)}</ul>}
      {page.details.length > 0 && <ul className="pf-guide-details">{page.details.map((detail, index) => <li key={index}><span className="pf-guide-label">{detail.tag}</span>{detail.text}</li>)}</ul>}
      {page.marks.length > 0 && <ul className="pf-guide-marklist">{page.marks.map((mark, index) => <li key={index}><button type="button" data-guide-item={`mark-${page.page}-${index}`} data-active={focus?.item === `mark-${page.page}-${index}` || undefined} style={{ borderColor: KIND_INK[mark.kind].ink }} onClick={() => focusSource(`mark-${page.page}-${index}`, mark.unitId, mark.page, mark.quote)}><span className="pf-guide-label" style={{ color: KIND_INK[mark.kind].ink }}>{KIND_INK[mark.kind].label}</span>{mark.note}</button></li>)}</ul>}
    </details>)}</div>, false)}
    {data.terms.length > 0 && level(13, "terms", "주요 용어", <dl className="pf-guide-terms">{data.terms.map((term, index) => <div key={term.term} data-guide-item={`term-${index}`} data-active={focus?.item === `term-${index}` || undefined}><dt>{term.unitId && term.page ? <button type="button" onClick={() => focusSource(`term-${index}`, term.unitId!, term.page!)}>{term.term}</button> : term.term}</dt><dd>{term.explanation}</dd></div>)}</dl>, false, "+")}
    <div className="pf-guide-footer">
      {focus && <Button size="sm" variant="ghost" onClick={() => useReaderStore.getState().set({ guideFocus: null })}>표시 지우기</Button>}
      <Button size="sm" variant="ghost" disabled={make.isPending} onClick={() => make.mutate()}><RefreshCw size={13}/>{make.isPending ? "다시 만드는 중…" : "다시 만들기"}</Button>
      <small>{new Date(data.createdAt).toLocaleDateString("ko-KR")} 생성{data.model ? ` · ${data.model}` : ""} · p.번호를 누르면 원문 근거로 이동</small>
    </div>
  </div>;
}
