import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
await mkdir("public/pdfjs", { recursive: true });
await cp(join(root, "build/pdf.worker.min.mjs"), "public/pdfjs/pdf.worker.min.mjs");
for (const dir of ["cmaps", "standard_fonts", "wasm"]) await cp(join(root, dir), `public/pdfjs/${dir}`, { recursive: true });
console.log("Local PDF.js worker, CMaps, fonts and WASM prepared.");
