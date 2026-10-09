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
  await expect(page.getByRole("heading", { name: /Compare PDFs/i })).toBeVisible();
  const inputs = page.locator('.compare-inputs input[type="file"]');
  const fixture = "tests/corpus/phase28/dense-text-01.pdf";
  await inputs.nth(0).setInputFiles(fixture);
  await expect(page.locator(".compare-inputs .file-slot").nth(0)).toContainText("dense-text-01.pdf");
  await inputs.nth(1).setInputFiles(fixture);
  await expect(page.getByLabel("Mode")).toBeVisible();
  await expect(page.getByLabel("Mode").locator('option[value="visual"]')).toHaveText("Page appearance");
  await expect(page.getByLabel("Mode").locator('option[value="text"]')).toHaveText("Text changes");
});

test("Phase 26 Batch 3.0 exposes terminal multi-output steps", async ({ page }) => {
  await page.goto("./#/batch");
  await expect(page.getByRole("heading", { name: "Visual workflow composer" })).toBeVisible();
  const composer=page.getByLabel("Visual workflow composer");
  await composer.getByRole("button", {name:"Split to ZIP",exact:true}).click();
  await expect(composer.getByRole("article",{name:/Step 2: Split to ZIP/})).toBeVisible();
  await expect(composer.locator(".f6-sequence-end")).toContainText("ZIP");
  await composer.getByRole("button", {name:"Export page images",exact:true}).click();
  await expect(composer.getByRole("article",{name:/Step 2: Export page images/})).toBeVisible();
  await expect(composer.getByRole("article",{name:/Split to ZIP/})).toHaveCount(0);
  await expect(composer.locator(".f6-sequence-end")).toContainText("ZIP");
});
