function padOffset(value: number): string { return String(value).padStart(10, "0"); }

function streamObject(number: number, dictionary: string, stream: string): string {
  const length = new TextEncoder().encode(stream).length;
  return `${number} 0 obj\n<< ${dictionary}${dictionary ? " " : ""}/Length ${length} >>\nstream\n${stream}endstream\nendobj\n`;
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function text(x: number, y: number, size: number, value: string, font = "F1", color = "0.08 0.12 0.18"): string {
  return `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${escapePdfString(value)}) Tj ET`;
}

function rect(x: number, y: number, width: number, height: number, fill: string): string {
  return `q ${fill} rg ${x} ${y} ${width} ${height} re f Q`;
}

function line(x1: number, y1: number, x2: number, y2: number, stroke = "0.78 0.82 0.86", width = 0.8): string {
  return `q ${stroke} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

/**
 * User-facing sample for Home -> Open sample.
 *
 * This is deliberately separate from minimalPdf.ts, which remains the small
 * release-validation fixture. The sample stays one page and retains searchable
 * text, a source image, a curved vector path, a structured 3x3 table, and two
 * placements of one reusable Form XObject so the editor's core existing-PDF
 * workflows remain directly explorable.
 */
export function createShowcasePdf(): Uint8Array {
  const content = [
    // Keep the opening title as one real text flow. Besides reading naturally,
    // this gives layout-aware editing a useful destination instead of a tiny
    // isolated eyebrow text box.
    "BT",
    "/F2 8 Tf",
    "0.16 0.35 0.68 rg",
    "54 742 Td",
    "(PDF STUDIO / SAMPLE PROJECT) Tj",
    "0 -31 Td",
    "/F2 12 Tf",
    "0.08 0.12 0.18 rg",
    "(PROJECT NORTHSTAR) Tj",
    "0 -39 Td",
    "/F2 34 Tf",
    "(Launch Review) Tj",
    "ET",
    text(54, 646, 12, "A fictional one-page brief for exploring PDF Studio.", "F1", "0.35 0.40 0.46"),

    // First source vector: a standalone readiness mark. It deliberately does
    // not sit behind selectable text; native PDF objects should remain
    // independently targetable in Edit mode.
    "q",
    "0.94 0.97 1 rg",
    "0.16 0.35 0.68 RG",
    "2.5 w",
    "1 J",
    "1 j",
    "[6 3] 1 d",
    "484 584 m",
    "497 618 524 632 544 612 c",
    "551 601 550 586 540 576 c",
    "519 568 497 571 484 584 c",
    "h",
    "B",
    "Q",
    text(396, 612, 8, "READINESS", "F2", "0.16 0.35 0.68"),
    text(396, 580, 26, "82%", "F2"),

    // First source image: a tiny palette swatch integrated into the brief.
    "q",
    "56 0 0 28 488 704 cm",
    "/Im1 Do",
    "Q",

    rect(54, 601, 88, 30, "0.95 0.97 1"),
    rect(150, 601, 104, 30, "0.96 0.98 0.96"),
    rect(262, 601, 104, 30, "0.98 0.96 0.92"),
    text(66, 618, 7, "WINDOW", "F2", "0.35 0.40 0.46"),
    text(66, 607, 9, "MAY - JUL", "F2"),
    text(162, 618, 7, "MODE", "F2", "0.35 0.40 0.46"),
    text(162, 607, 9, "LAUNCH", "F2"),
    text(274, 618, 7, "TEAM", "F2", "0.35 0.40 0.46"),
    text(274, 607, 9, "6 PEOPLE", "F2"),

    text(54, 536, 9, "WHAT MATTERS", "F2", "0.16 0.35 0.68"),
    text(54, 512, 16, "Make the handoff obvious.", "F2"),
    text(54, 490, 10, "Keep the message focused, the review loop short, and every", "F1", "0.35 0.40 0.46"),
    text(54, 475, 10, "deliverable easy to find when the launch window gets busy.", "F1", "0.35 0.40 0.46"),

    rect(54, 421, 88, 38, "0.96 0.98 1"),
    rect(150, 421, 88, 38, "0.96 0.98 0.96"),
    rect(246, 421, 88, 38, "0.99 0.97 0.93"),
    text(64, 444, 7, "MESSAGE", "F2", "0.35 0.40 0.46"),
    text(64, 431, 9, "One promise", "F2"),
    text(160, 444, 7, "REVIEW", "F2", "0.35 0.40 0.46"),
    text(160, 431, 9, "Two rounds", "F2"),
    text(256, 444, 7, "HANDOFF", "F2", "0.35 0.40 0.46"),
    text(256, 431, 9, "One owner", "F2"),

    // Reusable Form XObject: large instance.
    "q",
    "1 0 0 1 362 454 cm",
    "/Fm1 Do",
    "Q",

    // Structured 3 x 3 table retained for existing-table editing.
    text(54, 370, 9, "DELIVERABLES", "F2", "0.16 0.35 0.68"),
    rect(54, 325, 300, 28, "0.10 0.14 0.20"),
    "q",
    "0.32 0.36 0.40 RG",
    "0.8 w",
    "[] 0 d",
    "54 325 100 28 re S",
    "154 325 100 28 re S",
    "254 325 100 28 re S",
    "54 297 100 28 re S",
    "154 297 100 28 re S",
    "254 297 100 28 re S",
    "54 269 100 28 re S",
    "154 269 100 28 re S",
    "254 269 100 28 re S",
    "Q",
    text(62, 336, 8, "Workstream", "F2", "1 1 1"),
    text(162, 336, 8, "Owner", "F2", "1 1 1"),
    text(262, 336, 8, "Status", "F2", "1 1 1"),
    text(62, 308, 8, "Launch copy"),
    text(162, 308, 8, "Maya"),
    text(262, 308, 8, "Ready", "F2", "0.10 0.55 0.47"),
    text(62, 280, 8, "Final QA"),
    text(162, 280, 8, "Theo"),
    text(262, 280, 8, "Review", "F2", "0.85 0.50 0.16"),

    text(386, 370, 9, "WORKSTREAMS", "F2", "0.16 0.35 0.68"),
    text(386, 344, 8, "Brand system", "F1", "0.35 0.40 0.46"),
    rect(386, 332, 156, 8, "0.91 0.93 0.95"),
    rect(386, 332, 137, 8, "0.16 0.35 0.68"),
    text(526, 344, 8, "88", "F2", "0.16 0.35 0.68"),
    text(386, 310, 8, "Content", "F1", "0.35 0.40 0.46"),
    rect(386, 298, 156, 8, "0.91 0.93 0.95"),
    rect(386, 298, 112, 8, "0.10 0.55 0.47"),
    text(526, 310, 8, "72", "F2", "0.10 0.55 0.47"),
    text(386, 276, 8, "Product QA", "F1", "0.35 0.40 0.46"),
    rect(386, 264, 156, 8, "0.91 0.93 0.95"),
    rect(386, 264, 126, 8, "0.85 0.50 0.16"),
    text(526, 276, 8, "81", "F2", "0.85 0.50 0.16"),

    line(54, 220, 558, 220, "0.82 0.85 0.88"),
    text(54, 194, 9, "NEXT REVIEW", "F2", "0.16 0.35 0.68"),
    text(54, 170, 16, "Confirm the release copy, then lock the handoff.", "F2"),
    text(54, 150, 9, "This is sample content - replace it, annotate it, move pages, or export a copy.", "F1", "0.35 0.40 0.46"),

    // Same reusable Form XObject, smaller second instance.
    "q",
    "0.68 0 0 0.68 392 104 cm",
    "/Fm1 Do",
    "Q",

    // The original searchable fixture phrase stays available to regression
    // checks without dominating the user-facing document.
    text(54, 52, 6, "Generated validation fixture - searchable text.", "F1", "0.62 0.65 0.69"),
    text(456, 52, 6, "PDF Studio sample / fictional content", "F1", "0.62 0.65 0.69"),
    ""
  ].join("\n");

  const imageHex = [
    "1320332859AD198C78F7F1E7",
    "2859AD198C78F7F1E7132033",
    "198C78F7F1E71320332859AD",
    "F7F1E71320332859AD198C78"
  ].join("") + ">\n";

  const formContent = [
    "q",
    "0.97 0.95 0.90 rg",
    "0.76 0.66 0.48 RG",
    "1 w",
    "0 0 180 80 re B",
    "Q",
    text(12, 58, 10, "Review note", "F2"),
    text(12, 43, 7, "Reusable content block", "F2", "0.45 0.40 0.32"),
    text(12, 28, 8, "Text + vector + image", "F1", "0.35 0.40 0.46"),
    "q",
    "18 0 0 18 148 49 cm",
    "/Im1 Do",
    "Q",
    ""
  ].join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> /XObject << /Im1 6 0 R /Fm1 7 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    streamObject(4, "", content),
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    streamObject(6, "/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode", imageHex),
    streamObject(7, "/Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 180 80] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> /XObject << /Im1 6 0 R >> >>", formContent),
    "8 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n"
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
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
