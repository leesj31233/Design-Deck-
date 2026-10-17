"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TranslationJobStatus } from "@/lib/paperflow/translation/document-job";

/**
 * Whole-paper translation progress: a jade gauge with "231 / 243 문단 번역 중", which turns into
 * "번역 완료!" with a check when every paragraph is done, then quietly folds away.
 */
export function BatchProgress({ bulk, onCancel, onResume }: { bulk: TranslationJobStatus; onCancel: () => void; onResume: () => void }) {
  const reduced = useReducedMotion();
  const total = bulk.translatableBlocks, done = Math.min(bulk.translated, total || bulk.translated);
  const ratio = total ? done / total : 0, percent = Math.round(ratio * 100);
  const analysing = bulk.running && !total, state = bulk.running ? "running" : bulk.complete ? "complete" : "partial";
  const [hidden, setHidden] = useState(false);
  // A finished job shows its success for a moment, then gets out of the way.
  useEffect(() => { setHidden(false); if (state !== "complete") return; const timer = setTimeout(() => setHidden(true), 4200); return () => clearTimeout(timer); }, [state, bulk.documentId]);
  const seconds = Math.round((bulk.translationMs || 0) / 1000);

  return <AnimatePresence>{!hidden && <motion.div className="pf-batch" role="status" aria-live="polite" data-state={state} initial={reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: .25 } }}>
    <span className="pf-batch-icon" aria-hidden="true">
      <AnimatePresence mode="wait" initial={false}>
        {state === "complete"
          ? <motion.span key="done" className="pf-batch-check" initial={reduced ? false : { scale: .3, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 520, damping: 18 }}><Check size={14} strokeWidth={3}/></motion.span>
          : <motion.span key="work" initial={false} exit={{ scale: .5, opacity: 0 }}><Languages size={15}/></motion.span>}
      </AnimatePresence>
    </span>
    <span className="pf-batch-label">
      {analysing ? <>문단 구조 분석 중 <b>{bulk.extractedPages}/{bulk.total}쪽</b></>
        : state === "running" ? <><b>{done} / {total}</b> 문단 번역 중</>
        : state === "complete" ? <motion.b key="complete" initial={reduced ? false : { y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>번역 완료!</motion.b>
        : <>번역 일부 완료 <b>{done} / {total}</b></>}
      {state === "complete" && <small>{total}문단{seconds ? ` · ${seconds}초` : ""}</small>}
      {bulk.failed > 0 && state !== "running" && <small className="pf-batch-failed">실패 {bulk.failed}</small>}
      {bulk.running && bulk.rateLimitHits > 0 && <small>한도 대기 {bulk.rateLimitHits}회</small>}
    </span>
    <span className="pf-batch-track" aria-hidden="true">
      {analysing ? <span className="pf-batch-indeterminate"/> : <motion.span className="pf-batch-fill" initial={false} animate={{ width: `${Math.max(state === "complete" ? 100 : 2, percent)}%` }} transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 22 }}/>}
    </span>
    {!analysing && <span className="pf-batch-percent">{state === "complete" ? "100%" : `${percent}%`}</span>}
    {bulk.running && <Button size="sm" variant="ghost" onClick={onCancel}>중지</Button>}
    {state === "partial" && <Button size="sm" variant="secondary" onClick={onResume}>{bulk.failed ? "실패 문단 재시도" : "이어서 번역"}</Button>}
  </motion.div>}</AnimatePresence>;
}
