export interface JpegPdfPage {
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  pageWidth?: number;
  pageHeight?: number;
}

function ascii(value: string): Uint8Array { return new TextEncoder().encode(value); }
function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

export function buildJpegPdf(pages: JpegPdfPage[], metadata?: { title?: string; author?: string }): Uint8Array {
  if (!pages.length) throw new Error("At least one image page is required.");
  const chunks: Uint8Array[] = [];
  let byteOffset = 0;
  const offsets: number[] = [0];
  const push = (chunk: Uint8Array) => { chunks.push(chunk); byteOffset += chunk.byteLength; };
  const pushAscii = (text: string) => push(ascii(text));
  push(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x37,0x0a,0x25,0xe2,0xe3,0xcf,0xd3,0x0a]));

  const pageObjectNumbers: number[] = [];
  const imageObjectNumbers: number[] = [];
  const contentObjectNumbers: number[] = [];
  let nextObject = 3;
  for (let index = 0; index < pages.length; index += 1) {
    pageObjectNumbers.push(nextObject++);
    imageObjectNumbers.push(nextObject++);
    contentObjectNumbers.push(nextObject++);
  }
  const infoObject = nextObject++;
  const objectCount = nextObject - 1;

  function beginObject(number: number) { offsets[number] = byteOffset; pushAscii(`${number} 0 obj\n`); }
  function endObject() { pushAscii("endobj\n"); }

  beginObject(1); pushAscii("<< /Type /Catalog /Pages 2 0 R >>\n"); endObject();
  beginObject(2); pushAscii(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] >>\n`); endObject();

  pages.forEach((page, index) => {
    const width = page.pageWidth ?? page.pixelWidth * 72 / 96;
    const height = page.pageHeight ?? page.pixelHeight * 72 / 96;
    const pageNumber = pageObjectNumbers[index];
    const imageNumber = imageObjectNumbers[index];
    const contentNumber = contentObjectNumbers[index];
    beginObject(pageNumber);
    pushAscii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width.toFixed(3)} ${height.toFixed(3)}] /Resources << /XObject << /Im${index + 1} ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>\n`);
    endObject();

    beginObject(imageNumber);
    pushAscii(`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.byteLength} >>\nstream\n`);
    push(page.jpeg); pushAscii("\nendstream\n"); endObject();

    const content = ascii(`q\n${width.toFixed(3)} 0 0 ${height.toFixed(3)} 0 0 cm\n/Im${index + 1} Do\nQ\n`);
    beginObject(contentNumber); pushAscii(`<< /Length ${content.byteLength} >>\nstream\n`); push(content); pushAscii("endstream\n"); endObject();
  });

  const escape = (value: string) => value.replace(/([\\()])/g, "\\$1");
  beginObject(infoObject);
  pushAscii(`<< /Producer (PDF Studio)${metadata?.title ? ` /Title (${escape(metadata.title)})` : ""}${metadata?.author ? ` /Author (${escape(metadata.author)})` : ""} /CreationDate (D:${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0,14)}Z) >>\n`);
  endObject();

  const xrefOffset = byteOffset;
  pushAscii(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let number = 1; number <= objectCount; number += 1) pushAscii(`${String(offsets[number] ?? 0).padStart(10, "0")} 00000 n \n`);
  pushAscii(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R /Info ${infoObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return concat(chunks);
}

export async function imageBlobToJpegPage(blob: Blob, quality = 0.82): Promise<JpegPdfPage> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas image conversion is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const jpegBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("JPEG encoding failed.")), "image/jpeg", quality));
    return { jpeg: new Uint8Array(await jpegBlob.arrayBuffer()), pixelWidth: bitmap.width, pixelHeight: bitmap.height };
  } finally { bitmap.close(); }
}
