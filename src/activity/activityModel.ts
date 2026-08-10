export type ActivityReceiptKind = "download" | "report" | "backup" | "document-output" | "other";

export interface ActivityReceipt {
  id: string;
  schemaVersion: 1;
  kind: ActivityReceiptKind;
  filename: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  createdAt: number;
  route: string;
  releaseVersion: string;
}

export function classifyReceipt(filename: string, mimeType: string): ActivityReceiptKind {
  if (/\.lpsproject$/i.test(filename)) return "backup";
  if (/\.pdf$/i.test(filename) || mimeType === "application/pdf") return "document-output";
  if (/\.(?:json|csv|txt)$/i.test(filename) || /(?:json|csv|text)/i.test(mimeType)) return "report";
  return "other";
}

export function receiptToCsvRow(receipt: ActivityReceipt): string {
  const cells = [new Date(receipt.createdAt).toISOString(), receipt.kind, receipt.filename, receipt.mimeType, receipt.byteLength, receipt.sha256, receipt.route, receipt.releaseVersion];
  return cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",");
}
