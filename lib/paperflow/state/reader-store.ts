"use client";
import { create } from "zustand";
import type { AnchorResolution } from "../anchors/anchor";
import type { ReaderMode, Rect, SelectionAction } from "../types";

export type PendingSelection = {
  pageIndex: number;
  start: number;
  end: number;
  quote: string;
  pageText: string;
  rects: Rect[];
  pageWidth: number;
  pageHeight: number;
  /** Selection bounds in viewport coordinates, for placing the action bar. */
  clientRect: { top: number; bottom: number; left: number; right: number };
  createdAt: number;
};

export type InspectorTab = "evidence" | "notes" | "assist" | "info";
export type AssistRequest = { action: SelectionAction; quote: string; pageIndex: number; at: number };

export const ZOOM_STEPS = [50, 67, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];

type ReaderState = {
  documentId: string | null;
  page: number;
  pageCount: number;
  zoom: number;
  fit: "width" | "page" | null;
  mode: ReaderMode;
  railOpen: boolean;
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  selection: PendingSelection | null;
  activeHighlightId: string | null;
  resolutions: Record<string, AnchorResolution>;
  assist: AssistRequest | null;
  /** Monotonic navigation request consumed by the viewport. */
  navigation: { page: number; seq: number; startedAt: number } | null;

  reset: (documentId: string) => void;
  setPageCount: (n: number) => void;
  setVisiblePage: (page: number) => void;
  goToPage: (page: number) => void;
  setZoom: (zoom: number, fit?: "width" | "page" | null) => void;
  zoomStep: (direction: 1 | -1) => void;
  setMode: (mode: ReaderMode) => void;
  toggleRail: (open?: boolean) => void;
  toggleInspector: (open?: boolean) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setSelection: (s: PendingSelection | null) => void;
  setActiveHighlight: (id: string | null) => void;
  /** Replaces resolutions for the given highlight ids in one update. */
  setResolutions: (entries: Record<string, AnchorResolution>, replacedIds: string[]) => void;
  requestAssist: (req: Omit<AssistRequest, "at">) => void;
};

let seq = 0;

export const useReaderStore = create<ReaderState>((set, get) => ({
  documentId: null,
  page: 1,
  pageCount: 0,
  zoom: 100,
  fit: "width",
  mode: "original",
  railOpen: true,
  inspectorOpen: true,
  inspectorTab: "evidence",
  selection: null,
  activeHighlightId: null,
  resolutions: {},
  assist: null,
  navigation: null,

  reset: (documentId) =>
    set({ documentId, page: 1, pageCount: 0, selection: null, activeHighlightId: null, resolutions: {}, assist: null, navigation: null, inspectorTab: "evidence" }),
  setPageCount: (pageCount) => set({ pageCount }),
  setVisiblePage: (page) => set({ page }),
  goToPage: (page) => {
    const { pageCount } = get();
    const clamped = Math.max(1, Math.min(pageCount || 1, page));
    set({ page: clamped, navigation: { page: clamped, seq: ++seq, startedAt: performance.now() } });
  },
  setZoom: (zoom, fit = null) => set({ zoom: Math.max(25, Math.min(400, Math.round(zoom))), fit }),
  zoomStep: (direction) => {
    const { zoom } = get();
    const next = direction > 0 ? ZOOM_STEPS.find((z) => z > zoom + 0.5) ?? 400 : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.5) ?? 25;
    set({ zoom: next, fit: null });
  },
  setMode: (mode) => set({ mode }),
  toggleRail: (open) => set((s) => ({ railOpen: open ?? !s.railOpen })),
  toggleInspector: (open) => set((s) => ({ inspectorOpen: open ?? !s.inspectorOpen })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab, inspectorOpen: true }),
  setSelection: (selection) => set({ selection }),
  setActiveHighlight: (activeHighlightId) => set({ activeHighlightId }),
  setResolutions: (entries, replacedIds) =>
    set((s) => {
      const next = { ...s.resolutions };
      for (const id of replacedIds) delete next[id];
      return { resolutions: { ...next, ...entries } };
    }),
  requestAssist: (req) => set({ assist: { ...req, at: Date.now() }, inspectorTab: "assist", inspectorOpen: true }),
}));
