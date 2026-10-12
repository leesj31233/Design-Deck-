import { describe, expect, it } from "vitest";
import { numberSlip, numbersIn } from "@/engflow/core/numbers";
import { numberKey } from "@/engflow/core/numwords";
import { evaluateLocal } from "@/engflow/core/evaluate";
import { isSuccess } from "@/engflow/core/celebration";
import { tokenize, words } from "@/engflow/core/text";
import { QUESTIONS } from "@/engflow/content";
import type { Question } from "@/engflow/core/types";

const values = (s: string) => numbersIn(s).map((n) => n.value);
const slip = (answer: string, targets: string[]) => numberSlip(words(tokenize(answer)), answer, targets, targets[0]);

describe("reading numbers", () => {
  it("reads digits and words alike", () => {
    expect(values("It takes two and a half hours, or 2 and a half.")).toEqual([2.5, 2.5]);
    expect(values("We can't go over 90,000 dollars.")).toEqual([90000]);
    expect(values("two hundred and fifty people, twenty-five minutes, an eight-year-old")).toEqual([250, 25, 8]);
    expect(values("Let's meet at 5:30 on March 15th, or five thirty on the fifteenth.")).toEqual([5, 30, 15, 5, 30, 15]);
    expect(values("nineteen hundred, two thousand twenty-five")).toEqual([1900, 2025]);
  });

  it("'one' counts only when something is counted, and 'first'/'second' alone never", () => {
    expect(values("I'll take this one. One of the tests. No one came.")).toEqual([]);
    expect(values("One more week, please. See you at one.")).toEqual([1, 1]);
    expect(values("At first I had to wait a second.")).toEqual([]);
  });

  it("gives one spelling per number for matching, keeping ordinals apart", () => {
    expect(numberKey("three")).toBe(numberKey("3"));
    expect(numberKey("twenty-five")).toBe("25");
    expect(numberKey("four-week")).toBe(numberKey("4-week"));
    expect(numberKey("fifteenth")).toBe(numberKey("15th"));
    expect(numberKey("third")).not.toBe(numberKey("three"));
    expect(numberKey("first")).toBeUndefined();
  });
});

describe("a wrong number", () => {
  it("is found when the same thing is counted differently", () => {
    expect(slip("We can take Line 4 from here.", ["We can take Line 5 from here."])?.fix.raw).toBe("5");
    expect(slip("Here's twenty. Keep the change.", ["Here's thirty. Keep the change."])?.fix.raw).toBe("thirty");
    expect(slip("I'm running about ten minutes late.", ["I'm running about 15 minutes late."])?.at.raw).toBe("ten");
    // "at 4" pairs with "at 4", so the changed "5 pm" is the slip.
    expect(slip("5 pm your time is 11 pm here. I can join at 4.", ["4 pm your time is 11 pm here. I can join at 4."])?.fix.raw).toBe("4");
  });

  it("is not found for the same number in another spelling, another unit, or a number the answer adds", () => {
    expect(slip("It takes 3 weeks.", ["It takes three weeks."])).toBeNull();
    expect(slip("Could you extend the warranty to 24 months?", ["Could you extend the warranty to two years?"])).toBeNull();
    expect(slip("It takes about thirty minutes.", ["It takes about half an hour."])).toBeNull();
    expect(slip("Let's meet at 17:00.", ["Let's meet at 5 pm."])).toBeNull();
    expect(slip("It has changed for the third time.", ["It has changed three times."])).toBeNull();
  });

  it("makes a close answer a major meaning error with the right number in the correction", () => {
    const q = QUESTIONS.find((x) => /Line 4/.test(x.reference)) as Question;
    const wrong = evaluateLocal(q, q.reference.replace("Line 4", "Line 5"));
    expect(isSuccess(wrong, 0)).toBe(false);
    expect(wrong.errors.some((e) => e.category === "meaning-shift" && e.fix === "4")).toBe(true);
    expect(wrong.corrected).toContain("Line 4");
    expect(isSuccess(evaluateLocal(q, q.reference.replace("Line 4", "Line four")), 0)).toBe(true);
  });
});

describe("everyday synonyms in meaning chunks", () => {
  it("accept 'a cab' for 'a taxi' and 'fantastic' for 'great', but never in mistake patterns or exact alternatives", async () => {
    const { matchAny, matchPattern, compilePattern } = await import("@/engflow/core/pattern");
    const w = (s: string) => words(tokenize(s));
    expect(matchAny(["call ... taxi"], w("Why don't I call you a cab?"), 2, true)).not.toBeNull();
    expect(matchAny(["call ... taxi"], w("Why don't I call you a cab?"), 2)).toBeNull();
    expect(matchAny(["great|perfect"], w("That would be fantastic."), 2, true)).not.toBeNull();
    expect(matchAny(["=great"], w("That would be fantastic."), 2, true)).toBeNull();
    expect(matchPattern(compilePattern("take ... taxi"), w("Let's take a cab."))).toBeNull();
  });
});
