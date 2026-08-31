import { expect, test } from "@playwright/test";

async function openTableEditor(page: import("@playwright/test").Page): Promise<import("@playwright/test").Locator> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  const table = page.getByRole("button", { name: /Select existing table:/ }).first();
  await expect(table).toBeVisible({ timeout: 20_000 });
  await table.click();
  const properties = page.locator(".native-unified-properties");
  await expect(properties.getByText("Table editing", { exact: true })).toBeVisible();
  return properties;
}

async function expectQueuedEdit(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator(".native-queued-count").filter({ hasText: "1 PDF edit ready" })).toHaveCount(1);
}

test("P5 edits structured table cells, merges cells, changes geometry and rows, then exports a validated PDF", async ({ page }) => {
  const properties = await openTableEditor(page);
  await properties.getByLabel("Table operation").selectOption("rebuild");
  const cell = properties.getByLabel("Cell R1 C1", { exact: true });
  await expect(cell).toBeVisible();
  await cell.fill("Edited heading");
  const firstCellEditor = cell.locator("..");
  await firstCellEditor.getByRole("spinbutton", { name: "Column span" }).fill("2");
  await expect(properties.getByLabel("Cell R1 C2", { exact: true })).toHaveCount(0);
  await properties.getByRole("button", { name: "Add row", exact: true }).click();
  await properties.getByLabel("Table border style").selectOption("dashed");
  await properties.getByLabel("Border width", { exact: true }).fill("1.5");
  await properties.getByRole("button", { name: "Apply structured table edit" }).click();
  await expectQueuedEdit(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
  await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 20_000 });
});

test("P5 deletes the detected table while preserving the rest of the PDF", async ({ page }) => {
  const properties = await openTableEditor(page);
  await properties.getByLabel("Table operation").selectOption("delete");
  await properties.getByRole("button", { name: "Delete existing table" }).click();
  await expectQueuedEdit(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await downloadPromise;
  await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 20_000 });
});
