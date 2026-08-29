import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test("release-qualified home, validation, recovery, reconstructed workspace, editor, task workflows, tools, sample project, and diagnostics load", async ({ page }: { page: Page }) => {
  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: /What do you want to do with your PDF\?/i })).toBeVisible();

  await page.goto("./#/release");
  await expect(page.getByRole("heading", { name: /PDF Studio 7.0.0/i })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: /Choose what you want to do/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Merge PDFs/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Scan to PDF/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Batch automation/i })).toBeVisible();

  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page.getByRole("heading", { name: "pdf-studio-welcome", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "PDF page 1" })).toContainText(/PDF Studio.*Generated validation fixture/s);
  const navigation = page.getByRole("navigation", { name: "Document workspace" });
  await navigation.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: /Text/ }).first()).toBeVisible();
  await expect(page.locator(".editor-contextbar > strong")).toHaveText(/Local changes (waiting to save|saved)|Saving local changes…|No pending editor changes/);

  await navigation.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByRole("heading", { name: /What do you want to do\?/i })).toBeVisible();
  await page.getByRole("link", { name: /OCR PDF/i }).click();
  await expect(page).toHaveURL(/\/ocr\/ocr-pdf$/);
  await expect(page.getByRole("combobox", { name: /Recognition quality/i })).toBeVisible();

  await page.getByRole("navigation", { name: "Document workspace" }).getByRole("button", { name: "Tools", exact: true }).click();
  const fillForms = page.getByRole("button", { name: /Fill PDF forms/i });
  await expect(fillForms).toBeDisabled();
  await expect(fillForms).toContainText(/Not available for this PDF/i);
  await page.getByRole("link", { name: /Sanitize PDF/i }).click();
  await expect(page).toHaveURL(/\/secure\/sanitize-pdf$/);
  await expect(page.locator(".security-app")).toBeVisible();
  await expect(page.getByText(/security-critical changes create a new output/i)).toBeVisible();

  await page.goto("./#/diagnostics/system");
  await expect(page.getByRole("heading", { name: /PDF Studio 7.0.0/i })).toBeVisible();

  await page.goto("./#/diagnostics/viewer");
  await expect(page.getByRole("heading", { name: "PDF.js viewer baseline", exact: true })).toBeVisible();
});
