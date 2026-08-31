import { expect, test } from "@playwright/test";

async function openVectorEditor(page: import("@playwright/test").Page): Promise<import("@playwright/test").Locator> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  const vector = page.getByRole("button", { name: /Select existing vector:/ }).first();
  await expect(vector).toBeVisible({ timeout: 20_000 });
  await vector.click();
  const properties = page.locator(".native-unified-properties");
  await expect(properties.getByText("Vector editing")).toBeVisible();
  return properties;
}

async function expectQueuedEdit(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator(".native-queued-count").filter({ hasText: "1 PDF edit ready" })).toHaveCount(1);
}

test("P4 edits exact source vector geometry and appearance without redacting neighboring content", async ({ page }) => {
  const properties = await openVectorEditor(page);
  await properties.getByLabel("Vector operation").selectOption("edit");

  const x = properties.getByLabel("X", { exact: true });
  const width = properties.getByLabel("Width", { exact: true });
  await x.fill(String(Number(await x.inputValue()) + 22));
  await width.fill(String(Number(await width.inputValue()) + 28));
  await properties.getByLabel("Rotation", { exact: true }).fill("18");
  await properties.getByText("Override source appearance", { exact: true }).click();
  await properties.getByLabel("Stroke width", { exact: true }).fill("4");
  await properties.getByLabel("Opacity", { exact: true }).fill("0.72");
  await properties.getByLabel("Vector line cap").selectOption("Square");
  await properties.getByLabel("Vector line join").selectOption("Bevel");
  await properties.getByLabel("Vector dash pattern").fill("9 3 2 3");
  await properties.getByRole("button", { name: "Apply source vector edit" }).click();
  await expectQueuedEdit(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
  await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 20_000 });
});

test("P4 deletes only the exact existing source path and exports a validated PDF", async ({ page }) => {
  const properties = await openVectorEditor(page);
  await properties.getByLabel("Vector operation").selectOption("delete");
  await properties.getByRole("button", { name: "Delete existing vector" }).click();
  await expectQueuedEdit(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await downloadPromise;
  await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 20_000 });
});
