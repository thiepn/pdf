import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test("Phase 27 release-qualified home, validation, recovery, professional workspace, editor, secure workflow, OCR, tools, sample project, and diagnostics load", async ({ page }: { page: Page }) => {
  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: /Work with PDFs without uploading them/i })).toBeVisible();

  await page.goto("./#/release");
  await expect(page.getByRole("heading", { name: /PDF Studio 6.1.0/i })).toBeVisible();

  await page.goto("./#/validation");
  await expect(page.getByRole("button", { name: /Run validation/i })).toBeVisible();

  await page.goto("./#/help");
  await expect(page.getByRole("heading", { name: /Use the right workflow/i })).toBeVisible();

  await page.goto("./#/activity");
  await expect(page.getByRole("heading", { name: /Output activity receipts/i })).toBeVisible();

  await page.goto("./#/maintenance");
  await expect(page.getByRole("heading", { name: /Maintenance center|Safe mode is active/i })).toBeVisible();

  await page.goto("./#/storage");
  await expect(page.getByRole("button", { name: /Run health check/i })).toBeVisible();

  await page.goto("./#/professional/sample-project");
  await expect(page.locator("body")).toContainText(/Professional|Project not found/i);

  await page.goto("./#/tools");
  await expect(page.getByRole("heading", { name: /PDF editing, OCR, optimization/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Merge PDFs/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Scan to PDF/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Batch processor/i })).toBeVisible();

  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page.getByText("pdf-studio-welcome", { exact: true })).toBeVisible();
  await expect(page.getByText(/PDF Studio Generated validation fixture/)).toBeVisible();
  const viewerUrl = page.url();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: /Text/ })).toBeVisible();
  await expect(page.getByText(/Local edits autosaved|No pending editor changes/)).toBeVisible();
  await page.goto(viewerUrl);
  await expect(page.getByRole("button", { name: "OCR" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compress" })).toBeVisible();
  await page.getByRole("button", { name: "Forms & secure" }).click();
  await expect(page.getByText(/Security inspector|Inspecting PDF security/)).toBeVisible();

  await page.goto("./#/diagnostics/system");
  await expect(page.getByRole("heading", { name: /PDF Studio 6.1.0/i })).toBeVisible();

  await page.goto("./#/diagnostics/viewer");
  await expect(page.getByRole("heading", { name: "PDF.js viewer", exact: true })).toBeVisible();
});
