/**
 * Seeds the configured database (DATABASE_URL, else .data/pglite) with a demo
 * learner that holds the seven imported historical mistakes. Prints the sync
 * key to paste into EngFlow → Settings → 동기화 키.
 *
 *   npx tsx scripts/db-seed.ts
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import { migrate, openPglite, openPostgres } from "../engflow/server/db/client";
import { applySync, learnerIdFromKey, syncSchema } from "../engflow/server/repo";
import { createInitialState } from "../engflow/core/store";

const h = process.env.DATABASE_URL ? await openPostgres(process.env.DATABASE_URL) : await openPglite(process.env.ENGFLOW_PGLITE_DIR || path.join(process.cwd(), ".data", "pglite"));
const applied = await migrate(h);
const key = randomBytes(24).toString("hex");
const s = createInitialState(Date.now());
await applySync(
  h.db,
  learnerIdFromKey(key)!,
  syncSchema.parse({
    core: { profile: s.profile, settings: s.settings, daily: s.daily, seen: s.seen, updatedAt: s.updatedAt },
    items: Object.values(s.items),
    mistakes: Object.values(s.mistakes),
    skills: Object.values(s.skills),
  }),
);
console.log(`database: ${h.kind}${applied.length ? ` (applied ${applied.join(", ")})` : ""}`);
console.log(`demo learner sync key: ${key}`);
await h.close();
