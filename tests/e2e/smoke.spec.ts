import { openSample, switchMode, chooseDocumentTask } from "./helpers/taskFirst";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test("release-qualified home, validation, recovery, reconstructed workspace, editor, task workflows, tools, sample project, and diagnostics load", async ({ page }: { page: Page }) => {
  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: /Less work.*More done/i })).toBeVisible();

  await page.goto("./#/release");
  await expect(page.getByRole("heading", { name: /PDF Studio 7.1.1/i })).toBeVisible();

  await page.goto("./#/validation");
  await expect(page.getByRole("button", { name: /Run validation/i })).toBeVisible();

  await page.goto("./#/help");
  await expect(page.getByRole("heading", { name: /Find any feature without guessing/i })).toBeVisible();

  await page.goto("./#/activity");
  await expect(page.getByRole("heading", { name: /Files created by PDF Studio/i })).toBeVisible();

  await page.goto("./#/maintenance");
  await expect(page.getByRole("heading", { name: /Maintenance center|Safe mode is active/i })).toBeVisible();

  await page.goto("./#/storage");
  await expect(page.getByRole("button", { name: /Run health check/i })).toBeVisible();

  await page.goto("./#/professional/sample-project");
  await expect(page.locator("body")).toContainText(/Professional|Project not found/i);

  await page.goto("./#/tools");
  await expect(page.getByRole("heading", { name: /Find your next PDF tool/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Merge PDFs/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Scan to PDF/i })).toBeVisible();
  await page.locator(".product-advanced summary").click();
  await expect(page.getByRole("link", { name: /Batch automation/i })).toBeVisible();

  await page.goto("./#/home");
  await openSample(page);
  await expect(page.getByRole("heading", { name: "northstar-launch-review", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "PDF page 1" })).toContainText(/PDF Studio.*Generated validation fixture/s);
  await switchMode(page, "editor");
  await expect(page.getByRole("button", { name: "Add text", exact: true })).toBeVisible();
  await expect(page.locator(".editor-contextbar > strong")).toHaveText(/Changes (waiting to save|saved|not yet saved) locally|Saving changes locally…|No unsaved local changes/);
  await chooseDocumentTask(page, "OCR PDF");
  await expect(page).toHaveURL(/\/ocr\/ocr-pdf$/);
  await expect(page.getByRole("combobox", { name: /Recognition quality/i })).toBeVisible();
  await chooseDocumentTask(page, "Fill PDF forms");
  await expect(page.getByRole("link", { name: "Fill with text in the editor" })).toBeVisible({ timeout: 20_000 });
  await chooseDocumentTask(page, "Clean up PDF");
  await expect(page).toHaveURL(/\/quick\/sanitize-pdf/);
  await expect(page.getByRole("button", { name: "Clean up PDF", exact: true })).toBeVisible();

  await page.goto("./#/diagnostics/system");
  await expect(page.getByRole("heading", { name: /PDF Studio 7.1.1/i })).toBeVisible();

  await page.goto("./#/diagnostics/viewer");
  await expect(page.getByRole("heading", { name: "PDF.js viewer baseline", exact: true })).toBeVisible();
});
