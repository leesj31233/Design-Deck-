import { ReaderShell } from "@/components/paperflow/reader/reader-shell";
export default async function ReaderPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return <ReaderShell documentId={documentId}/>;
}
