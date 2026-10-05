import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createIndexedDbRepositories, ImmutableBinaryError, sha256Hex } from "@/lib/paperflow/storage/repositories";
import type { Highlight } from "@/lib/paperflow/types";

function highlight(id: string, pageIndex: number, start: number): Highlight {
  return {
    id,
    documentId: "doc-1",
    color: "yellow",
    createdAt: 1,
    updatedAt: 1,
    anchor: {
      documentId: "doc-1",
      pageIndex,
      textQuote: "realizable k-ε",
      prefix: "A ",
      suffix: " turbulence",
      rects: [{ x: 10, y: 20, width: 80, height: 10 }],
      normalizedRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.01 }],
      textPosition: { start, end: start + 14 },
    },
  };
}

describe("highlight persistence (IndexedDB)", () => {
  it("round-trips highlights across repository instances (simulated reload)", async () => {
    const factory = new IDBFactory();
    const first = createIndexedDbRepositories(factory, "t1");
    await first.highlights.put(highlight("b", 2, 5));
    await first.highlights.put(highlight("a", 0, 40));
    await first.highlights.put({ ...highlight("other", 0, 1), documentId: "doc-2" });

    const reloaded = createIndexedDbRepositories(factory, "t1");
    const list = await reloaded.highlights.listByDocument("doc-1");
    expect(list.map((h) => h.id)).toEqual(["a", "b"]);
    expect(list[0].anchor).toEqual(highlight("a", 0, 40).anchor);
  });

  it("updates and removes", async () => {
    const repos = createIndexedDbRepositories(new IDBFactory(), "t2");
    await repos.highlights.put(highlight("a", 0, 1));
    await repos.highlights.put({ ...highlight("a", 0, 1), color: "green", updatedAt: 2 });
    expect((await repos.highlights.listByDocument("doc-1"))[0].color).toBe("green");
    await repos.highlights.remove("a");
    expect(await repos.highlights.listByDocument("doc-1")).toEqual([]);
  });

  it("persists a highlight locally within the 50ms budget", async () => {
    const repos = createIndexedDbRepositories(new IDBFactory(), "t3");
    await repos.highlights.put(highlight("warm", 0, 0));
    const t0 = performance.now();
    await repos.highlights.put(highlight("timed", 1, 0));
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe("immutable document binaries", () => {
  it("stores bytes once and refuses different bytes for the same hash", async () => {
    const repos = createIndexedDbRepositories(new IDBFactory(), "t4");
    const bytes = new TextEncoder().encode("%PDF-1.7 sample").buffer as ArrayBuffer;
    const hash = await sha256Hex(bytes);
    await repos.documents.putBinaryOnce(hash, bytes);
    await repos.documents.putBinaryOnce(hash, bytes); // idempotent
    new Uint8Array(bytes)[0] = 0; // mutating caller copy must not affect stored binary
    const stored = await repos.documents.getBinary(hash);
    expect(new TextDecoder().decode(stored)).toBe("%PDF-1.7 sample");
    await expect(repos.documents.putBinaryOnce(hash, new ArrayBuffer(3))).rejects.toBeInstanceOf(ImmutableBinaryError);
  });
});
