# PAPERFLOW — CODEX PHASE 1 EXECUTION PROMPT

You are implementing the first production-quality vertical slice of PAPERFLOW.

Read first:

1. `docs/PAPERFLOW_CODEX_MASTER_EXECUTION.md`
2. `docs/REFERENCE_WORKFLOW.md`
3. `docs/COMPONENT_SOURCES.md`
4. existing Design Deck components under `components/`

Visual reference:

- Figma: https://www.figma.com/design/idyLazO1as4a4eV0IEIgdK
- Design system implementation: this repository

## Mission

Build a serious engineering research reading application for Korean engineering users.

North star:

**Paper first. AI second. Evidence always visible.**

The PDF is the center of the application. Do not create a chat-first UI.

## Scope for this run

Implement only:

1. application shell
2. Research Library
3. Immersive Reader
4. PDF import and rendering with PDF.js
5. text selection
6. highlight rendering
7. durable highlight anchors
8. highlight persistence
9. contextual selection action bar
10. right-side research inspector shell
11. global `⌘K` command palette
12. desktop shortcuts shell
13. responsive iPad-landscape layout
14. light/dark theme support

Do NOT implement:

- LLM calls
- translation API
- related-paper API
- research graph extraction
- autonomous summaries
- Tauri packaging
- native iOS implementation

Use mocked engineering research data for:

- EFB
- torrefaction
- coal co-firing
- realizable k-ε
- DPM
- NOx
- heat flux
- boiler efficiency

## Architecture

Use:

- Next.js / React
- strict TypeScript
- Tailwind
- Design Deck primitives
- PDF.js
- Motion for restrained interaction only
- Zustand for local reader interaction state
- TanStack Query for persisted/server state boundaries

Backend interfaces should be designed so Supabase can provide Auth/PostgreSQL/Storage later, but do not block the reader MVP on backend completion.

Original PDF binaries must be immutable.

Annotations live as overlays using durable anchors with:

- document id
- page index
- exact quote
- prefix/suffix
- geometry rects
- normalized rects

Recovery order:

1. geometry
2. quote
3. prefix/suffix
4. fuzzy local match
5. unresolved anchor

Never silently relocate a highlight.

## Design requirements

Match the PAPERFLOW Figma direction and Design Deck language:

- background `#F5F6F8`
- foreground `#101114`
- muted `#717784`
- accent `#0A84FF`
- quiet translucent chrome
- protected white PDF surface
- restrained radii
- strong typography hierarchy
- no AI neon gradients
- no oversized marketing cards in the reader

Desktop Reader:

- left: page thumbnails / outline
- center: immutable PDF
- right: research inspector

Selection action bar:

- Translate
- Explain
- Note
- Search papers
- Formula
- Compare
- Copy citation

These actions are UI shells only in this phase.

## Motion requirements

- controls: 120–180ms
- panels: 180–240ms
- contextual floating controls may use restrained spring
- no ambient looping motion
- support `prefers-reduced-motion`

Action bar should feel immediate and remain spatially connected to selection.

## Accessibility

- keyboard navigable
- visible focus
- WCAG AA for normal UI
- minimum 44pt touch targets in tablet mode
- annotation colors have text names / accessible labels
- PDF text selection stays accessible

## Performance targets

Treat as budgets and instrument where possible:

- selection action bar perceived latency < 80ms
- local highlight persistence < 50ms
- prefetched page turn perceived latency < 120ms
- virtualize long paper lists

## Implementation rules

1. Inspect existing source before editing.
2. Reuse Design Deck components before creating replacements.
3. Do not globally modify a primitive for one screen.
4. Do not add unnecessary packages.
5. Keep user state, local reader state and server state separated.
6. Keep the application runnable after every logical step.
7. Add tests for anchor recovery and highlight persistence.
8. Keep AI output completely absent from this phase except static inspector placeholders.
9. Do not fake citations or research evidence.
10. Preserve the PDF visually.

## Required validation

Before declaring this phase complete:

1. run TypeScript typecheck
2. run tests
3. run production build
4. launch locally
5. verify import → render → select → highlight → reload → restored highlight
6. verify keyboard focus and command palette
7. verify reduced motion
8. verify 1440×960 desktop
9. verify iPad landscape
10. capture screenshots
11. compare screenshots with Figma
12. fix obvious spacing, hierarchy and overflow mismatches

## Final report

Return:

- files changed
- architecture decisions
- components reused from Design Deck
- new components created and why
- test/build results
- performance observations
- desktop/iPad screenshots or their paths
- remaining visual mismatches
- known technical debt
- next recommended Phase 2 tasks

Stop after Phase 1. Do not continue into AI services without explicit approval.
