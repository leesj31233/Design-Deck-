// Copies the PDF.js worker, CMaps and standard fonts from node_modules into
// public/pdfjs so they are served same-origin and always match the installed pdfjs-dist.
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
const out = path.resolve("public/pdfjs");
const stamp = path.join(out, "VERSION");

if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === `${version}-legacy`) process.exit(0);

mkdirSync(out, { recursive: true });
cpSync(path.join(pkgDir, "legacy/build/pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
cpSync(path.join(pkgDir, "cmaps"), path.join(out, "cmaps"), { recursive: true });
cpSync(path.join(pkgDir, "standard_fonts"), path.join(out, "standard_fonts"), { recursive: true });
writeFileSync(stamp, `${version}-legacy`);
console.log(`pdfjs-dist ${version} assets copied to public/pdfjs`);
