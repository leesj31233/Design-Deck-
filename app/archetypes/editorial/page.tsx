import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EditorialPortfolio } from "@/components/editorial/editorial-portfolio";
export default function Page(){return <main className="mx-auto min-h-screen max-w-[1500px] px-3 py-4 md:px-5"><Link href="/archetypes" className="mb-4 inline-flex items-center gap-2 px-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-3.5"/>Archetypes</Link><EditorialPortfolio/></main>}
