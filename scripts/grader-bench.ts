/**
 * Grader research bench: how well and how fast the rule-based grader judges
 * answers it has never seen.
 *
 *   npx tsx scripts/grader-bench.ts            # summary
 *   npx tsx scripts/grader-bench.ts --misses   # also list missed mutations
 *   npx tsx scripts/grader-bench.ts --report docs/engflow/GRADER_BENCH.md
 *
 * Wrong answers are made by planting one typical Korean-speaker mistake into a
 * correct answer (reference or accepted). Right answers are the curated "pass"
 * probes plus harmless rewrites of correct answers (contractions). For each,
 * the bench records whether the grader caught the mistake (or left the right
 * answer alone), the confidence it reported, the wait the app would choose,
 * and the time it took.
 */
import { writeFileSync } from "node:fs";
import { evaluateLocal, scoredErrors } from "../engflow/core/evaluate";
import { gradeBudgetMs, ruleBasedIsEnough } from "../engflow/core/grader";
import { QUESTIONS } from "../engflow/content";
import { verbInfo } from "../engflow/core/lexicon";
import type { Evaluation, Question } from "../engflow/core/types";

/** "increasing" → "increase", "sending" → "send" (the lexicon knows the base). */
const baseOf = (ing: string) => verbInfo(ing.toLowerCase())?.base ?? ing.replace(/ing$/, "").replace(/(.)\1$/, "$1");

interface Mutation {
  id: string;
  ko: string;
  /** Returns the mutated sentence, or null when the pattern is absent. */
  apply: (s: string) => string | null;
}

const sub = (re: RegExp, to: string | ((m: string, ...g: string[]) => string)) => (s: string) => {
  if (!re.test(s)) return null;
  re.lastIndex = 0;
  const out = s.replace(re, to as never);
  return out === s ? null : out;
};

export const MUTATIONS: Mutation[] = [
  // Only before a singular noun that ends the phrase ("of the customer."), where a bare noun is clearly wrong.
  // "at site" is common plant English (like "on site"), so it is left out.
  { id: "drop-the", ko: "관사 the 빠짐", apply: sub(/\b(of|for|to|with|from|on|in|at) the (?!site\b)([a-z]+[^s\W])(?=[.,?!]|$| (?:and|but|so|because|by|for|to|in|on|at|with|from)\b)/i, "$1 $2") },
  { id: "is-not-verb", ko: "is not + 동사원형 (does not)", apply: sub(/\b(doesn't|does not) (\w+)/i, (_m, _a, v) => `is not ${v}`) },
  { id: "are-not-verb", ko: "are not + 동사원형 (do not)", apply: sub(/\b(we|they|you) (don't|do not) (\w+)/i, (_m, s, _d, v) => `${s} are not ${v}`) },
  { id: "drop-be-ing", ko: "진행형 be 빠짐", apply: sub(/\b(we|they|you)('re| are) (\w+ing)\b/i, (_m, s, _b, v) => `${s} ${v}`) },
  // Not before a length of time: "wait a few more minutes" is correct.
  { id: "wait-without-for", ko: "wait for의 for 빠짐", apply: sub(/\bwait(ing)? for\b(?! (?:a few|a couple|a moment|a minute|a second|a bit|a while|\d+|one|two|three|five|ten|another|several)\b)/i, (_m, g) => `wait${g ?? ""}`) },
  { id: "modal-to", ko: "조동사 + to", apply: sub(/\b(can|could|should|must|will|would) (?!be\b|have\b|not\b)([a-z]+)\b/i, (_m, mo, v) => `${mo} to ${v}`) },
  { id: "modal-s", ko: "조동사 + 3인칭 -s", apply: sub(/\b(will|can|should|must) (send|check|finish|share|confirm|need|take|make|get)\b/i, (_m, mo, v) => `${mo} ${v}s`) },
  { id: "forward-to-base", ko: "look forward to + 동사원형", apply: sub(/\bforward to (\w+ing)\b/i, (_m, v) => `forward to ${baseOf(v)}`) },
  { id: "thank-for-base", ko: "Thank you for + 동사원형", apply: sub(/\b(thanks|thank you) for (\w+ing)\b/i, (_m, t, v) => `${t} for ${baseOf(v)}`) },
  { id: "time-clause-will", ko: "시간 부사절 will", apply: sub(/\b(when|as soon as|until|after|before) (it|we|they|the \w+) (arrives|finishes|comes|gets|sends|starts|is)\b/i, (_m, c, s, v) => `${c} ${s} will ${v === "is" ? "be" : v.replace(/es$|s$/, (x) => (x === "es" && /(sh|ch|x|ss)es$/.test(v) ? "" : ""))}`) },
  { id: "did-past", ko: "did + 과거형", apply: sub(/\bdid (you|we|they|he|she|it) (send|check|finish|see|get|make|receive|confirm)\b/i, (_m, s, v) => `did ${s} ${{ send: "sent", check: "checked", finish: "finished", see: "saw", get: "got", make: "made", receive: "received", confirm: "confirmed" }[v.toLowerCase()]}`) },
  { id: "uncountable-s", ko: "셀 수 없는 명사 -s", apply: sub(/\b(information|equipment|feedback|advice)\b/i, (m) => `${m}s`) },
  { id: "prep-base-verb", ko: "전치사 + 동사원형", apply: sub(/\b(before|after|without) (\w+ing)\b/i, (_m, p, v) => `${p} ${baseOf(v)}`) },
  { id: "has-been-to-has", ko: "수동 현재완료 been 빠짐", apply: sub(/\bhas been (\w+ed)\b/i, (_m, v) => `has ${v}`) },
  { id: "has-to-is", ko: "현재완료 → be + p.p.", apply: sub(/\b(it|this|the \w+) has (changed|finished|started|arrived|increased|decreased|improved)\b/i, (_m, s, v) => `${s} is ${v}`) },
  { id: "agreement-3sg", ko: "3인칭 단수 -s 빠짐", apply: sub(/\b(he|she|it|this|that) (sends|checks|needs|takes|makes|works|looks|seems|depends|means)\b/i, (_m, s, v) => `${s} ${v.replace(/s$/, "")}`) },
  { id: "too-very", ko: "too 대신 so/very + 판단", apply: sub(/\btoo (early|late|soon) to\b/i, (_m, a) => `so ${a} to`) },
  { id: "discuss-about", ko: "discuss about", apply: sub(/\bdiscuss (the|our|your|this)\b/i, (_m, d) => `discuss about ${d}`) },
  { id: "a-an", ko: "a/an 혼동", apply: sub(/\ban (update|issue|email|option|answer|hour|error|order)\b/i, (_m, n) => `a ${n}`) },

  // Wave 2: other mistakes Korean speakers make in meetings and small talk.
  { id: "ed-ing-adjective", ko: "interested ↔ interesting", apply: sub(/\b(I'm|I am|we're|we are|they're|they are|you're|you are|I was|we were) (interested|excited|bored|confused|surprised|satisfied|disappointed|tired|worried|embarrassed)\b/i, (_m, s, a) => `${s} ${a === "worried" ? "worrying" : a === "tired" ? "tiring" : a.replace(/ied$/, "ying").replace(/ed$/, "ing")}`) },
  { id: "number-singular", ko: "복수 수사 + 단수 명사", apply: sub(/\b(two|three|four|five|six|several|many|a few|both) (days|weeks|months|hours|minutes|samples|options|questions|issues|points|units|pumps|people|things|ideas|slides)\b/i, (_m, q, n) => `${q} ${n === "people" ? "person" : n.replace(/s$/, "")}`) },
  { id: "go-to-home", ko: "go to home", apply: sub(/\b(go|going|went|get|got|head|heading) home\b/i, (_m, v) => `${v} to home`) },
  { id: "reply-without-to", ko: "reply/listen/respond to의 to 빠짐", apply: sub(/\b(reply|replied|listen|listened|respond|responded) to\b/i, (_m, v) => v) },
  { id: "contact-to", ko: "contact to", apply: sub(/\bcontact (the|you|him|her|them|our|your|me|us)\b/i, (_m, o) => `contact to ${o}`) },
  { id: "perfect-with-past-time", ko: "현재완료 + 과거 시점", apply: sub(/\b(I|we|they) (sent|finished|checked|received|talked|met|called|visited|had)\b(?=[^.?!]*\b(yesterday|last (week|month|year|night|time)|ago)\b)/i, (_m, s, v) => `${s} have ${v}`) },
  { id: "since-for", ko: "for + 기간 → since", apply: sub(/\bfor (two|three|four|five|six|ten|\d+|a few|several) (years|months|weeks|days|hours)\b/i, (_m, q, n) => `since ${q} ${n}`) },
  { id: "how-about-base", ko: "How about + 동사원형", apply: sub(/\b(how about|what about) (\w+ing)\b/i, (_m, h, v) => `${h} ${baseOf(v)}`) },
  { id: "suggest-to", ko: "suggest to + 동사", apply: sub(/\b(suggest|suggested|recommend|recommended) (that )?we (\w+)\b/i, (_m, v, _t, x) => `${v} to ${x}`) },
  { id: "let-to", ko: "let/make + 목적어 + to", apply: sub(/\b(let|make) (me|us|him|her|them) (\w+)\b/i, (_m, v, o, x) => `${v} ${o} to ${x}`) },
  { id: "didnt-past", ko: "didn't + 과거형", apply: sub(/\b(didn't|did not) (send|check|receive|get|see|make|finish|know|have|find|hear|think)\b/i, (_m, d, v) => `${d} ${{ send: "sent", check: "checked", receive: "received", get: "got", see: "saw", make: "made", finish: "finished", know: "knew", have: "had", find: "found", hear: "heard", think: "thought" }[v.toLowerCase()]}`) },
  { id: "does-it-s", ko: "Does it + 동사-s", apply: sub(/\b(does|did) (it|he|she) (work|need|mean|look|take|cost|matter|sound)\b/i, (_m, d, s, v) => `${d} ${s} ${v}s`) },
  { id: "there-is-plural", ko: "There is + 복수", apply: sub(/\bthere are (two|three|several|many|a few)\b/i, (_m, q) => `there is ${q}`) },
  { id: "much-plural", ko: "much + 복수 명사", apply: sub(/\bmany ([a-z]+s)\b/i, (_m, n) => `much ${n}`) },
  { id: "very-verb", ko: "very + 동사", apply: sub(/\breally (appreciate|like|want|need|enjoy|hope)\b/i, (_m, v) => `very ${v}`) },
  { id: "be-agree", ko: "be + agree", apply: sub(/\b(I|we) (agree|disagree)\b/i, (_m, s, v) => `${s} ${s.toLowerCase() === "i" ? "am" : "are"} ${v}`) },
  { id: "said-me", ko: "said + 사람 (told)", apply: sub(/\btold (me|us|him|her|them)\b/i, (_m, o) => `said ${o}`) },
  { id: "enough-order", ko: "enough + 형용사 어순", apply: sub(/\b(big|good|large|clear|fast|long|strong|safe|early|high|low|stable|warm|cheap) enough\b/i, (_m, a) => `enough ${a}`) },
  { id: "in-weekday", ko: "요일 앞 in", apply: sub(/\bon (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/, (_m, d) => `in ${d}`) },
  { id: "ask-to-person", ko: "ask to + 사람", apply: sub(/\bask (him|her|them|the vendor|the client|our manager|the team)\b/i, (_m, o) => `ask to ${o}`) },
  { id: "want-that", ko: "want that + 절", apply: sub(/\bwant (you|him|her|them) to (\w+)\b/i, (_m, o, v) => `want that ${o} ${v}`) },
  { id: "an-uncountable", ko: "an information / an advice", apply: sub(/\b(some|any|the|more) (information|advice|feedback|news|equipment)(?=[.,?!]|$| (?:and|but|so|because|for|to|in|on|at|with|from|about|is|was|has|will|yet|now|today)\b)/i, (_m, _d, n) => `${/^[aeiou]/i.test(n) ? "an" : "a"} ${n}`) },
  { id: "ly-dropped", ko: "부사 대신 형용사", apply: sub(/\b(carefully|quickly|clearly|properly|correctly|safely|smoothly)\b/i, (m) => m.replace(/ly$/i, "").replace(/il$/, "y")) },
  { id: "perfect-base", ko: "have + 동사원형", apply: sub(/\b(have|has) (sent|checked|finished|received|done|seen|made|taken|given|tried|talked)\b/i, (_m, h, v) => `${h} ${{ sent: "send", checked: "check", finished: "finish", received: "receive", done: "do", seen: "see", made: "make", taken: "take", given: "give", tried: "try", talked: "talk" }[v.toLowerCase()]}`) },
  // Not before a plural noun: "more small groups" is a valid (different) phrase.
  { id: "more-er", ko: "more + 비교급 대신 원급", apply: sub(/\b(bigger|smaller|faster|cheaper|higher|lower|longer|shorter|easier|earlier|later|better|safer)\b(?! [a-z]+s\b)/i, (m) => `more ${{ bigger: "big", smaller: "small", faster: "fast", cheaper: "cheap", higher: "high", lower: "low", longer: "long", shorter: "short", easier: "easy", earlier: "early", later: "late", better: "good", safer: "safe" }[m.toLowerCase()]}`) },
  { id: "it-is-depend", ko: "It is depend", apply: sub(/\b(it|that) depends\b/i, (_m, s) => `${s} is depend`) },
  { id: "gerund-to", ko: "finish/mind/avoid + to", apply: sub(/\b(finish|finished|mind|enjoy|enjoyed|avoid|consider|keep|kept|suggest) (\w+ing)\b/i, (_m, v, g) => `${v} to ${baseOf(g)}`) },
  { id: "drop-subject-it", ko: "주어 it 생략", apply: sub(/^(It's|It is) (?!been\b)/, () => "Is ") },
  { id: "drop-be-adjective", ko: "형용사 앞 be동사 빠짐", apply: sub(/\b(we|they|I)('re|'m| are| am) (ready|late|sure|available|busy|free|sorry|happy|done|okay|fine)\b/i, (_m, s, _b, a) => `${s} ${a}`) },
];

/** Harmless rewrites that must not be flagged. */
const REWRITES: { id: string; apply: (s: string) => string | null }[] = [
  { id: "contract", apply: (s) => { const t = s.replace(/\bI will\b/, "I'll").replace(/\bdo not\b/, "don't").replace(/\bwe are\b/i, (m) => (m[0] === "W" ? "We're" : "we're")).replace(/\bit is\b/i, (m) => (m[0] === "I" ? "It's" : "it's")); return t === s ? null : t; } },
  { id: "expand", apply: (s) => { const t = s.replace(/\bI'll\b/, "I will").replace(/\bdon't\b/, "do not").replace(/\bWe're\b/, "We are").replace(/\bIt's\b(?! (?:(?:never|already|just|always|not|really|also) )?(?:been|got|gone)\b)/, "It is").replace(/\bcan't\b/, "cannot"); return t === s ? null : t; } },
];

const caught = (ev: Evaluation) => ev.scores.overall < 85 || scoredErrors(ev.errors).some((e) => e.severity !== "minor") || scoredErrors(ev.errors).some((e) => e.category !== "spelling");
const falseAlarm = (ev: Evaluation) => ev.scores.overall < 85 || scoredErrors(ev.errors).some((e) => e.severity !== "minor");

interface Row { qid: string; kind: string; answer: string; ok: boolean; confidence: string; budget: number; instant: boolean; ms: number; clean: boolean }

/** Nothing found at all (or spelling only): the case an instant policy would show as fine. */
const isClean = (ev: Evaluation) => scoredErrors(ev.errors).every((e) => e.category === "spelling") && ev.scores.overall >= 85;

const t = () => performance.now();

export function runBench(questions: Question[]) {
  const rows: Row[] = [];
  const bank = questions.filter((q) => !q.variation);
  for (const q of bank) {
    const correct = [q.reference, ...q.accepted];
    // Wrong answers: one mutation each, applied to the first correct answer where it fits.
    for (const m of MUTATIONS) {
      for (const c of correct) {
        const wrong = m.apply(c);
        if (!wrong || correct.some((x) => x.toLowerCase() === wrong.toLowerCase())) continue;
        const t0 = t();
        const ev = evaluateLocal(q, wrong);
        const ms = t() - t0;
        rows.push({ qid: q.id, kind: `wrong:${m.id}`, answer: wrong, ok: caught(ev), confidence: ev.confidence, budget: gradeBudgetMs("auto", ev), instant: ruleBasedIsEnough(ev), ms, clean: isClean(ev) });
        break;
      }
    }
    // Wrong answers in reworded sentences: the same mistakes planted into the "pass" paraphrases,
    // where the grader cannot lean on an expected answer (the case learners hit most).
    for (const m of MUTATIONS) {
      for (const p of (q.probes ?? []).filter((x) => x.expect === "pass")) {
        const wrong = m.apply(p.answer);
        if (!wrong || correct.some((x) => x.toLowerCase() === wrong.toLowerCase())) continue;
        const t0 = t();
        const ev = evaluateLocal(q, wrong);
        const ms = t() - t0;
        rows.push({ qid: q.id, kind: `reworded:${m.id}`, answer: wrong, ok: caught(ev), confidence: ev.confidence, budget: gradeBudgetMs("auto", ev), instant: ruleBasedIsEnough(ev), ms, clean: isClean(ev) });
        break;
      }
    }
    // Right answers: pass probes and harmless rewrites.
    const rights = [...(q.probes ?? []).filter((p) => p.expect === "pass").map((p) => ({ kind: "right:probe", a: p.answer })), ...REWRITES.flatMap((r) => correct.map((c) => r.apply(c)).filter((x): x is string => !!x).slice(0, 1).map((a) => ({ kind: `right:${r.id}`, a })))];
    for (const r of rights) {
      const t0 = t();
      const ev = evaluateLocal(q, r.a);
      const ms = t() - t0;
      rows.push({ qid: q.id, kind: r.kind, answer: r.a, ok: !falseAlarm(ev), confidence: ev.confidence, budget: gradeBudgetMs("auto", ev), instant: ruleBasedIsEnough(ev), ms, clean: isClean(ev) });
    }
  }
  return rows;
}

function pct(n: number, d: number) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : "–";
}

export function summarize(rows: Row[]) {
  const kinds = [...new Set(rows.map((r) => r.kind))].sort();
  const table = kinds.map((k) => {
    const rs = rows.filter((r) => r.kind === k);
    return { kind: k, n: rs.length, ok: rs.filter((r) => r.ok).length, instant: rs.filter((r) => r.instant).length, high: rs.filter((r) => r.confidence === "high").length };
  });
  const wrong = rows.filter((r) => r.kind.startsWith("wrong:") || r.kind.startsWith("reworded:"));
  const right = rows.filter((r) => r.kind.startsWith("right:"));
  // Dangerous: a wrong answer shown instantly as fine (no Claude, no error).
  const instantMisses = wrong.filter((r) => r.instant && !r.ok);
  const times = rows.map((r) => r.ms).sort((a, b) => a - b);
  const budgetWrong = wrong.reduce((n, r) => n + r.budget, 0) / Math.max(1, wrong.length);
  const budgetRight = right.reduce((n, r) => n + r.budget, 0) / Math.max(1, right.length);
  return {
    table,
    recall: { n: wrong.length, ok: wrong.filter((r) => r.ok).length },
    precision: { n: right.length, ok: right.filter((r) => r.ok).length },
    instantMisses,
    instantShare: { wrong: wrong.filter((r) => r.instant).length / Math.max(1, wrong.length), right: right.filter((r) => r.instant).length / Math.max(1, right.length) },
    budgetMs: { wrong: budgetWrong, right: budgetRight },
    // What-if: answers at this confidence with nothing found were shown at once (no wait for Claude).
    policy: (["high", "medium", "low"] as const).map((c) => ({
      confidence: c,
      wrongClean: wrong.filter((r) => r.confidence === c && r.clean).length,
      wrongAll: wrong.filter((r) => r.confidence === c).length,
      rightClean: right.filter((r) => r.confidence === c && r.clean).length,
      rightAll: right.filter((r) => r.confidence === c).length,
    })),
    timeMs: { median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1] },
  };
}

function render(s: ReturnType<typeof summarize>): string {
  const lines = [
    "| Case | n | handled correctly | shown instantly | high confidence |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...s.table.map((r) => `| ${r.kind} | ${r.n} | ${pct(r.ok, r.n)} | ${pct(r.instant, r.n)} | ${pct(r.high, r.n)} |`),
  ];
  return [
    `Wrong answers caught (recall): ${pct(s.recall.ok, s.recall.n)} of ${s.recall.n}`,
    `Right answers left alone (no false alarm): ${pct(s.precision.ok, s.precision.n)} of ${s.precision.n}`,
    `Wrong answers shown instantly as fine (must be 0): ${s.instantMisses.length}`,
    `Shown instantly: wrong ${(100 * s.instantShare.wrong).toFixed(1)}%, right ${(100 * s.instantShare.right).toFixed(1)}%`,
    `Average wait the app would allow for Claude: wrong ${Math.round(s.budgetMs.wrong)} ms, right ${Math.round(s.budgetMs.right)} ms`,
    `Rule-based grading time: median ${s.timeMs.median.toFixed(2)} ms, p95 ${s.timeMs.p95.toFixed(2)} ms, max ${s.timeMs.max.toFixed(1)} ms`,
    "",
    "If answers with nothing found were shown at once, by confidence (wrong ones would be shown as fine):",
    "",
    "| Confidence | wrong answers with nothing found | right answers with nothing found |",
    "| --- | ---: | ---: |",
    ...s.policy.map((p) => `| ${p.confidence} | ${p.wrongClean} of ${p.wrongAll} | ${p.rightClean} of ${p.rightAll} |`),
    "",
    ...lines,
  ].join("\n");
}

const isMain = process.argv[1]?.endsWith("grader-bench.ts");
if (isMain) {
  const rows = runBench(QUESTIONS);
  const s = summarize(rows);
  console.log(render(s));
  if (process.argv.includes("--misses")) {
    console.log("\nMissed wrong answers:");
    for (const r of rows.filter((x) => (x.kind.startsWith("wrong:") || x.kind.startsWith("reworded:")) && !x.ok)) console.log(`  ${r.kind.padEnd(28)} ${r.confidence.padEnd(7)} ${r.qid.padEnd(40)} ${r.answer}`);
    console.log("\nFalse alarms on right answers:");
    for (const r of rows.filter((x) => x.kind.startsWith("right:") && !x.ok)) console.log(`  ${r.kind.padEnd(24)} ${r.qid.padEnd(40)} ${r.answer}`);
  }
  const at = process.argv.indexOf("--report");
  if (at > 0) {
    const file = process.argv[at + 1];
    writeFileSync(file, `# Rule-based grader bench\n\nGenerated by \`npx tsx scripts/grader-bench.ts --report ${file}\` over ${QUESTIONS.filter((q) => !q.variation).length} questions.\n\n${render(s)}\n`);
    console.log(`\nwrote ${file}`);
  }
}
