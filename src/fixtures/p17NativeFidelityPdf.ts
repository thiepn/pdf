function padOffset(value: number): string { return String(value).padStart(10, "0"); }

function streamObject(number: number, dictionary: string, stream: string): string {
  const length = new TextEncoder().encode(stream).length;
  return `${number} 0 obj\n<< ${dictionary}${dictionary ? " " : ""}/Length ${length} >>\nstream\n${stream}endstream\nendobj\n`;
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function text(x: number, y: number, size: number, value: string): string {
  return `BT /F1 ${size} Tf 0.10 0.13 0.18 rg ${x} ${y} Td (${escapePdfString(value)}) Tj ET`;
}

function strokedRect(x: number, y: number, width: number, height: number): string {
  return `q 0.32 0.36 0.42 RG 0.8 w [] 0 d ${x} ${y} ${width} ${height} re S Q`;
}

/**
 * Deterministic P17 source fixture.
 *
 * It deliberately combines:
 * - one RGB image with an attached /SMask, invoked twice from the same resource;
 * - one clipped plain image instance;
 * - one non-Normal-blend plain image instance;
 * - a non-uniform 3x3 table with one rectangular merged cell;
 * - two separated text columns suitable for bounded flow detection.
 *
 * No generated binary is committed: browser/unit qualification builds these bytes
 * from source so fixture provenance is reviewable.
 */
export function createP17NativeFidelityPdf(): Uint8Array {
  const pageContent = [
    text(54, 724, 10, "Left region opening paragraph with enough width for flow."),
    text(54, 604, 10, "Left region second paragraph remains independently movable."),
    text(330, 724, 10, "Right region opening paragraph forms the adjacent target."),
    text(330, 604, 10, "Right region second paragraph preserves bounded ordering."),

    text(390, 536, 8, "SOFT MASK / SHARED RESOURCE"),
    "q 70 0 0 50 390 474 cm /ImSoft Do Q",
    "q 70 0 0 50 478 474 cm /ImSoft Do Q",

    text(390, 445, 8, "CLIPPED SOURCE"),
    "q 400 360 52 58 re W n 82 0 0 70 386 350 cm /ImPlain Do Q",

    text(480, 445, 8, "BLENDED SOURCE"),
    "q /GSBlend gs 70 0 0 55 480 362 cm /ImPlain Do Q",

    text(54, 244, 9, "IRREGULAR / MERGED TABLE"),
    // Top row (30 pt): first two columns merged.
    strokedRect(54, 190, 220, 30),
    strokedRect(274, 190, 80, 30),
    // Middle row (50 pt).
    strokedRect(54, 140, 80, 50),
    strokedRect(134, 140, 140, 50),
    strokedRect(274, 140, 80, 50),
    // Bottom row (20 pt).
    strokedRect(54, 120, 80, 20),
    strokedRect(134, 120, 140, 20),
    strokedRect(274, 120, 80, 20),

    text(64, 202, 8, "Merged heading"),
    text(284, 202, 8, "Status"),
    text(64, 161, 8, "A"),
    text(144, 161, 8, "Wide middle"),
    text(284, 161, 8, "Ready"),
    text(64, 127, 7, "B"),
    text(144, 127, 7, "Long column"),
    text(284, 127, 7, "Review"),
    ""
  ].join("\n");

  // Four RGB pixels repeated to a 4x4 image.
  const rgbHex = [
    "244A8FE8EEF9339B7AEEF0F4",
    "E8EEF9339B7AEEF0F4244A8F",
    "339B7AEEF0F4244A8FE8EEF9",
    "EEF0F4244A8FE8EEF9339B7A"
  ].join("") + ">\n";

  // 4x4 grayscale alpha ramp used as an attached /SMask.
  const maskHex = [
    "20306080",
    "406080A0",
    "6080A0C0",
    "80A0C0FF"
  ].join("") + ">\n";

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /ImSoft 6 0 R /ImPlain 8 0 R >> /ExtGState << /GSBlend 9 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    streamObject(4, "", pageContent),
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    streamObject(6, "/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /SMask 7 0 R", rgbHex),
    streamObject(7, "/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode", maskHex),
    streamObject(8, "/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode", rgbHex),
    "9 0 obj\n<< /Type /ExtGState /BM /Multiply /ca 0.82 /CA 0.82 >>\nendobj\n"
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
