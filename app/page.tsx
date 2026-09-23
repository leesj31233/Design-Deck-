import { ArrowRight, Layers3, Sparkles, WandSparkles } from "lucide-react";

const sources = [
  "Mobbin",
  "Land-book",
  "Refero",
  "SaaSFrame",
  "Awwwards",
  "Behance",
];

const libraries = [
  "shadcn/ui",
  "Aceternity UI",
  "Magic UI",
  "React Bits",
  "21st.dev",
];

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <nav className="glass mb-16 flex items-center justify-between rounded-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-white text-black">
              <Layers3 className="size-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">Design Deck</div>
              <div className="text-xs text-white/50">Premium UI foundation</div>
            </div>
          </div>
          <div className="hidden gap-6 text-sm text-white/60 sm:flex">
            <a href="#references">References</a>
            <a href="#components">Components</a>
          </div>
        </nav>

        <section className="grid gap-10 py-14 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 backdrop-blur-xl">
              <Sparkles className="size-3.5" />
              Research → Design System → Production UI
            </div>
            <h1 className="text-balance max-w-4xl text-5xl font-semibold tracking-[-0.05em] sm:text-6xl lg:text-7xl">
              A reusable design intelligence deck for polished products.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/58 sm:text-lg">
              Collect world-class references, extract design principles, compose premium interaction patterns, and ship them as maintainable React interfaces.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black" href="#components">
                Explore stack <ArrowRight className="size-4" />
              </a>
              <a className="glass rounded-xl px-4 py-2.5 text-sm text-white/80" href="#references">
                Open reference workflow
              </a>
            </div>
          </div>

          <div className="glass relative overflow-hidden rounded-[28px] p-5">
            <div className="absolute -right-16 -top-16 size-52 rounded-full bg-violet-400/20 blur-3xl" />
            <div className="absolute -bottom-20 -left-12 size-56 rounded-full bg-blue-400/20 blur-3xl" />
            <div className="relative space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="mb-7 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.18em] text-white/40">Design signal</span>
                  <WandSparkles className="size-4 text-white/50" />
                </div>
                <div className="text-3xl font-medium tracking-tight">Glass, editorial clarity, restrained motion.</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                  <div className="text-xs text-white/40">Reference pool</div>
                  <div className="mt-2 text-2xl font-medium">6 sources</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                  <div className="text-xs text-white/40">UI sources</div>
                  <div className="mt-2 text-2xl font-medium">5 libraries</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="references" className="py-16">
          <div className="mb-6">
            <div className="text-sm text-white/40">01 / REFERENCE INTELLIGENCE</div>
            <h2 className="mt-2 text-3xl font-medium tracking-tight">Reference pool</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((item) => (
              <div key={item} className="glass rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-1">
                <div className="text-sm text-white/45">Curated source</div>
                <div className="mt-6 text-xl font-medium">{item}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="components" className="py-16">
          <div className="mb-6">
            <div className="text-sm text-white/40">02 / COMPONENT POOL</div>
            <h2 className="mt-2 text-3xl font-medium tracking-tight">Production-ready UI sources</h2>
          </div>
          <div className="glass overflow-hidden rounded-3xl">
            {libraries.map((item, index) => (
              <div key={item} className="flex items-center justify-between border-b border-white/10 px-5 py-5 last:border-0 sm:px-7">
                <div className="flex items-center gap-4">
                  <span className="text-xs tabular-nums text-white/30">0{index + 1}</span>
                  <span className="font-medium">{item}</span>
                </div>
                <span className="text-xs text-white/35">source / adapt / compose</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
