import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Design Deck",
  description: "Premium web and app design starter, component pool, and reference workflow.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
