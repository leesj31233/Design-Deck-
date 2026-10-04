"use client";
import Link from "next/link";
import { Archive, Network, NotebookPen, LibraryBig, Compass, Trash2 } from "lucide-react";
import { Sidebar } from "@/components/ui/sidebar";
import { AccountCard } from "./account-card";
import { PaperflowWordmark } from "./paperflow-logo";
export function PaperflowSidebar({ view, onView, trashCount = 0 }: { view: string; onView: (view: string) => void; trashCount?: number }) {
  return <Sidebar className="pf-sidebar" activeId={view} onSelect={onView}
    header={<Link href="/library" className="pf-brand"><PaperflowWordmark/></Link>}
    items={[{ id: "library", label: "서재", icon: LibraryBig }, { id: "notes", label: "노트", icon: NotebookPen }, { id: "archive", label: "아카이브", icon: Archive }, { id: "map", label: "연구맵", icon: Network }, { id: "discover", label: "추천 논문", icon: Compass }, { id: "trash", label: "휴지통", icon: Trash2, badge: trashCount || undefined }]}
    footer={<div className="pf-side-footer"><AccountCard/></div>} />;
}
