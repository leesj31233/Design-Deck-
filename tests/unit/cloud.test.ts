import { describe, expect, it } from "vitest";
import { recordOf, rowOf } from "@/lib/paperflow/cloud/records";
import { isOwnerEmail, paperPath } from "@/lib/paperflow/cloud/config";
import { CREDIT_COST, PLANS, creditMonth, isPlanTier, papersFor } from "@/lib/paperflow/cloud/plans";
import { adoptEmailSession } from "@/lib/paperflow/cloud/browser";
import { sourceHash } from "@/lib/paperflow/translation/prompt-version";
import type { StoredDocument } from "@/lib/paperflow/persistence/types";

const doc: StoredDocument = {
  id: "a".repeat(64), filename: "paper.pdf", title: "Paper", mimeType: "application/pdf", byteLength: 1234, createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T01:00:00.000Z",
  pageCount: 12, blobKey: "a".repeat(64), currentPage: 4, visitedPages: [1, 2, 4], authors: ["Kim"], journal: "ACS Omega", year: 2021, doi: "10.1021/x", keywords: ["co-firing"],
  researchPoolIds: [], archived: false, sourceStatus: "local", jif: { value: 4.1, year: 2023, source: "JCR" }
};

describe("cloud library records", () => {
  it("round-trips a paper's bibliography and reading state through a database row", () => {
    const row = rowOf("user-1", doc, null);
    expect(row).toMatchObject({ user_id: "user-1", id: doc.id, byte_length: 1234, storage_path: null });
    expect(row.metadata).toMatchObject({ currentPage: 4, authors: ["Kim"], journal: "ACS Omega", jif: { value: 4.1 } });
    const back = recordOf(row, doc);
    expect(back).toMatchObject({ id: doc.id, currentPage: 4, visitedPages: [1, 2, 4], doi: "10.1021/x", sourceStatus: "local" });
  });
  it("marks where the PDF lives: cloud copy, this device, or another device", () => {
    expect(recordOf(rowOf("u", doc, "u/a.pdf"), doc).sourceStatus).toBe("cloud");
    expect(recordOf(rowOf("u", doc, null)).sourceStatus).toBe("remote");
    expect(recordOf(rowOf("u", doc, "u/a.pdf")).sourceStatus).toBe("cloud");
  });
  it("gives owner accounts local storage without a quota, configured outside the code", () => {
    expect(isOwnerEmail("Owner@Example.com", "owner@example.com, other@x.io")).toBe(true);
    expect(isOwnerEmail("someone@example.com", "owner@example.com")).toBe(false);
    expect(isOwnerEmail(undefined, "owner@example.com")).toBe(false);
    expect(paperPath("uid", "doc")).toBe("uid/doc.pdf");
    // New accounts are Testers: 100 MB and about 10 papers of translation a month.
    expect(PLANS.tester).toMatchObject({ storageBytes: 100 * 1024 * 1024, monthlyCredits: 800 });
    expect(papersFor(PLANS.tester.monthlyCredits!)).toBe(10);
    expect(PLANS.admin).toMatchObject({ storageBytes: null, monthlyCredits: null });
    expect(CREDIT_COST).toEqual({ paragraph: 1, guide: 30, concept: 3 });
    expect(isPlanTier("pro")).toBe(true); expect(isPlanTier("owner")).toBe(false);
    // Credit months follow Korean time: 23:30 UTC on Oct 31 is already November in Seoul.
    expect(creditMonth(Date.parse("2026-10-31T15:30:00Z"))).toBe("2026-11");
  });
  it("keys the shared translation cache by prompt version and normalised source text", async () => {
    const a = await sourceHash("Coal  is\nburned."), b = await sourceHash("Coal is burned.");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await sourceHash("Coal is burned.", "other-version")).not.toBe(a);
  });
  it("reads the emailed link's result: an expired link is explained, a bare link is not a session", async () => {
    await expect(adoptEmailSession("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).rejects.toThrow("링크가 만료되었거나");
    await expect(adoptEmailSession("")).resolves.toBe(false);
  });
});
