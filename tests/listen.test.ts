import { describe, expect, it } from "vitest";
import { appendSpoken, tidyTranscript } from "@/engflow/ui/listen";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { QUESTIONS } from "@/engflow/content";

describe("voice answers", () => {
  it("tidies what the recognizer heard: a capital first letter and a capital I", () => {
    expect(tidyTranscript("  i'm on my way ")).toBe("I'm on my way");
    expect(tidyTranscript("sure i can do that i think")).toBe("Sure I can do that I think");
    expect(tidyTranscript("")).toBe("");
  });

  it("joins spoken words onto what is already typed", () => {
    expect(appendSpoken("", "sounds good")).toBe("Sounds good");
    expect(appendSpoken("Sounds good.", "i'll send it tomorrow")).toBe("Sounds good. I'll send it tomorrow");
    expect(appendSpoken("Sounds good,", "see you then")).toBe("Sounds good, see you then");
    expect(appendSpoken("Thanks ", "")).toBe("Thanks ");
  });

  it("dictated questions and suggestions without '?' are not read as negative statements", async () => {
    const { QUESTION_BY_ID } = await import("@/engflow/content");
    const { isSuccess } = await import("@/engflow/core/celebration");
    const q = QUESTION_BY_ID["tk-online2-quick-poll"];
    expect(isSuccess(evaluateLocal(q, "why don't we do a quick poll to choose the date"), 0)).toBe(true);
  });

  it("a dictated reference (no punctuation, lower case) still scores 100 on every question", () => {
    const missed = QUESTIONS.filter((q) => evaluateLocal(q, q.reference.replace(/[.,!?;:](?!\d)/g, "").toLowerCase()).scores.overall < 100).map((q) => q.id);
    expect(missed).toEqual([]);
  });
});

describe("reversed meaning with negation-carrying words", () => {
  it("an inserted 'not' is caught even when 'out', 'still' or 'late' are in the sentence", async () => {
    const { QUESTIONS } = await import("@/engflow/content");
    const { isSuccess } = await import("@/engflow/core/celebration");
    // (A question whose accepted answers include a negative paraphrase — "we haven't received it yet" — is left to Claude.)
    const q = QUESTIONS.find((x) => x.id === "ph-progressive-still-waiting-data")!;
    expect(q).toBeTruthy();
    const flipped = q.reference.replace(/\b(are|is|'re)\b/, (m) => `${m} not`);
    expect(isSuccess(evaluateLocal(q, q.reference), 0)).toBe(true);
    expect(isSuccess(evaluateLocal(q, flipped), 0)).toBe(false);
  });
});

describe("rewordings around a shared 'not'", () => {
  it("'our food isn't here yet' for 'our food hasn't come yet' is not a tense error", async () => {
    const { QUESTION_BY_ID } = await import("@/engflow/content");
    const q = QUESTION_BY_ID["tk-daily-food-not-come"];
    const ev = evaluateLocal(q, q.reference.replace("hasn't come", "isn't here"));
    expect(ev.errors.filter((e) => e.category === "tense")).toEqual([]);
  });
});
