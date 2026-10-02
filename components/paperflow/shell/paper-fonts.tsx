"use client";
import { setKoreanSerifFamily } from "@/lib/paperflow/typeset/measure";

/** Hands the hashed next/font family name to the canvas measurer before any page is typeset. */
export function PaperFonts({ family }: { family: string }) {
  if (typeof document !== "undefined") setKoreanSerifFamily(family.replace(/,\s*(?:Batang|AppleMyungjo|serif)\b.*$/i, ""));
  return null;
}
