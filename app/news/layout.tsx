import { PaperFonts } from "@/components/paperflow/shell/paper-fonts";
import { guideSansKr, handKr, paperSerifKr } from "../(paperflow)/fonts";
import "@/components/paperflow/paperflow.css";

const SNAPSHOT = process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/naysor-news` : "";
/**
 * Starts the download before React and the reader's code arrive: the manifest, and when this device does not
 * hold its version yet, every part at once. The page picks the promises up (window.__naysorFeed).
 */
const EARLY = SNAPSHOT ? `(function(){try{var s=${JSON.stringify(SNAPSHOT)},v=null;try{v=localStorage.getItem("naysor-news-version")}catch(e){}window.__naysorFeed=fetch(s+"/manifest.json?t="+Math.floor(Date.now()/6e4)).then(function(r){return r.ok?r.json():null}).then(function(m){if(!m)return null;return{manifest:m,parts:m.version===v?null:m.parts.map(function(u){return fetch(u).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})})}}).catch(function(){return null})}catch(e){}})();` : "";

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const };
export const metadata = {
  title: "NAYSOR News — EFB·저품위탄·캐슈넛 인텔리전스",
  description: "팜 잔재 펠릿·바이오차, 저품위탄 고품위화, 캐슈넛 부산물의 시장·가격·기업·기술 자료를 근거와 함께 모았습니다.",
  icons: { icon: "/naysor/naysor-mark.png" }
};

/** NAYSOR News: the Intelligence tab as its own public site (no account, no library). */
export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${paperSerifKr.variable} ${handKr.variable} ${guideSansKr.variable}`} style={{ display: "contents" }}>{SNAPSHOT && <link rel="preconnect" href={new URL(SNAPSHOT).origin} crossOrigin=""/>}{EARLY && <script dangerouslySetInnerHTML={{ __html: EARLY }}/>}<PaperFonts family={paperSerifKr.style.fontFamily}/><style>{`:root{--font-paper-serif-kr:${paperSerifKr.style.fontFamily};--font-guide-sans:${guideSansKr.style.fontFamily};--font-hand-kr:${handKr.style.fontFamily}}`}</style>{children}</div>;
}
