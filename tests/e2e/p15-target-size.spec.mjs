import { test, expect } from "@playwright/test";
import mupdf from "mupdf";
import { readFile } from "node:fs/promises";

test("P15 target-size compression reaches a real byte target and exposes preservation evidence", async ({ page }) => {
  test.setTimeout(90000);
  const sourcePath = "tests/corpus/generated/unicode.pdf";
  const source = await readFile(sourcePath);
  expect(source.length).toBeGreaterThan(80_000);

  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"]').setInputFiles(sourcePath);
  await expect(page.locator(".editing-toolbar")).toBeVisible({ timeout: 30000 });

  const hash = await page.evaluate(() => window.location.hash);
  const match = hash.match(/^#\/workspace\/([^/]+)\/editor/);
  expect(match).toBeTruthy();
  const projectId = decodeURIComponent(match[1]);

  await page.goto(`./#/workspace/${encodeURIComponent(projectId)}/compress`);
  await expect(page.getByRole("heading", { name: "Choose how much to shrink the PDF", exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("radio", { name: /Target size/ })).toBeChecked();
  await page.getByLabel("Target size", { exact: true }).fill("80");
  const unit = page.locator(".target-size-input select");
  await expect(unit).toBeEnabled();
  await unit.selectOption({ value: "KB" });
  await expect(unit).toHaveValue("KB");
  await page.getByRole("radio", { name: /Prioritize the target/ }).check();

  await page.getByRole("button", { name: "Compress to target", exact: true }).click();

  const result = page.locator(".target-size-result");
  await expect(result).toBeVisible({ timeout: 60000 });
  await expect(result).toContainText("Target met");
  await expect(result).toContainText("Source");
  await expect(result).toContainText("Target");
  await expect(result).toContainText("Best output");
  await expect(result).toContainText("Attempts");
  await expect(result).toContainText(/PDF structure preserved|Pages rasterized/);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const file = await download;
  const outputPath = await file.path();
  expect(outputPath).toBeTruthy();
  const output = await readFile(outputPath);
  expect(output.length).toBeLessThan(source.length);
  expect(output.length).toBeLessThanOrEqual(80_000);

  const pdf = mupdf.Document.openDocument(output, "application/pdf");
  try { expect(pdf.countPages()).toBe(1); }
  finally { pdf.destroy(); }
});
