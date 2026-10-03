"use client";
import { ConceptStudy } from "./concept-study";
import { GuidePanel } from "./guide-panel";
import { useEffect, useState } from "react";

import { BookOpen, Highlighter, ArrowUpRight, Trash2, X, Save, Languages, Sparkles } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import type { PdfParagraph } from "@/lib/paperflow/layout/types";
import type { ResolvedAnnotation } from "./highlight-layer";

type TranslationState = { text?: string; provider?: "device" | "MyMemory" | "OpenAI"; pending: boolean; error?: string } | null;
type BulkState = { done: number; total: number; failed: number; running: boolean; translated: number; translatableBlocks: number; complete: boolean; failedUnits: { unitId: string; page: number; error: string; preview: string }[] } | null;
interface InspectorProps {
  annotations: Annotation[]; resolved: ResolvedAnnotation[]; selected?: string; onSelect: (a: Annotation) => void;
  onSaveNote: (text: string) => Promise<void>; onRemove: (id: string) => void; saving: boolean;
  tab: string; setTab: (tab: string) => void; shell: string; paragraph: PdfParagraph | null;
  translation: TranslationState; bulk: BulkState; keywords: string[]; onTranslate: () => void; onBatchTranslate: () => void; onCancelBatch: () => void;
}

export function ResearchInspector({ annotations, resolved, selected, onSelect, onSaveNote, onRemove, saving, tab, setTab, shell, paragraph, translation, bulk, keywords, onTranslate, onBatchTranslate, onCancelBatch }: InspectorProps) {
  const selection = useReaderStore(s => s.activeSelection);
  const active = annotations.find(a => a.id === selected), anchor = selection ?? active?.anchor;
  const sourceText = anchor?.sourceQuote ?? (selection ? anchor?.textQuote : paragraph?.text ?? anchor?.textQuote);
  const sourcePage = paragraph ? paragraph.pageIndex + 1 : anchor ? anchor.pageIndex + 1 : null;
  const [draft, setDraft] = useState("");
  useEffect(() => { setDraft(active?.note ?? ""); }, [active?.id, active?.note, selection?.textQuote]);
  return <GlassPanel className="pf-inspector dd-scrollbar" data-inspector><header><div><span className="pf-kicker">SOURCE FIRST</span><h2>Research Inspector</h2></div><IconButton label="Close inspector" variant="ghost" size="sm" onClick={() => useReaderStore.getState().set({ inspectorOpen: false })}><X size={16}/></IconButton></header>
    <Tabs value={tab} onValueChange={setTab}><TabsList className="pf-inspector-tabs"><TabsTrigger value="guide">AI 가이드</TabsTrigger><TabsTrigger value="context">Context</TabsTrigger><TabsTrigger value="notes">Notes</TabsTrigger><TabsTrigger value="evidence">Evidence</TabsTrigger></TabsList>
      <TabsContent value="guide"><GuidePanel/></TabsContent>
      <TabsContent value="context">
        <ConceptStudy source={sourceText ?? ""} selected={selection?.textQuote ?? ""} page={selection ? selection.pageIndex + 1 : sourcePage}/>
        <div className="pf-inspector-section">{sourceText ? <><Badge>원문 · p. {sourcePage}</Badge><blockquote>{sourceText}</blockquote></> : <div className="pf-inspector-empty"><BookOpen size={27}/><h3>문단을 클릭하세요</h3><p>원본 PDF의 문단을 클릭하면<br/>원래 문단 자리에서 한국어로 바뀝니다.</p><span>문단 클릭 → 한국어로 읽기 → 원문 전환</span></div>}</div>
        <section className="pf-inspector-section pf-translation-card" aria-live="polite"><div className="pf-section-title"><h3><Languages size={16}/> 한국어 번역</h3><span>공학 용어 영어 유지</span></div>
          {translation?.pending ? <div className="pf-translation-loading"><span className="pf-loader" aria-hidden="true"/>문단을 번역하고 있습니다…</div> : translation?.error ? <p className="pf-error" role="alert">{translation.error}</p> : translation?.text ? <p>한국어 문단을 PDF 안에 표시했습니다. 상단의 원문 보기로 비교할 수 있습니다.</p> : <p className="pf-muted">원문을 클릭하거나 선택한 뒤 문단 번역을 누르세요.</p>}
          {sourceText && <Button size="sm" variant="ghost" onClick={onTranslate} disabled={translation?.pending}><Sparkles size={14}/> 다시 번역 보기</Button>}
          <small>{translation?.provider === "OpenAI" ? "서버에서 번역했다." : translation?.provider === "device" ? "이 기기에서 번역했습니다." : "번역은 서버에서 처리한다."} PDF 원본은 변경되지 않습니다.</small>
        </section>
        <section className="pf-inspector-section pf-batch-section"><div className="pf-section-title"><h3>논문 전체 번역</h3><span>{bulk && bulk.translatableBlocks ? `${bulk.translated}/${bulk.translatableBlocks}문단` : "상단 버튼"}</span></div>
          <p>본문·초록·장절 제목·그림 설명을 원래 지면 안에 한국어로 넣는다. 논문 제목·저자·References·수식·표·그림 내부는 원문으로 둔다.</p>
          {bulk && bulk.translatableBlocks > 0 && <progress value={bulk.translated} max={Math.max(1, bulk.translatableBlocks)} aria-label="논문 전체 번역 진행"/>}
          {bulk && bulk.failedUnits.length > 0 && <div role="status" className="pf-failed-units"><p>{bulk.failedUnits.length}개 문단을 번역하지 못했다. 성공한 문단은 저장됐고, 재시도하면 이 문단만 다시 요청한다.</p><ul>{bulk.failedUnits.slice(0, 8).map(item => <li key={item.unitId}><b>p. {item.page}</b> {item.preview}…</li>)}</ul></div>}
          {bulk?.running ? <Button size="sm" variant="ghost" onClick={onCancelBatch}>중지</Button> : bulk && !bulk.complete && <Button size="sm" variant="ghost" onClick={onBatchTranslate}>{bulk.failed ? "실패 문단 재시도" : "이어서 번역"}</Button>}
        </section>
        {keywords.length > 0 && <section className="pf-inspector-section pf-keywords"><div className="pf-section-title"><h3>논문 키워드</h3><span>서재 수집</span></div><div className="pf-keyword-chips">{keywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div></section>}
        {shell && shell !== "개념 설명" && shell !== "Hybrid 번역" && <div className="pf-inspector-section pf-future"><h3>{shell}</h3><p>원문 근거를 연결한 설명 기능은 다음 단계에서 제공됩니다.</p></div>}
      </TabsContent>
      <TabsContent value="notes"><div className="pf-inspector-section"><h3>사용자 메모</h3><small>{anchor ? `원문 ${anchor.pageIndex + 1}페이지에 연결된다.` : "선택한 텍스트가 없으면 현재 페이지에 저장된다."}</small><textarea aria-label="원문 메모" placeholder="이 문장에서 발견한 점, 궁금한 점…" value={draft} onChange={event => setDraft(event.target.value)}/><Button disabled={!draft.trim() || saving} onClick={() => void onSaveNote(draft)}><Save size={14}/>{saving ? "저장 중…" : "메모 저장"}</Button></div></TabsContent>
      <TabsContent value="evidence"><div className="pf-inspector-section"><h3>원문 근거</h3><p>아래 기록은 이 PDF에서 직접 선택한 문장입니다. 번역은 참고용이며, 논문의 주장과 수치는 원문에서 확인하세요.</p><Badge>Local PDF · immutable source</Badge></div></TabsContent>
    </Tabs>
    <div className="pf-inspector-section pf-annotations"><div className="pf-section-title"><h3><Highlighter size={15}/> 저장한 마킹</h3><span>{annotations.length}</span></div>{annotations.length === 0 && <p className="pf-muted">아직 마킹이 없습니다. 원문을 선택하고 H 키를 눌러보세요.</p>}
      {annotations.map(a => { const recovery = resolved.find(r => r.annotation.id === a.id)?.recovery; return <article key={a.id} className={`pf-annotation ${selected === a.id ? "is-selected" : ""}`}><button className="pf-annotation-source" onClick={() => onSelect(a)} aria-label={`Inspect ${a.color} highlight on page ${a.pageIndex + 1}`}><span className="pf-annotation-label"><i data-color={a.color}/>{a.color} · p. {a.pageIndex + 1}<ArrowUpRight size={12}/></span><blockquote>{a.anchor.textQuote}</blockquote>{a.note && <p className="pf-saved-note">{a.note}</p>}{recovery?.status === "unresolved" && <span className="pf-error">위치 확인 필요 · {recovery.reason}</span>}</button><IconButton label="Delete highlight" size="sm" variant="ghost" onClick={() => onRemove(a.id)}><Trash2 size={13}/></IconButton></article>; })}
    </div>
  </GlassPanel>;
}
