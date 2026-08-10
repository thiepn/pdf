import { expect, test } from "@playwright/test";

async function contrastRatio(locator: import("@playwright/test").Locator): Promise<number> {
  return locator.evaluate((element) => {
    const parse = (value: string) => {
      const numbers = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      return numbers.map((channel) => {
        const normalized = channel / 255;
        return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
      });
    };
    const luminance = (rgb: number[]) => .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    const style = getComputedStyle(element);
    const foreground = luminance(parse(style.color));
    const background = luminance(parse(getComputedStyle(element.closest(".app-topbar") ?? element).backgroundColor));
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
}

test("professional shell uses vector icons and quiet route focus", async ({ page, browserName }) => {
  await page.goto("./#/home");
  const primaryNavigation = page.getByRole("navigation", { name: "Application navigation" });
  await expect(primaryNavigation.locator("svg.studio-icon")).toHaveCount(5);

  await primaryNavigation.getByRole("link", { name: "Documents" }).click();
  const routeHeading = page.locator("[data-route-heading='true']");
  await expect(routeHeading).toHaveText("Local projects");
  await expect(routeHeading).toBeFocused();
  await expect(routeHeading).toHaveCSS("outline-style", "none");

  const settingsLink = primaryNavigation.getByRole("link", { name: "Settings" });
  await settingsLink.focus();
  const helpLink = primaryNavigation.getByRole("link", { name: "Help" });
  if (browserName === "webkit") await helpLink.focus();
  else await page.keyboard.press("Tab");
  await expect(helpLink).toBeFocused();
  if (browserName !== "webkit") expect(await helpLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});

test("core journeys remain composed across theme and density modes", async ({ page }) => {
  await page.goto("./#/home");
  await expect(page.locator(".product-hero")).toBeVisible();
  await expect(page.locator(".pwa-readiness--compact")).toBeVisible();

  for (const theme of ["light", "dark"] as const) {
    for (const density of ["comfortable", "compact"] as const) {
      await page.locator("html").evaluate((element, values) => {
        element.dataset.theme = values.theme;
        element.dataset.density = values.density;
      }, { theme, density });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.getByRole("button", { name: "Open PDF" })).toBeVisible();
    }
  }

  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page.locator(".workspace-mode--active svg.studio-icon")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous page" }).locator("svg.studio-icon")).toBeVisible();
  await expect(page.locator(".workspace-mode-content")).toBeVisible();
});

test("top chrome keeps paired accessible colors in every theme", async ({ page }) => {
  await page.goto("./#/home");
  for (const theme of ["light", "dark", "system"] as const) {
    await page.locator("html").evaluate((element, nextTheme) => { element.dataset.theme = nextTheme; }, theme);
    const topbar = page.locator(".app-topbar");
    await expect(topbar).toBeVisible();
    expect(await contrastRatio(topbar.locator("h1"))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(topbar.locator(".topbar__subtitle"))).toBeGreaterThanOrEqual(4.5);
    const background = await topbar.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
  }
});

test("Quick Tools uses visible typed SVG icons", async ({ page }) => {
  await page.goto("./#/tools");
  await page.locator(".tool-advanced-disclosure").evaluate((element) => { (element as HTMLDetailsElement).open = true; });
  const tiles = page.locator(".tool-tile");
  await expect(tiles).toHaveCount(13);
  await expect(tiles.locator("svg.studio-icon")).toHaveCount(13);
  for (const theme of ["light", "dark"] as const) {
    await page.locator("html").evaluate((element, value) => { element.dataset.theme = value; }, theme);
    for (const icon of await tiles.locator("svg.studio-icon").all()) {
      await expect(icon).toBeVisible();
      expect(await icon.evaluate((element) => getComputedStyle(element).color)).not.toBe("rgba(0, 0, 0, 0)");
    }
  }
});
