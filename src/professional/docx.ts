import { extractPageText, openPdfWithPdfJs } from "../engines/pdfjs";

const encoder = new TextEncoder();
function u16(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
function u32(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }
function concat(chunks: Uint8Array[]): Uint8Array { const output = new Uint8Array(chunks.reduce((sum, value) => sum + value.length, 0)); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } return output; }
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function xml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

interface ZipEntry { name: string; bytes: Uint8Array; crc: number; offset: number }
export function storeZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const entries: ZipEntry[] = [], local: Uint8Array[] = []; let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), bytes = encoder.encode(file.content), crc = crc32(bytes);
    const header = concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(bytes.length),u32(bytes.length),u16(name.length),u16(0),name,bytes]);
    entries.push({ name: file.name, bytes, crc, offset }); local.push(header); offset += header.length;
  }
  const central: Uint8Array[] = [];
  for (const entry of entries) { const name = encoder.encode(entry.name); central.push(concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(entry.crc),u32(entry.bytes.length),u32(entry.bytes.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(entry.offset),name])); }
  const centralBytes = concat(central), localBytes = concat(local), end = concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralBytes.length),u32(localBytes.length),u16(0)]);
  return concat([localBytes,centralBytes,end]);
}

export function buildSimpleDocx(title: string, paragraphs: string[]): Uint8Array {
  const body = paragraphs.map(value => `<w:p>${value ? `<w:r><w:t xml:space="preserve">${xml(value)}</w:t></w:r>` : ""}</w:p>`).join("");
  const now = new Date().toISOString();
  return storeZip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "word/document.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xml(title)}</w:t></w:r></w:p>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>` },
    { name: "word/_rels/document.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>` },
    { name: "docProps/core.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>PDF Studio</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: "docProps/app.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PDF Studio</Application></Properties>` }
  ]);
}

export async function buildTextDocx(bytes: Uint8Array, title: string, password?: string, signal?: AbortSignal, onProgress?: (completed: number, total: number) => void): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const document = await openPdfWithPdfJs(bytes, password); const paragraphs: string[] = [];
  try {
    for (let page = 1; page <= document.numPages; page += 1) { if (signal?.aborted) throw new DOMException("DOCX export cancelled.", "AbortError"); const text = await extractPageText(document, page); paragraphs.push(`Page ${page}`, ...text.split(/(?<=[.!?])\s+/).filter(Boolean), ""); onProgress?.(page, document.numPages); }
    return { pageCount: document.numPages, bytes: buildSimpleDocx(title, paragraphs) };
  } finally { await document.loadingTask.destroy(); }
}
