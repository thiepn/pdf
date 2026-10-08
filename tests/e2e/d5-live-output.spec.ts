import { expect, test } from "@playwright/test";
import { createShowcasePdf } from "../../src/fixtures/showcasePdf";
import { readFile } from "node:fs/promises";
import mupdf from "mupdf";

test.setTimeout(90_000);
const fixture = () => (globalThis as any).Buffer.from(createShowcasePdf());

test("D5 actual quick workflow advances from selected input to verified PDF download", async ({ page }, info) => {
  await page.goto("./#/quick/extract-pages");
  const app = page.locator('.quick-workflow[data-d5-quick="true"]');
  await expect(app).toBeVisible();
  const steps = app.getByRole("list", { name: "Quick tool progress" });
  await expect(steps.locator('li[aria-current="step"]')).toContainText("Choose files");
  await page.getByLabel("PDF files", { exact: true }).setInputFiles({ name: "real.pdf", mimeType: "application/pdf", buffer: fixture() });
  await expect(steps.locator('li[aria-current="step"]')).toContainText("Set options");
  await expect(app.getByRole("region", { name: "Document preview and selection" })).toBeVisible();
  await app.getByRole("textbox", { name: "Pages", exact: true }).fill("1");
  await app.getByRole("button", { name: "Extract selected pages", exact: true }).click();
  await expect(app.getByRole("region", { name: "Your files are ready" })).toBeVisible({ timeout: 30_000 });
  await expect(steps.locator('li[aria-current="step"]')).toContainText("Download result");
  await page.screenshot({ path: info.outputPath("d5-actual-pdf-result.png"), animations: "disabled" });
  const incoming = page.waitForEvent("download");
  await app.getByRole("button", { name: "Download PDF", exact: true }).click();
  const result = await incoming;
  const bytes = await readFile(await result.path());
  expect(bytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  const document = mupdf.Document.openDocument(bytes, "application/pdf");
  try { expect(document.countPages()).toBe(1); }
  finally { document.destroy(); }
});

test("D5 phone workbench preserves file ordering controls and fits viewport", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/quick/merge-pdfs");
  const app = page.locator('.quick-workflow[data-d5-quick="true"]');
  await expect(app).toBeVisible();
  const bytes = fixture();
  await page.getByLabel("PDF files", { exact: true }).setInputFiles([
    { name: "first.pdf", mimeType: "application/pdf", buffer: bytes },
    { name: "second.pdf", mimeType: "application/pdf", buffer: bytes }
  ]);
  await expect(app.locator(".task-file-card")).toHaveCount(2);
  await app.getByRole("button", { name: "Move second.pdf up" }).click();
  await expect(app.locator(".task-file-card").first()).toContainText("second.pdf");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("d5-live-quick-phone.png"), animations: "disabled" });
});
