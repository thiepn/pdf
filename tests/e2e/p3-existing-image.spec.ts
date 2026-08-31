import { expect, test } from "@playwright/test";

async function openImageEditor(page: import("@playwright/test").Page): Promise<import("@playwright/test").Locator> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  const image = page.getByRole("button", { name: /Select existing image:/ }).first();
  await expect(image).toBeVisible({ timeout: 20_000 });
  await image.click();
  const properties = page.locator(".native-unified-properties");
  await expect(properties.getByText("Image editing")).toBeVisible();
  return properties;
}

async function expectQueuedEdit(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator(".native-queued-count").filter({ hasText: "1 PDF edit ready" })).toHaveCount(1);
}

test("P3 moves, resizes, rotates, crops and changes opacity of an existing source image without an upload", async ({ page }) => {
  const properties = await openImageEditor(page);
  await properties.getByLabel("Image operation").selectOption("transform");
  await properties.getByLabel("Image fit").selectOption("cover");
  const x = properties.getByLabel("X", { exact: true });
  const width = properties.getByLabel("Width", { exact: true });
  await x.fill(String(Number(await x.inputValue()) + 18));
  await width.fill(String(Number(await width.inputValue()) + 24));
  await properties.getByLabel("Image rotation").selectOption("90");
  await properties.getByLabel("Opacity", { exact: true }).fill("0.7");
  await properties.getByRole("button", { name: "Apply source image transform" }).click();
  await expectQueuedEdit(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
  await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 20_000 });
});

test("P3 deletes only the selected existing image and exports a validated PDF", async ({ page }) => {
  const properties = await openImageEditor(page);
  await properties.getByLabel("Image operation").selectOption("delete");
  await properties.getByRole("button", { name: "Delete existing image" }).click();
  await expectQueuedEdit(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await downloadPromise;
  await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 20_000 });
});
