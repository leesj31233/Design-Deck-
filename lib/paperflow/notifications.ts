import { create } from "zustand";

/**
 * Notices shown at the top right. A plain message replaces the previous plain message (as the old
 * single toast did); richer notices (a finished translation with its credit bill) stack above it.
 */
export type NoticeTone = "info" | "success" | "error" | "progress" | "credit";
export interface NoticeStat { label: string; value: string; hint?: string }
export interface Notice {
  id: string; tone: NoticeTone; title: string; body?: string;
  stats?: NoticeStat[];
  /** A meter, e.g. this month's credits: used of limit (limit null: unlimited). */
  meter?: { used: number; limit: number | null; label: string; caption?: string };
  /** Milliseconds before it leaves on its own; 0 stays until closed. */
  timeout: number;
  /** Notices with the same key replace each other. */
  key?: string;
  createdAt: number;
}

interface NoticeState { notices: Notice[]; push: (notice: Omit<Notice, "id" | "createdAt" | "timeout"> & { timeout?: number }) => string; dismiss: (id: string) => void }

const toneOf = (text: string): NoticeTone => /실패|못했|오류|없습니다|초과|모두 사용/.test(text) ? "error" : /중…$/.test(text) ? "progress" : /완료|저장|복원|담았|옮겼|보관했/.test(text) ? "success" : "info";
const defaultTimeout = (tone: NoticeTone) => tone === "progress" ? 0 : tone === "error" ? 7000 : tone === "credit" ? 12000 : 3600;

export const useNotices = create<NoticeState>(set => ({
  notices: [],
  push: notice => {
    const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const full: Notice = { ...notice, id, createdAt: Date.now(), timeout: notice.timeout ?? defaultTimeout(notice.tone) };
    set(state => ({ notices: [full, ...state.notices.filter(item => !(full.key && item.key === full.key))].slice(0, 4) }));
    return id;
  },
  dismiss: id => set(state => ({ notices: state.notices.filter(item => item.id !== id) }))
}));

/** The old one-line notify(): a plain message, its tone read from the wording. */
export function notifyText(text: string) {
  if (!text) return;
  useNotices.getState().push({ tone: toneOf(text), title: text, key: "message" });
}

/** "1분 12초", "7초". */
export function duration(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60 ? `${seconds % 60}초` : ""}`.trim();
}
