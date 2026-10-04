import { Nanum_Pen_Script, Noto_Serif_KR } from "next/font/google";

/** Self-hosted Korean serif for translated text; unicode-range slices load on demand. */
export const paperSerifKr = Noto_Serif_KR({ weight: ["400", "700"], display: "swap", preload: false, variable: "--font-paper-serif-kr", fallback: ["Batang", "AppleMyungjo", "serif"] });

/** Handwriting for text memos and the AI guide margin notes. */
export const handKr = Nanum_Pen_Script({ weight: "400", display: "swap", preload: false, variable: "--font-hand-kr", fallback: ["cursive"] });
