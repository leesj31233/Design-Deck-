// Regenerates public/samples/paperflow-sample-cofiring.pdf from scripts/sample-paper/source.html.
// Requires Playwright with a Chromium build (not a project dependency):
//   NODE_PATH=$(npm root -g) node scripts/generate-sample-pdf.mjs
// NOTE: regenerating changes the PDF bytes; existing highlights on the sample will go through anchor recovery.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "scripts/sample-paper/source.html");
const out = path.join(root, "public/samples/paperflow-sample-cofiring.pdf");

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
await page.goto(`file://${source}`);
await page.pdf({ path: out, format: "Letter", preferCSSPageSize: true, printBackground: true, tagged: true });
await browser.close();
console.log(`Wrote ${path.relative(root, out)}`);
