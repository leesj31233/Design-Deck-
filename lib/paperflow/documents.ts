"use client";
import type { DocumentRecord } from "./types";
import { getRepositories, sha256Hex } from "./storage/repositories";
import { openPdf } from "./pdf/pdfjs";

export const SAMPLE_DOCUMENT_ID = "sample-cofiring";
const SAMPLE_URL = "/samples/paperflow-sample-cofiring.pdf";
const SAMPLE_TITLE = "Torrefied EFB co-firing in a 500 MWe PC boiler — turbulence, particle and NOx modelling";

async function fetchBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.arrayBuffer();
}

/** Registers the bundled sample (binary stays a static asset; only metadata goes to IndexedDB). */
export async function ensureSampleDocument(): Promise<DocumentRecord> {
  const { documents } = getRepositories();
  const existing = await documents.get(SAMPLE_DOCUMENT_ID);
  if (existing) return existing;
  const bytes = await fetchBytes(SAMPLE_URL);
  const record: DocumentRecord = {
    id: SAMPLE_DOCUMENT_ID,
    title: SAMPLE_TITLE,
    fileName: "paperflow-sample-cofiring.pdf",
    sha256: await sha256Hex(bytes),
    byteLength: bytes.byteLength,
    source: "bundled-sample",
    url: SAMPLE_URL,
    importedAt: Date.now(),
  };
  await documents.putRecord(record);
  return record;
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  if (id === SAMPLE_DOCUMENT_ID) return ensureSampleDocument();
  return getRepositories().documents.get(id);
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  await ensureSampleDocument();
  return getRepositories().documents.list();
}

export type LoadedBytes = { bytes: ArrayBuffer; integrity: "verified" | "changed" };

/** Loads the original bytes and verifies them against the recorded hash. */
export async function loadDocumentBytes(record: DocumentRecord): Promise<LoadedBytes> {
  const bytes = record.url ? await fetchBytes(record.url) : await getRepositories().documents.getBinary(record.sha256);
  if (!bytes) throw new Error("The original PDF binary is missing from local storage.");
  const sha = await sha256Hex(bytes);
  return { bytes, integrity: sha === record.sha256 ? "verified" : "changed" };
}

export class NotAPdfError extends Error {}

export async function importPdfFile(file: File): Promise<DocumentRecord> {
  const bytes = await file.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 1024)));
  if (!head.includes("%PDF-")) throw new NotAPdfError(`${file.name} is not a PDF file.`);

  const sha256 = await sha256Hex(bytes);
  const id = sha256.slice(0, 20);
  const { documents } = getRepositories();
  const existing = await documents.get(id);
  if (existing) return existing;

  const { pdf, close } = await openPdf(bytes);
  let title = file.name.replace(/\.pdf$/i, "");
  try {
    const meta = await pdf.getMetadata();
    const info = meta.info as { Title?: unknown };
    if (typeof info.Title === "string" && info.Title.trim().length > 3) title = info.Title.trim();
  } catch {
    // Metadata is optional.
  }
  const record: DocumentRecord = {
    id,
    title,
    fileName: file.name,
    sha256,
    byteLength: bytes.byteLength,
    pageCount: pdf.numPages,
    source: "local-import",
    importedAt: Date.now(),
  };
  await close();
  await documents.putBinaryOnce(sha256, bytes);
  await documents.putRecord(record);
  return record;
}

export async function touchDocument(record: DocumentRecord, patch: Partial<Pick<DocumentRecord, "lastPage" | "pageCount">>) {
  await getRepositories().documents.putRecord({ ...record, ...patch, lastOpenedAt: Date.now() });
}
