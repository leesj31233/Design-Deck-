# EngFlow — Engineering English, Built for Real Meetings

EngFlow helps Korean process and R&D engineers say clear, correct English in international online meetings and business conversations. Most practice is a turn in a conversation: a colleague says something, and the learner writes what they want to say in the phrasing native speakers commonly use. Eleven scenes each run at difficulty 1–10, from one-line replies (*Sounds good.*) to long, diplomatic turns:

- running an online meeting, presenting, meeting discussion
- quick replies, greetings and small talk, meals
- calls and messages, negotiation, problems and apologies
- business trips, technical discussion

Role-plays carry one conversation over several turns. A "short to long" ladder climbs from one-line replies to multi-sentence explanations. EngFlow collects the expressions the learner keeps getting wrong into an expression notebook with a short study flow. It schedules reviews of each mistake with new sentences, celebrates progress, and estimates the learner's written-English level with an adaptive, CEFR-aligned test.

It is built on Design Deck (tokens, primitives, motion rules) and runs in two places from one codebase:

| Target | Where | Storage | Answer evaluation |
| --- | --- | --- | --- |
| **claude.ai artifact** | iPhone, iPad, desktop browser, Claude apps | The viewer's private `db` subtree (`data/users/<id>/…`), synced across their devices; local cache offline | One fast Claude grading pass through `claude.use("sample")` (quick tier) on the viewer's own account; rule-based if unavailable or slow |
| **Next.js web app** (`/engflow`) | Any host that runs Next.js | PostgreSQL (`DATABASE_URL`), or embedded PGlite in development | One fast Claude grading pass on the server (`ANTHROPIC_API_KEY`, `ENGFLOW_EVAL_MODEL`); rule-based if unavailable or slow |

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
- `ANTHROPIC_API_KEY`: the key stays on the server. Answer grading uses a fast model (`ENGFLOW_EVAL_MODEL`, default `claude-haiku-5-5`) because the learner waits for it; explanations and question generation use `ENGFLOW_MODEL` (default `claude-opus-5-5`). Requests use server-side refusal fallbacks.

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
app/engflow, app/api/engflow/*   Next.js route and API (status, state, evaluate, explain, generate, talk)
db/migrations                    SQL migrations (PostgreSQL)
```

### Evaluation

Each answer is graded **once** (`engflow/core/grader.ts`). Close answers are graded within about a second; answers worded very differently wait for Claude, because that is where the rule-based grader cannot be trusted:

- **Instant.** An exact match, or a close answer in which nothing but spelling differs, is graded by the rule-based grader at once (about 1 ms; 20 ms at worst on a laptop). Claude adds nothing there.
- **Graded while typing.** When the learner pauses on a fairly complete sentence (450 ms, or 150 ms after a final period), Claude starts grading that text in the background. Submitting the same text (a final period or extra spaces may differ) shows that grade at once. A question allows at most five background requests, and a newer one cancels the previous one.
- **Wait by trust ("auto", the default).** Otherwise Claude gets 1 second when the answer is close to an expected one. A partly reworded answer waits up to 2.5 seconds and a very different one up to 8 seconds. Once the device has five measured Claude response times, those two waits shrink to Claude's 90th/95th percentile plus a margin, so a fast connection never waits the full cap. The rule-based grader compares against expected answers, so it can miss errors in a sentence it has never seen (an iPhone test scored "This suggestion is not satisfy the requirements of customer." 100 under a flat 1-second cap). Settings also offers "always 1 second" and "accuracy first" (9 seconds). If Claude has not answered in time, the rule-based grade is shown and stays, so the score never jumps; a reworded answer graded only by rules is labelled "확인 못 함", never "정확해요", and never counts as an Easy review. The late reply still teaches the grader (an approved wording is remembered even after the learner moved on), and when it disagrees with the shown grade a short note says what Claude found.
- **Short replies.** Claude returns only the scores, the errors with one-sentence explanations and the minimal correction (empty when nothing is wrong); the question's curated reference is shown as the native phrasing. The app writes the verdict and grammar note from the error list, because reply length is what sets the wait.
- **Learns from Claude** (`core/learned.ts`). When Claude grades one of the learner's own wordings fully correct (95+, nothing to fix), the grader keeps it for that question (up to three). The same answer later, contractions and punctuation aside, is graded at once and labelled *Claude 확인한 내 표현*. A close variant is not marked down for a meaning chunk the approved wording also said in other words. Approved wordings never make a reworded answer count as "close", so a new mistake in them still waits for Claude. In the learning bench, repeating an approved wording went from 67% to 100% shown at once, with no new false alarm and no new wrong answer shown as fine.
- **Numbers** (`core/numbers.ts`, `core/numwords.ts`). Numbers are read in any spelling ("3" / "three", "twenty-five", "90,000", "15th", "two and a half", "5:30"), so "3 weeks" matches "three weeks" everywhere. A number that no correct answer has, where the closest one counts the same thing differently ("Line 5" for "Line 4", "twenty" for "thirty"), is a major meaning error with the right number in the correction; different units ("24 months" / "two years"), clock times ("17:00" / "5 pm") and ordinals ("for the third time" / "three times") are not compared. Number swaps caught: 89/90 in words and 40/40 in digits (54 and 28 before), with no false alarm on 228 digit↔word rewrites of correct answers.
- **Everyday synonyms.** Meaning chunks accept a small table of everyday synonyms (*cab* for *taxi*, *fantastic* for *great*, *issue* for *problem*, *glad* for *happy* …); mistake patterns and exact alternatives never use it.
- **Said, not typed.** Answers without punctuation (voice answers, quick typing) are graded like typed ones: "why don't we …" without "?" is a suggestion, "please don't hesitate" a request, "10 am" a time. Of 6,211 correct answers rewritten without any punctuation and in lower case, 5 are marked down (long run-ons).
- **Reversed meaning.** A close answer that adds or drops the verb's *not*/*never* ("We don't need to update the PFD" for "We need to update the PFD") is a major meaning error. Questions, reassuring commands (*Don't worry*), if-clauses and words that carry negation themselves (*unable*, *missed*, *broken*) are left to Claude; it fires on none of about 5,000 correct answers.

Each result shows how long grading took ("Claude 채점 · 0.4초"). Settings shows the device's average over the last 20 answers, how often Claude graded, and Claude's own median response time on this device (requests that finished after the cut-off are still timed).

**Scoring is grammar-centred** and identical for both graders: the score is computed from the error list with one penalty table.

| Part | Weight | What counts |
| --- | --- | --- |
| Grammar accuracy | 55% | Minor −10, major −30, critical −45 per error. Spelling −1 per slip, at most −3. |
| Key meaning & expressions | 35% | The message chunks and common meeting expressions (*run a simulation*, *wait for*). |
| Word order & structure | 10% | Word order, sentence structure, answers that are too short. |
| Site terminology | not scored | Plants name things differently (*raw* vs *feed composition*). A different term is shown as a suggestion only; the correction keeps the learner's word. |

Comprehensibility in an international meeting is reported separately. The recommended sentence is the phrasing native-speaking engineers most commonly use in meetings.

The rule-based grader works offline:

1. **Meaning units.** Lenient patterns check each Korean meaning chunk. A term slot counts only when the message cannot work without it.
2. **Question pitfalls.** Curated patterns catch known Korean-speaker mistakes for that item and carry the best explanation.
3. **Grammar rules.** About 120 context-checked rules for the mistakes Korean speakers make. They run one sentence at a time and need no reference answer, so they also protect reworded answers. On an independent corpus of 220 one-mistake sentences they flag 99% (90% before the second run's rules, which were developed on that corpus), with no false alarm on 220 tricky correct sentences. Examples: *is not satisfy*, *Is called japchae*, *I sorry*, *married with*, *suggest to stay*, *How your wife is doing?*, *Because …, so …*, *since 2015* with the present, *I'm interesting in*, *more high*, *a good news*. See [GRADER_BENCH.md](./GRADER_BENCH.md) for the measurements.
4. **Alignment.** The answer is aligned against the closest correct answer, sentence by sentence for long answers. A difference counts only when it sits next to shared words and is not part of a rephrased phrase. Another equally close correct answer can veto it only if it accepts the learner's word as it is. Common correct rewordings are recognized and not counted as errors:
   - *Is it possible…* / *Would it be possible…*
   - *I plan to* / *I'm planning to*
   - *before deciding* / *before we decide*
   - *turn your cameras on*
   - *decide on the date*
   - *(on that)*

   A different preposition or tense nuance is a note, not an error.
5. **Minimal correction.** Only the detected errors are fixed, so the learner's own words (including site terms) are kept. A correction is rejected if it breaks a rule or moves away from every correct answer.

Claude's output must pass a zod schema (small slips such as an unknown category name are tidied first). Its quoted error spans must exist in the answer, terminology notes become non-scoring suggestions, and curated pitfalls are kept.

### Scenes and difficulty

Every question belongs to a scene (`situation`): running an online meeting, presenting, meeting discussion, quick replies, greetings and small talk, everyday life and travel, office life, feelings and empathy, meals, calls and messaging, negotiating, problems and apologies, business trips and site visits, or technical discussion. Older questions derive it from their category. Conversation questions show 1–3 earlier lines as chat bubbles (translation on request) and the learner's turn as their own bubble. Every older question also has conversation context, added by id in `dialogue-overlay`.

Difficulty runs from 1 (a fixed 3–6 word expression) to 10 (a long, diplomatic turn). The learner sets it per scene on the Learn screen, and EngFlow remembers each scene's choice. An explicit difficulty keeps new questions within ±1, or ±2 when the bank is thin. Without a choice, the target comes from the level estimate. Mixed sessions cap each scene at about 30% of new questions, so everyday conversation is mixed in with engineering talk, and conversation turns rank first.

### Role-play, ladder and celebrations

- **Role-play** (`core/roleplay.ts`, `ui/roleplay.tsx`): 20 scenarios of 3–5 turns, at work and around work. Examples include a vendor kickoff, a bad connection, pilot results and a hard question, a discount request, a late report, airport pickup, dinner with a client, and paying the bill. From the second turn, the learner's own previous line (grammar-corrected and labelled as such) stays in the chat. The session ends with the whole conversation: the learner's lines with scores, the natural version under each, and *전체 듣기* to hear it all read aloud.
- **Short to long** (`core/ladder.ts`, `ui/ladder.tsx`): eight answers in one scene, climbing from difficulty 1 to two steps above the learner's level. The summary shows the staircase coloured by score and where the climb got hard. A missed step goes to review instead of an immediate retry.
- **Celebrations** (`core/celebration.ts`, `ui/celebrate.tsx`): each answer gets one moment, decided before it is recorded so it never changes.
  - 100 points sets off fireworks (rockets that burst into rings of sparks); 100 on a question never seen before (with the time when it was quick) and 100 on a long explanation (14+ words, six rockets) have their own lines
  - a streak in the session, the third clean answer in a row on the same sentence (*완전히 내 표현*), a short reply at conversation speed (*번개 같은 대답*), a weak point cleared, +10 on the best score, a comeback on the same grammar
  - today's goal reached, practice-day streaks (3, 7, 14, 30…), "N sentences you can say" milestones
  - a session without a single miss ends in fireworks
  - Chime, pops and vibration are optional, and the effects respect reduced motion.
- **Badges** (`core/badges.ts`, `ui/badges.tsx`): thirteen families with bronze, silver and gold tiers (100-point answers, practice-day streaks, sentences said at 85+, role-plays finished, perfect long sentences, quick replies, scenes, difficulty 8+, reviews, daily goals, wordings Claude approved, answers given, free-talk lines). Progress shows each medal with its progress to the next tier, and the session summary announces new ones. They are derived from the learning record, so they need no storage and sync with it.
- **Free talk with Claude** (`core/freetalk.ts`, `ui/freetalk.tsx`): an open conversation on one of 22 topics (a frozen video call, Friday plans, a dryer alarm call from the plant, a taxi in Jakarta traffic, cheering up a friend …); the chosen scene's topics come first. Claude plays the other person; after each line, one fast request returns a short grade of that line and the partner's next line. Each line gets the correction as a word diff, one Korean note per error, a more natural version with read-aloud, and a score; major grammar-rule findings are shown while typing and kept even if Claude leaves them out. After about six lines the talk closes with what to say next time.
- **Read aloud** (`ui/speech.tsx`): the colleague's lines and the recommended sentence can be read with the device's English voice (Web Speech; no permission needed). Auto-read and a slower speed are in Settings.
- **Answer by voice** (`ui/listen.tsx`): a microphone button in the answer box (⌥M) and in free talk uses the browser's speech recognition. The words appear as they are heard; with "send at once" in Settings the answer is graded (or sent to the free-talk partner) the moment the learner stops speaking. Where recognition is missing or the microphone is not allowed (some embedded views), the button does not appear.

### Expression notebook

Mistakes are gathered per grammar point and shown as the spoken expression (*has changed*, *It's too early to decide*), together with the learner's own wrong → right sentences, the number of times, and how recent they are. This includes the imported history. Opening an expression starts a four-step study flow:

1. **My mistakes.** Why the expression is confusing, plus the learner's own sentences.
2. **Rules & comparison.** Patterns, sentence anatomy, and similar expressions compared.
3. **Check quiz.** "Which is natural?" The learner's own mistakes come first, then typical mistakes from questions on that grammar (their QC *fail* probes, which the grader is verified to reject), then the guide's list.
4. **Speak it.** Conversation questions with that expression near the learner's difficulty, or a new Claude-written question built from the learner's own mistakes.

Every grammar point, including the seven conversation skills, can be opened from the notebook even without mistakes.

### Frequent grammar mistakes

Every scored grammar error (articles and prepositions included; spelling, meaning gaps and site wording excluded) strengthens a *skill × error type* weak point, stored with the learner's own wrong → right examples. Strength halves every 14 days and drops with each independent correct answer on that grammar. While a point is strong, sessions rank questions that test the same skill with the same kind of trap first (marked *자주 틀리는 문법*), feedback says when a mistake is a repeat, and Today and *내 실수* list the top points with two drills: curated similar questions, or a new Claude-written question built from the learner's own mistakes (validated by the same QC before use).

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

## Built on Design Deck

EngFlow's UI uses the Design Deck primitives (Button, IconButton, Badge/Tag, GlassPanel cards, Progress, SegmentedControl, EmptyState, Skeleton, Tooltip, Kbd) through `engflow/ui/kit.tsx`, and the deck's effects (`components/motion/effects.tsx`) where they explain state: a light sweep while Claude grades, a once-round border beam on a 100-point answer, numbers that count up, lists that reveal in order, pressable cards with a pointer spotlight, a live dot while listening. All effects follow the system and in-app "reduce motion" settings.

## Speak first

Sentence practice trains saying what you think in a meeting, not assembling long written sentences. Korean hint chips are meaning-sized chunks in speaking order (2 under 10 words, 3 under 16, 4 under 24, at most 6). Model answers lead with the main point, then the reason, then extra detail, and two or three short sentences count as fully correct. The complex one-sentence form stays available as an accepted or advanced answer. See "Speak first" in CONTENT_AUTHORING.md and GRADER_BENCH.md.

## Content

| Bank | Items |
| --- | --- |
| Conversation turns (13 scenes, each covering difficulty 1–10; quick replies 1–5) | 1,030 |
| Meeting essentials (opening, interrupting, checking, agreeing, wrapping up) | 48 |
| Short and long turns for thin scenes (one-word replies to 3–4 sentence turns) | 36 |
| Long multi-sentence turns (difficulty 8–10) | 30 |
| Phrasal verbs in conversation | 32 |
| Idioms in conversation | 30 |
| Role-play scenarios | 51 (234 turns) |
| Free-talk topics with Claude | 22 |
| Full-sentence construction (Mode A) | 48 |
| Phrase & structure quiz (Mode B) | 75 |
| Review variation ladders (7 imported mistakes × 4 levels × 2) | 56 |
| Diagnostic items | 40 |
| Grammar guide entries | 42 (one per skill, incl. 12 conversation skills) |
| Dialogue context added to older questions | 179 |
| **All questions** | **1,619** |
| Accepted correct answers | 8,433 |
| QC probes (expected pass/fail answers) | 4,786 |

See [CONTENT_AUTHORING.md](./CONTENT_AUTHORING.md) for the authoring rules, the pattern syntax and the QC contract.

## Known limitations

- The rule-based grader is precise on the patterns it knows. On blind reworded answers, though, it still marks about 1 in 9 correct paraphrases with an error, mostly meaning-unit synonyms. It also leaves about 7% of mistakes without a note: long-distance agreement, pronoun reference, and errors that depend on context. Such answers get low confidence, so Claude grades them when available.
- Claude's own response time depends on the tier the host provides. Reworded answers therefore take as long as Claude needs (up to 8 seconds) unless grading already started while typing; Settings shows the measured time.
- Voice answers depend on the browser's speech recognition (Chrome, Edge, Safari) and on the microphone being allowed in the view; pronunciation itself is not scored.
- The web app's sync key is device-held identity, not authentication.
- The TOEIC Speaking figures need manual verification against ETS/YBM (see above).
