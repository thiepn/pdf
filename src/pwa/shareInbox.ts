import { SHARE_INBOX_CACHE, SHARE_INBOX_V2_CACHE } from "../release/cacheNames";

export interface SharedInboxFile {
  id: string;
  file: File;
}

const CONSUMED_KEY = `${SHARE_INBOX_V2_CACHE}-consumed-v1`;
function consumedKey(cacheName: string): string {
  return cacheName === SHARE_INBOX_V2_CACHE ? CONSUMED_KEY : `${cacheName}-consumed-v1`;
}
function inboxCacheForId(id: string): string {
  const name = new URL(id).pathname.split("/").at(-1) ?? "";
  return /^(?:launch-v3|share-v2)-[A-Za-z0-9-]+-\d+$/.test(name) ? SHARE_INBOX_V2_CACHE : SHARE_INBOX_CACHE;
}
// Launch-v2 entries have a durable Cache Storage commit marker written only
// after every file has been stored. Missing markers quarantine incomplete
// batches even when localStorage and physical Cache deletion both fail.
const activeLaunchBatches = new Set<string>();

// A small same-cache receipt is a fallback when the browser refuses writes to
// localStorage. It cannot be confused with a PDF, and avoids rewriting any
// original file bytes just to acknowledge a completed import.
function acknowledgementMarkerUrl(id: string): string {
  return new URL(`./__share_inbox__/ack-v1-${encodeURIComponent(id)}`, document.baseURI).toString();
}
function acknowledgedIdFromMarkerUrl(url: string): string | undefined {
  const parsed = new URL(url);
  if (!parsed.pathname.includes("/__share_inbox__/")) return undefined;
  const segment = parsed.pathname.split("/").at(-1) ?? "";
  if (!segment.startsWith("ack-v1-")) return undefined;
  try { return decodeURIComponent(segment.slice("ack-v1-".length)); }
  catch { return undefined; }
}
function committedBatchUrl(stamp: string): string {
  return new URL(`./__share_inbox__/${stamp}--committed`, document.baseURI).toString();
}
function launchBatchFromFileUrl(url: string): string | undefined {
  const name = new URL(url).pathname.split("/").at(-1) ?? "";
  return /^((?:launch-v2|launch-v3|share-v2)-[A-Za-z0-9-]+)-\d+$/.exec(name)?.[1];
}
function committedStampFromUrl(url: string): string | undefined {
  const name = new URL(url).pathname.split("/").at(-1) ?? "";
  return /^((?:launch-v2|launch-v3|share-v2)-[A-Za-z0-9-]+)--committed$/.exec(name)?.[1];
}


function readConsumedIds(cacheName = SHARE_INBOX_V2_CACHE): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(consumedKey(cacheName)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch { return new Set(); }
}

function writeConsumedIds(ids: Iterable<string>, cacheName = SHARE_INBOX_V2_CACHE): boolean {
  try {
    const values = [...new Set(ids)];
    if (values.length) localStorage.setItem(consumedKey(cacheName), JSON.stringify(values));
    else localStorage.removeItem(consumedKey(cacheName));
    return true;
  } catch { return false; }
}

function rememberConsumedIds(ids: Iterable<string>, cacheName = SHARE_INBOX_V2_CACHE): boolean {
  return writeConsumedIds([...readConsumedIds(cacheName), ...ids], cacheName);
}

function forgetConsumedIds(ids: Iterable<string>, cacheName = SHARE_INBOX_V2_CACHE): void {
  const remove = new Set(ids);
  if (!remove.size) return;
  writeConsumedIds([...readConsumedIds(cacheName)].filter((value) => !remove.has(value)), cacheName);
}

function retainActiveConsumedIds(consumed: Set<string>, activeIds: Set<string>, cacheName: string): Set<string> {
  const retained = new Set([...consumed].filter((id) => activeIds.has(id)));
  if (retained.size !== consumed.size) writeConsumedIds(retained, cacheName);
  return retained;
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
 * Web Share Target. Failed batches are never exposed to consumers: if a write
 * fails and physical rollback is blocked, consumed tombstones hide any
 * residual Cache Storage entries until a subsequent cleanup can delete them.
 */
export async function storeSharedInboxFiles(files: File[]): Promise<string[]> {
  if (!("caches" in window)) throw new Error("Local shared-file inbox storage is unavailable in this browser.");
  if (!files.length) return [];
  const cache = await caches.open(SHARE_INBOX_V2_CACHE);
  const stamp = `launch-v3-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  activeLaunchBatches.add(stamp);
  const inserted: string[] = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const key = inboxRequestUrl(stamp, index);
      // Cache.put can reject after partially storing an entry. Track attempted
      // keys before the call so all possible residual bytes are quarantined.
      inserted.push(key);
      await cache.put(key, new Response(file, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Local-Pdf-Studio-Filename": encodeURIComponent(file.name || `opened-${index + 1}.pdf`)
        }
      }));
    }
    // A committed marker is written only when the entire file batch is complete.
    await cache.put(committedBatchUrl(stamp), new Response("committed"));
    return inserted;
  } catch (reason) {
    // Mark the whole uncommitted batch consumed *before* asynchronous cleanup.
    // A false/throw from Cache.delete must not expose partial failed imports.
    rememberConsumedIds(inserted);
    const removed = await Promise.all(inserted.map(async (key) => {
      try { return await cache.delete(key) ? key : undefined; }
      catch { return undefined; }
    }));
    forgetConsumedIds(removed.filter((key): key is string => Boolean(key)));
    throw reason;
  } finally {
    activeLaunchBatches.delete(stamp);
  }
}

async function listInboxCache(cacheName: string): Promise<SharedInboxFile[]> {
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  const receiptMarkers = requests.flatMap((request) => {
    const target = acknowledgedIdFromMarkerUrl(request.url);
    return target ? [{ target, request }] : [];
  });
  const consumedReceipts = new Set(receiptMarkers.map(({ target }) => target));
  const markers = requests.flatMap((request) => {
    const stamp = committedStampFromUrl(request.url);
    return stamp ? [{ stamp, request }] : [];
  });
  const committed = new Set(markers.map(({ stamp }) => stamp));
  const activeIds = new Set(requests.map((request) => request.url));
  const consumed = retainActiveConsumedIds(readConsumedIds(cacheName), activeIds, cacheName);
  const physicallyRemoved: string[] = [];
  const output: SharedInboxFile[] = [];
  for (const request of requests) {
    if (acknowledgedIdFromMarkerUrl(request.url)) continue; // Receipt metadata, not a PDF.
    if (committedStampFromUrl(request.url)) continue; // Metadata is not a shared file.
    const stamp = launchBatchFromFileUrl(request.url);
    if (stamp && !committed.has(stamp)) {
      // A failed or interrupted launch without a commit is not importable.
      // Do not interfere with a write still active in this tab.
      if (!activeLaunchBatches.has(stamp)) {
        try { if (await cache.delete(request)) physicallyRemoved.push(request.url); }
        catch { /* Missing commit marker keeps the residual entry hidden. */ }
      }
      continue;
    }
    if (consumed.has(request.url) || consumedReceipts.has(request.url)) {
      // A prior import committed successfully but Cache Storage cleanup failed.
      // Keep its tombstone for as long as the cached bytes remain, regardless of
      // how many later documents are consumed, and retry physical deletion.
      try { if (await cache.delete(request)) physicallyRemoved.push(request.url); } catch { /* Keep tombstone for a later retry. */ }
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
  if (physicallyRemoved.length) forgetConsumedIds(physicallyRemoved, cacheName);
  if (markers.length || receiptMarkers.length) {
    const remaining = await cache.keys();
    const remainingIds = new Set(remaining.map((request) => request.url));
    for (const { target, request } of receiptMarkers) {
      if (remainingIds.has(target)) continue; // Keep receipt while source still exists.
      try { await cache.delete(request); } catch { /* Retry marker cleanup later. */ }
    }
    const liveBatches = new Set(remaining.map((request) => launchBatchFromFileUrl(request.url)).filter(Boolean));
    for (const { stamp, request } of markers) {
      if (activeLaunchBatches.has(stamp) || liveBatches.has(stamp)) continue;
      try { await cache.delete(request); } catch { /* Retry small marker cleanup later. */ }
    }
  }
  return output;
}

export async function listSharedInboxFiles(): Promise<SharedInboxFile[]> {
  if (!("caches" in window)) return [];
  // Read existing v1 files without copying them. A legacy client cannot
  // access any new metadata in the independently named v2 cache.
  const legacy = await listInboxCache(SHARE_INBOX_CACHE);
  const fresh = await listInboxCache(SHARE_INBOX_V2_CACHE);
  return [...new Map([...legacy, ...fresh].map(item => [item.id, item])).values()];
}

export async function removeSharedInboxFiles(ids: string[]): Promise<void> {
  if (!("caches" in window) || !ids.length) return;
  for (const cacheName of [SHARE_INBOX_CACHE, SHARE_INBOX_V2_CACHE]) {
    const owned = ids.filter(id => inboxCacheForId(id) === cacheName);
    if (!owned.length) continue;
    const cache = await caches.open(cacheName);
    await Promise.all(owned.map(id => cache.delete(id)));
  }
}

/** Marks imported or deliberately discarded inbox items consumed before
 * best-effort deletion, preventing cleanup failure from causing a duplicate
 * import or repeated unsupported-file handling after reload. */
async function acknowledgeInboxCache(ids: string[], cacheName: string): Promise<void> {
  const tombstonePersisted = rememberConsumedIds(ids, cacheName);
  if (!("caches" in window)) {
    if (!tombstonePersisted) throw new Error("Shared-file acknowledgement could not be stored. The imported project was kept.");
    return;
  }
  const cache = await caches.open(cacheName);
  const durableReceipts = new Set<string>();
  if (!tombstonePersisted) {
    // Keep a small durable acknowledgement next to the already cached original
    // BEFORE attempting deletion. This is only needed when localStorage fails.
    for (const id of ids) {
      try {
        await cache.put(acknowledgementMarkerUrl(id), new Response("acknowledged"));
        durableReceipts.add(id);
      } catch { /* Physical deletion may still succeed; assess below. */ }
    }
  }
  const physicallyRemoved: string[] = [];
  for (const id of ids) {
    try { if (await cache.delete(id)) physicallyRemoved.push(id); }
    catch { /* A durable tombstone or receipt keeps the item logically consumed. */ }
  }
  if (physicallyRemoved.length) forgetConsumedIds(physicallyRemoved);
  for (const id of physicallyRemoved) {
    if (!durableReceipts.has(id)) continue;
    try { await cache.delete(acknowledgementMarkerUrl(id)); }
    catch { /* Orphan receipts are retired during a subsequent inbox scan. */ }
  }
  if (!tombstonePersisted && ids.some((id) => !durableReceipts.has(id) && !physicallyRemoved.includes(id))) {
    // Never claim that a completed import was durably acknowledged when every
    // available persistent acknowledgement and physical cleanup also failed.
    throw new Error("Shared-file acknowledgement could not be saved or cleaned up. The imported project remains available.");
  }
}

/** Source URL version selects the cache; legacy v1 entries stay in v1. */
export async function acknowledgeSharedInboxFiles(ids: string[]): Promise<void> {
  if (!ids.length) return;
  for (const cacheName of [SHARE_INBOX_CACHE, SHARE_INBOX_V2_CACHE]) {
    const owned = ids.filter(id => inboxCacheForId(id) === cacheName);
    if (owned.length) await acknowledgeInboxCache(owned, cacheName);
  }
}
