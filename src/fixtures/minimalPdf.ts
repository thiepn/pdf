function padOffset(value: number): string {
  return String(value).padStart(10, "0");
}

function streamObject(number: number, dictionary: string, stream: string): string {
  const length = new TextEncoder().encode(stream).length;
  return `${number} 0 obj\n<< ${dictionary}${dictionary ? " " : ""}/Length ${length} >>\nstream\n${stream}endstream\nendobj\n`;
}

export function createMinimalPdf(): Uint8Array {
  const content = [
    "BT",
    "/F1 24 Tf",
    "72 700 Td",
    "(PDF Studio) Tj",
    "0 -40 Td",
    "/F1 12 Tf",
    "(Generated validation fixture - searchable text.) Tj",
    "ET",
    "q",
    "0.94 0.96 1 rg",
    "0.12 0.32 0.72 RG",
    "2.5 w",
    "1 J",
    "1 j",
    "[6 3] 1 d",
    "110 530 m",
    "150 570 210 570 250 530 c",
    "250 490 l",
    "110 490 l",
    "h",
    "B",
    "Q",
    "q",
    "80 0 0 50 430 665 cm",
    "/Im1 Do",
    "Q",
    ""
  ].join("\n");
  const imageHex = "FF000000FF000000FFFFFF00>\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    streamObject(4, "", content),
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    streamObject(6, "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode", imageHex)
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
  for (const offset of offsets.slice(1)) body += `${padOffset(offset)} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}
