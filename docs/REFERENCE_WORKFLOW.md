# Reference Workflow

Design Deck separates **reference research** from **implementation**.

## Reference sources

- Mobbin — real app screens and flows
- Land-book — polished landing pages and web directions
- Refero — product/UI references and flow research
- SaaSFrame — SaaS/product patterns
- Awwwards — experimental and high-craft web experiences
- Behance — visual systems, editorial layouts, identity, motion concepts

## How to use them with ChatGPT

You do **not** need to manually browse every source for every task.

1. For public pages, ask ChatGPT to search for a specific pattern, e.g. `AI research workspace sidebar`, `premium PDF reader`, or `Apple-like scientific dashboard`.
2. For login-only or paid references such as some Mobbin flows, paste the URL or upload screenshots.
3. Ask for analysis by: information architecture, typography, spacing, hierarchy, material, motion, navigation, density, accessibility, and responsive behavior.
4. Convert the extracted principles into a new product-specific system rather than copying one design verbatim.
5. Save reusable decisions in this repo under `docs/` and reusable implementation under `components/`.

## Recommended prompt

> Analyze these references as design evidence, not as templates to clone. Extract the strongest principles in information architecture, visual hierarchy, spacing, typography, material, interaction, navigation and motion. Re-compose them into an original design system suitable for this product, then express the result as Figma-ready tokens and React/Tailwind component specifications.

## Research product workflow

Reference sources → ChatGPT analysis → Figma system → Design Deck components → GitHub → Vercel/Railway
