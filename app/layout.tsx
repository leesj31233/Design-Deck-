import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Design Deck — Premium Product UI System",
  description: "A reusable premium component system for research tools, AI products, PDF readers and professional web apps."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
