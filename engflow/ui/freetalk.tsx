"use client";
import * as React from "react";
import { motion } from "motion/react";
import { ArrowRight, ArrowUp, CheckCircle2, Languages, Lightbulb, MessagesSquare, RotateCcw, Sparkles, X } from "lucide-react";
import { TALK_TOPICS, TALK_TOPIC_BY_ID, TALK_TURNS, localTalkNotes, talkSummary, type TalkLine, type TalkTopic } from "../core/freetalk";
import { SITUATION_INFO } from "../content";
import { AIUnavailableError } from "../platform/types";
import { useApp } from "./store";
import { useNav } from "./app";
import { Card, Eyebrow, cn, scoreTone, TONE_TEXT, useReduced } from "./kit";
import { DiffLine, tintFor } from "./practice/parts";
import { SpeakButton, speak, stopSpeaking } from "./speech";
import { Burst } from "./celebrate";

/* ───────────── Entry card ───────────── */

/** Free talk with Claude: pick a scene and talk; shown on Learn (all topics) and Today (one suggestion). */
export function TalkCard({ compact, scene }: { compact?: boolean; scene?: string }) {
  const app = useApp();
  const nav = useNav();
  const ai = app.ai.available && app.state.settings.ai !== "off";
  // Today suggests a different topic each day; Learn starts from the chosen scene.
  const initial = (compact ? TALK_TOPICS[Math.floor(app.now() / 86_400_000) % TALK_TOPICS.length] : TALK_TOPICS.find((t) => t.scene === scene) ?? TALK_TOPICS[0]).id;
  const [pick, setPick] = React.useState(initial);
  React.useEffect(() => setPick(initial), [initial]);
  const topic = TALK_TOPIC_BY_ID[pick];
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center gap-2">
        <MessagesSquare className="size-4 text-[var(--ef-accent-ink)]" />
        <Eyebrow>Claude와 자유 대화</Eyebrow>
      </div>
      <div className="mt-1 text-[16px] font-semibold">{compact ? "정해진 답 없이, 대화를 이어 가기" : "상황을 고르고 Claude와 직접 대화해요"}</div>
      <p className="ef-ko mt-1 text-[13px] text-[var(--muted)]">
        Claude가 상대 역할을 맡아 대답하고, 내가 한 말마다 바로 고쳐 줍니다. {TALK_TURNS}번 정도 주고받으면 고칠 표현을 모아 보여 줍니다.
      </p>
      {!compact ? (
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="대화 주제">
          {TALK_TOPICS.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={pick === t.id}
              onClick={() => setPick(t.id)}
              className={cn(
                "dd-focus shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium",
                pick === t.id ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--line)] text-[var(--ef-ink-2)]",
              )}
            >
              {t.titleKo}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-[var(--background)] p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white" style={{ background: tintFor(topic.partner) }} aria-hidden>
          {topic.partner.replace(/^(Mr|Ms|Mrs|Dr)\.\s*/, "").charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-[var(--muted)]">
            {SITUATION_INFO[topic.scene].ko} · {topic.partner}
          </div>
          <div className="ef-en truncate text-[14px]">“{topic.opener.en}”</div>
        </div>
        <button
          onClick={() => nav.startTalk(topic.id)}
          disabled={!ai}
          className="dd-focus inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-[var(--foreground)] px-3.5 text-[14px] font-semibold text-[var(--background)] disabled:opacity-40"
          aria-label={`${topic.titleKo} 자유 대화 시작`}
        >
          시작 <ArrowRight className="size-4" />
        </button>
      </div>
      {!ai ? <p className="ef-ko mt-2 text-[12px] text-[var(--ef-warn)]">자유 대화는 Claude 연결이 필요합니다. (설정에서 Claude 채점을 켜 주세요.)</p> : null}
    </Card>
  );
}

/* ───────────── Conversation ───────────── */

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white" style={{ background: tintFor(name) }} aria-hidden>
      {name.replace(/^(Mr|Ms|Mrs|Dr)\.\s*/, "").charAt(0)}
    </span>
  );
}

function Typing({ name }: { name: string }) {
  const reduced = useReduced();
  return (
    <li className="flex items-end gap-2" aria-label={`${name}이(가) 입력 중`}>
      <Avatar name={name} />
      <div className="flex gap-1 rounded-[18px] rounded-bl-[6px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-[var(--muted)]"
            animate={reduced ? undefined : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </li>
  );
}

/** Feedback under one of my lines. */
function LineFeedback({ line, slow }: { line: TalkLine; slow?: boolean }) {
  const fb = line.feedback!;
  const clean = !fb.notes.length;
  const tone = scoreTone(fb.score);
  return (
    <div className="mt-1.5 w-full max-w-[92%] self-end rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-left">
      <div className="flex items-center gap-1.5 text-[12px]">
        {clean ? <CheckCircle2 className="size-3.5 text-[var(--ef-ok)]" /> : null}
        <span className={cn("font-semibold", clean ? "text-[var(--ef-ok)]" : TONE_TEXT[tone])}>{clean ? "자연스러워요" : "이렇게 고쳐요"}</span>
        <span className={cn("ef-num ml-auto rounded-full px-1.5 text-[11px] font-semibold", TONE_TEXT[tone])}>{fb.score}</span>
      </div>
      {!clean ? (
        <>
          <DiffLine from={line.en} to={fb.corrected} />
          <ul className="mt-1 space-y-0.5">
            {fb.notes.map((n, i) => (
              <li key={i} className="ef-ko text-[12px] leading-5 text-[var(--ef-ink-2)]">
                {n.text ? <span className="ef-en font-medium">{n.text}</span> : null}
                {n.text || n.fix ? " → " : ""}
                {n.fix ? <span className="ef-en font-semibold text-[var(--ef-ok)]">{n.fix}</span> : null} {n.whyKo}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {fb.natural ? (
        <div className="mt-1.5 flex items-start gap-1 border-t border-[var(--line)] pt-1.5">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[var(--ef-accent-ink)]" />
          <p className="ef-en min-w-0 flex-1 text-[14px] leading-snug">
            <span className="ef-ko mr-1 text-[11px] font-semibold text-[var(--ef-accent-ink)]">더 자연스럽게</span>
            {fb.natural}
          </p>
          <SpeakButton text={fb.natural} slow={slow} className="-mr-2 -mt-1" label="자연스러운 표현 읽어 주기" />
        </div>
      ) : null}
    </div>
  );
}

export function FreeTalk({ topicId, onExit }: { topicId: string; onExit: () => void }) {
  const app = useApp();
  const reduced = useReduced();
  const topic: TalkTopic = TALK_TOPIC_BY_ID[topicId] ?? TALK_TOPICS[0];
  const slow = app.state.settings.slowSpeech;
  const opening: TalkLine = { who: "partner", en: topic.opener.en, ko: topic.opener.ko, hint: topic.opener.hint };
  const [lines, setLines] = React.useState<TalkLine[]>([opening]);
  // Hint for the partner's latest line: 0 hidden, 1 the Korean meaning, 2 the English sentence.
  const [hintLevel, setHintLevel] = React.useState(0);
  const [text, setText] = React.useState("");
  const [waiting, setWaiting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [showKo, setShowKo] = React.useState(false);
  const [party, setParty] = React.useState(false);
  const ctl = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const turn = lines.filter((l) => l.who === "me").length;

  React.useEffect(() => () => {
    ctl.current?.abort();
    stopSpeaking();
  }, []);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [lines.length, waiting, done, reduced]);
  React.useEffect(() => setHintLevel(0), [lines.length]);
  React.useEffect(() => {
    if (app.state.settings.autoSpeak) speak(topic.opener.en, { slow });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ask Claude for feedback on my latest line and the partner's reply. */
  const ask = async (history: TalkLine[]) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setWaiting(true);
    setError(null);
    const myTurn = history.filter((l) => l.who === "me").length;
    try {
      const r = await app.platform.ai.talk(topic.id, history.map(({ who, en }) => ({ who, en })), myTurn, c.signal);
      if (c.signal.aborted) return;
      const next = history.map((l, i) => (i === history.length - 1 ? { ...l, feedback: r.feedback } : l));
      const finished = r.done || myTurn >= TALK_TURNS;
      setLines([...next, { who: "partner", en: r.reply.en, ko: r.reply.ko, hint: r.done ? undefined : r.hint }]);
      if (app.state.settings.autoSpeak) speak(r.reply.en, { slow });
      if (finished) {
        setDone(true);
        const all = [...next].filter((l) => l.who === "me" && l.feedback);
        if (all.length && all.every((l) => l.feedback!.score >= 85) && app.state.settings.celebrate !== false) setParty(true);
      }
    } catch (e) {
      if (c.signal.aborted) return;
      setError(e instanceof AIUnavailableError || e instanceof Error ? e.message : "Claude 응답을 받지 못했습니다.");
    } finally {
      if (ctl.current === c) setWaiting(false);
    }
  };

  const send = () => {
    const t = text.trim();
    if (!t || waiting || done) return;
    const history: TalkLine[] = [...lines, { who: "me", en: t }];
    setLines(history);
    setText("");
    void ask(history);
  };

  const restart = () => {
    ctl.current?.abort();
    setLines([opening]);
    setDone(false);
    setError(null);
    setWaiting(false);
    setText("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Instant hint while typing: a major grammar-rule finding before Claude even sees the line.
  const instant = text.trim().split(/\s+/).length >= 3 ? localTalkNotes(text.trim()) : [];
  const summary = done ? talkSummary(lines) : null;
  const latest = lines[lines.length - 1];
  const hint = latest?.who === "partner" && !waiting ? latest.hint : undefined;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col">
      {party ? <Burst kind="fireworks" shells={5} onDone={() => setParty(false)} /> : null}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--background)]/90 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="dd-focus grid size-9 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10" aria-label="자유 대화 닫기">
            <X className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">자유 대화 · {topic.titleKo}</div>
            <div className="text-[12px] text-[var(--muted)]">
              {topic.partner} · {SITUATION_INFO[topic.scene].ko} · <span className="ef-num">{Math.min(turn, TALK_TURNS)}/{TALK_TURNS}</span>
            </div>
          </div>
          <button
            onClick={() => setShowKo((v) => !v)}
            aria-pressed={showKo}
            className={cn("dd-focus inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[12px]", showKo ? "border-transparent bg-[var(--ef-accent-soft)] text-[var(--ef-accent-ink)]" : "border-[var(--line)] text-[var(--muted)]")}
          >
            <Languages className="size-3.5" /> 번역
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-6 pt-4">
        <Card className="mb-4 p-3.5">
          <p className="ef-ko text-[13px] text-[var(--ef-ink-2)]">{topic.setupKo}</p>
          <p className="ef-ko mt-1 text-[12px] text-[var(--muted)]">
            <span className="font-semibold text-[var(--ef-accent-ink)]">목표</span> {topic.goalKo}
          </p>
        </Card>
        <ol className="flex flex-col gap-3" aria-label="자유 대화">
          {lines.map((l, i) =>
            l.who === "partner" ? (
              <motion.li key={i} className="flex items-end gap-2" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <Avatar name={topic.partner} />
                <div className="min-w-0 max-w-[85%] rounded-[18px] rounded-bl-[6px] border border-[var(--line)] bg-[var(--surface-strong)] px-3.5 py-2">
                  <div className="text-[11px] font-semibold text-[var(--muted)]">{topic.partner}</div>
                  <div className="flex items-start gap-1">
                    <p className="ef-en min-w-0 flex-1 text-[16px] leading-snug md:text-[17px]">{l.en}</p>
                    <SpeakButton text={l.en} slow={slow} className="-mr-2 -mt-1" label={`${topic.partner}의 말 읽어 주기`} />
                  </div>
                  {showKo && l.ko ? <p className="ef-ko mt-0.5 text-[13px] text-[var(--muted)]">{l.ko}</p> : null}
                </div>
              </motion.li>
            ) : (
              <motion.li key={i} className="flex flex-col items-end" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex max-w-[85%] items-end gap-2">
                  <div className="min-w-0 rounded-[18px] rounded-br-[6px] bg-[var(--ef-accent-soft)] px-3.5 py-2">
                    <div className="text-right text-[11px] font-semibold text-[var(--ef-accent-ink)]">나</div>
                    <p className="ef-en text-right text-[16px] leading-snug md:text-[17px]">{l.en}</p>
                  </div>
                </div>
                {l.feedback ? <LineFeedback line={l} slow={slow} /> : null}
              </motion.li>
            ),
          )}
          {waiting ? <Typing name={topic.partner} /> : null}
        </ol>
        {error ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-[13px]" role="alert">
            <span className="ef-ko min-w-0 flex-1 text-[var(--ef-bad)]">{error}</span>
            <button onClick={() => void ask(lines)} className="dd-focus inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 text-[12px] font-semibold">
              <RotateCcw className="size-3.5" /> 다시 보내기
            </button>
          </div>
        ) : null}

        {summary ? (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
            <Card className="p-4 md:p-5">
              <Eyebrow>대화 정리</Eyebrow>
              <div className="mt-1 text-[18px] font-semibold">{summary.clean === summary.turns && summary.turns ? "한 번도 안 틀렸어요!" : "대화 완료!"}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="ef-num text-[22px] font-semibold">{summary.turns}</div>
                  <div className="text-[11px] text-[var(--muted)]">내가 한 말</div>
                </div>
                <div>
                  <div className={cn("ef-num text-[22px] font-semibold", TONE_TEXT[scoreTone(summary.average)])}>{summary.average}</div>
                  <div className="text-[11px] text-[var(--muted)]">평균 점수</div>
                </div>
                <div>
                  <div className="ef-num text-[22px] font-semibold">{summary.clean}/{summary.turns}</div>
                  <div className="text-[11px] text-[var(--muted)]">고칠 것 없음</div>
                </div>
              </div>
              {summary.fixes.length ? (
                <div className="mt-4">
                  <div className="text-[12px] font-semibold text-[var(--muted)]">다음엔 이렇게 말해 봐요</div>
                  <ul className="mt-2 space-y-2" aria-label="고칠 표현">
                    {summary.fixes.map((f, i) => (
                      <li key={i} className="rounded-xl bg-[var(--background)] p-2.5">
                        <p className="ef-en text-[13px] text-[var(--muted)] line-through decoration-[var(--ef-bad)]/50">{f.said}</p>
                        <div className="flex items-start gap-1">
                          <p className="ef-en min-w-0 flex-1 text-[15px] font-medium">{f.better}</p>
                          <SpeakButton text={f.better} slow={slow} className="-mr-1 -mt-1" label="고친 문장 읽어 주기" />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={restart} className="dd-focus inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 text-[14px] font-medium">
                  <RotateCcw className="size-4" /> 다시 대화하기
                </button>
                <button onClick={onExit} className="dd-focus inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--foreground)] px-4 text-[14px] font-semibold text-[var(--background)]">
                  다른 주제 고르기 <ArrowRight className="size-4" />
                </button>
              </div>
            </Card>
          </motion.div>
        ) : null}
        <div ref={endRef} />
      </main>

      {!done ? (
        <div className="ef-safe-bottom sticky bottom-0 z-20 border-t border-[var(--line)] bg-[var(--background)]/92 px-4 pt-2 backdrop-blur-xl">
          {hint ? (
            <div className="mb-1.5 flex items-start gap-2 text-[12px]">
              <button
                onClick={() => setHintLevel((h) => Math.min(2, h + 1))}
                disabled={hintLevel >= 2}
                className="dd-focus inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-[var(--line)] px-2.5 font-medium text-[var(--muted)] disabled:opacity-60"
                aria-label={hintLevel === 0 ? "힌트 보기" : "영어 문장 보기"}
              >
                <Lightbulb className="size-3.5" /> {hintLevel === 0 ? "힌트" : hintLevel === 1 ? "영어로 보기" : "힌트"}
              </button>
              {hintLevel === 1 ? <p className="ef-ko min-w-0 flex-1 pt-1 text-[var(--ef-ink-2)]">이런 뜻으로 말해 보세요: {hint.ko ?? hint.en}</p> : null}
              {hintLevel === 2 ? (
                <div className="flex min-w-0 flex-1 items-start gap-1 pt-0.5">
                  <p className="ef-en min-w-0 flex-1 text-[14px] leading-snug">{hint.en}</p>
                  <SpeakButton text={hint.en} slow={slow} className="-mt-1" label="힌트 문장 읽어 주기" />
                </div>
              ) : null}
            </div>
          ) : null}
          {instant.length ? (
            <p className="ef-ko mb-1.5 text-[12px] text-[var(--ef-warn)]" aria-live="polite">
              잠깐: <span className="ef-en font-medium">{instant[0].text || "…"}</span> → <span className="ef-en font-semibold">{instant[0].fix}</span>
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              id="ef-talk-input"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={waiting ? `${topic.partner}이(가) 답하는 중…` : "영어로 대답해 보세요"}
              aria-label="내 대답"
              className="ef-en dd-focus max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-3.5 py-2.5 text-[16px] leading-snug"
            />
            <button
              onClick={send}
              disabled={!text.trim() || waiting}
              className="dd-focus grid size-11 shrink-0 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)] disabled:opacity-30"
              aria-label="보내기"
            >
              <ArrowUp className="size-5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
