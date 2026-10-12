-- Frequent grammar mistakes per learner (skill × error type), with decaying strength.
CREATE TABLE IF NOT EXISTS engflow_grammar_weak (
  learner_id text NOT NULL REFERENCES engflow_learners(id) ON DELETE CASCADE,
  id text NOT NULL,
  skill text NOT NULL,
  category text NOT NULL,
  count integer NOT NULL,
  strength real NOT NULL,
  last_at bigint NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (learner_id, id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS engflow_grammar_weak_strength ON engflow_grammar_weak (learner_id, strength);
