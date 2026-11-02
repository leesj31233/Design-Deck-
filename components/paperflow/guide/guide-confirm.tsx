"use client";
import { useEffect, useState } from "react";
import { BookOpenText, Clock, Coins, Highlighter, Layers, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PARAGRAPHS_PER_PAPER } from "@/lib/paperflow/cloud/plans";
import "./guide.css";

type Credits = { used: number; limit: number | null; month: string };

/**
 * Before a guide is made (or made again): what the reader gets, what it costs against what is left this
 * month, and how long it takes. Nothing is charged until 만들기 is pressed.
 */
export function GuideConfirm({ open, onOpenChange, estimate, pages, again, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; estimate: number | null; pages: number; again: boolean; onConfirm: () => void }) {
  const [credits, setCredits] = useState<Credits | null | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/cloud/account").then(response => response.ok ? response.json() : null).then((body: { plan?: { credits: Credits } } | null) => { if (alive) setCredits(body?.plan?.credits ?? null); }).catch(() => { if (alive) setCredits(null); });
    return () => { alive = false; };
  }, [open]);
  const left = credits && credits.limit !== null ? Math.max(0, credits.limit - credits.used) : null;
  const short = left !== null && estimate !== null && left < estimate;
  const steps = [
    { icon: BookOpenText, title: "논문 브리프 12단계", text: "정의 · 10초 요약 · 연구 흐름 · 조건 · 핵심 결과 · 원인 · 한계 · Figure · 용어" },
    { icon: Layers, title: `페이지 가이드 ${pages}쪽`, text: "페이지마다 핵심 포인트와 다음 내용, 스크롤을 따라 옆에 고정" },
    { icon: Highlighter, title: "형광 근거", text: "결과 · 조건 · 방법 · 원인 · 한계를 원문 문장 위에 정확히 표시" }
  ];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="pf-gconfirm">
      <DialogHeader>
        <span className="pf-gconfirm-mark"><Sparkles size={14}/>AI READING GUIDE</span>
        <DialogTitle>{again ? "가이드를 다시 만들까요?" : "AI 리딩 가이드를 만들까요?"}</DialogTitle>
        <DialogDescription>{again ? "지금 가이드를 지우고 최신 모델과 지침으로 새로 만듭니다." : "먼저 논문 전체를 이해한 뒤, 쉬운 것부터 자세한 것 순서로 정리합니다. 세로 스크롤만으로 따라 읽을 수 있습니다."}</DialogDescription>
      </DialogHeader>
      <ol className="pf-gconfirm-steps">{steps.map(({ icon: Icon, title, text }) => <li key={title}><span><Icon size={15}/></span><div><strong>{title}</strong><small>{text}</small></div></li>)}</ol>
      <dl className="pf-gconfirm-bill">
        <div><dt><Coins size={13}/>예상 크레딧</dt><dd>약 {estimate?.toLocaleString() ?? "–"}<small>실제 사용량으로 차감</small></dd></div>
        <div><dt><Clock size={13}/>소요 시간</dt><dd>1–2분<small>읽는 동안 만들어집니다</small></dd></div>
        <div data-short={short || undefined}><dt>이번 달 남은 크레딧</dt><dd>{credits === undefined ? "확인 중…" : credits === null ? "–" : left === null ? "무제한" : left.toLocaleString()}<small>{short ? "크레딧이 부족합니다" : left !== null ? `논문 번역 약 ${Math.floor(left / PARAGRAPHS_PER_PAPER)}편 분량` : credits ? "관리자 계정" : credits === null ? "확인할 수 없음" : ""}</small></dd></div>
      </dl>
      <footer className="pf-gconfirm-actions">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>취소</Button>
        <Button variant="accent" onClick={() => { onOpenChange(false); onConfirm(); }} disabled={short}><Sparkles size={14}/>{again ? "다시 만들기" : "가이드 만들기"}</Button>
      </footer>
    </DialogContent>
  </Dialog>;
}
