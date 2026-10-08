import { expect, test } from "@playwright/test";
import { createShowcasePdf } from "../../src/fixtures/showcasePdf";

test("D1 presents a file-first PDF workspace rather than a marketing landing page", async ({ page }, testInfo) => {
  await page.goto("./#/home");

  const home = page.locator(".product-home--workspace");
  await expect(home).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with a file", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText("Less work. More done.")).toHaveCount(0);
  await expect(page.getByLabel("Open or drop files")).toBeVisible();
  await expect(page.getByLabel("Choose files to get started", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Workspace shortcuts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try an example" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Find a PDF tool" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Saved documents/ })).toBeVisible();

  const drop = await page.getByLabel("Open or drop files").boundingBox();
  const search = await page.getByRole("searchbox", { name: "Find a PDF tool" }).boundingBox();
  expect(drop).not.toBeNull();
  expect(search).not.toBeNull();
  expect(drop!.y).toBeLessThan(search!.y);

  const headingSize = await page.getByRole("heading", { name: "Start with a file" })
    .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  expect(headingSize).toBeLessThanOrEqual(32);
  await page.screenshot({ path: testInfo.outputPath("d1-desktop-home.png"), fullPage: true });
});

test("D1 preserves file selection and routes tasks through the existing handoff", async ({ page }) => {
  await page.goto("./#/home");
  const buffer = (globalThis as any).Buffer.from(createShowcasePdf());
  await page.getByLabel("Choose files to get started", { exact: true }).setInputFiles([
    { name: "first.pdf", mimeType: "application/pdf", buffer },
    { name: "second.pdf", mimeType: "application/pdf", buffer }
  ]);
  await expect(page.getByText("2 files ready")).toBeVisible();
  await expect(page.getByText("first.pdf", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What would you like to do with these files?" })).toBeVisible();
  await page.getByRole("button", { name: /^Merge PDFs/ }).click();
  await expect(page).toHaveURL(/#\/merge$/);
});

test("D1 phone layout maintains usable controls and single-column task rows", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: "Start with a file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose files" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try an example" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Find a PDF tool" })).toBeVisible();

  const columns = await page.locator(".product-home--workspace .product-tool-grid").first()
    .evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length);
  expect(columns).toBe(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("d1-phone-home.png"), fullPage: true });
});
