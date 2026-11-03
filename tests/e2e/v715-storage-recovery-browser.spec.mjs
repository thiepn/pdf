import { test, expect } from "@playwright/test";
import mupdf from "mupdf";

function documentPdf() {
  const pdf = new mupdf.PDFDocument();
  try {
    pdf.insertPage(-1, pdf.addPage([0, 0, 300, 400], 0, {}, "0.7 g 30 160 90 60 re f"));
    const saved = pdf.saveToBuffer({});
    try { return Buffer.from(saved.asUint8Array()); }
    finally { saved.destroy(); }
  } finally { pdf.destroy(); }
}

async function projectCount(page) {
  return page.evaluate(async () => {
    const open = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
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

test("real browser share inbox retains consumed tombstones across failed Cache Storage deletion and reload", async ({ page }) => {
  test.setTimeout(100_000);
  await page.goto("./#/projects");
  const bytes = Array.from(documentPdf());
  const storage = await page.evaluate(async pdfBytes => {
    const namespace = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const cacheName = `local-pdf-studio-${namespace}-share-inbox-v1`;
    const request = new URL("./__share_inbox__/e2e-failed-cleanup", document.baseURI).toString();
    const cache = await caches.open(cacheName);
    await cache.put(request, new Response(new Uint8Array(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "X-Local-Pdf-Studio-Filename": encodeURIComponent("shared-recovery.pdf") }
    }));
    const original = Cache.prototype.delete;
    window.__restoreE2eCacheDelete = () => { Cache.prototype.delete = original; };
    Cache.prototype.delete = async function(target, ...options) {
      const key = target instanceof Request ? target.url : String(target);
      if (key === request) return false; // Simulate a real Cache.delete false result.
      return original.call(this, target, ...options);
    };
    return { cacheName, request, tombstone: `${cacheName}-consumed-v1` };
  }, bytes);
  await page.goto("./#/home");
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/editor(?:\/.*)?$/, { timeout: 30_000 });
  await expect.poll(() => projectCount(page)).toBe(1);
  await expect.poll(() => page.evaluate(async ({ cacheName, request, tombstone }) => {
    const cache = await caches.open(cacheName);
    return { stillCached: Boolean(await cache.match(request)), consumed: JSON.parse(localStorage.getItem(tombstone) || "[]").includes(request) };
  }, storage)).toEqual({ stillCached: true, consumed: true });

  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: /Less work.*More done/i })).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);
  await expect.poll(() => projectCount(page)).toBe(1);
  const blocked = await page.evaluate(async ({ cacheName, request, tombstone }) => {
    const cache = await caches.open(cacheName);
    return { stillCached: Boolean(await cache.match(request)), consumed: JSON.parse(localStorage.getItem(tombstone) || "[]").includes(request) };
  }, storage);
  expect(blocked).toEqual({ stillCached: true, consumed: true });

  await page.evaluate(() => window.__restoreE2eCacheDelete());
  await page.reload();
  await expect(page.getByRole("heading", { name: /Less work.*More done/i })).toBeVisible();
  await expect.poll(() => page.evaluate(async ({ cacheName, request, tombstone }) => {
    const cache = await caches.open(cacheName);
    return { stillCached: Boolean(await cache.match(request)), consumed: Boolean(localStorage.getItem(tombstone)) };
  }, storage)).toEqual({ stillCached: false, consumed: false });
  expect(await projectCount(page)).toBe(1);
});

test("real Cache Storage OCR migration preserves recorded pack bytes before legacy retirement", async ({ page }) => {
  test.setTimeout(100_000);
  await page.goto("./#/home");
  const seed = await page.evaluate(async () => {
    const legacy = "local-pdf-studio-ocr-languages-v1";
    const namespace = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const current = `local-pdf-studio-${namespace}-ocr-languages-v1`;
    const open = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const records = ["eng", "deu"].map((code, index) =>
      ({ code, label: code === "eng" ? "English" : "German", byteLength: 2048, source: "import", installedAt: index + 1 }));
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("ocrLanguages", "readwrite");
        for (const record of records) tx.objectStore("ocrLanguages").put(record);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
    const cache = await caches.open(legacy);
    for (const code of ["eng", "deu"]) {
      const url = new URL(`ocr-languages/${code}.traineddata.gz`, document.baseURI).toString();
      await cache.put(url, new Response(new Uint8Array(2048).fill(code === "eng" ? 37 : 71), { headers: { "Content-Type": "application/gzip" } }));
    }
    return { legacy, current, englishUrl: new URL("ocr-languages/eng.traineddata.gz", document.baseURI).toString(), germanUrl: new URL("ocr-languages/deu.traineddata.gz", document.baseURI).toString() };
  });
  // Trigger the app's own language manager via the public OCR workspace:
  // clicking Remove German first migrates all recorded packs and then removes
  // only German. English must survive migration byte-for-byte in the new cache.
  await page.goto("./#/tools/ocr-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles({ name: "ocr-migration.pdf", mimeType: "application/pdf", buffer: documentPdf() });
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/ocr(?:\/.*)?$/, { timeout: 30_000 });
  const panel = page.locator(".ocr-language-panel");
  await expect(panel.getByText("2 installed")).toBeVisible({ timeout: 30_000 });
  await panel.locator(".ocr-language-card").filter({ hasText: "German" }).getByRole("button", { name: "Remove" }).click();
  await expect(panel.getByText("1 installed")).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(async ({ legacy, current, englishUrl, germanUrl }) => {
    const oldExists = await caches.has(legacy);
    const next = await caches.open(current);
    const english = await next.match(englishUrl);
    const german = await next.match(germanUrl);
    const data = english ? new Uint8Array(await english.arrayBuffer()) : null;
    const open = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    let codes;
    try {
      codes = await new Promise((resolve, reject) => {
        const req = db.transaction("ocrLanguages", "readonly").objectStore("ocrLanguages").getAll();
        req.onsuccess = () => resolve(req.result.map(item => item.code).sort());
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
    return { oldExists, dataSize: data?.length || 0, allEnglishBytesIntact: Boolean(data && data.every(x => x === 37)), germanInNewCache: Boolean(german), codes };
  }, seed);
  expect(result).toEqual({ oldExists: false, dataSize: 2048, allEnglishBytesIntact: true, germanInNewCache: false, codes: ["eng"] });
});
