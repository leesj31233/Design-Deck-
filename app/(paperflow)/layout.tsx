import { PaperflowProvider } from "@/components/paperflow/shell/paperflow-provider";
import { PaperFonts } from "@/components/paperflow/shell/paper-fonts";
import { handKr, paperSerifKr } from "./fonts";
import "@/components/paperflow/paperflow.css";
export const metadata = { title: "PAPERFLOW — Research Reader", description: "원문을 보존하는 연구 논문 읽기, 마킹, 메모 공간" };
export default function PaperflowLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${paperSerifKr.variable} ${handKr.variable}`} style={{ display: "contents" }}><PaperFonts family={paperSerifKr.style.fontFamily}/><PaperflowProvider>{children}</PaperflowProvider></div>;
}
