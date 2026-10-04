import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/taskFirst";

async function seedCompletedOcr(page: import("@playwright/test").Page, projectId: string): Promise<void> {
  await page.evaluate(async ({ projectId }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("local-pdf-studio", 13);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const now = Date.now();
      const preprocess = { grayscale: true, contrast: 1, brightness: 0, threshold: null, invert: false, scale: 2 };
      const recipe = JSON.stringify({
        engine: "tesseract-7/render-v2",
        pageNumbers: [1],
        languages: ["eng"],
        preprocess
      });
      let a = 0x811c9dc5;
      let b = 0x9e3779b9;
      for (let index = 0; index < recipe.length; index += 1) {
        const code = recipe.charCodeAt(index);
        a ^= code; a = Math.imul(a, 0x01000193) >>> 0;
        b ^= code + index; b = Math.imul(b, 0x85ebca6b) >>> 0;
      }
      const recipeFingerprint = `tesseract-7/render-v2:${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(["ocrJobs", "ocrPages"], "readwrite");
        transaction.objectStore("ocrJobs").put({
          schemaVersion: 2,
          id: "p3-ocr-browser-job",
          kind: "pdf",
          projectId,
          name: "P3 browser OCR",
          languages: ["eng"],
          pageNumbers: [1],
          preprocess,
          recipeFingerprint,
          status: "complete",
          completedPages: 1,
          totalPages: 1,
          createdAt: now,
          updatedAt: now
        });
        transaction.objectStore("ocrPages").put({
          id: "p3-ocr-browser-job:1",
          jobId: "p3-ocr-browser-job",
          projectId,
          pageNumber: 1,
          status: "complete",
          text: "MAY REVIEW",
          confidence: 66,
          words: [
            { text: "MAY", confidence: 52, bbox: { x0: 90, y0: 90, x1: 190, y1: 135 } },
            { text: "REVIEW", confidence: 93, bbox: { x0: 205, y0: 90, x1: 390, y1: 135 } }
          ],
          width: 1000,
          height: 1400,
          updatedAt: now
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, { projectId });
}

test("P3 reviews saved OCR, corrects confidence evidence, preserves the PDF and continues into Edit", async ({ page }) => {
  await openSample(page, "viewer");
  const match = page.url().match(/\/workspace\/([^/]+)\/viewer/);
  if (!match) throw new Error("Imported project id is unavailable.");
  const projectId = decodeURIComponent(match[1]);
  await seedCompletedOcr(page, projectId);

  await page.goto(`./#/workspace/${encodeURIComponent(projectId)}/ocr`);
  const workspace = page.locator(".ocr-workspace");
  await expect(workspace).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Loaded reusable OCR results. Review or rebuild the searchable layer.")).toBeVisible();

  const lowConfidence = page.getByRole("button", { name: /MAY · 52% confidence/ });
  await expect(lowConfidence).toBeVisible();
  await lowConfidence.click();

  const correction = page.getByLabel("Correct recognized word");
  await expect(correction).toHaveValue("MAY");
  await correction.fill("JUNE");
  await page.getByRole("button", { name: "Save correction", exact: true }).click();
  await expect(page.getByText(/OCR correction saved/)).toBeVisible();
  await expect(page.getByText("Original OCR: MAY", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Build searchable PDF", exact: true }).click();
  await expect(page.getByText("Source-preserving searchable PDF checked and ready", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/original pages retained/)).toBeVisible();

  await page.getByRole("button", { name: "Continue in Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+\/editor$/);
  await expect(page.locator(".editor-app")).toBeVisible({ timeout: 20_000 });
});
