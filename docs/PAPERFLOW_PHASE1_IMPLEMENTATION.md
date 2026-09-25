# PAPERFLOW Phase 1

## Run

Node 22.23+ is the validated runtime. All dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run start -- -p 3100
```

Open `http://localhost:3100/library`. Development: `npm run dev`.
The original showcase remains at `/design-deck`; all `/archetypes/*` routes remain intact.

## What works

- Multiple PDF import via picker or drag/drop; content-based duplicate detection.
- Original PDF rendering, selectable text, page navigation, zoom, fit width/page.
- Five named highlight colors, source inspection, deletion, user-authored notes.
- Reload-safe documents, reading position, annotations and notes in IndexedDB.
- Search by filename/title, archive/restore, note collection, continue reading.
- Command palette, keyboard shortcuts, system-aware and persistent light/dark theme.
- Desktop and iPad landscape layout; tablet inspector opens on demand.
- Click-to-translate paragraphs, a current-page bulk translation control, locally cached Korean results, and engineering terms protected in English. Translation appears beside the original PDF; it never replaces the source page.
- Actual PDF page thumbnails in a lazily rendered rail. Reader chrome uses layered glass and motion from Design Deck patterns while the paper stays visually unchanged.
- A first-page cover shelf, a compact list alternative, a real-cover continue-reading card, and a keyboard-operable zoom slider. Cover rendering is limited to two concurrent documents.
- Line-continuous highlighting composites the whole mark layer against the PDF with multiply, retaining black text contrast. Adjacent word rectangles merge without bridging columns.

`H` highlights; `N` opens notes; `T` translates the selected paragraph; `E` opens the explanation placeholder;
`Ctrl/Cmd+K` opens commands; arrows change pages; Escape dismisses contextual UI.
Shortcuts do not intercept text input. `Ctrl/Cmd+F` opens the explicitly labelled search shell.

## Product boundary

Enhanced v2 was the initial Phase 1 scope. Subsequent user requests explicitly expanded the reader to paragraph translation, page-level bulk translation, real previews and a cover shelf. Scientific explanation, citation lookup, automatic concept extraction, research-map generation, cloud accounts and sync are not implemented. Demo research pools were removed from the library; no paper conclusions or DOIs are fabricated.

Hybrid translation protects a starter engineering glossary, acronyms and selected units in English before translating sentence structure to Korean. The browser's native Translator API is used if already ready; otherwise paragraph text is sent to the external MyMemory API. Results are shown beside the original and cached in IndexedDB. Network or browser-model latency means a 1–2 second response is an optimization target, not a guarantee; failures appear in the Inspector. The current-page bulk button has progress and cancel. A user-editable glossary, terminology QA and a production translation provider with service guarantees are follow-up work. Notes are visibly user-authored. Research-map edges must later resolve to document/page/anchor evidence and be confirmed by the user.

## Architecture

- `pdf/pdf-adapter.ts` is the only PDF.js integration boundary. It uses public `getDocument`, `getPage`, `render`, `TextLayer` and loading-task `destroy` APIs in PDF.js 6.3.289. The worker, CMaps, fonts and WASM are copied from the installed package into `public/pdfjs` on install/build. There is no CDN dependency.
- Each page has separate canvas, transparent selectable text, and pointer-transparent highlight layers. Chrome themes never alter the paper. Only the current page gets a full-resolution canvas; the next page handle is prefetched. Render cancellation and document destruction are tied to effect cleanup.
- Browser Range rectangles are translated to page-local and normalized coordinates. Line breaks and the exact selected quote are retained with prefix/suffix context. Text offsets can be mapped back to actual DOM ranges for recovery.
- Recovery stays in the original document and page: valid geometry → unique quote → context-disambiguated quote → bounded, unique, high-confidence fuzzy match → unresolved. A fuzzy match needs both contexts, a sufficiently long quote and similarity ≥ 0.94. Ambiguity is visible in the Inspector.
- IndexedDB repositories separate immutable PDF Blobs, document metadata and annotations. SHA-256 content IDs make duplicate imports safe. Original bytes are never rewritten when notes or marks change. Document+Blob creation is transactional.
- Translation results live in a separate IndexedDB store keyed to document, page and paragraph text. Existing Phase 1 stores are retained through a versioned migration.
- TanStack Query owns asynchronous repository data; Zustand owns transient reader UI only. Rapid selection updates subscribe only in the Inspector and selection toolbar.
- Shared CommandMenu gained an optional `disabled` item property. SegmentedControl now uses unique motion IDs, pressed states, visible keyboard focus and reduced-motion support, preserving existing consumers.

## Storage and limits

Data belongs to this browser profile and origin (including port). Clearing site data removes the local library and cached translations. Phase 1 has no cross-device synchronization or archival backup export. Keep the original PDFs. Storage errors are surfaced; failed annotations are not shown as successfully saved. Scanned pages can be viewed but require future OCR for text selection. Password-protected PDFs require an unlocked copy. Page previews render lazily when visible. Long libraries are incrementally paginated in batches of 30. MyMemory has a 500-byte segment limit and usage limits; requests are chunked and a large bulk job may take longer or be rate limited. Do not use external fallback for confidential papers without accepting that the requested paragraph leaves the device.

## Validation

- `tests/unit`: coordinates, multi-line anchors, quote normalization, duplicate text, context and fuzzy confidence, wrong page/document, corrupt geometry, unresolved anchors.
- `tests/integration`: real IndexedDB API via fake-indexeddb; duplicate source IDs, immutable bytes, notes, reading progress, archive and reconnect durability.
- `tests/e2e`: production-server import/read/select/highlight/note/reload, real mouse dragging, quote recovery after damaged geometry, zoom alignment, archive, original byte equality, theme, command focus, reduced motion, responsive sizes and automated axe WCAG 2.1 AA checks.
- Translation e2e covers paragraph click, local cache after reload, current-page batch control, and true page preview rendering. The external service is mocked in CI; a production provider still needs latency/quality monitoring.
- Design QA checks compiled Tailwind styles, visually clipped import input, actual cover images, shelf/list switching, keyboard zoom and layer compositing. The earlier temporary preview omitted `postcss.config.mjs`, causing native-looking buttons and a visible file input. `scripts/prepare-preview.mjs` now copies the full build configuration and refuses stale output folders.
- On 2026-09-25, 21 unit/integration tests passed. Browser checks passed in desktop and tablet-sized Chromium, with 23 private PDFs rendered and marks restored. A local ACS introduction screenshot comparison retained all 435 originally dark pixels inside the highlight. One live synthetic English→Korean paragraph completed in 1,984 ms; this is an observation, not a service guarantee.
- An original two-page test PDF is generated in memory. Private research PDFs are never committed. Optional `PAPERFLOW_REAL_PDF` selects one local PDF. `PAPERFLOW_CORPUS_DIRS` accepts `|`-separated directories for the local corpus suite. `PAPERFLOW_SCREENSHOTS` and `PAPERFLOW_CORPUS_REPORT` direct private verification artifacts outside the repository.
- Browser timings use `performance.measure`: selection capture, action-bar React commit, annotation transaction, and canvas rendering. They do not claim physical iPad/Safari performance or full first-paint latency.

## Design source

The user explicitly selected the existing Design Deck as the visual reference instead of providing a Figma frame. No pixel-match to an unseen Figma frame is claimed. Sidebar, GlassPanel, ActionBar, CommandMenu/Dialog, Button, IconButton, SearchField, Badge, SegmentedControl and Tabs use existing tokens, Lucide and restrained Motion. The installed design-system skill guided the audit of component states, tokens and accessibility. Liquid-glass-inspired chrome uses translucent surfaces, backdrop blur/saturation, bright inner edges and soft shadows. Paper covers have subtle spine depth and hover lift; page previews and segmented controls use springs. The source PDF remains opaque and unchanged.

## Static preview packaging

`node scripts/prepare-preview.mjs ../paperflow-preview-v2` creates a new disposable folder including PostCSS configuration. The preview exports `/reader?documentId=…`; the source app retains `/reader/[documentId]`. Notes deep links preserve page/annotation parameters. Temporary Vercel deployments expire unless claimed. No private PDFs or local browser data are included in a deployment.

PDF integration reference: https://mozilla.github.io/pdf.js/examples/

## Phase 2 handoff

1. Add a user-editable engineering glossary with deterministic term protection and precedence, and terminology quality tests on co-firing papers.
2. Replace the public fallback with a production translation adapter offering service limits, observability and a measurable latency target.
3. Add evidence-labelled concept/equation explanations with paper vs external-source provenance.
4. Add durable backup/export and optional authenticated storage adapters.
5. Add user-confirmed concept relationships; every node/edge links back to paper evidence.
6. Validate on physical iPad/Safari before Pencil or touch selection claims.
