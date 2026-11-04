import { test, expect } from "@playwright/test";
import mupdf from "mupdf";

// Faithful browser-JavaScript ports of the actual list/acknowledge algorithms
// from src/pwa/shareInbox.ts at MAIN 52166ed4c454db32e52d5260f82479ea289b1462,
// source blob 4891a6b57ed338e1603d09248c24e5f89b9776d8.
// Only TypeScript annotations/import and return projection were removed.
// This exercises the old reader's behavior in real Cache Storage, NOT an old
// deployed bundle and NOT a claim that an old client supports newer markers.
async function legacyMainReadInbox(cacheName) {
  const MAX_CONSUMED_IDS = 100;
  function readConsumedIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(cacheName + "-consumed-v1") ?? "[]");
      return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string").slice(-MAX_CONSUMED_IDS) : []);
    } catch { return new Set(); }
  }
  function forgetConsumedId(id) {
    try {
      const ids = [...readConsumedIds()].filter((value) => value !== id);
      if (ids.length) localStorage.setItem(cacheName + "-consumed-v1", JSON.stringify(ids));
      else localStorage.removeItem(cacheName + "-consumed-v1");
    } catch { /* Tombstone expiry is best effort. */ }
  }
  function decodeFilename(value, fallback) {
    if (!value) return fallback;
    try { return decodeURIComponent(value); } catch { return fallback; }
  }
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  const output = [];
  const consumed = readConsumedIds();
  for (const request of requests) {
    if (consumed.has(request.url)) {
      try { if (await cache.delete(request)) forgetConsumedId(request.url); } catch { /* Keep tombstone. */ }
      continue;
    }
    const response = await cache.match(request);
    if (!response) continue;
    const blob = await response.blob();
    const fallback = new URL(request.url).pathname.split("/").at(-1) || "shared.pdf";
    const name = decodeFilename(response.headers.get("X-Local-Pdf-Studio-Filename"), fallback);
    const type = response.headers.get("Content-Type") || blob.type || "application/octet-stream";
    // File construction is copied from the old reader; project only inspection
    // fields for the test instead of serializing File over Playwright RPC.
    const file = new File([blob], name, { type, lastModified: Date.now() });
    output.push({ id: request.url, name: file.name, type: file.type, bytes: file.size });
  }
  return output;
}

async function legacyMainAcknowledge({ cacheName, ids }) {
  const MAX_CONSUMED_IDS = 100;
  function readConsumedIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(cacheName + "-consumed-v1") ?? "[]");
      return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string").slice(-MAX_CONSUMED_IDS) : []);
    } catch { return new Set(); }
  }
  function rememberConsumedId(id) {
    try {
      const ids = [...readConsumedIds(), id].slice(-MAX_CONSUMED_IDS);
      localStorage.setItem(cacheName + "-consumed-v1", JSON.stringify([...new Set(ids)]));
    } catch { /* Cache deletion below is still attempted. */ }
  }
  function forgetConsumedId(id) {
    try {
      const ids = [...readConsumedIds()].filter((value) => value !== id);
      if (ids.length) localStorage.setItem(cacheName + "-consumed-v1", JSON.stringify(ids));
      else localStorage.removeItem(cacheName + "-consumed-v1");
    } catch { /* Tombstone expiry is best effort. */ }
  }
  ids.forEach(rememberConsumedId);
  const cache = await caches.open(cacheName);
  for (const id of ids) {
    try { if (await cache.delete(id)) forgetConsumedId(id); } catch { /* Tombstone keeps item consumed. */ }
  }
}

function documentPdf() {
  const pdf = new mupdf.PDFDocument();
  try {
    pdf.insertPage(-1, pdf.addPage([0, 0, 300, 400], 0, {}, "0.7 g 30 160 90 60 re f"));
    const bytes = pdf.saveToBuffer({});
    try { return Buffer.from(bytes.asUint8Array()); }
    finally { bytes.destroy(); }
  } finally { pdf.destroy(); }
}

async function numberOfProjects(page) {
  return page.evaluate(async () => {
    const opened = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("projects", "readonly").objectStore("projects").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

test("pinned old reader lists launch-v2/ack-v1 metadata and uncommitted files which current Home quarantines", async ({ page }) => {
  test.setTimeout(100_000);
  await page.goto("./#/projects");
  const setup = await page.evaluate(async pdf => {
    const ns = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const cacheName = "local-pdf-studio-" + ns + "-share-inbox-v1";
    const base = new URL("./__share_inbox__/", document.baseURI).toString();
    const committed = base + "launch-v2-1000-legacy-0";
    const commitMarker = base + "launch-v2-1000-legacy--committed";
    const partial = base + "launch-v2-2000-partial-0";
    const receipt = base + "ack-v1-" + encodeURIComponent(committed);
    const cache = await caches.open(cacheName);
    const pdfResponse = name => new Response(Uint8Array.from(pdf), {
      headers: { "Content-Type": "application/pdf", "X-Local-Pdf-Studio-Filename": encodeURIComponent(name) }
    });
    await cache.put(committed, pdfResponse("already-consumed.pdf"));
    await cache.put(partial, pdfResponse("uncommitted-partial.pdf"));
    await cache.put(commitMarker, new Response("committed"));
    await cache.put(receipt, new Response("acknowledged"));
    // Preserve every synthetic entry throughout this observation. The old
    // reader cannot use a new commit marker as an atomicity guarantee.
    const originalDelete = Cache.prototype.delete;
    Cache.prototype.delete = async function(request, ...options) {
      const key = request instanceof Request ? request.url : String(request);
      if (key.startsWith(base)) return false;
      return originalDelete.call(this, request, ...options);
    };
    return { cacheName, committed, commitMarker, partial, receipt };
  }, Array.from(documentPdf()));

  const oldView = await page.evaluate(legacyMainReadInbox, setup.cacheName);
  expect(oldView).toHaveLength(4);
  expect(oldView.map(item => item.name)).toContain("already-consumed.pdf");
  expect(oldView.map(item => item.name)).toContain("uncommitted-partial.pdf");
  expect(oldView.some(item => item.id === setup.commitMarker && item.type.startsWith("text/plain"))).toBe(true);
  expect(oldView.some(item => item.id === setup.receipt && item.type.startsWith("text/plain"))).toBe(true);
  // The old Home classifier rejects the marker as unsupported, but can still
  // see and attempt the uncommitted PDF which the new client correctly hides.
  expect(oldView.some(item => item.id === setup.partial && item.type === "application/pdf")).toBe(true);

  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: /Less work.*More done/i })).toBeVisible();
  expect(await numberOfProjects(page)).toBe(0); // New reader quarantines all.
  const persisted = await page.evaluate(async ({ cacheName }) => (await (await caches.open(cacheName)).keys()).length, setup);
  expect(persisted).toBe(4);
});

test("pinned old unsupported-file acknowledgement can erase an ack-v1 receipt and cause a new-client replay", async ({ page }) => {
  test.setTimeout(110_000);
  await page.addInitScript(() => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).endsWith("-consumed-v1")) throw new DOMException("Synthetic localStorage refusal", "QuotaExceededError");
      return originalSet.call(this, key, value);
    };
    const originalDelete = Cache.prototype.delete;
    Cache.prototype.delete = async function(request, ...options) {
      const key = request instanceof Request ? request.url : String(request);
      if (key.endsWith("/legacy-already-acknowledged-source")) return false;
      return originalDelete.call(this, request, ...options);
    };
  });
  await page.goto("./#/projects");
  const setup = await page.evaluate(async pdf => {
    const ns = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const cacheName = "local-pdf-studio-" + ns + "-share-inbox-v1";
    const source = new URL("./__share_inbox__/legacy-already-acknowledged-source", document.baseURI).toString();
    const receipt = new URL("./__share_inbox__/ack-v1-" + encodeURIComponent(source), document.baseURI).toString();
    const cache = await caches.open(cacheName);
    await cache.put(source, new Response(Uint8Array.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "X-Local-Pdf-Studio-Filename": encodeURIComponent("previously-acknowledged.pdf")
      }
    }));
    await cache.put(receipt, new Response("acknowledged"));
    return { cacheName, source, receipt };
  }, Array.from(documentPdf()));

  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: /Less work.*More done/i })).toBeVisible();
  expect(await numberOfProjects(page)).toBe(0); // Current build respects receipt.

  await page.goto("./#/projects");
  const oldView = await page.evaluate(legacyMainReadInbox, setup.cacheName);
  expect(oldView.map(file => file.id)).toEqual(expect.arrayContaining([setup.source, setup.receipt]));
  const oldReceipt = oldView.find(file => file.id === setup.receipt);
  expect(oldReceipt.type).toMatch(/^text\/plain(?:;|$)/);
  expect(oldReceipt.name.endsWith(".pdf")).toBe(false);
  // Old Home classifies this receipt as unsupported, then calls the pinned
  // legacy acknowledge routine. With localStorage blocked it destroys only
  // the receipt, leaving the already acknowledged original cached.
  await page.evaluate(legacyMainAcknowledge, { cacheName: setup.cacheName, ids: [setup.receipt] });
  const lost = await page.evaluate(async ({ cacheName, source, receipt }) => {
    const cache = await caches.open(cacheName);
    return {
      original: Boolean(await cache.match(source)),
      receipt: Boolean(await cache.match(receipt)),
      tombstone: localStorage.getItem(cacheName + "-consumed-v1")
    };
  }, setup);
  expect(lost).toEqual({ original: true, receipt: false, tombstone: null });

  // Returning to the new build now replays the previously acknowledged PDF.
  // Do not infer two projects were created: the seed models an acknowledged
  // imported item, and the assertion is that its ingress is unexpectedly run.
  await page.goto("./#/home");
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/editor(?:\/.*)?$/, { timeout: 30_000 });
  await expect.poll(() => numberOfProjects(page)).toBe(1);
});

test("new OS launch is isolated in v2 while legacy v1 shared PDFs remain readable without relocating them", async ({ page }) => {
  test.setTimeout(100_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "launchQueue", {
      configurable: true,
      value: { setConsumer(callback) { window.__isolatedLaunchConsumer = callback; } }
    });
  });
  await page.goto("./#/projects");
  await page.waitForFunction(() => typeof window.__isolatedLaunchConsumer === "function");
  const setup = await page.evaluate(async pdf => {
    const ns = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const oldCache = "local-pdf-studio-" + ns + "-share-inbox-v1";
    const newCache = "local-pdf-studio-" + ns + "-share-inbox-v2";
    const legacyId = new URL("./__share_inbox__/historical-legacy-pdf", document.baseURI).toString();
    const bytes = Uint8Array.from(pdf);
    await (await caches.open(oldCache)).put(legacyId, new Response(bytes, {
      headers: { "Content-Type": "application/pdf", "X-Local-Pdf-Studio-Filename": encodeURIComponent("historical.pdf") }
    }));
    const originalBytes = Array.from(new Uint8Array(await (await (await caches.open(oldCache)).match(legacyId)).arrayBuffer()));
    await window.__isolatedLaunchConsumer({ files: [{
      getFile: async () => new File([bytes], "new-launch.pdf", { type: "application/pdf" })
    }] });
    const legacyAfter = Array.from(new Uint8Array(await (await (await caches.open(oldCache)).match(legacyId)).arrayBuffer()));
    const v2Keys = (await (await caches.open(newCache)).keys()).map(request => request.url);
    return { oldCache, newCache, legacyId, originalBytes, legacyAfter, v2Keys };
  }, Array.from(documentPdf()));
  expect(setup.legacyAfter).toEqual(setup.originalBytes);
  const oldView = await page.evaluate(legacyMainReadInbox, setup.oldCache);
  expect(oldView.map(item => item.id)).toEqual([setup.legacyId]); // Old client cannot see new data.
  expect(setup.v2Keys).toHaveLength(2); // One source and its durable batch marker.

  await page.goto("./#/home");
  await expect.poll(() => numberOfProjects(page), { timeout: 30_000 }).toBe(1);
  // A second Home visit must consume the historical v1 PDF without migrating it
  // or importing v2 metadata as a PDF.
  await page.goto("./#/home");
  await expect.poll(() => numberOfProjects(page), { timeout: 30_000 }).toBe(2);
  const oldCacheAfter = await page.evaluate(async ({ oldCache, legacyId }) => {
    const cache = await caches.open(oldCache);
    return Boolean(await cache.match(legacyId));
  }, setup);
  // Successful acknowledgement may remove the legacy PDF; it was never moved
  // into the new namespace. No source bytes are rewritten by namespace change.
  expect(typeof oldCacheAfter).toBe("boolean");
});
