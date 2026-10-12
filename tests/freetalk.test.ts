import { describe, expect, it } from "vitest";
import { TALK_TOPICS, TALK_TOPIC_BY_ID, TALK_TURNS, buildTalkPrompt, parseTalkReply, talkSummary, type TalkLine } from "@/engflow/core/freetalk";
import { SITUATIONS } from "@/engflow/core/types";

const topic = TALK_TOPIC_BY_ID["weekend-chat"];
const reply = (feedback: object, done = false) => ({ feedback, reply: { en: "Nice! What did you do on Sunday?", ko: "좋네요! 일요일엔 뭐 했어요?" }, done });

describe("free talk", () => {
  it("every topic has a known scene, an opener with Korean and a goal", () => {
    expect(new Set(TALK_TOPICS.map((t) => t.id)).size).toBe(TALK_TOPICS.length);
    for (const t of TALK_TOPICS) {
      expect(SITUATIONS).toContain(t.scene);
      expect(t.opener.en.length).toBeGreaterThan(5);
      expect(t.opener.ko.length).toBeGreaterThan(3);
      expect(t.goal.length).toBeGreaterThan(5);
    }
  });

  it("the prompt quotes the latest line verbatim, shows the talk so far and only lets it end near the last turn", () => {
    const lines = [{ who: "partner" as const, en: topic.opener.en }, { who: "me" as const, en: "It was great, I went hiking." }];
    const p = buildTalkPrompt(topic, lines, 1);
    expect(p).toContain('"""It was great, I went hiking."""');
    expect(p).toContain(`Sari: ${topic.opener.en}`);
    expect(p).toContain('Keep the conversation going ("done": false)');
    expect(buildTalkPrompt(topic, lines, TALK_TURNS)).toContain('"done": true when the conversation has reached a natural end');
  });

  it("a clean line keeps the learner's words; Claude's notes and natural version are passed on", () => {
    const ok = parseTalkReply(reply({ score: 100, notes: [], corrected: "", natural: "" }), "It was great, I went hiking.");
    expect(ok.feedback).toMatchObject({ score: 100, notes: [], corrected: "It was great, I went hiking." });
    expect(ok.feedback.natural).toBeUndefined();
    expect(ok.reply.en).toContain("Sunday");
    const withHint = parseTalkReply({ ...reply({ score: 100, notes: [], corrected: "" }), hint: { en: "We went to Bukhansan.", ko: "북한산에 갔어요." } }, "It was great.");
    expect(withHint.hint).toEqual({ en: "We went to Bukhansan.", ko: "북한산에 갔어요." });
    expect(TALK_TOPICS.every((t) => t.opener.hint?.en && t.opener.hint.ko)).toBe(true);
    const fixed = parseTalkReply(
      reply({ score: 70, notes: [{ text: "go hiking", fix: "went hiking", whyKo: "지난 일은 과거형입니다." }], corrected: "I went hiking yesterday.", natural: "I went hiking yesterday. It was great!" }),
      "I go hiking yesterday.",
    );
    expect(fixed.feedback.notes).toHaveLength(1);
    expect(fixed.feedback.natural).toBe("I went hiking yesterday. It was great!");
  });

  it("a major grammar-rule finding Claude left out is kept, fixed in the correction and caps the score", () => {
    const r = parseTalkReply(reply({ score: 100, notes: [], corrected: "", natural: "" }), "I am agree with your plan.");
    expect(r.feedback.notes.some((n) => n.rule)).toBe(true);
    expect(r.feedback.score).toBeLessThanOrEqual(70);
    expect(r.feedback.corrected).not.toContain("am agree");
  });

  it("an invalid reply is rejected", () => {
    expect(() => parseTalkReply({ feedback: { score: 100 } }, "Hi")).toThrow();
  });

  it("the summary counts clean lines and lists what to say next time", () => {
    const lines: TalkLine[] = [
      { who: "partner", en: topic.opener.en },
      { who: "me", en: "It was great.", feedback: { score: 100, notes: [], corrected: "It was great." } },
      { who: "partner", en: "What did you do?" },
      { who: "me", en: "I go hiking.", feedback: { score: 70, notes: [{ text: "go", fix: "went", whyKo: "과거형" }], corrected: "I went hiking." } },
    ];
    const s = talkSummary(lines);
    expect(s).toMatchObject({ turns: 2, average: 85, clean: 1 });
    expect(s.fixes).toEqual([{ said: "I go hiking.", better: "I went hiking.", notes: lines[3].feedback!.notes }]);
  });
});
