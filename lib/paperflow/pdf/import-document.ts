import { detectMetadata } from "./metadata";
import { documentRepository } from "../persistence/document-repository";
import { pdfAdapter } from "./pdf-adapter";
export async function importDocument(file: File) {
  if (!/\.pdf$/i.test(file.name) || !file.size) throw new Error("비어 있지 않은 .pdf 파일을 선택해 주세요.");
  const bytes = await file.arrayBuffer();
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-")) throw new Error("올바른 PDF 파일이 아닙니다.");
  const pdf = await pdfAdapter.open(bytes.slice(0));
  try { const record = await documentRepository.saveDocument({ blob: file, filename: file.name, pageCount: pdf.pageCount, fingerprint: pdf.fingerprint }); if (!record.metadataSource) { const metadata = await pdf.readMetadata(); await documentRepository.updateDocument(record.id, detectMetadata(metadata.text, metadata.info)); } return record; }
  finally { await pdf.destroy(); }
}
