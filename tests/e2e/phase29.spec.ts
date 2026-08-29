import { expect, test } from "@playwright/test";

test("command palette traps focus and restores it on close", async ({ page }) => {
  await page.goto("#/home");
  const trigger = page.getByRole("button", { name: "Open command palette" });
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Find a PDF task" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search PDF tasks" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("skip link moves keyboard focus into the workspace", async ({ page, browserName }) => {
  await page.goto("#/home");
  await expect(page.getByRole("heading", { name: /What do you want to do with your PDF\?/i })).toBeVisible();
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
  const skip = page.getByRole("link", { name: "Skip to workspace" });
  if (browserName === "webkit") await skip.focus();
  else await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-workspace")).toBeFocused();
});

test("320px layout does not create page-level horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("#/home");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
});

test("reduced-motion preference disables long transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("#/tools");
  const tile = page.locator(".tool-tile").first();
  await expect(tile).toBeVisible();
  const duration = await tile.evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(duration).toMatch(/0\.001ms|0s/);
});
