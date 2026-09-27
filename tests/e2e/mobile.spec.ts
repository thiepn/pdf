import { expect, test } from "@playwright/test";
import { openSample, switchMode } from "./helpers/taskFirst";

const overflow = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("touch layouts expose document actions and tools without old navigation rows", async ({ page }) => {
  await openSample(page, "editor");
  await expect(page.locator(".workspace-mobile-nav,.workspace-tabs,.editor-toolrail")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Editing tools" })).toBeVisible();
  await page.getByRole("button", { name: "More tools", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editor tools" });
  for (const name of ["Rectangle", "Arrow", "Underline", "Mark redaction"]) await expect(dialog.getByRole("button", { name, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close tools" }).click();
  await switchMode(page, "viewer");
  await expect(page.getByRole("button", { name: "Pages / search", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pages / search", exact: true }).click();
  await expect(page.locator(".viewer-sidebar")).toBeVisible();
});
test("primary file and editing actions remain touch-sized and horizontally contained", async ({ page }) => {
  await page.goto("./#/home");
  expect((await page.getByRole("button", { name: "Choose files", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await openSample(page, "editor");
  for (const name of ["Add text", "More tools", "Download PDF"]) {
    const control = page.getByRole("button", { name, exact: true });
    const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
test("editor commands remain reachable from 320px through tablet widths", async ({ page }) => {
  await openSample(page, "editor");
  for (const width of [320, 390, 430, 834]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("button", { name: "Document actions", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "More tools", exact: true })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});
test("tool dialogs fit the live viewport and close without changing the active document", async ({ page }) => {
  await openSample(page, "editor");
  const original = page.url();
  await page.getByRole("button", { name: "More tools", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editor tools" });
  const box = await dialog.boundingBox(), height = await page.evaluate(() => window.visualViewport?.height ?? innerHeight);
  expect(box!.height).toBeLessThanOrEqual(Math.ceil(height)); expect(box!.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); expect(page.url()).toBe(original);
});
test("landscape keeps document actions and the canvas reachable", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await openSample(page, "editor");
  await expect(page.locator(".editor-stage")).toBeVisible();
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Document actions", exact: true });
  await expect(dialog.getByRole("button", { name: "Read PDF", exact: true })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
test("tablet properties overlay without consuming the page canvas width", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 }); await openSample(page, "editor");
  const stage = page.locator(".editor-stage"); const before = await stage.boundingBox(); expect(before!.width).toBeGreaterThan(500);
  const properties = page.locator(".editor-properties");
  if (!await properties.isVisible()) await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(properties).toBeVisible(); const after = await stage.boundingBox();
  expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(2);
});
