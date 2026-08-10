import { recordDownloadReceipt } from "../activity/activityRepository";

export interface DownloadOptions { track?: boolean }

export function downloadBlob(blob: Blob, filename: string, options: DownloadOptions = {}): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  if (options.track !== false) void recordDownloadReceipt(blob, filename).catch(() => undefined);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
