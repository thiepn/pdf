import { sha256 } from "../core/checksum";
import { APP_VERSION } from "../core/release";
import { readSettings } from "../settings/settingsStore";
import { idbDelete, idbGetAll, idbPut } from "../storage/database";
import { classifyReceipt, type ActivityReceipt } from "./activityModel";

const MAX_RECEIPTS = 300;

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function recordDownloadReceipt(blob: Blob, filename: string, route = window.location.hash): Promise<ActivityReceipt | undefined> {
  if (!readSettings().recordActivity) return undefined;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const receipt: ActivityReceipt = {
    id: createId(),
    schemaVersion: 1,
    kind: classifyReceipt(filename, blob.type),
    filename: filename.slice(0, 240),
    mimeType: blob.type || "application/octet-stream",
    byteLength: bytes.byteLength,
    sha256: await sha256(bytes),
    createdAt: Date.now(),
    route: route.slice(0, 300),
    releaseVersion: APP_VERSION
  };
  await idbPut("activityReceipts", receipt);
  const receipts = await listActivityReceipts();
  await Promise.all(receipts.slice(MAX_RECEIPTS).map((item) => idbDelete("activityReceipts", item.id)));
  return receipt;
}

export async function listActivityReceipts(): Promise<ActivityReceipt[]> {
  return (await idbGetAll<ActivityReceipt>("activityReceipts"))
    .filter((item) => item?.schemaVersion === 1 && typeof item.sha256 === "string")
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function clearActivityReceipts(): Promise<void> {
  const receipts = await listActivityReceipts();
  await Promise.all(receipts.map((item) => idbDelete("activityReceipts", item.id)));
}
