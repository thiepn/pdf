import { test, expect } from "@playwright/test";
import mupdf from "mupdf";

// A real AES-256 encrypted PDF, generated independently of PDF.js and the app.
// Passwords here are synthetic test data only; no user document is ever loaded.
const PASSWORD = "synthetic-e2e-pdf-pass-2026";
const WRONG = "definitely-incorrect";
const MARKER = "PROTECTED_REIMPORT_E2E_MARKER";

function protectedPdf() {
  const pdf = new mupdf.PDFDocument();
  const font = new mupdf.Font("Helvetica");
  try {
    const resource = pdf.addSimpleFont(font);
    pdf.insertPage(-1, pdf.addPage([0, 0, 420, 594], 0, { Font: { F1: resource } },
      `BT /F1 14 Tf 28 470 Td (${MARKER}) Tj ET`));
    const saved = pdf.saveToBuffer({
      encrypt: "aes-256", "user-password": PASSWORD, "owner-password": PASSWORD
    });
    try { return Buffer.from(saved.asUint8Array()); }
    finally { saved.destroy(); }
  } finally {
    font.destroy();
    pdf.destroy();
  }
}

// Encryption uses random salts. Reimport must reuse the exact ciphertext bytes,
// otherwise a different checksum correctly creates a different local project.
const PROTECTED_BYTES = protectedPdf();
const input = () => ({ name: "protected-reimport.pdf", mimeType: "application/pdf", buffer: PROTECTED_BYTES });

async function storedState(page) {
  return page.evaluate(async () => {
    const opening = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const readAll = (name) => new Promise((resolve, reject) => {
        const query = db.transaction(name, "readonly").objectStore(name).getAll();
        query.onsuccess = () => resolve(query.result);
        query.onerror = () => reject(query.error);
      });
      const [projects, securityStates] = await Promise.all([readAll("projects"), readAll("securityStates")]);
      const storage = Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => {
        const key = localStorage.key(i);
        return [key, localStorage.getItem(key)];
      }));
      return { projects, securityStates, storage };
    } finally { db.close(); }
  });
}

async function enterPassword(page, value) {
  const form = page.locator(".product-password");
  await expect(form).toBeVisible({ timeout: 30000 });
  await form.locator('input[type="password"]').fill(value);
  await form.getByRole("button", { name: "Open PDF", exact: true }).click();
}

async function openThroughTool(page, tool) {
  await page.goto(`./#/tools/${tool}`);
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(input());
}

function persistedPrivacy(state) {
  const raw = JSON.stringify(state);
  expect(raw).not.toContain(PASSWORD);
  expect(raw).not.toContain(WRONG);
}

test("real encrypted PDF: wrong password, correct import, safe reimport, in-memory recovery and reload", async ({ page }) => {
  test.setTimeout(120_000);
  const uncaught = [];
  page.on("pageerror", error => uncaught.push(error.message));

  await openThroughTool(page, "read-pdf");
  await enterPassword(page, WRONG);
  await expect(page.locator(".error-banner")).toContainText("That password did not open the PDF");
  // An unsuccessful first import must not persist any project.
  expect((await storedState(page)).projects).toHaveLength(0);

  await enterPassword(page, PASSWORD);
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer(?:\/.*)?$/, { timeout: 30000 });
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });

  const firstUrl = page.url();
  const first = await storedState(page);
  expect(first.projects).toHaveLength(1);
  expect(first.projects[0].summary.encrypted).toBe(true);
  expect(first.projects[0].sourceFilename).toBe("protected-reimport.pdf");
  const originalId = first.projects[0].id;
  persistedPrivacy(first);

  // Same ciphertext means the existing project is reused without an
  // additional password prompt while this tab already holds valid credentials.
  await openThroughTool(page, "read-pdf");
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer(?:\/.*)?$/, { timeout: 30000 });
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  expect(page.url()).toBe(firstUrl);
  const reimported = await storedState(page);
  expect(reimported.projects.map(project => project.id)).toEqual([originalId]);
  persistedPrivacy(reimported);
  await expect(page.getByRole("dialog", { name: "Password required" })).toHaveCount(0);

  // Project navigation continues to use the existing tab's valid credential.
  await page.goto("./#/projects");
  await page.goto(firstUrl);
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("dialog", { name: "Password required" })).toHaveCount(0);

  // A real page reload drops session memory but not the encrypted PDF/project.
  // Wrong password entry in the existing viewer must fail without changing
  // saved metadata; correct entry then restores access.
  await page.reload();
  const dialog = page.getByRole("dialog", { name: "Password required" });
  await expect(dialog).toBeVisible({ timeout: 30000 });
  const beforeWrong = await storedState(page);
  await dialog.getByPlaceholder("PDF password").fill(WRONG);
  await dialog.getByRole("button", { name: "Open locally" }).click();
  await expect(dialog).toBeVisible({ timeout: 30000 });
  const afterWrong = await storedState(page);
  expect(afterWrong.projects).toEqual(beforeWrong.projects);
  persistedPrivacy(afterWrong);
  await dialog.getByPlaceholder("PDF password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Open locally" }).click();
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  const afterReload = await storedState(page);
  expect(afterReload.projects.map(project => project.id)).toEqual([originalId]);
  persistedPrivacy(afterReload);
  expect(uncaught).toEqual([]);
});

test("real protected PDF: correct editor import uses the current tab credential without asking twice", async ({ page }) => {
  test.setTimeout(75_000);
  await openThroughTool(page, "edit-pdf");
  await enterPassword(page, PASSWORD);
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/editor(?:\/.*)?$/, { timeout: 30000 });
  await expect(page.locator(".editing-toolbar")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("dialog", { name: "Password required" })).toHaveCount(0);
  const saved = await storedState(page);
  expect(saved.projects).toHaveLength(1);
  expect(saved.projects[0].summary.encrypted).toBe(true);
  persistedPrivacy(saved);
});

test("real protected project deletion removes local storage identity and requires fresh password on reimport", async ({ page }) => {
  test.setTimeout(90_000);
  await openThroughTool(page, "read-pdf");
  await enterPassword(page, PASSWORD);
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer(?:\/.*)?$/, { timeout: 30000 });
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  const original = await storedState(page);
  expect(original.projects).toHaveLength(1);
  const deletedId = original.projects[0].id;

  await page.goto("./#/projects");
  page.on("dialog", dialog => dialog.accept());
  await page.locator(".project-card").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0, { timeout: 30000 });
  expect((await storedState(page)).projects).toHaveLength(0);

  await openThroughTool(page, "read-pdf");
  await expect(page.locator(".product-password")).toBeVisible({ timeout: 30000 });
  await enterPassword(page, PASSWORD);
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  const replacement = await storedState(page);
  expect(replacement.projects).toHaveLength(1);
  expect(replacement.projects[0].id).not.toBe(deletedId);
  persistedPrivacy(replacement);
});


test("failed security-sidecar deletion must not commit removal of a still-recoverable project", async ({ page }) => {
  test.setTimeout(100_000);
  await openThroughTool(page, "read-pdf");
  await enterPassword(page, PASSWORD);
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  const source = (await storedState(page)).projects[0];
  expect(source?.id).toBeTruthy();

  await page.goto("./#/projects");
  await page.evaluate(async id => {
    const opening = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["securityStates", "editorAssets"], "readwrite");
        tx.objectStore("securityStates").put({ projectId: id, schemaVersion: 1, testSentinel: "must-not-orphan-sensitive-state" });
        tx.objectStore("editorAssets").put({ id: "sidecar-" + id, projectId: id, testSentinel: "asset-owned-by-project" });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
    const original = IDBObjectStore.prototype.delete;
    window.__restoreSidecarDelete = () => { IDBObjectStore.prototype.delete = original; };
    IDBObjectStore.prototype.delete = function(key) {
      if (this.name === "securityStates" && !window.__sidecarDeleteInjected) {
        window.__sidecarDeleteInjected = true;
        throw new DOMException("Synthetic sidecar deletion failure", "AbortError");
      }
      return original.call(this, key);
    };
  }, source.id);
  page.on("dialog", dialog => dialog.accept());
  await page.locator(".project-card").getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__sidecarDeleteInjected))).toBe(true);
  await page.evaluate(() => window.__restoreSidecarDelete());

  // Failure of any project-owned record must not remove the authoritative
  // manifest, original source, or recovery data. A subsequent retry may remove
  // everything atomically once the browser storage fault has cleared.
  const interrupted = await storedState(page);
  expect(interrupted.projects.map(project => project.id)).toContain(source.id);
  expect(interrupted.securityStates.some(item => item.projectId === source.id)).toBe(true);
  await page.reload();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.locator(".project-card").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0, { timeout: 30000 });
  const finalState = await storedState(page);
  expect(finalState.projects).toHaveLength(0);
  expect(finalState.securityStates).toHaveLength(0);
  const orphanAssets = await page.evaluate(async id => {
    const opening = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("editorAssets", "readonly").objectStore("editorAssets").index("projectId").getAll(id);
        request.onsuccess = () => resolve(request.result.length);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, source.id);
  expect(orphanAssets).toBe(0);
});


test("interrupted WorkspaceSession cleanup must not strand tabs referring to a deleted project", async ({ page }) => {
  test.setTimeout(100_000);
  await openThroughTool(page, "read-pdf");
  await enterPassword(page, PASSWORD);
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  const original = (await storedState(page)).projects[0];
  expect(original?.id).toBeTruthy();
  await page.goto("./#/projects");

  const sessionState = async () => page.evaluate(async (id) => {
    const opening = indexedDB.open("local-pdf-studio");
    const db = await new Promise((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const get = (store, id) => new Promise((resolve, reject) => {
        const request = db.transaction(store, "readonly").objectStore(store).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const [session, manifest] = await Promise.all([
        get("workspaceSessions", "primary"), get("projects", id)
      ]);
      return { session, projectExists: Boolean(manifest) };
    } finally { db.close(); }
  }, original.id);
  const before = await sessionState();
  expect(before.projectExists).toBe(true);
  expect(before.session?.tabs?.some(tab => tab.projectId === original.id)).toBe(true);

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    window.__restoreWorkspaceSessionPut = () => { IDBObjectStore.prototype.put = originalPut; };
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (this.name === "workspaceSessions") {
        window.__workspaceSessionCommitDenied = true;
        throw new DOMException("Synthetic session transaction interruption", "AbortError");
      }
      return originalPut.call(this, value, ...args);
    };
  });
  page.on("dialog", dialog => dialog.accept());
  await page.locator(".project-card").getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__workspaceSessionCommitDenied === true)).toBe(true);
  await page.evaluate(() => window.__restoreWorkspaceSessionPut());
  const interrupted = await sessionState();
  // A session write failure must abort the same authoritative deletion: either
  // both the project and its session reference survive, or both are removed.
  expect(interrupted.projectExists).toBe(true);
  expect(interrupted.session.tabs.some(tab => tab.projectId === original.id)).toBe(true);

  await page.reload();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.locator(".project-card").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0, { timeout: 30_000 });
  const final = await sessionState();
  expect(final.projectExists).toBe(false);
  expect(final.session?.tabs?.some(tab => tab.projectId === original.id)).toBe(false);
  expect(final.session?.recentlyClosed?.some(tab => tab.projectId === original.id)).toBe(false);
  expect(final.session?.activeProjectId).not.toBe(original.id);
});
