"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Coins, Loader2, MessageCircleQuestion, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { askPaper, askStatus, type AskResult } from "@/lib/paperflow/ask/client";
import { loadGuide } from "@/lib/paperflow/guide/client";
import { useAskMarks } from "@/lib/paperflow/guide/locate";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { notifyText } from "@/lib/paperflow/notifications";
import { focusSource } from "../guide/guide-brief";
import "./ask.css";

const SUGGESTIONS = ["이 논문의 결론적 내용은 어디에 있어?", "가장 중요한 정량 결과는?", "실험 조건을 정리해 줘", "이 연구의 한계는 뭐야?"];
const key = (documentId: string) => `pf-ask:${documentId}`;
const readThread = (documentId: string): AskResult[] => { try { return JSON.parse(localStorage.getItem(key(documentId)) ?? "[]"); } catch { return []; } };
const writeThread = (documentId: string, thread: AskResult[]) => { try { localStorage.setItem(key(documentId), JSON.stringify(thread.slice(-20))); } catch { /* kept for this visit only */ } };

/** Show an answer's evidence on the paper (Q1, Q2…) and go to the first one. */
function showEvidence(documentId: string, result: AskResult, at = 0) {
  useAskMarks.getState().set(documentId, result.points.map((point, index) => ({ unitId: point.unitId, page: point.page, quote: point.quote, number: index + 1 })));
  const point = result.points[at];
  if (point) focusSource(`ask-${result.at}-${at}`, { unitId: point.unitId, page: point.page, quote: point.quote });
}

/**
 * 질문 tab: ask the paper in plain words ("결론은 어디에 있어?"). The answer is short, quantitative and
 * points to the exact sentences, highlighted on the paper as Q1, Q2…; every answer shows what it cost.
 */
export function AskPanel() {
  const documentId = useReaderStore(s => s.documentId);
  const manifest = useTranslationStore(s => s.manifest);
  const guide = useQuery({ queryKey: ["guide", documentId], enabled: Boolean(documentId), queryFn: () => loadGuide(documentId!) });
  const status = useQuery({ queryKey: ["ask-status", documentId, manifest?.version], enabled: Boolean(documentId && manifest), queryFn: () => askStatus(documentId!, manifest) });
  const [thread, setThread] = useState<AskResult[]>([]), [draft, setDraft] = useState(""), [busy, setBusy] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (documentId) setThread(readThread(documentId)); }, [documentId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [thread.length, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy || !documentId) return;
    const current = useTranslationStore.getState().manifest;
    if (!current || current.documentId !== documentId) { notifyText("논문 구조를 분석하는 중입니다. 잠시 후 다시 질문해 주세요."); return; }
    setBusy(text); setDraft("");
    try {
      const data = guide.data, overview = data ? [data.definition, data.tenSeconds.why, data.tenSeconds.how, data.tenSeconds.found, data.takeaway].filter(Boolean).join(" ") : "";
      const result = await askPaper(documentId, current, text, overview, thread.slice(-2).map(item => ({ q: item.question, a: item.answer })));
      const next = [...thread, result];
      setThread(next); writeThread(documentId, next);
      if (result.points.length) showEvidence(documentId, result);
      void status.refetch();
    } catch (error) { notifyText(error instanceof Error ? error.message : "답변을 만들지 못했습니다."); setDraft(text); }
    finally { setBusy(null); }
  };
  const clear = () => { if (!documentId) return; setThread([]); writeThread(documentId, []); useAskMarks.getState().set(documentId, []); };
  const perQuestion = status.data?.perQuestion;

  return <div className="pf-ask">
    <header className="pf-ask-head">
      <span className="pf-ask-icon"><MessageCircleQuestion size={17}/></span>
      <div><h3>논문에 질문하기</h3><p>본문에서 답을 찾아 근거 문장을 <b>Q1·Q2</b> 형광으로 짚어 줍니다.</p></div>
      {thread.length > 0 && <IconButton label="대화 지우기" variant="ghost" size="sm" onClick={clear}><Trash2 size={14}/></IconButton>}
    </header>
    <p className="pf-ask-cost"><Coins size={12}/>질문당 약 {perQuestion ?? "–"} 크레딧{status.data && !status.data.indexed ? ` · 첫 질문 때 본문 색인 약 ${status.data.indexCredits} 크레딧 (한 번만)` : ""}</p>

    <div className="pf-ask-thread">
      {!thread.length && !busy && <div className="pf-ask-empty">
        <small>이렇게 물어보세요</small>
        {SUGGESTIONS.map(text => <button key={text} type="button" onClick={() => void ask(text)}>{text}</button>)}
      </div>}
      {thread.map(item => <article key={item.at} className="pf-ask-turn">
        <p className="pf-ask-q">{item.question}</p>
        <div className="pf-ask-a" data-found={item.found || undefined}>
          <p>{item.answer.split(/(\[Q\d\])/).map((part, index) => { const cited = /^\[Q(\d)\]$/.exec(part); return cited ? <button key={index} type="button" className="pf-ask-cite" onClick={() => documentId && showEvidence(documentId, item, Number(cited[1]) - 1)}>Q{cited[1]}</button> : part; })}</p>
          {item.points.length > 0 && <ol>{item.points.map((point, index) => <li key={point.quote}><button type="button" onClick={() => documentId && showEvidence(documentId, item, index)}><i>Q{index + 1}</i><span><small>p.{point.page}</small>{point.text}</span></button></li>)}</ol>}
          <footer><Coins size={11}/>{item.credits + item.indexCredits} 크레딧{item.indexCredits ? ` (색인 ${item.indexCredits} 포함)` : ""}{item.model ? ` · ${item.model.replace(/-\d{4}-\d{2}-\d{2}$/, "")}` : ""}</footer>
        </div>
      </article>)}
      {busy && <article className="pf-ask-turn"><p className="pf-ask-q">{busy}</p><div className="pf-ask-a pf-ask-wait"><Loader2 size={14} className="animate-spin"/>본문에서 근거를 찾는 중…</div></article>}
      <div ref={end}/>
    </div>

    <form className="pf-ask-input" onSubmit={event => { event.preventDefault(); void ask(draft); }}>
      <textarea aria-label="논문에 질문" placeholder="예: 토양 건강 증진 효과를 말하는 부분은 어디야?" value={draft} rows={2} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(draft); } }}/>
      <Button type="submit" size="sm" variant="accent" disabled={!draft.trim() || Boolean(busy)} aria-label="질문 보내기"><ArrowUp size={15}/></Button>
    </form>
  </div>;
}
