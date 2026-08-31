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

test("editor status and secondary surfaces use product language", async ({ page }) => {
  await openEditor(page);

  const fileGroup = page.locator(".editor-file-group");
  await expect(fileGroup).toContainText(/Ready · \d+ PDF items? · 0 added objects/);
  await expect(fileGroup).not.toContainText(/PDF engine|Unified editor|overlay objects|Unsaved export|existing-content/i);

  await addRectangle(page);
  await expect(fileGroup).toContainText("1 added object");
  await expect(page.locator(".editor-contextbar strong")).toHaveText("Changes saved locally", { timeout: 10_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await downloadPromise;
  await expect(fileGroup).toContainText("Edited PDF downloaded");
  await expect(page.locator(".editor-contextbar strong")).toContainText(/0 PDF content edits · 1 added object · /);
});
