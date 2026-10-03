import type { Annotation } from "../anchors/types";
import type { ScholarWork } from "../scholar/openalex";
import type { PaperGuide } from "../guide/guide";
export type StoredDocument = {
  id: string; filename: string; title: string; mimeType: "application/pdf"; byteLength: number;
  createdAt: string; updatedAt: string; pageCount: number; fingerprint?: string; blobKey: string;
  visitedPages?: number[]; opens?: string[]; keywords?: string[]; citationCount?: number; metadataSource?: string; metadataCheckedAt?: string; jif?: { value: number; year: number; source: string };
  currentPage: number; lastOpenedAt?: string; authors: string[]; journal?: string; year?: number; doi?: string;
  researchPoolIds: string[]; archived: boolean;
  /** local: PDF only here. cloud: PDF also in the account's cloud storage. remote: listed by the account, PDF on another device. */
  sourceStatus: "local" | "cloud" | "remote";
  storagePath?: string;
  /** OpenAlex record: authors, institutions, journal, topic hierarchy, related works. */
  scholar?: ScholarWork;
  /** AI study guide (overview, findings tied to source paragraphs, terms, questions). */
  guide?: PaperGuide;
};
export type StoredDocumentInput = { blob: Blob; filename: string; pageCount: number; fingerprint?: string };
export interface DocumentRepository {
  saveDocument(input: StoredDocumentInput): Promise<StoredDocument>;
  getDocument(id: string): Promise<StoredDocument | null>;
  /** `remote: false` never downloads (library covers must not pull every PDF from the cloud). */
  getDocumentBlob(id: string, options?: { remote?: boolean }): Promise<Blob | null>;
  listDocuments(): Promise<StoredDocument[]>;
  updateDocument(id: string, patch: Partial<Omit<StoredDocument, "id" | "blobKey" | "mimeType" | "byteLength" | "createdAt">>): Promise<void>;
  /** Sync only: write a record as received from the account, without announcing a local change. */
  putRecord(record: StoredDocument): Promise<void>;
  putBlob(id: string, blob: Blob): Promise<void>;
}
export interface AnnotationRepository {
  create(annotation: Annotation): Promise<void>;
  update(annotation: Annotation): Promise<void>;
  listByDocument(documentId: string): Promise<Annotation[]>;
  listAll(): Promise<Annotation[]>;
  remove(annotationId: string): Promise<void>;
  /** Sync only: write or delete without announcing a local change. */
  putRaw(annotation: Annotation): Promise<void>;
  removeRaw(annotationId: string): Promise<void>;
}
