"use client";
import { documentRepository } from "../persistence/document-repository";
import type { TranslationManifest } from "../translation/manifest";
import { GUIDE_VERSION, guideUnits, tidyGuide, pageChunks, validateBrief, validatePages, type GuidePage, type GuideUnit, type PaperGuide } from "./guide";
import { guideCreditEstimate } from "./cost";

/** Credits a new guide of this paper will cost, about (charged by real usage). */
export function estimateGuideCredits(manifest: TranslationManifest) {
  const { wire } = guideUnits(manifest), chars = wire.reduce((sum, unit) => sum + unit.text.length, 0);
  return guideCreditEstimate(chars, "all", pageChunks(wire).length);
}

/** The paper's guide: stored with the paper once made (and synced with the account). */
export async function loadGuide(documentId: string): Promise<PaperGuide | null> {
  const doc = await documentRepository.getDocument(documentId);
  return doc?.guide?.version === GUIDE_VERSION ? tidyGuide(doc.guide as PaperGuide) : null;
}

export interface GuideProgress { brief: "pending" | "done" | "failed"; pagesDone: number; pagesTotal: number }

async function call(mode: "brief" | "pages", units: GuideUnit[], pages?: number[]) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("/api/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, units, pages }) });
    const body = await response.json().catch(() => ({ error: "가이드 응답을 읽지 못했습니다." }));
    if (response.ok) return body as { part: unknown; credits: number; model?: string };
    // A refused request (credits, configuration) is not retried; a timeout or a malformed answer is, once.
    if (attempt || [400, 402, 403, 503].includes(response.status)) throw new Error(body.error || "가이드를 만들지 못했습니다.");
  }
  throw new Error("가이드를 만들지 못했습니다.");
}

/**
 * Make the guide: the brief (whole paper) and the page guides (about six pages per request) run in
 * parallel, three requests at a time. A page group that fails twice is left out; the rest is kept.
 */
export async function createGuide(documentId: string, manifest: TranslationManifest, onProgress?: (progress: GuideProgress) => void): Promise<PaperGuide> {
  const { wire, byWire } = guideUnits(manifest), chunks = pageChunks(wire), started = Date.now();
  const progress: GuideProgress = { brief: "pending", pagesDone: 0, pagesTotal: chunks.reduce((sum, chunk) => sum + chunk.length, 0) };
  onProgress?.({ ...progress });
  let credits = 0, model: string | undefined;
  const pages: GuidePage[] = [];
  const state: { brief: ReturnType<typeof validateBrief>; error: unknown } = { brief: null, error: null };
  const tasks: (() => Promise<void>)[] = [
    async () => {
      try { const result = await call("brief", wire); credits += result.credits; model = result.model ?? model; state.brief = validateBrief(result.part, byWire); progress.brief = state.brief ? "done" : "failed"; }
      catch (error) { state.error = error; progress.brief = "failed"; }
      onProgress?.({ ...progress });
    },
    ...chunks.map(chunk => async () => {
      try {
        const units = wire.filter(unit => chunk.includes(unit.page));
        const result = await call("pages", units, chunk); credits += result.credits; model = result.model ?? model;
        pages.push(...validatePages(result.part, byWire, chunk));
      } catch { /* this group is left out */ }
      progress.pagesDone += chunk.length; onProgress?.({ ...progress });
    })
  ];
  const queue = [...tasks];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { for (let task = queue.shift(); task; task = queue.shift()) await task(); }));
  if (!state.brief) throw state.error instanceof Error ? state.error : new Error("가이드 내용을 확인하지 못했습니다. 다시 시도해 주세요.");
  const guide: PaperGuide = { ...state.brief, version: GUIDE_VERSION, createdAt: new Date().toISOString(), model, pages: pages.sort((a, b) => a.page - b.page) };
  await documentRepository.updateDocument(documentId, { guide });
  window.dispatchEvent(new Event("paperflow:credits-changed"));
  window.dispatchEvent(new CustomEvent("paperflow:guide-finished", { detail: { documentId, credits, model, ms: Date.now() - started, pages: guide.pages.length, pagesTotal: progress.pagesTotal, marks: guide.pages.reduce((sum, page) => sum + page.marks.length, 0) } }));
  return guide;
}
