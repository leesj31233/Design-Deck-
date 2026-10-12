# Grader research: accuracy and speed of the rule-based grader

EngFlow shows a grade within about a second. When the answer is close to a stored
correct answer, the rule-based grader decides at once. When the learner words it
differently, the app waits for Claude for as long as Claude usually takes on that
device. This note records how both parts were measured and improved.

## Three measurements

| Set | What it is | Written by | Used for |
| --- | --- | --- | --- |
| Mutation bench (`scripts/grader-bench.ts`) | 48 typical Korean-speaker mistakes planted into every correct answer and pass probe; correct answers and harmless rewrites (contractions) | generated from the bank | regression check, every change |
| Blind paraphrase set A (`scripts/bench/paraphrase-corpus.ts`) | 97 questions × (3 correct answers worded differently from every stored answer + 2 reworded answers with one real mistake) | an independent writer who never saw the grader | measured first, then used to develop fixes |
| Learner corpus (`scripts/bench/learner-corpus.ts`) | 220 one-mistake sentences + 220 correct sentences (194 deliberately tricky), 20 per scene, no question context | an independent writer who never saw the rules | measures the grammar rules alone; then used to develop rules |
| Blind paraphrase set B (`scripts/bench/paraphrase-corpus-b.ts`) | like set A, on 104 other questions | an independent writer | held out: never used for development |

The mutation bench is easy to over-fit (the same person writes the mistakes and the
rules), so the blind sets are the numbers that count. Set A and the learner corpus
became development data once their misses were studied; set B was kept out of
development to measure what generalizes.

## Results of the 12-hour run

| Measure | Start | Now |
| --- | ---: | ---: |
| Blind A: correct answers marked wrong | 60 / 291 (20.6%) | 32 / 291 (11.0%) |
| Blind A: wrong answers flagged (any grammar note) | 76.8% | 92.8% |
| Blind A: wrong answers flagged as a major error or below 85 | 61.9% | 74.2% |
| Blind A: wrong answers shown at once as fine | 11 | 2 |
| Learner corpus, rules alone: mistakes flagged | 40.0% | 90.5% |
| Learner corpus, rules alone: correct sentences flagged | 0.5% | 0.0% |
| Mutation bench: recall / no false alarm | 95.7% / 99.7% (first run, 209 / 312 rows) | 99.3% / 100% (1,299 / 825 rows) |
| Rule-based grading time (p95) | ~10 ms | ~18 ms |

Blind B (held out): see the last section.

## What changed

- **Sentence-aware rules.** The tokenizer marks clause punctuation, sentence ends
  (not "Mr." or "a.m."), and questions. Every rule runs one sentence at a time, so
  "Yes, I did! It was…" or "I'll look into it. Do you…" are no longer read as one
  clause.
- **About 90 reference-free rules for Korean-speaker patterns.** Examples:
  - be + verb (*is not satisfy*, *I am agree*, *is usually eat* → *is usually eaten*)
  - dropped subject or be (*Is called japchae*, *I sorry*, *they won't ready*)
  - articles, plural and countability (*requirements of customer*, *two daughter*,
    *a good news*, *many money*, *this results*)
  - prepositions (*married with*, *depend of*, *discuss about*, *go to home*,
    *wait us*, *on next Monday*)
  - verb patterns (*suggest to stay*, *look forward to meet*, *let me to*,
    *need replace*, *was happened*)
  - word order (*How your wife is doing?*, *if is there*, *Always I check*,
    *pick up you*)
  - tense with time words (*since 2015* + present, *have visited … last year*,
    *Last weekend I go*), conditionals, double conjunctions (*Because …, so …*)
  - -ed/-ing feelings (*I'm interesting in*), comparatives (*more high*, *the most best*)
- **Fewer false alarms from comparing with stored answers.** The aligner now accepts:
  - questions that open with their verb (*Is it possible…* / *Would it be possible…*)
  - state verbs in the simple form (*I plan to* / *I'm planning to*)
  - gerunds for clauses (*before deciding*), passives and progressives that are
    complete on their own (*can't be opened*, *isn't working*)
  - tag questions, causatives (*makes it too high*), separable phrasal verbs
    (*turn your cameras on*)
  - optional phrases (*(on that)*, *(about it)*, *went up (by) 5%*), verb +
    preposition pairs (*decide on*, *wait for*), casual replies without *I*
  - a different preposition is a minor note unless the word requires one
    (*depend on*); connector and time-nuance differences are notes, not errors
- **Scoring.** Word order and sentence structure count as grammar (a major word-order
  mistake no longer scores 97).

## Wait policy

`gradeBudgetMs` (core/grader.ts) waits for Claude only when the rule-based grade
can't be trusted:

- **Close to a stored answer** (high confidence): at most 1 s; shown at once when
  nothing is found.
- **Reworded** (medium/low confidence): waits for Claude. Once the device has five
  or more measured Claude response times, the wait is the 90th/95th percentile
  plus a margin, within the old 2.5 s / 8 s caps.

On blind set A, also showing *medium-confidence answers with nothing found* at once
would have shown another 40% of correct answers instantly. It would also have shown
3.6% more wrong answers as fine without Claude. That is the failure the learner
reported ("is not satisfy … of customer" scored 100), so the policy stays.

| Blind A, now | right answers | right with nothing found | wrong answers | wrong with nothing found |
| --- | ---: | ---: | ---: | ---: |
| high | 94 | 77 | 53 | 2 |
| medium | 157 | 118 | 106 | 7 |
| low | 40 | 28 | 35 | 5 |

## Known limits

- Meaning units in some questions list too few synonyms ("arrived" for "received"),
  so a correct answer can lose meaning points. Content passes broaden them per bank.
- Long-distance agreement (*the moisture level of the last batch were*), pronoun
  reference (*change it* for plural specifications) and errors that are only wrong in
  context still need Claude.

## How to run

```bash
npx tsx scripts/grader-bench.ts --misses          # mutation bench
npx tsx scripts/bench/blind.ts --list             # blind set A (paraphrase-corpus.ts)
npx tsx scripts/bench/rules-corpus.ts --list      # rules alone on the learner corpus
```

Every change must also keep `npx tsx scripts/check-content.ts` at 0 errors: no rule may fire on any correct answer in the bank, and the bank has about 2,000 correct sentences.
