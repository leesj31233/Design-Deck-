# Design Deck — Component Catalog

The library has **30 reusable components**. The selection is intentionally weighted toward product work instead of decorative demos.

| # | Component | Role | Foundation |
|---:|---|---|---|
| 1 | Button | Primary actions and variants | CVA + Radix Slot |
| 2 | IconButton | Accessible icon-only actions | Button |
| 3 | Input | General text input | Native semantic input |
| 4 | SearchField | Product search with clear action | Native input |
| 5 | Textarea | Long-form input | Native textarea |
| 6 | Badge | Status and taxonomy | CVA |
| 7 | Avatar | User/entity identity | Radix Avatar |
| 8 | Tooltip | Short contextual help | Radix Tooltip |
| 9 | GlassPanel | Layer/material container | Design Deck tokens |
| 10 | DataCard | Compact metric surface | GlassPanel |
| 11 | Tabs | View switching | Radix Tabs |
| 12 | Dialog | Modal workflows | Radix Dialog |
| 13 | CommandMenu | Keyboard-first navigation/actions | cmdk + Dialog |
| 14 | Sidebar | Dense product navigation | React |
| 15 | Dock | High-priority destinations | Motion |
| 16 | SegmentedControl | Compact mode selection | Motion layout |
| 17 | DropdownMenu | Contextual actions | Radix Dropdown Menu |
| 18 | Popover | Anchored contextual content | Radix Popover |
| 19 | Kbd | Shortcut display | Semantic kbd |
| 20 | Progress | Determinate task progress | ARIA progressbar |
| 21 | Skeleton | Loading placeholder | CSS animation |
| 22 | EmptyState | Empty/error onboarding surface | React |
| 23 | Toaster | Transient system feedback | Sonner |
| 24 | ActionBar | Floating grouped controls | GlassPanel language |
| 25 | AIChat | Research-grounded assistant UI | Design Deck product layer |
| 26 | PDFToolbar | Page/zoom/search/annotation controls | ActionBar |
| 27 | AnnotationToolbar | Highlight/note/draw tools | ActionBar + Tooltip |
| 28 | KnowledgeGraph | Interactive research relation map | React Flow / XYFlow |
| 29 | InspectorPanel | Context/property inspector | GlassPanel |
| 30 | DocumentRail | PDF page thumbnails/navigation | React |

## Why these foundations

**Radix UI** is used where interaction semantics are difficult to reproduce correctly: modal focus trapping, menus, popovers, tabs, tooltips and avatars.

**cmdk** is specialized for command palettes and gives a better keyboard-first base than building filtering and selection semantics from scratch.

**Motion** is restricted to places where it improves spatial continuity: segmented selection and dock interaction. It is not used to animate every surface.

**React Flow / XYFlow** is used for the knowledge graph because research maps need real pan, zoom, selection, nodes, edges, minimap and controls rather than a decorative static canvas.

**Sonner** provides a lightweight, mature toast interaction instead of adding another bespoke feedback system.

## Product rule

A new component should enter the core only when it solves a repeated product problem. One-off hero effects, shaders and experimental text animations belong in project-specific layers such as `components/aceternity`, `components/magic`, `components/react-bits`, or `components/community` rather than in this core.
