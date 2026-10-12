import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";

/**
 * EngFlow persistence (PostgreSQL). Queryable columns are explicit; the full
 * domain object is kept in `data` so the schema stays stable as the learner
 * model evolves. Every row is scoped by learner_id (data isolation).
 */

export const learners = pgTable("engflow_learners", {
  id: text("id").primaryKey(), // sha256 of the learner's sync key
  profile: jsonb("profile").notNull(),
  settings: jsonb("settings").notNull(),
  daily: jsonb("daily").notNull().default({}),
  seen: jsonb("seen").notNull().default({}),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const attempts = pgTable(
  "engflow_attempts",
  {
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    at: bigint("at", { mode: "number" }).notNull(),
    questionId: text("question_id").notNull(),
    mode: text("mode").notNull(),
    context: text("context").notNull(),
    answer: text("answer").notNull(),
    overall: integer("overall").notNull(),
    grade: integer("grade").notNull(),
    hint: integer("hint").notNull(),
    responseMs: integer("response_ms").notNull(),
    evaluator: text("evaluator").notNull(),
    skipped: boolean("skipped").notNull().default(false),
    reviewItemId: text("review_item_id"),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.id] }), index("engflow_attempts_learner_at").on(t.learnerId, t.at)],
);

export const reviewItems = pgTable(
  "engflow_review_items",
  {
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    skill: text("skill").notNull(),
    origin: text("origin").notNull(),
    due: bigint("due", { mode: "number" }).notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.id] }), index("engflow_review_items_due").on(t.learnerId, t.due)],
);

export const skillMastery = pgTable(
  "engflow_skill_mastery",
  {
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    skill: text("skill").notNull(),
    status: text("status").notNull(),
    mastery: real("mastery").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.skill] })],
);

export const mistakes = pgTable(
  "engflow_mistakes",
  {
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    skill: text("skill").notNull(),
    category: text("category").notNull(),
    count: integer("count").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.id] })],
);

export const diagnostics = pgTable(
  "engflow_diagnostics",
  {
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    at: bigint("at", { mode: "number" }).notNull(),
    cefrLow: text("cefr_low").notNull(),
    cefrHigh: text("cefr_high").notNull(),
    cefrPoint: text("cefr_point").notNull(),
    confidence: text("confidence").notNull(),
    theta: real("theta").notNull(),
    sd: real("sd").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.id] })],
);

export const grammarWeak = pgTable(
  "engflow_grammar_weak",
  {
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    skill: text("skill").notNull(),
    category: text("category").notNull(),
    count: integer("count").notNull(),
    strength: real("strength").notNull(),
    lastAt: bigint("last_at", { mode: "number" }).notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.id] }), index("engflow_grammar_weak_strength").on(t.learnerId, t.strength)],
);

export const generatedQuestions = pgTable(
  "engflow_generated_questions",
  {
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    skill: text("skill").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.id] })],
);

/** Audit log of AI evaluations performed by the server (for quality review). */
export const aiEvaluations = pgTable(
  "engflow_ai_evaluations",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    questionId: text("question_id").notNull(),
    answer: text("answer").notNull(),
    model: text("model").notNull(),
    overall: integer("overall"),
    latencyMs: integer("latency_ms").notNull(),
    ok: boolean("ok").notNull(),
    error: text("error"),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("engflow_ai_evaluations_learner").on(t.learnerId, t.createdAt)],
);
