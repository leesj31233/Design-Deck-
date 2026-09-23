# Design Deck

**Design Deck** is a premium, reusable UI foundation for serious web products: AI workspaces, research tools, PDF readers, engineering dashboards, SaaS products, and high-end landing experiences.

It is intentionally not an effects dump. The default language is restrained: strong hierarchy, compact information density, excellent focus states, subtle glass/material depth, and motion only when it communicates state.

## Stack

- **Next.js + TypeScript** — application foundation
- **Tailwind CSS** — styling and token composition
- **Radix UI** — accessible interaction primitives
- **cmdk** — command palette behavior
- **Motion** — state-first micro-interactions
- **Sonner** — production-grade toast feedback
- **React Flow / XYFlow** — interactive research and knowledge graphs
- **Lucide** — consistent icon language
- **shadcn-compatible structure** — easy addition of ecosystem components

## 30 components

### Core UI (24)

`Button`, `IconButton`, `Input`, `SearchField`, `Textarea`, `Badge`, `Avatar`, `Tooltip`, `GlassPanel`, `DataCard`, `Tabs`, `Dialog`, `CommandMenu`, `Sidebar`, `Dock`, `SegmentedControl`, `DropdownMenu`, `Popover`, `Kbd`, `Progress`, `Skeleton`, `EmptyState`, `Toaster`, `ActionBar`.

### Product UI (6)

`AIChat`, `PDFToolbar`, `AnnotationToolbar`, `KnowledgeGraph`, `InspectorPanel`, `DocumentRail`.

The product components are deliberately aimed at the Research/PDF/AI application category so Design Deck can function as a real product foundation instead of a generic component screenshot gallery.

## Run

```bash
npm install
npm run dev
```

Open the local Next.js app to see the integrated showcase. Run a strict type check with:

```bash
npm run typecheck
```

## Import

```tsx
import {
  Button,
  CommandMenu,
  AIChat,
  PDFToolbar,
  KnowledgeGraph,
} from "@/components";
```

## Design principles

1. **Clarity before decoration.** Dense engineering and research products have to remain legible for hours.
2. **Material, not gimmick glass.** Blur is used for layer separation, never as a substitute for hierarchy.
3. **Motion explains state.** No gratuitous perpetual animation in productivity surfaces.
4. **Keyboard is first class.** Command menus, focus rings and semantic controls are part of the core system.
5. **Reference, then transform.** Study strong products and interaction patterns, extract principles, and adapt them to the local design language rather than cloning screens.
6. **Own the composition layer.** External component sources should be selectively adapted to the Design Deck tokens and interaction rules.

## Reference workflow

Public design references such as Awwwards, Behance, Land-book and accessible product pages can be researched as needed; you do **not** have to manually browse every site for every screen. For paywalled or logged-in references such as specific Mobbin flows, provide the relevant link or screenshot when you want that exact private view analyzed.

See `docs/REFERENCE_WORKFLOW.md` and `docs/COMPONENT_SOURCES.md` for the integration model for Mobbin, Land-book, Refero, SaaSFrame, Aceternity UI, Magic UI, React Bits and 21st.dev.

## Repository role

Treat this repository as the **design engine** shared by future products. New projects can copy individual components, consume the system as a source package, or use it as the visual baseline when implementing a Figma design.
