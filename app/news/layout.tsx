import { PaperFonts } from "@/components/paperflow/shell/paper-fonts";
import { guideSansKr, handKr, paperSerifKr } from "../(paperflow)/fonts";
import "@/components/paperflow/paperflow.css";
import { NEWS_DESCRIPTION, NEWS_TITLE } from "@/components/paperflow/news/meta";

const SNAPSHOT = process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/naysor-news` : "";
/**
 * Starts the download before React and the reader's code arrive: the manifest, and when this device does not
 * hold its version yet, every part at once. The page picks the promises up (window.__naysorFeed).
 */
const EARLY = SNAPSHOT ? `(function(){try{var s=${JSON.stringify(SNAPSHOT)},v=null;try{v=localStorage.getItem("naysor-news-version")}catch(e){}window.__naysorFeed=fetch(s+"/manifest.json?t="+Math.floor(Date.now()/6e4)).then(function(r){return r.ok?r.json():null}).then(function(m){if(!m)return null;return{manifest:m,parts:m.version===v?null:m.parts.map(function(u){return fetch(u).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})})}}).catch(function(){return null})}catch(e){}})();` : "";

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const };
export const metadata = {
  title: NEWS_TITLE,
  description: NEWS_DESCRIPTION,
  icons: { icon: "/naysor/naysor-mark.png" }
};

/** NAYSOR News: the Intelligence tab as its own public site (no account, no library). */
export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${paperSerifKr.variable} ${handKr.variable} ${guideSansKr.variable}`} style={{ display: "contents" }}>{SNAPSHOT && <link rel="preconnect" href={new URL(SNAPSHOT).origin} crossOrigin=""/>}{EARLY && <script dangerouslySetInnerHTML={{ __html: EARLY }}/>}<PaperFonts family={paperSerifKr.style.fontFamily}/><style>{`:root{--font-paper-serif-kr:${paperSerifKr.style.fontFamily};--font-guide-sans:${guideSansKr.style.fontFamily};--font-hand-kr:${handKr.style.fontFamily}}`}</style>{children}</div>;
}
