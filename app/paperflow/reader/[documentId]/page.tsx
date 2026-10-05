import { ReaderScreen } from "@/components/paperflow/reader/reader-screen";

export default async function ReaderPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return <ReaderScreen documentId={decodeURIComponent(documentId)} />;
}
