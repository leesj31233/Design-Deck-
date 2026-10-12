import type { Config } from "drizzle-kit";

/** drizzle-kit is optional: db/migrations/*.sql is the source of truth applied at startup. */
export default {
  schema: "./engflow/server/db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
} satisfies Config;
