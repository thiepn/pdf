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
  // Ensure the app, not this test, creates the versioned IndexedDB schema.
  // Opening the DB before its first app upgrade can produce an empty v1 DB
  // in slower WebKit workers; that is a harness race, not an OCR defect.
  await page.goto("./#/tools/ocr-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles({ name: "ocr-migration.pdf", mimeType: "application/pdf", buffer: documentPdf() });
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/ocr(?:\/.*)?$/, { timeout: 30_000 });
  const ocrRoute = page.url();
  await page.goto("./#/projects");
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
  // Trigger the app's manager from a remounted public OCR workspace:
  // Remove German migrates both recorded packs first and then removes German.
  // English must survive migration byte-for-byte in the namespaced cache.
  await page.goto(ocrRoute);
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


test("failed OS-launched batch stays quarantined after partial Cache.put and failed rollback", async ({ page }) => {
  test.setTimeout(100_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "launchQueue", {
      configurable: true,
      value: { setConsumer(callback) { window.__testFileLaunch = callback; } }
    });
  });
  await page.goto("./#/projects");
  await page.waitForFunction(() => typeof window.__testFileLaunch === "function");
  const state = await page.evaluate(async data => {
    const originalPut = Cache.prototype.put;
    const originalDelete = Cache.prototype.delete;
    let attempts = 0;
    Cache.prototype.put = async function(request, response) {
      const url = request instanceof Request ? request.url : String(request);
      if (url.includes("/__share_inbox__/")) {
        await originalPut.call(this, request, response);
        if (++attempts === 2) throw new Error("Synthetic QuotaExceededError after write");
        return;
      }
      return originalPut.call(this, request, response);
    };
    Cache.prototype.delete = async function(request, ...args) {
      const url = request instanceof Request ? request.url : String(request);
      if (url.includes("/__share_inbox__/")) return false;
      return originalDelete.call(this, request, ...args);
    };
    try {
      await window.__testFileLaunch({
        files: ["first.pdf", "second.pdf"].map(name => ({
          getFile: async () => new File([Uint8Array.from(data)], name, { type: "application/pdf" })
        }))
      });
    } finally {
      Cache.prototype.put = originalPut;
      Cache.prototype.delete = originalDelete;
    }
    const namespace = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const name = `local-pdf-studio-${namespace}-share-inbox-v1`;
    const entries = await (await caches.open(name)).keys();
    const consumed = JSON.parse(localStorage.getItem(`${name}-consumed-v1`) || "[]");
    return { cached: entries.length, quarantined: entries.every(item => consumed.includes(item.url)) };
  }, Array.from(documentPdf()));
  expect(state).toEqual({ cached: 2, quarantined: true });

  // Reload loses the in-memory launch fallback. Home must not import anything
  // from the failed batch, and later physical cleanup should retire tombstones.
  await page.reload();
  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: /Less work.*More done/i })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const namespace = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const name = `local-pdf-studio-${namespace}-share-inbox-v1`;
    return { remaining: (await (await caches.open(name)).keys()).length, tombstone: localStorage.getItem(`${name}-consumed-v1`) };
  })).toEqual({ remaining: 0, tombstone: null });
  expect(await projectCount(page)).toBe(0);
});

test("real OCR quota failure keeps legacy pack bytes and permits a later migration retry", async ({ page }) => {
  test.setTimeout(100_000);
  await page.goto("./#/tools/ocr-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles({
    name: "ocr-quota-retry.pdf", mimeType: "application/pdf", buffer: documentPdf()
  });
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/ocr(?:\/.*)?$/, { timeout: 30_000 });
  const ocrUrl = page.url();
  await page.goto("./#/projects");
  const names = await page.evaluate(async () => {
    const legacy = "local-pdf-studio-ocr-languages-v1";
    const namespace = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const current = `local-pdf-studio-${namespace}-ocr-languages-v1`;
    const opened = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("ocrLanguages", "readwrite");
        for (const [code, label] of [["eng", "English"], ["deu", "German"]]) {
          tx.objectStore("ocrLanguages").put({ code, label, byteLength: 2048, source: "import", installedAt: 1 });
        }
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
    const cache = await caches.open(legacy);
    for (const code of ["eng", "deu"]) {
      await cache.put(new URL(`ocr-languages/${code}.traineddata.gz`, document.baseURI).toString(),
        new Response(new Uint8Array(2048).fill(code === "eng" ? 37 : 71)));
    }
    return { legacy, current, english: new URL("ocr-languages/eng.traineddata.gz", document.baseURI).toString() };
  });
  await page.goto(ocrUrl);
  const panel = page.locator(".ocr-language-panel");
  await expect(panel.getByText("2 installed")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const original = Cache.prototype.put;
    let failOnce = true;
    window.__restoreQuotaTest = () => { Cache.prototype.put = original; };
    Cache.prototype.put = async function(request, response) {
      const url = request instanceof Request ? request.url : String(request);
      if (failOnce && url.includes("/ocr-languages/eng.traineddata.gz")) {
        failOnce = false;
        throw new Error("Synthetic QuotaExceededError");
      }
      return original.call(this, request, response);
    };
  });
  const german = panel.locator(".ocr-language-card").filter({ hasText: "German" }).getByRole("button", { name: "Remove" });
  await german.click();
  await expect(panel.locator(".error-banner")).toContainText("Synthetic QuotaExceededError");
  expect(await page.evaluate(name => caches.has(name), names.legacy)).toBe(true);
  await expect(panel.getByText("2 installed")).toBeVisible();

  await page.evaluate(() => window.__restoreQuotaTest());
  await german.click();
  await expect(panel.getByText("1 installed")).toBeVisible({ timeout: 30_000 });
  const outcome = await page.evaluate(async ({ legacy, current, english }) => {
    const response = await (await caches.open(current)).match(english);
    const bytes = response ? new Uint8Array(await response.arrayBuffer()) : null;
    return { legacyDeleted: !(await caches.has(legacy)), englishIntact: Boolean(bytes && bytes.length === 2048 && bytes.every(value => value === 37)) };
  }, names);
  expect(outcome).toEqual({ legacyDeleted: true, englishIntact: true });
});


test("localStorage denies tombstones during failed launch: uncommitted files remain hidden across reload", async ({ page }) => {
  test.setTimeout(100_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "launchQueue", {
      configurable: true,
      value: { setConsumer(callback) { window.__testLocalStorageLaunch = callback; } }
    });
  });
  await page.goto("./#/projects");
  await page.waitForFunction(() => typeof window.__testLocalStorageLaunch === "function");
  const snapshot = await page.evaluate(async bytes => {
    const originalPut = Cache.prototype.put;
    const originalDelete = Cache.prototype.delete;
    const originalSet = Storage.prototype.setItem;
    let writes = 0;
    Cache.prototype.put = async function(request, response) {
      const url = request instanceof Request ? request.url : String(request);
      if (url.includes("/__share_inbox__/") && !url.endsWith("--committed")) {
        await originalPut.call(this, request, response);
        if (++writes === 2) throw new Error("Synthetic partial launch quota error");
        return;
      }
      return originalPut.call(this, request, response);
    };
    Cache.prototype.delete = async function(request, ...args) {
      const url = request instanceof Request ? request.url : String(request);
      if (url.includes("/__share_inbox__/")) return false;
      return originalDelete.call(this, request, ...args);
    };
    Storage.prototype.setItem = function(key, value) {
      if (String(key).endsWith("-consumed-v1")) throw new DOMException("Synthetic tombstone storage refusal", "QuotaExceededError");
      return originalSet.call(this, key, value);
    };
    try {
      await window.__testLocalStorageLaunch({
        files: ["first.pdf", "second.pdf"].map(name => ({
          getFile: async () => new File([Uint8Array.from(bytes)], name, { type: "application/pdf" })
        }))
      });
    } finally {
      Cache.prototype.put = originalPut;
      Cache.prototype.delete = originalDelete;
      Storage.prototype.setItem = originalSet;
    }
    const namespace = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const cacheName = "local-pdf-studio-" + namespace + "-share-inbox-v1";
    const keys = await (await caches.open(cacheName)).keys();
    return {
      partialFiles: keys.filter(key => !key.url.endsWith("--committed")).length,
      committed: keys.filter(key => key.url.endsWith("--committed")).length,
      tombstone: localStorage.getItem(cacheName + "-consumed-v1")
    };
  }, Array.from(documentPdf()));
  expect(snapshot).toEqual({ partialFiles: 2, committed: 0, tombstone: null });

  // A new tab lifecycle has no pending JS launch handles, only Cache Storage.
  // Without the commit marker these bytes must never become valid imports.
  await page.reload();
  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: /Less work.*More done/i })).toBeVisible();
  expect(await projectCount(page)).toBe(0);
  await expect.poll(() => page.evaluate(async () => {
    const namespace = location.pathname.split("/").filter(Boolean).join("-") || "root";
    const cacheName = "local-pdf-studio-" + namespace + "-share-inbox-v1";
    return (await (await caches.open(cacheName)).keys()).length;
  })).toBe(0);
  expect(await projectCount(page)).toBe(0);
});
