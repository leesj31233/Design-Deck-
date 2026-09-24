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

`H` highlights; `N` opens notes; `T`/`E` open Phase 2 translation/explanation shells;
`Ctrl/Cmd+K` opens commands; arrows change pages; Escape dismisses contextual UI.
Shortcuts do not intercept text input. `Ctrl/Cmd+F` opens the explicitly labelled search shell.

## Product boundary

Enhanced v2 remains the Phase 1 scope. Per the user's explicit request, local user-authored notes and archive/restore are implemented now. AI translation, scientific explanation, citation lookup, automatic concept extraction, research-map generation, cloud accounts and sync are not implemented. Placeholder research pools and evidence prompts are labelled Demo; no paper conclusions or DOIs are fabricated.

Hybrid translation is the next signature feature: preserve engineering terms (models, chemicals, units, variables, processes and user glossary entries) in English; translate grammatical structure into Korean. Show results beside anchored original evidence, never replace the PDF. Notes are visibly user-authored. Research-map edges must later resolve to document/page/anchor evidence and be confirmed by the user.

## Architecture

- `pdf/pdf-adapter.ts` is the only PDF.js integration boundary. It uses public `getDocument`, `getPage`, `render`, `TextLayer` and loading-task `destroy` APIs in PDF.js 6.3.289. The worker, CMaps, fonts and WASM are copied from the installed package into `public/pdfjs` on install/build. There is no CDN dependency.
- Each page has separate canvas, transparent selectable text, and pointer-transparent highlight layers. Chrome themes never alter the paper. Only the current page gets a full-resolution canvas; the next page handle is prefetched. Render cancellation and document destruction are tied to effect cleanup.
- Browser Range rectangles are translated to page-local and normalized coordinates. Line breaks and the exact selected quote are retained with prefix/suffix context. Text offsets can be mapped back to actual DOM ranges for recovery.
- Recovery stays in the original document and page: valid geometry → unique quote → context-disambiguated quote → bounded, unique, high-confidence fuzzy match → unresolved. A fuzzy match needs both contexts, a sufficiently long quote and similarity ≥ 0.94. Ambiguity is visible in the Inspector.
- IndexedDB repositories separate immutable PDF Blobs, document metadata and annotations. SHA-256 content IDs make duplicate imports safe. Original bytes are never rewritten when notes or marks change. Document+Blob creation is transactional.
- TanStack Query owns asynchronous repository data; Zustand owns transient reader UI only. Rapid selection updates subscribe only in the Inspector and selection toolbar.
- Shared CommandMenu gained an optional `disabled` item property, preserving existing consumers. Other Design Deck primitives remain unchanged.

## Storage and limits

Data belongs to this browser profile and origin (including port). Clearing site data removes the local library. Phase 1 has no cross-device synchronization or archival backup export. Keep the original PDFs. Storage errors are surfaced; failed annotations are not shown as successfully saved. Scanned pages can be viewed but require future OCR for text selection. Password-protected PDFs require an unlocked copy. Very long documents use a page-number placeholder rail rather than generated thumbnails. Long libraries are incrementally paginated in batches of 30.

## Validation

- `tests/unit`: coordinates, multi-line anchors, quote normalization, duplicate text, context and fuzzy confidence, wrong page/document, corrupt geometry, unresolved anchors.
- `tests/integration`: real IndexedDB API via fake-indexeddb; duplicate source IDs, immutable bytes, notes, reading progress, archive and reconnect durability.
- `tests/e2e`: production-server import/read/select/highlight/note/reload, real mouse dragging, quote recovery after damaged geometry, zoom alignment, archive, original byte equality, theme, command focus, reduced motion, responsive sizes and automated axe WCAG 2.1 AA checks.
- An original two-page test PDF is generated in memory. Private research PDFs are never committed. Optional `PAPERFLOW_REAL_PDF` selects one local PDF. `PAPERFLOW_CORPUS_DIRS` accepts `|`-separated directories for the local corpus suite. `PAPERFLOW_SCREENSHOTS` and `PAPERFLOW_CORPUS_REPORT` direct private verification artifacts outside the repository.
- Browser timings use `performance.measure`: selection capture, action-bar React commit, annotation transaction, and canvas rendering. They do not claim physical iPad/Safari performance or full first-paint latency.

## Design source

The user explicitly selected the existing Design Deck as the visual reference instead of providing a Figma frame. No pixel-match to an unseen Figma frame is claimed. Sidebar, GlassPanel, ActionBar, CommandMenu/Dialog, Button, IconButton, SearchField, Badge and Tabs are composed with existing tokens, Lucide and restrained Motion. Product-specific page/selection geometry and source inspection require dedicated compositions.

PDF integration reference: https://mozilla.github.io/pdf.js/examples/

## Phase 2 handoff

1. Add a user-editable engineering glossary with deterministic term protection and precedence.
2. Add an explicit translation adapter returning source anchor, mode, protected terms and labelled generated text.
3. Add evidence-labelled concept/equation explanations with paper vs external-source provenance.
4. Add durable backup/export and optional authenticated storage adapters.
5. Add user-confirmed concept relationships; every node/edge links back to paper evidence.
6. Validate on physical iPad/Safari before Pencil or touch selection claims.
