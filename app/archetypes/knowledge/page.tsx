import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { KnowledgeWorkspace } from "@/components/knowledge/knowledge-workspace";
export default function Page(){return <main className="mx-auto min-h-screen max-w-[1720px] px-4 py-5 md:px-6"><Link href="/archetypes" className="mb-4 inline-flex items-center gap-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-3.5"/>Archetypes</Link><KnowledgeWorkspace/></main>}
