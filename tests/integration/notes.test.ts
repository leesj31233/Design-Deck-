import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { closeDatabase } from "@/lib/paperflow/persistence/indexeddb";
import { noteRepository } from "@/lib/paperflow/notes/note-repository";
afterEach(closeDatabase);
it("keeps notebook notes across reconnects and deletes them", async () => {
  const note = { id: "n1", title: "GI 비교", body: "[[(Biochar, p.3) 'GI'|/reader/a?page=3]]", pinned: true, createdAt: "2026-10-06", updatedAt: "2026-10-06" };
  await noteRepository.put(note);
  await closeDatabase();
  expect(await noteRepository.list()).toEqual([note]);
  await noteRepository.remove("n1");
  expect(await noteRepository.list()).toEqual([]);
});
