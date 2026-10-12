import { aiAvailable, aiModel } from "@/engflow/server/claude";
import { getDb } from "@/engflow/server/db/client";
import { json } from "@/engflow/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  return json({ ai: { available: aiAvailable(), model: aiAvailable() ? aiModel() : null }, db: { kind: db?.kind ?? "none" } });
}
