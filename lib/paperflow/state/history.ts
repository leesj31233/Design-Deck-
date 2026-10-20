import { annotationRepository } from "../persistence/annotation-repository";
import type { Annotation } from "../anchors/types";

/**
 * Undo / redo for the reader (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z): marks, pen strokes, erasing, text
 * memos, notes and showing a paragraph's translation. Every step knows how to reverse itself.
 */
export interface HistoryStep { label: string; undo: () => Promise<void> | void; redo: () => Promise<void> | void }
const LIMIT = 100;
const past: HistoryStep[] = [], future: HistoryStep[] = [];
let afterChange: () => void = () => undefined;

/** Called after every undo/redo (the reader refreshes its annotation queries here). */
export function onHistoryChange(listener: () => void) { afterChange = listener; }
export function recordStep(step: HistoryStep) { past.push(step); if (past.length > LIMIT) past.shift(); future.length = 0; }
export function clearHistory() { past.length = 0; future.length = 0; }
export const canUndo = () => past.length > 0, canRedo = () => future.length > 0;

export async function undo(): Promise<string | null> {
  const step = past.pop(); if (!step) return null;
  await step.undo(); future.push(step); afterChange(); return step.label;
}
export async function redo(): Promise<string | null> {
  const step = future.pop(); if (!step) return null;
  await step.redo(); past.push(step); afterChange(); return step.label;
}

// Annotation writes that record themselves. `put` (not `add`) so a redo after an undo never collides.
export async function createAnnotation(annotation: Annotation, label: string) {
  await annotationRepository.create(annotation);
  recordStep({ label, undo: () => annotationRepository.remove(annotation.id), redo: () => annotationRepository.update(annotation) });
}
export async function removeAnnotation(annotation: Annotation, label: string) {
  await annotationRepository.remove(annotation.id);
  recordStep({ label, undo: () => annotationRepository.update(annotation), redo: () => annotationRepository.remove(annotation.id) });
}
export async function updateAnnotation(before: Annotation, after: Annotation, label: string) {
  await annotationRepository.update(after);
  recordStep({ label, undo: () => annotationRepository.update(before), redo: () => annotationRepository.update(after) });
}
