export interface ExternalPdfSignerRequest {
  schemaVersion: 1;
  documentSha256: string;
  fieldName: string;
  reason: string;
  location: string;
  requestedProfile: "PAdES-B-B" | "PAdES-B-T";
}

export interface ExternalPdfSignerResult {
  schemaVersion: 1;
  signedPdf: Uint8Array;
  signerDescription: string;
}

export interface ExternalPdfSignerBridge {
  id: string;
  label: string;
  sign(request: ExternalPdfSignerRequest, pdfBytes: Uint8Array): Promise<ExternalPdfSignerResult>;
}

export function validateSignerResult(result: ExternalPdfSignerResult): void {
  if (result.schemaVersion !== 1) throw new Error("Unsupported signer bridge response version.");
  if (!(result.signedPdf instanceof Uint8Array) || result.signedPdf.byteLength < 8) throw new Error("Signer bridge did not return a PDF payload.");
  const header = new TextDecoder("ascii").decode(result.signedPdf.slice(0, 8));
  if (!header.includes("%PDF-")) throw new Error("Signer bridge output is not a PDF document.");
}
