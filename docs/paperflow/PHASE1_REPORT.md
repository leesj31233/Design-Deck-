# PAPERFLOW — Phase 1 report

Scope: `prompts/PAPERFLOW_CODEX_PHASE1.md`. AI services are deliberately absent. Stopped after Phase 1 for review.

Routes: `/paperflow` (Research Library) · `/paperflow/reader/[documentId]` (Immersive Reader; `sample-cofiring` is the bundled sample).

## Validation (production build, `next start`)

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` (vitest, 17 tests: anchor recovery ×12, persistence/immutability ×5) | pass |
| `npm run build` | pass |
| `scripts/paperflow-verify.mjs` (Playwright, Chromium) | 24/24, three consecutive runs |

The verification script covers: import via the real file input → render → select → highlight → reload → restored (imported PDF and sample); action bar anchored above the selection, flips below near the top edge, `Esc` dismisses it; copy citation; action shells route to the inspector without AI output; `J`/`K` navigation; `⌘K` runs a command; visible keyboard focus; `?` opens the shortcuts sheet; PDF stays white in dark mode; theme toggle; reduced motion; no horizontal overflow on iPad landscape; every top-bar touch target ≥ 44pt on iPad.

### Performance (measured in-app via `lib/paperflow/perf.ts`, also visible in Inspector → Info)

| Budget | Measured (3 runs) |
| --- | --- |
| Selection → action bar painted < 80 ms | 10–12 ms |
| Local highlight persistence < 50 ms | 42–47 ms (**tight**) |
| Prefetched page turn → painted < 120 ms | 6–8 ms |

Highlight persistence is wall-clock from the IndexedDB write to the transaction completing. It includes the React render that runs during the write, which is most of the time spent. Narrowing per-page subscriptions brought it down from ~52 ms to ~45 ms. These numbers come from headless Chromium on a container CPU and need confirming on real hardware.

## Architecture decisions

- **Location.** PAPERFLOW lives inside Design Deck (`app/paperflow`, `components/paperflow`, `lib/paperflow`) until a separate repository exists. Design Deck routes are unchanged.
- **State separation.** Persisted state (documents, highlights) goes through TanStack Query with optimistic mutations (`lib/paperflow/queries.ts`). Local reader interaction state (page, zoom, selection, panels, anchor resolutions) lives in Zustand (`lib/paperflow/state/reader-store.ts`).
- **Persistence boundary.** `DocumentRepository` / `HighlightRepository` interfaces with an IndexedDB implementation. A Supabase implementation (Postgres + Storage + RLS) can replace it without touching the reader.
- **Immutable originals.** The SHA-256 of the bytes is recorded at import. `putBinaryOnce` refuses to overwrite. Every open re-hashes and reports *verified* / *changed* in the inspector. pdf.js always gets a copy of the buffer.
- **Durable anchors.** `TextAnchor` = document id, page index, quote, 32-char prefix/suffix, rects (PDF points) and normalized rects, plus the advisory text offset. Recovery order: geometry → exact quote → prefix/suffix → fuzzy local match (normalized + Sellers edit distance ≤ 15%, ±3000 chars) → unresolved. Every result except `exact` is flagged in the inspector with its reason. Fuzzy matches are drawn dashed and need **Accept position** or **Discard**. Unresolved anchors are listed but not drawn. Accepting keeps the old anchor in `previousAnchors`. Nothing is ever relocated silently.
- **Rendering.** Continuous scroll. Canvases render only for visible pages plus a prefetch window (1 before, 2 after) and swap in off-DOM so zooming never flashes blank. The text layer is positioned in % and scaled by `--total-scale-factor`, so it survives zoom without re-rendering. Highlights are drawn from normalized rects (zoom-independent) under the text layer, so selection keeps working.
- **pdf.js legacy build.** pdfjs-dist 6.x's modern build uses `Map#getOrInsertComputed` and `Math.sumPrecise`, which current Chromium and Safari lack. The legacy build is used. The worker, CMaps and standard fonts are copied to `public/pdfjs` by `scripts/copy-pdfjs-assets.mjs` (`predev`/`prebuild`, gitignored).
- **Theme.** Tokens accept `<html data-theme="light|dark">` on top of the OS preference. The `dark:` variant follows the same rule. The pinned theme is applied before paint by an inline script.

## Design Deck reuse

Reused: `Sidebar`, `CommandMenu`, `Dialog`, `ActionBar`, `IconButton`, `Button`, `SegmentedControl`, `SearchField`, `Tabs`, `Badge`, `Progress`, `Kbd`, `EmptyState`, `Skeleton`, `Toaster`, `DocumentRail`.

Small global fixes to primitives (accessibility/correctness, not screen-specific):

- `globals.css`: `button, input, textarea { font: inherit }` moved into `@layer base`. Before this it silently overrode Tailwind `text-*` utilities on every control.
- `globals.css`: `data-theme` support, `dark:` variant and `coarse:` variant. Without `data-theme`, behaviour is identical to before.
- `SegmentedControl`: visible focus ring, `aria-pressed`, `type="button"`.
- `DocumentRail`: visible focus ring, `aria-current`, accessible label.
- `Skeleton`: static under `prefers-reduced-motion`.

## New components (and why)

| Component | Reason |
| --- | --- |
| `reader/pdf-page` | Canvas + pdf.js text layer + highlight overlay per page. No Design Deck equivalent. |
| `reader/pdf-viewport` | Continuous scroll, fit modes, prefetch window, navigation, selection capture. |
| `reader/selection-action-bar` | Composes `ActionBar`. Needs anchoring, flip, roving focus, latency instrumentation. |
| `reader/research-inspector` | Evidence / Notes / Assist / Info tabs with anchor-status reporting. `InspectorPanel` is row-only. |
| `reader/page-rail` | Wraps `DocumentRail` with lazily rendered thumbnails and an Outline tab. |
| `reader/reader-topbar` | Composes Design Deck controls. `PDFToolbar` includes rotate/download, which are out of scope. |
| `library/library-screen` | Continue reading, research pools, evidence signals, virtualized archive (`@tanstack/react-virtual`). |
| `shell/*` | Providers (Query, theme, `MotionConfig reducedMotion="user"`), palette command registry, shortcuts sheet. |

New dependencies: `pdfjs-dist`, `zustand`, `@tanstack/react-query`, `@tanstack/react-virtual`. Dev: `vitest`, `fake-indexeddb`.

## Screenshots

`docs/paperflow/screenshots/` — desktop 1440×960 (library light/dark, reader light/dark, selection bar, command palette) and iPad Pro 11" landscape (library, reader, inspector sheet).

## Remaining visual mismatches

- **The Figma file was not compared.** This session had no Figma access, so the tokens and layout follow the written spec (background `#F5F6F8`, foreground `#101114`, muted `#717784`, accent `#0A84FF`, quiet chrome, protected white page). Comparing against the Figma screenshots is still open.
- The action bar and the tablet inspector are opaque rather than frosted glass. This is on purpose: the doctrine forbids blurring the PDF, and translucency let paper text show through.
- The library's mock cards use the same card treatment as the real PDF; the only distinction is the "Sample" badge.

## Known technical debt

- The action bar does not yet avoid equations or figures; it only flips above/below. That needs figure/equation detection.
- Every page's viewport is read at open, which is fine for papers but slow for 500+ page documents. Selections that cross pages are clamped to the first page.
- Search scans page text linearly, only reveals one match at a time as a native selection, and does not mark all matches.
- No server persistence yet. IndexedDB is per-browser, so a document imported in one browser shows "Document not found" in another.
- Copy citation uses the document title and page only. No bibliographic metadata yet, and the toast says so.
- The verification script depends on a global Playwright install rather than a project dependency.
- Highlight-persist latency is near its budget. Next step: move anchor resolution off the commit path and memoize the inspector list.

## Recommended Phase 2 tasks

1. Hybrid translation overlay (Translation Veil) anchored to `TextAnchor`, with glossary precedence tests.
2. Domain and Equation Explainer, with evidence labels (Paper / External / Model / User note) and streaming states.
3. Supabase schema (Document, Annotation, TextAnchor) with RLS, behind the existing repository interfaces.
4. Detect equations and figures so the action bar and overlays avoid them.
5. Visual regression against the Figma frames for desktop and iPad, light and dark.
