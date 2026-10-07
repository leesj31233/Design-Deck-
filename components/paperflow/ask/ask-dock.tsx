"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, BookMarked, Check, Coins, Copy, ExternalLink, Gauge, Globe, Loader2, Maximize2, MessageCircleQuestion, Minimize2, NotebookPen, Quote, RotateCcw, Sparkles, Square, Trash2, X } from "lucide-react";
import { askPaper, askStatus, estimateQuestion, type AskResult, type AskStage } from "@/lib/paperflow/ask/client";
import { restoreAskDock, useAskDock } from "@/lib/paperflow/ask/dock";
import { loadGuide } from "@/lib/paperflow/guide/client";
import { useAskMarks } from "@/lib/paperflow/guide/locate";
import { noteRepository } from "@/lib/paperflow/notes/note-repository";
import { shortTitle } from "@/lib/paperflow/notes/notebook";
import { notifyText } from "@/lib/paperflow/notifications";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { useTranslationStore } from "@/lib/paperflow/translation/translation-store";
import { focusSource } from "../guide/guide-brief";
import { AnswerText } from "./answer-text";
import "./ask.css";

const STAGE: Record<AskStage, string> = { index: "논문 본문 색인 확인 중", search: "관련 문단을 찾는 중", literature: "관련 논문을 찾는 중 (OpenAlex)", web: "웹에서 자료를 찾는 중", thinking: "근거를 읽고 정리하는 중", writing: "답변 작성 중" };
const SUGGESTIONS = [
  { text: "이 논문의 결론적 내용은 어디에 있어?", hint: "결론 · 근거 위치" },
  { text: "가장 중요한 정량 결과를 수치로 정리해 줘", hint: "핵심 수치" },
  { text: "이 논문에 나오는 주요 식과 인자를 설명해 줘", hint: "식 · 인자 해설" },
  { text: "이 연구의 한계와 후속 연구 방향은?", hint: "한계 · 다음 연구" },
  { text: "다른 연구 결과와 비교하면 어때?", hint: "관련 논문 비교", literature: true }
];
/** Quick questions about a selected passage. */
const FOCUS_ASKS = ["이 부분을 쉽게 풀어 설명해 줘", "여기 나온 식·기호·인자를 단위와 함께 하나씩 설명해 줘", "이 주장의 근거와 수치는 어디 있어?", "이 내용을 다른 연구와 비교하면?"];
const threadKey = (documentId: string) => `pf-ask:${documentId}`;
const readThread = (documentId: string): AskResult[] => { try { return (JSON.parse(localStorage.getItem(threadKey(documentId)) ?? "[]") as AskResult[]).map(item => ({ ...item, sources: item.sources ?? [], followups: item.followups ?? [], options: item.options ?? { speed: "fast", web: false, literature: false } })); } catch { return []; } };
const writeThread = (documentId: string, thread: AskResult[]) => { try { localStorage.setItem(threadKey(documentId), JSON.stringify(thread.slice(-30))); } catch { /* kept for this visit only */ } };

/** Show an answer's evidence on the paper (Q1, Q2…) and go to one of them. */
function showEvidence(documentId: string, result: AskResult, at = 0) {
  useAskMarks.getState().set(documentId, result.points.map((point, index) => ({ unitId: point.unitId, page: point.page, quote: point.quote, number: index + 1 })));
  const point = result.points[at];
  if (point) focusSource(`ask-${result.at}-${at}`, { unitId: point.unitId, page: point.page, quote: point.quote });
}

/** An answer as plain text with its evidence and sources, for the clipboard. */
const plainAnswer = (item: AskResult) => [
  `Q. ${item.question}`, "", item.answer.replace(/\*\*/g, ""), "",
  ...item.points.map((point, index) => `[Q${index + 1}] p.${point.page} ${point.text} — "${point.quote}"`),
  ...item.sources.map((source, index) => `[S${index + 1}] ${source.title} ${source.url}`)
].join("\n").trim();

/**
 * 질문 — the paper's expert assistant, in a window that stays in the reader's corner. Ask in plain words
 * (or about a selected sentence); the answer streams in, cites the paper as Q1·Q2 (highlighted on the
 * page) and outside sources as S1·S2, separates general knowledge, suggests follow-ups, and shows its
 * cost. Related papers (OpenAlex, free), web search and the deeper model are opt-in, each priced first.
 */
export function AskDock() {
  const documentId = useReaderStore(s => s.documentId), inspectorOpen = useReaderStore(s => s.inspectorOpen);
  const { open, wide, focus, pending, options, set } = useAskDock();
  const manifest = useTranslationStore(s => s.manifest);
  const guide = useQuery({ queryKey: ["guide", documentId], enabled: Boolean(documentId), queryFn: () => loadGuide(documentId!) });
  const doc = useQuery({ queryKey: ["document", documentId, "ask"], enabled: Boolean(documentId), queryFn: () => documentRepository.getDocument(documentId!) });
  const status = useQuery({ queryKey: ["ask-status", documentId, manifest?.version], enabled: Boolean(documentId && manifest), queryFn: () => askStatus(documentId!, manifest) });
  const [thread, setThread] = useState<AskResult[]>([]), [draft, setDraft] = useState("");
  const [live, setLive] = useState<{ question: string; focus?: { text: string; page: number }; stage: AskStage; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null), end = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => { restoreAskDock(); }, []);
  useEffect(() => { if (documentId) { setThread(readThread(documentId)); useAskMarks.getState().set(documentId, []); } }, [documentId]);
  // While an answer is written the window follows it; once done, it shows the answer from its question down.
  useEffect(() => { if (live) end.current?.scrollIntoView({ block: "end" }); }, [live?.text, live?.stage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const turns = end.current?.parentElement?.querySelectorAll(".pf-ask-turn"); turns?.[turns.length - 1]?.scrollIntoView({ block: "start" }); }, [thread.length, open]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 80); }, [open, focus]);
  // Ctrl/⌘ + J opens and closes the window from anywhere in the reader.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") { event.preventDefault(); useAskDock.getState().set({ open: !useAskDock.getState().open }); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || live || !documentId) return;
    const current = useTranslationStore.getState().manifest;
    if (!current || current.documentId !== documentId) { notifyText("논문 구조를 분석하는 중입니다. 잠시 후 다시 질문해 주세요."); return; }
    const asked = focus ?? undefined;
    setDraft(""); set({ focus: null, pending: null });
    setLive({ question: text, focus: asked, stage: "index", text: "" });
    const controller = new AbortController(); abort.current = controller;
    try {
      const data = guide.data, overview = data ? [data.definition, data.intro, data.takeaway].filter(Boolean).join(" ") : "";
      const result = await askPaper(documentId, current, {
        question: text, focus: asked, overview, title: doc.data?.title.replace(/\.pdf$/i, "") ?? "", keywords: current.keywords ?? [],
        history: thread.slice(-3).map(item => ({ q: item.question, a: item.answer })), options
      }, stage => setLive(state => state && { ...state, stage }), partial => setLive(state => state && { ...state, text: partial }), controller.signal);
      setThread(previous => { const next = [...previous, result]; writeThread(documentId, next); return next; });
      if (result.points.length) showEvidence(documentId, result);
      void status.refetch();
    } catch (error) {
      if (!controller.signal.aborted) notifyText(error instanceof Error ? error.message : "답변을 만들지 못했습니다.");
      setDraft(text); if (asked) set({ focus: asked });
    } finally { setLive(null); abort.current = null; }
  };
  // A question sent from elsewhere (selection bar, a follow-up chip) goes as soon as the window is open.
  useEffect(() => { if (open && pending && !live) void ask(pending); }, [open, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => { if (!documentId) return; setThread([]); writeThread(documentId, []); useAskMarks.getState().set(documentId, []); };
  const copy = async (item: AskResult) => { try { await navigator.clipboard.writeText(plainAnswer(item)); setCopied(item.at); setTimeout(() => setCopied(null), 1600); } catch { notifyText("복사하지 못했습니다."); } };
  const save = async (item: AskResult) => {
    if (!documentId) return;
    const short = shortTitle(doc.data?.title ?? "논문"), now = new Date().toISOString();
    const evidence = item.points.map((point, index) => `[[(${short}, p.${point.page}) Q${index + 1} '${point.text.replace(/[[\]|]/g, " ")}'|/reader/${documentId}?page=${point.page}]]`).join("\n");
    const body = [item.answer.replace(/\*\*/g, "").replace(/\[S(\d)\]/g, (_, n) => item.sources[Number(n) - 1] ? `(${item.sources[Number(n) - 1].title})` : ""), evidence, ...item.sources.map(source => `${source.title} — ${source.url}`)].filter(Boolean).join("\n");
    try { await noteRepository.put({ id: crypto.randomUUID(), title: item.question.slice(0, 60), body, pinned: false, createdAt: now, updatedAt: now }); notifyText("답변을 노트에 저장했습니다"); }
    catch { notifyText("노트에 저장하지 못했습니다."); }
  };
  const estimate = estimateQuestion(options);
  const motionProps = reduced ? {} : { initial: { opacity: 0, y: 16, scale: .98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 12, scale: .98 }, transition: { type: "spring" as const, stiffness: 420, damping: 34 } };

  return <div className="pf-askdock" data-open={open || undefined} data-inspector={inspectorOpen || undefined} data-wide={wide || undefined}>
    <AnimatePresence initial={false}>
      {open ? <motion.section key="panel" className="pf-askdock-panel dd-glass" role="dialog" aria-label="논문 질문" {...motionProps} onKeyDown={event => { if (event.key === "Escape") set({ open: false }); }}>
        <header className="pf-askdock-head">
          <span className="pf-ask-icon"><MessageCircleQuestion size={16}/></span>
          <div><h3>논문 질문</h3><p title={doc.data?.title}>{doc.data ? shortTitle(doc.data.title) : "논문"} · 분야 전문가 시점으로 답함</p></div>
          {thread.length > 0 && <button type="button" className="pf-askdock-tool" aria-label="대화 지우기" title="대화 지우기" onClick={clear}><Trash2 size={14}/></button>}
          <button type="button" className="pf-askdock-tool" aria-label={wide ? "좁게 보기" : "넓게 보기"} title={wide ? "좁게 보기" : "넓게 보기"} onClick={() => set({ wide: !wide })}>{wide ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>
          <button type="button" className="pf-askdock-tool" aria-label="질문 창 닫기" title="닫기 (Esc)" onClick={() => set({ open: false })}><X size={15}/></button>
        </header>

        <div className="pf-askdock-thread dd-scrollbar">
          {!thread.length && !live && <div className="pf-ask-empty">
            <p className="pf-ask-lead">이 논문에 대해 무엇이든 물어보세요. 답의 근거 문장을 <b>Q1·Q2</b> 형광으로 원문에 짚어 주고, 식과 인자는 기호·단위까지 풀어서 설명합니다.</p>
            <small>이렇게 물어보세요</small>
            {SUGGESTIONS.map(item => <button key={item.text} type="button" onClick={() => { if (item.literature) set({ options: { ...options, literature: true } }); void ask(item.text); }}><span>{item.text}</span><em>{item.hint}</em></button>)}
            <p className="pf-ask-tip"><Quote size={12}/>본문에서 문장을 드래그한 뒤 선택 메뉴의 <b>질문</b>을 누르면 그 문장에 대해 물어볼 수 있습니다.</p>
          </div>}
          {thread.map(item => <article key={item.at} className="pf-ask-turn">
            {item.focus && <blockquote className="pf-ask-focus"><Quote size={11}/>p.{item.focus.page} “{item.focus.text.slice(0, 140)}{item.focus.text.length > 140 ? "…" : ""}”</blockquote>}
            <p className="pf-ask-q">{item.question}</p>
            <div className="pf-ask-a" data-found={item.found || undefined}>
              <AnswerText text={item.answer} onQuote={index => documentId && showEvidence(documentId, item, index)} onSource={index => item.sources[index] && window.open(item.sources[index].url, "_blank", "noopener,noreferrer")}/>
              {item.points.length > 0 && <div className="pf-ask-block"><small>논문 근거 · 누르면 원문으로 이동</small><ol>{item.points.map((point, index) => <li key={point.quote}><button type="button" onClick={() => documentId && showEvidence(documentId, item, index)}><i>Q{index + 1}</i><span><small>p.{point.page}</small>{point.text}</span></button></li>)}</ol></div>}
              {item.sources.length > 0 && <div className="pf-ask-block"><small>외부 자료</small><ol className="pf-ask-sources">{item.sources.map((source, index) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer"><i>S{index + 1}</i><span><b>{source.title}</b>{source.note && <em>{source.note}</em>}<small>{source.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</small></span><ExternalLink size={12}/></a></li>)}</ol></div>}
              {item.followups.length > 0 && <div className="pf-ask-follow">{item.followups.map(text => <button key={text} type="button" onClick={() => void ask(text)}><Sparkles size={11}/>{text}</button>)}</div>}
              <footer>
                <span><Coins size={11}/>{item.credits + item.indexCredits} 크레딧{item.indexCredits ? ` (색인 ${item.indexCredits})` : ""}{item.model ? ` · ${item.model.replace(/-\d{4}-\d{2}-\d{2}$/, "")}` : ""}{item.searches ? ` · 웹 검색 ${item.searches}회` : ""}</span>
                <span className="pf-ask-actions">
                  <button type="button" title="복사" aria-label="답변 복사" onClick={() => void copy(item)}>{copied === item.at ? <Check size={13}/> : <Copy size={13}/>}</button>
                  <button type="button" title="노트에 저장" aria-label="답변을 노트에 저장" onClick={() => void save(item)}><NotebookPen size={13}/></button>
                  <button type="button" title="다시 묻기" aria-label="같은 질문 다시 묻기" onClick={() => void ask(item.question)}><RotateCcw size={13}/></button>
                </span>
              </footer>
            </div>
          </article>)}
          {live && <article className="pf-ask-turn">
            {live.focus && <blockquote className="pf-ask-focus"><Quote size={11}/>p.{live.focus.page} “{live.focus.text.slice(0, 140)}”</blockquote>}
            <p className="pf-ask-q">{live.question}</p>
            <div className="pf-ask-a pf-ask-live">
              {live.text ? <AnswerText text={live.text}/> : null}
              <p className="pf-ask-stage"><Loader2 size={13} className="animate-spin"/>{STAGE[live.stage]}…</p>
            </div>
          </article>}
          <div ref={end}/>
        </div>

        <form className="pf-askdock-composer" onSubmit={event => { event.preventDefault(); void ask(draft); }}>
          {focus && <div className="pf-ask-focus-chip"><Quote size={11}/><span>p.{focus.page} “{focus.text.slice(0, 90)}{focus.text.length > 90 ? "…" : ""}”</span><button type="button" aria-label="선택한 문장 빼기" onClick={() => set({ focus: null })}><X size={12}/></button></div>}
          {focus && !live && <div className="pf-ask-quick">{FOCUS_ASKS.map(text => <button key={text} type="button" onClick={() => void ask(text)}>{text}</button>)}</div>}
          <div className="pf-ask-input">
            <textarea ref={input} aria-label="논문에 질문" rows={1} placeholder={focus ? "이 문장에 대해 물어보세요 (예: 이 식의 의미는?)" : "예: 토양 건강 증진 효과를 말하는 부분은 어디야?"} value={draft}
              onChange={event => { setDraft(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(140, event.target.scrollHeight)}px`; }}
              onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(draft); } }}/>
            {live ? <button type="button" className="pf-ask-send" data-stop="" aria-label="답변 멈추기" onClick={() => abort.current?.abort()}><Square size={12}/></button>
              : <button type="submit" className="pf-ask-send" aria-label="질문 보내기" disabled={!draft.trim()}><ArrowUp size={15}/></button>}
          </div>
          <div className="pf-ask-options">
            <button type="button" aria-pressed={options.literature} title="OpenAlex에서 관련 논문을 찾아 함께 비교합니다 (무료)" onClick={() => set({ options: { ...options, literature: !options.literature } })}><BookMarked size={12}/>관련 논문</button>
            <button type="button" aria-pressed={options.web} title="웹을 검색해 최신 자료·표준·정의를 함께 봅니다 (검색 1회 약 34 크레딧)" onClick={() => set({ options: { ...options, web: !options.web } })}><Globe size={12}/>웹 검색</button>
            <button type="button" aria-pressed={options.speed === "deep"} title="더 강한 모델(gpt-5.1)로 비판적 검토·긴 설명을 합니다 (질문당 약 80–100 크레딧)" onClick={() => set({ options: { ...options, speed: options.speed === "deep" ? "fast" : "deep" } })}><Gauge size={12}/>정밀</button>
            <span className="pf-ask-estimate" title="실제 사용량으로 차감됩니다"><Coins size={11}/>약 {estimate}{status.data && !status.data.indexed ? ` + 색인 ${status.data.indexCredits}` : ""} 크레딧</span>
          </div>
        </form>
      </motion.section>
      : <motion.button key="launcher" type="button" className="pf-askdock-launcher" {...motionProps} onClick={() => set({ open: true })} aria-label="논문 질문 열기 (Ctrl+J)">
        <MessageCircleQuestion size={19}/>{thread.length > 0 && <i>{thread.length}</i>}
      </motion.button>}
    </AnimatePresence>
  </div>;
}
