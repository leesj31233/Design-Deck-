// Create a disposable static preview without changing the source app's routes.
// Build configuration, especially PostCSS, must travel with the source files.
import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.resolve(root, process.argv[2] ?? "../paperflow-preview-v2");
if (target === root || target.startsWith(root + path.sep)) throw new Error("Preview must be outside the source repository.");
await mkdir(target); // Refuse an existing target so stale build files cannot survive.
for (const name of ["app", "components", "lib", "public", "scripts", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs", ".gitignore"]) {
  await cp(path.join(root, name), path.join(target, name), {
    recursive: true,
    filter: source => !["app/page.tsx", "app/(paperflow)/reader/[documentId]"].includes(path.relative(root, source).split(path.sep).join("/")),
  });
}
await writeFile(path.join(target, "next.config.ts"), 'import type { NextConfig } from "next";\nconst config: NextConfig = { reactStrictMode: true, output: "export" };\nexport default config;\n');
await writeFile(path.join(target, "vercel.json"), JSON.stringify({ redirects: [{ source: "/", destination: "/library", permanent: false }] }));
const route = path.join(target, "app/(paperflow)/reader");
await mkdir(route, { recursive: true });
await writeFile(path.join(route, "page.tsx"), `"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReaderShell } from "@/components/paperflow/reader/reader-shell";
function ReaderRoute() { const documentId = useSearchParams().get("documentId"); return documentId ? <ReaderShell documentId={documentId}/> : <div>문서를 선택하세요.</div>; }
export default function ReaderPage() { return <Suspense fallback={<div>Reader를 여는 중…</div>}><ReaderRoute/></Suspense>; }
`);
async function rewrite(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await rewrite(file);
    else if (file.endsWith(".tsx")) {
      const source = await readFile(file, "utf8");
      const updated = source.replace(/\/reader\/\$\{([^}]+)\}\?page=/g, "/reader?documentId=${$1}&page=")
        .replace(/\/reader\/\$\{/g, "/reader?documentId=${")
        .replace('pathname.startsWith("/reader/")', 'pathname.startsWith("/reader")');
      if (updated !== source) await writeFile(file, updated);
    }
  }
}
await rewrite(path.join(target, "components/paperflow"));
console.log(`Static preview prepared at ${target}. PostCSS config included.`);
