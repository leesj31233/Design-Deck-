import { PaperflowProvider } from "@/components/paperflow/shell/paperflow-provider";
import { PaperFonts } from "@/components/paperflow/shell/paper-fonts";
import { guideSansKr, handKr, paperSerifKr } from "./fonts";
import "@/components/paperflow/paperflow.css";
export const metadata = { title: "PAPERFLOW — Research Reader", description: "원문을 보존하는 연구 논문 읽기, 마킹, 메모 공간" };
export default function PaperflowLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${paperSerifKr.variable} ${handKr.variable} ${guideSansKr.variable}`} style={{ display: "contents" }}><PaperFonts family={paperSerifKr.style.fontFamily}/>{/* Dialogs render outside this tree: the font variables also live on :root. */}<style>{`:root{--font-paper-serif-kr:${paperSerifKr.style.fontFamily};--font-guide-sans:${guideSansKr.style.fontFamily};--font-hand-kr:${handKr.style.fontFamily}}`}</style><PaperflowProvider>{children}</PaperflowProvider></div>;
}
