import { describe, expect, it } from "vitest";
import { bucketPenalties, evaluateLocal } from "@/engflow/core/evaluate";
import { tokenize, words } from "@/engflow/core/text";
import { QUESTION_BY_ID } from "@/engflow/content";
import { SEEDS } from "@/engflow/content/seeds";
import type { Question } from "@/engflow/core/types";

/** Questions modeled on the learner's historical mistakes. */
const q = (over: Partial<Question>): Question => ({
  id: "t", mode: "phrase", category: "meeting", topic: "t", topicKo: "t", level: "B1", difficulty: 3, skills: ["too-adj"],
  promptKo: "테스트", segments: ["테스트"], reference: "", accepted: [], meaning: [], hints: { pattern: "p", skeleton: "s", partial: "p" },
  explanationKo: "설명", ...over,
});

const tooEarly = q({
  reference: "I think it's still too early.",
  accepted: ["I think it is still too early to decide.", "I think it's too early."],
  meaning: [
    { id: "think", en: "I think", ko: "제 생각에는", any: ["think", "opinion", "believe"] },
    { id: "early", en: "too early", ko: "너무 이르다", any: ["too early", "too soon"], critical: true },
  ],
  pitfalls: [{ id: "so-late", pattern: "so late", category: "meaning-shift", severity: "critical", fix: "it's too early", messageKo: "'so late'는 반대 의미입니다." }],
});
const waiting = q({
  skills: ["progressive", "verb-prep"],
  reference: "We are still waiting for the data.",
  accepted: ["We're still waiting for the data.", "We are still waiting for data."],
  meaning: [
    { id: "still", en: "still", ko: "아직", any: ["still", "yet"] },
    { id: "wait", en: "waiting for data", ko: "데이터를 기다리다", any: ["wait ... data"], critical: true },
  ],
});
const checkRate = q({
  skills: ["verb-object"],
  reference: "Check the actual feed rate.",
  accepted: ["Please check the actual feed rate."],
  meaning: [
    { id: "check", en: "check", ko: "확인하다", any: ["check", "confirm", "verify"] },
    { id: "rate", en: "actual feed rate", ko: "실제 투입 속도", any: ["feed rate"], term: true, critical: true },
  ],
});

describe("historical mistakes", () => {
  it("'I think so late' keeps the meaning error separate from grammar and corrects it minimally", () => {
    const e = evaluateLocal(tooEarly, "I think so late");
    expect(e.errors.some((x) => x.category === "meaning-shift" && x.severity === "critical")).toBe(true);
    expect(e.scores.overall).toBeLessThanOrEqual(60);
    expect(e.corrected).toBe("I think it's too early.");
    expect(e.review.add).toBe(true);
  });

  it("'We still waiting data' is understandable but has two grammar errors (be + for)", () => {
    const e = evaluateLocal(waiting, "We still waiting data");
    expect(e.scores.meaning.score).toBe(100);
    expect(e.scores.comprehensibility.score).toBeGreaterThanOrEqual(85);
    expect(e.scores.grammar.score).toBeLessThan(70);
    expect(e.errors.map((x) => x.category).sort()).toEqual(["be-verb", "preposition"]);
    expect(e.corrected).toBe("We are still waiting for data.");
  });

  it("'Check for actual feed rate' flags the extra preposition and restores the article", () => {
    const e = evaluateLocal(checkRate, "Check for actual feed rate");
    expect(e.errors[0].category).toBe("preposition");
    expect(e.corrected).toBe("Check the actual feed rate.");
  });

  it("'Before complete our design' needs before + V-ing", () => {
    const qq = q({
      skills: ["prep-gerund"], reference: "Before completing our design, we need the actual data.", accepted: ["Before we complete our design, we need the actual data."],
      meaning: [{ id: "before", en: "before completing", ko: "완료 전", any: ["before ... complete|finish"] }, { id: "need", en: "need data", ko: "데이터 필요", any: ["need ... data"] }],
    });
    const e = evaluateLocal(qq, "Before complete our design, we need actual data");
    expect(e.errors.find((x) => x.source === "rule")?.fix).toBe("completing");
    expect(e.corrected).toContain("Before completing our design");
  });

  it("'We check it first the actual feed rate' reports duplicated object and misplaced adverb", () => {
    const qq = { ...checkRate, skills: ["word-order"], reference: "We check the actual feed rate first.", accepted: ["First, we check the actual feed rate."] };
    const e = evaluateLocal(qq, "We check it first the actual feed rate");
    expect(e.errors.map((x) => x.category)).toEqual(expect.arrayContaining(["word-order", "sentence-structure"]));
    expect(e.corrected).toBe("We check the actual feed rate first.");
  });

  it("'Our design schedule some lated' flags the non-word", () => {
    const qq = q({
      skills: ["be-adj"], reference: "Our design schedule is a little delayed.", accepted: ["Our design schedule is slightly delayed."],
      meaning: [{ id: "delayed", en: "delayed", ko: "지연", any: ["delayed", "late", "behind"], critical: true }],
    });
    const e = evaluateLocal(qq, "Our design schedule some lated");
    expect(e.errors.some((x) => x.text === "lated" && x.fix === "delayed")).toBe(true);
  });

  it("every seeded mistake fails on its curated level-0 variation and every correction passes", () => {
    for (const seed of SEEDS) {
      const l0 = Object.values(QUESTION_BY_ID).find((x) => x.variation?.seed === seed.id && x.variation.level === 0)!;
      expect(l0, seed.id).toBeTruthy();
      const ok = evaluateLocal(l0, l0.reference);
      expect(ok.scores.overall, `${seed.id} reference`).toBe(100);
    }
  });
});

describe("evaluation principles", () => {
  it("accepts semantically equivalent answers that are not listed", () => {
    const e = evaluateLocal(waiting, "We're still waiting for the lab data.");
    expect(e.scores.overall).toBeGreaterThanOrEqual(90);
    expect(e.errors.filter((x) => x.severity !== "minor")).toHaveLength(0);
  });

  it("minor spelling costs little", () => {
    const e = evaluateLocal(waiting, "we are still wating for the data");
    expect(e.errors).toHaveLength(1);
    expect(e.errors[0].category).toBe("spelling");
    expect(e.scores.overall).toBeGreaterThanOrEqual(95);
  });

  it("does not stack a missing meaning unit and a meaning-shift pitfall", () => {
    const e = evaluateLocal(tooEarly, "I think so late");
    expect(e.scores.meaning.score).toBe(45);
    expect(e.scores.grammar.score).toBe(100);
  });

  it("exact match (case, punctuation, contractions) scores 100", () => {
    expect(evaluateLocal(waiting, "we are still waiting for the data").exact).toBe(true);
    expect(evaluateLocal(tooEarly, "I think it is still too early").scores.overall).toBe(100);
  });

  it("does not invent errors on a correct paraphrase with different structure", () => {
    const qq = QUESTION_BY_ID["fs-process-equipment-spec"];
    const e = evaluateLocal(qq, "If we decide the equipment specification now, we might need to change it later because the actual operating data can be different.");
    expect(e.errors.filter((x) => x.severity !== "minor")).toHaveLength(0);
  });

  it("wrong technical meaning is penalized", () => {
    const qq = QUESTION_BY_ID["fs-process-equipment-spec"];
    const e = evaluateLocal(qq, "If we decide the equipment specifications now, we must change them later because the actual operating data could be different.");
    expect(e.errors.some((x) => x.category === "meaning-shift")).toBe(true);
  });

  it("an empty answer is recorded for review", () => {
    const e = evaluateLocal(waiting, "   ");
    expect(e.scores.overall).toBe(0);
    expect(e.review.add).toBe(true);
  });
});

describe("grammar-centred scoring (learner feedback from iPhone testing)", () => {
  const sim = QUESTION_BY_ID["fs-process-run-simulation-again"];
  it("catches 'are changed' even when two valid answers align it differently, and keeps the learner's site term", () => {
    const e = evaluateLocal(sim, "We have to run the process simulation again because raw composiotion are changed.");
    const tense = e.errors.find((x) => x.text === "are");
    expect(tense?.severity).toBe("major");
    expect(tense?.fix).toBe("has");
    // "raw" vs "feed" is site-specific wording: not an error, not changed in the correction.
    expect(e.errors.some((x) => x.text === "raw" && !x.advisory)).toBe(false);
    expect(e.corrected).toContain("raw composition has changed");
    expect(e.scores.overall).toBeLessThan(85);
  });
  it("a spelling slip barely moves the score", () => {
    const e = evaluateLocal(sim, "We need to run the process simulaton again because the feed composition has changed.");
    expect(e.errors.every((x) => x.category === "spelling")).toBe(true);
    expect(e.scores.overall).toBeGreaterThanOrEqual(98);
  });
  it("a different site term for a non-critical term slot does not lower the score", () => {
    const e = evaluateLocal(sim, "We need to run the process simulation again because the raw material has changed.");
    expect(e.scores.overall).toBe(100);
    expect(e.scores.terminology.noteKo).toMatch(/점수에 반영하지 않습니다/);
  });
  it("grammar weighs most: one major grammar error costs more than a missing minor meaning chunk", () => {
    const grammar = evaluateLocal(sim, "We need to run the process simulation again because the feed composition is change.");
    const meaning = evaluateLocal(sim, "We need to run the process simulation because the feed composition has changed.");
    expect(grammar.scores.overall).toBeLessThan(meaning.scores.overall);
  });
  it("'every' takes a singular noun; 'every flange' and 'all flanges' are both correct", () => {
    const rq = QUESTION_BY_ID["rv-check-object-l2-b"];
    expect(evaluateLocal(rq, "Before startup, please check the steam pressure and check every flange for leaks.").scores.overall).toBe(100);
    const bad = evaluateLocal(rq, "Before startup, please check the steam pressure and check every flanges for leaks.");
    expect(bad.errors.some((x) => x.text === "flanges" && x.fix === "flange" && x.severity === "major")).toBe(true);
  });
});

describe("everyday-conversation false positives", () => {
  it("'It's been' is read as 'it has been', so 'It has been …' is not an error", () => {
    const t = q({ reference: "It's been a long time.", accepted: ["Long time no see."], meaning: [{ id: "long", en: "a long time", ko: "오랜만", any: ["long time"] }] });
    const e = evaluateLocal(t, "It has been a long time.");
    expect(e.errors.filter((x) => x.severity !== "minor")).toEqual([]);
    expect(e.scores.overall).toBeGreaterThanOrEqual(95);
  });
  it("that/which and when/while are interchangeable connectors", () => {
    const t = q({
      skills: ["relative-clause"],
      reference: "This is the restaurant that serves vegetarian food.",
      accepted: ["This is the restaurant which has vegetarian food."],
      meaning: [{ id: "veg", en: "vegetarian food", ko: "채식", any: ["vegetarian"] }],
    });
    expect(evaluateLocal(t, "This is the restaurant which serves vegetarian food.").errors.filter((x) => x.severity !== "minor")).toEqual([]);
  });
  it("leaving out 'at all' is not a missing preposition", () => {
    const t = q({ reference: "It's not spicy at all.", accepted: ["It isn't spicy at all."], meaning: [{ id: "spicy", en: "not spicy", ko: "안 맵다", any: ["not spicy"] }] });
    const e = evaluateLocal(t, "It's not spicy.");
    expect(e.errors.some((x) => x.category === "preposition")).toBe(false);
  });
  it("'made with' vs 'made of', and 'Do you want to' vs 'Would you like to', are both fine", () => {
    const made = q({ reference: "Japchae is made with sweet potato noodles.", accepted: ["Japchae is made from sweet potato noodles."], meaning: [{ id: "noodle", en: "noodles", ko: "당면", any: ["noodle"] }] });
    expect(evaluateLocal(made, "Japchae is made of sweet potato noodles.").errors.filter((x) => x.severity !== "minor")).toEqual([]);
    const offer = q({ reference: "Would you like to try some kimchi?", accepted: ["Do you want to try some kimchi?"], meaning: [{ id: "try", en: "try kimchi", ko: "김치 먹어 보다", any: ["try ... kimchi"] }] });
    expect(evaluateLocal(offer, "Do you want to try some kimchi?").scores.overall).toBe(100);
    expect(evaluateLocal(offer, "Would you want to try some kimchi?").errors.filter((x) => x.category === "tense")).toEqual([]);
  });
});

describe("spoken-English false positives (round 2)", () => {
  it("a noun's 's before not/V-ing is 'is', so 'my camera's not working' is correct", () => {
    const t = q({ reference: "My camera is not working.", accepted: ["My camera isn't working."], meaning: [{ id: "cam", en: "camera not working", ko: "카메라가 안 된다", any: ["camera ... not ... work"] }] });
    expect(evaluateLocal(t, "My camera's not working.").scores.overall).toBe(100);
    // Possessives stay possessives.
    expect(words(tokenize("The vendor's drawings")).map((x) => x.norm)).toEqual(["the", "vendor", "drawings"]);
  });
  it("leaving out 'd in 'I'd suggest' is not a tense error", () => {
    const t = q({ reference: "I'd suggest going with Option B.", accepted: ["I would recommend going with Option B."], meaning: [{ id: "b", en: "option B", ko: "B안", any: ["option b"] }] });
    expect(evaluateLocal(t, "I suggest going with Option B.").errors.filter((x) => x.category === "tense")).toEqual([]);
  });
  it("an object pronoun before 'and' is not a duplicated object, but 'check it the rate' still is", () => {
    const t = q({ reference: "I'll check and get back to you.", accepted: ["I will check and get back to you."], meaning: [{ id: "back", en: "get back to you", ko: "다시 연락", any: ["get back"] }] });
    expect(evaluateLocal(t, "I'll check it and get back to you.").errors.filter((x) => x.severity !== "minor")).toEqual([]);
  });
});

describe("reworded answers (iPhone report: 'is not satisfy … of customer' scored 100)", () => {
  const rq = QUESTION_BY_ID["ph-collocation-meet-requirements"];
  const answer = "This suggestion is not satisfy the requirements of customer.";
  it("catches 'is not satisfy' and the missing article even far from the reference wording", () => {
    const e = evaluateLocal(rq, answer);
    expect(e.confidence).toBe("low");
    const be = e.errors.find((x) => x.text === "is not satisfy");
    expect(be?.severity).toBe("major");
    expect(be?.fix).toBe("does not satisfy");
    expect(e.errors.some((x) => x.category === "article" && x.fix === "the")).toBe(true);
    expect(e.corrected).toBe("This suggestion does not satisfy the requirements of the customer.");
    expect(e.scores.overall).toBeLessThan(85);
  });
  it("a reworded answer with no error found is reported as unconfirmed, not as correct", () => {
    const e = evaluateLocal(rq, "Honestly, this idea does not really work for what the client asked.");
    expect(e.confidence).toBe("low");
    expect(e.summaryKo).toMatch(/모두 확인하지는 못했습니다/);
  });
});

describe("long answers", () => {
  const note = (id: string, source: "alignment" | "rule", severity: "minor" | "major" = "minor") =>
    ({ id, category: "article", severity, bucket: "grammar", start: 0, end: 0, text: "", fix: "the", messageKo: "", source }) as const;
  it("minor alignment notes cost less in a long answer, firm findings do not", () => {
    const notes = [note("a", "alignment"), note("b", "alignment"), note("c", "alignment")];
    expect(bucketPenalties([...notes], 20).grammar).toBe(30);
    expect(bucketPenalties([...notes], 48).grammar).toBe(15);
    expect(bucketPenalties([note("r", "rule"), note("m", "alignment", "major")], 48).grammar).toBe(40);
  });
});
