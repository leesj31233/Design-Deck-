"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, Coins, Info, Loader2, X } from "lucide-react";
import { duration, useNotices, type Notice } from "@/lib/paperflow/notifications";
import { documentRepository } from "@/lib/paperflow/persistence/document-repository";
import { PARAGRAPHS_PER_PAPER } from "@/lib/paperflow/cloud/plans";
import "./notifications.css";

const ICON = { info: Info, success: Check, error: AlertTriangle, progress: Loader2, credit: Coins } as const;

type Credits = { used: number; limit: number | null; month: string };
/** The paper's title and this month's credits, for a finished-job notice. */
async function billOf(documentId: string) {
  const [doc, account] = await Promise.all([
    documentRepository.getDocument(documentId).catch(() => null),
    fetch("/api/cloud/account").then(response => response.ok ? response.json() : null).catch(() => null) as Promise<{ plan?: { credits: Credits } } | null>
  ]);
  return { title: doc?.title.replace(/\.pdf$/i, "") ?? "논문", credits: account?.plan?.credits };
}
function creditMeter(credits: Credits | undefined): Notice["meter"] {
  if (!credits) return undefined;
  const remaining = credits.limit !== null ? Math.max(0, credits.limit - credits.used) : null;
  return { used: credits.used, limit: credits.limit, label: `이번 달 크레딧 (${credits.month})`, caption: remaining === null ? "관리자 계정은 크레딧 제한이 없습니다" : `남은 크레딧 ${remaining.toLocaleString()} · 논문 약 ${Math.floor(remaining / PARAGRAPHS_PER_PAPER)}편 분량` };
}

/** One notice: icon, title, optional figures and a meter; a thin bar counts down and stops while pointed at. */
function NoticeCard({ notice }: { notice: Notice }) {
  const dismiss = useNotices(state => state.dismiss), [paused, setPaused] = useState(false), left = useRef(notice.timeout), started = useRef(Date.now());
  useEffect(() => {
    if (!notice.timeout || paused) return;
    started.current = Date.now();
    const timer = setTimeout(() => dismiss(notice.id), left.current);
    return () => { clearTimeout(timer); left.current -= Date.now() - started.current; };
  }, [paused, notice.id, notice.timeout, dismiss]);
  const Icon = ICON[notice.tone], meter = notice.meter, ratio = meter?.limit ? Math.min(1, meter.used / meter.limit) : 0;
  return <div className="pf-notice dd-glass" data-tone={notice.tone} data-paused={paused || undefined} role={notice.tone === "error" ? "alert" : "status"} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
    <span className="pf-notice-icon"><Icon size={15} aria-hidden="true"/></span>
    <div className="pf-notice-body">
      <strong>{notice.title}</strong>
      {notice.body && <p>{notice.body}</p>}
      {notice.stats && <dl className="pf-notice-stats">{notice.stats.map(stat => <div key={stat.label} title={stat.hint}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
      {meter && <div className="pf-notice-meter">
        <div className="pf-notice-meter-head"><span>{meter.label}</span><b>{meter.limit === null ? "무제한" : `${meter.used.toLocaleString()} / ${meter.limit.toLocaleString()}`}</b></div>
        {meter.limit !== null && <div className="pf-notice-track" role="meter" aria-valuemin={0} aria-valuemax={meter.limit} aria-valuenow={meter.used} aria-label={meter.label}><i style={{ width: `${ratio * 100}%` }} data-level={ratio > .9 ? "high" : ratio > .7 ? "mid" : undefined}/></div>}
        {meter.caption && <small>{meter.caption}</small>}
      </div>}
    </div>
    <button type="button" className="pf-notice-close" aria-label="알림 닫기" onClick={() => dismiss(notice.id)}><X size={13}/></button>
    {notice.timeout > 0 && <span className="pf-notice-timer" style={{ animationDuration: `${notice.timeout}ms` }}/>}
  </div>;
}

/**
 * The top-right notification stack. Besides plain messages it reports every finished translation:
 * what it translated, the credits it used (shared-cache paragraphs are free) and what is left this month.
 */
export function NotificationStack() {
  const notices = useNotices(state => state.notices), reduced = useReducedMotion();
  useEffect(() => {
    const finished = (event: Event) => {
      const detail = (event as CustomEvent<{ documentId: string; kind: "paper" | "part"; model: number; shared: number; failed: number; ms: number; complete: boolean }>).detail;
      if (!detail.model && !detail.shared) return;
      void (async () => {
        const { title, credits } = await billOf(detail.documentId);
        useNotices.getState().push({
          tone: "credit", key: `credit:${detail.documentId}`,
          title: detail.kind === "paper" ? (detail.complete ? "번역 완료" : "번역을 마쳤습니다 (일부 남음)") : "선택 번역 완료",
          body: title,
          stats: [
            { label: "번역", value: `${(detail.model + detail.shared).toLocaleString()}문단` },
            { label: "사용 크레딧", value: detail.model.toLocaleString(), hint: "모델이 번역한 문단 1개 = 1 크레딧" },
            ...(detail.shared ? [{ label: "공유 캐시", value: `${detail.shared}문단 무료`, hint: "이미 번역된 같은 문단은 크레딧을 쓰지 않습니다" }] : []),
            ...(detail.ms ? [{ label: "시간", value: duration(detail.ms) }] : []),
            ...(detail.failed ? [{ label: "실패", value: `${detail.failed}문단` }] : [])
          ],
          meter: creditMeter(credits)
        });
      })();
    };
    // The AI guide reports the same way: its credits (charged by model usage), pages covered, highlights.
    const guided = (event: Event) => {
      const detail = (event as CustomEvent<{ documentId: string; credits: number; model?: string; ms: number; pages: number; pagesTotal: number; marks: number }>).detail;
      void (async () => {
        const { title, credits } = await billOf(detail.documentId);
        const missed = Math.max(0, detail.pagesTotal - detail.pages);
        useNotices.getState().push({
          tone: "credit", key: `guide:${detail.documentId}`,
          title: missed ? "AI 가이드 완성 (일부 페이지 제외)" : "AI 가이드 완성",
          body: title,
          stats: [
            { label: "가이드", value: `${detail.pages}/${detail.pagesTotal}쪽` },
            { label: "하이라이트", value: `${detail.marks}곳` },
            { label: "사용 크레딧", value: detail.credits.toLocaleString(), hint: detail.model ? `${detail.model} 사용량 기준으로 청구` : "모델 사용량 기준으로 청구" },
            ...(detail.ms ? [{ label: "시간", value: duration(detail.ms) }] : [])
          ],
          meter: creditMeter(credits)
        });
      })();
    };
    window.addEventListener("paperflow:translation-finished", finished);
    window.addEventListener("paperflow:guide-finished", guided);
    return () => { window.removeEventListener("paperflow:translation-finished", finished); window.removeEventListener("paperflow:guide-finished", guided); };
  }, []);
  return <div className="pf-notice-stack" aria-live="polite">
    <AnimatePresence initial={false}>
      {notices.map(notice => <motion.div key={notice.id} layout={!reduced} initial={reduced ? false : { opacity: 0, y: -14, scale: .96, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={reduced ? { opacity: 0 } : { opacity: 0, x: 40, scale: .96, transition: { duration: .18 } }} transition={{ type: "spring", stiffness: 420, damping: 32 }}>
        <NoticeCard notice={notice}/>
      </motion.div>)}
    </AnimatePresence>
  </div>;
}
