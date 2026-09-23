# Component Sources

Design Deck is intentionally built as a **composition layer** instead of vendoring entire third-party libraries.

## shadcn/ui

The repository includes `components.json` and `lib/utils.ts`, so shadcn components can be added directly with the shadcn CLI. Keep generated primitives under `components/ui/`.

## Aceternity UI

Use for high-impact landing sections, hero treatments, spotlight effects, advanced cards, text effects and selective motion. Bring in only the components needed for a product and adapt them to this repository's tokens.

Recommended destination: `components/aceternity/`.

## Magic UI

Use for lightweight animated SaaS/product blocks and micro-interactions. Prefer small, composable pieces over large page templates.

Recommended destination: `components/magic/`.

## React Bits

Use for expressive text effects, backgrounds, cursors, interactive surfaces and experimental visual moments. Keep these effects away from dense productivity surfaces unless they improve comprehension.

Recommended destination: `components/react-bits/`.

## 21st.dev

Treat 21st.dev as a discovery/registry layer. Select strong components, inspect their dependencies and license/source information, then adapt the chosen code to the local design system.

Recommended destination: `components/community/`.

## Design rule

Do not combine every effect on one screen. The default product language should stay restrained: strong hierarchy, generous spacing, clear typography, subtle glass/material depth, and motion used only where it communicates state or hierarchy.
