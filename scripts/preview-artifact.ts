/** Wraps dist/artifact/engflow.html in the same skeleton the artifact host uses, for local previews and E2E tests. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../dist/artifact");
const body = readFileSync(path.join(dir, "engflow.html"), "utf8");
const skeleton = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;
writeFileSync(path.join(dir, "preview.html"), skeleton);
console.log("wrote dist/artifact/preview.html");
