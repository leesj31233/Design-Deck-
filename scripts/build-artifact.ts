/**
 * Turns the Vite single-file build into an artifact page: the publish step
 * wraps the file in its own <!doctype>/<head>/<body> skeleton, so the page is
 * written as <title> + font link + <style> + markup + <script> only.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../dist/artifact");
const html = readFileSync(path.join(dir, "index.html"), "utf8");
const pick = (re: RegExp) => [...html.matchAll(re)].map((m) => m[0]);
const title = pick(/<title>[\s\S]*?<\/title>/g)[0] ?? "<title>EngFlow</title>";
const links = pick(/<link[^>]+fonts\.googleapis\.com[^>]*>/g);
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script type="module"[^>]*>[\s\S]*?<\/script>/g).map((s) => s.replace(/ crossorigin/g, ""));
if (!scripts.length) throw new Error("no inline module script found — did the single-file build run?");
for (const s of scripts) {
  const body = s.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  if (/<\/script/i.test(body)) throw new Error("inline script contains </script — cannot embed safely");
}
const out = [title, ...links, ...styles, '<div id="root"></div>', ...scripts].join("\n");
const file = path.join(dir, "engflow.html");
writeFileSync(file, out);
console.log(`wrote ${file} (${(statSync(file).size / 1024).toFixed(0)} KB)`);
