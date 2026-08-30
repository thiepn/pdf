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

test("mixed selection badge and duplicate warning do not expose reconstruction phase labels", async ({ page }) => {
  await openEditor(page);
  await addRectangle(page);

  const sourceImage = page.getByRole("button", { name: /Select existing image:/ }).first();
  await sourceImage.click({ modifiers: ["Shift"] });

  const badge = page.locator(".p6-selection-count");
  await expect(badge).toHaveText("2 selected");
  await expect(badge).not.toContainText(/\bP[1-8]\b/);

  await page.keyboard.press("Control+D");
  const warning = page.locator(".editor-notices .warning-banner");
  await expect(warning).toContainText("Existing PDF objects cannot be duplicated safely.");
  await expect(warning).toContainText("Only objects added in PDF Studio are duplicated.");
  await expect(warning).not.toContainText(/\bP[1-8]\b/);
});

test("copying a mixed selection explains the source-object boundary in user language", async ({ page }) => {
  await openEditor(page);
  await addRectangle(page);
  await page.getByRole("button", { name: /Select existing image:/ }).first().click({ modifiers: ["Shift"] });

  await page.keyboard.press("Control+C");
  const warning = page.locator(".editor-notices .warning-banner");
  await expect(warning).toContainText("Existing PDF objects cannot be copied as independent objects.");
  await expect(warning).toContainText("Objects added in PDF Studio are copied normally.");
  await expect(warning).not.toContainText(/\bP[1-8]\b/);
});
