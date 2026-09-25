import type { Annotation } from "../anchors/types";
export type StoredDocument = {
  id: string; filename: string; title: string; mimeType: "application/pdf"; byteLength: number;
  createdAt: string; updatedAt: string; pageCount: number; fingerprint?: string; blobKey: string;
  currentPage: number; lastOpenedAt?: string; authors: string[]; journal?: string; year?: number; doi?: string;
  researchPoolIds: string[]; archived: boolean; sourceStatus: "local";
};
export type StoredDocumentInput = { blob: Blob; filename: string; pageCount: number; fingerprint?: string };
export interface DocumentRepository {
  saveDocument(input: StoredDocumentInput): Promise<StoredDocument>;
  getDocument(id: string): Promise<StoredDocument | null>;
  getDocumentBlob(id: string): Promise<Blob | null>;
  listDocuments(): Promise<StoredDocument[]>;
  updateDocument(id: string, patch: Partial<Pick<StoredDocument, "currentPage" | "lastOpenedAt" | "archived" | "title" | "researchPoolIds">>): Promise<void>;
}
export interface AnnotationRepository {
  create(annotation: Annotation): Promise<void>;
  update(annotation: Annotation): Promise<void>;
  listByDocument(documentId: string): Promise<Annotation[]>;
  listAll(): Promise<Annotation[]>;
  remove(annotationId: string): Promise<void>;
}
