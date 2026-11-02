"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startTranslationJob, translationSummary, type TranslationJobStatus } from "@/lib/paperflow/translation/document-job";
import { readableError } from "@/lib/paperflow/errors";

/**
 * Whole-paper translation as a button that also shows how far the paper is translated: it fills
 * with the brand colour as paragraphs are stored, and is solid once the whole paper is done.
 */
export function TranslateButton({ documentId, job, notify }: { documentId: string; job?: TranslationJobStatus; notify: (text: string) => void }) {
  const summary = useQuery({ queryKey: ["translation-status", documentId], queryFn: () => translationSummary(documentId), staleTime: 60_000 });
  const running = Boolean(job?.running), { refetch } = summary;
  useEffect(() => { if (job && !job.running) void refetch(); }, [job, refetch]);
  const translated = running ? job!.translated : summary.data?.translated ?? 0, total = running ? job!.translatableBlocks || summary.data?.total || 0 : summary.data?.total ?? 0;
  const share = total ? Math.min(1, translated / total) : 0, complete = total > 0 && translated >= total;
  const label = running ? `${translated}/${total || "…"} 번역 중` : complete ? "번역 완료" : share > 0 ? `번역 ${Math.round(share * 100)}%` : "전체 번역";
  return <Button size="sm" variant="ghost" className="pf-translate-button" data-complete={complete || undefined} data-running={running || undefined} style={{ "--fill": `${Math.round(share * 100)}%` } as React.CSSProperties}
    disabled={running} title={complete ? "전체 번역이 저장되어 있습니다" : undefined}
    onClick={() => void startTranslationJob(documentId).catch(error => notify(readableError(error)))}>
    {complete ? <Check size={14}/> : <Languages size={14}/>}{label}
  </Button>;
}
