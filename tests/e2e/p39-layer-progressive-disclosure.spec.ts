import { expect, test } from "@playwright/test";

async function openEditor(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: /Select existing image:/ }).first()).toBeVisible({ timeout: 20_000 });
}

async function addRectangle(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + 45, box.y + 45);
  await page.mouse.down();
  await page.mouse.move(box.x + 155, box.y + 110, { steps: 4 });
  await page.mouse.up();
}

test("Layers presents source and added items without confidence percentages or z-index jargon", async ({ page }) => {
  await openEditor(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "layers", exact: true }).click();

  const layers = page.locator(".unified-layer-list");
  await expect(layers.getByText("Existing PDF content", { exact: true }).first()).toBeVisible();
  await expect(layers.getByText("Added in PDF Studio", { exact: true }).first()).toBeVisible();

  const sourceRow = layers.locator(".native-layer-item").first();
  await expect(sourceRow).toBeVisible();
  await expect(sourceRow.locator("small")).not.toContainText(/\b\d+%/);

  const addedRow = layers.locator(".editor-layer-item:not(.native-layer-item)").first();
  await expect(addedRow).toBeVisible();
  await expect(addedRow.locator("small")).toHaveText("Added in PDF Studio");
  await expect(addedRow.locator("small")).not.toContainText(/\bz\d+\b/i);
});
