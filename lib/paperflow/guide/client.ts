"use client";
import { documentRepository } from "../persistence/document-repository";
import type { TranslationManifest } from "../translation/manifest";
import { GUIDE_VERSION, guideUnits, validateGuide, type PaperGuide } from "./guide";

/** The paper's study guide: stored with the paper once made (and synced with the account). */
export async function loadGuide(documentId: string): Promise<PaperGuide | null> {
  const doc = await documentRepository.getDocument(documentId);
  return doc?.guide?.version === GUIDE_VERSION ? doc.guide : null;
}

export async function createGuide(documentId: string, manifest: TranslationManifest): Promise<PaperGuide> {
  const { wire, byWire } = guideUnits(manifest);
  const response = await fetch("/api/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ units: wire }) });
  const body = await response.json().catch(() => ({ error: "가이드 응답을 읽지 못했습니다." }));
  if (!response.ok) throw new Error(body.error || "가이드를 만들지 못했습니다.");
  const guide = validateGuide(body.guide, byWire);
  if (!guide) throw new Error("가이드 내용을 확인하지 못했습니다. 다시 시도해 주세요.");
  await documentRepository.updateDocument(documentId, { guide });
  return guide;
}
