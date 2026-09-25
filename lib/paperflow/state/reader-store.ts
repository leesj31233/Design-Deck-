import { create } from "zustand";
import type { TextAnchor } from "../anchors/types";
type ReaderUiState = {
  documentId: string | null; currentPage: number; zoom: number; fitMode: "width" | "page" | "custom";
  inspectorOpen: boolean; pageRailOpen: boolean; activeSelection: TextAnchor | null;
  set: (patch: Partial<Omit<ReaderUiState, "set" | "reset">>) => void;
  reset: (id: string, page: number) => void;
};
export const useReaderStore = create<ReaderUiState>(set => ({
  documentId: null, currentPage: 1, zoom: 100, fitMode: "width", inspectorOpen: true, pageRailOpen: true, activeSelection: null,
  set: patch => set(patch), reset: (documentId, currentPage) => set({ documentId, currentPage, zoom: 100, fitMode: "width", activeSelection: null })
}));
