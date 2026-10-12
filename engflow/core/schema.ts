import { z } from "zod";

/** Runtime schemas: validate curated content, AI-generated questions and AI evaluations. */

export const cefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export const categorySchema = z.enum(["process", "pilot", "meeting", "collab", "operation", "business"]);
export const errorCategorySchema = z.enum([
  "be-verb", "verb-form", "tense", "agreement", "preposition", "article", "word-order", "word-choice",
  "missing-content", "meaning-shift", "terminology", "spelling", "sentence-structure", "countability",
]);
export const severitySchema = z.enum(["minor", "major", "critical"]);
export const bucketSchema = z.enum(["meaning", "grammar", "terminology", "organization"]);

export const meaningUnitSchema = z.object({
  id: z.string().min(1),
  en: z.string().min(1),
  ko: z.string().min(1),
  any: z.array(z.string().min(1)).min(1),
  weight: z.number().positive().max(5).optional(),
  term: z.boolean().optional(),
  critical: z.boolean().optional(),
});

export const pitfallSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  category: errorCategorySchema,
  severity: severitySchema,
  bucket: bucketSchema.optional(),
  fix: z.string(),
  messageKo: z.string().min(1),
  skill: z.string().optional(),
});

export const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  mode: z.enum(["sentence", "phrase"]),
  category: categorySchema,
  topic: z.string().min(1),
  topicKo: z.string().min(1),
  level: cefrSchema,
  difficulty: z.number().int().min(1).max(10),
  skills: z.array(z.string().min(1)).min(1),
  contextKo: z.string().optional(),
  promptKo: z.string().min(1),
  segments: z.array(z.string().min(1)).min(1),
  reference: z.string().min(1),
  accepted: z.array(z.string().min(1)),
  advanced: z.string().optional(),
  meaning: z.array(meaningUnitSchema).min(1),
  pitfalls: z.array(pitfallSchema).optional(),
  hints: z.object({ pattern: z.string().min(1), skeleton: z.string().min(1), partial: z.string().min(1) }),
  explanationKo: z.string().min(1),
  variation: z.object({ seed: z.string(), level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]) }).optional(),
  source: z.enum(["curated", "generated"]).optional(),
  probes: z.array(z.object({ answer: z.string().min(1), expect: z.enum(["pass", "fail"]) })).optional(),
});

/**
 * What Claude returns for an evaluation — deliberately small so grading is fast.
 * Grammar and structure scores are NOT taken from the model: they are computed
 * from the listed errors with the same penalty table as the rule-based grader.
 */
export const aiEvaluationSchema = z.object({
  /** Is the message conveyed? Site-specific word choice does not lower it. */
  meaning: z.number().min(0).max(100),
  /** How easily an international engineering meeting would understand it. */
  comprehensibility: z.number().min(0).max(100),
  errors: z
    .array(
      z.object({
        /** Exact substring of the learner answer ("" for a missing word). */
        span: z.string(),
        /** For a missing word: the learner word it should be inserted before ("" = at the end). */
        insertBefore: z.string().optional(),
        fix: z.string(),
        category: errorCategorySchema,
        severity: severitySchema,
        explanationKo: z.string().min(1),
        skill: z.string().optional(),
      }),
    )
    .max(10),
  corrected: z.string().min(1),
  /** How native-speaking engineers most commonly say it in a meeting. */
  recommended: z.string().min(1),
  alternatives: z.array(z.string()).max(3),
  summaryKo: z.string().min(1),
  grammarKo: z.string().min(1),
});

export type AIEvaluationPayload = z.infer<typeof aiEvaluationSchema>;
export type QuestionPayload = z.infer<typeof questionSchema>;
