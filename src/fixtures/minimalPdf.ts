function padOffset(value: number): string {
  return String(value).padStart(10, "0");
}

export function createMinimalPdf(): Uint8Array {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    "4 0 obj\n<< /Length 105 >>\nstream\nBT\n/F1 24 Tf\n72 700 Td\n(PDF Studio) Tj\n0 -40 Td\n/F1 12 Tf\n(Generated validation fixture - searchable text.) Tj\nET\nendstream\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
  ];

  let body = "%PDF-1.7\n%âãÏÓ\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(new TextEncoder().encode(body).length);
    body += object;
  }

  const xrefOffset = new TextEncoder().encode(body).length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${padOffset(offset)} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}
