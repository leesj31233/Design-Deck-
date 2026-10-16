# EngFlow — Content Authoring Guide

This guide defines how curated questions, review variations, diagnostic items and grammar-guide entries are written. Every rule here is either enforced by `npx tsx scripts/check-content.ts` or checked in review.

## Who the content is for

- A Korean process / R&D engineer, about B1, strong technically, weaker at producing English quickly.
- Meets Indonesian, Malaysian, Vietnamese, Korean, American colleagues: pilot plants, Pre-FEED, PFD/P&ID, heat & mass balance, equipment sizing, vendors, commissioning.
- Goal: **simple vocabulary + correct sentence structure + accurate engineering meaning + fast production.** Not native idioms.

Preferred: *"We haven't decided the final dryer capacity yet because we need more operating data."*
Avoid: *"Due to the insufficiency of operational datasets, the equipment sizing parameters remain undetermined."*

Difficulty comes from **grammar complexity, reasoning, sentence length and communicative demand** — never from rare words. Avoid idioms and slangy phrasal verbs (*touch base, ballpark, circle back*). Prefer *check, confirm, send, finish, delay, change, decide, increase, reduce*.

## Easy English

The learner speaks **easy English** — plain engineering English at work and plain everyday English outside it. Every reference (the recommended answer) is written that way:

- **Common words.** *use, get, need, buy, help, start, check, send, fix, about, more, enough, so, but* — not *utilize, obtain, require, purchase, assist, commence, verify, approximately, additional, sufficient, therefore*. Technical terms the engineer really uses (dryer, decanter, feed rate, P&ID, heat and mass balance, wt%) are fine.
- **Short sentences.** At most 18 words per sentence; most turns are 6–14 words. Split longer thoughts into two sentences.
- **No idioms or slang** in the reference (*ballpark, circle back, touch base, swamped, heads-up, in a nutshell*). A common idiom may stay in `accepted`/`advanced` so the learner recognises it when others say it; the questions in `talk-idioms` keep the idiom as the advanced form and teach the plain sentence.
- **Everyday talk is easy too.** *I'm really busy this week* rather than *I'm swamped*; *That's very kind of you* rather than *I'm flattered*.
- Learners' correct plain answers are never marked down for being simple; the grader and Claude's prompt both say so.
- `npx tsx scripts/check-content.ts --plain` lists references with a hard word (and the plain word to use) or a sentence over 18 words. The word list lives in `PLAIN_ALTERNATIVES` (`engflow/core/validate.ts`).

## Speak first: communication before grammar

The app trains **saying what you think in a meeting**, not assembling long written sentences. When writing or reviewing a sentence question, judge it in this order:

1. **Clarity** — does the listener get the point at once?
2. **Speakability** — can a B1–B2 speaker say it on the spot?
3. **Naturalness** — would an international engineering team say it this way?
4. **Accuracy** — correct grammar and meaning (never sacrificed; among correct options, pick the shorter, easier one).

Default speaking order: **Main point → Reason → Extra detail** (condition, exception, concession). Other natural orders are accepted; the model answer leads with the point.

| Before (grammar-first) | After (speak-first) |
| --- | --- |
| *Although the lab results look promising, I don't think we should scale up yet because the feedstock composition at the site may be different.* | *I don't think we should scale up yet. The lab results look promising, but the feed composition at the site could be different.* |
| chips: `비록 ~이지만 / 실험실 결과가 / 좋아 보인다 / 나는 생각하지 않는다 / … / 왜냐하면 / …` (10) | chips: `아직 스케일업하면 안 된다고 생각한다 / 실험실 결과는 좋아 보이지만 / 현장의 원료 조성이 다를 수도 있다` (3) |

- Write `promptKo` in the same order (point first) so the Korean already models the thinking. `promptKo` is what the learner sees; the chips are a hint they open only when stuck, and the level test never shows them (it measures how the learner would say it, not how well they follow a given order).
- A two- or three-sentence answer is always correct if it carries the meaning: the grader treats a missing *because / although / so* as said when the answer links its ideas with sentence order or another linking word (`checkMeaning` in `engflow/core/evaluate.ts`). Keep such linking-word units non-critical.
- Questions that teach a structure (third conditional, relative clause, *although* itself) keep that structure in the reference; their chips still follow meaning units.
- Growth by level is about communication, not length: L1 one core sentence → L2 opinion + reason (*I think / I don't think / We need to / We should … because …*) → L3 point + reason + extra (*but, so, because, if*; split into 2–3 sentences when it helps) → L4 meeting moves (concern, alternative, uncertainty, conditional agreement or disagreement).
- `npx tsx scripts/check-content.ts --style` lists questions that break this style (`fine-chunks`, `concession-first`, `long-single`).

## Realistic settings

Korean and Southeast Asian teams; palm-oil residues (POME, EFB), biomass drying and pelletizing, washing, decanters, indirect dryers, steam and condensate, pumps, heat exchangers, scale-up from lab to pilot, Pre-FEED and FEED documents, datasheets, vendor quotations, EPC schedules, commissioning, start-up/shutdown, troubleshooting, CAPEX/OPEX, feasibility. Use roles ("the Indonesian team", "the vendor", "the client", "the site operator") or occasional names (Pak Budi, Ms. Nguyen). Units must be realistic (t/h, kg/h, wt%, °C, bar(g), kW).

## Question schema

See `engflow/core/types.ts` (`Question`). Fields that matter most:

| Field | Rule |
| --- | --- |
| `promptKo` | Natural Korean of the whole prompt. |
| `segments` | Korean **meaning chunks in speaking order** — each one a unit a speaker says in one breath (≈4–16 Korean syllables), main point first. Chip budget by reference length: 2 chips under 10 words, 3 under 16, 4 under 24, at most 6, no chip that is only a linking word (`비록 ~이지만`, `왜냐하면`, `하지만` go *inside* the chunk they introduce). Example: `아직 스케일업하면 안 된다고 생각한다 / 실험실 결과는 좋아 보이지만 / 현장의 원료 조성이 다를 수도 있다` |
| `contextKo` | One line: who speaks, which meeting, why. |
| `reference` | The **recommended version** shown first in feedback: clear, easy to say on the spot, main point first. Two or three short sentences are better than one long sentence with stacked clauses. |
| `accepted` | Other fully correct answers: different structures, synonyms, contractions. Sentence mode 2–5, phrase 1–4. |
| `advanced` | (Sentence mode, B2+) more natural/precise but still clear to non-native listeners. The one-sentence complex form (*Although …, … because …*) belongs here or in `accepted`, never as the only correct answer. |
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

Alternatives (`a|b`) are single tokens: a multi-word option such as *go through* needs its own `any` entry (`"review ... data", "go through ... data"`), because spaces separate pattern tokens. The light stemmer does not reduce irregular forms such as *going* → *go*; list them (`=going`). A plain `is` matches every form of *be* (`is there` also matches *Are there*; `am` matches *were*); write `=is` for the exact form. Feeling adjectives share a stem too (*excited/exciting*, *bored/boring*, *worried/worry*): a pitfall for the wrong one needs `=exciting`.

**Meaning units** tolerate up to 2 extra tokens between pattern tokens, and spelling slips in long words. Make them **lenient about grammar** (meaning ≠ grammar): *"We still waiting data"* must still contain the unit "waiting for data" — e.g. `wait ... data`. Give synonyms generously (`change|revise|modify|update`). Don't include articles. Mark `term: true` for technical terms. Site wording differs between plants, so a term slot is reference only and never scored, unless it is also `critical` (then it counts toward meaning). Do not write pitfalls that punish a different but understandable site term and `critical: true` when the message fails without it (negation, key verb, key quantity). 3–8 units per sentence, 1–4 per phrase. **Every correct answer (reference and accepted) must match every unit** — QC checks this.

**Pitfalls** detect the top 1–3 likely mistakes for the item's target skill: *if we will*, *so late*, *check for*, *before complete*, *accept data*, *make a test*, *must change* (when "might have to" is meant). A pitfall must **never match a correct answer** (QC checks). Use `=` for tense-specific forms (`if we =decided`). `fix` replaces exactly the matched tokens (`so late` → `it's too early`). `messageKo`: what is wrong, why, and the correct form in 1–2 polite sentences (~입니다/~씁니다). Severity: `critical` = reverses/destroys the meaning; `major` = a clear error a listener notices; `minor` = article/spelling-level.

### Built-in grammar rules (no pitfall needed)

The evaluator already detects (reference-free, so they also catch mistakes in reworded answers): missing *be* in progressive after a pronoun; missing *be* before an adjective (*I sorry*, *we ready*); a dropped subject (*Is called japchae.* → *It's called*); *wait* without *for*; *before/after/without/by* and *how about* + base verb; modal + *to*; modal + inflected verb; double modals; *be* + base verb (*I am agree*, *is not satisfy*); *have* + base verb; *has delayed* → *has been delayed*; *did/didn't* + past form; subject–verb agreement (pronouns, *it/that look*, *there is three …*); *more* + comparative and *more* + short adjective (*more high* → *higher*); *as higher as*; *very* + verb (*I very like*); *enough* order (*enough long*); adjective for adverb (*hear you clear*, *works good*); *let/make me to*; number + singular noun (*four week*); *every* + plural; *will* inside if/when/until clauses; uncountable plurals (*informations, equipments*); a missing article before common singular nouns (*requirements of customer*); a/an; *discuss about / mention about / contact to*; *its* vs *it's*; *will must* / *might can*; *could higher* (missing *be* before an adjective or comparative after a modal); *have to updating* / *need to sent*; *Could you sending …?* / *Can you hearing …?* / *Could you to repeat …?*; *Please opening …*; *The parts haven't arrive*; *might be differ*; *in this week*; *Because the higher steam flow, …* (*because of*); *I think is too early* (missing *it*). A close answer that adds or drops the verb's *not*/*never* is a reversed meaning. Rules do not read across punctuation (*Good question. I'll …* is two sentences).

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
| `reaction` | Quick replies & reactions | the one-liners that must come out instantly: *Sounds good.*, *Got it.*, *Fair enough.*, *Makes sense.*, *No worries.*, *Same here.*, *I see what you mean.* |
| `phone` | Calls & messaging | answering and making calls, bad line, calling back, leaving and answering voice messages, chat messages |
| `negotiation` | Negotiating | price, schedule and scope, conditions (*If you can …, we can …*), polite push-back, meeting halfway, closing a deal |
| `trouble` | Problems & apologies | reporting a delay or mistake, apologizing, explaining the cause, proposing a fix, handling a complaint |
| `daily` | Everyday life & travel | ordering at a café or restaurant, taxis and directions, hotel check-in and problems, shopping and returns, pharmacy and clinic, airport, public transport |
| `office` | Office life | asking a colleague for help, offering help, saying no politely, asking for leave or to leave early, covering for someone, lunch plans, welcoming a new hire, heading home |
| `feelings` | Feelings & empathy | congratulating, comforting, sympathy, worry, relief, surprise, excitement, disappointment, encouragement, reacting to someone's news |

Required fields, on top of the normal schema:

- `situation` — the file's scene. `category`: `meeting` for online/presentation/discussion, `collab` for smalltalk/meal/visit/daily/office/feelings.
- `dialogue` — 1–3 earlier lines, `{ speaker, en, ko }`. Speakers are recurring colleagues (Budi and Sari from Jakarta, Mr. Tan from a Malaysian client, Linh from Vietnam, Priya from a vendor in India, Daniel from a European licensor). In `daily` they are also the people met on a trip or living abroad (a barista, a taxi driver, a hotel clerk, a pharmacist, a shop assistant, a neighbour, a friend such as Emma or Jake); name them by role when there is no name (`"Barista"`, `"Hotel clerk"`). Their English is natural and simple. The learner (Minsu) always speaks next.
- `expression` — the key spoken expression the turn practises, e.g. `"Let me share my screen."`.
- `promptKo` — what the learner wants to say, in natural Korean. `segments` — Korean meaning chunks in speaking order (see "Speak first" above).
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

A scene may span several files: `talk-<scene>.ts`, `talk-<scene>-2.ts`, … (the scene is read from the file name). Difficulty coverage is checked per scene across all its files; `reaction` needs 1–5, every other scene 1–10. Files whose scene varies per question (`roleplay-*.ts`, `talk-long.ts`, `talk-phrasal.ts`) set `situation` on each question.

**Quick replies** (`reaction`, difficulty 1–5) are the short answers a learner must produce without thinking. Give generous `accepted` lists (every common native variant: *Sounds good. / Sounds great. / That works for me. / Works for me. / Perfect.*), one lenient meaning unit, and a pitfall for the typical Korean-speaker version (*Sounds well.*, *Me too.* where *Same here.* is meant, *I agree with you.* for every situation).

**Common, natural phrasing.** References are what native speakers say in that moment, not textbook English: contractions are fine (*I'll*, *we're*), phrasal verbs are welcome (*follow up on*, *figure out*, *go over*, *look into*, *set up*, *catch up*), and short answers stay short.

### Role-play

A role-play is one conversation in which the learner speaks several times (3–6 turns). Each turn is a normal question with a `scenario: { id, titleKo, step, total }` field; all steps share `id`, `titleKo`, `total` and `situation`, and live in the same file. From step 2 on, `dialogue` starts with the learner's previous line as speaker `"Minsu"` (use that step's reference), followed by the partner's new line. The app shows Minsu's lines as the learner's own bubbles and replaces them with what the learner actually answered. Difficulty may rise through the scenario. See `rp-weekly-call` in `roleplay-work.ts`.

`engflow/content/bank/dialogue-overlay.ts` adds the same kind of `dialogue` to older questions by id, without changing their files.

## Validation

```bash
npx tsx scripts/check-content.ts --only phrases
```

Zero errors are required. Warnings must be read and either fixed or consciously accepted.
