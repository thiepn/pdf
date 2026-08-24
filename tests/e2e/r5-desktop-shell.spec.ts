import { expect, test } from "@playwright/test";

test.describe("R5 desktop workspace hierarchy", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("keeps one compact document header and one dominant primary mode rail", async ({ page }) => {
    await page.goto("./#/home");
    await page.getByRole("button", { name: "Open sample" }).click();
    await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);

    const navigation = page.getByRole("navigation", { name: "Document workspace" }).first();
    for (const destination of ["Read", "Edit", "Pages", "Tools"]) {
      await expect(navigation.getByRole("button", { name: destination, exact: true })).toBeVisible();
    }

    await expect(page.locator(".workspace-commandbar")).toBeVisible();
    await expect(page.locator(".workspace-mobile-nav")).toBeHidden();
    await expect(page.locator(".workspace-tab__document").first()).toBeHidden();

    const commandbarHeight = await page.locator(".workspace-commandbar").evaluate((element) => element.getBoundingClientRect().height);
    const modeRailHeight = await page.locator(".workspace-modes--primary").evaluate((element) => element.getBoundingClientRect().height);
    expect(commandbarHeight).toBeLessThanOrEqual(58);
    expect(modeRailHeight).toBeLessThanOrEqual(46);

    const activeRead = navigation.getByRole("button", { name: "Read", exact: true });
    const activeStyle = await activeRead.evaluate((element) => getComputedStyle(element));
    expect(activeStyle.borderBottomWidth).toBe("2px");
    expect(activeStyle.borderBottomColor).not.toBe("rgba(0, 0, 0, 0)");

    const contextbar = page.locator(".workspace-contextbar");
    if (await contextbar.count()) await expect(contextbar).toBeHidden();

    const history = page.getByRole("button", { name: "History", exact: true });
    await expect(history).toBeVisible();
    await history.click();
    await expect(page.getByRole("heading", { name: "History & checkpoints" })).toBeVisible();
  });
});
