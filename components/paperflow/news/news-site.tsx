"use client";
// The visitor's device keeps its own store, apart from any PAPERFLOW library on the same address. Chosen
// before anything opens the database (this module loads before the view does).
import { selectDatabase } from "@/lib/paperflow/persistence/indexeddb";
selectDatabase("naysor-news-v1");

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { LogIn, Moon, Sun } from "lucide-react";
import { PaperflowContext, type PaperflowContextValue } from "../shell/paperflow-context";
import { NotificationStack } from "../shell/notification-stack";
import { ConfirmHost } from "../shell/confirm-host";
import { notifyText } from "@/lib/paperflow/notifications";
import { intelRepository, setRemoteCovers } from "@/lib/paperflow/intel/repository";
import type { IntelBrief, IntelItem } from "@/lib/paperflow/intel/types";
import "./news.css";

const IntelView = dynamic(() => import("../intel/intel-view").then(module => module.IntelView), { ssr: false, loading: () => <div className="pf-empty" role="status">NAYSOR News를 여는 중…</div> });
/** Where a reader with an account translates and marks a PDF. */
const PAPERFLOW = "https://temporary-speedy-thunder-fmo0cqz.vercel.app";

/**
 * NAYSOR News: the research programme's intelligence for anyone, without an account. The list comes from
 * the site (facts only; NAYSOR's own judgement is left out on the server) and is kept on the device, so the
 * next visit opens at once and refreshes behind it. Visitors can star, hide and mark briefings; those stay in
 * their own browser. PDFs open in PAPERFLOW, where an account translates and marks them.
 */
export function NewsSite() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [loading, setLoading] = useState(true), [dark, setDark] = useState(false);
  useEffect(() => {
    let saved: string | null = null; try { saved = localStorage.getItem("paperflow-theme"); } catch { /* the system theme still applies */ }
    const isDark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark); document.documentElement.dataset.pfTheme = isDark ? "dark" : "light";
  }, []);
  const toggleTheme = useCallback(() => setDark(current => { const next = !current; document.documentElement.dataset.pfTheme = next ? "dark" : "light"; try { localStorage.setItem("paperflow-theme", next ? "dark" : "light"); } catch { /* this visit only */ } return next; }), []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // The list comes in parts; the first says how many there are and carries the briefings.
        type Part = { items: IntelItem[]; briefs: IntelBrief[]; covers: Record<string, string>; parts?: number };
        const get = async (part: number) => { const response = await fetch(`/api/public/intel?part=${part}`); if (!response.ok) throw new Error(String(response.status)); return await response.json() as Part; };
        const first = await get(0), rest = await Promise.all(Array.from({ length: Math.max(0, (first.parts ?? 1) - 1) }, (_, index) => get(index + 1)));
        const all = [first, ...rest];
        setRemoteCovers(Object.assign({}, ...all.map(part => part.covers ?? {})));
        await intelRepository.replaceFeed(all.flatMap(part => part.items ?? []), first.briefs ?? []);
      } catch { if (alive) notifyText("새 자료를 불러오지 못했습니다. 이 기기에 저장된 자료를 보여 줍니다."); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);
  const context = useMemo<PaperflowContextValue>(() => ({
    openImport: () => undefined, importFiles: async () => undefined, importing: false, openCommand: () => undefined,
    toggleTheme, dark, notify: notifyText, registerReader: () => undefined
  }), [toggleTheme, dark]);

  return <QueryClientProvider client={client}><MotionConfig reducedMotion="user"><PaperflowContext.Provider value={context}>
    <div className="paperflow pf-news" lang="ko">
      <header className="pf-news-bar">
        <a href="/" className="pf-news-brand" aria-label="NAYSOR News 처음으로">
          <img src={dark ? "/naysor/naysor-logo-light.png" : "/naysor/naysor-logo.png"} alt="NAYSOR" width={132} height={25}/>
          <span>News</span>
        </a>
        <p>팜 잔재 펠릿·바이오차 · 저품위탄 고품위화 · 캐슈넛 부산물</p>
        <nav>
          <button type="button" onClick={toggleTheme} aria-label={dark ? "밝은 화면" : "어두운 화면"}>{dark ? <Sun size={16}/> : <Moon size={16}/>}</button>
          <a href={`${PAPERFLOW}/login`} title="PAPERFLOW 계정으로 PDF를 번역하고 마킹·메모합니다"><LogIn size={15}/>PAPERFLOW 로그인</a>
        </nav>
      </header>
      <main className="pf-news-main">
        <IntelView docs={[]} site={{ loading, paperflow: PAPERFLOW }}/>
      </main>
      <footer className="pf-news-foot">자료마다 출처와 확인 수준(공식·보도·추정)을 표시합니다. 형광펜·메모·핵심 표시는 이 브라우저에만 저장됩니다.</footer>
    </div>
    <NotificationStack/>
    <ConfirmHost/>
  </PaperflowContext.Provider></MotionConfig></QueryClientProvider>;
}
