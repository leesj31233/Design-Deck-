import type { Metadata, Viewport } from "next";
import "@/engflow/ui/engflow.css";

export const metadata: Metadata = {
  title: "EngFlow — Engineering English, Built for Real Meetings",
  description: "Sentence construction, phrase drills, adaptive review and a CEFR-aligned level test for Korean process engineers in international meetings.",
  appleWebApp: { capable: true, title: "EngFlow", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#090a0c" },
  ],
};

export default function EngFlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" />
      {children}
    </>
  );
}
