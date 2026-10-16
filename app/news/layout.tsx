import { PaperFonts } from "@/components/paperflow/shell/paper-fonts";
import { guideSansKr, handKr, paperSerifKr } from "../(paperflow)/fonts";
import "@/components/paperflow/paperflow.css";

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const };
export const metadata = {
  title: "NAYSOR News — EFB·저품위탄·캐슈넛 인텔리전스",
  description: "팜 잔재 펠릿·바이오차, 저품위탄 고품위화, 캐슈넛 부산물의 시장·가격·기업·기술 자료를 근거와 함께 모았습니다.",
  icons: { icon: "/naysor/naysor-mark.png" }
};

/** NAYSOR News: the Intelligence tab as its own public site (no account, no library). */
export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${paperSerifKr.variable} ${handKr.variable} ${guideSansKr.variable}`} style={{ display: "contents" }}><PaperFonts family={paperSerifKr.style.fontFamily}/><style>{`:root{--font-paper-serif-kr:${paperSerifKr.style.fontFamily};--font-guide-sans:${guideSansKr.style.fontFamily};--font-hand-kr:${handKr.style.fontFamily}}`}</style>{children}</div>;
}
