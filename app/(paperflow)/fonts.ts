import { Gaegu, Noto_Serif_KR } from "next/font/google";

/** Self-hosted Korean serif for translated text; unicode-range slices load on demand. */
export const paperSerifKr = Noto_Serif_KR({ weight: ["400", "700"], display: "swap", preload: false, variable: "--font-paper-serif-kr", fallback: ["Batang", "AppleMyungjo", "serif"] });

/** A readable handwriting face for the reader's own text memos (the AI guide uses the sans UI face). */
export const handKr = Gaegu({ weight: ["400", "700"], display: "swap", preload: false, variable: "--font-hand-kr", fallback: ["cursive"] });
