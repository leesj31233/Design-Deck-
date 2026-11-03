"use client";
import { textKey } from "./content";

/**
 * Korean → English on the reader's own device, free: the browser's built-in Translator API (Chrome/Edge 138+,
 * `self.Translator`). Used only for texts that have no English written by the research routine. Every result is
 * kept in this browser (IndexedDB, keyed by a hash of the Korean text), so switching back and forth is instant and
 * a later visit does not translate the same text again. Nothing is sent to any server by this module.
 */
export type DeviceState = "checking" | "unsupported" | "unavailable" | "downloadable" | "downloading" | "ready" | "error";
export interface DeviceStatus { state: DeviceState; progress?: number; pending: number }

type TranslatorLike = { translate(text: string): Promise<string> };
type TranslatorFactory = {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(options: { sourceLanguage: string; targetLanguage: string; monitor?: (monitor: EventTarget) => void }): Promise<TranslatorLike>;
};
const PAIR = { sourceLanguage: "ko", targetLanguage: "en" };
const factory = () => (typeof self !== "undefined" ? (self as unknown as { Translator?: TranslatorFactory }).Translator : undefined);

let status: DeviceStatus = { state: "checking", pending: 0 };
const listeners = new Set<(status: DeviceStatus) => void>();
const set = (patch: Partial<DeviceStatus>) => { status = { ...status, ...patch }; for (const listen of listeners) listen(status); };
export const deviceStatus = () => status;
export function onDeviceStatus(listen: (status: DeviceStatus) => void) { listeners.add(listen); listen(status); return () => { listeners.delete(listen); }; }

// ── The cache: IndexedDB "naysor-news-en", store "texts": hash of the Korean → English ───────────────────────
const memory = new Map<string, string>();
let database: Promise<IDBDatabase | null> | null = null;
function openCache() {
  database ??= new Promise(resolve => {
    try {
      const request = indexedDB.open("naysor-news-en", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("texts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return database;
}
async function cached(key: string): Promise<string | undefined> {
  if (memory.has(key)) return memory.get(key);
  const db = await openCache();
  if (!db) return undefined;
  return new Promise(resolve => {
    try { const request = db.transaction("texts").objectStore("texts").get(key); request.onsuccess = () => { if (typeof request.result === "string") memory.set(key, request.result); resolve(request.result ?? undefined); }; request.onerror = () => resolve(undefined); } catch { resolve(undefined); }
  });
}
async function keep(key: string, english: string) {
  memory.set(key, english);
  const db = await openCache();
  try { db?.transaction("texts", "readwrite").objectStore("texts").put(english, key); } catch { /* kept for this visit */ }
}
/** English already made on this device, without waiting (null when not in memory). */
export const cachedNow = (korean: string) => memory.get(textKey(korean)) ?? null;

// ── The translator ───────────────────────────────────────────────────────────────────────────────────────
let translator: TranslatorLike | null = null, creating: Promise<TranslatorLike | null> | null = null;

/** What this browser can do: no API, no Korean→English model, a model to download, or ready. */
export async function checkDevice(): Promise<DeviceState> {
  const api = factory();
  if (!api) { set({ state: "unsupported" }); return "unsupported"; }
  if (translator) { set({ state: "ready" }); return "ready"; }
  try {
    const found = await api.availability(PAIR);
    const state: DeviceState = found === "available" ? "ready" : found === "unavailable" ? "unavailable" : found;
    set({ state: state === "ready" ? "checking" : state });
    // A model already on the device opens without a click.
    if (state === "ready") return (await prepare()) ? "ready" : "error";
    return state;
  } catch { set({ state: "error" }); return "error"; }
}

/**
 * Open the translator; when the model still has to be downloaded the browser needs a click, so call this from one
 * (the EN button, or the notice's button). Reports the download's progress.
 */
export function prepare(): Promise<boolean> {
  const api = factory();
  if (!api) { set({ state: "unsupported" }); return Promise.resolve(false); }
  if (translator) return Promise.resolve(true);
  creating ??= api.create({ ...PAIR, monitor: monitor => monitor.addEventListener("downloadprogress", event => { const loaded = (event as unknown as { loaded?: number }).loaded ?? 0; set({ state: "downloading", progress: Math.round(loaded * 100) }); }) })
    .then(created => { translator = created; set({ state: "ready", progress: undefined }); pump(); return created; })
    .catch(() => { creating = null; set({ state: status.state === "downloadable" ? "downloadable" : "error" }); return null; });
  return creating.then(Boolean);
}

// A queue, two at a time, so a long page does not freeze the browser.
const queue: { text: string; key: string; resolve: (english: string | null) => void }[] = [];
const waiting = new Map<string, Promise<string | null>>();
let running = 0;
function pump() {
  if (!translator) return;
  while (running < 2 && queue.length) {
    const job = queue.shift()!;
    running++;
    translator.translate(job.text).then(async english => { const clean = english?.trim(); if (clean) await keep(job.key, clean); job.resolve(clean || null); }, () => job.resolve(null))
      .finally(() => { running--; waiting.delete(job.key); set({ pending: queue.length + running }); pump(); });
  }
  set({ pending: queue.length + running });
}

/** The English of one Korean text: from the cache, or translated on this device (null when it cannot be). */
export function translateOnDevice(korean: string): Promise<string | null> {
  const key = textKey(korean);
  const busy = waiting.get(key);
  if (busy) return busy;
  const task = cached(key).then(found => {
    if (found) { waiting.delete(key); return found; }
    if (status.state === "unsupported" || status.state === "unavailable" || status.state === "error") { waiting.delete(key); return null; }
    return new Promise<string | null>(resolve => { queue.push({ text: korean, key, resolve }); set({ pending: queue.length + running }); pump(); });
  });
  waiting.set(key, task);
  return task;
}
/** Drop what is still waiting (the reader went back to Korean). */
export function cancelPending() { for (const job of queue.splice(0)) { waiting.delete(job.key); job.resolve(null); } set({ pending: running }); }
