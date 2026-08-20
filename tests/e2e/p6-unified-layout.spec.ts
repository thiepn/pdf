import { expect, test } from "@playwright/test";

async function openEditor(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: /Select existing image:/ }).first()).toBeVisible({ timeout: 20_000 });
}

async function exportValidated(page: import("@playwright/test").Page): Promise<void> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
  await expect(page.getByText("Export validated and downloaded")).toBeVisible({ timeout: 20_000 });
}

test("P6 multi-selects existing image and vector, aligns and nudges them through their qualified writers", async ({ page }) => {
  await openEditor(page);
  const image = page.getByRole("button", { name: /Select existing image:/ }).first();
  const vector = page.getByRole("button", { name: /Select existing vector:/ }).first();
  await image.click();
  await vector.click({ modifiers: ["Shift"] });

  const properties = page.locator(".p6-layout-properties");
  await expect(properties.getByText("2 selected objects", { exact: true })).toBeVisible();
  await expect(properties.getByText("2", { exact: true })).toHaveCount(2);
  await properties.getByRole("button", { name: "Left", exact: true }).click();
  await expect(page.getByText("2 existing-content edits queued")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 existing-content edits queued")).toBeVisible();

  await exportValidated(page);
});

test("P6 drags an existing image directly on canvas and exports the source-preserving transform", async ({ page }) => {
  await openEditor(page);
  const image = page.getByRole("button", { name: /Select existing image:/ }).first();
  await image.click();
  const box = await image.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 34, box.y + box.height / 2 + 18, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText("1 existing-content edit queued")).toBeVisible();
  await exportValidated(page);
});

test("P6 aligns an added shape and existing PDF image as one mixed selection", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + 36, box.y + 36);
  await page.mouse.down();
  await page.mouse.move(box.x + 136, box.y + 96, { steps: 4 });
  await page.mouse.up();

  const image = page.getByRole("button", { name: /Select existing image:/ }).first();
  await image.click({ modifiers: ["Shift"] });
  const properties = page.locator(".p6-layout-properties");
  await expect(properties.getByText("2 selected objects", { exact: true })).toBeVisible();
  await expect(properties.getByText("Existing PDF").locator("+").first()).toBeVisible();
  await properties.getByRole("button", { name: "Page center X", exact: true }).click();
  await expect(page.getByText("1 existing-content edit queued")).toBeVisible();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByText("1 existing-content edit queued")).toBeVisible();

  await exportValidated(page);
});
