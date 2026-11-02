import Link from "next/link";
import { ArrowUpRight, BookOpen, Boxes, Gauge, Images, Network, Sparkles, WandSparkles } from "lucide-react";
import { archetypes } from "@/lib/archetypes";

const icons = {
  knowledge: BookOpen,
  engineering: Gauge,
  editorial: Images,
  motion: Sparkles,
};

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 md:px-8 md:py-12">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-[14px] bg-[var(--foreground)] text-[var(--background)] shadow-sm">
            <WandSparkles className="size-[18px]" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[-.025em]">Design Deck</div>
            <div className="text-[10px] text-[var(--muted)]">Professional design archetype system</div>
          </div>
        </div>
        <Link href="/archetypes" className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-xs font-medium shadow-sm">
          Explore all <ArrowUpRight className="size-3.5" />
        </Link>
      </header>

      <section className="grid min-h-[520px] items-end gap-10 py-16 lg:grid-cols-[1.15fr_.85fr] lg:py-24">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted)]">One shared engine · multiple visual languages</div>
          <h1 className="mt-5 max-w-4xl text-[clamp(3.5rem,8vw,8rem)] font-semibold leading-[.86] tracking-[-.075em]">
            Design for the <span className="text-[var(--muted)]">work itself.</span>
          </h1>
        </div>
        <div className="pb-2 lg:pb-4">
          <p className="max-w-md text-sm leading-7 text-[var(--muted)]">
            Design Deck separates research, engineering, editorial photography and motion UI into distinct archetypes instead of forcing every product into one generic SaaS look.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {['Radix semantics','Motion','XYFlow','Tailwind','Next.js','shadcn-compatible'].map(item => (
              <span key={item} className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[10px] font-medium text-[var(--muted)] backdrop-blur-xl">{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {archetypes.map((archetype, index) => {
          const Icon = icons[archetype.id];
          return (
            <Link key={archetype.id} href={archetype.href} className="dd-glass group relative min-h-72 overflow-hidden rounded-[24px] p-6 transition hover:-translate-y-1 md:p-8">
              <div className="flex items-start justify-between">
                <div className="grid size-11 place-items-center rounded-2xl bg-[var(--foreground)] text-[var(--background)]"><Icon className="size-5" /></div>
                <div className="font-mono text-[10px] text-[var(--muted)]">0{index + 1}</div>
              </div>
              <div className="mt-16 max-w-lg">
                <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">{archetype.eyebrow}</div>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-.045em]">{archetype.name}</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{archetype.description}</p>
              </div>
              <ArrowUpRight className="absolute bottom-7 right-7 size-5 text-[var(--muted)] transition duration-200 group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-[var(--foreground)]" />
            </Link>
          );
        })}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="dd-glass rounded-[22px] p-6"><Boxes className="size-5 text-[var(--muted)]"/><div className="mt-8 text-2xl font-semibold tracking-[-.04em]">30+ shared components</div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Accessible primitives and product-specific controls remain reusable across archetypes.</p></div>
        <div className="dd-glass rounded-[22px] p-6"><Network className="size-5 text-[var(--muted)]"/><div className="mt-8 text-2xl font-semibold tracking-[-.04em]">Benchmark → principle</div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Strong references are studied for hierarchy, motion, density and interaction—not copied as branded screens.</p></div>
        <div className="dd-glass rounded-[22px] p-6"><Sparkles className="size-5 text-[var(--muted)]"/><div className="mt-8 text-2xl font-semibold tracking-[-.04em]">Project-specific layers</div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Aceternity, Magic UI, React Bits, Motion Primitives and community components stay selective rather than polluting the core.</p></div>
      </section>
    </main>
  );
}
