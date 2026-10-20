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
import { intelRepository, reportProgress, setRemoteCovers } from "@/lib/paperflow/intel/repository";
import { cloudUrl } from "@/lib/paperflow/cloud/config";
import type { IntelBrief, IntelItem } from "@/lib/paperflow/intel/types";
import "./news.css";

const IntelView = dynamic(() => import("../intel/intel-view").then(module => module.IntelView), { ssr: false, loading: () => <div className="pf-empty" role="status">NAYSOR News를 여는 중…</div> });
/** Where a reader with an account translates and marks a PDF. */
const PAPERFLOW = "https://temporary-speedy-thunder-fmo0cqz.vercel.app";
/** The ready-made copy of the list (a public storage bucket on the CDN), and what this device last took from it. */
const SNAPSHOT = cloudUrl ? `${cloudUrl}/storage/v1/object/public/naysor-news` : "";
const VERSION_KEY = "naysor-news-version", COVERS_KEY = "naysor-news-covers";

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
      type Part = { items: IntelItem[]; briefs: IntelBrief[]; covers: Record<string, string>; parts?: number };
      type Manifest = { version: string; total: number; parts: string[] };
      const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
      const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* the next visit downloads again */ } };
      const held = (await intelRepository.list()).length;
      try { const covers = read(COVERS_KEY); if (covers) setRemoteCovers(JSON.parse(covers)); } catch { /* covers come with the next download */ }
      if (held) setLoading(false);
      try {
        // The site keeps a ready-made copy on the CDN; the device downloads it only when it has changed.
        // The page's first script has usually started it already (window.__naysorFeed); otherwise start it now.
        const early = await ((window as unknown as { __naysorFeed?: Promise<{ manifest: Manifest; parts: Promise<Part>[] | null } | null> }).__naysorFeed ?? Promise.resolve(null));
        let manifest: Manifest | null = early?.manifest ?? null;
        if (!manifest && SNAPSHOT) try { const response = await fetch(`${SNAPSHOT}/manifest.json?t=${Math.floor(Date.now() / 60_000)}`); if (response.ok) manifest = await response.json() as Manifest; } catch { /* the server assembles it instead */ }
        if (manifest && held && read(VERSION_KEY) === manifest.version) return;
        const label = held ? "일일 업데이트 및 기존 뉴스 반영 중" : "NAYSOR News 전체 자료를 받는 중";
        let received = 0;
        const progress = (total: number) => reportProgress({ label, done: received, total });
        let all: Part[];
        if (manifest) {
          progress(manifest.total);
          const started = early?.manifest.version === manifest.version ? early.parts : null;
          all = await Promise.all(manifest.parts.map(async (url, index) => { const part = started?.[index] ? await started[index] : await fetch(url).then(response => { if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<Part>; }); received += part.items.length; progress(manifest!.total); return part; }));
        } else {
          // No copy yet: the server assembles the list in parts; the first says how many there are.
          const get = async (part: number) => { const response = await fetch(`/api/public/intel?part=${part}`); if (!response.ok) throw new Error(String(response.status)); const body = await response.json() as Part & { total?: number }; received += body.items.length; progress(body.total ?? received); return body; };
          const first = await get(0);
          all = [first, ...await Promise.all(Array.from({ length: Math.max(0, (first.parts ?? 1) - 1) }, (_, index) => get(index + 1)))];
        }
        const covers = Object.assign({}, ...all.map(part => part.covers ?? {}));
        setRemoteCovers(covers); write(COVERS_KEY, JSON.stringify(covers));
        reportProgress({ label: "기기에 반영하는 중", done: received, total: received });
        await intelRepository.replaceFeed(all.flatMap(part => part.items ?? []), all[0]?.briefs ?? []);
        if (manifest) write(VERSION_KEY, manifest.version);
      } catch { if (alive) notifyText("새 자료를 불러오지 못했습니다. 이 기기에 저장된 자료를 보여 줍니다."); }
      finally { reportProgress(null); if (alive) setLoading(false); }
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
