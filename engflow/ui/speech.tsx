"use client";
import * as React from "react";
import { Volume2 } from "lucide-react";
import { cn } from "./kit";

/**
 * Reading lines aloud with the device's own voices (Web Speech API). Works in
 * Safari on iPhone/iPad and in desktop browsers without any permission; where
 * it is missing, the buttons simply do not appear.
 */

const PREFERRED = /samantha|ava|allison|aaron|nicky|google us english|microsoft (aria|jenny|guy)|karen|daniel|serena/i;
let chosen: SpeechSynthesisVoice | null = null;

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function voice(): SpeechSynthesisVoice | null {
  if (chosen || !canSpeak()) return chosen;
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  chosen = voices.find((v) => /en[-_]US/i.test(v.lang) && PREFERRED.test(v.name)) ?? voices.find((v) => PREFERRED.test(v.name)) ?? voices.find((v) => /en[-_]US/i.test(v.lang)) ?? voices[0] ?? null;
  return chosen;
}

if (canSpeak()) window.speechSynthesis.onvoiceschanged = () => (chosen = null);

export function speak(text: string, opts: { slow?: boolean; onEnd?: () => void } = {}): void {
  if (!canSpeak()) return;
  const s = window.speechSynthesis;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = voice();
  if (v) u.voice = v;
  u.lang = v?.lang ?? "en-US";
  u.rate = opts.slow ? 0.8 : 0.95;
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  s.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** A small "read aloud" button. */
export function SpeakButton({ text, slow, className, label = "읽어 주기" }: { text: string; slow?: boolean; className?: string; label?: string }) {
  const [on, setOn] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  React.useEffect(() => setSupported(canSpeak()), []);
  React.useEffect(() => () => stopSpeaking(), []);
  if (!supported) return null;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={() => {
        if (on) {
          stopSpeaking();
          setOn(false);
          return;
        }
        setOn(true);
        speak(text, { slow, onEnd: () => setOn(false) });
      }}
      className={cn(
        "dd-focus inline-grid size-8 shrink-0 place-items-center rounded-full text-[var(--muted)] transition hover:bg-black/5 dark:hover:bg-white/10",
        on && "bg-[var(--ef-accent-soft)] text-[var(--ef-accent-ink)]",
        className,
      )}
    >
      <Volume2 className={cn("size-4", on && "animate-pulse")} />
    </button>
  );
}
