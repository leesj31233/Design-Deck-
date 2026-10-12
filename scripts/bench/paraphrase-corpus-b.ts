export interface ParaphraseItem { qid: string; right: string[]; wrong: { text: string; error: string; fix: string }[] }
export const PARAPHRASES: ParaphraseItem[] = [
  {
    qid: "fs-pilot-dryer-test-this-week",
    right: [
      "We're testing the new dryer at the pilot plant this week.",
      "This week, we're testing the new dryer at the pilot plant.",
      "Actually, we're running tests on the new dryer at the pilot plant this week.",
    ],
    wrong: [
      { text: "This week we testing the new dryer at the pilot plant.", error: "missing-be-progressive", fix: "This week we are testing the new dryer at the pilot plant." },
      { text: "At the pilot plant, we are testing the new dryer at this week.", error: "extra-preposition-time", fix: "At the pilot plant, we are testing the new dryer this week." },
    ],
  },
  {
    qid: "fs-operation-dryer-steam-demand",
    right: [
      "How much steam does the new dryer require at full load?",
      "At full load, how much steam does the new dryer need?",
      "Can you tell me how much steam the new dryer needs at full load?",
    ],
    wrong: [
      { text: "At full load, how much steam the new dryer needs?", error: "question-word-order", fix: "At full load, how much steam does the new dryer need?" },
      { text: "How much steams does the new dryer need when it runs at full load?", error: "uncountable-plural", fix: "How much steam does the new dryer need when it runs at full load?" },
    ],
  },
  {
    qid: "fs-pilot-feed-moisture-higher",
    right: [
      "The feed has a higher moisture content today than yesterday.",
      "The feed's moisture content is higher today than it was yesterday.",
      "Compared with yesterday, the moisture content of the feed is higher today.",
    ],
    wrong: [
      { text: "Today the feed moisture content is more higher than yesterday.", error: "double-comparative", fix: "Today the feed moisture content is higher than yesterday." },
      { text: "The feed have a higher moisture content today than yesterday.", error: "subject-verb-agreement", fix: "The feed has a higher moisture content today than yesterday." },
    ],
  },
  {
    qid: "ph-verbprep-depends-on",
    right: [
      "Well, it depends on the feed composition.",
      "That really depends on the composition of the feed.",
      "It'll depend on the feed composition.",
    ],
    wrong: [
      { text: "Well, it is depend on the composition of the feed.", error: "be-plus-base-verb", fix: "Well, it depends on the composition of the feed." },
      { text: "The size of the dryer depends the feed composition.", error: "missing-preposition", fix: "The size of the dryer depends on the feed composition." },
    ],
  },
  {
    qid: "fs-pilot-washing-time-ash",
    right: [
      "Last week we extended the washing time to lower the ash content of the EFB.",
      "We made the washing time longer last week to reduce the EFB's ash content.",
      "The washing time was increased last week to reduce the ash content of the EFB.",
    ],
    wrong: [
      { text: "Last week we have made the washing time longer to reduce the ash in the EFB.", error: "present-perfect-with-past-time", fix: "Last week we made the washing time longer to reduce the ash in the EFB." },
      { text: "Last week, we extended the washing time for reduce the EFB ash content.", error: "for-plus-verb-purpose", fix: "Last week, we extended the washing time to reduce the EFB ash content." },
    ],
  },
  {
    qid: "ph-cause-so-pellets",
    right: [
      "The moisture content was too high, and that's why the pellets broke.",
      "The pellets broke since the moisture content was too high.",
      "Basically, the moisture content was too high, which is why the pellets broke.",
    ],
    wrong: [
      { text: "Because the moisture content was too high, so the pellets broke apart.", error: "because-so-double-conjunction", fix: "Because the moisture content was too high, the pellets broke apart." },
      { text: "Our pellets cracked because of the moisture content was too high.", error: "because-of-plus-clause", fix: "Our pellets cracked because the moisture content was too high." },
    ],
  },
  {
    qid: "ph-modalposs-might-have-to-change",
    right: [
      "We may need to change the equipment specifications.",
      "The equipment specifications might have to be changed.",
      "Actually, we might have to modify the equipment specifications.",
    ],
    wrong: [
      { text: "Maybe we must to change the specifications of the equipment.", error: "modal-plus-to", fix: "Maybe we must change the specifications of the equipment." },
      { text: "The equipment specifications may have to be change.", error: "passive-past-participle", fix: "The equipment specifications may have to be changed." },
    ],
  },
  {
    qid: "fs-process-larger-dryer-rainy-season",
    right: [
      "In the rainy season the feed moisture could be higher, so we might need a larger dryer.",
      "We may need a bigger dryer, since the feed could be wetter during the rainy season.",
      "Because the feed might have more moisture in the rainy season, we may need a larger dryer.",
    ],
    wrong: [
      { text: "In the rainy season the feed moisture could be more high, so we might need a larger dryer.", error: "comparative-form", fix: "In the rainy season the feed moisture could be higher, so we might need a larger dryer." },
      { text: "We may need a larger dryer because the feed could has more moisture in the rainy season.", error: "modal-plus-inflected-verb", fix: "We may need a larger dryer because the feed could have more moisture in the rainy season." },
    ],
  },
  {
    qid: "ph-timeclause-as-soon-as",
    right: [
      "As soon as the pump repair is finished,",
      "As soon as the repairs on the pump are done,",
      "As soon as the maintenance team finishes repairing the pump,",
    ],
    wrong: [
      { text: "As soon as the maintenance team will finish the pump repair,", error: "will-in-time-clause", fix: "As soon as the maintenance team finishes the pump repair," },
      { text: "As soon as they finish to repair the pump,", error: "finish-plus-gerund", fix: "As soon as they finish repairing the pump," },
    ],
  },
  {
    qid: "fs-pilot-capacity-slightly-lower",
    right: [
      "The dryer's capacity was a bit lower than the vendor's guarantee, but it used much more steam than we expected.",
      "The capacity came in slightly below the vendor's guaranteed value, but the steam consumption was a lot higher than we'd expected.",
      "To be honest, the dryer capacity was slightly lower than what the vendor guaranteed, but the steam consumption was much higher than we had expected.",
    ],
    wrong: [
      { text: "The capacity of the dryer was slightly lower than the vendor's guarantee, but the steam consumption was very higher than we expected.", error: "very-with-comparative", fix: "The capacity of the dryer was slightly lower than the vendor's guarantee, but the steam consumption was much higher than we expected." },
      { text: "The dryer capacity was slightly lower than vendor's guaranteed value, but it used far more steam than we expected.", error: "missing-article", fix: "The dryer capacity was slightly lower than the vendor's guaranteed value, but it used far more steam than we expected." },
    ],
  },
  {
    qid: "fs-pilot-vendor-said-capacity",
    right: [
      "The vendor told us the dryer could process 2 t/h, but our pilot data only showed 1.6 t/h.",
      "According to the vendor, the dryer could handle 2 tons per hour, but our pilot data only showed 1.6 tons per hour.",
      "The vendor claimed that the dryer could handle 2 t/h, but our pilot data showed just 1.6 t/h.",
    ],
    wrong: [
      { text: "The vendor said us that the dryer could handle 2 t/h, but our pilot data only showed 1.6 t/h.", error: "say-with-indirect-object", fix: "The vendor told us that the dryer could handle 2 t/h, but our pilot data only showed 1.6 t/h." },
      { text: "According to the vendor, the dryer can handle 2 t/h, but our pilot data was showed only 1.6 t/h.", error: "unnecessary-be-with-past", fix: "According to the vendor, the dryer can handle 2 t/h, but our pilot data showed only 1.6 t/h." },
    ],
  },
  {
    qid: "ph-relative-pump-we-replaced",
    right: [
      "It's the pump that we replaced yesterday.",
      "The one we replaced yesterday.",
      "The pump which was replaced yesterday.",
    ],
    wrong: [
      { text: "It's the pump that we replaced it yesterday.", error: "resumptive-pronoun", fix: "It's the pump that we replaced yesterday." },
      { text: "It's the pump what was replaced yesterday.", error: "relative-pronoun-what", fix: "It's the pump that was replaced yesterday." },
    ],
  },
  {
    qid: "ph-modalnec-should-have-checked",
    right: [
      "We should've checked the steam trap earlier.",
      "Honestly, we should have looked at the steam trap earlier.",
      "The steam trap should have been checked earlier.",
    ],
    wrong: [
      { text: "I think we should have inspect the steam trap earlier.", error: "perfect-modal-past-participle", fix: "I think we should have inspected the steam trap earlier." },
      { text: "Looking back, we should had checked the steam trap earlier.", error: "modal-perfect-form", fix: "Looking back, we should have checked the steam trap earlier." },
    ],
  },
  {
    qid: "fs-operation-strainer-pump-trip",
    right: [
      "If we'd cleaned the suction strainer during the last shutdown, the pump wouldn't have tripped this morning, and we wouldn't be losing production now.",
      "The pump wouldn't have tripped this morning if the suction strainer had been cleaned during the last shutdown, and we wouldn't be losing production right now.",
      "To be honest, if we had cleaned the suction strainer in the last shutdown, the pump wouldn't have tripped this morning and we wouldn't be losing production now.",
    ],
    wrong: [
      { text: "If we have cleaned the suction strainer during the last shutdown, the pump wouldn't have tripped this morning and we wouldn't be losing production now.", error: "conditional-past-perfect", fix: "If we had cleaned the suction strainer during the last shutdown, the pump wouldn't have tripped this morning and we wouldn't be losing production now." },
      { text: "If the suction strainer had been cleaned in the last shutdown, the pump would not have tripped this morning, and we would not losing production now.", error: "missing-be-progressive", fix: "If the suction strainer had been cleaned in the last shutdown, the pump would not have tripped this morning, and we would not be losing production now." },
    ],
  },
  {
    qid: "tk-discussion2-who-goes-first",
    right: [
      "Great. Who'd like to kick things off?",
      "Okay, great. Who wants to start us off?",
      "Great. Would anyone like to go first?",
    ],
    wrong: [
      { text: "Great. Who want to share first?", error: "subject-verb-agreement", fix: "Great. Who wants to share first?" },
      { text: "Good. Who would like sharing an idea first?", error: "would-like-plus-gerund", fix: "Good. Who would like to share an idea first?" },
    ],
  },
  {
    qid: "tk-discussion2-park-that",
    right: [
      "That's a good point. Let's leave that for later.",
      "Good point, but let's set that aside for now.",
      "Good point. Let's put that on hold for now.",
    ],
    wrong: [
      { text: "That's a good point. Let's to discuss it next time.", error: "lets-plus-to", fix: "That's a good point. Let's discuss it next time." },
      { text: "Good point, but let's discuss about it later.", error: "discuss-about", fix: "Good point, but let's discuss it later." },
    ],
  },
  {
    qid: "ph-verbprep-focus-on",
    right: [
      "I suggest we focus on the dryer efficiency today.",
      "How about we focus on the dryer's efficiency today?",
      "Let's just concentrate on dryer efficiency today.",
    ],
    wrong: [
      { text: "Today, I suggest we focus the dryer's efficiency.", error: "missing-preposition", fix: "Today, I suggest we focus on the dryer's efficiency." },
      { text: "How about focus on the dryer efficiency today?", error: "how-about-plus-gerund", fix: "How about focusing on the dryer efficiency today?" },
    ],
  },
  {
    qid: "ph-perfect-vendor-just-sent",
    right: [
      "The vendor's just sent us the revised quote.",
      "We've just received the revised quotation from the vendor.",
      "Actually, the vendor just sent over the revised quotation.",
    ],
    wrong: [
      { text: "The vendor has just send us a revised quote.", error: "present-perfect-past-participle", fix: "The vendor has just sent us a revised quote." },
      { text: "We have just received the revised quotation from vendor.", error: "missing-article", fix: "We have just received the revised quotation from the vendor." },
    ],
  },
  {
    qid: "fs-meeting-equipment-list-update",
    right: [
      "Some motor sizes have changed, so Pak Budi's team has to update the equipment list before we send it to the client.",
      "Pak Budi's team will need to update the equipment list before it goes to the client, since some of the motor sizes have changed.",
      "Because some motor sizes have changed, the equipment list needs to be updated by Pak Budi's team before we send it to the client.",
    ],
    wrong: [
      { text: "Some of motor sizes have changed, so Pak Budi's team should update the equipment list before we send it to the client.", error: "missing-article-some-of-the", fix: "Some of the motor sizes have changed, so Pak Budi's team should update the equipment list before we send it to the client." },
      { text: "Before we will send the equipment list to the client, Pak Budi's team has to update it, because some motor sizes changed.", error: "will-in-time-clause", fix: "Before we send the equipment list to the client, Pak Budi's team has to update it, because some motor sizes changed." },
    ],
  },
  {
    qid: "fs-collab-test-duration-disagree",
    right: [
      "I understand what you're saying, but since the feed quality changes every day, I'm not sure one week is enough for the performance test.",
      "I see your point. But the feed quality changes daily, so I'm not sure one week will be enough for the performance test.",
      "I get your point, but I'm not convinced that a week is long enough for the performance test, because the feed quality varies from day to day.",
    ],
    wrong: [
      { text: "I see what you mean, but the feed quality change every day, so I'm not sure a week is enough for the performance test.", error: "subject-verb-agreement", fix: "I see what you mean, but the feed quality changes every day, so I'm not sure a week is enough for the performance test." },
      { text: "I understand your point, but I'm not sure is one week enough for the performance test because the feed quality changes daily.", error: "embedded-question-word-order", fix: "I understand your point, but I'm not sure one week is enough for the performance test because the feed quality changes daily." },
    ],
  },
  {
    qid: "tk-discussion2-worked-with-vendor-before",
    right: [
      "Linh, you've worked with Vendor B before, haven't you? How was it?",
      "Linh, have you had any experience with Vendor B? How did it go?",
      "Linh, have you ever worked with Vendor B before? What was it like?",
    ],
    wrong: [
      { text: "Linh, have you ever had a project with Vendor B? How it was?", error: "question-word-order", fix: "Linh, have you ever had a project with Vendor B? How was it?" },
      { text: "Linh, you've worked with Vendor B, right? Was it good experience?", error: "missing-article", fix: "Linh, you've worked with Vendor B, right? Was it a good experience?" },
    ],
  },
  {
    qid: "tk-discussion-meet-after-checking",
    right: [
      "The lab results are coming out on Thursday. How about we meet again next Monday, after we've looked at them?",
      "We'll have the lab results on Thursday, so why don't we check them first and meet again next Monday?",
      "The lab results will be out on Thursday. Shall we meet again next Monday, once we've checked them?",
    ],
    wrong: [
      { text: "We'll get the lab results on Thursday. Why we don't meet again next Monday after checking them?", error: "question-word-order", fix: "We'll get the lab results on Thursday. Why don't we meet again next Monday after checking them?" },
      { text: "The lab results will be ready in Thursday, so why don't we check them and meet again next Monday?", error: "wrong-preposition-time", fix: "The lab results will be ready on Thursday, so why don't we check them and meet again next Monday?" },
    ],
  },
  {
    qid: "ph-passive-could-have-been-avoided",
    right: [
      "Honestly, I think this delay could have been avoided.",
      "We could've avoided this delay.",
      "This delay didn't have to happen.",
    ],
    wrong: [
      { text: "Honestly, we could avoided this delay.", error: "missing-have-perfect-modal", fix: "Honestly, we could have avoided this delay." },
      { text: "I think this delay could have avoided.", error: "passive-missing-been", fix: "I think this delay could have been avoided." },
    ],
  },
  {
    qid: "tk-online2-time-there",
    right: [
      "Oh, what time is it where you are?",
      "Oh, what time is it in India right now?",
      "Oh, so what's the time over there?",
    ],
    wrong: [
      { text: "Oh, what time it is in India now?", error: "question-word-order", fix: "Oh, what time is it in India now?" },
      { text: "Oh, what time is there now?", error: "missing-dummy-it", fix: "Oh, what time is it there now?" },
    ],
  },
  {
    qid: "tk-online-on-mute",
    right: [
      "Sari, it looks like you're on mute.",
      "Sari, I think your microphone is muted.",
      "Sari, you might be on mute.",
    ],
    wrong: [
      { text: "Sari, it looks like you on mute.", error: "missing-be", fix: "Sari, it looks like you're on mute." },
      { text: "Sari, I think you are muting.", error: "active-for-passive", fix: "Sari, I think you are muted." },
    ],
  },
  {
    qid: "tk-online-agenda-items",
    right: [
      "Today, we've got three items on the agenda.",
      "There are three items on today's agenda.",
      "We have three things to cover today.",
    ],
    wrong: [
      { text: "Today there are three item on our agenda.", error: "plural-noun", fix: "Today there are three items on our agenda." },
      { text: "There is three items on today's agenda.", error: "there-be-agreement", fix: "There are three items on today's agenda." },
    ],
  },
  {
    qid: "tk-online-wait-until-join",
    right: [
      "Let's give Mr. Tan a few more minutes to join.",
      "Why don't we wait a few more minutes until Mr. Tan joins us?",
      "Let's hold on for a few more minutes until Mr. Tan is on the call.",
    ],
    wrong: [
      { text: "Let's wait few more minutes until Mr. Tan joins the meeting.", error: "missing-article-a-few", fix: "Let's wait a few more minutes until Mr. Tan joins the meeting." },
      { text: "We should wait a few more minutes until Mr. Tan will join us.", error: "will-in-time-clause", fix: "We should wait a few more minutes until Mr. Tan joins us." },
    ],
  },
  {
    qid: "tk-online2-switch-presenter",
    right: [
      "Sure, let me stop sharing my screen so you can share yours.",
      "No problem. I'll stop sharing now so you can share your screen.",
      "Of course. I'll stop my screen share so that you can share yours.",
    ],
    wrong: [
      { text: "Of course. I'll stop sharing my screen so you can share your.", error: "possessive-pronoun", fix: "Of course. I'll stop sharing my screen so you can share yours." },
      { text: "Sure. Let me stop sharing so you can sharing your screen.", error: "modal-plus-ing", fix: "Sure. Let me stop sharing so you can share your screen." },
    ],
  },
  {
    qid: "tk-online2-question-in-chat",
    right: [
      "Linh's just posted a question in the chat. I'll read it out.",
      "Linh has just typed a question in the chat, so let me read it out.",
      "Oh, Linh just left a question in the chat. Let me read it aloud.",
    ],
    wrong: [
      { text: "Linh just wrote a question in the chat. Let me reading it out.", error: "let-plus-ing", fix: "Linh just wrote a question in the chat. Let me read it out." },
      { text: "Linh just typed question in the chat. I'll read it out for you.", error: "missing-article", fix: "Linh just typed a question in the chat. I'll read it out for you." },
    ],
  },
  {
    qid: "tk-online2-running-out-of-time",
    right: [
      "Sorry, but we're almost out of time. Could we go over the spare parts list in Thursday's meeting?",
      "Unfortunately, we're running out of time. Would you mind if we discussed the spare parts list at our Thursday meeting?",
      "I'm afraid we don't have much time left. Is it okay if we cover the spare parts list at Thursday's meeting?",
    ],
    wrong: [
      { text: "Sorry, we are run out of time. Could we talk about the spare parts list at our meeting on Thursday?", error: "be-plus-base-verb", fix: "Sorry, we are running out of time. Could we talk about the spare parts list at our meeting on Thursday?" },
      { text: "I'm afraid we don't have much time left. Is it okay if we will go through the spare parts list at Thursday's meeting?", error: "will-in-if-clause", fix: "I'm afraid we don't have much time left. Is it okay if we go through the spare parts list at Thursday's meeting?" },
    ],
  },
  {
    qid: "tl-online-agenda-change",
    right: [
      "Sure, but before we begin, there's been a small change to the agenda. Sari needs to leave at eleven, so let's do her schedule update first and then move on to the dryer issues.",
      "Yes, but before we get started, the agenda has changed a little. Sari has to leave at eleven, so we'll go through her schedule update first, and after that we'll move on to the dryer issues.",
      "Yes. Before we start, though, there's a small change to the agenda. Since Sari has to leave at eleven, let's cover her schedule update first and then move on to the dryer issues.",
    ],
    wrong: [
      { text: "Yes, but before we start, the agenda has changed a little. Sari have to leave at eleven, so let's do her schedule update first and then move on to the dryer issues.", error: "subject-verb-agreement", fix: "Yes, but before we start, the agenda has changed a little. Sari has to leave at eleven, so let's do her schedule update first and then move on to the dryer issues." },
      { text: "Sure, but before we start, there's a small change to the agenda. Sari has to leave at eleven, so let's going through her schedule update first, and then we'll move on to the dryer issues.", error: "lets-plus-ing", fix: "Sure, but before we start, there's a small change to the agenda. Sari has to leave at eleven, so let's go through her schedule update first, and then we'll move on to the dryer issues." },
    ],
  },
  {
    qid: "tl-online-wait-for-operators",
    right: [
      "I don't want to delay things, but I don't feel comfortable making this decision without Budi's team. They're the people who are actually going to run the plant, so if we change the control philosophy now, they should at least get a chance to give their opinion. Could we wait until Thursday, when they're able to join?",
      "I really don't want to slow things down, but I'm not comfortable deciding this without Budi's team. Since they'll be the ones operating the plant, they should at least have a say if we change the control philosophy now. Can we wait until Thursday, when they can join us?",
      "I don't want to hold things up, but I'm not comfortable with deciding this without Budi's team. They're the ones who will actually operate the plant, so if the control philosophy changes now, they should at least have some input. Would it be possible to wait until Thursday, when they can join?",
    ],
    wrong: [
      { text: "I don't want to slow things down, but I don't feel comfortable deciding this without Budi's team. They are the people who is going to run the plant, so if we change the control philosophy now, they should at least have a say. Could we wait until Thursday, when they can join?", error: "relative-clause-agreement", fix: "I don't want to slow things down, but I don't feel comfortable deciding this without Budi's team. They are the people who are going to run the plant, so if we change the control philosophy now, they should at least have a say. Could we wait until Thursday, when they can join?" },
      { text: "I don't want to delay things, but I'm not comfortable making this decision without Budi's team. They will actually operate the plant, so if we change the control philosophy now, they should at least have a say. Can we wait by Thursday, when they can join us?", error: "by-vs-until", fix: "I don't want to delay things, but I'm not comfortable making this decision without Budi's team. They will actually operate the plant, so if we change the control philosophy now, they should at least have a say. Can we wait until Thursday, when they can join us?" },
    ],
  },
  {
    qid: "tk-presentation2-make-sense",
    right: [
      "That's right. Does that make sense to you?",
      "Yes, exactly. Is that clear?",
      "Yes, that's exactly it. Does it make sense?",
    ],
    wrong: [
      { text: "That's right. Is it make sense?", error: "be-instead-of-do-question", fix: "That's right. Does it make sense?" },
      { text: "Yes, that's right. Does it makes sense to you?", error: "do-support-base-form", fix: "Yes, that's right. Does it make sense to you?" },
    ],
  },
  {
    qid: "tk-presentation-introduce-topic",
    right: [
      "Thanks. Today I'm going to tell you about the results of our pilot test.",
      "Thank you. Today I'd like to share our pilot test results with you.",
      "Thank you, Mr. Tan. Today I'll be talking about the results from our pilot test.",
    ],
    wrong: [
      { text: "Thank you. Today I would like to talk our pilot test results.", error: "missing-preposition", fix: "Thank you. Today I would like to talk about our pilot test results." },
      { text: "Thank you. Today I'm going to explain about the results of our pilot test.", error: "explain-about", fix: "Thank you. Today I'm going to explain the results of our pilot test." },
    ],
  },
  {
    qid: "pv-point-out-slide",
    right: [
      "Oh, you're right. Thank you for catching that. I'll correct the slide.",
      "You're absolutely right, thanks for pointing it out. I'll fix that slide.",
      "You're right. Thanks for pointing that out. I'll get the slide fixed.",
    ],
    wrong: [
      { text: "Oh, you are right. Thanks for point it out. I will correct the slide.", error: "gerund-after-preposition", fix: "Oh, you are right. Thanks for pointing it out. I will correct the slide." },
      { text: "You're right, thanks for pointing out it. I'll fix the slide.", error: "phrasal-verb-pronoun-position", fix: "You're right, thanks for pointing it out. I'll fix the slide." },
    ],
  },
  {
    qid: "tk-presentation-get-back-to-you",
    right: [
      "That's a good question. Once I get the lab data, I'll check and get back to you.",
      "Good question. I'll look into it and get back to you when the lab data comes in.",
      "Good question. Let me check when I receive the lab data, and I'll get back to you.",
    ],
    wrong: [
      { text: "Good question. When I will get the lab data, I'll check it and let you know.", error: "will-in-time-clause", fix: "Good question. When I get the lab data, I'll check it and let you know." },
      { text: "Good question. I'll check it and contact to you when I receive the lab data.", error: "contact-to", fix: "Good question. I'll check it and contact you when I receive the lab data." },
    ],
  },
  {
    qid: "tk-presentation2-for-example",
    right: [
      "Yes, it is. For example, the dryer shut down twice last month because the feed was too wet.",
      "Yes. Last month, for example, the feed was so wet that the dryer stopped twice.",
      "Yes, really. For instance, the feed was too wet last month, and the dryer stopped twice because of it.",
    ],
    wrong: [
      { text: "Yes. For example, the dryer has stopped two times last month because the feed was too wet.", error: "present-perfect-with-past-time", fix: "Yes. For example, the dryer stopped two times last month because the feed was too wet." },
      { text: "Yes. For example, the feed was too much wet last month, so the dryer stopped twice.", error: "too-much-plus-adjective", fix: "Yes. For example, the feed was too wet last month, so the dryer stopped twice." },
    ],
  },
  {
    qid: "tk-presentation-samples-analyzed",
    right: [
      "An external lab analyzed all the samples, so the data is reliable.",
      "All of the samples were analyzed by an outside lab, so the data is reliable.",
      "Every sample was analyzed at an external laboratory, so the data can be trusted.",
    ],
    wrong: [
      { text: "An external lab was analyzed all the samples, so the data is reliable.", error: "unnecessary-passive", fix: "An external lab analyzed all the samples, so the data is reliable." },
      { text: "Because an external lab analyzed all the samples, the datas are reliable.", error: "uncountable-plural", fix: "Because an external lab analyzed all the samples, the data are reliable." },
    ],
  },
  {
    qid: "tk-presentation-compare-options",
    right: [
      "Option B costs a bit more, but it uses far less steam, so I'd recommend going with Option B.",
      "Although Option B is slightly more expensive, it uses a lot less steam. That's why I'd suggest we go with Option B.",
      "I'd suggest Option B. It's a little more expensive, but it uses much less steam.",
    ],
    wrong: [
      { text: "Option B costs a little more, but it uses much fewer steam, so I'd recommend Option B.", error: "fewer-with-uncountable", fix: "Option B costs a little more, but it uses much less steam, so I'd recommend Option B." },
      { text: "Although Option B is a bit more expensive, but it uses much less steam. So I suggest going with Option B.", error: "although-but-double-conjunction", fix: "Although Option B is a bit more expensive, it uses much less steam. So I suggest going with Option B." },
    ],
  },
  {
    qid: "tk-presentation2-yield-drop",
    right: [
      "We aren't 100 percent sure yet, but we believe the heavy rain made the feed wetter than usual, which would explain the lower yield. We'll check the feed samples next week to confirm it.",
      "We're not entirely sure yet, but we think the feed was wetter than normal because of the heavy rain. That would explain why the yield dropped. We're planning to check the feed samples next week to confirm this.",
      "It's not confirmed yet, but our guess is that the heavy rain made the feed wetter than usual, and that would explain the lower yield. We'll be checking the feed samples next week to make sure.",
    ],
    wrong: [
      { text: "We're not totally sure yet, but we think the heavy rain made the feed wetter than usual. That would explain the lower yield. We are going to checking the feed samples next week to confirm it.", error: "going-to-plus-ing", fix: "We're not totally sure yet, but we think the heavy rain made the feed wetter than usual. That would explain the lower yield. We are going to check the feed samples next week to confirm it." },
      { text: "We aren't completely sure yet, but we think the heavy rain made the feed to be wetter than usual. That would explain the lower yield. We'll check the feed samples next week to confirm it.", error: "causative-make-plus-to", fix: "We aren't completely sure yet, but we think the heavy rain made the feed wetter than usual. That would explain the lower yield. We'll check the feed samples next week to confirm it." },
    ],
  },
  {
    qid: "tl-presentation-results-too-good",
    right: [
      "I can understand why you'd ask that. Honestly, we were surprised as well, so we repeated the test twice more, and the results were nearly the same. Of course, a pilot plant is not the same as a full-scale plant, so we've put a 10% margin on all the design figures.",
      "I understand why you're asking. To be honest, the results surprised us too, so we ran the test two more times and got almost the same results. Of course, a pilot plant isn't the same as a full-scale plant, which is why we've added a 10% margin to all of the design figures.",
      "I can see why you'd ask. Honestly, we were surprised ourselves, so we ran two more tests, and the results were almost identical. But of course, a pilot plant is different from a full-scale plant, so we've built a 10% margin into all the design figures.",
    ],
    wrong: [
      { text: "I understand why you're asking. Honestly, we were also surprising at the numbers, so we ran the test two more times, and the results were almost the same. Of course, a pilot plant is not the same as a full-scale plant, so we've added a 10% margin to all the design figures.", error: "ed-ing-adjective", fix: "I understand why you're asking. Honestly, we were also surprised at the numbers, so we ran the test two more times, and the results were almost the same. Of course, a pilot plant is not the same as a full-scale plant, so we've added a 10% margin to all the design figures." },
      { text: "I can see why you're asking. To be honest, we were surprised too, so we did the test two more times, and the results were almost same. Of course, a pilot plant isn't the same as a full-scale plant, so we've added a 10% margin to all the design figures.", error: "missing-article-the-same", fix: "I can see why you're asking. To be honest, we were surprised too, so we did the test two more times, and the results were almost the same. Of course, a pilot plant isn't the same as a full-scale plant, so we've added a 10% margin to all the design figures." },
    ],
  },
  {
    qid: "tk-reaction-exactly",
    right: [
      "That's exactly it.",
      "Yes, that's exactly right.",
      "You got it.",
    ],
    wrong: [
      { text: "Yes, you exactly right.", error: "missing-be", fix: "Yes, you're exactly right." },
      { text: "That is the exactly problem.", error: "adverb-position", fix: "That is exactly the problem." },
    ],
  },
  {
    qid: "tk-reaction-i-see",
    right: [
      "Oh, okay. I see.",
      "Ah, I understand now.",
      "Oh, that explains it.",
    ],
    wrong: [
      { text: "Oh, I am understand.", error: "be-plus-base-verb", fix: "Oh, I understand." },
      { text: "Oh, that make sense.", error: "subject-verb-agreement", fix: "Oh, that makes sense." },
    ],
  },
  {
    qid: "tk-reaction-really",
    right: [
      "Wait, really?",
      "Are you serious?",
      "Is that true?",
    ],
    wrong: [
      { text: "Really? That's very surprised.", error: "ed-ing-adjective", fix: "Really? That's very surprising." },
      { text: "Really? How it is possible?", error: "question-word-order", fix: "Really? How is it possible?" },
    ],
  },
  {
    qid: "tk-reaction-great-news",
    right: [
      "That's really great news!",
      "Wow, that's fantastic news!",
      "Oh, that's such great news!",
    ],
    wrong: [
      { text: "Wow, it's a great news!", error: "article-with-uncountable", fix: "Wow, it's great news!" },
      { text: "Wow, these are really great news!", error: "news-singular-agreement", fix: "Wow, this is really great news!" },
    ],
  },
  {
    qid: "tk-reaction-missed-that",
    right: [
      "Sorry, I didn't hear that.",
      "I'm sorry, I missed what you just said.",
      "Sorry, I didn't quite catch that.",
    ],
    wrong: [
      { text: "Sorry, I couldn't heard that.", error: "modal-plus-past", fix: "Sorry, I couldn't hear that." },
      { text: "Sorry, I missed what did you say.", error: "embedded-question-word-order", fix: "Sorry, I missed what you said." },
    ],
  },
  {
    qid: "tk-reaction-sounds-tough",
    right: [
      "Oh no, that sounds really hard.",
      "Wow, that must be really tough.",
      "That sounds like a really tough week.",
    ],
    wrong: [
      { text: "Wow, it sounds like very tough.", error: "sound-like-plus-adjective", fix: "Wow, it sounds very tough." },
      { text: "Oh no, you must so tired.", error: "missing-be-after-modal", fix: "Oh no, you must be so tired." },
    ],
  },
  {
    qid: "tk-reaction-not-so-sure",
    right: [
      "Hmm, I'm not really sure about that.",
      "Well, I'm not so sure that's a good idea.",
      "Hmm, I'm not convinced about that.",
    ],
    wrong: [
      { text: "Hmm, I am not really sure for that.", error: "wrong-preposition", fix: "Hmm, I am not really sure about that." },
      { text: "Well, I don't sure about that.", error: "do-plus-adjective", fix: "Well, I'm not sure about that." },
    ],
  },
  {
    qid: "tk-reaction-youve-got-this",
    right: [
      "Don't worry about it. You'll do a great job.",
      "Don't be nervous. You're going to do great.",
      "Don't worry, you've totally got this.",
    ],
    wrong: [
      { text: "Don't worry. You will be do great.", error: "be-plus-base-verb", fix: "Don't worry. You will do great." },
      { text: "Don't nervous. You'll do great.", error: "missing-be-imperative", fix: "Don't be nervous. You'll do great." },
    ],
  },
  {
    qid: "tk-reaction-understood-will-update",
    right: [
      "Okay, understood. I'll revise the drawing by Friday.",
      "Sure. I'll have the drawing updated by Friday.",
      "Understood. The drawing will be updated by Friday.",
    ],
    wrong: [
      { text: "Okay. I will updating the drawing by Friday.", error: "modal-plus-ing", fix: "Okay. I will update the drawing by Friday." },
      { text: "Got it. The drawing will be update by Friday.", error: "passive-past-participle", fix: "Got it. The drawing will be updated by Friday." },
    ],
  },
  {
    qid: "tk-smalltalk2-love-your-shirt",
    right: [
      "Your shirt is really beautiful!",
      "What a great shirt!",
      "That's a lovely shirt, Sari!",
    ],
    wrong: [
      { text: "What beautiful shirt!", error: "missing-article", fix: "What a beautiful shirt!" },
      { text: "Your shirt looks very well!", error: "adverb-after-linking-verb", fix: "Your shirt looks very good!" },
    ],
  },
  {
    qid: "tk-smalltalk2-this-weekend",
    right: [
      "Me too! Have you got any plans for this weekend?",
      "Same here! Are you doing anything this weekend?",
      "So am I! What are your plans for the weekend?",
    ],
    wrong: [
      { text: "Me too! So what you will do this weekend?", error: "question-word-order", fix: "Me too! So what will you do this weekend?" },
      { text: "Same here! Are you have any plans for the weekend?", error: "be-instead-of-do-question", fix: "Same here! Do you have any plans for the weekend?" },
    ],
  },
  {
    qid: "tk-smalltalk-snowing",
    right: [
      "Actually, it's snowing in Seoul right now!",
      "We're having snow here right now!",
      "Here in Seoul, it's snowing at the moment!",
    ],
    wrong: [
      { text: "There is snowing in Seoul right now!", error: "there-instead-of-it", fix: "It is snowing in Seoul right now!" },
      { text: "Right now, is snowing here!", error: "missing-dummy-subject", fix: "Right now, it is snowing here!" },
    ],
  },
  {
    qid: "rp-budi-good-news-2",
    right: [
      "Oh, really? That's such wonderful news! Do you know whether it's a boy or a girl yet?",
      "Really? That's fantastic news! Do you know if you're having a boy or a girl?",
      "Really? What wonderful news! Do you already know if it's a boy or a girl?",
    ],
    wrong: [
      { text: "Really? What wonderful news! Do you know if it is boy or a girl?", error: "missing-article", fix: "Really? What wonderful news! Do you know if it is a boy or a girl?" },
      { text: "Really? That's such good news! Do you know is it a boy or a girl?", error: "embedded-question-word-order", fix: "Really? That's such good news! Do you know if it is a boy or a girl?" },
    ],
  },
  {
    qid: "rp-budi-good-news-4",
    right: [
      "When I visit Jakarta next month, let's celebrate together. Dinner's on me!",
      "Let's celebrate when I come to Jakarta next month. I'll treat you to dinner!",
      "We should celebrate when I'm in Jakarta next month. Dinner will be on me!",
    ],
    wrong: [
      { text: "When I will visit Jakarta next month, let's celebrate. I'll pay for dinner!", error: "will-in-time-clause", fix: "When I visit Jakarta next month, let's celebrate. I'll pay for dinner!" },
      { text: "Let's celebrate together when I go to Jakarta at next month. Dinner is on me!", error: "extra-preposition-time", fix: "Let's celebrate together when I go to Jakarta next month. Dinner is on me!" },
    ],
  },
  {
    qid: "rp-seoul-evening-3",
    right: [
      "From here, we can take Line 4 and get off at Myeongdong Station. It's just three stops.",
      "We just need to take Line 4 from here and get off at Myeongdong Station. It's only three stops away.",
      "We can get on Line 4 here and get off at Myeongdong Station. It's only three stops from here.",
    ],
    wrong: [
      { text: "We can take Line 4 here and get off at Myeongdong Station. It's only three stop from here.", error: "plural-noun", fix: "We can take Line 4 here and get off at Myeongdong Station. It's only three stops from here." },
      { text: "From here, we can take Line 4 and getting off at Myeongdong Station. It's just three stops.", error: "parallel-structure", fix: "From here, we can take Line 4 and get off at Myeongdong Station. It's just three stops." },
    ],
  },
  {
    qid: "tk-smalltalk-thanks-gift",
    right: [
      "Yes, it got here yesterday. Thanks a lot for the baby clothes you sent. My wife absolutely loved them.",
      "Yes, we received it yesterday. Thank you so much for sending the baby clothes. My wife really loved them.",
      "Yes, it came yesterday. My wife really loved the baby clothes you sent, so thank you so much.",
    ],
    wrong: [
      { text: "Yes, it was arrived yesterday. Thank you so much for the baby clothes you sent. My wife loved them a lot.", error: "passive-with-intransitive-verb", fix: "Yes, it arrived yesterday. Thank you so much for the baby clothes you sent. My wife loved them a lot." },
      { text: "Yes, we got it yesterday. Thank you so much for sending us the baby clothes. My wife really love them.", error: "subject-verb-agreement", fix: "Yes, we got it yesterday. Thank you so much for sending us the baby clothes. My wife really loves them." },
    ],
  },
  {
    qid: "tk-smalltalk2-learning-indonesian",
    right: [
      "Yeah, I've been studying Indonesian for around three months. I'd love to be able to talk with everyone next time I'm in Jakarta.",
      "Yes, I've been learning it for about three months now. I'd like to be able to chat with you all when I come to Jakarta.",
      "Yes, I started learning it about three months ago. I'd like to chat with everyone when I visit Jakarta.",
    ],
    wrong: [
      { text: "Yes, I am studying Indonesian for about three months. I want to talk with everyone when I visit Jakarta.", error: "present-perfect-continuous-for-duration", fix: "Yes, I have been studying Indonesian for about three months. I want to talk with everyone when I visit Jakarta." },
      { text: "Yes, I've been learning it since about three months. I'd like to chat with everyone when I go to Jakarta.", error: "since-vs-for", fix: "Yes, I've been learning it for about three months. I'd like to chat with everyone when I go to Jakarta." },
    ],
  },
  {
    qid: "tl-smalltalk-used-to-play-football",
    right: [
      "Unfortunately, not anymore. Back in university, I used to play every Saturday, but I haven't played since I injured my knee a few years ago. Nowadays I only swim once or twice a week.",
      "Sadly, I don't play anymore. When I was in college, I played every Saturday, but I haven't played since I hurt my knee a few years back. These days I just go swimming once or twice a week.",
      "Not anymore, I'm afraid. I used to play every Saturday in my university days, but I stopped after I hurt my knee a few years ago. Now I just swim once or twice a week.",
    ],
    wrong: [
      { text: "Unfortunately, not anymore. When I was in university, I used to playing every Saturday, but I haven't played since I hurt my knee a few years ago. These days I just swim once or twice a week.", error: "used-to-plus-base-verb", fix: "Unfortunately, not anymore. When I was in university, I used to play every Saturday, but I haven't played since I hurt my knee a few years ago. These days I just swim once or twice a week." },
      { text: "Sadly, I don't play anymore. I played every Saturday at university, but I didn't play since I hurt my knee a few years ago. Now I just go swimming once or twice a week.", error: "present-perfect-with-since", fix: "Sadly, I don't play anymore. I played every Saturday at university, but I haven't played since I hurt my knee a few years ago. Now I just go swimming once or twice a week." },
    ],
  },
  {
    qid: "rp-dinner-mr-tan-5",
    right: [
      "I'm so happy you're enjoying it!",
      "Oh good, I'm glad you like it!",
      "I'm happy to hear you like it!",
    ],
    wrong: [
      { text: "I'm happy that you likes it!", error: "subject-verb-agreement", fix: "I'm happy that you like it!" },
      { text: "I'm really glad you are enjoy the food!", error: "be-plus-base-verb", fix: "I'm really glad you are enjoying the food!" },
    ],
  },
  {
    qid: "tk-meal2-allergic",
    right: [
      "Sure. Is there any food you're allergic to?",
      "Sure! Do you have any food allergies I should know about?",
      "No problem. Are you allergic to any food?",
    ],
    wrong: [
      { text: "Of course. Is there anything you are allergic?", error: "missing-preposition", fix: "Of course. Is there anything you are allergic to?" },
      { text: "Sure. Do you have allergy to any food?", error: "missing-article", fix: "Sure. Do you have an allergy to any food?" },
    ],
  },
  {
    qid: "rp-dinner-mr-tan-1",
    right: [
      "Of course. Before I order, is there any food you don't eat?",
      "Sure. Before I order, are there any foods you don't eat?",
      "Of course. Before I order, let me check. Is there anything you don't eat?",
    ],
    wrong: [
      { text: "Sure. Before order, is there any food you can't eat?", error: "before-plus-base-verb", fix: "Sure. Before ordering, is there any food you can't eat?" },
      { text: "Of course. But before I order, are there anything that you don't eat?", error: "there-be-agreement", fix: "Of course. But before I order, is there anything that you don't eat?" },
    ],
  },
  {
    qid: "rp-project-dinner-2",
    right: [
      "First of all, I want to thank everyone for all the hard work this year.",
      "To begin with, thank you all for working so hard this year.",
      "Before anything else, I'd like to thank all of you for your hard work this year.",
    ],
    wrong: [
      { text: "First of all, I want to thank you all for your hard works this year.", error: "uncountable-plural", fix: "First of all, I want to thank you all for your hard work this year." },
      { text: "First of all, I'd like to thank to all of you for your hard work this year.", error: "extra-preposition", fix: "First of all, I'd like to thank all of you for your hard work this year." },
    ],
  },
  {
    qid: "rp-paying-bill-3",
    right: [
      "That's great! When you come to Seoul, it'll be my treat. I'll take you to my favorite barbecue restaurant.",
      "Great! Then dinner will be on me when you're in Seoul. I'll take you to my favorite Korean barbecue restaurant.",
      "Perfect! Then I'll treat you when you come to Seoul. I'll take you to my favorite barbecue place.",
    ],
    wrong: [
      { text: "Great! Then it will be my treat when you come Seoul. I'll take you to my favorite barbecue place.", error: "missing-preposition", fix: "Great! Then it will be my treat when you come to Seoul. I'll take you to my favorite barbecue place." },
      { text: "Great! Then when you come to Seoul, it's my turn. I'll take you to barbecue place I like best.", error: "missing-article", fix: "Great! Then when you come to Seoul, it's my turn. I'll take you to the barbecue place I like best." },
    ],
  },
  {
    qid: "rp-dinner-mr-tan-4",
    right: [
      "No, they're side dishes called banchan. They're free, so you can get more if you want.",
      "No, we call these banchan. They don't cost anything, so feel free to ask for more.",
      "No, these are called banchan. They're free of charge, and you can ask for refills if you'd like.",
    ],
    wrong: [
      { text: "No, these dishes are call banchan. They're free, so you can ask for more if you want.", error: "passive-past-participle", fix: "No, these dishes are called banchan. They're free, so you can ask for more if you want." },
      { text: "No, this are side dishes called banchan. They're free, so you can ask for more if you want.", error: "determiner-agreement", fix: "No, these are side dishes called banchan. They're free, so you can ask for more if you want." },
    ],
  },
  {
    qid: "tk-meal2-samgyetang",
    right: [
      "It's a Korean tradition. People usually eat samgyetang on the hottest days of summer, because they believe it gives you energy.",
      "It's actually a tradition in Korea. We usually have samgyetang on the hottest days of summer because it's supposed to give you energy.",
      "It's a traditional Korean thing. Koreans usually eat samgyetang on the hottest summer days, since it's thought to boost your energy.",
    ],
    wrong: [
      { text: "It's a Korean tradition. Samgyetang usually eats on the hottest days of summer, because people believe it gives energy.", error: "active-for-passive", fix: "It's a Korean tradition. Samgyetang is usually eaten on the hottest days of summer, because people believe it gives energy." },
      { text: "It's a tradition in Korea. People usually eat samgyetang on the hottest days of summer because it is believed to giving you energy.", error: "to-plus-ing", fix: "It's a tradition in Korea. People usually eat samgyetang on the hottest days of summer because it is believed to give you energy." },
    ],
  },
  {
    qid: "tk-meal2-if-id-known",
    right: [
      "I'm really sorry. If I had known about your allergy, I'd have picked another restaurant. Let me get you something else.",
      "I'm so sorry. I would have chosen a different restaurant if I'd known you were allergic. Let me order you something else.",
      "Oh, I'm so sorry. Had I known you were allergic, I would've chosen another restaurant. I'll order something else for you.",
    ],
    wrong: [
      { text: "I'm really sorry. If I had know about your allergy, I would have picked another restaurant. Let me order something else for you.", error: "past-perfect-participle", fix: "I'm really sorry. If I had known about your allergy, I would have picked another restaurant. Let me order something else for you." },
      { text: "I'm so sorry. I would have chosen another restaurant if I'd known about your allergy. Let me to order something different for you.", error: "let-plus-to", fix: "I'm so sorry. I would have chosen another restaurant if I'd known about your allergy. Let me order something different for you." },
    ],
  },
  {
    qid: "tk-meal2-pizza-or-chicken",
    right: [
      "Pizza sounds nice, but I'm not sure it's the best option tonight. Most pizzas here come with pork, and Budi doesn't eat pork. How about we get fried chicken instead? Then everyone can eat.",
      "Pizza would be great, but I'm not sure it's the best idea tonight. Most of the pizza places here put pork on their pizzas, and Budi doesn't eat pork. Shall we order fried chicken instead? That way, we can all eat.",
      "Pizza sounds good, but I'm not sure that's our best choice tonight, because most pizzas here have pork on them and Budi doesn't eat pork. Why don't we get some fried chicken instead, so everyone can eat?",
    ],
    wrong: [
      { text: "Pizza sounds good, but I'm not sure it's the best option tonight. Most of pizzas here have pork on them, and Budi doesn't eat pork. How about ordering fried chicken instead? Then everyone can eat.", error: "missing-article-most-of-the", fix: "Pizza sounds good, but I'm not sure it's the best option tonight. Most of the pizzas here have pork on them, and Budi doesn't eat pork. How about ordering fried chicken instead? Then everyone can eat." },
      { text: "I like pizza, but I'm not sure it's the best choice tonight. Most pizzas here have pork, and Budi don't eat pork. Why don't we get fried chicken instead? That way, everyone can eat.", error: "subject-verb-agreement", fix: "I like pizza, but I'm not sure it's the best choice tonight. Most pizzas here have pork, and Budi doesn't eat pork. Why don't we get fried chicken instead? That way, everyone can eat." },
    ],
  },
  {
    qid: "rp-restaurant-booking-2",
    right: [
      "Yes, if you've got one.",
      "Yes, please, if there's one available.",
      "If you have one available, yes, please.",
    ],
    wrong: [
      { text: "Yes, if is possible.", error: "dropped-subject", fix: "Yes, if it is possible." },
      { text: "Yes, if there is available one.", error: "adjective-word-order", fix: "Yes, if there is one available." },
    ],
  },
  {
    qid: "tk-phone-call-back-later",
    right: [
      "I'm sorry, would it be okay if I called you back in ten minutes?",
      "Sorry, is it okay if I call you back in ten minutes?",
      "Sorry, Sari, could I give you a call back in ten minutes?",
    ],
    wrong: [
      { text: "I'm sorry, could I call back you in ten minutes?", error: "phrasal-verb-pronoun-position", fix: "I'm sorry, could I call you back in ten minutes?" },
      { text: "Sorry, is it okay if I call you again in ten minute?", error: "plural-noun", fix: "Sorry, is it okay if I call you again in ten minutes?" },
    ],
  },
  {
    qid: "tk-phone-spell-last-name",
    right: [
      "Sorry, would you mind spelling your last name for me?",
      "I'm sorry, could you spell your family name, please?",
      "Sorry, can I ask how you spell your last name?",
    ],
    wrong: [
      { text: "Sorry, would you mind to spell your last name?", error: "mind-plus-gerund", fix: "Sorry, would you mind spelling your last name?" },
      { text: "Sorry, can you tell me how do you spell your last name?", error: "embedded-question-word-order", fix: "Sorry, can you tell me how you spell your last name?" },
    ],
  },
  {
    qid: "rp-restaurant-booking-1",
    right: [
      "Hello, I'd like to reserve a table for six people for Friday evening.",
      "Hi, can I book a table for six on Friday evening, please?",
      "Hi there. I'd like to make a booking for six people on Friday evening.",
    ],
    wrong: [
      { text: "Hello, I would like reserve a table for six people on Friday evening.", error: "would-like-missing-to", fix: "Hello, I would like to reserve a table for six people on Friday evening." },
      { text: "Hi, I'd like to make a reservation of six people on Friday evening.", error: "wrong-preposition", fix: "Hi, I'd like to make a reservation for six people on Friday evening." },
    ],
  },
  {
    qid: "tk-phone-text-when-hotel",
    right: [
      "Not yet. I'm still in the taxi, so I'll send you a message as soon as I arrive at the hotel.",
      "Not yet, I'm still in the cab. I'll message you once I get to the hotel.",
      "Not yet, I'm still in the taxi, but I'll send you a text the moment I get to the hotel.",
    ],
    wrong: [
      { text: "Not yet, I'm still in taxi. I'll send you a message as soon as I get to the hotel.", error: "missing-article", fix: "Not yet, I'm still in the taxi. I'll send you a message as soon as I get to the hotel." },
      { text: "Not yet. I'm still riding in the taxi, but I'll message you as soon as I arrive to the hotel.", error: "arrive-to", fix: "Not yet. I'm still riding in the taxi, but I'll message you as soon as I arrive at the hotel." },
    ],
  },
  {
    qid: "tk-phone-voicemail-shipped",
    right: [
      "Hello Priya, this is Minsu. I'm calling to find out whether the pumps have shipped yet. Please give me a call back when you get this.",
      "Hi Priya, it's Minsu here. I'm just calling to check whether you've shipped the pumps. Could you call me back when you get this message?",
      "Hi Priya, Minsu here. I'm calling to see if the pumps have been sent out. Please call me back when you get this message.",
    ],
    wrong: [
      { text: "Hi Priya, this is Minsu. I'm calling to check whether have the pumps been shipped. Please call me back when you get this message.", error: "embedded-question-word-order", fix: "Hi Priya, this is Minsu. I'm calling to check whether the pumps have been shipped. Please call me back when you get this message." },
      { text: "Hi Priya, it's Minsu. I'm calling to see if you have shipped the pumps. Please give me call back when you get this message.", error: "missing-article", fix: "Hi Priya, it's Minsu. I'm calling to see if you have shipped the pumps. Please give me a call back when you get this message." },
    ],
  },
  {
    qid: "tk-phone-switch-to-video",
    right: [
      "Sorry, you keep breaking up, so I can't hear you very well. How about we switch to a video call instead?",
      "I'm sorry, the connection keeps dropping, so I can't hear you clearly. Shall we try a video call instead?",
      "Sorry, I can't hear you clearly because the line keeps cutting out. Why don't we move to a video call instead?",
    ],
    wrong: [
      { text: "Sorry, the line keeps cut out, so I can't hear you clearly. How about switching to a video call instead?", error: "keep-plus-gerund", fix: "Sorry, the line keeps cutting out, so I can't hear you clearly. How about switching to a video call instead?" },
      { text: "Sorry, you keep breaking up, and I can't hear you well. Why don't we switching to a video call?", error: "base-form-after-why-dont", fix: "Sorry, you keep breaking up, and I can't hear you well. Why don't we switch to a video call?" },
    ],
  },
  {
    qid: "tk-phone-detailed-voicemail",
    right: [
      "Hello Daniel, Minsu here. I'm calling about the comments you made on the heat balance. We've looked at most of them, but there are two points we'd like to talk through before we revise the design. Please call me back when you get a chance.",
      "Hi Daniel, this is Minsu. I'm calling regarding your heat balance comments. We've reviewed most of them, but before revising the design, we'd like to discuss two points with you. Could you give me a call when you have time?",
      "Hi Daniel, it's Minsu calling about your comments on the heat balance. We've gone through most of them, but we want to discuss two things before we change the design. Can you call me back when you're free?",
    ],
    wrong: [
      { text: "Hi Daniel, this is Minsu. I'm calling about your comments on the heat balance. We have reviewed the most of them, but we want to discuss two points before we revise the design. Please call me back when you have a moment.", error: "extra-article-most-of", fix: "Hi Daniel, this is Minsu. I'm calling about your comments on the heat balance. We have reviewed most of them, but we want to discuss two points before we revise the design. Please call me back when you have a moment." },
      { text: "Hi Daniel, it's Minsu. I'm calling about your heat balance comments. We've checked most of them, but there are two points we'd like to discuss before revising the design. Could you call me back when you have a time?", error: "article-with-uncountable", fix: "Hi Daniel, it's Minsu. I'm calling about your heat balance comments. We've checked most of them, but there are two points we'd like to discuss before revising the design. Could you call me back when you have time?" },
    ],
  },
  {
    qid: "tk-phone-call-then-email",
    right: [
      "I'm happy to talk about it now, but since there are so many numbers, I'm a little worried we might miss some details on the phone. Would it be all right if I sent you a quick summary after the call? Then we'll both have the same numbers.",
      "Sure, we can discuss it now, but I'm slightly worried that we could miss some details over the phone because there are lots of numbers. Do you mind if I send you a short summary after we hang up? That way we'll both be working with the same numbers.",
      "I'm fine with discussing it now, but there are a lot of numbers, and I'm a bit concerned we might miss some details over the phone. Could I send you a short summary after the call? That way, we'll both have the same figures.",
    ],
    wrong: [
      { text: "I'm happy to discuss it now, but I'm a little worry that we might miss some details over the phone, because there are a lot of numbers. Would it be okay if I sent you a short summary after the call? That way, we'll both have the same numbers.", error: "verb-for-adjective-worried", fix: "I'm happy to discuss it now, but I'm a little worried that we might miss some details over the phone, because there are a lot of numbers. Would it be okay if I sent you a short summary after the call? That way, we'll both have the same numbers." },
      { text: "I'm happy to discuss it now, but I'm a bit worried we might miss some details over the phone, because there are much numbers. Could I send you a short summary after the call? That way, we'll both have the same numbers.", error: "much-with-countable", fix: "I'm happy to discuss it now, but I'm a bit worried we might miss some details over the phone, because there are many numbers. Could I send you a short summary after the call? That way, we'll both have the same numbers." },
    ],
  },
  {
    qid: "tk-negotiation-get-back-to-you",
    right: [
      "I'll have to check on that and get back to you.",
      "Can I check and get back to you about that?",
      "Let me look into that and get back to you.",
    ],
    wrong: [
      { text: "Let me check it and I'll get back you on that.", error: "missing-preposition", fix: "Let me check it and I'll get back to you on that." },
      { text: "I need check that first, and then I'll get back to you.", error: "need-without-to", fix: "I need to check that first, and then I'll get back to you." },
    ],
  },
  {
    qid: "tk-negotiation-lower-the-price",
    right: [
      "Would you be able to bring the price down a bit?",
      "Is there any chance you could lower the price slightly?",
      "Could you come down on the price a little?",
    ],
    wrong: [
      { text: "Can you reduce a little the price?", error: "adverb-position", fix: "Can you reduce the price a little?" },
      { text: "Is it possible to lower the price little bit?", error: "missing-article-a-little", fix: "Is it possible to lower the price a little bit?" },
    ],
  },
  {
    qid: "tk-negotiation-include-spare-parts",
    right: [
      "In that case, would you be able to include two years' worth of spare parts in the price?",
      "Then is it possible to include two years of spare parts in the price?",
      "Okay, then could the price include spare parts for two years?",
    ],
    wrong: [
      { text: "Then, is it possible include two years of spare parts in the price?", error: "missing-to-infinitive", fix: "Then, is it possible to include two years of spare parts in the price?" },
      { text: "In that case, could you include spare parts for two years to the price?", error: "wrong-preposition", fix: "In that case, could you include spare parts for two years in the price?" },
    ],
  },
  {
    qid: "tk-negotiation-warranty-how-long",
    right: [
      "Yes, I'd like to know how long the warranty on the dryer is.",
      "Yes. How long is the dryer under warranty?",
      "Yes, what's the warranty period on the dryer?",
    ],
    wrong: [
      { text: "Yes, how long the warranty is for the dryer?", error: "question-word-order", fix: "Yes, how long is the warranty for the dryer?" },
      { text: "Yes. For the dryer, how long is warranty period?", error: "missing-article", fix: "Yes. For the dryer, how long is the warranty period?" },
    ],
  },
  {
    qid: "tk-negotiation-already-lowered-twice",
    right: [
      "I'm sorry, but we've already reduced the price twice, so we can't go any lower.",
      "Unfortunately, we can't go any lower. We've already brought our price down twice.",
      "We have already cut our price two times, so I'm afraid that's as low as we can go.",
    ],
    wrong: [
      { text: "Since we have already lowered our price twice, so I'm afraid we can't go any lower.", error: "since-so-double-conjunction", fix: "Since we have already lowered our price twice, I'm afraid we can't go any lower." },
      { text: "We've already reduced our price twice, so I'm afraid we can't reduce anymore.", error: "missing-object", fix: "We've already reduced our price twice, so I'm afraid we can't reduce it anymore." },
    ],
  },
  {
    qid: "tk-negotiation-pay-in-advance",
    right: [
      "Would it be okay if we paid 30% up front and the remaining amount after commissioning?",
      "Could we possibly pay just 30% in advance, and the rest after commissioning is finished?",
      "Would you be able to accept 30% in advance and the balance after commissioning?",
    ],
    wrong: [
      { text: "Would it be possible paying only 30% in advance and the rest after commissioning?", error: "infinitive-after-possible", fix: "Would it be possible to pay only 30% in advance and the rest after commissioning?" },
      { text: "Could we pay just 30% of advance and the rest after commissioning?", error: "wrong-preposition", fix: "Could we pay just 30% in advance and the rest after commissioning?" },
    ],
  },
  {
    qid: "tl-negotiation-loyal-customer-price",
    right: [
      "On the whole, it looks good. However, we've been purchasing from your company for three years, and we plan to order two more dryers next year. Taking that into account, could you offer us a better price for this order?",
      "Overall, it's fine. But we've been your customer for three years now, and we're planning to order another two dryers next year. Considering that, would it be possible to give us a better price on this order?",
      "It looks okay overall. But we've bought from you for three years now, and we're planning to order two more dryers next year, so could you give us a better price on this order?",
    ],
    wrong: [
      { text: "Overall, it looks good. But we've been buying from you for three years, and we are planning ordering two more dryers next year. With that in mind, could you give us a better price on this order?", error: "plan-plus-infinitive", fix: "Overall, it looks good. But we've been buying from you for three years, and we are planning to order two more dryers next year. With that in mind, could you give us a better price on this order?" },
      { text: "It looks fine overall. But we've been working with you for three years now, and we're going to order two more dryers next year. Considering that, could you give us better price for this order?", error: "missing-article", fix: "It looks fine overall. But we've been working with you for three years now, and we're going to order two more dryers next year. Considering that, could you give us a better price for this order?" },
    ],
  },
  {
    qid: "tk-negotiation-if-we-ordered-twelve",
    right: [
      "We haven't decided yet, but if we ordered all twelve pumps at once for phases one and two, could you give us a 10% discount? That would make internal approval much easier to get.",
      "Hypothetically, if we were to order twelve pumps at once for both phases, would you offer a 10% discount? It would be much easier for us to get internal approval that way.",
      "Just suppose we ordered twelve pumps in one go for both phases. Would a 10% discount be possible? That would make it a lot easier to get approval internally.",
    ],
    wrong: [
      { text: "If we would order twelve pumps at once for both phases, could you give us a 10% discount? That would make internal approval much easier.", error: "would-in-if-clause", fix: "If we ordered twelve pumps at once for both phases, could you give us a 10% discount? That would make internal approval much easier." },
      { text: "Suppose we ordered all twelve pumps at once for both phases. Would you give us a 10% discount? That would make much easier to get internal approval.", error: "missing-dummy-it", fix: "Suppose we ordered all twelve pumps at once for both phases. Would you give us a 10% discount? That would make it much easier to get internal approval." },
    ],
  },
  {
    qid: "tk-negotiation-fee-increase-pushback",
    right: [
      "I understand your costs have risen, but it's hard for us to accept a 15% increase. We've been working together for five years, and we'd like to keep working together. Instead, would you consider a 5% increase with a two-year contract?",
      "I know your costs have gone up, but we can't easily accept a 15% increase. We've worked with you for five years and want to continue. Could you consider a 5% increase and a two-year contract instead?",
      "I see that your costs have increased, but a 15% rise is difficult for us to accept. We've been partners for five years, and we'd like to continue working together. Would you be willing to consider a 5% increase with a two-year contract instead?",
    ],
    wrong: [
      { text: "I know that your costs have increased, but a 15% increase is hard to us to accept. We've been working together for five years, and we want to continue. Instead, would you consider a 5% increase with a two-year contract?", error: "wrong-preposition", fix: "I know that your costs have increased, but a 15% increase is hard for us to accept. We've been working together for five years, and we want to continue. Instead, would you consider a 5% increase with a two-year contract?" },
      { text: "I understand that your costs went up, but it's difficult for us to accept a 15% increase. We've worked together for five years and we'd like to continue. Would you consider to do a 5% increase with a two-year contract instead?", error: "consider-plus-gerund", fix: "I understand that your costs went up, but it's difficult for us to accept a 15% increase. We've worked together for five years and we'd like to continue. Would you consider doing a 5% increase with a two-year contract instead?" },
    ],
  },
  {
    qid: "tk-trouble-sorry-for-delay",
    right: [
      "I apologize for the delay.",
      "I'm really sorry about the delay.",
      "Sorry for sending it late.",
    ],
    wrong: [
      { text: "I apologize the delay.", error: "missing-preposition", fix: "I apologize for the delay." },
      { text: "Sorry for send the report late.", error: "gerund-after-preposition", fix: "Sorry for sending the report late." },
    ],
  },
  {
    qid: "tk-trouble-pump-leaking",
    right: [
      "It looks like there's a leak in the pump.",
      "I think water is leaking from the pump.",
      "The pump seems to be leaking.",
    ],
    wrong: [
      { text: "It seems the pump is leaked.", error: "passive-for-active", fix: "It seems the pump is leaking." },
      { text: "I think the water is leaking from pump.", error: "missing-article", fix: "I think the water is leaking from the pump." },
    ],
  },
  {
    qid: "tk-trouble-bear-with-us",
    right: [
      "We're doing everything we can, so please be patient with us for a few more days.",
      "We're trying our best. Please give us just a few more days.",
      "We are doing our very best. Could you please wait a few more days?",
    ],
    wrong: [
      { text: "We're doing our best. Please wait us a few more days.", error: "missing-preposition", fix: "We're doing our best. Please wait for us a few more days." },
      { text: "We are trying our best. Please giving us a few more days.", error: "imperative-base-form", fix: "We are trying our best. Please give us a few more days." },
    ],
  },
  {
    qid: "tk-trouble-get-back-by-eod",
    right: [
      "I'll have to check with my team first, but I'll get back to you before the end of the day.",
      "I need to talk to my team about it. I'll let you know by the end of today.",
      "Let me check with my team, and I'll get back to you later today.",
    ],
    wrong: [
      { text: "I need checking with my team first. I'll get back to you by the end of today.", error: "need-plus-infinitive", fix: "I need to check with my team first. I'll get back to you by the end of today." },
      { text: "I have to talk with my team. I'll let you know in the end of the day.", error: "wrong-preposition", fix: "I have to talk with my team. I'll let you know by the end of the day." },
    ],
  },
  {
    qid: "tk-trouble-decanter-stopped",
    right: [
      "It's stopped twice since Monday, so we've asked the vendor to inspect the bearings.",
      "Since Monday, the decanter has shut down twice, so we've asked the vendor to take a look at the bearings.",
      "The decanter's stopped two times since Monday, so we've asked the vendor to check its bearings.",
    ],
    wrong: [
      { text: "Since Monday, the decanter stopped two times, so we asked the vendor to check the bearings.", error: "present-perfect-with-since", fix: "Since Monday, the decanter has stopped two times, so we asked the vendor to check the bearings." },
      { text: "It has stopped twice since Monday, so we asked to the vendor to check the bearings.", error: "extra-preposition", fix: "It has stopped twice since Monday, so we asked the vendor to check the bearings." },
    ],
  },
  {
    qid: "tk-trouble-not-ready-until",
    right: [
      "Sorry, the lab data came in late, so the report won't be ready until Thursday.",
      "I'm afraid we won't have the report ready until Thursday, since the lab data arrived late.",
      "I'm sorry, but the report probably won't be ready until Thursday, because we got the lab data late.",
    ],
    wrong: [
      { text: "I'm afraid the report will not ready until Thursday, because the lab data came late.", error: "missing-be", fix: "I'm afraid the report will not be ready until Thursday, because the lab data came late." },
      { text: "Because the lab data came in late, so I'm afraid the report won't be ready until Thursday.", error: "because-so-double-conjunction", fix: "Because the lab data came in late, I'm afraid the report won't be ready until Thursday." },
    ],
  },
  {
    qid: "tk-trouble-damaged-valves",
    right: [
      "I'm so sorry about that. We'll ship three new valves to you by express this week, so you won't need to wait for the next shipment.",
      "I really apologize. This week we'll send you three new valves by express delivery, so there's no need to wait for the next shipment.",
      "I'm very sorry for the trouble. We'll send three replacement valves by express this week so that you don't have to wait for the next delivery.",
    ],
    wrong: [
      { text: "I'm very sorry about that. Three new valves will send to you by express this week, so you won't have to wait for the next shipment.", error: "missing-passive", fix: "I'm very sorry about that. Three new valves will be sent to you by express this week, so you won't have to wait for the next shipment." },
      { text: "I'm really sorry. We will send three new valves by express this week, so you don't must wait for the next shipment.", error: "do-plus-modal", fix: "I'm really sorry. We will send three new valves by express this week, so you don't have to wait for the next shipment." },
    ],
  },
  {
    qid: "tk-trouble-should-have-checked",
    right: [
      "Honestly, we should've checked the feed moisture before the test. If we had, we'd have caught the problem earlier. From now on, we're going to check it every morning.",
      "To be honest, we should have measured the feed moisture before testing. If we'd done that, we would have discovered the problem sooner. Starting now, we'll check it every morning.",
      "Frankly, the feed moisture should have been checked before the test. If it had been, we would have found the problem earlier. From now on, we'll check it every morning.",
    ],
    wrong: [
      { text: "Honestly, we should checked the feed moisture before the test. If we had done it, we would have found the problem earlier. From now on, we will check it every morning.", error: "should-have-past-participle", fix: "Honestly, we should have checked the feed moisture before the test. If we had done it, we would have found the problem earlier. From now on, we will check it every morning." },
      { text: "To be honest, we should have checked the feed moisture before the test. If we had checked it, we would found the problem much earlier. From now on, we'll check it every morning.", error: "missing-have-perfect-modal", fix: "To be honest, we should have checked the feed moisture before the test. If we had checked it, we would have found the problem much earlier. From now on, we'll check it every morning." },
    ],
  },
  {
    qid: "tk-trouble-firm-date",
    right: [
      "I appreciate everything you're doing, but the delivery date has changed for the third time now, and it's affecting our entire schedule. If we don't have a confirmed date by Friday, I'm afraid I'll need to report this to our management.",
      "Thank you for your efforts, but this is already the third change to the delivery date, and it's having an impact on our whole schedule. I'm sorry, but if we don't receive a firm date by Friday, I'll have to take this up with our management.",
      "I know you're trying hard, but this is the third time the delivery date has been moved, and our whole schedule is being affected. If we can't get a firm date by Friday, I'm afraid I'll have no choice but to raise this with our management.",
    ],
    wrong: [
      { text: "I appreciate your efforts, but the delivery date has changed three times now, and it's affecting to our whole schedule. If we don't get a firm date by Friday, I'm afraid I'll have to report this to our management.", error: "extra-preposition", fix: "I appreciate your efforts, but the delivery date has changed three times now, and it's affecting our whole schedule. If we don't get a firm date by Friday, I'm afraid I'll have to report this to our management." },
      { text: "Thank you for your efforts, but this is the third time the delivery date has been changed, and it affects our entire schedule. If we won't get a confirmed date by Friday, I'm afraid I'll have to raise this with our management.", error: "will-in-if-clause", fix: "Thank you for your efforts, but this is the third time the delivery date has been changed, and it affects our entire schedule. If we don't get a confirmed date by Friday, I'm afraid I'll have to raise this with our management." },
    ],
  },
  {
    qid: "rp-hotel-checkin-2",
    right: [
      "Of course. Here's my passport.",
      "Yes, of course. Here you go.",
      "Sure thing, here it is.",
    ],
    wrong: [
      { text: "Sure. Here is.", error: "missing-pronoun", fix: "Sure. Here it is." },
      { text: "Of course. Here are my passport.", error: "subject-verb-agreement", fix: "Of course. Here is my passport." },
    ],
  },
  {
    qid: "pv-check-out-time",
    right: [
      "Yes. What's the check-out time on Friday?",
      "Yes. Do you know what time I have to check out on Friday?",
      "Yes, by what time do I need to check out on Friday?",
    ],
    wrong: [
      { text: "Yes. On Friday, what time I have to check out?", error: "question-word-order", fix: "Yes. On Friday, what time do I have to check out?" },
      { text: "Yes. Do you know what time do I have to check out on Friday?", error: "embedded-question-word-order", fix: "Yes. Do you know what time I have to check out on Friday?" },
    ],
  },
  {
    qid: "rp-site-goodbye-3",
    right: [
      "Same here. Let's stay in contact.",
      "It was great working with you too. Let's stay in touch.",
      "I really enjoyed it too. Let's keep in touch.",
    ],
    wrong: [
      { text: "I enjoyed to work with you too. Let's keep in touch.", error: "enjoy-plus-gerund", fix: "I enjoyed working with you too. Let's keep in touch." },
      { text: "Same here. Let's keep in touch each other.", error: "missing-preposition", fix: "Same here. Let's keep in touch with each other." },
    ],
  },
  {
    qid: "tk-visit-pick-you-up",
    right: [
      "Tomorrow morning I'll come and get you here at eight.",
      "I'll pick you up from here at 8 a.m. tomorrow.",
      "I'll come by to pick you up here at eight o'clock tomorrow morning.",
    ],
    wrong: [
      { text: "I will pick you up at here at eight tomorrow morning.", error: "extra-preposition", fix: "I will pick you up here at eight tomorrow morning." },
      { text: "Tomorrow morning I'll pick up you here at eight.", error: "phrasal-verb-pronoun-position", fix: "Tomorrow morning I'll pick you up here at eight." },
    ],
  },
  {
    qid: "tk-visit-photos-of-dryer",
    right: [
      "Would it be okay if I took a few pictures of the dryer?",
      "Is it all right if I take a few photos of the dryer?",
      "May I take some pictures of the dryer?",
    ],
    wrong: [
      { text: "May I take a few photo of the dryer?", error: "plural-noun", fix: "May I take a few photos of the dryer?" },
      { text: "Is it okay if I take some pictures about the dryer?", error: "wrong-preposition", fix: "Is it okay if I take some pictures of the dryer?" },
    ],
  },
  {
    qid: "tk-visit2-let-me-know-when-home",
    right: [
      "Have a safe trip home, and let me know when you get there.",
      "Fly safe, and let me know once you're home.",
      "Have a safe flight! Send me a message when you arrive home.",
    ],
    wrong: [
      { text: "Have safe flight, and please let me know when you get home.", error: "missing-article", fix: "Have a safe flight, and please let me know when you get home." },
      { text: "Have a safe trip, and let me know when you get to home.", error: "extra-preposition-home", fix: "Have a safe trip, and let me know when you get home." },
    ],
  },
  {
    qid: "tk-visit-dryer-installed-last-month",
    right: [
      "This is our new dryer, which was installed last month.",
      "It's the new dryer. We installed it last month.",
      "This is the new dryer that we put in last month.",
    ],
    wrong: [
      { text: "This one is the new dryer which installed last month.", error: "missing-passive", fix: "This one is the new dryer which was installed last month." },
      { text: "This big unit is the new dryer was installed last month.", error: "missing-relative-pronoun", fix: "This big unit is the new dryer that was installed last month." },
    ],
  },
  {
    qid: "tk-visit-if-i-had-one-more-day",
    right: [
      "Sadly, I didn't. I'd really love to see it if I had more time. Next time, you should visit Korea, and I'll show you around.",
      "Unfortunately, I didn't get the chance. If I had more time, I'd definitely go and see it. Next time you should come to Korea. I'll show you around.",
      "No, unfortunately not. I'd love to see it if I had more time. You should come to Korea next time, and I'll give you a tour.",
    ],
    wrong: [
      { text: "Sadly, no. If I had more time, I will definitely go to see it. Next time, please come to Korea, and I'll show you around.", error: "second-conditional-would", fix: "Sadly, no. If I had more time, I would definitely go to see it. Next time, please come to Korea, and I'll show you around." },
      { text: "Unfortunately, I couldn't. If I had more time, I'd love to see it. Next time you should to visit Korea, and I'll show you around.", error: "modal-plus-to", fix: "Unfortunately, I couldn't. If I had more time, I'd love to see it. Next time you should visit Korea, and I'll show you around." },
    ],
  },
  {
    qid: "tk-visit-decline-dinner-lunch-instead",
    right: [
      "Thank you, that's really kind of you, but I'm afraid tonight won't work for me. I have a 6 a.m. flight tomorrow, so I have to go to bed early. Could we have lunch together today instead?",
      "That's so kind of you, but unfortunately I can't make it this evening. My flight leaves at six tomorrow morning, so I need to get to bed early. How about having lunch together today instead?",
      "I really appreciate the offer, but I'm afraid I can't join you for dinner tonight, because my flight is at six tomorrow morning and I need to go to bed early. Would lunch today work instead?",
    ],
    wrong: [
      { text: "That's very kind for you, but I'm afraid I can't join you tonight. My flight is at six tomorrow morning, so I need to go to bed early. Could we have lunch together today instead?", error: "wrong-preposition", fix: "That's very kind of you, but I'm afraid I can't join you tonight. My flight is at six tomorrow morning, so I need to go to bed early. Could we have lunch together today instead?" },
      { text: "Thank you so much, but I'm afraid I can't make it tonight. My flight leaves at 6 tomorrow morning, so I have to go to bed early. Instead, can we have a lunch together today?", error: "article-with-meal", fix: "Thank you so much, but I'm afraid I can't make it tonight. My flight leaves at 6 tomorrow morning, so I have to go to bed early. Instead, can we have lunch together today?" },
    ],
  },
];
