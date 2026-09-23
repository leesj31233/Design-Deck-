import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EngineeringConsole } from "@/components/engineering/engineering-console";
export default function Page(){return <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-6 md:px-8"><Link href="/archetypes" className="mb-5 inline-flex items-center gap-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft className="size-3.5"/>Archetypes</Link><EngineeringConsole/></main>}
