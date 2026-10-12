"use client";
import * as React from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "./kit";

/**
 * Answering by voice with the browser's own speech recognition (Web Speech
 * API: Chrome, Edge, Safari). The words fill the answer box so the learner can
 * check them and press Enter; the grader already accepts dictation (no
 * punctuation, "3" for "three"). Where recognition is missing or the
 * microphone is not allowed (some embedded views), the button does not appear.
 */

interface RecResult {
  isFinal: boolean;
  length: number;
  [k: number]: { transcript: string };
}
interface RecEvent {
  resultIndex: number;
  results: { length: number; [k: number]: RecResult };
}
interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognizerClass(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Set once the microphone was refused on this page load: the button then stays hidden. */
let refused = false;
const refusedListeners = new Set<() => void>();

export function canListen(): boolean {
  if (refused || !recognizerClass()) return false;
  // An embedded view that may not use the microphone (Chrome tells us up front).
  const doc = document as unknown as { permissionsPolicy?: { allowsFeature(f: string): boolean }; featurePolicy?: { allowsFeature(f: string): boolean } };
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  try {
    if (policy && !policy.allowsFeature("microphone")) return false;
  } catch {
    /* unknown feature name: assume allowed */
  }
  return true;
}

const fixI = (text: string) => text.replace(/\s+/g, " ").trim().replace(/\bi\b(?=$|[\s'’,.!?])/g, "I");

/** Tidy what the recognizer heard: a capital first letter and "I" (it often sends "i'm"). */
export function tidyTranscript(text: string): string {
  const t = fixI(text);
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Joins dictated words onto what is already in the box (a new sentence starts with a capital). */
export function appendSpoken(base: string, spoken: string): string {
  const b = base.replace(/\s+$/, "");
  const s = !b || /[.!?]$/.test(b) ? tidyTranscript(spoken) : fixI(spoken);
  if (!s) return base;
  return b ? `${b} ${s}` : s;
}

const ERROR_KO: Record<string, string> = {
  "no-speech": "소리가 들리지 않았어요. 마이크를 다시 누르고 말해 보세요.",
  "audio-capture": "마이크를 찾을 수 없습니다. 연결을 확인하거나 키보드로 입력하세요.",
  "not-allowed": "마이크를 쓸 수 없습니다. 브라우저에서 마이크 권한을 허용하면 말로 답할 수 있어요.",
  "service-not-allowed": "이 화면에서는 음성 인식을 쓸 수 없습니다. 키보드로 입력해 주세요.",
  network: "음성 인식 서버에 연결하지 못했습니다. 잠시 후 다시 시도하거나 키보드로 입력하세요.",
  "language-not-supported": "이 기기에서는 영어 음성 인식을 쓸 수 없습니다.",
};

export interface Dictation {
  /** Recognition exists here and the microphone was not refused. */
  supported: boolean;
  listening: boolean;
  /** Korean message after a failed attempt (cleared on the next start). */
  errorKo: string | null;
  start(): void;
  /** Stop listening and keep what was heard. */
  stop(): void;
  /** Stop listening and drop anything still on its way (the question changed or the answer was sent). */
  cancel(): void;
  toggle(): void;
}

/**
 * Dictation into a text value: `onText` receives the whole new value (what was
 * already typed + the words heard so far) while the learner speaks, and once
 * more when recognition ends. `onStart` fires when listening begins.
 */
export function useDictation({ value, onText, onStart, onDone }: { value: string; onText: (next: string) => void; onStart?: () => void; onDone?: (next: string) => void }): Dictation {
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [errorKo, setErrorKo] = React.useState<string | null>(null);
  const rec = React.useRef<Recognizer | null>(null);
  const cancelled = React.useRef(false);
  const latest = React.useRef({ value, onText, onStart, onDone });
  latest.current = { value, onText, onStart, onDone };

  React.useEffect(() => {
    setSupported(canListen());
    const off = () => setSupported(false);
    refusedListeners.add(off);
    return () => {
      refusedListeners.delete(off);
      rec.current?.abort();
    };
  }, []);

  const stop = React.useCallback(() => rec.current?.stop(), []);
  const cancel = React.useCallback(() => {
    if (!rec.current) return;
    cancelled.current = true;
    rec.current.abort();
  }, []);

  const start = React.useCallback(() => {
    const Rec = recognizerClass();
    if (!Rec || rec.current) return;
    const r = new Rec();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    const base = latest.current.value;
    let heard = "";
    let failed = false;
    cancelled.current = false;
    r.onresult = (e) => {
      if (cancelled.current) return;
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? "";
      heard = text;
      latest.current.onText(appendSpoken(base, heard));
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      failed = true;
      setErrorKo(ERROR_KO[e.error] ?? "음성을 알아듣지 못했어요. 다시 말하거나 키보드로 입력하세요.");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        refused = true;
        refusedListeners.forEach((f) => f());
      }
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      if (cancelled.current) return;
      const next = appendSpoken(base, heard);
      if (heard) latest.current.onText(next);
      if (heard && !failed) latest.current.onDone?.(next);
    };
    rec.current = r;
    setErrorKo(null);
    try {
      r.start();
      setListening(true);
      latest.current.onStart?.();
    } catch {
      rec.current = null;
      setErrorKo("음성 인식을 시작하지 못했습니다. 잠시 후 다시 눌러 주세요.");
    }
  }, []);

  const toggle = React.useCallback(() => (rec.current ? stop() : start()), [start, stop]);
  return { supported, listening, errorKo, start, stop, cancel, toggle };
}

/** The round microphone button that sits in an answer box. */
export function MicButton({ dictation, disabled, className, size = "md" }: { dictation: Dictation; disabled?: boolean; className?: string; size?: "sm" | "md" }) {
  if (!dictation.supported) return null;
  const on = dictation.listening;
  return (
    <button
      type="button"
      onClick={dictation.toggle}
      disabled={disabled}
      aria-pressed={on}
      aria-label={on ? "듣기 멈추기" : "말로 답하기"}
      title={on ? "듣기 멈추기" : "말로 답하기 (⌥M)"}
      className={cn(
        "dd-focus relative inline-grid shrink-0 place-items-center rounded-full transition disabled:opacity-40",
        size === "sm" ? "size-9" : "size-10",
        on ? "bg-[var(--ef-bad)] text-white" : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] dark:hover:bg-white/10",
        className,
      )}
    >
      {on ? <span aria-hidden className="ef-mic-ring absolute inset-0 rounded-full" /> : null}
      {on ? <Square className="relative size-3.5 fill-current" /> : <Mic className="size-[18px]" />}
    </button>
  );
}

/** One quiet line under the answer box: listening now, or why it did not work. */
export function DictationNote({ dictation }: { dictation: Dictation }) {
  if (dictation.listening)
    return (
      <p className="ef-ko mt-1.5 flex items-center gap-1.5 px-1 text-[12px] text-[var(--ef-bad)]" aria-live="polite">
        <span className="ef-mic-dot size-1.5 rounded-full bg-[var(--ef-bad)]" /> 듣고 있어요 — 영어로 말하면 글로 바뀝니다. 말을 마치면 자동으로 멈춰요.
      </p>
    );
  if (dictation.errorKo)
    return (
      <p className="ef-ko mt-1.5 px-1 text-[12px] text-[var(--muted)]" aria-live="polite">
        {dictation.errorKo}
      </p>
    );
  return null;
}
