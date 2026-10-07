import { Gaegu, IBM_Plex_Sans_KR, Noto_Serif_KR } from "next/font/google";

/** Self-hosted Korean serif for translated text; unicode-range slices load on demand. */
export const paperSerifKr = Noto_Serif_KR({ weight: ["400", "700"], display: "swap", preload: false, variable: "--font-paper-serif-kr", fallback: ["Batang", "AppleMyungjo", "serif"] });

/** A readable handwriting face for text memos and the AI guide side columns. */
export const handKr = Gaegu({ weight: ["400", "700"], display: "swap", preload: false, variable: "--font-hand-kr", fallback: ["cursive"] });

/** The AI guide's text face: a calm Korean sans that sits under the serif headings. */
export const guideSansKr = IBM_Plex_Sans_KR({ weight: ["400", "500", "600"], display: "swap", preload: false, variable: "--font-guide-sans", fallback: ["Malgun Gothic", "Apple SD Gothic Neo", "sans-serif"] });
