import type { PdfAProfile } from "../types/compliance";

export interface PdfAIdentity { part: "1" | "2" | "3"; conformance: "B" }

export function pdfaIdentity(profile: PdfAProfile): PdfAIdentity | null {
  if (profile === "PDF/A-1b") return { part: "1", conformance: "B" };
  if (profile === "PDF/A-2b") return { part: "2", conformance: "B" };
  if (profile === "PDF/A-3b") return { part: "3", conformance: "B" };
  return null;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildPdfAXmp(profile: PdfAProfile, title: string, language: string, now = new Date()): string {
  const identity = pdfaIdentity(profile);
  if (!identity) throw new Error("A PDF/A profile is required to build archival XMP.");
  const iso = now.toISOString();
  const safeTitle = escapeXml(title || "Untitled PDF");
  const safeLanguage = escapeXml(language || "x-default");
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" pdfaid:part="${identity.part}" pdfaid:conformance="${identity.conformance}" xmp:ModifyDate="${iso}" xmp:MetadataDate="${iso}" pdf:Producer="PDF Studio">\n<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${safeTitle}</rdf:li></rdf:Alt></dc:title>\n<dc:language><rdf:Bag><rdf:li>${safeLanguage}</rdf:li></rdf:Bag></dc:language>\n</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`;
}

export function parsePdfAClaim(xmp: string): { claimed: boolean; part: string; conformance: string; profile: string } {
  const part = xmp.match(/pdfaid:part=["']([^"']+)["']/i)?.[1] ?? xmp.match(/<pdfaid:part>([^<]+)<\/pdfaid:part>/i)?.[1] ?? "";
  const conformance = xmp.match(/pdfaid:conformance=["']([^"']+)["']/i)?.[1] ?? xmp.match(/<pdfaid:conformance>([^<]+)<\/pdfaid:conformance>/i)?.[1] ?? "";
  return { claimed: Boolean(part && conformance), part, conformance, profile: part && conformance ? `PDF/A-${part}${conformance.toLowerCase()}` : "" };
}
