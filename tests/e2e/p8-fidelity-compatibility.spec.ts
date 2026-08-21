import { expect, test } from "@playwright/test";

const corpus = "tests/corpus/p8";

async function uploadPdf(page: import("@playwright/test").Page, filename: string): Promise<void> {
  await page.goto("./#/home");
  const input = page.locator('input[type="file"][accept*="pdf"]').first();
  await input.setInputFiles(`${corpus}/${filename}`);
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
}

async function openEditorAndAddRectangle(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.locator(".editor-page-layers")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + 48, box.y + 48);
  await page.mouse.down();
  await page.mouse.move(box.x + 148, box.y + 108, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText(/1 overlay object/)).toBeVisible();
}

async function exportValidated(page: import("@playwright/test").Page): Promise<void> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
  await expect(page.getByText("Export validated and downloaded")).toBeVisible({ timeout: 25_000 });
}

test("P8 preserves rotated crop geometry while exporting an edited real-world page", async ({ page }) => {
  await uploadPdf(page, "rotated-crop.pdf");
  await openEditorAndAddRectangle(page);
  await exportValidated(page);
  await expect(page.getByText(/P8 fidelity validation failed/i)).toHaveCount(0);
});

test("P8 accepts semantic preservation of incremental PDFs and reports revision normalization", async ({ page }) => {
  await uploadPdf(page, "incremental.pdf");
  await openEditorAndAddRectangle(page);
  await exportValidated(page);
  await expect(page.getByText(/incremental revisions/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/P8 fidelity validation failed/i)).toHaveCount(0);
});
