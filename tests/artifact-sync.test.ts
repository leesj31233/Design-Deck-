import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "@/engflow/core/store";

/** In-memory stand-in for the claude.ai runtime (window.claude.use). */
function fakeRuntime(opts: { db: boolean }) {
  const docs = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  const db = {
    doc(path: string) {
      return {
        get: async () => ({ exists: docs.has(path), data: () => docs.get(path), metadata: { hasPendingWrites: false, fromCache: false } }),
        set: async (d: Record<string, unknown>) => {
          if (JSON.stringify(d).length > 256 * 1024) throw { code: "invalid_argument" };
          writes.push(path);
          docs.set(path, JSON.parse(JSON.stringify(d)));
        },
        delete: async () => void docs.delete(path),
        onSnapshot: () => () => undefined,
      };
    },
  };
  const user = { id: async () => "u_test" };
  (globalThis as unknown as { claude: unknown }).claude = { use: async (n: string) => (n === "db" ? (opts.db ? db : null) : n === "user" ? user : null) };
  return { docs, writes };
}

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } };
});

describe("artifact storage (claude.ai db)", () => {
  it("splits state into per-viewer documents under data/users/<id>/ and loads it back", async () => {
    const rt = fakeRuntime({ db: true });
    const { artifactStorage } = await import("@/engflow/platform/artifact");
    const storage = artifactStorage();
    expect(await storage.ready).toBe(true);
    expect(storage.status().kind).toBe("artifact-db");
    const s = createInitialState(1_700_000_000_000);
    s.attempts = Array.from({ length: 450 }, (_, i) => ({ id: `a${i}`, at: i, questionId: "q", mode: "phrase", context: "lesson", answer: "x", overall: 50, scores: { meaning: 1, grammar: 1, terminology: 1, organization: 1, comprehensibility: 1 }, errorCategories: [], hint: 0, responseMs: 1, firstKeyMs: null, grade: 2, evaluator: "local" }));
    await storage.save(s);
    expect([...rt.docs.keys()].every((k) => k.startsWith("data/users/u_test/"))).toBe(true);
    expect(rt.docs.has("data/users/u_test/attempts-2")).toBe(true);
    expect(rt.writes[rt.writes.length - 1]).toBe("data/users/u_test/state"); // head written last
    const again = artifactStorage();
    const loaded = await again.load();
    expect(loaded?.attempts).toHaveLength(450);
    expect(Object.keys(loaded!.items)).toEqual(Object.keys(s.items));
  });
  it("writes only documents that changed", async () => {
    const rt = fakeRuntime({ db: true });
    const { artifactStorage } = await import("@/engflow/platform/artifact");
    const storage = artifactStorage();
    const s = createInitialState(1);
    await storage.save(s);
    const n = rt.writes.length;
    await storage.save({ ...s, settings: { ...s.settings, dailyTarget: 20 }, updatedAt: 2 });
    expect(rt.writes.slice(n)).toEqual(["data/users/u_test/state"]);
  });
  it("falls back to this-device storage when the db capability is unavailable", async () => {
    fakeRuntime({ db: false });
    const { artifactStorage } = await import("@/engflow/platform/artifact");
    const storage = artifactStorage();
    expect(await storage.ready).toBe(false);
    expect(storage.status().durable).toBe(false);
    await storage.save(createInitialState(1));
    expect(await storage.load()).not.toBeNull();
  });
});
