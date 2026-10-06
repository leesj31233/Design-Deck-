"use client";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import type { AnnotationColor } from "@/lib/paperflow/anchors/types";
import { readableError } from "@/lib/paperflow/errors";
import { usePaperflow } from "../shell/paperflow-context";
import { SelectionActionBar } from "./selection-action-bar";
import { citeSelection } from "@/lib/paperflow/notes/cite-selection";
export function ReaderSelectionTools({ documentId, ...props }: { documentId: string; onHighlight: (color: AnnotationColor) => void; onNote: () => void; onTranslate: () => void; onShell: (name: string) => void; onDismiss: () => void; saving: boolean }) {
  const selection = useReaderStore(s => s.activeSelection), { notify } = usePaperflow();
  const copy = async () => {
    try { if (selection) { await navigator.clipboard.writeText(selection.textQuote); notify("원문을 복사했습니다."); } }
    catch (reason) { notify(readableError(reason)); }
  };
  // Cites exactly what was selected (English source or the Korean translation).
  const cite = async () => {
    if (!selection) return;
    try { const { created } = await citeSelection(documentId, selection.pageIndex, selection.textQuote); notify(created ? "새 노트를 만들어 인용을 넣었습니다." : "최근 노트에 인용을 넣었습니다."); }
    catch (reason) { notify(readableError(reason)); }
  };
  return selection?.documentId === documentId ? <SelectionActionBar anchor={selection} onCopy={() => void copy()} onCite={() => void cite()} {...props}/> : null;
}
