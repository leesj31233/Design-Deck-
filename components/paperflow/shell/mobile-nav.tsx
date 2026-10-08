"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Archive, Compass, LibraryBig, Moon, Network, NotebookPen, Sun, Trash2, UserRound, X } from "lucide-react";
import { useCloud } from "@/lib/paperflow/cloud/sync";
import { AccountCard } from "./account-card";
import { usePaperflow } from "./paperflow-context";
import { PaperflowWordmark } from "./paperflow-logo";
import "./mobile-nav.css";

const TABS = [
  { id: "library", label: "서재", icon: LibraryBig }, { id: "notes", label: "노트", icon: NotebookPen }, { id: "archive", label: "아카이브", icon: Archive },
  { id: "map", label: "연구맵", icon: Network }, { id: "discover", label: "추천", icon: Compass }
] as const;

/**
 * On a phone the sidebar gives way to a tab bar at the bottom (서재, 노트, 아카이브, 연구맵, 추천) and a
 * 계정 tab that opens a sheet: the account, cloud storage, this month's credits, sync, 휴지통, theme.
 */
export function MobileNav({ view, onView, trashCount = 0 }: { view: string; onView: (view: string) => void; trashCount?: number }) {
  const [sheet, setSheet] = useState(false), reduced = useReducedMotion(), { dark, toggleTheme } = usePaperflow();
  const credits = useCloud(state => state.plan?.credits), avatar = useCloud(state => state.avatar), name = useCloud(state => state.name ?? state.email);
  useEffect(() => { if (!sheet) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSheet(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [sheet]);
  const go = (id: string) => { onView(id); setSheet(false); window.scrollTo({ top: 0 }); };
  // Rendered into <body>: an animated (transformed) page wrapper would otherwise pin the bar to itself, not the screen.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const left = credits && credits.limit !== null ? Math.max(0, credits.limit - credits.used) : null;
  if (!mounted) return null;
  return createPortal(<div className="paperflow-mobile">
    <nav className="pf-mobile-tabs" aria-label="메뉴">
      {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={view === id ? "page" : undefined} onClick={() => go(id)}><Icon size={20} aria-hidden="true"/><span>{label}</span></button>)}
      <button type="button" aria-expanded={sheet} aria-current={view === "trash" ? "page" : undefined} onClick={() => setSheet(true)}>
        {avatar ? <img src={avatar} alt="" className="pf-mobile-avatar"/> : <UserRound size={20} aria-hidden="true"/>}<span>계정</span>
      </button>
    </nav>
    <AnimatePresence>{sheet && <>
      <motion.div key="scrim" className="pf-mobile-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)}/>
      <motion.section key="sheet" className="pf-mobile-sheet" role="dialog" aria-modal="true" aria-label="계정과 메뉴"
        initial={reduced ? { opacity: 0 } : { y: "100%" }} animate={reduced ? { opacity: 1 } : { y: 0 }} exit={reduced ? { opacity: 0 } : { y: "100%" }} transition={{ type: "spring", stiffness: 420, damping: 40 }}
        drag={reduced ? false : "y"} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .6 }} onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) setSheet(false); }}>
        <span className="pf-mobile-grabber" aria-hidden="true"/>
        <header><PaperflowWordmark/><button type="button" aria-label="닫기" onClick={() => setSheet(false)}><X size={18}/></button></header>
        {left !== null && <p className="pf-mobile-credits">{name ? `${name} · ` : ""}이번 달 남은 크레딧 <b>{left.toLocaleString()}</b></p>}
        <div className="pf-mobile-account"><AccountCard/></div>
        <div className="pf-mobile-links">
          <button type="button" aria-current={view === "trash" ? "page" : undefined} onClick={() => go("trash")}><Trash2 size={18}/>휴지통{trashCount > 0 && <i>{trashCount}</i>}</button>
          <button type="button" onClick={toggleTheme}>{dark ? <Sun size={18}/> : <Moon size={18}/>}{dark ? "라이트 모드" : "다크 모드"}</button>
        </div>
      </motion.section>
    </>}</AnimatePresence>
  </div>, document.body);
}
