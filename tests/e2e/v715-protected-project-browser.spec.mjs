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

  // A same-checksum, wrong-password attempt must neither change the existing
  // manifest nor replace the credential that opened the original PDF.
  await openThroughTool(page, "read-pdf");
  const beforeWrong = await storedState(page);
  await enterPassword(page, WRONG);
  await expect(page.locator(".error-banner")).toContainText("That password did not open the PDF");
  const afterWrong = await storedState(page);
  expect(afterWrong.projects).toEqual(beforeWrong.projects);
  persistedPrivacy(afterWrong);

  // Leaving the failed import should still allow the previously opened
  // protected project to open without a new password in the same tab.
  await page.goto(firstUrl);
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("dialog", { name: "Password required" })).toHaveCount(0);

  await openThroughTool(page, "read-pdf");
  await enterPassword(page, PASSWORD);
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer(?:\/.*)?$/, { timeout: 30000 });
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible({ timeout: 30000 });
  expect(page.url()).toBe(firstUrl);
  const reimported = await storedState(page);
  expect(reimported.projects.map(project => project.id)).toEqual([originalId]);
  persistedPrivacy(reimported);

  // Credentials must not survive a full page reload; the original bytes and
  // project must, and manual password entry should restore access.
  await page.reload();
  const dialog = page.getByRole("dialog", { name: "Password required" });
  await expect(dialog).toBeVisible({ timeout: 30000 });
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
