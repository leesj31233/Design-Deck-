import { create } from "zustand";
import type { TextAnchor } from "../anchors/types";
type ReaderUiState = {
  tool: "select" | "highlight" | "pen" | "eraser" | "text"; documentId: string | null; currentPage: number; zoom: number; fitMode: "width" | "page" | "custom";
  inspectorOpen: boolean; pageRailOpen: boolean; activeSelection: TextAnchor | null;
  /** A guide card being explained: its source paragraph is marked on the page and linked by an arrow. */
  guideFocus: { unitId: string; page: number; key: number; item: string; quote?: string } | null;
  /** The AI guide written on the paper: highlights, tapered arrows and handwritten margin notes. */
  guideOverlay: boolean;
  set: (patch: Partial<Omit<ReaderUiState, "set" | "reset">>) => void;
  reset: (id: string, page: number) => void;
};
export const useReaderStore = create<ReaderUiState>(set => ({
  tool: "select", documentId: null, currentPage: 1, zoom: 100, fitMode: "width", inspectorOpen: true, pageRailOpen: true, activeSelection: null, guideFocus: null, guideOverlay: false,
  set: patch => set(patch), reset: (documentId, currentPage) => set({ documentId, currentPage, zoom: 100, fitMode: "width", activeSelection: null, guideFocus: null })
}));
