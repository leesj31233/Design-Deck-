import { describe, expect, it } from "vitest";
import { runRules } from "@/engflow/core/rules";
import { tokenize, words } from "@/engflow/core/text";

const rulesOn = (s: string) => runRules(words(tokenize(s)));
const fired = (s: string) => rulesOn(s).map((r) => r.rule);

/** Mistakes Korean speakers make that the rules must catch without a reference answer. */
const WRONG: [string, string, string?][] = [
  // [sentence, rule, replacement]
  ["The moisture could be more high in the rainy season.", "more-short-adjective", "higher"],
  ["We should have checked it more early.", "more-short-adjective", "earlier"],
  ["Because of the more high steam flow, we need a bigger pipe.", "more-short-adjective", "higher"],
  ["What do you mean by a more big margin?", "more-short-adjective", "bigger"],
  ["I would very like to visit.", "very-verb", "really"],
  ["I'm not sure we very need such a big dryer.", "very-verb", "really"],
  ["Is one week enough long for the test?", "enough-order", "long enough"],
  ["Yes, I can hear you clear.", "adjective-for-adverb", "clearly"],
  ["Please check it careful before the meeting.", "adjective-for-adverb", "carefully"],
  ["Is called japchae.", "missing-subject-it", "It's"],
  ["Is still too early to select the dryer.", "missing-subject-it", "It's"],
  ["Yes, is snowing a lot here now.", "missing-subject-it", "it's"],
  ["I sorry, but I don't fully agree.", "missing-be-adjective", "am"],
  ["We ready to start.", "missing-be-adjective", "are"],
  ["How about leave the hotel at seven?", "preposition-base-verb", "leaving"],
  ["Please let me to pay tonight.", "let-make-to", ""],
  ["Today, there is three topics on the agenda.", "there-is-plural", "are"],
  ["What if we run a shorter test, maybe four week, instead?", "number-singular", "weeks"],
  ["Wow, that look so good!", "third-person-s", "looks"],
  ["That make sense.", "third-person-s", "makes"],
  ["It look good to me.", "third-person-s", "looks"],
  ["When the vendor will send the drawings, we can start.", "will-in-time-clause"],
  ["The work has delayed because of the rain.", "perfect-needs-passive"],
  ["This suggestion is not satisfy the requirements of the customer.", "be-base-verb"],
  ["It doesn't meet the requirements of customer.", "missing-article", "the"],
  ["I am plan to bring some snacks.", "be-base-verb", "plan"],
  ["We are need more time.", "be-base-verb", "need"],
  ["I'm worry about the schedule.", "be-participle", "worried"],
  ["Why don't you go back to the hotel and sleep since a few hours?", "since-duration", "for"],
  ["We might miss some details because there are so much numbers.", "much-plural", "many"],
  ["I'd suggest to stay at a hotel near the plant.", "verb-gerund-to", "staying"],
  ["No problem. Let me quick recap what we've discussed.", "adjective-before-verb", "quickly"],
  ["If it still is not work, I'll send you a video.", "be-base-verb"],
  ["If that is not suit you, I can join at 4 pm.", "be-base-verb"],
  ["Sure, let me to just go back to the previous slide.", "let-make-to", ""],
  ["Yes, that make a lot of sense.", "third-person-s", "makes"],
  ["Get some rest and feel more good soon!", "more-short-adjective", "better"],
  ["Do you have any plans for weekend?", "missing-article", "the"],
  ["Sorry, I think you cutting out.", "missing-be-progressive", "are"],
  ["If the new seal arrives in Monday, we can finish the repair.", "time-preposition", "on"],
  ["The shutdown starts on May... no, on June.", "time-preposition", "in"],
  ["Let's meet in 3 pm.", "time-preposition", "at"],
  ["We can finish it by Wednesday at latest.", "idiom-the", "the"],
];

/** Correct sentences that earlier versions of the rules flagged, plus tricky everyday English. */
const RIGHT = [
  "After the meeting, I will send you the revised schedule.",
  "This week we'll check the feed composition, and after that we will send you the results.",
  "Good question. I'll check and get back to you when I receive the lab data.",
  "Yes, I got it. Thank you for helping me with the hotel booking.",
  "Great idea!",
  "We need more big tanks for the new line.",
  "The more, the better.",
  "We'll make it to the meeting.",
  "I sure hope so.",
  "Keep it simple.",
  "Make it quick, please.",
  "Is everything okay?",
  "Is Monday okay for you?",
  "Is it ready?",
  "What about lunch?",
  "How about Thursday?",
  "How about we leave at seven?",
  "There's a lot of work this week.",
  "There are a few things to check.",
  "We close at six on Fridays.",
  "That works for me.",
  "Sounds good to me.",
  "It's been a long week.",
  "The pump has been fixed.",
  "We have fixed the pump.",
  "A two-week test is enough.",
  "We ran a four week test last year.",
  "Is the report done?",
  "Have them call me when they arrive.",
  "Let us know if you need anything.",
  "I hear you loud and clear.",
  "The milk went bad.",
  "It's big enough for the pilot.",
  "We have enough big drums.",
  "Everyone is ready.",
  "Thanks for having me.",
  "The team is ready, and they're waiting for you.",
  "Sorry to keep you waiting.",
  "Sorry to keep you waiting. The previous meeting ran over.",
  "I saw it coming.",
  "We are like family here.",
  "I'm planning to bring some snacks.",
  "We're going to visit the plant tomorrow.",
  "I'll resend it right away.",
  "Let me get it right this time.",
  "15% is too much for us.",
  "We need the data and report by Friday.",
  "I'll check it and report at the next meeting.",
  "I'd like to report.",
  "We report to the plant manager.",
  "What do you mean by 'soon'?",
  "Thursday's meeting is cancelled.",
  "I'm afraid we can't go higher than 90,000 dollars.",
  "We've been here since 2019.",
  "I haven't seen him since last week.",
  "Thanks so much.",
  "We don't have much time.",
  "Much more people came than we expected.",
  "I'd suggest to the team that we wait.",
  "Can you give me a quick update?",
  "Let's do a quick recap.",
  "We'll go by train.",
  "There was an increase in price.",
  "It's not work, it's fun.",
  "Keep it running while I check the valve.",
  "So are we still on track for the deadline on March 15?",
  "The plant was built in 2019.",
  "I'll get back to you by end of day.",
  "We'll start in June and finish on Friday at 5 pm.",
];

describe("grammar rules: Korean-speaker mistakes without a reference answer", () => {
  for (const [s, rule, fix] of WRONG) {
    it(`catches ${rule}: ${s}`, () => {
      const hit = rulesOn(s).find((r) => r.rule === rule);
      expect(hit, `rules fired: ${fired(s).join(", ") || "none"}`).toBeTruthy();
      if (fix !== undefined) expect(hit!.replacement).toBe(fix);
    });
  }
});

describe("grammar rules: no false alarms on correct everyday English", () => {
  for (const s of RIGHT) {
    it(`leaves alone: ${s}`, () => {
      expect(fired(s)).toEqual([]);
    });
  }
});
