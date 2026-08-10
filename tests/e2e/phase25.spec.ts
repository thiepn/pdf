import { expect, test } from "@playwright/test";

test("Phase 25 Create PDF Studio produces a local PDF", async ({ page }) => {
  await page.goto("./#/create");
  await expect(page.getByRole("heading", { name: /Create polished PDFs directly in the browser/i })).toBeVisible();
  const source = page.getByLabel("Document source");
  await source.fill("# Phase 25\n\nA searchable PDF created entirely in the browser.\n\n- One\n- Two");
  await page.getByRole("button", { name: "Create PDF" }).click();
  await expect(page.getByText("PDF ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as project" })).toBeVisible();
});

test("Phase 25 creator exposes visual compatibility boundary", async ({ page }) => {
  await page.goto("./#/create");
  await page.getByLabel("Mode").selectOption("visual");
  await expect(page.getByText(/browser text shaping/i)).toBeVisible();
  await expect(page.getByText(/not selectable\/searchable/i)).toBeVisible();
});
