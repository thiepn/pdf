import { expect, test } from "@playwright/test";

test("phone workspace exposes touch-first document navigation and sheets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Phone-specific responsive flow");
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  const mobileNav = page.locator(".workspace-mobile-nav");
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole("button", { name: "Read" })).toBeVisible();
  await mobileNav.getByRole("button", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.locator(".editor-toolrail")).toBeVisible();
  await page.getByRole("button", { name: "Pages / layers" }).click();
  await expect(page.locator(".editor-left-panel")).toBeVisible();
  await page.locator(".editor-mobile-backdrop").click();
  await expect(page.locator(".editor-left-panel")).toHaveCount(0);

  await mobileNav.getByRole("button", { name: "Read" }).click();
  await page.getByRole("button", { name: "Pages / search" }).click();
  await expect(page.locator(".viewer-sidebar")).toBeVisible();

  await mobileNav.getByRole("button", { name: "More" }).click();
  const moreDialog = page.getByRole("dialog", { name: "More document tools" });
  await expect(moreDialog).toBeVisible();
  await expect(moreDialog.getByRole("button", { name: "OCR" })).toBeVisible();
});

test("tablet retains canvas space and touch-sized controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "tablet-webkit", "Tablet-specific responsive flow");
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".editor-stage")).toBeVisible();
  const select = page.getByRole("button", { name: /Select/ }).first();
  const box = await select.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
