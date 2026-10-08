"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles, Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { researchTerms } from "@/lib/paperflow/translation/research-style";
import type { ConceptExplanation } from "@/lib/paperflow/concept/concept";

// Answers already fetched on this device: the same term in the same paragraph is never asked twice.
const memory = new Map<string, ConceptExplanation>();
const STORE = "paperflow-concepts";
const keyOf = (term: string, source: string) => { let hash = 0; for (const char of `${term.toLowerCase()}|${source}`) hash = (hash * 31 + char.charCodeAt(0)) | 0; return String(hash); };
function remembered(key: string): ConceptExplanation | undefined {
  if (memory.has(key)) return memory.get(key);
  try { const value = JSON.parse(localStorage.getItem(STORE) ?? "{}")[key]; if (value) memory.set(key, value); return value; } catch { return undefined; }
}
function remember(key: string, value: ConceptExplanation) {
  memory.set(key, value);
  try { const all = JSON.parse(localStorage.getItem(STORE) ?? "{}"); all[key] = value; const keys = Object.keys(all); for (const old of keys.slice(0, Math.max(0, keys.length - 150))) delete all[old]; localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* Memory cache only. */ }
}

/** 선택 개념 공부: pick or drag a term; the AI explains it as this paper uses it, grounded in the paragraph. */
export function ConceptStudy({ source, selected, page, paper }: { source: string; selected: string; page: number | null; paper?: string }) {
  const terms = researchTerms.filter(term => source.toLowerCase().includes(term.toLowerCase())).slice(0, 12);
  const [draft, setDraft] = useState(""), [term, setTerm] = useState(""), [concept, setConcept] = useState<ConceptExplanation | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const reduced = useReducedMotion(), request = useRef<AbortController | null>(null);

  const explain = async (value: string) => {
    const name = value.trim();
    if (!name || !source) return;
    setTerm(name); setDraft(name); setError("");
    const key = keyOf(name, source), hit = remembered(key);
    if (hit) { setConcept(hit); return; }
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setPending(true); setConcept(null);
    try {
      const response = await fetch("/api/concept", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term: name, passage: source, paper }) });
      const body = await response.json().catch(() => ({ error: "설명 응답을 읽지 못했습니다." }));
      if (!response.ok || !body.concept) throw new Error(body.error || "개념 설명을 만들지 못했습니다.");
      remember(key, body.concept); setConcept(body.concept);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "개념 설명을 만들지 못했습니다."); }
    finally { if (request.current === controller) setPending(false); }
  };

  // A drag selection only fills the term in: the model is asked only when the reader presses 설명
  // (or a term chip), so selecting text never spends tokens. An answer already on this device shows at once.
  useEffect(() => {
    request.current?.abort(); setConcept(null); setError(""); setPending(false); setTerm("");
    const pick = selected.trim();
    if (!pick || pick.length > 70 || !source) { setDraft(""); return; }
    setDraft(pick);
    const hit = remembered(keyOf(pick, source));
    if (hit) { setTerm(pick); setConcept(hit); }
  }, [source, selected]);
  useEffect(() => () => request.current?.abort(), []);
  const rise = (index: number) => reduced ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: index * .04, type: "spring" as const, stiffness: 320, damping: 28 } };

  return <section className="pf-inspector-section pf-concept-study">
    <h3><Sparkles size={15}/> 개념 공부 <small>p. {page ?? "—"}</small></h3>
    {!source ? <p>문단을 누르거나 용어를 드래그하세요.</p> : <>
      <form className="pf-concept-ask" onSubmit={event => { event.preventDefault(); void explain(draft); }}>
        <Search size={14} aria-hidden="true"/><input aria-label="공부할 개념" placeholder="용어 입력 또는 아래에서 선택" value={draft} onChange={event => setDraft(event.target.value)}/>
        <Button size="sm" variant="primary" type="submit" disabled={pending || !draft.trim()}>설명</Button>
      </form>
      {!concept && !pending && <p className="pf-concept-hint">‘설명’을 누르면 AI가 설명합니다.</p>}
      {terms.length > 0 && <div className="pf-keywords">{terms.map(item => <Button key={item} size="sm" variant="ghost" aria-pressed={term === item} onClick={() => void explain(item)}>{item}</Button>)}</div>}
      {pending && <div className="pf-concept-loading" role="status" aria-label={`${term} 설명을 만드는 중`}><span/><span/><span/><small>{term}의 의미를 이 문단과 대조하는 중…</small></div>}
      {error && <p className="pf-error" role="alert">{error}</p>}
      {concept && !pending && <div className="pf-concept" aria-live="polite">
        <motion.div className="pf-concept-head" {...rise(0)}><strong>{concept.term || term}</strong><span className="pf-concept-badge">AI 설명 · 원문 대조</span></motion.div>
        <motion.div className="pf-concept-block" {...rise(1)}><small>일반 개념</small><p>{concept.definition}</p></motion.div>
        <motion.div className="pf-concept-block" {...rise(2)}><small>이 논문에서의 의미</small><p>{concept.inPaper}</p></motion.div>
        {concept.evidence.length > 0 && <motion.div className="pf-concept-block" {...rise(3)}><small>원문 근거</small>{concept.evidence.map(quote => <blockquote key={quote}>{quote}</blockquote>)}</motion.div>}
        {concept.quantities.length > 0 && <motion.div className="pf-concept-block" {...rise(4)}><small>수치 · 조건</small><dl className="pf-concept-values">{concept.quantities.map(item => <div key={item.label + item.value}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></motion.div>}
        {concept.related.length > 0 && <motion.div className="pf-concept-block" {...rise(5)}><small>다음에 볼 개념</small><div className="pf-keywords">{concept.related.map(item => <Button key={item} size="sm" variant="ghost" onClick={() => void explain(item)}>{item}</Button>)}</div></motion.div>}
        {concept.questions.length > 0 && <motion.div className="pf-concept-block" {...rise(6)}><small>공부할 질문</small><ol>{concept.questions.map(item => <li key={item}>{item}</li>)}</ol></motion.div>}
        {concept.needsMoreContext && <p className="pf-concept-note"><AlertTriangle size={12}/> 이 문단만으로는 역할을 다 설명하기 어렵습니다. 앞뒤 문단이나 방법 절을 함께 확인합니다.</p>}
      </div>}
    </>}
  </section>;
}
