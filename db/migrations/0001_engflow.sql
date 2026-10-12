-- EngFlow schema v1 (mirrors engflow/server/db/schema.ts)
CREATE TABLE IF NOT EXISTS engflow_learners (
  id text PRIMARY KEY,
  profile jsonb NOT NULL,
  settings jsonb NOT NULL,
  daily jsonb NOT NULL DEFAULT '{}'::jsonb,
  seen jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS engflow_attempts (
  learner_id text NOT NULL REFERENCES engflow_learners(id) ON DELETE CASCADE,
  id text NOT NULL,
  at bigint NOT NULL,
  question_id text NOT NULL,
  mode text NOT NULL,
  context text NOT NULL,
  answer text NOT NULL,
  overall integer NOT NULL,
  grade integer NOT NULL,
  hint integer NOT NULL,
  response_ms integer NOT NULL,
  evaluator text NOT NULL,
  skipped boolean NOT NULL DEFAULT false,
  review_item_id text,
  data jsonb NOT NULL,
  PRIMARY KEY (learner_id, id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS engflow_attempts_learner_at ON engflow_attempts (learner_id, at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS engflow_review_items (
  learner_id text NOT NULL REFERENCES engflow_learners(id) ON DELETE CASCADE,
  id text NOT NULL,
  skill text NOT NULL,
  origin text NOT NULL,
  due bigint NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (learner_id, id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS engflow_review_items_due ON engflow_review_items (learner_id, due);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS engflow_skill_mastery (
  learner_id text NOT NULL REFERENCES engflow_learners(id) ON DELETE CASCADE,
  skill text NOT NULL,
  status text NOT NULL,
  mastery real NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (learner_id, skill)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS engflow_mistakes (
  learner_id text NOT NULL REFERENCES engflow_learners(id) ON DELETE CASCADE,
  id text NOT NULL,
  skill text NOT NULL,
  category text NOT NULL,
  count integer NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (learner_id, id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS engflow_diagnostics (
  learner_id text NOT NULL REFERENCES engflow_learners(id) ON DELETE CASCADE,
  id text NOT NULL,
  at bigint NOT NULL,
  cefr_low text NOT NULL,
  cefr_high text NOT NULL,
  cefr_point text NOT NULL,
  confidence text NOT NULL,
  theta real NOT NULL,
  sd real NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (learner_id, id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS engflow_generated_questions (
  learner_id text NOT NULL REFERENCES engflow_learners(id) ON DELETE CASCADE,
  id text NOT NULL,
  skill text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS engflow_ai_evaluations (
  id text PRIMARY KEY,
  learner_id text NOT NULL,
  question_id text NOT NULL,
  answer text NOT NULL,
  model text NOT NULL,
  overall integer,
  latency_ms integer NOT NULL,
  ok boolean NOT NULL,
  error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS engflow_ai_evaluations_learner ON engflow_ai_evaluations (learner_id, created_at);
