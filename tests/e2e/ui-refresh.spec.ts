import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/taskFirst";

async function contrast(locator: import("@playwright/test").Locator): Promise<number> {
  return locator.evaluate((element) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]).map((n) => n / 255 <= .04045 ? n / 255 / 12.92 : ((n / 255 + .055) / 1.055) ** 2.4);
    const luminance = (value: string) => { const [r, g, b] = rgb(value); return .2126 * r + .7152 * g + .0722 * b; };
    const foreground = luminance(getComputedStyle(element).color), background = luminance(getComputedStyle(element.closest(".product-header")!).backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
}
test("application menu is keyboard accessible and routing focuses the new main content", async ({ page }) => {
  await page.goto("./#/home");
  const trigger = page.getByRole("button", { name: "Open app menu" });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "PDF Studio", exact: true });
  await expect(menu.getByRole("navigation", { name: "App menu" }).locator("svg")).toHaveCount(6);
  await menu.getByRole("link", { name: "Saved documents", exact: true }).click();
  await expect(page.locator("main")).toBeFocused();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
test("core journeys fit light/dark and compact/comfortable layouts", async ({ page }) => {
  await page.goto("./#/home");
  for (const theme of ["light", "dark"]) for (const density of ["comfortable", "compact"]) {
    await page.locator("html").evaluate((element, values) => { element.dataset.theme = values.theme; element.dataset.density = values.density; }, { theme, density });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Choose files", exact: true })).toBeVisible();
  }
  await openSample(page);
  await expect(page.getByRole("button", { name: "Previous page", exact: true }).locator("svg")).toBeVisible();
  await expect(page.locator(".workspace-mode-content")).toBeVisible();
});
test("header text retains accessible contrast in every theme", async ({ page }) => {
  await page.goto("./#/home");
  for (const theme of ["light", "dark", "system"]) {
    await page.locator("html").evaluate((element, value) => { element.dataset.theme = value; }, theme);
    expect(await contrast(page.locator(".product-brand"))).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link").first())).toBeGreaterThanOrEqual(4.5);
  }
});
test("every listed tool has a visible SVG and appears only once", async ({ page }) => {
  await page.goto("./#/tools");
  await page.locator(".product-advanced summary").click();
  const cards = page.locator(".product-tool-card");
  expect(await cards.count()).toBeGreaterThan(30);
  await expect(cards.locator("svg")).toHaveCount(await cards.count());
  const labels = await cards.locator("strong").allTextContents(); expect(new Set(labels).size).toBe(labels.length);
  for (const card of await cards.all()) { await card.scrollIntoViewIfNeeded(); await expect(card.locator("svg")).toBeVisible(); }
});
