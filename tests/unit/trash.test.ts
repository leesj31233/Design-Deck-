import { describe, expect, it } from "vitest";
import { daysLeft, expired, TRASH_DAYS } from "@/lib/paperflow/library/trash";
import { recordOf, rowOf } from "@/lib/paperflow/cloud/records";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";

const DAY = 86_400_000, now = Date.parse("2026-11-01T00:00:00Z");
describe("trash", () => {
  it("keeps a paper 30 days, then it expires", () => {
    expect(TRASH_DAYS).toBe(30);
    expect(daysLeft(new Date(now - 2 * DAY).toISOString(), now)).toBe(28);
    expect(expired({ deletedAt: new Date(now - 29 * DAY).toISOString() }, now)).toBe(false);
    expect(expired({ deletedAt: new Date(now - 30 * DAY).toISOString() }, now)).toBe(true);
    expect(expired({ deletedAt: null }, now)).toBe(false);
  });
  it("syncs the trash state, and a restore (null) overrides the other device's trashed copy", () => {
    const doc = { id: "a", filename: "a.pdf", title: "A", mimeType: "application/pdf", byteLength: 10, createdAt: "x", updatedAt: "y", pageCount: 1, blobKey: "a", currentPage: 1, authors: [], researchPoolIds: [], archived: false, sourceStatus: "local", deletedAt: "2026-10-04T00:00:00Z" } as StoredDocument;
    expect(rowOf("u", doc, null).metadata.deletedAt).toBe("2026-10-04T00:00:00Z");
    const restored = rowOf("u", { ...doc, deletedAt: null }, null);
    expect(recordOf(restored, doc).deletedAt).toBeNull();
  });
});
