"use client";
import { useEffect, useState } from "react";
import { BookOpen, Highlighter, ArrowUpRight, Trash2, X, Save, Languages } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import type { ResolvedAnnotation } from "./highlight-layer";
export function ResearchInspector({ annotations, resolved, selected, onSelect, onSaveNote, onRemove, saving, tab, setTab, shell }: { annotations: Annotation[]; resolved: ResolvedAnnotation[]; selected?: string; onSelect: (a: Annotation) => void; onSaveNote: (text: string) => Promise<void>; onRemove: (id: string) => void; saving: boolean; tab: string; setTab: (tab: string) => void; shell: string }) {
  const selection = useReaderStore(s => s.activeSelection);
  const active = annotations.find(a => a.id === selected), source = selection ?? active?.anchor;
  const [draft, setDraft] = useState("");
  useEffect(() => { setDraft(active?.note ?? ""); }, [active?.id, active?.note, selection?.textQuote]);
  return <GlassPanel className="pf-inspector dd-scrollbar" data-inspector><header><div><span className="pf-kicker">SOURCE FIRST</span><h2>Research Inspector</h2></div><IconButton label="Close inspector" variant="ghost" size="sm" onClick={() => useReaderStore.getState().set({ inspectorOpen: false })}><X size={16}/></IconButton></header>
    <Tabs value={tab} onValueChange={setTab}><TabsList className="pf-inspector-tabs"><TabsTrigger value="context">Context</TabsTrigger><TabsTrigger value="notes">Notes</TabsTrigger><TabsTrigger value="evidence">Evidence</TabsTrigger></TabsList>
      <TabsContent value="context"><div className="pf-inspector-section">{source ? <><Badge>원문 · p. {source.pageIndex + 1}</Badge><blockquote>{source.textQuote}</blockquote><p className="pf-muted">선택한 문장을 마킹하거나 메모를 남겨 근거와 함께 보관하세요.</p></> : <div className="pf-inspector-empty"><BookOpen size={27}/><h3>원문에서 시작하세요</h3><p>문장이나 구절을 선택하면<br/>이곳에서 근거를 확인할 수 있습니다.</p><span>선택 → 마킹 → 기록</span></div>}</div>
        <div className="pf-inspector-section pf-hybrid"><Languages size={19}/><h3>{shell || "Hybrid engineering translation"}</h3><p>전문용어는 영어 그대로,<br/>문장 구조는 자연스러운 한국어로.</p><div className="pf-term-chips">{["realizable k-ε", "DPM", "heat flux"].map(t => <span key={t}>{t}</span>)}</div><Badge>Available in Phase 2</Badge><small>번역·설명 서비스는 아직 연결되지 않았습니다.</small></div>
      </TabsContent>
      <TabsContent value="notes"><div className="pf-inspector-section"><h3>사용자 메모</h3>{source ? <><small>원문 {source.pageIndex + 1}페이지에 연결됩니다.</small><textarea aria-label="원문 메모" placeholder="이 문장에서 발견한 점, 궁금한 점…" value={draft} onChange={event => setDraft(event.target.value)}/><Button disabled={!draft.trim() || saving} onClick={() => void onSaveNote(draft)}><Save size={14}/>{saving ? "저장 중…" : "메모 저장"}</Button></> : <p>원문을 선택하거나 아래 저장된 마킹을 선택하세요.</p>}</div></TabsContent>
      <TabsContent value="evidence"><div className="pf-inspector-section"><h3>원문 근거</h3><p>아래 기록은 이 PDF에서 직접 선택한 문장입니다. 외부 근거나 AI 해석이 아닙니다.</p><Badge>Local PDF · immutable source</Badge></div></TabsContent>
    </Tabs>
    <div className="pf-inspector-section pf-annotations"><div className="pf-section-title"><h3><Highlighter size={15}/> 저장한 마킹</h3><span>{annotations.length}</span></div>{annotations.length === 0 && <p className="pf-muted">아직 마킹이 없습니다. 원문을 선택하고 H 키를 눌러보세요.</p>}
      {annotations.map(a => { const recovery = resolved.find(r => r.annotation.id === a.id)?.recovery; return <article key={a.id} className={`pf-annotation ${selected === a.id ? "is-selected" : ""}`}><button className="pf-annotation-source" onClick={() => onSelect(a)} aria-label={`Inspect ${a.color} highlight on page ${a.pageIndex + 1}`}><span className="pf-annotation-label"><i data-color={a.color}/>{a.color} · p. {a.pageIndex + 1}<ArrowUpRight size={12}/></span><blockquote>{a.anchor.textQuote}</blockquote>{a.note && <p className="pf-saved-note">{a.note}</p>}{recovery?.status === "unresolved" && <span className="pf-error">위치 확인 필요 · {recovery.reason}</span>}</button><IconButton label="Delete highlight" size="sm" variant="ghost" onClick={() => onRemove(a.id)}><Trash2 size={13}/></IconButton></article>; })}
    </div>
  </GlassPanel>;
}
