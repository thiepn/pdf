import { expect, test } from "@playwright/test";

async function openEditor(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
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
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 105, { steps: 4 });
  await page.mouse.up();
}

test("Layers hides implementation metadata until explicitly requested", async ({ page }) => {
  await openEditor(page);
  await addRectangle(page);
  await page.getByRole("button", { name: "layers", exact: true }).click();

  const layers = page.locator(".editor-layer-list");
  await expect(layers).toBeVisible();
  await expect(layers.getByText("Added objects", { exact: true })).toBeVisible();
  await expect(layers.getByText("Overlay objects", { exact: true })).toHaveCount(0);
  await expect(layers).not.toContainText(/\b\d{1,3}%\b/);
  await expect(layers).not.toContainText(/\bz\d+\b/);
  await expect(layers).not.toContainText("Source type");
  await expect(layers).not.toContainText("Layer order");
  await expect(layers).toContainText("Added in PDF Studio");

  const toggle = layers.getByRole("button", { name: "Show technical details" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();

  await expect(layers.getByRole("button", { name: "Hide technical details" })).toHaveAttribute("aria-pressed", "true");
  await expect(layers.locator(".native-layer-item .editor-layer-technical").first()).toContainText(/Confidence \d+% · Source type /);
  await expect(layers.locator(".editor-layer-item:not(.native-layer-item) .editor-layer-technical").first()).toContainText(/Type .* · Layer order \d+/);

  await layers.getByRole("button", { name: "Hide technical details" }).click();
  await expect(layers).not.toContainText(/\b\d{1,3}%\b/);
  await expect(layers).not.toContainText("Source type");
  await expect(layers).not.toContainText("Layer order");
});