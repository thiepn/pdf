export interface PdfByteValidation {
  valid: boolean;
  byteLength: number;
  hasHeader: boolean;
  hasEofMarker: boolean;
  errors: string[];
}

const decoder = new TextDecoder("latin1");

export function validatePdfBytes(bytes: Uint8Array): PdfByteValidation {
  const errors: string[] = [];
  const head = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  const tail = decoder.decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  const hasHeader = /^%PDF-\d\.\d/.test(head);
  const hasEofMarker = /%%EOF\s*$/.test(tail.trimEnd());

  if (bytes.length === 0) errors.push("The file is empty.");
  if (!hasHeader) errors.push("A PDF header was not found near the beginning of the file.");
  if (!hasEofMarker) errors.push("A terminal %%EOF marker was not found.");

  return {
    valid: errors.length === 0,
    byteLength: bytes.length,
    hasHeader,
    hasEofMarker,
    errors
  };
}
