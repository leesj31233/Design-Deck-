import type { AttemptRecord, Evaluation, LearnerState, Question } from "../core/types";
import { readLocal, writeLocal, clearLocal } from "./local";
import { AIUnavailableError, type AIService, type Platform, type StorageService, type StorageStatus, NO_AI } from "./types";

/**
 * Adapters for the Next.js deployment. The server owns the AI key and the
 * database; the browser identifies the learner with a random sync key that can
 * be copied to another device. Without a database the app runs in a clearly
 * labeled local demo mode.
 */

const KEY_STORAGE = "engflow:v1:learner";

export function learnerKey(): string {
  try {
    let k = window.localStorage.getItem(KEY_STORAGE);
    if (!k || !/^[a-f0-9]{48}$/.test(k)) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      k = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem(KEY_STORAGE, k);
    }
    return k;
  } catch {
    return "0".repeat(48);
  }
}

export function setLearnerKey(k: string): boolean {
  if (!/^[a-f0-9]{48}$/.test(k.trim())) return false;
  try {
    window.localStorage.setItem(KEY_STORAGE, k.trim());
    clearLocal();
    return true;
  } catch {
    return false;
  }
}

export interface ServerStatus {
  ai: { available: boolean; model: string | null };
  db: { kind: "postgres" | "pglite" | "none" };
}

async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-engflow-learner": learnerKey(), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new AIUnavailableError(body.code ?? String(res.status), body.error ?? `요청 실패 (${res.status})`, res.status === 503 || res.status === 501);
  }
  return (await res.json()) as T;
}

export async function fetchServerStatus(): Promise<ServerStatus | null> {
  try {
    return await api<ServerStatus>("/api/engflow/status");
  } catch {
    return null;
  }
}

type Entity = "items" | "mistakes" | "skills" | "weak";
const ENTITIES: Entity[] = ["items", "mistakes", "skills", "weak"];

/** Server persistence: sends only entities that changed since the last successful sync. */
export function serverStorage(kind: "postgres" | "pglite"): StorageService {
  const sent = { core: "", entities: new Map<string, string>(), lastAttempt: null as string | null, diagnostics: new Set<string>(), generated: new Set<string>() };
  let saving: Promise<void> | null = null;
  let pending: LearnerState | null = null;
  const status: StorageStatus = {
    kind: "server",
    labelKo: kind === "postgres" ? "서버 DB(PostgreSQL)에 저장" : "로컬 서버 DB(PGlite)에 저장",
    detailKo:
      kind === "postgres"
        ? "학습 기록이 서버의 PostgreSQL에 저장됩니다. 설정의 동기화 키로 다른 기기에서 이어서 학습할 수 있습니다."
        : "개발용 내장 PostgreSQL(PGlite, .data 폴더)에 저장됩니다. 운영 환경에서는 DATABASE_URL을 설정하세요.",
    durable: true,
  };
  const remember = (s: LearnerState) => {
    sent.core = JSON.stringify(coreOf(s));
    for (const e of ENTITIES) for (const [k, v] of Object.entries(s[e] ?? {})) sent.entities.set(`${e}:${k}`, JSON.stringify(v));
    sent.lastAttempt = s.attempts[s.attempts.length - 1]?.id ?? null;
    sent.diagnostics = new Set(s.diagnostics.map((d) => d.id));
    sent.generated = new Set(s.generated.map((g) => g.id));
  };
  async function flush(s: LearnerState) {
    writeLocal(s);
    const core = coreOf(s);
    const coreJson = JSON.stringify(core);
    const changed = (e: Entity) =>
      Object.entries(s[e] ?? {})
        .filter(([k, v]) => sent.entities.get(`${e}:${k}`) !== JSON.stringify(v))
        .map(([, v]) => v);
    const lastIdx = sent.lastAttempt ? s.attempts.findIndex((a) => a.id === sent.lastAttempt) : -1;
    const payload = {
      core: coreJson !== sent.core ? core : undefined,
      items: changed("items"),
      mistakes: changed("mistakes"),
      skills: changed("skills"),
      attempts: s.attempts.slice(lastIdx + 1) as AttemptRecord[],
      diagnostics: s.diagnostics.filter((d) => !sent.diagnostics.has(d.id)),
      generated: s.generated.filter((g) => !sent.generated.has(g.id)),
      weak: changed("weak"),
    };
    const empty = !payload.core && !payload.items.length && !payload.mistakes.length && !payload.skills.length && !payload.attempts.length && !payload.diagnostics.length && !payload.generated.length && !payload.weak.length;
    if (empty) return;
    await api("/api/engflow/state", { json: payload });
    remember(s);
  }
  return {
    status: () => status,
    async load() {
      const local = readLocal();
      const r = await api<{ state: LearnerState | null }>("/api/engflow/state").catch(() => ({ state: null }));
      if (r.state) {
        remember(r.state);
        if (local && local.updatedAt > r.state.updatedAt) {
          await flush(local).catch(() => undefined);
          return local;
        }
        writeLocal(r.state);
        return r.state;
      }
      if (local) await flush(local).catch(() => undefined);
      return local;
    },
    save(s) {
      writeLocal(s);
      if (saving) {
        pending = s;
        return saving;
      }
      saving = (async () => {
        let next: LearnerState | null = s;
        while (next) {
          pending = null;
          await flush(next).catch((e) => console.warn("EngFlow sync failed", e));
          next = pending;
        }
        saving = null;
      })();
      return saving;
    },
    async clear() {
      clearLocal();
      await api("/api/engflow/state", { method: "DELETE" }).catch(() => undefined);
    },
  };
}

export function coreOf(s: LearnerState) {
  return { profile: s.profile, settings: s.settings, daily: s.daily, seen: s.seen, updatedAt: s.updatedAt };
}

export function serverAI(model: string | null): AIService {
  let disabled = false;
  const call = async <T,>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AIUnavailableError && e.permanent) disabled = true;
      throw e;
    }
  };
  return {
    status: () =>
      disabled
        ? { kind: "none", available: false, labelKo: "규칙 기반 평가", detailKo: "서버 AI를 사용할 수 없어 규칙 기반 평가만 사용합니다." }
        : { kind: "server", available: true, labelKo: "Claude 분석", detailKo: `서버에서 Claude${model ? ` (${model})` : ""}가 평가합니다. API 키는 서버에만 있습니다.` },
    evaluate: (q, answer, _local, depth, signal) =>
      call(async () => (await api<{ evaluation: Evaluation }>("/api/engflow/evaluate", { json: { question: q, answer, depth }, signal })).evaluation),
    explain: (kind, q, ev, question, onText, signal) =>
      call(async () => {
        const res = await fetch("/api/engflow/explain", {
          method: "POST",
          headers: { "content-type": "application/json", "x-engflow-learner": learnerKey() },
          body: JSON.stringify({ kind, question: q, evaluation: ev, ask: question }),
          signal,
        });
        if (!res.ok || !res.body) throw new AIUnavailableError(String(res.status), "AI 설명을 가져오지 못했습니다.", res.status === 503);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += dec.decode(value, { stream: true });
          onText(text);
        }
        return text;
      }),
    generate: (req, signal) => call(async () => (await api<{ question: Question }>("/api/engflow/generate", { json: req, signal })).question),
  };
}

export async function webPlatform(): Promise<Platform & { server: ServerStatus | null }> {
  const server = await fetchServerStatus();
  const { localStorageService } = await import("./local");
  const storage = server && server.db.kind !== "none" ? serverStorage(server.db.kind) : localStorageService();
  const ai = server?.ai.available ? serverAI(server.ai.model) : NO_AI;
  return {
    target: "web",
    server,
    storage,
    ai,
    async download(filename, data) {
      try {
        const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return true;
      } catch {
        return false;
      }
    },
  };
}
