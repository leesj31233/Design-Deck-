"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BookOpen, Highlighter, ArrowUpRight, Trash2, X, Save, Languages, Sparkles } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import type { PdfParagraph } from "@/lib/paperflow/translation/paragraphs";
import type { ResolvedAnnotation } from "./highlight-layer";

type TranslationState = { text?: string; provider?: "device" | "MyMemory"; pending: boolean; error?: string } | null;
type BulkState = { done: number; total: number; failed: number; running: boolean } | null;
interface InspectorProps {
  annotations: Annotation[]; resolved: ResolvedAnnotation[]; selected?: string; onSelect: (a: Annotation) => void;
  onSaveNote: (text: string) => Promise<void>; onRemove: (id: string) => void; saving: boolean;
  tab: string; setTab: (tab: string) => void; shell: string; paragraph: PdfParagraph | null;
  translation: TranslationState; bulk: BulkState; onTranslate: () => void; onBatchTranslate: () => void; onCancelBatch: () => void;
}

export function ResearchInspector({ annotations, resolved, selected, onSelect, onSaveNote, onRemove, saving, tab, setTab, shell, paragraph, translation, bulk, onTranslate, onBatchTranslate, onCancelBatch }: InspectorProps) {
  const selection = useReaderStore(s => s.activeSelection), reduced = useReducedMotion();
  const active = annotations.find(a => a.id === selected), anchor = selection ?? active?.anchor;
  const sourceText = paragraph?.text ?? anchor?.textQuote;
  const sourcePage = paragraph ? paragraph.pageIndex + 1 : anchor ? anchor.pageIndex + 1 : null;
  const [draft, setDraft] = useState("");
  useEffect(() => { setDraft(active?.note ?? ""); }, [active?.id, active?.note, selection?.textQuote]);
  return <GlassPanel className="pf-inspector dd-scrollbar" data-inspector><header><div><span className="pf-kicker">SOURCE FIRST</span><h2>Research Inspector</h2></div><IconButton label="Close inspector" variant="ghost" size="sm" onClick={() => useReaderStore.getState().set({ inspectorOpen: false })}><X size={16}/></IconButton></header>
    <Tabs value={tab} onValueChange={setTab}><TabsList className="pf-inspector-tabs"><TabsTrigger value="context">Context</TabsTrigger><TabsTrigger value="notes">Notes</TabsTrigger><TabsTrigger value="evidence">Evidence</TabsTrigger></TabsList>
      <TabsContent value="context">
        <div className="pf-inspector-section">{sourceText ? <><Badge>원문 · p. {sourcePage}</Badge><blockquote>{sourceText}</blockquote></> : <div className="pf-inspector-empty"><BookOpen size={27}/><h3>문단을 클릭하세요</h3><p>원본 PDF의 문단을 클릭하면<br/>옆에서 한국어 번역을 읽을 수 있습니다.</p><span>문단 클릭 → 번역 → 원문 비교</span></div>}</div>
        <section className="pf-inspector-section pf-translation-card" aria-live="polite"><div className="pf-section-title"><h3><Languages size={16}/> 한국어 번역</h3><span>공학 용어 영어 유지</span></div>
          {translation?.pending ? <div className="pf-translation-loading"><span className="pf-loader" aria-hidden="true"/>문단을 번역하고 있습니다…</div> : translation?.error ? <p className="pf-error" role="alert">{translation.error}</p> : translation?.text ? <motion.p key={translation.text} className="pf-translated-text" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>{translation.text}</motion.p> : <p className="pf-muted">원문을 클릭하거나 선택한 뒤 문단 번역을 누르세요.</p>}
          {sourceText && <Button size="sm" variant="ghost" onClick={onTranslate} disabled={translation?.pending}><Sparkles size={14}/> 다시 번역 보기</Button>}
          <small>{translation?.provider === "device" ? "이 기기에서 번역했습니다." : "기기 내 번역이 준비되지 않으면 원문 문단을 MyMemory 외부 번역 서비스로 보냅니다."} PDF 원본은 변경되지 않습니다.</small>
        </section>
        <section className="pf-inspector-section pf-batch-section"><div className="pf-section-title"><h3>페이지 일괄 번역</h3><span>{bulk ? `${bulk.done}/${bulk.total}` : "현재 페이지"}</span></div><p>현재 페이지의 문단을 번역하고 로컬에 저장합니다. 다른 페이지는 이동 후 실행할 수 있습니다.</p>{bulk && bulk.failed > 0 && <p role="status">{bulk.failed}개 문단은 번역하지 못했습니다. 다시 실행하면 실패한 문단을 재시도합니다.</p>}{bulk && <progress value={bulk.done} max={Math.max(1, bulk.total)} aria-label="페이지 번역 진행"/>}<div className="pf-batch-actions"><Button size="sm" disabled={bulk?.running} onClick={onBatchTranslate}>{bulk?.running ? "번역 중…" : "일괄 번역"}</Button>{bulk?.running && <Button size="sm" variant="ghost" onClick={onCancelBatch}>중지</Button>}</div></section>
        {shell && shell !== "Hybrid 번역" && <div className="pf-inspector-section pf-future"><h3>{shell}</h3><p>원문 근거를 연결한 설명 기능은 다음 단계에서 제공됩니다.</p></div>}
      </TabsContent>
      <TabsContent value="notes"><div className="pf-inspector-section"><h3>사용자 메모</h3>{anchor ? <><small>원문 {anchor.pageIndex + 1}페이지에 연결됩니다.</small><textarea aria-label="원문 메모" placeholder="이 문장에서 발견한 점, 궁금한 점…" value={draft} onChange={event => setDraft(event.target.value)}/><Button disabled={!draft.trim() || saving} onClick={() => void onSaveNote(draft)}><Save size={14}/>{saving ? "저장 중…" : "메모 저장"}</Button></> : <p>원문을 선택하거나 아래 저장된 마킹을 선택하세요.</p>}</div></TabsContent>
      <TabsContent value="evidence"><div className="pf-inspector-section"><h3>원문 근거</h3><p>아래 기록은 이 PDF에서 직접 선택한 문장입니다. 번역은 참고용이며, 논문의 주장과 수치는 원문에서 확인하세요.</p><Badge>Local PDF · immutable source</Badge></div></TabsContent>
    </Tabs>
    <div className="pf-inspector-section pf-annotations"><div className="pf-section-title"><h3><Highlighter size={15}/> 저장한 마킹</h3><span>{annotations.length}</span></div>{annotations.length === 0 && <p className="pf-muted">아직 마킹이 없습니다. 원문을 선택하고 H 키를 눌러보세요.</p>}
      {annotations.map(a => { const recovery = resolved.find(r => r.annotation.id === a.id)?.recovery; return <article key={a.id} className={`pf-annotation ${selected === a.id ? "is-selected" : ""}`}><button className="pf-annotation-source" onClick={() => onSelect(a)} aria-label={`Inspect ${a.color} highlight on page ${a.pageIndex + 1}`}><span className="pf-annotation-label"><i data-color={a.color}/>{a.color} · p. {a.pageIndex + 1}<ArrowUpRight size={12}/></span><blockquote>{a.anchor.textQuote}</blockquote>{a.note && <p className="pf-saved-note">{a.note}</p>}{recovery?.status === "unresolved" && <span className="pf-error">위치 확인 필요 · {recovery.reason}</span>}</button><IconButton label="Delete highlight" size="sm" variant="ghost" onClick={() => onRemove(a.id)}><Trash2 size={13}/></IconButton></article>; })}
    </div>
  </GlassPanel>;
}
