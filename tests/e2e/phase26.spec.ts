import { expect, test } from "@playwright/test";

test("Phase 26 creator previews rich inline Markdown", async ({ page }) => {
  await page.goto("./#/create");
  await page.getByLabel("Document source").fill("# Rich PDF\n\nText with **bold**, *italic*, `code`, and [OpenAI](https://openai.com).");
  const preview=page.locator(".creator-preview-content");
  await expect(preview.getByText("bold",{exact:true})).toBeVisible();
  await expect(preview.locator("strong")).toContainText("bold");
  await expect(preview.locator("em")).toContainText("italic");
  await expect(preview.locator("code")).toContainText("code");
  await expect(preview.getByRole("link",{name:"OpenAI"})).toHaveAttribute("href","https://openai.com");
});

test("Phase 26 exposes hybrid Compare 3.0", async ({ page }) => {
  await page.goto("./#/compare");
  await expect(page.getByRole("heading", { name: /Compare text PDFs and scanned documents page by page/i })).toBeVisible();
  await expect(page.getByLabel("Mode").locator('option[value="visual"]')).toHaveText("Visual pixels");
  await expect(page.getByLabel("Mode").locator('option[value="text"]')).toHaveText("Extracted text");
});

test("Phase 26 Batch 3.0 exposes terminal multi-output steps", async ({ page }) => {
  await page.goto("./#/batch");
  await expect(page.getByRole("heading", { name: /Apply the same saved actions to multiple PDFs/i })).toBeVisible();
  const select=page.locator(".batch-step-add select");
  await expect(select.locator('option[value="split-fixed"]')).toHaveText("Split into PDF parts");
  await expect(select.locator('option[value="page-images"]')).toHaveText("Export page images");
});
