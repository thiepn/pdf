import type { SignatureByteRangeInfo } from "../types/compliance";

const latin1 = new TextDecoder("iso-8859-1");

function nearbyValue(text: string, start: number, key: string): string {
  const slice = text.slice(Math.max(0, start - 1500), Math.min(text.length, start + 2500));
  const nameMatch = slice.match(new RegExp(`/${key}\\s*/([^\\s<>\\[\\]()]+)`));
  if (nameMatch) return nameMatch[1] ?? "";
  const stringMatch = slice.match(new RegExp(`/${key}\\s*\\(([^)]*)\\)`));
  return stringMatch?.[1]?.replace(/\\([()\\])/g, "$1") ?? "";
}

export function analyzeSignatureByteRanges(bytes: Uint8Array): SignatureByteRangeInfo[] {
  const text = latin1.decode(bytes);
  const expression = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const results: SignatureByteRangeInfo[] = [];
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text))) {
    const range = match.slice(1, 5).map(Number) as [number, number, number, number];
    const [a, b, c, d] = range;
    const valid = [a, b, c, d].every(Number.isSafeInteger) && a === 0 && b >= 0 && c >= b && d >= 0 && c + d <= bytes.byteLength;
    const coveredBytes = valid ? b + d : 0;
    const signatureGapBytes = valid ? Math.max(0, c - (a + b)) : 0;
    const unsignedTailBytes = valid ? Math.max(0, bytes.byteLength - (c + d)) : bytes.byteLength;
    results.push({
      byteRange: range,
      status: !valid ? "invalid-range" : unsignedTailBytes === 0 ? "covers-current-file" : "covers-prior-revision",
      coveredBytes,
      unsignedTailBytes,
      signatureGapBytes,
      filter: nearbyValue(text, match.index, "Filter"),
      subFilter: nearbyValue(text, match.index, "SubFilter"),
      signingTime: nearbyValue(text, match.index, "M"),
      reason: nearbyValue(text, match.index, "Reason"),
      location: nearbyValue(text, match.index, "Location")
    });
  }
  return results;
}

export function signatureCoverageLabel(info: SignatureByteRangeInfo): string {
  if (info.status === "invalid-range") return "Invalid ByteRange";
  if (info.status === "covers-current-file") return "Covers current file bytes";
  if (info.status === "covers-prior-revision") return `Covers a prior revision; ${info.unsignedTailBytes} later bytes remain outside the signature`;
  if (info.status === "unsigned") return "Unsigned signature field";
  return "Signature object detected without a parseable ByteRange";
}
