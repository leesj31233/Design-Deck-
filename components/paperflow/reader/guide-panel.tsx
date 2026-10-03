"use client";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles, RefreshCw, Target, BookOpenCheck, FlaskConical, AlertTriangle, HelpCircle, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { createGuide, loadGuide } from "@/lib/paperflow/guide/client";
import { readableError } from "@/lib/paperflow/errors";

/** Mark a guide item's source paragraph on its page, bring it into view, and link it with an arrow. */
function focusSource(item: string, unitId: string, page: number, quote?: string) {
  useReaderStore.getState().set({ guideFocus: { unitId, page, key: Date.now(), item, quote } });
  document.querySelector(`[data-continuous-page="${page}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  // Once the page is rendered and the mark exists, centre the paragraph itself.
  setTimeout(() => document.querySelector(`[data-guide-mark="${CSS.escape(unitId)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 650);
}

/** AI 가이드 tab: the study guide of this paper, each finding tied to its source paragraph. */
export function GuidePanel() {
  const documentId = useReaderStore(s => s.documentId), focus = useReaderStore(s => s.guideFocus);
  const manifest = useTranslationStore(s => s.manifest);
  const reduced = useReducedMotion(), client = useQueryClient();
  const guide = useQuery({ queryKey: ["guide", documentId], enabled: Boolean(documentId), queryFn: () => loadGuide(documentId!) });
  const make = useMutation({
    mutationFn: () => { if (!documentId || !manifest || manifest.documentId !== documentId) throw new Error("논문 구조를 분석하는 중이다. 잠시 후 다시 눌러 달라."); return createGuide(documentId, manifest); },
    onSuccess: value => { client.setQueryData(["guide", documentId], value); void client.invalidateQueries({ queryKey: ["documents"] }); }
  });
  // Leaving the paper or the tab clears the temporary mark.
  useEffect(() => () => useReaderStore.getState().set({ guideFocus: null }), []);
  const data = guide.data;
  const enter = (index: number) => reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay: index * .04, type: "spring" as const, stiffness: 300, damping: 28 } };

  if (!data) return <div className="pf-inspector-section pf-guide-intro">
    <h3><Sparkles size={16}/> AI 논문 가이드</h3>
    <p>논문 전체를 읽고 개요, 핵심 기여, 방법, 핵심 결과, 용어, 한계, 공부할 질문을 정리한다. 핵심 결과를 누르면 근거 문단이 PDF에 표시되고 화살표로 연결된다.</p>
    <p className="pf-guide-note">원문 근거 문장은 PDF 본문과 대조해 확인된 것만 보여 준다. 가이드는 읽기를 돕는 도구이며, 수치와 주장은 원문에서 확인한다. 한 편당 한 번 만들고 저장한다(약 $0.01–0.02, 같은 논문을 먼저 만든 사람이 있으면 무료).</p>
    {make.error && <p className="pf-error" role="alert">{readableError(make.error)}</p>}
    <Button size="sm" variant="primary" disabled={make.isPending || guide.isPending} onClick={() => make.mutate()}><Sparkles size={14}/>{make.isPending ? "논문을 읽고 정리하는 중… (20–40초)" : "가이드 만들기"}</Button>
  </div>;

  return <div className="pf-guide">
    <motion.section className="pf-inspector-section" {...enter(0)}><h3><BookOpenCheck size={15}/> 개요</h3><p className="pf-guide-overview">{data.overview}</p></motion.section>
    {data.contributions.length > 0 && <motion.section className="pf-inspector-section" {...enter(1)}><h3><Target size={15}/> 핵심 기여</h3><ul className="pf-guide-list">{data.contributions.map(item => <li key={item}>{item}</li>)}</ul></motion.section>}
    {data.method && <motion.section className="pf-inspector-section" {...enter(2)}><h3><FlaskConical size={15}/> 방법</h3><p>{data.method}</p></motion.section>}
    {data.findings.length > 0 && <motion.section className="pf-inspector-section" {...enter(3)}>
      <h3>핵심 결과 <small>누르면 원문 근거로 이동</small></h3>
      <ol className="pf-guide-findings">{data.findings.map((item, index) => <li key={item.unitId + index}>
        <button type="button" data-guide-item={`finding-${index}`} data-active={focus?.item === `finding-${index}` || undefined} onClick={() => focusSource(`finding-${index}`, item.unitId, item.page, item.quote)}>
          <span className="pf-guide-index">{index + 1}</span>
          <span className="pf-guide-body"><b>{item.point}</b>{item.quote && <q>{item.quote}</q>}{item.why && <small>{item.why}</small>}<em>p. {item.page}</em></span>
        </button>
      </li>)}</ol>
    </motion.section>}
    {data.terms.length > 0 && <motion.section className="pf-inspector-section" {...enter(4)}><h3><Tag size={15}/> 주요 용어</h3><dl className="pf-guide-terms">{data.terms.map(term => <div key={term.term} data-guide-item={`term-${term.term}`} data-active={focus?.item === `term-${term.term}` || undefined}><dt>{term.unitId && term.page ? <button type="button" onClick={() => focusSource(`term-${term.term}`, term.unitId!, term.page!)}>{term.term}</button> : term.term}</dt><dd>{term.explanation}</dd></div>)}</dl></motion.section>}
    {data.limitations.length > 0 && <motion.section className="pf-inspector-section" {...enter(5)}><h3><AlertTriangle size={15}/> 한계</h3><ul className="pf-guide-list">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></motion.section>}
    {data.questions.length > 0 && <motion.section className="pf-inspector-section" {...enter(6)}><h3><HelpCircle size={15}/> 공부할 질문</h3><ol className="pf-guide-list">{data.questions.map(item => <li key={item}>{item}</li>)}</ol></motion.section>}
    <div className="pf-guide-footer">
      {focus && <Button size="sm" variant="ghost" onClick={() => useReaderStore.getState().set({ guideFocus: null })}>표시 지우기</Button>}
      <Button size="sm" variant="ghost" disabled={make.isPending} onClick={() => make.mutate()}><RefreshCw size={13}/>{make.isPending ? "다시 만드는 중…" : "다시 만들기"}</Button>
      <small>{new Date(data.createdAt).toLocaleDateString("ko-KR")} 생성 · 원문 근거는 PDF와 대조 확인</small>
    </div>
  </div>;
}
