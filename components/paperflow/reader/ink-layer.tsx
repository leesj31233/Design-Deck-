"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReaderStore } from "@/lib/paperflow/state/reader-store";
import { annotationRepository } from "@/lib/paperflow/persistence/annotation-repository";
import type { Annotation } from "@/lib/paperflow/anchors/types";
import { usePaperflow } from "../shell/paperflow-context";
export function InkLayer({ documentId, pageIndex, annotations }: { documentId: string; pageIndex: number; annotations: Annotation[] }) {
  const mode = useReaderStore(s => s.tool), client = useQueryClient(), { notify } = usePaperflow();
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]), drawing = useRef(false), strokePoints = useRef<{ x: number; y: number }[]>([]);
  const position = (event: React.PointerEvent<SVGSVGElement>) => { const b = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (event.clientY - b.top) / b.height)) }; };
  const erase = async (id: string) => { try { await annotationRepository.remove(id); await client.invalidateQueries({ queryKey: ["annotations"] }); } catch { notify("마킹을 지우지 못했다."); } };
  return <svg className="pf-ink-layer" data-active={mode === "pen" || mode === "eraser"} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="펜과 지우개 레이어"
    onPointerDown={event => { if (mode !== "pen") return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; strokePoints.current = [position(event)]; setPoints(strokePoints.current); }}
    onPointerMove={event => { if (!drawing.current || strokePoints.current.length >= 1200) return; const next = position(event), previous = strokePoints.current.at(-1)!; if (Math.hypot(next.x - previous.x, next.y - previous.y) < .0015) return; strokePoints.current.push(next); if (strokePoints.current.length % 3 === 0) setPoints([...strokePoints.current]); }}
    onPointerCancel={() => { drawing.current = false; strokePoints.current = []; setPoints([]); }}
    onPointerUp={async event => { if (!drawing.current) return; drawing.current = false; const stroke = [...strokePoints.current, position(event)]; strokePoints.current = []; setPoints([]); if (stroke.length < 2) return; const now = new Date().toISOString(); const x = Math.min(...stroke.map(p => p.x)), y = Math.min(...stroke.map(p => p.y)); const rect = { x, y, width: Math.max(.002, Math.max(...stroke.map(p => p.x)) - x), height: Math.max(.002, Math.max(...stroke.map(p => p.y)) - y) };
      try { await annotationRepository.create({ id: crypto.randomUUID(), type: "ink", documentId, pageIndex, color: "blue", points: stroke, anchor: { version: 1, documentId, pageIndex, textQuote: "손글씨 메모", rects: [rect], normalizedRects: [rect], createdAt: now }, createdAt: now, updatedAt: now, resolutionStatus: "resolved" }); await client.invalidateQueries({ queryKey: ["annotations"] }); } catch { notify("펜 메모를 저장하지 못했다."); }
    }}>
    {annotations.filter(a => a.pageIndex === pageIndex).map(a => a.type === "ink" ? <polyline key={a.id} points={a.points?.map(p => `${p.x * 1000},${p.y * 1000}`).join(" ")} fill="none" stroke="#176aca" strokeWidth={mode === "eraser" ? 8 : 2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" onPointerDown={() => { if (mode === "eraser") void erase(a.id); }}/> : mode === "eraser" ? a.anchor.normalizedRects.map((r, i) => <rect key={a.id + i} x={r.x * 1000} y={r.y * 1000} width={r.width * 1000} height={r.height * 1000} fill="rgba(255,100,80,.15)" onPointerDown={() => void erase(a.id)}/>) : null)}
    <polyline points={points.map(p => `${p.x * 1000},${p.y * 1000}`).join(" ")} fill="none" stroke="#176aca" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>
  </svg>;
}
