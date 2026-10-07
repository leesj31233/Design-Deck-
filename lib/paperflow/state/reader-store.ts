import { create } from "zustand";
import type { AnnotationColor, TextAnchor } from "../anchors/types";
type ReaderUiState = {
  tool: "select" | "highlight" | "pen" | "eraser" | "text"; documentId: string | null; currentPage: number; zoom: number; fitMode: "width" | "page" | "custom";
  inspectorOpen: boolean; pageRailOpen: boolean; activeSelection: TextAnchor | null;
  /** A guide item being explained: its source sentence flashes on its page. */
  guideFocus: { unitId: string; page: number; key: number; item: string; quote?: string } | null;
  /** The AI reading guide on the paper: the brief above page 1, a guide beside each page, highlights and margin notes. */
  guideOverlay: boolean;
  /** Which guide layers are shown, and the highlight kinds filtered in. */
  guideLayers: { brief: boolean; pages: boolean; marks: boolean; kinds: string[] };
  /** While a guide is being written: the brief and how many pages are done. */
  guideProgress: { brief: "pending" | "done" | "failed"; pagesDone: number; pagesTotal: number; briefRetry?: boolean } | null;
  /** Make (or remake) the guide, with its estimated credits; set by the reader. */
  guideMaker: { make: () => void; estimate: number | null } | null;
  /** Highlighter colour; changed with Ctrl or 1–5 while dragging. */
  highlightColor: AnnotationColor;
  set: (patch: Partial<Omit<ReaderUiState, "set" | "reset">>) => void;
  reset: (id: string, page: number) => void;
};
export const useReaderStore = create<ReaderUiState>(set => ({
  tool: "select", documentId: null, currentPage: 1, zoom: 100, fitMode: "width", inspectorOpen: true, pageRailOpen: true, activeSelection: null, guideFocus: null, guideOverlay: false, guideLayers: { brief: true, pages: true, marks: true, kinds: ["result", "condition", "method", "mechanism", "limitation"] }, guideProgress: null, guideMaker: null, highlightColor: "yellow",
  set: patch => set(patch), reset: (documentId, currentPage) => set({ documentId, currentPage, zoom: 100, fitMode: "width", activeSelection: null, guideFocus: null })
}));
