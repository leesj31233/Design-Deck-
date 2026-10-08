"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { loadGuide } from "@/lib/paperflow/guide/client";
import type { GuideRef, PaperType } from "@/lib/paperflow/guide/guide";
import { CONDITIONS_HEADING } from "@/lib/paperflow/guide/guide-export";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { guideFont } from "./guide-page";
import "./guide.css";

/** Level 05 and 06 are named for the kind of study. */
const DESIGN_SUB: Record<PaperType, string> = { experimental: "STUDY DESIGN", computational: "MODEL & DATA", theoretical: "MODEL & ASSUMPTIONS", review: "REVIEW SCOPE" };

/** Bring a guide item's source into view and flash it on its page. */
export function focusSource(item: string, ref: GuideRef | undefined) {
  if (!ref) return;
  useReaderStore.getState().set({ guideFocus: { unitId: ref.unitId, page: ref.page, key: Date.now(), item, quote: ref.quote } });
  document.querySelector(`[data-continuous-page="${ref.page}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
}

const TEN = [["why", "WHY", "왜 했음"], ["what", "WHAT", "무엇을 했음"], ["how", "HOW", "어떻게 확인했음"], ["found", "FOUND", "무엇이 나왔음"], ["conclusion", "CONCLUSION", "결론"]] as const;
const INTRO = [["problem", "PROBLEM"], ["gap", "GAP"], ["why", "WHY"], ["objective", "OBJECTIVE"]] as const;
const CONCLUSION = [["finding", "FINAL FINDING"], ["meaning", "PRACTICAL MEANING"], ["limitation", "LIMITATION"], ["next", "NEXT STEP"]] as const;
const CIRCLED = ["①", "②", "③", "④", "⑤"];

function Level({ n, title, sub, children, delay = 0 }: { n: string; title: string; sub?: string; children: React.ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  return <motion.section className="pf-brief-level" initial={reduced ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay, type: "spring", stiffness: 220, damping: 28 }}>
    <header><b>{n}</b><h3>{title}</h3>{sub && <small>{sub}</small>}</header>
    {children}
  </motion.section>;
}

/**
 * The Research Brief above page 1: the paper understood first, from easy to detailed. Reading it
 * top to bottom answers, in order: what is this paper → what did it find → how → under which
 * conditions → with what results → why → what to take → its limits → which figures to look at.
 * Scrolling on, the page guides, highlights and the original text continue the same story in detail.
 */
export function GuideBrief({ documentId, width, scale, standalone = false }: { documentId: string; width: number; scale: number; /** In the brief sheet: always shown, full width, not collapsible. */ standalone?: boolean }) {
  const on = useReaderStore(s => s.guideOverlay), show = useReaderStore(s => s.guideLayers.brief);
  const guide = useQuery({ queryKey: ["guide", documentId], queryFn: () => loadGuide(documentId), enabled: on || standalone });
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem(`pf-brief-open:${documentId}`) !== "0"); } catch { /* default open */ } }, [documentId]);
  const toggle = () => setOpen(value => { try { localStorage.setItem(`pf-brief-open:${documentId}`, value ? "0" : "1"); } catch { /* fine */ } return !value; });
  const data = guide.data;
  if (!data || !standalone && (!on || !show)) return null;
  const font = standalone ? 13.5 : guideFont(scale);
  const marks = data.pages.reduce((sum, page) => sum + page.marks.length, 0);

  if (!open && !standalone) return <div className="pf-brief pf-brief-closed" style={{ width, fontSize: font }}>
    <button type="button" onClick={toggle}><Sparkles size={14}/><span><b>Research Brief</b>{data.definition}</span><ChevronDown size={16}/></button>
  </div>;

  return <article className="pf-brief" data-standalone={standalone || undefined} style={{ width: standalone ? "100%" : width, fontSize: font }} aria-label="AI 리딩 가이드: 논문 브리프">
    <header className="pf-brief-head">
      <span className="pf-brief-mark"><Sparkles size={14}/>Research Brief</span>
      <small>AI 리딩 가이드 · 페이지 가이드 {data.pages.length}쪽 · 형광 근거 {marks}개{data.model ? ` · ${data.model.replace(/-\d{4}-\d{2}-\d{2}$/, "")}` : ""}</small>
      <button type="button" onClick={toggle} aria-label="브리프 접기"><ChevronUp size={16}/></button>
    </header>

    <Level n="01" title="이 논문은?" sub="PAPER DEFINITION">
      <p className="pf-brief-definition">{data.definition}</p>
      {data.intro && <p className="pf-brief-intro">{data.intro}</p>}
    </Level>

    <Level n="02" title="10초 요약" sub="10-SECOND SUMMARY">
      <dl className="pf-brief-ten">{TEN.map(([key, label, korean]) => data.tenSeconds[key] && <div key={key}><dt><small>{label}</small>{korean}</dt><dd>{data.tenSeconds[key]}</dd></div>)}</dl>
    </Level>

    {data.takeaway && <Level n="03" title="한 줄 결론" sub="ONE-LINE TAKEAWAY"><blockquote className="pf-brief-takeaway">{data.takeaway}</blockquote></Level>}

    {data.flow.length > 0 && <Level n="04" title="연구 흐름" sub="RESEARCH FLOW">
      <ol className="pf-brief-flow">{data.flow.map((step, index) => <li key={step + index}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol>
    </Level>}

    {data.composition.length > 0 && <Level n="05" title="연구 구성" sub={DESIGN_SUB[data.paperType ?? "experimental"]}>
      <dl className="pf-brief-grid">{data.composition.map(item => <div key={item.label + item.value} data-link={Boolean(item.ref) || undefined} onClick={() => focusSource(`composition-${item.label}`, item.ref)}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    </Level>}

    {data.conditions.length > 0 && <Level n="06" title={CONDITIONS_HEADING[data.paperType ?? "experimental"]} sub="KEY CONDITIONS">
      <table className="pf-brief-spec"><tbody>{data.conditions.map(item => <tr key={item.label + item.value} data-link={Boolean(item.ref) || undefined} onClick={() => focusSource(`condition-${item.label}`, item.ref)}><th>{item.label}</th><td>{item.value}</td><td>{item.ref ? `p.${item.ref.page}` : ""}</td></tr>)}</tbody></table>
    </Level>}

    {data.results.length > 0 && <Level n="07" title="핵심 결과" sub="KEY RESULTS">
      <ol className="pf-brief-results">{data.results.map((item, index) => <li key={item.keyword + index}>
        <button type="button" disabled={!item.ref} onClick={() => focusSource(`result-${index}`, item.ref)}>
          <span className="pf-brief-rank">{String(index + 1).padStart(2, "0")}</span>
          <span className="pf-brief-result"><small>{item.keyword}</small><strong>{item.headline}</strong>{item.comparison && <em>{item.comparison}</em>}</span>
          {item.ref && <span className="pf-brief-page">p.{item.ref.page} 원문 →</span>}
        </button>
      </li>)}</ol>
    </Level>}

    {data.mechanisms.length > 0 && <Level n="08" title="왜 이런 결과가 나왔나?" sub="MECHANISM">
      <div className="pf-brief-mechanisms">{data.mechanisms.map((item, index) => <div key={index} className="pf-brief-chain" data-source={item.source}>
        <span className="pf-brief-source">{item.source === "author" ? "저자 해석" : "AI 해석"}</span>
        <ol>{item.chain.map((step, at) => <li key={step + at}>{step}{at < item.chain.length - 1 && <ArrowDown size={13} aria-hidden="true"/>}</li>)}</ol>
        {item.note && <p>{item.note}</p>}
      </div>)}</div>
    </Level>}

    {data.takeaways.length > 0 && <Level n="09" title="이 논문에서 가져갈 것" sub="FOR YOUR RESEARCH"><ul className="pf-brief-checks">{data.takeaways.map(item => <li key={item}>{item}</li>)}</ul></Level>}

    {data.limitations.length > 0 && <Level n="10" title="한계와 주의점" sub="LIMITATION"><ul className="pf-brief-limits">{data.limitations.map(item => <li key={item.keyword}><strong>{item.keyword}</strong>{item.text}</li>)}</ul></Level>}

    {data.figures.length > 0 && <Level n="11" title="꼭 볼 Figure · Table" sub="FIGURE GUIDE">
      <ol className="pf-brief-figures">{data.figures.map(item => <li key={item.label} data-stars={item.stars}>
        <button type="button" disabled={!item.ref} onClick={() => focusSource(`figure-${item.label}`, item.ref)}>
          <header><strong>{item.label}</strong><span aria-label={`중요도 ${item.stars}/5`}>{"★".repeat(item.stars)}<i>{"★".repeat(5 - item.stars)}</i></span>{item.ref && <small>p.{item.ref.page}</small>}</header>
          <p>{item.what}</p>
          {item.look.length > 0 && <ul>{item.look.map((look, index) => <li key={look}><b>{CIRCLED[index]}</b>{look}</li>)}</ul>}
          {item.conclusion && <p className="pf-brief-figure-end"><small>결론</small>{item.conclusion}</p>}
        </button>
      </li>)}</ol>
    </Level>}

    {(data.terms.length > 0 || data.introParts.problem || data.conclusionParts.finding) && <Level n="12" title="읽기 전에 알아둘 것" sub="TERMS · STRUCTURE">
      {data.terms.length > 0 && <dl className="pf-brief-terms">{data.terms.map(term => <div key={term.term}><dt>{term.term}{term.korean && <small>{term.korean}</small>}</dt><dd>{term.explanation}</dd></div>)}</dl>}
      <div className="pf-brief-bookends">
        {data.introParts.problem && <section><h4>Introduction에서</h4><dl>{INTRO.map(([key, label]) => data.introParts[key] && <div key={key}><dt>{label}</dt><dd>{data.introParts[key]}</dd></div>)}</dl></section>}
        {data.conclusionParts.finding && <section><h4>Conclusion에서</h4><dl>{CONCLUSION.map(([key, label]) => data.conclusionParts[key] && <div key={key}><dt>{label}</dt><dd>{data.conclusionParts[key]}</dd></div>)}</dl></section>}
      </div>
    </Level>}

    <footer className="pf-brief-foot"><ArrowDown size={15}/>스크롤하면 페이지별 핵심 · 수치 · 원문 근거가 이어짐</footer>
  </article>;
}
