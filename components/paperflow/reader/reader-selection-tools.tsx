"use client";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import type { AnnotationColor } from "@/lib/paperflow/anchors/types";
import { readableError } from "@/lib/paperflow/errors";
import { usePaperflow } from "../shell/paperflow-context";
import { SelectionActionBar } from "./selection-action-bar";
export function ReaderSelectionTools({ documentId, ...props }: { documentId: string; onHighlight: (color: AnnotationColor) => void; onNote: () => void; onShell: (name: string) => void; onDismiss: () => void; saving: boolean }) {
  const selection = useReaderStore(s => s.activeSelection), { notify } = usePaperflow();
  const copy = async () => {
    try { if (selection) { await navigator.clipboard.writeText(selection.textQuote); notify("원문을 복사했습니다."); } }
    catch (reason) { notify(readableError(reason)); }
  };
  return selection?.documentId === documentId ? <SelectionActionBar anchor={selection} onCopy={() => void copy()} {...props}/> : null;
}
