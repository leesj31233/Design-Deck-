import {
  AIFormatError, buildEvaluationPrompt, buildExplainPrompt, buildGenerationPrompt, buildRepairPrompt, generationExample, normalizeAIEvaluation,
  parseGeneratedQuestion,
} from "../core/ai";
import type { AttemptRecord, LearnerState, Question } from "../core/types";
import { TALK_TOPIC_BY_ID, buildTalkPrompt, parseTalkReply } from "../core/freetalk";
import { SKILLS, skillName } from "../content/skills";
import { QUESTIONS } from "../content";
import { clearLocal, readLocal, writeLocal } from "./local";
import { AIUnavailableError, type AIService, type Platform, type StorageService, type StorageStatus } from "./types";

/**
 * Adapters for the claude.ai artifact runtime (window.claude.use):
 *  - db + user: each viewer's private subtree data/users/<id>/ — syncs across
 *    iPhone, iPad and desktop for the same Claude account.
 *  - sample: Claude evaluates answers on the viewer's own account.
 *  - downloads: JSON export.
 * Every capability may be absent; the app keeps working with local storage
 * and the rule-based evaluator.
 */

/* Minimal structural types for the runtime (see artifact-capabilities d.ts). */
interface DocSnap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { hasPendingWrites: boolean; fromCache: boolean };
}
interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: DocSnap) => void, error?: (e: { code: string }) => void): () => void;
}
interface Db {
  doc(path: string): DocRef;
}
interface UserCap {
  id(): Promise<string | null>;
}
type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: (input: string, opts?: Record<string, unknown>) => Promise<unknown>;
};
interface DownloadsCap {
  save(r: { filename: string; data: string }): Promise<{ status: string }>;
}
interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

function runtime(): ClaudeRuntime | null {
  const c = (globalThis as unknown as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === "function" ? c : null;
}

export function isArtifactRuntime(): boolean {
  return runtime() !== null;
}

async function use<T>(name: string): Promise<T | null> {
  const c = runtime();
  if (!c) return null;
  try {
    return ((await c.use(name)) as T) ?? null;
  } catch {
    return null;
  }
}

/* ───────────── Storage ───────────── */

const CHUNK = 200;

type Docs = Record<string, Record<string, unknown>>;

function splitState(s: LearnerState): Docs {
  const docs: Docs = {
    state: {
      v: 1,
      updatedAt: s.updatedAt,
      profile: s.profile,
      settings: s.settings,
      skills: s.skills,
      daily: s.daily,
      seen: s.seen,
      diagnostics: s.diagnostics,
      attemptChunks: Math.ceil(s.attempts.length / CHUNK),
    },
    items: { items: Object.fromEntries(Object.entries(s.items).map(([k, v]) => [k, { ...v, history: v.history.slice(-12) }])) },
    mistakes: { mistakes: Object.fromEntries(Object.values(s.mistakes).sort((a, b) => b.lastAt - a.lastAt).slice(0, 300).map((m) => [m.id, m])) },
    generated: { generated: s.generated.slice(-40) },
    weak: { weak: s.weak ?? {} },
  };
  for (let i = 0; i * CHUNK < s.attempts.length; i++) docs[`attempts-${i}`] = { list: s.attempts.slice(i * CHUNK, (i + 1) * CHUNK) };
  return docs;
}

export function artifactStorage(): StorageService & { ready: Promise<boolean> } {
  let db: Db | null = null;
  let base = "";
  let status: StorageStatus = {
    kind: "local",
    labelKo: "연결 중…",
    detailKo: "Claude 계정 저장소에 연결하는 동안 이 기기에 임시 저장합니다.",
    durable: false,
  };
  const written = new Map<string, string>();
  let lastWrittenAt = 0;
  let saving: Promise<void> | null = null;
  let pending: LearnerState | null = null;
  let readOnly = false;

  const ready = (async () => {
    const [dbCap, user] = await Promise.all([use<Db>("db"), use<UserCap>("user")]);
    const uid = user ? await user.id().catch(() => null) : null;
    if (!dbCap || !uid) {
      status = {
        kind: "local",
        labelKo: "이 기기에만 저장",
        detailKo: "Claude 계정 저장소를 사용할 수 없어(로그아웃 또는 권한 없음) 이 기기의 브라우저에만 저장합니다.",
        durable: false,
      };
      return false;
    }
    db = dbCap;
    base = `data/users/${uid}`;
    status = {
      kind: "artifact-db",
      labelKo: "Claude 계정에 동기화",
      detailKo: "학습 기록이 Claude 계정의 비공개 저장소에 저장되어 iPhone·iPad·PC에서 같은 기록으로 이어집니다.",
      durable: true,
    };
    return true;
  })();

  async function loadRemote(): Promise<LearnerState | null> {
    if (!db) return null;
    const head = await db.doc(`${base}/state`).get();
    if (!head.exists) return null;
    const st = head.data() as Record<string, unknown>;
    const [items, mistakes, generated, weak] = await Promise.all(["items", "mistakes", "generated", "weak"].map((k) => db!.doc(`${base}/${k}`).get()));
    const chunks = Number(st.attemptChunks ?? 0);
    const attemptDocs = await Promise.all(Array.from({ length: chunks }, (_, i) => db!.doc(`${base}/attempts-${i}`).get()));
    const attempts = attemptDocs.flatMap((d) => ((d.data()?.list as AttemptRecord[]) ?? []));
    const state = {
      schema: 1,
      profile: st.profile,
      settings: st.settings,
      skills: st.skills ?? {},
      daily: st.daily ?? {},
      seen: st.seen ?? {},
      diagnostics: st.diagnostics ?? [],
      items: (items.data()?.items as LearnerState["items"]) ?? {},
      mistakes: (mistakes.data()?.mistakes as LearnerState["mistakes"]) ?? {},
      generated: (generated.data()?.generated as Question[]) ?? [],
      weak: (weak.data()?.weak as LearnerState["weak"]) ?? {},
      attempts,
      updatedAt: Number(st.updatedAt ?? 0),
    } as LearnerState;
    for (const [k, v] of Object.entries(splitState(state))) written.set(k, JSON.stringify(v));
    lastWrittenAt = state.updatedAt;
    return state;
  }

  async function flush(s: LearnerState): Promise<void> {
    writeLocal(s);
    await ready;
    if (!db || readOnly) return;
    const docs = splitState(s);
    // Content docs first, the head ("state") last, so a reader never sees a head that points at missing chunks.
    const keys = Object.keys(docs).filter((k) => k !== "state").concat("state");
    for (const k of keys) {
      const json = JSON.stringify(docs[k]);
      if (written.get(k) === json) continue;
      try {
        await db.doc(`${base}/${k}`).set(docs[k]);
        written.set(k, json);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "invalid_argument") {
          readOnly = true;
          status = { kind: "local", labelKo: "이 기기에만 저장", detailKo: "이 아티팩트에 쓰기 권한이 없어 이 기기에만 저장합니다.", durable: false };
          return;
        }
        if (code === "unavailable") {
          await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
          await db.doc(`${base}/${k}`).set(docs[k]);
          written.set(k, json);
          continue;
        }
        throw e;
      }
    }
    lastWrittenAt = s.updatedAt;
  }

  const service: StorageService & { ready: Promise<boolean> } = {
    ready,
    status: () => status,
    async load() {
      const local = readLocal();
      const ok = await ready;
      if (!ok) return local;
      const remote = await loadRemote().catch(() => null);
      if (!remote) {
        // First sync from this account: upload what this device already has.
        if (local) await flush(local).catch(() => undefined);
        return local;
      }
      if (local && local.updatedAt > remote.updatedAt) {
        await flush(local).catch(() => undefined);
        return local;
      }
      writeLocal(remote);
      return remote;
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
    subscribe(onRemote) {
      let unsub: (() => void) | null = null;
      let cancelled = false;
      ready.then((ok) => {
        if (!ok || !db || cancelled) return;
        unsub = db.doc(`${base}/state`).onSnapshot(
          (snap) => {
            if (!snap.exists || snap.metadata.hasPendingWrites) return;
            const at = Number(snap.data()?.updatedAt ?? 0);
            if (at > lastWrittenAt) loadRemote().then((s) => s && onRemote(s)).catch(() => undefined);
          },
          () => undefined,
        );
      });
      return () => {
        cancelled = true;
        unsub?.();
      };
    },
    async clear() {
      clearLocal();
      await ready;
      if (!db || readOnly) return;
      const keys = [...written.keys()];
      for (const k of keys) await db.doc(`${base}/${k}`).delete().catch(() => undefined);
      await db.doc(`${base}/state`).delete().catch(() => undefined);
      written.clear();
    },
  };
  return service;
}

/* ───────────── AI (claude.use("sample")) ───────────── */

const PERMANENT = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);

function mapSampleError(e: unknown): Error {
  if (e instanceof AIFormatError || e instanceof AIUnavailableError) return e;
  const code = (e as { code?: string })?.code ?? "upstream_error";
  if (code === "cancelled") return new AIUnavailableError("cancelled", "취소했습니다.");
  if (PERMANENT.has(code)) return new AIUnavailableError(code, "이 화면에서는 Claude 분석을 사용할 수 없습니다. 규칙 기반 평가로 계속합니다.", true);
  if (code === "rate_limited") return new AIUnavailableError(code, "Claude 요청이 많습니다. 잠시 후 다시 시도하세요.");
  if (code === "invalid_json") return new AIFormatError("Claude 응답을 해석하지 못했습니다.");
  if (code === "session_expired") return new AIUnavailableError(code, "Claude에 다시 로그인해야 합니다.", true);
  if (code === "refused") return new AIUnavailableError(code, "Claude가 이 요청에 답하지 않았습니다.");
  return new AIUnavailableError(code, "Claude 연결이 일시적으로 실패했습니다. 다시 시도하세요.");
}

export function artifactAI(): AIService & { ready: Promise<boolean> } {
  let sample: SampleFn | null = null;
  let disabled = false;
  let state: "connecting" | "ready" | "absent" = "connecting";
  const ready = use<SampleFn>("sample").then((s) => {
    sample = s;
    state = s ? "ready" : "absent";
    return !!s;
  });
  const need = () => {
    if (disabled || !sample) throw new AIUnavailableError("unavailable", "Claude 분석을 사용할 수 없습니다.", true);
    return sample;
  };
  const guard = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      const err = mapSampleError(e);
      if (err instanceof AIUnavailableError && err.permanent) disabled = true;
      throw err;
    }
  };
  return {
    ready,
    status: () =>
      state === "ready" && !disabled
        ? { kind: "artifact", available: true, labelKo: "Claude 분석", detailKo: "답안을 내 Claude 계정으로 Claude가 평가합니다(첫 사용 시 허용 요청)." }
        : state === "connecting"
          ? { kind: "artifact", available: false, labelKo: "Claude 연결 중", detailKo: "연결되는 동안 규칙 기반 평가를 사용합니다." }
          : { kind: "none", available: false, labelKo: "규칙 기반 평가", detailKo: disabled ? "Claude 사용이 허용되지 않아 규칙 기반 평가만 사용합니다." : "이 화면에서는 Claude 분석을 사용할 수 없습니다." },
    evaluate: (q, answer, local, depth, signal) =>
      guard(async () => {
        await ready;
        const raw = await need().json(buildEvaluationPrompt(q, answer, local), { modelTier: depth, signal });
        return normalizeAIEvaluation(raw, q, answer, local);
      }),
    explain: (kind, q, ev, question, onText, signal) =>
      guard(async () => {
        await ready;
        const r = await need()(buildExplainPrompt(kind, q, ev, question), { modelTier: "quick", signal, onText: ({ text }: { text: string }) => onText(text), cache: kind === "ask" ? false : undefined });
        return r.text;
      }),
    generate: (req, signal) =>
      guard(async () => {
        await ready;
        const s = need();
        const example = generationExample(req, QUESTIONS);
        const ctx = { skillIds: new Set(SKILLS.map((x) => x.id)) };
        const raw = await s.json(buildGenerationPrompt(req, skillName(req.skill), stripProbes(example)), { modelTier: "default", signal, cache: false });
        let r = parseGeneratedQuestion(raw, ctx);
        if (!r.question) {
          const fixed = await s.json(buildRepairPrompt(raw, r.problems), { modelTier: "default", signal, cache: false });
          r = parseGeneratedQuestion(fixed, ctx);
        }
        if (!r.question) throw new AIFormatError(`생성된 문제가 검증을 통과하지 못했습니다: ${r.problems.slice(0, 2).join("; ")}`);
        return r.question;
      }),
    talk: (topicId, lines, turn, signal) =>
      guard(async () => {
        await ready;
        const topic = TALK_TOPIC_BY_ID[topicId];
        if (!topic) throw new AIFormatError("알 수 없는 대화 주제입니다.");
        const last = [...lines].reverse().find((l) => l.who === "me")?.en ?? "";
        const raw = await need().json(buildTalkPrompt(topic, lines, turn), { modelTier: "quick", signal, cache: false });
        try {
          return parseTalkReply(raw, last);
        } catch {
          throw new AIFormatError("Claude 응답을 해석하지 못했습니다.");
        }
      }),
  };
}

export function stripProbes(q: Question): Question {
  const { probes: _p, source: _s, ...rest } = q;
  return rest as Question;
}

export function artifactPlatform(): Platform {
  return {
    target: "artifact",
    storage: artifactStorage(),
    ai: artifactAI(),
    async download(filename, data) {
      const d = await use<DownloadsCap>("downloads");
      if (!d) return false;
      try {
        await d.save({ filename, data });
        return true;
      } catch {
        return false;
      }
    },
  };
}
