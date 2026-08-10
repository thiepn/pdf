import { SHARE_INBOX_CACHE } from "../release/cacheNames";

export interface SharedInboxFile {
  id: string;
  file: File;
}

const CONSUMED_KEY = `${SHARE_INBOX_CACHE}-consumed-v1`;
const MAX_CONSUMED_IDS = 100;

function readConsumedIds(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONSUMED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(-MAX_CONSUMED_IDS) : []);
  } catch { return new Set(); }
}

function rememberConsumedId(id: string): void {
  try {
    const ids = [...readConsumedIds(), id].slice(-MAX_CONSUMED_IDS);
    localStorage.setItem(CONSUMED_KEY, JSON.stringify([...new Set(ids)]));
  } catch { /* Cache deletion below is still attempted. */ }
}

function forgetConsumedId(id: string): void {
  try {
    const ids = [...readConsumedIds()].filter((value) => value !== id);
    if (ids.length) localStorage.setItem(CONSUMED_KEY, JSON.stringify(ids)); else localStorage.removeItem(CONSUMED_KEY);
  } catch { /* Tombstone expiry is best effort. */ }
}


function decodeFilename(value: string | null, fallback: string): string {
  if (!value) return fallback;
  try { return decodeURIComponent(value); } catch { return fallback; }
}

function inboxRequestUrl(stamp: string, index: number): string {
  return new URL(`./__share_inbox__/${stamp}-${index}`, document.baseURI).toString();
}

/**
 * Stores browser-launched files in the same durable local inbox used by the
 * Web Share Target. The batch is atomic: if one Cache Storage write fails,
 * every entry inserted by this call is rolled back.
 */
export async function storeSharedInboxFiles(files: File[]): Promise<string[]> {
  if (!("caches" in window)) throw new Error("Local shared-file inbox storage is unavailable in this browser.");
  if (!files.length) return [];
  const cache = await caches.open(SHARE_INBOX_CACHE);
  const stamp = `launch-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const inserted: string[] = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const key = inboxRequestUrl(stamp, index);
      await cache.put(key, new Response(file, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Local-Pdf-Studio-Filename": encodeURIComponent(file.name || `opened-${index + 1}.pdf`)
        }
      }));
      inserted.push(key);
    }
    return inserted;
  } catch (reason) {
    await Promise.allSettled(inserted.map((key) => cache.delete(key)));
    throw reason;
  }
}

export async function listSharedInboxFiles(): Promise<SharedInboxFile[]> {
  if (!("caches" in window)) return [];
  const cache = await caches.open(SHARE_INBOX_CACHE);
  const requests = await cache.keys();
  const output: SharedInboxFile[] = [];
  const consumed = readConsumedIds();
  for (const request of requests) {
    if (consumed.has(request.url)) {
      // A prior import committed successfully but Cache Storage cleanup failed.
      // Retry deletion without ever re-importing the already-consumed document.
      try { if (await cache.delete(request)) forgetConsumedId(request.url); } catch { /* Keep tombstone for a later retry. */ }
      continue;
    }
    const response = await cache.match(request);
    if (!response) continue;
    const blob = await response.blob();
    const fallback = new URL(request.url).pathname.split("/").at(-1) || "shared.pdf";
    const name = decodeFilename(response.headers.get("X-Local-Pdf-Studio-Filename"), fallback);
    const type = response.headers.get("Content-Type") || blob.type || "application/octet-stream";
    output.push({ id: request.url, file: new File([blob], name, { type, lastModified: Date.now() }) });
  }
  return output;
}

export async function removeSharedInboxFiles(ids: string[]): Promise<void> {
  if (!("caches" in window) || !ids.length) return;
  const cache = await caches.open(SHARE_INBOX_CACHE);
  await Promise.all(ids.map((id) => cache.delete(id)));
}

/** Marks imported inbox items consumed before best-effort deletion, preventing a
 * cleanup failure from causing a duplicate import after reload. */
export async function acknowledgeSharedInboxFiles(ids: string[]): Promise<void> {
  if (!ids.length) return;
  ids.forEach(rememberConsumedId);
  if (!("caches" in window)) return;
  const cache = await caches.open(SHARE_INBOX_CACHE);
  for (const id of ids) {
    try { if (await cache.delete(id)) forgetConsumedId(id); } catch { /* Tombstone keeps the item logically consumed. */ }
  }
}
