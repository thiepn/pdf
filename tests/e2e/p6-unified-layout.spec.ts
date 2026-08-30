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

function selectionCount(properties: import("@playwright/test").Locator, label: "Existing PDF" | "Added objects") {
  return properties.locator(`dt:has-text("${label}") + dd`);
}

function queuedEdits(page: import("@playwright/test").Page, count: number) {
  return page.locator(".native-queued-count").filter({ hasText: `${count} existing-content edit${count === 1 ? "" : "s"} queued` });
}

test("P6 multi-selects existing image and vector, aligns and nudges them through their qualified writers", async ({ page }) => {
  await openEditor(page);
  const image = page.getByRole("button", { name: /Select existing image:/ }).first();
  const vector = page.getByRole("button", { name: /Select existing vector:/ }).first();
  await image.click();
  await vector.click({ modifiers: ["Shift"] });

  const properties = page.locator(".p6-layout-properties");
  await expect(properties.getByText("Unified layout", { exact: true })).toBeVisible();
  await expect(properties.getByText("2 selected objects", { exact: true })).toBeVisible();
  await expect(properties).not.toContainText("P6 · Unified layout");
  await expect(properties).not.toContainText("P1–P5");
  await expect(properties).not.toContainText("P4's arbitrary rotation model");
  await expect(selectionCount(properties, "Existing PDF")).toHaveText("2");
  await expect(selectionCount(properties, "Added objects")).toHaveText("0");
  await properties.getByRole("button", { name: "Left", exact: true }).click();
  await expect(queuedEdits(page, 2)).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(queuedEdits(page, 2)).toHaveCount(1);

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
  await expect(queuedEdits(page, 1)).toHaveCount(1);
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
  await expect(selectionCount(properties, "Existing PDF")).toHaveText("1");
  await expect(selectionCount(properties, "Added objects")).toHaveText("1");
  await properties.getByRole("button", { name: "Page center X", exact: true }).click();
  await expect(queuedEdits(page, 1)).toHaveCount(1);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(queuedEdits(page, 1)).toHaveCount(1);

  await exportValidated(page);
});
