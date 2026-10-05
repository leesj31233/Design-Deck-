"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Highlight } from "./types";
import { getRepositories } from "./storage/repositories";
import { getDocument, listDocuments, loadDocumentBytes } from "./documents";
import { record } from "./perf";

/** Server/persisted state lives in TanStack Query; local reader interaction state lives in Zustand. */
export const queryKeys = {
  documents: ["paperflow", "documents"] as const,
  document: (id: string) => ["paperflow", "document", id] as const,
  bytes: (id: string, sha: string) => ["paperflow", "bytes", id, sha] as const,
  highlights: (documentId: string) => ["paperflow", "highlights", documentId] as const,
};

export function useDocuments() {
  return useQuery({ queryKey: queryKeys.documents, queryFn: listDocuments });
}

export function useDocumentRecord(id: string) {
  return useQuery({ queryKey: queryKeys.document(id), queryFn: async () => (await getDocument(id)) ?? null });
}

export function useDocumentBytes(id: string, sha?: string) {
  return useQuery({
    queryKey: queryKeys.bytes(id, sha ?? ""),
    enabled: Boolean(sha),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const doc = await getDocument(id);
      if (!doc) throw new Error("Document not found");
      return loadDocumentBytes(doc);
    },
  });
}

export function useHighlights(documentId: string) {
  return useQuery({
    queryKey: queryKeys.highlights(documentId),
    queryFn: () => getRepositories().highlights.listByDocument(documentId),
  });
}

function useHighlightMutation<TVars>(documentId: string, apply: (list: Highlight[], vars: TVars) => Highlight[], persist: (vars: TVars) => Promise<void>) {
  const client = useQueryClient();
  const key = queryKeys.highlights(documentId);
  return useMutation({
    mutationFn: async (vars: TVars) => {
      const t0 = performance.now();
      await persist(vars);
      return record("highlight-persist", performance.now() - t0);
    },
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Highlight[]>(key) ?? [];
      client.setQueryData<Highlight[]>(key, apply(previous, vars));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) client.setQueryData(key, context.previous);
    },
  });
}

export function useSaveHighlight(documentId: string) {
  return useHighlightMutation<Highlight>(
    documentId,
    (list, h) => [...list.filter((x) => x.id !== h.id), h],
    (h) => getRepositories().highlights.put(h),
  );
}

export function useDeleteHighlight(documentId: string) {
  return useHighlightMutation<string>(
    documentId,
    (list, id) => list.filter((x) => x.id !== id),
    (id) => getRepositories().highlights.remove(id),
  );
}
