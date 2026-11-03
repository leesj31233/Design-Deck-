#!/usr/bin/env node
// Lists the Korean text still written into the code of the NAYSOR News site (string literals, template
// literals and JSX text with Hangul), so the English toggle can be checked for gaps.
//   node scripts/korean-literals.mjs            the news site's paths, one line per literal
//   node scripts/korean-literals.mjs --count    counts per file only
//   node scripts/korean-literals.mjs <files…>   other files
//   --all                                       also list literals that already have English in en.ts
// A literal passed straight to t("…") is a translation key, not a gap, and is not listed. A Korean literal left in
// the code (a label table such as KIND_LABEL, looked up through t() where it is shown) counts as covered when
// lib/paperflow/i18n/en.ts has its English; the rest are the gaps.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

const require = createRequire(import.meta.url);
const { parse } = require("next/dist/compiled/babel/parser");
const traverse = require("next/dist/compiled/babel/traverse").default;

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DEFAULT = ["app/news", "components/paperflow/news", "components/paperflow/intel", "lib/paperflow/intel/types.ts", "lib/paperflow/intel/registry.ts", "lib/paperflow/intel/prices.ts", "lib/paperflow/intel/web.ts"];
const HANGUL = /[가-힣ㄱ-ㆎ]/;
/** Calls whose Korean arguments are translation keys or the reverse (matching Korean text), not shown text. */
const KEYED = new Set(["t", "tr", "tt"]);

const args = process.argv.slice(2), countOnly = args.includes("--count"), all = args.includes("--all");
const targets = args.filter(arg => !arg.startsWith("--"));
const walk = path => statSync(path).isDirectory() ? readdirSync(path).flatMap(name => walk(join(path, name))) : /\.(tsx?|mjs)$/.test(path) ? [path] : [];
const files = (targets.length ? targets : DEFAULT).map(path => join(ROOT, path)).flatMap(walk);

// The English dictionary's keys.
const english = new Set();
traverse(parse(readFileSync(join(ROOT, "lib/paperflow/i18n/en.ts"), "utf8"), { sourceType: "module", plugins: ["typescript"] }), {
  ObjectProperty(path) { const key = path.node.key; english.add(key.type === "StringLiteral" ? key.value : key.name); }
});
for (const key of [...english]) english.add(key.trim());

let total = 0, covered = 0;
for (const file of files) {
  const code = readFileSync(file, "utf8");
  let ast;
  try { ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] }); } catch (error) { console.error(`${relative(ROOT, file)}: ${error.message}`); continue; }
  const found = [];
  const keyed = path => { const parent = path.parentPath; return parent?.isCallExpression() && parent.node.callee.type === "Identifier" && KEYED.has(parent.node.callee.name) && parent.node.arguments.includes(path.node); };
  const skip = path => keyed(path) || path.findParent(p => p.isTSType() || p.isImportDeclaration() || p.isTSLiteralType()) || (path.parentPath?.isObjectProperty() && path.parentPath.node.key === path.node);
  traverse(ast, {
    StringLiteral(path) {
      if (!HANGUL.test(path.node.value)) return;
      // A t("…") key is fine when en.ts has it; one without English is a gap like any other literal.
      if (keyed(path)) { if (!english.has(path.node.value)) found.push([path.node.loc.start.line, `t(${path.node.value})`]); return; }
      if (!skip(path)) found.push([path.node.loc.start.line, path.node.value]);
    },
    TemplateLiteral(path) { const text = path.node.quasis.map(q => q.value.cooked).join("{…}"); if (HANGUL.test(text) && !skip(path)) found.push([path.node.loc.start.line, text]); },
    JSXText(path) { const text = path.node.value.trim(); if (HANGUL.test(text)) found.push([path.node.loc.start.line, text]); }
  });
  const gaps = found.filter(([, text]) => !english.has(text.trim()));
  total += found.length; covered += found.length - gaps.length;
  const shown = all ? found : gaps;
  if (!shown.length) continue;
  if (countOnly) console.log(`${String(shown.length).padStart(5)}  ${relative(ROOT, file)}`);
  else for (const [line, text] of shown) console.log(`${relative(ROOT, file)}:${line}  ${english.has(text.trim()) ? "(en) " : ""}${text.replace(/\s+/g, " ").slice(0, 140)}`);
}
console.log(`${total} Korean literal(s) in code: ${covered} have English in en.ts, ${total - covered} without English`);
