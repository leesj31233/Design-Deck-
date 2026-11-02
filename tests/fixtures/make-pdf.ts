// A tiny original test document; no copyrighted research files enter the repo.
export function makePdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    "",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  const lines = [
    "BT /F1 20 Tf 60 720 Td (Engineering Reading Fixture) Tj /F1 12 Tf 0 -42 Td (The realizable turbulence model predicts heat flux.) Tj 0 -24 Td (Coal co-firing and torrefaction are research topics.) Tj 0 -24 Td (This original fixture tests multi-line text selection.) Tj 0 -24 Td (No scientific claims are made by this document.) Tj ET",
    "BT /F1 20 Tf 60 720 Td (Methods and assumptions) Tj /F1 12 Tf 0 -42 Td (DPM and NOx are preserved as engineering terms.) Tj 0 -24 Td (Highlight anchors belong to their original page.) Tj 0 -24 Td (The original PDF bytes remain unchanged.) Tj ET"
  ];
  objects[3] = `<< /Length ${Buffer.byteLength(lines[0])} >>\nstream\n${lines[0]}\nendstream`;
  objects[5] = `<< /Length ${Buffer.byteLength(lines[1])} >>\nstream\n${lines[1]}\nendstream`;
  let content = "%PDF-1.7\n"; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(content)); content += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  content += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(content);
}
