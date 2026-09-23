# PAPERFLOW — Codex Master Execution Strategy v0.1

> Product: Engineering Research Reading OS for Korean engineering students and researchers
>
> North star: **Paper first. AI second. Evidence always visible.**
>
> Figma draft: https://www.figma.com/design/idyLazO1as4a4eV0IEIgdK
>
> Implementation design source: https://github.com/leesj31233/Design-Deck-

---

## 1. Codex operating role

You are the principal product engineer for PAPERFLOW. Build a premium research reading system, not a generic chatbot with a PDF viewer attached.

Your execution priorities are:

1. PDF fidelity and reading depth.
2. Evidence-grounded interactions.
3. Durable annotation and source anchors.
4. Fast point-of-friction AI actions.
5. Quiet, professional product design.
6. Accessibility, keyboard use, touch/Pencil readiness.
7. Reusable components and maintainable architecture.
8. Performance and testability before feature count.

Do not proceed by generating the whole application at once. Work in vertical slices, keep the app runnable after every slice, and validate each phase before expanding.

---

## 2. Product design doctrine

### Visual character

PAPERFLOW should feel like a serious Apple-class productivity tool for engineering research:

- light-first, excellent dark mode
- quiet neutral surfaces
- editorial calmness around document content
- subtle material depth on application chrome only
- no neon AI gradients
- no giant chat-first surface
- no excessive rounded-card dashboard aesthetic
- dense engineering information can exist, but hierarchy must remain immediately readable

### Protected PDF principle

The original PDF is an immutable visual surface.

- Never blur the PDF page.
- Never recolor or restyle the original page.
- Never destructively inject translated text into the PDF.
- Never cover figures/equations unless a contextual overlay is explicitly invoked.
- All AI/translation/annotation layers must be reversible overlays anchored to original evidence.

### Core visual tokens

Use the existing Design Deck tokens before adding anything new.

- Background: `#F5F6F8`
- Foreground: `#101114`
- Muted: `#717784`
- Accent: `#0A84FF`
- Success: `#30D158`
- Danger: `#FF453A`
- Radius baseline: `18px`
- Glass surface: `rgba(255,255,255,.72)`
- Strong surface: `rgba(255,255,255,.92)`
- Chrome blur: approximately `24px`, saturation approximately `150%`

Glass is for sidebar, topbar, inspector, floating toolbar, dock and contextual controls — not the paper itself.

---

## 3. Design Deck usage strategy

Treat Design Deck as the implementation source of truth for reusable interface primitives.

### Reuse first

Prefer existing components under:

- `components/ui/`
- `components/product/`
- `components/knowledge/`
- `components/engineering/`
- `components/motion/`
- `components/editorial/`

Key mappings:

- app navigation → sidebar
- research inspector → glass panel / inspector
- selection actions → action bar
- research metrics → data card
- global command → command menu
- mobile/iPad tools → dock
- search → search field
- Original / Hybrid / Korean → segmented control
- assistant sections → tabs
- local explanation → popover
- consequential choices → dialog
- icon meaning → tooltip
- research relationships → React Flow based knowledge graph

Do not globally mutate a primitive just to fit one feature. Extend locally or add a composed product component.

---

## 4. Screen architecture

### A. Research Library

Purpose: enter research quickly and understand current research state without turning the home screen into analytics clutter.

Layout:

- persistent left navigation
- compact top command/search region
- Continue Reading row
- Research Pools row
- Evidence Signals table

Every paper card should expose only information useful to reading:

- title
- journal/year
- reading progress
- notes count
- unresolved questions
- DOI or source status
- indexed/open-access/source badge when useful

Evidence Signals should surface:

- contradictions
- newly linked evidence
- unresolved questions
- method overlaps
- weak concept connections

Avoid generic vanity metrics.

### B. Immersive Reader

Desktop three-zone layout:

1. left page rail / outline
2. center immutable PDF
3. right evidence-first inspector

The paper must visually dominate.

The top bar should contain:

- filename/title
- current page
- zoom
- document mode
- Original / Hybrid / Korean mode
- local paper search

Selection creates a floating contextual action bar:

- Translate
- Explain
- Note
- Search papers
- Formula
- Compare
- Copy citation

The toolbar should appear at the selection point, avoid equations/figures, and flip above/below when necessary.

### C. Research Map

This is not a decorative mind map.

Every node must resolve to evidence.

Node classes:

- Feedstock
- Pretreatment
- Method
- Model
- Variable
- Mechanism
- Result
- Limitation
- Question
- Paper
- Dataset

Edge classes:

- uses
- affects
- increases
- decreases
- validated-by
- contradicts
- extends
- cites
- derived-from
- unanswered-by

Selecting a node opens:

- definition
- current interpretation
- source paper/page
- highlights
- notes
- neighbors
- confidence
- unresolved questions

Research Compass can suggest weak links, contradictions and search queries. It must never claim a research gap merely because the local graph is sparse.

### D. Notebook

Structured note types:

- Grounded Note
- Research Question
- Result
- Method
- Limitation
- Assumption
- Formula
- Figure Note
- Dataset Note

User-authored content and AI interpretation must remain visibly separate.

---

## 5. Motion system

Motion is functional feedback, not visual decoration.

### Timing

- control transitions: 120–180 ms
- panel transitions: 180–240 ms
- spring: only floating inspector/contextual controls where spatial cause matters
- graph animation: only relationship/state change, never continuous ambient drift

### Required state choreography

#### Selection action bar

`hidden → anchored → action selected → dismissed`

Requirements:

- perceived appearance under 80 ms
- opacity + slight positional transition only
- no bounce
- selection anchor remains stable

#### Translation Veil

`collapsed hint → expanded hybrid → pinned → saved note → hidden`

Requirements:

- never causes PDF text reflow
- original English remains visible
- overlay flips above/below when obstructed
- pinned state becomes quieter, not larger

#### Dynamic icons

Use icon animation to communicate state:

- Highlight: outline → active
- Bookmark: save → saved/check
- Copy citation: copy → copied/check
- AI evidence: idle → streaming → grounded complete
- Graph relation: proposed → confirmed / rejected

Avoid looping icon animation.

#### Async buttons

`idle → working → complete → retry`

Rules:

- button width should remain stable
- text/icon morph should be short
- errors must be explicit
- spinner alone is insufficient when the task has a semantic state

### Reduced motion

Respect `prefers-reduced-motion`.

Replace:

- spring motion → short opacity/state changes
- animated graph movement → static updates
- shimmer → static skeleton

Never remove focus visibility or state clarity.

---

## 6. Hybrid Engineering Translation UX

This is a signature capability.

Modes:

- Original
- Hybrid
- Korean

Hybrid preserves English for:

- engineering models
- equations
- chemicals
- equipment
- materials
- variables
- units
- process names
- standards
- software names
- key domain terms

Translate structural grammar, causality, tense relations, conjunctions, long clauses and qualifiers.

Example:

Original:

`A realizable k-ε turbulence model was selected to calculate the effect of turbulence in the boiler.`

Hybrid:

`boiler 내부의 turbulence effect를 계산하기 위해 realizable k-ε turbulence model을 적용하였다.`

The translation result must be displayed beside/near the source sentence as an anchored overlay, never as destructive replacement text.

User glossary overrides model output.

---

## 7. Grounded AI interaction model

AI must appear at friction points, not dominate the reading experience.

Explainer response order:

1. What it is
2. What it means in this paper
3. Why the authors used it
4. Equation / mechanism
5. Variables / units
6. Assumptions
7. What changes when assumptions fail
8. Evidence
9. Related concepts

Badge every claim as one of:

- Paper
- External source
- Model explanation
- User note

Never visually mix these sources into one unlabelled answer.

---

## 8. Equation mode

Selecting an equation opens an Equation Explainer.

Display:

- readable equation
- symbol table
- dimensions / units
- physical meaning
- boundary conditions
- sensitivity of terms
- parameter provenance
- direct link back to paper sentence/table/figure

Initial engineering coverage:

- mass balance
- energy balance
- Arrhenius kinetics
- Navier–Stokes terms
- turbulence variables
- radiation heat transfer
- stoichiometry
- residence time
- particle balance

---

## 9. Immutable annotation architecture

Original source binary is immutable.

Store separately:

- original PDF binary
- rendered page
- extracted text layer
- word/sentence geometry
- annotations
- translations
- notes
- graph anchors

Durable text anchor:

```ts
type TextAnchor = {
  documentId: string;
  pageIndex: number;
  textQuote: string;
  prefix?: string;
  suffix?: string;
  rects: Array<{x:number;y:number;width:number;height:number}>;
  normalizedRects: Array<{x:number;y:number;width:number;height:number}>;
};
```

Recovery order:

1. exact geometry
2. exact quote
3. prefix/suffix
4. fuzzy local match
5. unresolved anchor

Never silently move a highlight.

---

## 10. Application architecture

### Frontend

Use:

- Next.js / React
- TypeScript strict mode
- Tailwind
- Design Deck primitives
- PDF.js
- Motion
- Zustand for local interaction state
- TanStack Query for server state
- `@xyflow/react` for research map
- virtualization for long libraries/notes

Tauri can be added after the web reading experience is stable.

### Backend / data

Use Supabase as the primary application data layer:

- PostgreSQL
- Auth
- object storage for immutable PDFs and derived assets
- pgvector where appropriate
- RLS from the beginning
- Edge Functions only for suitable short-lived server logic

Core entities:

- User
- Document
- DocumentPage
- TextBlock
- Annotation
- TextAnchor
- Translation
- GlossaryTerm
- Note
- FigureAnchor
- EquationAnchor
- ResearchPool
- Concept
- ConceptAlias
- ConceptEdge
- Evidence
- PaperMetadata
- ExternalPaper
- SearchQuery
- ReadingSession

`Evidence` is first-class and should be addressable from every generated interpretation.

### Search

Start with:

- PostgreSQL full-text search
- metadata filtering
- exact quote lookup
- vector search

Combine into hybrid ranking with boosts for:

- local paper context
- graph adjacency
- exact engineering terminology
- current research pool
- citation/source authority where appropriate

---

## 11. Current connected-tool orchestration

These tools have different responsibilities. Do not use every tool for every task.

### GitHub — implementation source of truth

Use for:

- source code
- branches/PRs
- issues
- CI
- reviewable diffs
- Design Deck reuse

Codex should make code changes here, preferably as focused branches/PRs once the PAPERFLOW repository exists.

### Figma — visual source of truth

Current PAPERFLOW draft file:

`https://www.figma.com/design/idyLazO1as4a4eV0IEIgdK`

Use for:

- Library screen
- Immersive Reader
- Research Map
- Motion/interaction specification
- responsive desktop / iPad variants
- component state review
- screenshot comparison

Use Code Connect later to bind mature Figma components to React components.

### Supabase — persistent product backend

Use for:

- Auth
- PostgreSQL schema
- RLS
- PDF/object storage
- annotations/notes/graph/evidence
- vector metadata

Do not start with a huge schema migration. Introduce tables in feature order and keep migrations reviewable.

### Railway — server deployment / workers

Use when PAPERFLOW needs:

- PDF extraction worker
- long-running indexing jobs
- external paper metadata aggregation
- scheduled/background processing
- services not suited to short Edge Functions

### Replit — disposable prototype / UX experiment lane

Use to test isolated ideas quickly:

- Translation Veil interaction
- equation panel
- Research Map interaction
- mobile/iPad layout experiment

Do not let Replit become a competing production codebase. Successful experiments must be ported into the canonical GitHub repository.

### Webflow — marketing site only

Use for:

- PAPERFLOW public landing page
- product story
- waitlist/docs/SEO content

Do not implement the research application itself in Webflow.

### Adobe — visual asset refinement

Use for:

- launch visuals
- screenshots
- image cleanup
- marketing graphics
- PDF communication assets

Do not use generated decoration inside dense reading UI merely because it is available.

### Miro — product/technical architecture

Use for:

- user flows
- data/evidence flow
- ingestion/indexing architecture
- feature dependency map
- product roadmap

Keep Miro as the system map, not implementation source of truth.

### Gamma — communication layer

Use after product decisions stabilize for:

- pitch deck
- research-product explanation
- investor/team brief
- partner presentation

### Remote Desktop Commander — engineering desktop bridge

Not needed for the core PDF reader MVP. Later use it for engineering integrations such as:

- ANSYS result ingestion
- MATLAB exports
- Aspen/HYSYS automation outputs
- local simulation result files

PAPERFLOW can later treat engineering simulation results as evidence-linked project artifacts.

---

## 12. Development phases

### Phase 0 — Foundation

Build only:

- app shell
- design tokens
- sidebar/topbar
- dark mode
- command palette
- responsive breakpoints
- test harness

Acceptance:

- no visual token duplication
- keyboard navigation works
- 1440 desktop and iPad landscape do not overflow

### Phase 1 — Reader fidelity

Build:

- PDF import
- PDF.js rendering
- page rail
- text layer
- selection geometry
- highlight rendering
- durable anchors
- local persistence + server persistence
- right inspector shell
- contextual action bar

Acceptance:

- PDF remains visually faithful
- reopening restores highlight anchors
- no annotation drift without warning
- page navigation feels immediate

### Phase 2 — Point-of-friction AI

Build:

- Hybrid Translation
- Domain Explainer
- Equation Explainer
- evidence labels
- streaming result states

Acceptance:

- original evidence always accessible
- AI output visibly separated from paper evidence
- translation never replaces the paper

### Phase 3 — Research memory

Build:

- structured notebook
- research pools
- concept candidate review
- user-confirmed research graph

### Phase 4 — Discovery

Integrate:

- OpenAlex
- Crossref
- Semantic Scholar
- arXiv when appropriate

Every recommendation shows `Why this paper` and what question it can/cannot answer.

### Phase 5 — iPad/Pencil

Only after reader fidelity is accepted:

- Pencil annotation mode
- touch gestures
- bottom palette
- side-sheet inspector

If PWA/browser Pencil quality is insufficient, evaluate native SwiftUI + PDFKit + PencilKit shell later.

---

## 13. Performance budgets

Treat these as engineering budgets, not marketing claims:

- warm library interaction: target < 1.5s
- prefetched page turn/render perceived latency: target < 120ms
- selection action bar: target < 80ms
- local highlight persistence: target < 50ms
- translation placeholder: immediate
- translation content: stream progressively
- graph: target 1,000 nodes without main-thread lock

Measure before claiming success.

---

## 14. Testing strategy

### Unit

- anchor normalization
- quote recovery
- glossary precedence
- evidence provenance
- graph edge validation
- translation mode formatting

### Component

- keyboard navigation
- focus trapping
- popover placement
- action bar flip behavior
- reduced motion

### Integration

- upload → render → select → highlight → reopen
- select → translate → pin → save note
- equation → explain → evidence link
- concept proposal → evidence review → confirm graph

### Visual regression

Capture and compare at minimum:

- 1440×960 desktop
- iPad landscape
- light mode
- dark mode

Figma is the visual reference; GitHub implementation is the code reference.

---

## 15. First Codex execution task

Do not build the entire application.

Create the first production-quality vertical slice:

1. Application shell
2. Research Library screen
3. Immersive Reader screen
4. PDF import/render using PDF.js
5. Text selection
6. Highlight creation
7. Durable highlight persistence
8. Floating contextual action bar
9. Right inspector shell
10. Command palette and shortcuts

Use mocked engineering paper metadata around:

- EFB
- torrefaction
- coal co-firing
- realizable k-ε
- DPM
- NOx
- heat flux
- boiler efficiency

Do not implement AI services yet.

After implementation:

1. run typecheck/tests
2. run production build
3. launch locally
4. capture desktop 1440×960
5. capture iPad landscape
6. compare against Figma
7. fix spacing, hierarchy and overflow
8. report visual mismatches
9. report architectural debt
10. stop for review before AI phase

---

## 16. Codex working rules

- Inspect the repo before editing.
- Reuse existing Design Deck components where possible.
- Keep strict TypeScript.
- Avoid `any` unless justified in a comment.
- Prefer composition over global primitive mutation.
- Keep UI state separate from persisted server state.
- Add schema migrations incrementally.
- Do not place secrets in source.
- Do not fake citations or evidence.
- Do not add dependencies for trivial functionality.
- Avoid animation libraries beyond the chosen motion stack unless a concrete gap exists.
- Keep the app runnable after each commit.
- For every major UI change, verify keyboard/focus/reduced-motion behavior.
- For every paper-derived AI feature, define the evidence path before the generation path.

---

## 17. Definition of excellent

PAPERFLOW is successful when a Korean engineering student can open a difficult English engineering paper and:

- remain focused on the original paper,
- understand difficult grammar without losing engineering terminology,
- ask precise questions at the exact point of confusion,
- verify where every important explanation came from,
- create grounded notes without losing source context,
- accumulate a research map that reflects confirmed evidence,
- and later recover the exact paper/page/selection that created each research idea.

The product should feel less like “AI reading for me” and more like **a professional research instrument that makes me a better reader and researcher**.
