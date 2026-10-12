import { describe, expect, it } from "vitest";
import { evaluateLocal, scoredErrors } from "@/engflow/core/evaluate";
import type { Question } from "@/engflow/core/types";

/**
 * Correct answers worded differently from every stored answer must not be
 * marked wrong, and real mistakes worded the same way must still be caught.
 * Cases come from content writers who tried hundreds of learner answers.
 */
const q = (reference: string, accepted: string[] = []): Question => ({
  id: "p", mode: "sentence", category: "meeting", topic: "t", topicKo: "t", level: "B1", difficulty: 4, skills: ["opinion"],
  promptKo: "테스트", segments: ["테스트"], reference, accepted, meaning: [], hints: { pattern: "p", skeleton: "s", partial: "p" }, explanationKo: "설명",
});

const majors = (question: Question, answer: string) => {
  const ev = evaluateLocal(question, answer);
  return { ev, majors: scoredErrors(ev.errors).filter((e) => e.severity !== "minor") };
};

const RIGHT: [string, string[], string][] = [
  ["Would it be possible to send the drawings by Friday?", ["Could you send the drawings by Friday?"], "Is it possible to send the drawings by Friday?"],
  ["If we had known earlier, we would have changed the design.", [], "If we had known about it earlier, we would have changed the design."],
  ["I'm planning to bring some snacks.", [], "I plan to bring some snacks."],
  ["I'd recommend staying near the office.", [], "I'd recommend you stay near the office."],
  ["I'd recommend staying near the office.", [], "I'd recommend that you stay near the office."],
  ["Let's go over the numbers again.", [], "Let's go through the numbers again."],
  ["I'm sorry, but you're not allowed to take photos here.", [], "Sorry, you're not allowed to take photos here."],
  ["Let's decide the date next week.", [], "Let's decide on the date next week."],
  ["Let's wait a few more minutes.", [], "Let's wait for a few more minutes."],
  ["Sales went up by 5% last quarter.", [], "Sales went up 5% last quarter."],
  ["Could you turn on your cameras?", [], "Could you turn your cameras on?"],
  ["I'll get back to you on that.", [], "I'll get back to you."],
  ["Linh, what do you think?", [], "Linh, what do you think about this?"],
  ["Thanks for your help.", [], "Thank you for your help."],
  ["I think the vendor sends the report on Friday.", [], "I think the vendor can send the report on Friday."],
  ["Shouldn't it be 12 tons per hour?", [], "Should it be 12 tons per hour?"],
  ["It will take about six more weeks.", [], "It will take six more weeks."],
  ["Talk to you soon.", [], "Talk soon."],
  ["I hope he gets better soon.", [], "Hope he gets better soon."],
  ["I don't think so.", [], "Don't think so."],
  ["Don't worry.", [], "Don't worry about it."],
  ["Let's discuss it after the meeting.", [], "Let's discuss it later."],
  ["The price includes the warranty for two years.", [], "The price includes the warranty of two years."],
  ["We can deliver it by the end of June.", [], "We can deliver it at the end of June."],
];

const WRONG: [string, string[], string][] = [
  ["We are still waiting for the data.", [], "We still waiting for the data."],
  ["The feed composition has changed.", [], "The feed composition is changed."],
  ["Thank you for helping me.", [], "Thank you for help me."],
  ["Please check the actual feed rate.", [], "Please check about the actual feed rate."],
  ["It depends on the feed rate.", [], "It depends of the feed rate."],
  ["I'm looking forward to meeting you.", [], "I'm looking forward to meet you."],
  ["We have already sent the drawings.", [], "We have already send the drawings."],
  ["Could you send me the report?", [], "Could you send to me the report?"],
  ["Is it possible to finish it by Friday?", [], "Is it possible finish it by Friday?"],
  ["I'm interested in the new design.", [], "I'm interesting in the new design."],
];

describe("reworded correct answers are not marked wrong", () => {
  for (const [ref, acc, answer] of RIGHT) {
    it(answer, () => {
      const { ev, majors: m } = majors(q(ref, acc), answer);
      expect(m.map((e) => `${e.category}: ${e.text} → ${e.fix}`)).toEqual([]);
      expect(ev.scores.overall).toBeGreaterThanOrEqual(85);
    });
  }
});

describe("real mistakes in the same sentences are still caught", () => {
  for (const [ref, acc, answer] of WRONG) {
    it(answer, () => {
      const { ev, majors: m } = majors(q(ref, acc), answer);
      expect(m.length > 0 || ev.scores.overall < 85).toBe(true);
    });
  }
});
