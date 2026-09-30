import { memo } from "react";
import type { Annotation, AnchorRecoveryResult } from "@/lib/paperflow/anchors/types";
export type ResolvedAnnotation = { annotation: Annotation; recovery: AnchorRecoveryResult };
export const HighlightLayer = memo(function HighlightLayer({ annotations, selected }: { annotations: ResolvedAnnotation[]; selected?: string }) {
  return <div className="pf-highlight-layer" aria-hidden="true">{annotations.flatMap(({ annotation, recovery }) => recovery.status === "resolved" ? recovery.rects.map((rect, index) => <span key={`${annotation.id}-${index}`} data-testid="highlight-rect" data-annotation-id={annotation.id} data-color={annotation.color} className={`pf-highlight ${selected === annotation.id ? "pf-highlight-active" : ""}`} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}/>) : [])}</div>;
});
