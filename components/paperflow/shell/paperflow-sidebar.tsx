"use client";
import Link from "next/link";
import { BookOpen, Archive, Network, NotebookPen, LibraryBig, Layers, Compass } from "lucide-react";
import { Sidebar } from "@/components/ui/sidebar";
import { AccountCard } from "./account-card";
export function PaperflowSidebar({ view, onView }: { view: string; onView: (view: string) => void }) {
  return <Sidebar className="pf-sidebar" activeId={view} onSelect={onView}
    header={<Link href="/library" className="pf-brand"><span className="pf-logo"><BookOpen size={20}/></span><span>PAPERFLOW<small>RESEARCH WORKSPACE</small></span></Link>}
    items={[{ id: "library", label: "라이브러리", icon: LibraryBig }, { id: "notes", label: "노트 모아보기", icon: NotebookPen }, { id: "archive", label: "아카이브", icon: Archive }, { id: "map", label: "연구맵", icon: Network }, { id: "discover", label: "논문 추천", icon: Compass }]}
    footer={<div className="pf-side-footer"><span className="pf-kicker">YOUR RESEARCH, GROUNDED.</span><p>읽은 문장부터<br/>다음 연구의 실마리까지.</p><Link href="/design-deck"><Layers size={14}/> Design Deck</Link><AccountCard/></div>} />;
}
