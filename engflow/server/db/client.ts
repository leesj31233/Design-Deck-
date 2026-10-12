import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * Database access. DATABASE_URL → PostgreSQL (e.g. Supabase, Neon, RDS).
 * Without it, local development uses PGlite (real PostgreSQL compiled to WASM)
 * persisted in .data/pglite. ENGFLOW_DB=none disables server persistence and
 * the app falls back to its labeled browser-only demo mode.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any>;
export type DbKind = "postgres" | "pglite" | "none";

export interface DbHandle {
  db: Db;
  kind: Exclude<DbKind, "none">;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export function configuredDbKind(): DbKind {
  if (process.env.ENGFLOW_DB === "none") return "none";
  if (process.env.DATABASE_URL) return "postgres";
  if (process.env.ENGFLOW_DB === "pglite" || process.env.NODE_ENV !== "production") return "pglite";
  return "none";
}

export async function openPostgres(url: string): Promise<DbHandle> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const sql = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
  return {
    db: drizzle(sql) as unknown as Db,
    kind: "postgres",
    exec: async (text) => {
      await sql.unsafe(text);
    },
    close: () => sql.end(),
  };
}

/** PGlite on disk (dataDir) or in memory (undefined) — the latter is used by tests. */
export async function openPglite(dataDir?: string): Promise<DbHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  return {
    db: drizzle(pg) as unknown as Db,
    kind: "pglite",
    exec: async (text) => {
      await pg.exec(text);
    },
    close: () => pg.close(),
  };
}

export function migrationsDir(): string {
  return process.env.ENGFLOW_MIGRATIONS_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "db", "migrations");
}

/** Apply db/migrations/*.sql in order, once each. */
export async function migrate(h: DbHandle, dir = migrationsDir()): Promise<string[]> {
  await h.exec("CREATE TABLE IF NOT EXISTS engflow_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const { sql } = await import("drizzle-orm");
  const rows = (await h.db.execute(sql`SELECT id FROM engflow_migrations`)) as unknown as { rows?: { id: string }[] } | { id: string }[];
  const list = Array.isArray(rows) ? rows : rows.rows ?? [];
  const done = new Set(list.map((r) => r.id));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const id = file.replace(/\.sql$/, "");
    if (done.has(id)) continue;
    const text = readFileSync(path.join(dir, file), "utf8");
    for (const stmt of text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) await h.exec(stmt);
    await h.db.execute(sql`INSERT INTO engflow_migrations (id) VALUES (${id})`);
    applied.push(id);
  }
  return applied;
}

let shared: Promise<DbHandle | null> | null = null;

/** Process-wide handle (migrated on first use). */
export function getDb(): Promise<DbHandle | null> {
  if (!shared) {
    shared = (async () => {
      const kind = configuredDbKind();
      if (kind === "none") return null;
      const h = kind === "postgres" ? await openPostgres(process.env.DATABASE_URL!) : await openPglite(process.env.ENGFLOW_PGLITE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "pglite"));
      await migrate(h);
      return h;
    })().catch((e) => {
      console.error("EngFlow database unavailable:", e);
      shared = null;
      return null;
    });
  }
  return shared;
}
