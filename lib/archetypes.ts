export const archetypes = [
  {
    id: "knowledge",
    name: "Knowledge Vault",
    eyebrow: "Obsidian-class research workspace",
    description: "Linked notes, graph relationships, backlinks, canvas thinking and dense long-form writing.",
    href: "/archetypes/knowledge",
    principles: ["local-first feeling", "bidirectional context", "keyboard-first navigation", "low visual fatigue"]
  },
  {
    id: "engineering",
    name: "Engineering Console",
    eyebrow: "Operational / process engineering UI",
    description: "Process status, alarms, trends, equipment cards, unit-safe values and shift/event timelines.",
    href: "/archetypes/engineering",
    principles: ["status before decoration", "units always visible", "alarm hierarchy", "dense but scannable"]
  },
  {
    id: "editorial",
    name: "Editorial Portfolio",
    eyebrow: "Photography / magazine / art direction",
    description: "Image-first portfolios, photographer stories, magazine pacing, contact sheets and restrained typography.",
    href: "/archetypes/editorial",
    principles: ["image is the hero", "editorial rhythm", "asymmetric whitespace", "quiet navigation"]
  },
  {
    id: "motion",
    name: "Motion Lab",
    eyebrow: "Dynamic icons & micro-interactions",
    description: "Animated icon buttons, morphing actions, status controls and motion patterns built for product UI.",
    href: "/archetypes/motion",
    principles: ["motion explains state", "fast response", "reduced-motion safe", "no perpetual distraction"]
  }
] as const;
