"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, FileText, Highlighter, Layers, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadGuide } from "@/lib/paperflow/guide/client";
import { MARK_KINDS, type MarkKind } from "@/lib/paperflow/guide/guide";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { focusSource } from "./guide-brief";
import { KIND_LABEL } from "./guide-page";
import "./guide.css";

const KIND_KO: Record<MarkKind, string> = { result: "결과", condition: "조건", method: "방법", mechanism: "원인", limitation: "한계" };

/**
 * AI 가이드 tab: make the guide (with its cost), follow its progress, choose which layers sit on the
 * paper, filter highlights by kind, and jump to any highlighted sentence.
 */
export function GuidePanel() {
  const maker = useReaderStore(s => s.guideMaker), making = useReaderStore(s => s.guideProgress !== null), onMake = () => maker?.make(), estimate = maker?.estimate ?? null;
  const documentId = useReaderStore(s => s.documentId), on = useReaderStore(s => s.guideOverlay), layers = useReaderStore(s => s.guideLayers), progress = useReaderStore(s => s.guideProgress);
  const guide = useQuery({ queryKey: ["guide", documentId], enabled: Boolean(documentId), queryFn: () => loadGuide(documentId!) });
  const data = guide.data;
  const marks = useMemo(() => data?.pages.flatMap(page => page.marks.map((mark, index) => ({ ...mark, number: index + 1 }))) ?? [], [data]);
  const counts = useMemo(() => Object.fromEntries(MARK_KINDS.map(kind => [kind, marks.filter(mark => mark.kind === kind).length])) as Record<MarkKind, number>, [marks]);
  const set = useReaderStore.getState().set, setLayers = (patch: Partial<typeof layers>) => set({ guideLayers: { ...layers, ...patch } });

  if (making || !data) return <div className="pf-gpanel">
    <section className="pf-gpanel-hero">
      <span className="pf-gpanel-icon"><Sparkles size={18}/></span>
      <h3>AI 리딩 가이드</h3>
      <p>AI가 논문을 먼저 이해한 뒤, 쉬운 설명부터 실험조건·결과·원인·원문 근거까지 순서대로 안내함. 스크롤만 내리며 따라 읽으면 됨.</p>
      <ol className="pf-gpanel-steps">
        <li>논문 정의 · 10초 요약 · 한 줄 결론</li><li>연구 흐름 · 구성 · 핵심 실험조건</li><li>핵심 결과 · 원인 · 가져갈 것 · 한계</li><li>꼭 볼 Figure · 페이지별 가이드 · 형광 근거</li>
      </ol>
      {making && progress ? <div className="pf-gpanel-progress" role="status">
        <p>{progress.brief === "done" ? <Check size={13}/> : progress.brief === "failed" ? "!" : <Loader2 size={13} className="pf-spin"/>}논문 브리프 {progress.brief === "done" ? "완료" : progress.brief === "failed" ? "실패" : "작성 중"}</p>
        <p>{progress.pagesDone >= progress.pagesTotal ? <Check size={13}/> : <Loader2 size={13} className="pf-spin"/>}페이지 가이드 {progress.pagesDone} / {progress.pagesTotal}쪽</p>
        <div className="pf-gpanel-bar"><i style={{ width: `${Math.round(((progress.brief === "done" ? 1 : 0) + progress.pagesDone / Math.max(1, progress.pagesTotal)) / 2 * 100)}%` }}/></div>
      </div> : <Button variant="primary" onClick={onMake} disabled={making}><Sparkles size={14}/>가이드 만들기{estimate ? ` · 약 ${estimate.toLocaleString()} 크레딧` : ""}</Button>}
    </section>
  </div>;

  return <div className="pf-gpanel">
    <section className="pf-gpanel-card">
      <header><h3><Sparkles size={15}/>AI 리딩 가이드</h3><Button size="sm" variant={on ? "primary" : "secondary"} onClick={() => set({ guideOverlay: !on })}>{on ? "논문 위 가이드 끄기" : "논문 위에 보기"}</Button></header>
      <p className="pf-gpanel-definition">{data.definition}</p>
      <div className="pf-gpanel-layers">
        <button type="button" aria-pressed={layers.brief} onClick={() => setLayers({ brief: !layers.brief })}><FileText size={13}/>브리프</button>
        <button type="button" aria-pressed={layers.pages} onClick={() => setLayers({ pages: !layers.pages })}><Layers size={13}/>페이지 가이드</button>
        <button type="button" aria-pressed={layers.marks} onClick={() => setLayers({ marks: !layers.marks })}><Highlighter size={13}/>형광 · 메모</button>
      </div>
    </section>
    <section className="pf-gpanel-card">
      <header><h3>형광 근거 <small>{marks.length}</small></h3></header>
      <div className="pf-gpanel-kinds">{MARK_KINDS.map(kind => <button type="button" key={kind} data-kind={kind} aria-pressed={layers.kinds.includes(kind)} onClick={() => setLayers({ kinds: layers.kinds.includes(kind) ? layers.kinds.filter(item => item !== kind) : [...layers.kinds, kind] })}><i/>{KIND_KO[kind]}<small>{counts[kind]}</small></button>)}</div>
      <ol className="pf-gpanel-marks">{marks.filter(mark => layers.kinds.includes(mark.kind)).map(mark => <li key={`${mark.page}-${mark.number}`}>
        <button type="button" data-kind={mark.kind} onClick={() => { if (!on) set({ guideOverlay: true }); focusSource(`mark-${mark.page}-${mark.number}`, { unitId: mark.unitId, page: mark.page, quote: mark.quote }); }}>
          <span className="pf-gpanel-num">{mark.number}</span>
          <span><small>p.{mark.page} · {KIND_LABEL[mark.kind]}</small><strong>{mark.keyword}</strong><em>{mark.note}</em></span>
        </button>
      </li>)}</ol>
    </section>
    <footer className="pf-gpanel-foot">
      <Button size="sm" variant="ghost" onClick={onMake} disabled={making}><RefreshCw size={13}/>다시 만들기</Button>
      <small>{new Date(data.createdAt).toLocaleDateString("ko-KR")} 생성 · 수치와 인용은 원문과 대조 확인됨</small>
    </footer>
  </div>;
}
