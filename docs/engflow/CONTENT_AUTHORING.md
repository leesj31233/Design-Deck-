# EngFlow — Content Authoring Guide

This guide defines how curated questions, review variations, diagnostic items and grammar-guide entries are written. Every rule here is either enforced by `npx tsx scripts/check-content.ts` or checked in review.

## Who the content is for

- A Korean process / R&D engineer, about B1, strong technically, weaker at producing English quickly.
- Meets Indonesian, Malaysian, Vietnamese, Korean, American colleagues: pilot plants, Pre-FEED, PFD/P&ID, heat & mass balance, equipment sizing, vendors, commissioning.
- Goal: **simple vocabulary + correct sentence structure + accurate engineering meaning + fast production.** Not native idioms.

Preferred: *"We haven't decided the final dryer capacity yet because we need more operating data."*
Avoid: *"Due to the insufficiency of operational datasets, the equipment sizing parameters remain undetermined."*

Difficulty comes from **grammar complexity, reasoning, sentence length and communicative demand** — never from rare words. Avoid idioms and slangy phrasal verbs (*touch base, ballpark, circle back*). Prefer *check, confirm, send, finish, delay, change, decide, increase, reduce*.

## Realistic settings

Korean and Southeast Asian teams; palm-oil residues (POME, EFB), biomass drying and pelletizing, washing, decanters, indirect dryers, steam and condensate, pumps, heat exchangers, scale-up from lab to pilot, Pre-FEED and FEED documents, datasheets, vendor quotations, EPC schedules, commissioning, start-up/shutdown, troubleshooting, CAPEX/OPEX, feasibility. Use roles ("the Indonesian team", "the vendor", "the client", "the site operator") or occasional names (Pak Budi, Ms. Nguyen). Units must be realistic (t/h, kg/h, wt%, °C, bar(g), kW).

## Question schema

See `engflow/core/types.ts` (`Question`). Fields that matter most:

| Field | Rule |
| --- | --- |
| `promptKo` | Natural Korean of the whole prompt. |
| `segments` | Korean meaning chunks **in English word order** (may sound slightly unnatural). Short chunks (≈2–10 Korean syllables). Sentence mode ≥ 3 chunks. Example: `만약 / 우리가 지금 결정한다면 / 장비 사양을 / 우리는 변경해야 할 수도 있다 / 그 사양을 / 나중에 / 왜냐하면 / 실제 운전 데이터가 / 달라질 수도 있기 때문이다` |
| `contextKo` | One line: who speaks, which meeting, why. |
| `reference` | Simple, clear international English. This is the "recommended version". |
| `accepted` | Other fully correct answers: different structures, synonyms, contractions. Sentence mode 2–5, phrase 1–4. |
| `advanced` | (Sentence mode, B2+) more natural/precise but still clear to non-native listeners. |
| `meaning` | Meaning units (below). |
| `pitfalls` | Known Korean-speaker mistakes for this item (below). |
| `hints` | `pattern` (grammar formula), `skeleton` (reference with ____ blanks), `partial` (first half of the reference + "…"). |
| `explanationKo` | 1–3 Korean sentences: the rule, **why**, and how it differs from the likely mistake. |
| `probes` | 2–4 QC probes (below). |

### Tense must be unambiguous

Korean tense/hypothesis markers must lead to exactly one English structure. Add time markers in parentheses when needed.

| Meaning | Korean signal | English |
| --- | --- | --- |
| Real future condition | (지금/이번 주에) ~한다면 | If + present: *If we decide now, …* |
| Hypothetical present | (실제로는 아니지만) 지금 ~한다고 가정하면 | If + past, would: *If we decided now, we would …* |
| Past counterfactual | (지난달에) ~했더라면 | If + had p.p., would have p.p.: *If we had decided earlier, …* |
| Up to now, not yet | 아직 ~하지 않았다 | *haven't … yet* |
| Just / already | 방금 / 이미 ~했다 | *have just / have already …* |
| Finished past with time | 어제 / 지난주에 ~했다 | past simple |
| In progress | ~하고 있다 / ~하는 중이다 | be + V-ing |
| Possibility | ~할 수도 있다 | might / may / could |
| Necessity | ~해야 한다 | have to / need to / must |
| Possible necessity | ~해야 할 수도 있다 | might have to |

Never mix "had decided" with "now". Never write a prompt where both *If we decide now* and *If we decided now* would be equally correct.

### Levels

| Level | Typical structures | Length | `difficulty` |
| --- | --- | --- | --- |
| A2 | present/past simple, progressive, basic requests | 6–10 words | 1–3 |
| B1 | 1st conditional, modals, present perfect, because/so, before + V-ing, time clauses | 10–18 | 3–5 |
| B2 | passive, relative clauses, 2nd conditional, reasoning across 2–3 clauses, polite disagreement, reporting | 15–28 | 5–7 |
| C1 | 3rd/mixed conditionals, hedged justification, several linked clauses — still simple words | 20–35 | 8–10 |

## Pattern syntax (meaning units and pitfalls)

Matched against the normalized answer (lower-case, contractions expanded: *it's → it is*, *haven't → have not*).

| Syntax | Meaning |
| --- | --- |
| `word` | token whose light stem equals the word's stem (`change` matches *changes, changed, changing*) |
| `=word` | exact form only (`=decided`) |
| `a\|b\|=c` | alternatives |
| `tok?` | optional token |
| `*` | any one token |
| `...` | gap: 0–3 tokens (0–6 inside meaning units) |
| `re:<regex>` | regex over the normalized, space-joined answer |

**Meaning units** tolerate up to 2 extra tokens between pattern tokens, and spelling slips in long words. Make them **lenient about grammar** (meaning ≠ grammar): *"We still waiting data"* must still contain the unit "waiting for data" — e.g. `wait ... data`. Give synonyms generously (`change|revise|modify|update`). Don't include articles. Mark `term: true` for technical terms. Site wording differs between plants, so a term slot is reference only and never scored, unless it is also `critical` (then it counts toward meaning). Do not write pitfalls that punish a different but understandable site term and `critical: true` when the message fails without it (negation, key verb, key quantity). 3–8 units per sentence, 1–4 per phrase. **Every correct answer (reference and accepted) must match every unit** — QC checks this.

**Pitfalls** detect the top 1–3 likely mistakes for the item's target skill: *if we will*, *so late*, *check for*, *before complete*, *accept data*, *make a test*, *must change* (when "might have to" is meant). A pitfall must **never match a correct answer** (QC checks). Use `=` for tense-specific forms (`if we =decided`). `fix` replaces exactly the matched tokens (`so late` → `it's too early`). `messageKo`: what is wrong, why, and the correct form in 1–2 polite sentences (~입니다/~씁니다). Severity: `critical` = reverses/destroys the meaning; `major` = a clear error a listener notices; `minor` = article/spelling-level.

### Built-in grammar rules (no pitfall needed)

The evaluator already detects: missing *be* in progressive after a pronoun; *wait* without *for*; *before/after/without/by* + base verb; modal + *to*; modal + inflected verb; double modals; *be* + base verb (*I am agree*); *have* + base verb; *did* + past form; pronoun subject–verb agreement; *more* + comparative; *will* inside if/when/until clauses; uncountable plurals (*informations, equipments*); a/an; *discuss about / mention about / contact to*; *its* vs *it's*. Correct answers must not trigger these rules (QC checks); report any false positive instead of working around it.

### Probes

Each question carries 2–4 `probes`: at least one `pass` (a valid answer **not** in `accepted`, e.g. a contraction, synonym or different article) and at least one `fail` (a typical Korean-speaker mistake for the target skill). QC runs the evaluator: `pass` must score ≥ 85 with no major error; `fail` must score < 85 or produce a major/critical error. If a valid `pass` probe fails, broaden the meaning units first; add it to `accepted` only when its structure is genuinely different. If a `fail` probe passes, add a pitfall.

## IDs

- Full sentences: `fs-<category>-<slug>` · phrases: `ph-<skill>-<slug>` · review variations: `rv-<seed>-l<level>-<a|b>` · diagnostic: `dg-p<part>-<slug>`.
- Categories: `process`, `pilot`, `meeting`, `collab`, `operation`, `business`.
- Skill ids: see `engflow/content/skills.ts`.

## Review variations (generalization)

For each imported mistake (`engflow/content/seeds.ts`), a ladder tests the grammar in new sentences instead of repeating one answer:

- **Level 0** (immediate retry / day 0): close to the original target sentence.
- **Level 1** (≈ day 3): the same pattern in a new short context.
- **Level 2** (≈ day 7): a longer sentence combining the pattern with another clause.
- **Level 3** (≈ day 14): the pattern used naturally inside a complete meeting response.

## Conversation questions

Most practice is a turn in a conversation: someone says something, and the learner answers with what they want to say in Korean. The goal is **how to say it** in a real online meeting or business conversation, in the phrasing native speakers commonly use (natural spoken English, not textbook English, and no rare idioms).

Conversation questions live in `engflow/content/bank/talk-<situation>.ts`, one file per scene:

| `situation` | Scene | Typical moments |
| --- | --- | --- |
| `online` | Running an online meeting | audio check, screen sharing, agenda, handing over, lag/mute, time check, wrap-up |
| `presentation` | Presenting | opening, walking through slides, results, transitions, summary, taking questions |
| `discussion` | Meeting discussion | opinions, agreeing/disagreeing politely, clarifying, requests, schedules |
| `smalltalk` | Greetings & small talk | greetings, weekend, weather, catching up, compliments, thanks |
| `meal` | Meals & dinners | recommending, ordering, toasts, dietary needs, paying, declining politely |
| `visit` | Business trips & site visits | airport pickup, hotel, site tour, safety briefing, scheduling |

Required fields, on top of the normal schema:

- `situation` — the file's scene. `category`: `meeting` for online/presentation/discussion, `collab` for smalltalk/meal/visit.
- `dialogue` — 1–3 earlier lines, `{ speaker, en, ko }`. Speakers are recurring colleagues (Budi and Sari from Jakarta, Mr. Tan from a Malaysian client, Linh from Vietnam, Priya from a vendor in India, Daniel from a European licensor). Their English is natural and simple. The learner (Minsu) always speaks next.
- `expression` — the key spoken expression the turn practises, e.g. `"Let me share my screen."`.
- `promptKo` — what the learner wants to say, in natural Korean. `segments` — Korean meaning chunks in English word order.
- `reference` — the most common native phrasing. `accepted` — other common, fully correct ways (≥2 for sentences).
- `probes` — at least one `pass` paraphrase and one `fail` typical Korean-speaker mistake.

Difficulty (1–10) follows the turn's length and grammar, and every scene must cover all ten:

| Difficulty | CEFR | Turn |
| --- | --- | --- |
| 1 | A2 | fixed short expression (3–6 words): "Can you hear me?" |
| 2 | A2 | short expression with one slot: "Let me share my screen." |
| 3 | B1 | one clause, basic tense |
| 4 | B1 | one clause with object and preposition |
| 5 | B1 | two clauses (because / so / when) |
| 6 | B2 | two clauses with present perfect, modals or a first conditional |
| 7 | B2 | passive, relative clause or polite hedging |
| 8 | B2 | two sentences: reason and proposal |
| 9 | C1 | several sentences: hypothesis, summary or reporting |
| 10 | C1 | long, diplomatic turn: polite disagreement and an alternative |

Use `mode: "phrase"` for difficulty 1–3 and `mode: "sentence"` from 4 up. The grammar must be real (skills from `skills.ts`, including the conversation skills `small-talk`, `online-meeting`, `question-form`, `offer-suggest`, `thanks-looking-forward`, `signpost`, `opinion`), and pitfalls target the mistakes Korean speakers actually make (`let me to`, `I'm looking forward to see`, `How was your weekend was?`, `Do you can …?`, missing articles, wrong tense).

`engflow/content/bank/dialogue-overlay.ts` adds the same kind of `dialogue` to older questions by id, without changing their files.

## Validation

```bash
npx tsx scripts/check-content.ts --only phrases
```

Zero errors are required. Warnings must be read and either fixed or consciously accepted.
