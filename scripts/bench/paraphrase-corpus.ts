// Blind paraphrase corpus for the EngFlow answer grader.
// Written without looking at the grader's implementation or its scores.
// right: correct, natural answers that differ from the stored reference/accepted answers.
// wrong: paraphrased answers that each contain exactly one grammar mistake, with the fix.

export interface ParaphraseItem { qid: string; right: string[]; wrong: { text: string; error: string; fix: string }[] }

export const PARAPHRASES: ParaphraseItem[] = [
  {
    qid: "fs-operation-condensate-tank-full",
    right: [
      "The condensate tank is nearly full, so can you open the drain valve, please?",
      "Could you open the drain valve? The condensate tank is almost full.",
      "Since the condensate tank is nearly full, please open the drain valve.",
    ],
    wrong: [
      { text: "Because the condensate tank almost full, please open the drain valve.", error: "missing-be-verb", fix: "Because the condensate tank is almost full, please open the drain valve." },
      { text: "Can you open drain valve? The condensate tank is nearly full.", error: "missing-article", fix: "Can you open the drain valve? The condensate tank is nearly full." },
    ],
  },
  {
    qid: "ph-articles-new-pump",
    right: [
      "Actually, we need a new pump.",
      "I think we need a new pump.",
      "We need to get a new pump.",
    ],
    wrong: [
      { text: "Actually, we need new pump.", error: "missing-article", fix: "Actually, we need a new pump." },
      { text: "I think we are need a new pump.", error: "extra-be-verb", fix: "I think we need a new pump." },
    ],
  },
  {
    qid: "ph-collocation-received-data",
    right: [
      "Yesterday, we received the test data.",
      "Yes, we got the test data yesterday.",
      "The test data arrived yesterday.",
    ],
    wrong: [
      { text: "Yesterday we receive the test data.", error: "past-tense", fix: "Yesterday we received the test data." },
      { text: "Yes, we have received the test data yesterday.", error: "present-perfect-with-past-time", fix: "Yes, we received the test data yesterday." },
    ],
  },
  {
    qid: "ph-progressive-still-waiting-data",
    right: [
      "We're still waiting for the data.",
      "Actually, we're still waiting for the lab data.",
      "We're still waiting on the data from the lab.",
    ],
    wrong: [
      { text: "Actually, we still waiting for the lab data.", error: "missing-be-verb", fix: "Actually, we are still waiting for the lab data." },
      { text: "Unfortunately, we're still waiting the lab data.", error: "missing-preposition", fix: "Unfortunately, we're still waiting for the lab data." },
    ],
  },
  {
    qid: "ph-agreement-valve-doesnt-open",
    right: [
      "This valve does not open fully.",
      "This valve doesn't open all the way.",
      "This valve can't be opened fully.",
    ],
    wrong: [
      { text: "This valve don't open all the way.", error: "subject-verb-agreement", fix: "This valve doesn't open all the way." },
      { text: "The valve doesn't opens completely.", error: "verb-form-after-auxiliary", fix: "The valve doesn't open completely." },
    ],
  },
  {
    qid: "ph-degree-slightly-higher",
    right: [
      "Actually, the outlet temperature is a little above the design value.",
      "The outlet temperature is running slightly higher than the design value.",
      "The temperature at the outlet is a bit higher than the design value.",
    ],
    wrong: [
      { text: "The temperature at the outlet is a bit more higher than the design value.", error: "double-comparative", fix: "The temperature at the outlet is a bit higher than the design value." },
      { text: "Actually, the outlet temperature slightly above the design value.", error: "missing-be-verb", fix: "Actually, the outlet temperature is slightly above the design value." },
    ],
  },
  {
    qid: "ph-purpose-to-reduce",
    right: [
      "In order to lower the moisture content,",
      "To bring down the moisture content,",
      "In order to decrease the moisture content,",
    ],
    wrong: [
      { text: "In order to lowering the moisture content,", error: "verb-form-after-to", fix: "In order to lower the moisture content," },
      { text: "For bring down the moisture content,", error: "purpose-infinitive", fix: "To bring down the moisture content," },
    ],
  },
  {
    qid: "fs-pilot-check-moisture-before-increasing",
    right: [
      "Before we increase the feed rate, we should check the feed moisture.",
      "Let's check the feed moisture before we raise the feed rate.",
      "We need to check the moisture of the feed before increasing the feed rate.",
    ],
    wrong: [
      { text: "We should to check the moisture of the feed before raising the feed rate.", error: "modal-plus-to", fix: "We should check the moisture of the feed before raising the feed rate." },
      { text: "Before increase the feed rate, we need to check the feed moisture.", error: "gerund-after-preposition", fix: "Before increasing the feed rate, we need to check the feed moisture." },
    ],
  },
  {
    qid: "fs-pilot-when-test-finishes",
    right: [
      "When the test finishes tomorrow, I'll send you the dryer performance data.",
      "Once the test is over tomorrow, I'll send you the dryer performance data.",
      "I'll send the dryer performance data to you when the test finishes tomorrow.",
    ],
    wrong: [
      { text: "Once the test will be finished tomorrow, I'll send you the dryer performance data.", error: "future-in-time-clause", fix: "Once the test is finished tomorrow, I'll send you the dryer performance data." },
      { text: "After the test finish tomorrow, I'll send you the dryer performance data.", error: "subject-verb-agreement", fix: "After the test finishes tomorrow, I'll send you the dryer performance data." },
    ],
  },
  {
    qid: "ph-cause-because-of",
    right: [
      "The commissioning is running a little late because of a steam supply problem.",
      "Because of a problem with the steam supply, the commissioning is slightly delayed.",
      "Unfortunately, the commissioning is a bit delayed due to a steam supply issue.",
    ],
    wrong: [
      { text: "The commissioning is a bit delayed because a steam supply problem.", error: "because-without-of", fix: "The commissioning is a bit delayed because of a steam supply problem." },
      { text: "Because of a problem with the steam supply, the commissioning is delaying a little.", error: "passive-voice", fix: "Because of a problem with the steam supply, the commissioning is delayed a little." },
    ],
  },
  {
    qid: "ph-collocation-run-test",
    right: [
      "We'll run another drying test tomorrow.",
      "Tomorrow, we're going to do one more drying test.",
      "We're planning to carry out another drying test tomorrow.",
    ],
    wrong: [
      { text: "We're going to run one more drying tests tomorrow.", error: "noun-number", fix: "We're going to run one more drying test tomorrow." },
      { text: "Tomorrow, we'll do drying test one more time.", error: "missing-article", fix: "Tomorrow, we'll do the drying test one more time." },
    ],
  },
  {
    qid: "ph-modalnec-dont-have-to",
    right: [
      "The design doesn't need to be changed.",
      "It means we don't need to make any changes to the design.",
      "There's no need for us to change the design.",
    ],
    wrong: [
      { text: "It means we don't need change the design.", error: "missing-to-infinitive", fix: "It means we don't need to change the design." },
      { text: "The design doesn't need to be change.", error: "past-participle", fix: "The design doesn't need to be changed." },
    ],
  },
  {
    qid: "ph-modalnec-must-not-open",
    right: [
      "You must never open this valve during operation.",
      "No, this valve must never be opened during operation.",
      "You mustn't open this valve while the plant is in operation.",
    ],
    wrong: [
      { text: "You must never to open this valve during operation.", error: "modal-plus-to", fix: "You must never open this valve during operation." },
      { text: "You don't must open this valve while the plant is running.", error: "modal-negation", fix: "You must not open this valve while the plant is running." },
    ],
  },
  {
    qid: "ph-perfect-havent-decided",
    right: [
      "The final dryer capacity hasn't been decided yet.",
      "We haven't made a decision on the final dryer capacity yet.",
      "Actually, we haven't decided the final capacity of the dryer yet.",
    ],
    wrong: [
      { text: "We haven't decide the final capacity of the dryer yet.", error: "past-participle", fix: "We haven't decided the final capacity of the dryer yet." },
      { text: "We still haven't made decision on the final dryer capacity.", error: "missing-article", fix: "We still haven't made a decision on the final dryer capacity." },
    ],
  },
  {
    qid: "fs-operation-dryer-moisture-high",
    right: [
      "The moisture at the dryer outlet is slightly above the target, so we should lower the feed rate a little.",
      "Since the dryer outlet moisture is a bit higher than the target, we need to cut the feed rate slightly.",
      "We need to reduce the feed rate a little because the outlet moisture of the dryer is slightly higher than the target.",
    ],
    wrong: [
      { text: "Because the moisture at the dryer outlet is a bit higher than the target, so we have to lower the feed rate a little.", error: "double-conjunction", fix: "Because the moisture at the dryer outlet is a bit higher than the target, we have to lower the feed rate a little." },
      { text: "The dryer outlet moisture is a little higher than the target, so we need to reduce the feed rate little bit.", error: "missing-article", fix: "The dryer outlet moisture is a little higher than the target, so we need to reduce the feed rate a little bit." },
    ],
  },
  {
    qid: "ph-degree-much-higher",
    right: [
      "Yes, the pressure drop is much higher than we expected.",
      "The pressure drop is a lot higher than we expected.",
      "Actually, the pressure drop is much higher than we thought it would be.",
    ],
    wrong: [
      { text: "Yes, the pressure drop is very higher than we thought.", error: "very-with-comparative", fix: "Yes, the pressure drop is much higher than we thought." },
      { text: "Actually, the pressure drop is a lot more high than we expected.", error: "comparative-form", fix: "Actually, the pressure drop is a lot higher than we expected." },
    ],
  },
  {
    qid: "ph-gerund-by-increasing",
    right: [
      "By increasing the pressure of the steam,",
      "By boosting the steam pressure,",
      "By using higher steam pressure,",
    ],
    wrong: [
      { text: "By raise the pressure of the steam,", error: "gerund-after-preposition", fix: "By raising the pressure of the steam," },
      { text: "By using more high steam pressure,", error: "comparative-form", fix: "By using higher steam pressure," },
    ],
  },
  {
    qid: "fs-operation-seal-replaced-leak",
    right: [
      "We changed the feed pump's mechanical seal last week, but the leak hasn't been resolved yet.",
      "Even though the feed pump's mechanical seal was replaced last week, the leak hasn't been fixed yet.",
      "The mechanical seal on the feed pump was replaced last week, but the leak still hasn't been fixed.",
    ],
    wrong: [
      { text: "The feed pump's mechanical seal has been replaced last week, but the leak still hasn't been fixed.", error: "present-perfect-with-past-time", fix: "The feed pump's mechanical seal was replaced last week, but the leak still hasn't been fixed." },
      { text: "We changed the mechanical seal on the feed pump last week, but the leak still hasn't fixed.", error: "passive-voice", fix: "We changed the mechanical seal on the feed pump last week, but the leak still hasn't been fixed." },
    ],
  },
  {
    qid: "fs-pilot-dryer-tested-last-month",
    right: [
      "Because the feed was wetter than expected, the dryer that we tested last month didn't reach the 10 wt% target moisture.",
      "The dryer we tested last month wasn't able to reach the target moisture of 10 wt%, since the feed was wetter than we had expected.",
      "The feed was wetter than expected, so the dryer we tested last month couldn't bring the moisture down to the 10 wt% target.",
    ],
    wrong: [
      { text: "The dryer we tested it last month wasn't able to reach the target moisture of 10 wt%, because the feed was wetter than we expected.", error: "resumptive-pronoun", fix: "The dryer we tested last month wasn't able to reach the target moisture of 10 wt%, because the feed was wetter than we expected." },
      { text: "Because the feed was wetter than expected, the dryer we tested last month could not reached the 10 wt% target moisture.", error: "verb-form-after-modal", fix: "Because the feed was wetter than expected, the dryer we tested last month could not reach the 10 wt% target moisture." },
    ],
  },
  {
    qid: "fs-process-pressure-drop-pipe-size",
    right: [
      "Due to the increased steam flow, the pressure drop in the steam line is too high, so we have to increase the pipe size.",
      "The pressure drop in the steam line is too high because the steam flow has gone up, so we need to use a bigger pipe.",
      "The increased steam flow makes the pressure drop in the steam line too high, so we need to go up to a larger pipe size.",
    ],
    wrong: [
      { text: "Because of the steam flow has gone up, the pressure drop in the steam line is too high, so we need to use a larger pipe.", error: "because-of-with-clause", fix: "Because the steam flow has gone up, the pressure drop in the steam line is too high, so we need to use a larger pipe." },
      { text: "Because of the increased steam flow, the pressure drop in the steam line is too much high, so we need to increase the pipe size.", error: "too-much-with-adjective", fix: "Because of the increased steam flow, the pressure drop in the steam line is too high, so we need to increase the pipe size." },
    ],
  },
  {
    qid: "ph-cond1-unless",
    right: [
      "If we don't get the data by Friday,",
      "If the data doesn't arrive by Friday,",
      "If we haven't received the data by Friday,",
    ],
    wrong: [
      { text: "If we won't get the data by Friday,", error: "future-in-if-clause", fix: "If we don't get the data by Friday," },
      { text: "Unless the data doesn't come by Friday,", error: "unless-double-negative", fix: "Unless the data comes by Friday," },
    ],
  },
  {
    qid: "ph-tooadj-feed-too-wet",
    right: [
      "The feed is so wet that the dryer can't handle it.",
      "The dryer can't handle the feed because it's too wet.",
      "The feed is too wet for the dryer to deal with.",
    ],
    wrong: [
      { text: "The feed is too wet for the dryer to deal with it.", error: "redundant-object-pronoun", fix: "The feed is too wet for the dryer to deal with." },
      { text: "The feed is too wet that the dryer can't handle it.", error: "so-that-structure", fix: "The feed is so wet that the dryer can't handle it." },
    ],
  },
  {
    qid: "fs-process-equipment-spec",
    right: [
      "If we fix the equipment specifications now, we may have to change them later, since the actual operating data might be different.",
      "We may need to change the equipment specifications later if we decide on them now, because the actual operating data might turn out to be different.",
      "Because the actual operating data could be different, we might have to change the equipment specifications later if we decide on them now.",
    ],
    wrong: [
      { text: "If we finalize the equipment specifications now, we may need to change it later, since the actual operating data might be different.", error: "pronoun-agreement", fix: "If we finalize the equipment specifications now, we may need to change them later, since the actual operating data might be different." },
      { text: "We may have to change the equipment specifications later if we fix them now, because the actual operating data may different.", error: "missing-be-verb", fix: "We may have to change the equipment specifications later if we fix them now, because the actual operating data may be different." },
    ],
  },
  {
    qid: "fs-process-disagree-reduce-dryer-size",
    right: [
      "I understand your point, but I'm not sure we should cut the dryer size by 20%, since the pilot data showed that the feed moisture might be higher than the design value.",
      "I see what you mean, but the pilot data showed that the feed moisture could be higher than the design value, so I'm not sure we should make the dryer 20% smaller.",
      "I understand your concern, but I'm not sure whether we should reduce the dryer size by 20%, because according to the pilot data, the feed moisture could be higher than the design value.",
    ],
    wrong: [
      { text: "I understand your point, but I don't sure we should make the dryer 20% smaller, because the pilot data showed that the feed moisture could be higher than the design value.", error: "be-do-confusion", fix: "I understand your point, but I'm not sure we should make the dryer 20% smaller, because the pilot data showed that the feed moisture could be higher than the design value." },
      { text: "I understand what you mean, but I'm not sure we should reduce size of the dryer by 20%, since the pilot data showed that the feed moisture could be higher than the design value.", error: "missing-article", fix: "I understand what you mean, but I'm not sure we should reduce the size of the dryer by 20%, since the pilot data showed that the feed moisture could be higher than the design value." },
    ],
  },
  {
    qid: "ph-relative-which-means",
    right: [
      "The feed is wetter than we thought, which means more steam is needed.",
      "The feed is wetter than expected, and that means we need more steam.",
      "The feed is wetter than we expected, meaning that we need more steam.",
    ],
    wrong: [
      { text: "The feed is wetter than we expected, which mean that we need more steam.", error: "subject-verb-agreement", fix: "The feed is wetter than we expected, which means that we need more steam." },
      { text: "The feed is wetter than we thought, which means we need more steams.", error: "uncountable-noun", fix: "The feed is wetter than we thought, which means we need more steam." },
    ],
  },
  {
    qid: "ph-cond3-had-known",
    right: [
      "If we'd known that, we would've chosen a different pump.",
      "Had we known that, we would have selected a different pump.",
      "We would have gone with a different pump if we had known about that.",
    ],
    wrong: [
      { text: "If we knew about that, we would have picked a different pump.", error: "third-conditional-if-clause", fix: "If we had known about that, we would have picked a different pump." },
      { text: "If we had known about the chlorine, we would have choose another pump.", error: "past-participle", fix: "If we had known about the chlorine, we would have chosen another pump." },
    ],
  },
  {
    qid: "tk-discussion-agree-with-you",
    right: [
      "Yes, I think so too.",
      "Yes, I'm with you on that.",
      "Yes, I agree with that.",
    ],
    wrong: [
      { text: "Yes, I'm agree with you, Sari.", error: "extra-be-verb", fix: "Yes, I agree with you, Sari." },
      { text: "Yeah, I also agree to you.", error: "preposition", fix: "Yeah, I also agree with you." },
    ],
  },
  {
    qid: "tk-discussion2-any-other-ideas",
    right: [
      "Thank you, Sari. Does anybody else have any ideas?",
      "Thanks, Sari. What about the rest of you? Any other ideas?",
      "Thanks for that, Sari. Do any of you have any other ideas?",
    ],
    wrong: [
      { text: "Thanks, Sari. Do anybody else have any ideas?", error: "subject-verb-agreement", fix: "Thanks, Sari. Does anybody else have any ideas?" },
      { text: "Thank you, Sari. Does anyone else has any ideas?", error: "verb-form-after-auxiliary", fix: "Thank you, Sari. Does anyone else have any ideas?" },
    ],
  },
  {
    qid: "fs-business-option-cost-compare",
    right: [
      "Option 2's CAPEX is lower than Option 1's, but its OPEX is much higher.",
      "Compared with Option 1, Option 2 has a lower CAPEX but a much higher OPEX.",
      "For Option 2, the CAPEX is lower than for Option 1, but the OPEX is a lot higher.",
    ],
    wrong: [
      { text: "Compared with Option 1, Option 2 has a lower CAPEX, but its OPEX is much high.", error: "comparative-form", fix: "Compared with Option 1, Option 2 has a lower CAPEX, but its OPEX is much higher." },
      { text: "Although Option 2 has a lower CAPEX than Option 1, but its OPEX is much higher.", error: "double-conjunction", fix: "Although Option 2 has a lower CAPEX than Option 1, its OPEX is much higher." },
    ],
  },
  {
    qid: "tk-discussion2-on-track-deadline",
    right: [
      "So we can still meet the March 15 deadline, right?",
      "So we're still on track for the March 15 deadline, aren't we?",
      "Then can we still make the March 15 deadline?",
    ],
    wrong: [
      { text: "So we are still on track for the March 15 deadline, isn't it?", error: "tag-question", fix: "So we are still on track for the March 15 deadline, aren't we?" },
      { text: "Then will we still able to meet the March 15 deadline?", error: "missing-be-verb", fix: "Then will we still be able to meet the March 15 deadline?" },
    ],
  },
  {
    qid: "ph-clarify-what-means",
    right: [
      "Would you mind telling me what this abbreviation means?",
      "Sorry, could you tell me what PCN stands for?",
      "Can you explain what this abbreviation stands for?",
    ],
    wrong: [
      { text: "Sorry, can you explain what does this abbreviation mean?", error: "indirect-question-word-order", fix: "Sorry, can you explain what this abbreviation means?" },
      { text: "Would you mind to tell me what this abbreviation means?", error: "gerund-after-mind", fix: "Would you mind telling me what this abbreviation means?" },
    ],
  },
  {
    qid: "ph-cond2-if-i-were-you",
    right: [
      "If I were you, I'd check the steam trap first.",
      "If I were in your shoes, I would look at the steam trap first.",
      "I'd start by checking the steam trap if I were you.",
    ],
    wrong: [
      { text: "If I am you, I'd look at the steam trap first.", error: "second-conditional-if-clause", fix: "If I were you, I'd look at the steam trap first." },
      { text: "If I were in your position, I will check the steam trap first.", error: "second-conditional-main-clause", fix: "If I were in your position, I would check the steam trap first." },
    ],
  },
  {
    qid: "ph-cond3-had-decided-earlier",
    right: [
      "If we'd decided earlier,",
      "Had we made the decision earlier,",
      "If we'd made the decision sooner,",
    ],
    wrong: [
      { text: "If we made the decision sooner,", error: "third-conditional-if-clause", fix: "If we had made the decision sooner," },
      { text: "If we would have made the decision earlier,", error: "would-in-if-clause", fix: "If we had made the decision earlier," },
    ],
  },
  {
    qid: "tk-discussion-summarize-agreement",
    right: [
      "Sure, let me sum up. We agreed that Priya will send the revised datasheet by Friday and that we'll review it on Monday. If there aren't any major changes, we'll place the order next week.",
      "Of course. To summarize, we agreed that Priya is going to send the revised datasheet by Friday, and we'll go through it on Monday. If nothing big changes, we'll place the order next week.",
      "Sure, here's a quick summary. We agreed that Priya would send the revised datasheet by Friday and that we would review it on Monday. If there are no significant changes, we'll place the order next week.",
    ],
    wrong: [
      { text: "Sure, to sum up, we agreed that Priya is going to send the updated datasheet until Friday, and we'll review it on Monday. If there aren't any big changes, we'll place the order next week.", error: "preposition", fix: "Sure, to sum up, we agreed that Priya is going to send the updated datasheet by Friday, and we'll review it on Monday. If there aren't any big changes, we'll place the order next week." },
      { text: "Sure, let me sum up. We agreed that Priya will send the revised datasheet by Friday and we'll review it on Monday. If there is no big changes, we'll place the order next week.", error: "subject-verb-agreement", fix: "Sure, let me sum up. We agreed that Priya will send the revised datasheet by Friday and we'll review it on Monday. If there are no big changes, we'll place the order next week." },
    ],
  },
  {
    qid: "tk-online-hear-me",
    right: [
      "Can you all hear me okay?",
      "Can you hear me clearly?",
      "Is my voice coming through okay?",
    ],
    wrong: [
      { text: "Is my voice come through okay?", error: "progressive-form", fix: "Is my voice coming through okay?" },
      { text: "Does everybody can hear me okay?", error: "double-auxiliary", fix: "Can everybody hear me okay?" },
    ],
  },
  {
    qid: "tk-online2-speak-up",
    right: [
      "Sorry, would you mind speaking up a little?",
      "Sorry, could you speak a little more loudly?",
      "Sorry, Linh, could you speak up a bit, please?",
    ],
    wrong: [
      { text: "Sorry, can you talk a bit more louder?", error: "double-comparative", fix: "Sorry, can you talk a bit louder?" },
      { text: "Sorry, Linh, could you speak little bit louder?", error: "missing-article", fix: "Sorry, Linh, could you speak a little bit louder?" },
    ],
  },
  {
    qid: "tk-online-you-froze",
    right: [
      "Sorry, your video froze for a moment. Could you say the last part again?",
      "Sorry, you froze for a second there. Would you mind repeating the last part?",
      "Sorry, the screen froze for a moment. Can you repeat the last part, please?",
    ],
    wrong: [
      { text: "Sorry, your screen freezed for a second. Could you repeat the last part, please?", error: "irregular-past-tense", fix: "Sorry, your screen froze for a second. Could you repeat the last part, please?" },
      { text: "Sorry, the screen froze for a second. Can you say again the last part?", error: "word-order", fix: "Sorry, the screen froze for a second. Can you say the last part again?" },
    ],
  },
  {
    qid: "tk-online2-got-disconnected",
    right: [
      "Sorry, my connection dropped. Where were we?",
      "Sorry about that, I lost my connection. Where were we?",
      "Sorry, I got cut off. Where did we leave off?",
    ],
    wrong: [
      { text: "Sorry about that, I lost the connection. Where we were?", error: "question-word-order", fix: "Sorry about that, I lost the connection. Where were we?" },
      { text: "Sorry, I got disconnect. Where did we leave off?", error: "past-participle", fix: "Sorry, I got disconnected. Where did we leave off?" },
    ],
  },
  {
    qid: "tk-online2-too-early-for-you",
    right: [
      "Thank you for joining us so early. If it's too early for you, we're happy to start an hour later next time.",
      "Thanks for joining at such an early hour. If it's too early for you, next time we can start an hour later.",
      "Thanks so much for joining this early. Next time, if it's too early for you, we can always start an hour later.",
    ],
    wrong: [
      { text: "Thank you for join us so early. If it's too early for you, next time we can start one hour later.", error: "gerund-after-preposition", fix: "Thank you for joining us so early. If it's too early for you, next time we can start one hour later." },
      { text: "Thanks a lot for joining so early. If it's too early to you, we could start an hour later next time.", error: "preposition", fix: "Thanks a lot for joining so early. If it's too early for you, we could start an hour later next time." },
    ],
  },
  {
    qid: "tk-online-follow-up-email",
    right: [
      "So, to summarize, Budi is going to check the dryer data and Sari is going to update the schedule. I'll email the minutes after the meeting. If anything's wrong, please let me know by Friday.",
      "To sum up, Budi will check the dryer data and Sari will update the schedule. After the call, I'll send everyone the minutes by email. If you find any mistakes, please tell me by Friday.",
      "In summary, Budi will check the dryer data, and Sari will update the schedule. Once the call is over, I'll send out the minutes by email. If there's anything wrong, please let me know by Friday.",
    ],
    wrong: [
      { text: "So, to summarize, Budi is going to check the dryer data, and Sari will update the schedule. I'll email the minutes after the meeting finish. If anything is wrong, please let me know by Friday.", error: "subject-verb-agreement", fix: "So, to summarize, Budi is going to check the dryer data, and Sari will update the schedule. I'll email the minutes after the meeting finishes. If anything is wrong, please let me know by Friday." },
      { text: "In summary, Budi will check the dryer data, and Sari will update the schedule. Once the call is over, I'll send out the minutes by the email. If there's anything wrong, please let me know by Friday.", error: "extra-article", fix: "In summary, Budi will check the dryer data, and Sari will update the schedule. Once the call is over, I'll send out the minutes by email. If there's anything wrong, please let me know by Friday." },
    ],
  },
  {
    qid: "tk-online2-continue-tomorrow",
    right: [
      "I see what you mean, but it's already 9 p.m. here, and a few of us have to leave soon. Rather than extending the call, shall we continue at the same time tomorrow? That way, everyone will be able to concentrate better.",
      "I understand, but it's already 9 p.m. here, so some of us need to leave soon. Instead of making the call longer, why don't we pick it up tomorrow at the same time? That way, everybody can focus better.",
      "I know what you mean, but it's already nine o'clock at night here, and some of us need to go soon. Instead of extending this call, could we continue at the same time tomorrow? Then everyone will be able to focus better.",
    ],
    wrong: [
      { text: "I see what you mean, but it's already 9 p.m. here, and a few of us have to leave soon. Instead of extend the meeting, why don't we continue at the same time tomorrow? That way, everyone can focus better.", error: "gerund-after-preposition", fix: "I see what you mean, but it's already 9 p.m. here, and a few of us have to leave soon. Instead of extending the meeting, why don't we continue at the same time tomorrow? That way, everyone can focus better." },
      { text: "I understand, but it's already 9 p.m. here, so some of us need to leave soon. Instead of making the call longer, why don't we continue tomorrow in the same time? Then everybody can focus better.", error: "preposition", fix: "I understand, but it's already 9 p.m. here, so some of us need to leave soon. Instead of making the call longer, why don't we continue tomorrow at the same time? Then everybody can focus better." },
    ],
  },
  {
    qid: "tk-presentation-look-at-chart",
    right: [
      "Let's have a quick look at this graph.",
      "Please have a look at this chart.",
      "Take a look at this chart, please.",
    ],
    wrong: [
      { text: "Let's have a look this graph.", error: "missing-preposition", fix: "Let's have a look at this graph." },
      { text: "Please have a look at this charts.", error: "determiner-agreement", fix: "Please have a look at this chart." },
    ],
  },
  {
    qid: "tk-presentation2-go-back-slide",
    right: [
      "Of course, I'll go back to the previous slide.",
      "Sure, let me go back to the slide before this one.",
      "No problem, let me go back to the previous one.",
    ],
    wrong: [
      { text: "Of course, let me to go back to the slide before this one.", error: "verb-form-after-let", fix: "Of course, let me go back to the slide before this one." },
      { text: "No problem, I'll go back to previous one.", error: "missing-article", fix: "No problem, I'll go back to the previous one." },
    ],
  },
  {
    qid: "tk-presentation2-come-back-at-end",
    right: [
      "That's a good question. Could we come back to it at the end?",
      "Good question. Would it be okay if we came back to that at the end?",
      "That's a great question. Do you mind if we discuss that at the end?",
    ],
    wrong: [
      { text: "That's good question. Could we come back to it at the end?", error: "missing-article", fix: "That's a good question. Could we come back to it at the end?" },
      { text: "Good question. Is it okay if we discuss about that at the end?", error: "unnecessary-preposition", fix: "Good question. Is it okay if we discuss that at the end?" },
    ],
  },
  {
    qid: "tk-presentation-thats-all",
    right: [
      "Yes, that's the end of my presentation. If you have any questions, I'll be happy to answer them.",
      "Yes, that's it for my presentation. If there are any questions, I'd be glad to answer them.",
      "Yes, that brings me to the end of my presentation. I'm happy to answer any questions you have.",
    ],
    wrong: [
      { text: "Yes, that's it for my presentation. If there are any questions, I'd be glad to answer it.", error: "pronoun-agreement", fix: "Yes, that's it for my presentation. If there are any questions, I'd be glad to answer them." },
      { text: "Yes, that brings me to end of my presentation. I'm happy to answer any questions you have.", error: "missing-article", fix: "Yes, that brings me to the end of my presentation. I'm happy to answer any questions you have." },
    ],
  },
  {
    qid: "tk-presentation2-rephrase-question",
    right: [
      "If I understand you correctly, you're asking if we can use the same dryer for EFB as well.",
      "If I understand correctly, you want to know whether we can also use the same dryer for EFB.",
      "Just to make sure I understand, you're asking whether we can use the same dryer for EFB, right?",
    ],
    wrong: [
      { text: "If I understand you correctly, you want to know if can we use the same dryer for EFB too.", error: "indirect-question-word-order", fix: "If I understand you correctly, you want to know if we can use the same dryer for EFB too." },
      { text: "So if I understand correctly, you are ask if the same dryer can be used for EFB as well.", error: "progressive-form", fix: "So if I understand correctly, you are asking if the same dryer can be used for EFB as well." },
    ],
  },
  {
    qid: "tk-presentation2-one-limitation",
    right: [
      "Yes, but there's one limitation I should mention. All the tests were done only at half load, so we don't have any full-load data yet.",
      "Yes, but I need to point out one limitation. We ran all the tests at half load, so we have no data at full load yet.",
      "Yes, but I have to mention one limitation. Since all the tests were carried out at half load, we don't have any data at full load yet.",
    ],
    wrong: [
      { text: "Yes, but there's one limitation I should mention. We did all the tests at half load, so we don't have any full-load datas yet.", error: "uncountable-noun", fix: "Yes, but there's one limitation I should mention. We did all the tests at half load, so we don't have any full-load data yet." },
      { text: "Yes, but I need to point out one limitation. All the tests was carried out only at half load, so we have no data at full load yet.", error: "subject-verb-agreement", fix: "Yes, but I need to point out one limitation. All the tests were carried out only at half load, so we have no data at full load yet." },
    ],
  },
  {
    qid: "tk-presentation2-demo-crashed",
    right: [
      "I think the simulation has crashed. While I'm restarting it, I'll show you the results of yesterday's run instead. If it still doesn't work, I'll send you a short video after the meeting.",
      "It seems the simulation has frozen. Let me show you yesterday's results instead while I restart it. If it still won't work, I'll send you a short video after the meeting.",
      "The simulation seems to have crashed. While I restart it, let me show you the results from the run we did yesterday instead. If it still isn't working, I'll send you a short video once the meeting is over.",
    ],
    wrong: [
      { text: "I think the simulation has crashed. While I will restart it, I'll show you the results of yesterday's run instead. If it still doesn't work, I'll send you a short video after the meeting.", error: "future-in-time-clause", fix: "I think the simulation has crashed. While I restart it, I'll show you the results of yesterday's run instead. If it still doesn't work, I'll send you a short video after the meeting." },
      { text: "The simulation seems to have crashed. While I restart it, let me show you the results from yesterday's run instead. If it still won't work, I'll send you short video after the meeting.", error: "missing-article", fix: "The simulation seems to have crashed. While I restart it, let me show you the results from yesterday's run instead. If it still won't work, I'll send you a short video after the meeting." },
    ],
  },
  {
    qid: "tk-presentation2-local-dryer-trial",
    right: [
      "That's a good question, and the local dryer is certainly cheaper to buy. But it hasn't been tested with EFB yet, so if it can't reach the target moisture, we may need to add another dryer later. How about asking the local vendor for a short trial before we make a decision?",
      "Good question, and yes, the local dryer is definitely cheaper to buy. However, it has not been tested with EFB yet, so if it fails to reach the target moisture, we might have to install a second dryer later. Why don't we ask the local vendor to do a short trial before we decide?",
      "That's a fair question, and buying the local dryer would definitely cost less. However, nobody has tested it with EFB yet, so if it doesn't hit the target moisture, we might need to add one more dryer later. Shall we ask the local vendor for a short trial before deciding?",
    ],
    wrong: [
      { text: "That's a good question, and the local dryer is certainly cheaper to buy. But it hasn't tested with EFB yet, so if it can't reach the target moisture, we may need to add another dryer later. How about asking the local vendor for a short trial before we make a decision?", error: "passive-voice", fix: "That's a good question, and the local dryer is certainly cheaper to buy. But it hasn't been tested with EFB yet, so if it can't reach the target moisture, we may need to add another dryer later. How about asking the local vendor for a short trial before we make a decision?" },
      { text: "Good question, and the local dryer is definitely cheaper to buy. However, it has never been tested with EFB, so if it doesn't reach the target moisture, we might need to add a second dryer later. How about ask the local vendor for a short trial before we decide?", error: "gerund-after-how-about", fix: "Good question, and the local dryer is definitely cheaper to buy. However, it has never been tested with EFB, so if it doesn't reach the target moisture, we might need to add a second dryer later. How about asking the local vendor for a short trial before we decide?" },
    ],
  },
  {
    qid: "tk-reaction-fair-enough",
    right: [
      "That's understandable.",
      "Yeah, fair enough.",
      "Okay, that makes sense.",
    ],
    wrong: [
      { text: "Yes, I'm understand that.", error: "extra-be-verb", fix: "Yes, I understand that." },
      { text: "Yeah, that make sense.", error: "subject-verb-agreement", fix: "Yeah, that makes sense." },
    ],
  },
  {
    qid: "tk-reaction-makes-sense",
    right: [
      "You have a point there.",
      "That sounds reasonable.",
      "Yeah, that's a fair point.",
    ],
    wrong: [
      { text: "Yes, that's make sense.", error: "extra-be-verb", fix: "Yes, that makes sense." },
      { text: "Yes, you have point there.", error: "missing-article", fix: "Yes, you have a point there." },
    ],
  },
  {
    qid: "tk-reaction-afraid-not",
    right: [
      "Unfortunately, they won't be ready today.",
      "Sorry, I don't think so.",
      "I'm afraid they won't be ready today.",
    ],
    wrong: [
      { text: "I'm afraid they won't ready today.", error: "missing-be-verb", fix: "I'm afraid they won't be ready today." },
      { text: "Sorry, I'm not think so.", error: "be-do-confusion", fix: "Sorry, I don't think so." },
    ],
  },
  {
    qid: "tk-reaction-go-ahead",
    right: [
      "Of course, please go ahead.",
      "Absolutely, go ahead.",
      "Sure, the floor is yours.",
    ],
    wrong: [
      { text: "Sure, you can to go ahead.", error: "modal-plus-to", fix: "Sure, you can go ahead." },
      { text: "Of course, you can adding your point.", error: "verb-form-after-modal", fix: "Of course, you can add your point." },
    ],
  },
  {
    qid: "tk-reaction-you-too",
    right: [
      "Thanks, Sari, you too!",
      "Thank you! You have a great weekend too, Sari.",
      "Thanks, and the same to you, Sari!",
    ],
    wrong: [
      { text: "Thanks! You have a great weekends too, Sari.", error: "noun-number", fix: "Thanks! You have a great weekend too, Sari." },
      { text: "Thanks, Sari, you too! See you in Monday.", error: "preposition", fix: "Thanks, Sari, you too! See you on Monday." },
    ],
  },
  {
    qid: "tk-reaction-more-slowly",
    right: [
      "Would you mind speaking a little more slowly?",
      "Sorry, could you speak a bit more slowly, please?",
      "Could you go a bit slower, please?",
    ],
    wrong: [
      { text: "Would you mind to speak a little more slowly?", error: "gerund-after-mind", fix: "Would you mind speaking a little more slowly?" },
      { text: "Sorry, Priya, could you slow down little bit?", error: "missing-article", fix: "Sorry, Priya, could you slow down a little bit?" },
    ],
  },
  {
    qid: "tk-reaction-that-would-be-great",
    right: [
      "Yes, that would be really great. Thank you.",
      "That'd be wonderful. Thanks a lot.",
      "Oh, that would be fantastic. Thank you.",
    ],
    wrong: [
      { text: "Oh, that would be wonderful. Thank you for send a driver.", error: "gerund-after-preposition", fix: "Oh, that would be wonderful. Thank you for sending a driver." },
      { text: "That would be great. I'm really appreciate it.", error: "extra-be-verb", fix: "That would be great. I really appreciate it." },
    ],
  },
  {
    qid: "tk-reaction-see-your-point",
    right: [
      "I understand what you mean, but we don't have enough data yet.",
      "I know what you mean, but we haven't got enough data yet.",
      "I see your point, but the data we have isn't enough yet.",
    ],
    wrong: [
      { text: "I know what you mean, but we are not have enough data yet.", error: "be-do-confusion", fix: "I know what you mean, but we do not have enough data yet." },
      { text: "I understand what you mean, but we don't have data enough yet.", error: "word-order", fix: "I understand what you mean, but we don't have enough data yet." },
    ],
  },
  {
    qid: "tk-smalltalk-how-have-you-been",
    right: [
      "How have you been since then?",
      "How have things been with you?",
      "So, how's everything been with you?",
    ],
    wrong: [
      { text: "How you have been since then?", error: "question-word-order", fix: "How have you been since then?" },
      { text: "How were you doing since then?", error: "present-perfect", fix: "How have you been doing since then?" },
    ],
  },
  {
    qid: "tk-smalltalk-weekend",
    right: [
      "Good morning, Sari! Did you have a nice weekend?",
      "Morning, Sari! How did your weekend go?",
      "Good morning, Sari! Did you enjoy your weekend?",
    ],
    wrong: [
      { text: "Good morning, Sari! Did you had a nice weekend?", error: "verb-form-after-auxiliary", fix: "Good morning, Sari! Did you have a nice weekend?" },
      { text: "Morning, Sari! Do you enjoy your weekend?", error: "past-tense", fix: "Morning, Sari! Did you enjoy your weekend?" },
    ],
  },
  {
    qid: "tk-smalltalk-new-baby",
    right: [
      "Congratulations! Are your wife and baby doing well?",
      "Congratulations! How are your wife and your little girl doing?",
      "Congratulations! How's your wife doing? And the baby?",
    ],
    wrong: [
      { text: "Congratulations! Is your wife and baby both doing well?", error: "subject-verb-agreement", fix: "Congratulations! Are your wife and baby both doing well?" },
      { text: "Congratulations! How your wife and little girl are doing?", error: "question-word-order", fix: "Congratulations! How are your wife and little girl doing?" },
    ],
  },
  {
    qid: "tk-smalltalk-thanks-booking",
    right: [
      "Yes, I did. Thanks so much for helping me book the hotel.",
      "Yes, I received it. Thanks for your help with the hotel reservation.",
      "Yes, it came through. Thank you for helping me with the hotel booking.",
    ],
    wrong: [
      { text: "Yes, I was received it. Thanks for helping me book the hotel.", error: "extra-be-verb", fix: "Yes, I received it. Thanks for helping me book the hotel." },
      { text: "Yes, I did. Thank you to help me with the hotel booking.", error: "thank-you-for-gerund", fix: "Yes, I did. Thank you for helping me with the hotel booking." },
    ],
  },
  {
    qid: "tk-smalltalk-wait-until-joins",
    right: [
      "Let's just wait a few minutes until Daniel joins us.",
      "Let's give it a few minutes until Daniel joins the call.",
      "Why don't we wait a couple of minutes for Daniel to join?",
    ],
    wrong: [
      { text: "Let's just wait a couple of minutes until Daniel will join us.", error: "future-in-time-clause", fix: "Let's just wait a couple of minutes until Daniel joins us." },
      { text: "Let's wait few minutes until Daniel joins the call.", error: "missing-article", fix: "Let's wait a few minutes until Daniel joins the call." },
    ],
  },
  {
    qid: "tk-smalltalk-born-busan",
    right: [
      "No, I was born in Busan, but I was raised in Seoul.",
      "No, actually I was born in Busan. I grew up in Seoul, though.",
      "Not originally. I was born in Busan, but I grew up in Seoul.",
    ],
    wrong: [
      { text: "Not originally. I born in Busan, but I grew up in Seoul.", error: "passive-voice", fix: "Not originally. I was born in Busan, but I grew up in Seoul." },
      { text: "No, actually I was born in Busan, but I grow up in Seoul.", error: "past-tense", fix: "No, actually I was born in Busan, but I grew up in Seoul." },
    ],
  },
  {
    qid: "tk-smalltalk-coffee-in-seoul",
    right: [
      "That's great news! It's been ages since we last met in person. Let's grab a coffee while you're in Seoul.",
      "Great! We haven't seen each other in person for a long time. Let's get a coffee while you're here in Seoul.",
      "That's wonderful! It's been such a long time since we met face to face. We should have coffee together while you're in Seoul.",
    ],
    wrong: [
      { text: "Great news! We didn't see each other in person for a long time. Let's have a coffee while you're in Seoul.", error: "present-perfect", fix: "Great news! We haven't seen each other in person for a long time. Let's have a coffee while you're in Seoul." },
      { text: "That's wonderful! It has been really long time since we met face to face. Let's have coffee together while you're in Seoul.", error: "missing-article", fix: "That's wonderful! It has been a really long time since we met face to face. Let's have coffee together while you're in Seoul." },
    ],
  },
  {
    qid: "tk-smalltalk-if-more-time",
    right: [
      "Not yet. If I had more time, I'd take a trip to Europe with my family, but this year I'll probably just stay at home and rest.",
      "Nothing yet. I'd go on a trip to Europe with my family if I had more time. But this year, I'm probably just going to rest at home.",
      "Not yet. If I had more free time, my family and I would travel around Europe. This year, though, I'll probably just stay home and relax.",
    ],
    wrong: [
      { text: "Not yet. If I have more time, I'd take a trip to Europe with my family, but this year I'll probably just stay at home and rest.", error: "second-conditional-if-clause", fix: "Not yet. If I had more time, I'd take a trip to Europe with my family, but this year I'll probably just stay at home and rest." },
      { text: "Not yet. If I had more free time, I will travel around Europe with my family. This year, though, I'll probably just stay home and relax.", error: "second-conditional-main-clause", fix: "Not yet. If I had more free time, I would travel around Europe with my family. This year, though, I'll probably just stay home and relax." },
    ],
  },
  {
    qid: "tk-meal-too-spicy",
    right: [
      "Oh dear! Is it too spicy for you?",
      "Oh no! Is that too spicy for you?",
      "Oh, are you all right? Is it too spicy?",
    ],
    wrong: [
      { text: "Oh dear! Is it too much spicy?", error: "too-much-with-adjective", fix: "Oh dear! Is it too spicy?" },
      { text: "Oh no, does that too spicy for you?", error: "be-do-confusion", fix: "Oh no, is that too spicy for you?" },
    ],
  },
  {
    qid: "tk-meal-have-you-tried",
    right: [
      "Have you had bibimbap before?",
      "Have you ever tasted bibimbap?",
      "Have you tried bibimbap before?",
    ],
    wrong: [
      { text: "Have you ate bibimbap before?", error: "past-participle", fix: "Have you eaten bibimbap before?" },
      { text: "You have ever tasted bibimbap?", error: "question-word-order", fix: "Have you ever tasted bibimbap?" },
    ],
  },
  {
    qid: "tk-meal-more-rice",
    right: [
      "Excuse me, could you bring us two more bowls of rice, please?",
      "Excuse me, we'd like two more bowls of rice, please.",
      "Excuse me, can we get two more bowls of rice, please?",
    ],
    wrong: [
      { text: "Excuse me, can we get two more rices, please?", error: "uncountable-noun", fix: "Excuse me, can we get two more bowls of rice, please?" },
      { text: "Excuse me, could you bring us two more bowl of rice, please?", error: "noun-number", fix: "Excuse me, could you bring us two more bowls of rice, please?" },
    ],
  },
  {
    qid: "tk-meal-pork-in-dish",
    right: [
      "Excuse me, is there pork in this dish?",
      "Excuse me, is this dish made with pork?",
      "Excuse me, could you tell me if this dish has any pork in it?",
    ],
    wrong: [
      { text: "Excuse me, is this dish contain pork?", error: "be-do-confusion", fix: "Excuse me, does this dish contain pork?" },
      { text: "Excuse me, could you tell me if is there any pork in this dish?", error: "indirect-question-word-order", fix: "Excuse me, could you tell me if there is any pork in this dish?" },
    ],
  },
  {
    qid: "tk-meal-recommend-bulgogi",
    right: [
      "Then I'd suggest the bulgogi, since it's not spicy at all.",
      "In that case, try the bulgogi. It isn't spicy at all.",
      "Then how about the bulgogi? It's not spicy at all.",
    ],
    wrong: [
      { text: "In that case, I recommend you the bulgogi, because it isn't spicy at all.", error: "recommend-verb-pattern", fix: "In that case, I recommend the bulgogi, because it isn't spicy at all." },
      { text: "Then I'd suggest the bulgogi, since it doesn't spicy at all.", error: "be-do-confusion", fix: "Then I'd suggest the bulgogi, since it isn't spicy at all." },
    ],
  },
  {
    qid: "tk-meal-drinking-manners",
    right: [
      "Yes. When someone older is pouring you a drink, you should hold your glass with both hands.",
      "Yes. If an older person pours a drink for you, you should hold your glass with both hands.",
      "Yes. You're supposed to hold your glass with both hands when an older person pours you a drink.",
    ],
    wrong: [
      { text: "Yes. If an older person pour a drink for you, you should hold your glass with both hands.", error: "subject-verb-agreement", fix: "Yes. If an older person pours a drink for you, you should hold your glass with both hands." },
      { text: "Yes. When someone older pours you a drink, you should hold the glass with both hand.", error: "noun-number", fix: "Yes. When someone older pours you a drink, you should hold the glass with both hands." },
    ],
  },
  {
    qid: "tk-meal-vegetarian",
    right: [
      "That's no problem at all. I've reserved a table at a restaurant with lots of vegetarian dishes.",
      "Not at all. I've already booked a restaurant that has plenty of vegetarian options.",
      "No problem at all. I booked a restaurant with many vegetarian dishes.",
    ],
    wrong: [
      { text: "Not at all. I've already booked a restaurant that has plenty of vegetarian option.", error: "noun-number", fix: "Not at all. I've already booked a restaurant that has plenty of vegetarian options." },
      { text: "That's no problem at all. I've reserved a restaurant that have many vegetarian dishes.", error: "subject-verb-agreement", fix: "That's no problem at all. I've reserved a restaurant that has many vegetarian dishes." },
    ],
  },
  {
    qid: "tk-meal-if-i-were-you",
    right: [
      "They're both delicious, but if I were you, I would go for the cold noodles. It's really hot today, and cold noodles are perfect in this kind of weather.",
      "Both are tasty, but I'd try the cold noodles if I were you. It's very hot today, and they're just right for weather like this.",
      "Both of them are good, but if I were you, I'd have the cold noodles. It's so hot today, and they're perfect for this weather.",
    ],
    wrong: [
      { text: "Both of them is good, but if I were you, I'd have the cold noodles. It's so hot today, and they're perfect for this weather.", error: "subject-verb-agreement", fix: "Both of them are good, but if I were you, I'd have the cold noodles. It's so hot today, and they're perfect for this weather." },
      { text: "Both are tasty, but I'd try the cold noodles if I were you. It's very hot today, and they're perfect for this kind of weathers.", error: "uncountable-noun", fix: "Both are tasty, but I'd try the cold noodles if I were you. It's very hot today, and they're perfect for this kind of weather." },
    ],
  },
  {
    qid: "tk-phone-whos-calling",
    right: [
      "Excuse me, may I ask who's calling, please?",
      "May I ask who's speaking, please?",
      "Sure, could I ask who's calling?",
    ],
    wrong: [
      { text: "May I ask who is it?", error: "indirect-question-word-order", fix: "May I ask who it is?" },
      { text: "Excuse me, may I ask who calls?", error: "progressive-aspect", fix: "Excuse me, may I ask who's calling?" },
    ],
  },
  {
    qid: "tk-phone-breaking-up",
    right: [
      "Sorry, your voice is breaking up.",
      "Sorry, you keep cutting out.",
      "Sorry, I'm afraid you're breaking up.",
    ],
    wrong: [
      { text: "Sorry, your voice is break up.", error: "progressive-form", fix: "Sorry, your voice is breaking up." },
      { text: "Sorry, you keep cut out.", error: "gerund-after-keep", fix: "Sorry, you keep cutting out." },
    ],
  },
  {
    qid: "tk-phone-hold-on",
    right: [
      "Would you mind holding on for a moment?",
      "Could you give me a moment, please?",
      "Could you hold on for a second, please?",
    ],
    wrong: [
      { text: "Would you mind holding on for second?", error: "missing-article", fix: "Would you mind holding on for a second?" },
      { text: "Could you wait for a moments, please?", error: "noun-number", fix: "Could you wait for a moment, please?" },
    ],
  },
  {
    qid: "tk-phone-calling-about",
    right: [
      "Hello Priya, this is Minsu. I'm calling about the quotation for the pumps.",
      "Hi Priya, it's Minsu here. I'm calling about your pump quotation.",
      "Hi Priya, this is Minsu. I'm calling to talk about the pump quotation.",
    ],
    wrong: [
      { text: "Hello Priya, it's Minsu here. I call about your quotation for the pumps.", error: "progressive-aspect", fix: "Hello Priya, it's Minsu here. I'm calling about your quotation for the pumps." },
      { text: "Hi Priya, this is Minsu. I'm calling to talk the pump quotation.", error: "missing-preposition", fix: "Hi Priya, this is Minsu. I'm calling to talk about the pump quotation." },
    ],
  },
  {
    qid: "tk-phone-have-to-go",
    right: [
      "No, that's everything. Sorry, but I need to go now because I've got another meeting. Thank you for calling, Daniel.",
      "No, that's all for me. I'm afraid I have to hang up now, since I have another meeting. Thanks for the call, Daniel.",
      "No, I don't have any other questions. I'm sorry, but I have to go now because I have another meeting to attend. Thanks for calling, Daniel.",
    ],
    wrong: [
      { text: "No, that's everything. Sorry, but I need to go now since I have other meeting. Thank you for calling, Daniel.", error: "another-vs-other", fix: "No, that's everything. Sorry, but I need to go now since I have another meeting. Thank you for calling, Daniel." },
      { text: "No, that's all for me. I'm afraid I have to hang up now, because I have another meeting. Thank you for call, Daniel.", error: "gerund-after-preposition", fix: "No, that's all for me. I'm afraid I have to hang up now, because I have another meeting. Thank you for calling, Daniel." },
    ],
  },
  {
    qid: "tk-phone-schedule-call",
    right: [
      "What about Thursday afternoon? If that's not good for you, Friday morning works too.",
      "How does Thursday afternoon sound? If you can't make it then, Friday morning is fine as well.",
      "Would Thursday afternoon work for you? If not, Friday morning would also be fine.",
    ],
    wrong: [
      { text: "Is Thursday afternoon okay for you? If not, Friday morning also fine.", error: "missing-be-verb", fix: "Is Thursday afternoon okay for you? If not, Friday morning is also fine." },
      { text: "What about Thursday afternoon? If that doesn't works for you, Friday morning is fine too.", error: "verb-form-after-auxiliary", fix: "What about Thursday afternoon? If that doesn't work for you, Friday morning is fine too." },
    ],
  },
  {
    qid: "tk-phone-engineer-who",
    right: [
      "That's great. Can you text me the number of the engineer who is coming tomorrow?",
      "Great. Could you send me a text with the phone number of the engineer coming tomorrow?",
      "Good. Would you mind texting me the phone number of the engineer who's coming tomorrow?",
    ],
    wrong: [
      { text: "Great. Could you send me a text with the phone number of the engineer which is coming tomorrow?", error: "relative-pronoun", fix: "Great. Could you send me a text with the phone number of the engineer who is coming tomorrow?" },
      { text: "That's great. Would you mind texting me phone number of the engineer who's coming tomorrow?", error: "missing-article", fix: "That's great. Would you mind texting me the phone number of the engineer who's coming tomorrow?" },
    ],
  },
  {
    qid: "tk-phone-something-came-up",
    right: [
      "Sorry, I've got something urgent to deal with at the site. Could we push our call to tomorrow morning?",
      "I'm sorry, but something urgent has come up on site. Can we reschedule the call for tomorrow morning?",
      "Sorry, an urgent issue has come up at the site. Would it be okay to move our call to tomorrow morning?",
    ],
    wrong: [
      { text: "I'm sorry, but something urgent has came up on site. Can we reschedule the call for tomorrow morning?", error: "past-participle", fix: "I'm sorry, but something urgent has come up on site. Can we reschedule the call for tomorrow morning?" },
      { text: "Sorry, an urgent issue happened at the site. Would it be okay to move our call to the tomorrow morning?", error: "extra-article", fix: "Sorry, an urgent issue happened at the site. Would it be okay to move our call to tomorrow morning?" },
    ],
  },
  {
    qid: "tk-negotiation-best-price",
    right: [
      "What's the lowest price you can offer?",
      "What's the best you can do on the price?",
      "What's the best price you can offer us on the decanter?",
    ],
    wrong: [
      { text: "What is the most low price you can offer?", error: "superlative-form", fix: "What is the lowest price you can offer?" },
      { text: "What is best price you can give us?", error: "missing-article", fix: "What is the best price you can give us?" },
    ],
  },
  {
    qid: "tk-negotiation-price-too-high",
    right: [
      "Hmm, I'm afraid that price is a little too high for us.",
      "Hmm, that's a little too expensive for us.",
      "Hmm, 60,000 dollars is a bit too much for us.",
    ],
    wrong: [
      { text: "Hmm, I'm afraid that price is a little too high to us.", error: "preposition", fix: "Hmm, I'm afraid that price is a little too high for us." },
      { text: "Hmm, that's a little too much expensive for us.", error: "too-much-with-adjective", fix: "Hmm, that's a little too expensive for us." },
    ],
  },
  {
    qid: "tk-negotiation-we-have-a-deal",
    right: [
      "Good, then I think we have a deal.",
      "Great, so it looks like we have a deal.",
      "Perfect, I think we've got a deal then.",
    ],
    wrong: [
      { text: "Good, then I think we have deal.", error: "missing-article", fix: "Good, then I think we have a deal." },
      { text: "Great, it looks like we have reached to an agreement.", error: "unnecessary-preposition", fix: "Great, it looks like we have reached an agreement." },
    ],
  },
  {
    qid: "tk-negotiation-budget-limit",
    right: [
      "Sorry, but we can't go above 90,000 dollars, since that's the total budget for this package.",
      "I'm sorry, but 90,000 dollars is our total budget for this package, so we can't go any higher than that.",
      "I'm afraid we cannot exceed 90,000 dollars, as that's our entire budget for this package.",
    ],
    wrong: [
      { text: "Sorry, but we can't go above 90,000 dollar, since that's the total budget for this package.", error: "noun-number", fix: "Sorry, but we can't go above 90,000 dollars, since that's the total budget for this package." },
      { text: "I'm afraid we cannot exceed over 90,000 dollars, as that's our entire budget for this package.", error: "unnecessary-preposition", fix: "I'm afraid we cannot exceed 90,000 dollars, as that's our entire budget for this package." },
    ],
  },
  {
    qid: "tk-negotiation-extend-warranty",
    right: [
      "As this is a new design, would you be able to extend the warranty to two years?",
      "This one is a new design, so could you possibly extend the warranty to two years?",
      "Since it's a new design, is it possible to extend the warranty to two years?",
    ],
    wrong: [
      { text: "As this is new design, would you be able to extend the warranty to two years?", error: "missing-article", fix: "As this is a new design, would you be able to extend the warranty to two years?" },
      { text: "Since it's a new design, is it possible to extend the warranty until two years?", error: "preposition", fix: "Since it's a new design, is it possible to extend the warranty to two years?" },
    ],
  },
  {
    qid: "tk-negotiation-quoted-price-still-valid",
    right: [
      "Sure. First of all, is the price that you quoted us in March still valid?",
      "Sure. To start with, is the price you gave us in March still valid?",
      "Yes. First, does the price you quoted in March still stand?",
    ],
    wrong: [
      { text: "Sure. To start with, is the price that you give us in March still valid?", error: "past-tense", fix: "Sure. To start with, is the price that you gave us in March still valid?" },
      { text: "Sure. First of all, is the price you quoted us on March still valid?", error: "preposition", fix: "Sure. First of all, is the price you quoted us in March still valid?" },
    ],
  },
  {
    qid: "tk-negotiation-director-said",
    right: [
      "Yes. Our director said the price was okay, but he asked if you could extend the on-site technical support from four weeks to six. If you can do that, we'll be able to sign the contract this week.",
      "Yes, we did. Our director is fine with the price, but he wanted to know whether you could increase the on-site support from four to six weeks. If that's possible, we can sign the contract this week.",
      "Yes. The price is fine for our director, but he asked if you could extend the on-site support from four weeks to six weeks. If you're able to do that, we can sign the contract this week.",
    ],
    wrong: [
      { text: "Yes. Our director said the price was okay, but he asked if could you extend the on-site technical support from four weeks to six. If you can do that, we'll be able to sign the contract this week.", error: "indirect-question-word-order", fix: "Yes. Our director said the price was okay, but he asked if you could extend the on-site technical support from four weeks to six. If you can do that, we'll be able to sign the contract this week." },
      { text: "Yes, we did. Our director is fine with the price, but he wanted to know whether you could increase the on-site support from four to six week. If that's possible, we can sign the contract this week.", error: "noun-number", fix: "Yes, we did. Our director is fine with the price, but he wanted to know whether you could increase the on-site support from four to six weeks. If that's possible, we can sign the contract this week." },
    ],
  },
  {
    qid: "tk-negotiation-scope-change-pushback",
    right: [
      "I understand you'd like to keep the budget the same, but adding a second line would be a major change in scope. It would take our team roughly four more weeks. If you can agree to a 10% increase, we can get started next Monday.",
      "I see that you want to keep the budget as it is, but adding a second line changes the scope significantly. Our team would need about four additional weeks. If you're able to accept a 10% increase, we can start next Monday.",
      "I understand why you want to keep the same budget, but adding a second line means a big change to the scope, and it would take our team around four more weeks. If you accept a 10% increase, we can start next Monday.",
    ],
    wrong: [
      { text: "I understand you'd like to keep the budget the same, but add a second line would be a major change in scope. It would take our team roughly four more weeks. If you can agree to a 10% increase, we can start next Monday.", error: "gerund-as-subject", fix: "I understand you'd like to keep the budget the same, but adding a second line would be a major change in scope. It would take our team roughly four more weeks. If you can agree to a 10% increase, we can start next Monday." },
      { text: "I see that you want to keep the budget as it is, but adding a second line changes the scope significantly. Our team would need about four additional weeks. If you're able to accept 10% increase, we can start next Monday.", error: "missing-article", fix: "I see that you want to keep the budget as it is, but adding a second line changes the scope significantly. Our team would need about four additional weeks. If you're able to accept a 10% increase, we can start next Monday." },
    ],
  },
  {
    qid: "tk-visit2-this-way-please",
    right: [
      "Please follow me this way.",
      "It's this way. Please follow me.",
      "Come with me, please.",
    ],
    wrong: [
      { text: "Please come to this way.", error: "unnecessary-preposition", fix: "Please come this way." },
      { text: "Let's going this way.", error: "verb-form-after-let", fix: "Let's go this way." },
    ],
  },
  {
    qid: "tk-visit2-call-you-a-taxi",
    right: [
      "I'll call a taxi for you.",
      "Let me order a taxi for you.",
      "Why don't I call you a cab?",
    ],
    wrong: [
      { text: "Let me to order a taxi for you.", error: "verb-form-after-let", fix: "Let me order a taxi for you." },
      { text: "I'll call taxi for you.", error: "missing-article", fix: "I'll call a taxi for you." },
    ],
  },
  {
    qid: "tk-visit-running-late",
    right: [
      "Sorry, I'm stuck in traffic, so I think I'll be about ten minutes late.",
      "I'm sorry, the traffic is bad, so I'll probably be around ten minutes late.",
      "Sorry, I'm going to be about 10 minutes late because of the traffic.",
    ],
    wrong: [
      { text: "Sorry, because of the traffic is heavy, I'll be around ten minutes late.", error: "because-of-with-clause", fix: "Sorry, because the traffic is heavy, I'll be around ten minutes late." },
      { text: "Sorry, I'm going to be about ten minute late because of the traffic.", error: "noun-number", fix: "Sorry, I'm going to be about ten minutes late because of the traffic." },
    ],
  },
  {
    qid: "tk-visit-safety-briefing-when",
    right: [
      "Once we arrive at the site, I'll start by giving you a short safety briefing.",
      "When we reach the site, I'll first give you a quick safety briefing.",
      "As soon as we get to the site, I'm going to give you a short safety briefing first.",
    ],
    wrong: [
      { text: "Once we will arrive at the site, I'll start by giving you a short safety briefing.", error: "future-in-time-clause", fix: "Once we arrive at the site, I'll start by giving you a short safety briefing." },
      { text: "When we arrive to the site, I'll first give you a quick safety briefing.", error: "preposition", fix: "When we arrive at the site, I'll first give you a quick safety briefing." },
    ],
  },
  {
    qid: "tk-visit-sign-in-before-entering",
    right: [
      "You need to sign in at the security office before you go into the plant.",
      "Before you go into the plant, you have to register at the security office.",
      "You'll have to sign in at the security office before you enter the plant.",
    ],
    wrong: [
      { text: "Before go into the plant, you have to register at the security office.", error: "gerund-after-preposition", fix: "Before going into the plant, you have to register at the security office." },
      { text: "You'll have to sign in at the security office before you will enter the plant.", error: "future-in-time-clause", fix: "You'll have to sign in at the security office before you enter the plant." },
    ],
  },
  {
    qid: "tk-visit-thanks-looking-forward",
    right: [
      "Thanks so much for showing us around. I'm really looking forward to working with your team in the future.",
      "Thank you very much for the tour. We're really looking forward to working with you and your team.",
      "Thank you so much for giving us the tour. I really look forward to working together with your team.",
    ],
    wrong: [
      { text: "Thanks so much for showing us around. I'm really looking forward to work with your team in the future.", error: "gerund-after-to", fix: "Thanks so much for showing us around. I'm really looking forward to working with your team in the future." },
      { text: "Thank you so much for the tour. We are really look forward to working with your team.", error: "progressive-form", fix: "Thank you so much for the tour. We are really looking forward to working with your team." },
    ],
  },
  {
    qid: "tk-visit2-tour-cancelled-go-over",
    right: [
      "No worries, I understand. Since our morning will be free tomorrow, how about going through the pilot test results together instead?",
      "That's fine, I understand. We'll have tomorrow morning free, so why don't we review the pilot test results together instead?",
      "It's okay, I understand. As we'll be free tomorrow morning, shall we go over the pilot test results instead?",
    ],
    wrong: [
      { text: "No worries, I understand. Since our morning will be free tomorrow, how about review the pilot test results together instead?", error: "gerund-after-how-about", fix: "No worries, I understand. Since our morning will be free tomorrow, how about reviewing the pilot test results together instead?" },
      { text: "It's okay, I understand. As we'll be free in tomorrow morning, shall we go over the pilot test results instead?", error: "unnecessary-preposition", fix: "It's okay, I understand. As we'll be free tomorrow morning, shall we go over the pilot test results instead?" },
    ],
  },
  {
    qid: "tk-visit2-if-we-had-known-holiday",
    right: [
      "Oh, I had no idea. If we'd known earlier, we would've planned our trip differently. Could we possibly visit the plant on Friday instead?",
      "Oh, I didn't realize that. Had we known sooner, we would have arranged the trip differently. Is it possible for us to visit the plant on Friday instead?",
      "Oh, I wasn't aware of that. We would have planned the trip differently if we had known earlier. Would we be able to visit the plant on Friday instead?",
    ],
    wrong: [
      { text: "Oh, I had no idea. If we knew it earlier, we would have planned our trip differently. Could we possibly visit the plant on Friday instead?", error: "third-conditional-if-clause", fix: "Oh, I had no idea. If we had known it earlier, we would have planned our trip differently. Could we possibly visit the plant on Friday instead?" },
      { text: "Oh, I wasn't aware of that. We would have plan the trip differently if we had known earlier. Would we be able to visit the plant on Friday instead?", error: "past-participle", fix: "Oh, I wasn't aware of that. We would have planned the trip differently if we had known earlier. Would we be able to visit the plant on Friday instead?" },
    ],
  },
];
