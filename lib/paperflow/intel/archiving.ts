import type { ArchiveFolder } from "../persistence/types";
import { CLASS_LABEL, CLASS_ORDER, itemClasses, type IntelItem } from "./types";

/**
 * Where an intelligence PDF is filed in the archive: 인텔리전스 PDF › Class n › what kind of document it is.
 * Folder ids are fixed, so every device and every run files the same PDF in the same place; a folder carries
 * its parent, so the tree travels with the papers like any archive folder.
 */
const STAMP = "2026-10-16T00:00:00.000Z";
export const INTEL_ROOT: ArchiveFolder = { id: "f-intel-pdf", name: "인텔리전스 PDF", icon: "globe", color: "#1f7a5a", createdAt: STAMP };
const CLASS_LOOK = { c1: { icon: "leaf", color: "#1f7a5a" }, c2: { icon: "flame", color: "#59626b" }, c3: { icon: "factory", color: "#d98a1c" } } as const;

/** Document kinds, checked in this order (a standard published by a ministry is a standard first). */
const KINDS: { key: string; name: string; test: (item: IntelItem) => boolean }[] = [
  { key: "standard", name: "인증·규격·규제", test: item => item.topics.some(topic => topic === "cdr" || topic === "pellet-standard") || /standard|methodolog|certif|protocol|규격|인증|방법론|SNI |ISO 1|ENplus|regulation|규제/i.test(`${item.title} ${item.titleKo ?? ""}`) },
  { key: "disclosure", name: "공시·연차보고", test: item => item.sourceType === "annual-report" },
  { key: "government", name: "정부 보고서·지침", test: item => item.sourceType === "gov" },
  { key: "technology", name: "기술·논문·특허", test: item => ["paper", "patent", "test-report"].includes(item.sourceType ?? "") },
  { key: "market", name: "시장·가격", test: item => item.kind === "market" || item.sourceType === "market-analyst" || item.topics.some(topic => /market|price/.test(topic)) },
  { key: "company", name: "기업 자료·카탈로그", test: item => item.sourceType === "vendor-catalog" || ["company", "vendor", "equipment", "project"].includes(item.kind) },
  { key: "press", name: "보도", test: item => item.sourceType === "press" }
];

export function intelFolderFor(item: IntelItem): ArchiveFolder {
  const klass = itemClasses(item)[0] ?? "c1", number = CLASS_ORDER.indexOf(klass) + 1, look = CLASS_LOOK[klass];
  const classFolder: ArchiveFolder = { id: `f-intel-${klass}`, name: `Class ${number} · ${CLASS_LABEL[klass]}`, icon: look.icon, color: look.color, createdAt: STAMP, parentId: INTEL_ROOT.id, parent: INTEL_ROOT };
  const kind = KINDS.find(entry => entry.test(item)) ?? { key: "other", name: "기타 자료" };
  return { id: `f-intel-${klass}-${kind.key}`, name: kind.name, icon: "folder", color: look.color, createdAt: STAMP, parentId: classFolder.id, parent: classFolder };
}

/** Whether a paper's current place may be changed by the archiving: unfiled, or somewhere in the intelligence tree. */
export const intelMayRefile = (folder: ArchiveFolder | null | undefined) => !folder || folder.id === INTEL_ROOT.id || folder.id.startsWith("f-intel-");
/** Whether a paper already sits where the archiving would put it (same leaf, same names up the tree). */
export function sameFolder(a: ArchiveFolder | null | undefined, b: ArchiveFolder): boolean {
  for (let x = a, y: ArchiveFolder | undefined = b; y; x = x?.parent, y = y.parent) if (!x || x.id !== y.id || x.name !== y.name || x.parentId !== y.parentId) return false;
  return true;
}
