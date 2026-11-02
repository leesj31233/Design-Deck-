import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
await mkdir("public/pdfjs", { recursive: true });
// Safari before 26 lacks ReadableStream async iteration, which the PDF.js 6 worker uses: the same
// shim as lib/paperflow/pdf/stream-iteration.ts runs first inside the worker.
const shim = `(()=>{const p=globalThis.ReadableStream&&ReadableStream.prototype;if(!p||typeof p[Symbol.asyncIterator]==="function")return;const v=function(o){const r=this.getReader(),k=!!(o&&o.preventCancel);return{async next(){try{const x=await r.read();if(x.done)r.releaseLock();return x}catch(e){r.releaseLock();throw e}},async return(a){if(!k){const c=r.cancel(a);r.releaseLock();await c}else r.releaseLock();return{done:true,value:a}},[Symbol.asyncIterator](){return this}}};Object.defineProperty(p,"values",{value:v,writable:true,configurable:true});Object.defineProperty(p,Symbol.asyncIterator,{value:v,writable:true,configurable:true})})();\n`;
const worker = await readFile(join(root, "build/pdf.worker.min.mjs"), "utf8");
await writeFile("public/pdfjs/pdf.worker.min.mjs", shim + worker);
for (const dir of ["cmaps", "standard_fonts", "wasm"]) await cp(join(root, dir), `public/pdfjs/${dir}`, { recursive: true });
console.log("Local PDF.js worker (with stream-iteration shim), CMaps, fonts and WASM prepared.");
