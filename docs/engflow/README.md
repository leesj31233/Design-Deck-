# EngFlow — Engineering English, Built for Real Meetings

EngFlow helps Korean process and R&D engineers say clear, correct English in international engineering meetings. It practises full meeting sentences built from English-order meaning chunks, drills one grammar pattern at a time, schedules reviews of each mistake with new sentences, and estimates the learner's written-English level with an adaptive, CEFR-aligned test.

It is built on Design Deck (tokens, primitives, motion rules) and runs in two places from one codebase:

| Target | Where | Storage | Answer evaluation |
| --- | --- | --- | --- |
| **claude.ai artifact** | iPhone, iPad, desktop browser, Claude apps | The viewer's private `db` subtree (`data/users/<id>/…`), synced across their devices; local cache offline | Claude through `claude.use("sample")` on the viewer's own account, after the rule-based result |
| **Next.js web app** (`/engflow`) | Any host that runs Next.js | PostgreSQL (`DATABASE_URL`), or embedded PGlite in development | Claude on the server (`ANTHROPIC_API_KEY`), after the rule-based result |

If neither storage nor AI is configured, the app still works. It runs a labeled browser-only demo with the rule-based evaluator, and Settings says exactly where data lives and how answers are scored.

## Run it

```bash
npm install
npm run dev                 # http://localhost:3000/engflow  (Design Deck showcase stays at /)
npm run build:artifact      # dist/artifact/engflow.html — the single-file artifact page
npm run db:seed             # create a demo learner (imported mistakes) and print its sync key
npm run dev:artifact        # Vite dev server for the same app outside Next.js
```

Copy `.env.example` to `.env.local` to enable PostgreSQL and server-side Claude:

- `DATABASE_URL`: any PostgreSQL. Migrations in `db/migrations/*.sql` run automatically on first use.
- `ANTHROPIC_API_KEY`: the key stays on the server. The default model is `claude-opus-5-5`; override it with `ENGFLOW_MODEL`. Requests use server-side refusal fallbacks.

The web app identifies a learner by a random sync key stored in the browser; the server stores only its SHA-256 hash, and every row is scoped to it. To continue on another device, copy the key from Settings. Production multi-user deployments should put real authentication (for example Supabase Auth) in front of this.

## Checks

```bash
npm run typecheck
npm run content:check       # QC for every question, probe, diagnostic item and guide entry
npm test                    # Vitest: evaluator, FSRS, mastery, sessions, diagnostic, AI contract, PostgreSQL (PGlite), artifact sync
npm run test:e2e            # Playwright on the built app at iPhone, iPad and desktop sizes
```

## Architecture

```
engflow/
  core/        pure TypeScript domain logic (no React, no I/O)
    text, pattern, lexicon, rules, align, evaluate   rule-based evaluator
    fsrs, scheduler, mastery, session, store         learner model and spaced repetition
    diagnostic                                       adaptive CEFR estimate
    schema, validate, ai                             zod schemas, question QC, Claude prompts + response validation
  content/     curated curriculum (skills, banks, review variations, diagnostic items, grammar guide, CEFR/TOEIC reference)
  platform/    storage + AI adapters: artifact (claude.use), web (Next.js API), local
  ui/          React app shared by both targets (Design Deck components and tokens)
  server/      Next.js server modules: Claude client, Drizzle schema, repository, HTTP helpers
  artifact/    Vite single-file build entry
app/engflow, app/api/engflow/*   Next.js route and API (status, state, evaluate, explain, generate)
db/migrations                    SQL migrations (PostgreSQL)
```

### Evaluation

Each answer is evaluated immediately and offline. If Claude is available, it re-evaluates the answer with the same rubric.

1. **Meaning units.** Lenient patterns check each Korean meaning chunk. Grammar mistakes do not hide meaning.
2. **Question pitfalls.** Curated patterns catch known Korean-speaker mistakes for that item and carry the best explanation.
3. **Grammar rules.** 20 context-checked rule groups, each firing only when the word class is known: missing *be* in the progressive, *wait* without *for*, *before* + base verb, modal + *to*, agreement, *will* in if/when clauses, uncountable plurals, a/an, irregular past forms, third-conditional *will have*, and more.
4. **Alignment.** The answer is aligned against the closest correct answer, sentence by sentence for long answers. A difference counts as an error only when it sits next to shared words, it is not part of a rephrased phrase, and every equally close correct answer agrees.
5. **Rubric.** Full sentences are scored on meaning 30%, grammar 30%, terminology 20%, and organization and naturalness 20%. Phrase quizzes are scored on meaning 50% and form 50%. Comprehensibility in an international meeting is reported separately. Each error is charged to exactly one score, and spelling slips cost little.
6. **Minimal correction.** Only the detected errors are fixed, so the learner's own words are kept. A correction is rejected if it breaks a rule or moves away from every correct answer.

The rule-based result reports its own confidence. When the learner paraphrases far from every reference, it says so and recommends the Claude review. Claude's output must pass a zod schema. Its quoted error spans must exist in the answer. Scores are recomputed from the rubric, and curated pitfalls are kept. If any of this fails, the rule-based result stays on screen.

### Review scheduling and mastery

- A new error triggers an immediate retry in the same session, using a different sentence for the same grammar. It then follows the onboarding ladder of 1 → 3 → 7 → 14 → 30 days.
- After two successful reviews, FSRS-5 sets the interval for 90% recall. Grades come from the score, error severity, hint level and response time. Every scheduling decision is explained in the UI.
- Reviews climb a variation ladder: level 0 is near the original, level 1 a new short context, level 2 a longer sentence, and level 3 a full meeting response. The original question and the last two questions served are never repeated.
- Sessions mix about 70% new learning with 30% review. The review share rises toward 70% when overdue reviews pile up. Weak skills that have not been practised for 7 days are always included.
- A skill is **mastered** only after three independent successes, on at least two different days, with at least two different questions, including one success six or more days later, and with mastery of 0.85 or higher. Hints reduce the evidence (1 → 0.75 → 0.5 → 0.25 → 0).
- The seven historical mistakes are imported as *imported* records. They seed the review queue and the notebook but never count as evidence.

### Level test

The test uses 5 parts: grammar and construction, phrase translation, full sentences, meeting responses, and scenario explanations. A standard test has 17 items and an extended test has 27. A grid posterior over θ uses a partial-credit logistic model and picks the item nearest the current estimate. The result is a CEFR **range** (±1 SD) with a confidence level, sub-scores, written response speed, strengths and weaknesses, and a study plan. Speaking is not implemented, so the result is labeled *Written Production / Meeting English Estimate*.

The TOEIC Speaking panel shows the ETS **minimum scores** per CEFR level (Speaking A1 50, A2 90, B1 120, B2 160, C1 180; Writing A1 30, A2 70, B1 120, B2 150, C1 180) and the Korean score-report labels. It is clearly marked as a contextual, non-official comparison. These figures were collected from search excerpts of ETS and YBM pages, because the build environment could not open those hosts. **Check them against the official PDFs linked in the app before relying on them.**

## Content

| Bank | Items |
| --- | --- |
| Full-sentence construction (Mode A) | 48 |
| Phrase & structure quiz (Mode B) | 75 |
| Review variation ladders (7 imported mistakes × 4 levels × 2) | 56 |
| Diagnostic items | 40 |
| Grammar guide entries | 30 (one per skill) |
| QC probes (expected pass/fail answers) | 614 |

See [CONTENT_AUTHORING.md](./CONTENT_AUTHORING.md) for the authoring rules, the pattern syntax and the QC contract.

## Known limitations

- The rule-based evaluator is precise on the patterns it knows, but it can miss new kinds of errors in free paraphrases. It flags this with low confidence, and the Claude review covers it.
- Speaking (recording, transcription, pronunciation) is not implemented.
- The web app's sync key is device-held identity, not authentication.
- The TOEIC Speaking figures need manual verification against ETS/YBM (see above).
