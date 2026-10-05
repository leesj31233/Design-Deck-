import type { Metadata, Viewport } from "next";
import { PaperflowProviders } from "@/components/paperflow/shell/providers";
import { themeInitScript } from "@/components/paperflow/shell/theme";
import "./paperflow.css";

export const metadata: Metadata = {
  title: "PAPERFLOW — Engineering Research Reader",
  description: "Paper first. AI second. Evidence always visible.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function PaperflowLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      <PaperflowProviders>
        <div className="pf-root min-h-dvh">{children}</div>
      </PaperflowProviders>
    </>
  );
}
