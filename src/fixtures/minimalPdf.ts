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
    "0.2 0.2 0.2 RG",
    "0.8 w",
    "[] 0 d",
    "72 386 96 28 re S",
    "168 386 96 28 re S",
    "264 386 96 28 re S",
    "72 358 96 28 re S",
    "168 358 96 28 re S",
    "264 358 96 28 re S",
    "72 330 96 28 re S",
    "168 330 96 28 re S",
    "264 330 96 28 re S",
    "Q",
    "BT /F1 10 Tf 78 397 Td (Name) Tj ET",
    "BT /F1 10 Tf 174 397 Td (Qty) Tj ET",
    "BT /F1 10 Tf 270 397 Td (Price) Tj ET",
    "BT /F1 10 Tf 78 369 Td (Paper) Tj ET",
    "BT /F1 10 Tf 174 369 Td (4) Tj ET",
    "BT /F1 10 Tf 270 369 Td (12) Tj ET",
    "BT /F1 10 Tf 78 341 Td (Ink) Tj ET",
    "BT /F1 10 Tf 174 341 Td (2) Tj ET",
    "BT /F1 10 Tf 270 341 Td (18) Tj ET",
    "q",
    "80 0 0 50 430 665 cm",
    "/Im1 Do",
    "Q",
    // P7 fixture: two independent placements of one shared Form XObject. The
    // Form itself contains text, vector artwork and an image, so P7 can prove
    // that an instance is transformed/deleted without flattening nested content
    // or changing the second use of the same reusable object.
    "q",
    "1 0 0 1 330 470 cm",
    "/Fm1 Do",
    "Q",
    "q",
    "0.65 0 0 0.65 390 190 cm",
    "/Fm1 Do",
    "Q",
    ""
  ].join("\n");
  const imageHex = "FF000000FF000000FFFFFF00>\n";
  const formContent = [
    "q",
    "0.97 0.93 0.82 rg",
    "0.45 0.28 0.08 RG",
    "1.5 w",
    "0 0 180 80 re B",
    "Q",
    "BT",
    "/F1 14 Tf",
    "12 52 Td",
    "(Nested PDF group) Tj",
    "0 -23 Td",
    "/F1 9 Tf",
    "(Text + vector + image) Tj",
    "ET",
    "q",
    "24 0 0 24 142 44 cm",
    "/Im1 Do",
    "Q",
    ""
  ].join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R /Fm1 7 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    streamObject(4, "", content),
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    streamObject(6, "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode", imageHex),
    streamObject(7, "/Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 180 80] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >>", formContent)
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
