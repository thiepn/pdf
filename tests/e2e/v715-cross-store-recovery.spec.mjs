import { test, expect } from "@playwright/test";
import mupdf from "mupdf";

const MARKER = "DURABLE_CROSS_STORE_SOURCE";
function recoveryPdf() {
  const pdf = new mupdf.PDFDocument();
  const font = new mupdf.Font("Helvetica");
  try {
    const resource = pdf.addSimpleFont(font);
    pdf.insertPage(-1, pdf.addPage([0, 0, 420, 594], 0, { Font: { F1: resource } },
      "BT /F1 15 Tf 35 440 Td (" + MARKER + ") Tj ET"));
    const saved = pdf.saveToBuffer({});
    try { return Buffer.from(saved.asUint8Array()); }
    finally { saved.destroy(); }
  } finally {
    font.destroy();
    pdf.destroy();
  }
}

async function state(page, projectId) {
  return page.evaluate(async id => {
    const request = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const get = (store, key) => new Promise((resolve, reject) => {
      const request = db.transaction(store, "readonly").objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    let manifest, backup;
    try {
      [manifest, backup] = await Promise.all([get("projects", id), get("sourceFiles", id)]);
    } finally { db.close(); }
    let opfsExists = false;
    try {
      const root = await navigator.storage.getDirectory();
      const projects = await root.getDirectoryHandle("projects");
      const directory = await projects.getDirectoryHandle(id);
      await directory.getFileHandle("original.pdf");
      opfsExists = true;
    } catch (reason) {
      if (reason?.name !== "NotFoundError") throw reason;
    }
    let stagedChecksum;
    if (backup?.bytes) {
      const hash = await crypto.subtle.digest("SHA-256", backup.bytes);
      stagedChecksum = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    }
    return {
      manifestId: manifest?.id ?? null,
      storageKind: manifest?.storageKind ?? null,
      checksum: manifest?.checksum ?? null,
      stagedChecksum: stagedChecksum ?? null,
      opfsExists
    };
  }, projectId);
}

test("actual OPFS original stays recoverable through quota refusal, failed IndexedDB commit and reload", async ({ page }) => {
  test.setTimeout(135_000);
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles({
    name: "cross-store-source.pdf", mimeType: "application/pdf", buffer: recoveryPdf()
  });
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer(?:\/.*)?$/, { timeout: 30000 });
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  const originalUrl = page.url();
  const projectId = originalUrl.match(/#\/workspace\/([^/]+)\//)?.[1];
  expect(projectId).toBeTruthy();
  const hasOpfs = await page.evaluate(() => typeof navigator.storage?.getDirectory === "function");
  test.skip(!hasOpfs, "This browser does not expose OPFS; IndexedDB-only projects use the atomic source/manifest path.");
  const initial = await state(page, projectId);
  test.skip(initial.storageKind !== "opfs", "This engine stores originals in IndexedDB, so OPFS crash staging does not apply.");
  expect(initial.opfsExists).toBe(true);

  await page.goto("./#/projects");
  page.on("dialog", dialog => dialog.accept());
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.__restoreStagePut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (this.name === "sourceFiles") {
        window.__sourceStageRefused = true;
        throw new DOMException("Synthetic quota refusing durable staging", "QuotaExceededError");
      }
      return original.call(this, value, ...args);
    };
  });
  await page.locator(".project-card").getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__sourceStageRefused))).toBe(true);
  await page.evaluate(() => window.__restoreStagePut());
  const afterQuota = await state(page, projectId);
  expect(afterQuota).toMatchObject({
    manifestId: projectId,
    storageKind: "opfs",
    stagedChecksum: null,
    opfsExists: true
  });

  // Allow full source staging/OPFS removal, but deny the final atomic IDB
  // transaction. The remaining manifest must have a verified sourceFiles copy.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    window.__restoreDeleteTransaction = () => { IDBDatabase.prototype.transaction = original; };
    IDBDatabase.prototype.transaction = function(stores, mode, ...args) {
      if (mode === "readwrite" && Array.isArray(stores)
        && stores.includes("projects") && stores.includes("sourceFiles")) {
        window.__projectCommitRefused = true;
        throw new DOMException("Synthetic project/source transaction rejection", "QuotaExceededError");
      }
      return original.call(this, stores, mode, ...args);
    };
  });
  await page.locator(".project-card").getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__projectCommitRefused))).toBe(true);
  await page.evaluate(() => window.__restoreDeleteTransaction());
  const afterCommitFailure = await state(page, projectId);
  expect(afterCommitFailure).toMatchObject({
    manifestId: projectId,
    storageKind: "opfs",
    stagedChecksum: initial.checksum,
    opfsExists: false
  });

  // Reload discards session caches. The original is still reopenable from the
  // validated staged bytes and the same project identity and PDF text survive.
  await page.reload();
  await page.goto(originalUrl);
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  const recovered = await state(page, projectId);
  expect(recovered.stagedChecksum).toBe(initial.checksum);

  // After storage recovers, the same user-requested delete can finally commit
  // both IndexedDB source and manifest in one transaction.
  await page.goto("./#/projects");
  await page.locator(".project-card").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0, { timeout: 30000 });
  expect(await state(page, projectId)).toMatchObject({
    manifestId: null, stagedChecksum: null, opfsExists: false
  });
});
