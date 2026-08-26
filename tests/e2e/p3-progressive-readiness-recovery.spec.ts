import { expect, test } from "@playwright/test";

async function readinessNames(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => (window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? [])
    .filter((entry) => entry.name.startsWith("readiness."))
    .map((entry) => entry.name));
}

test.describe("Recovery P3 progressive readiness", () => {
  test("viewer becomes interactive before deferred document enrichment", async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto("./#/home");
    await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.clear());
    await page.getByRole("button", { name: "Open sample" }).click();

    await expect(page.locator(".viewer-app")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    await expect.poll(async () => (await readinessNames(page)).includes("readiness.viewer.interactive")).toBe(true);
    await expect.poll(async () => (await readinessNames(page)).includes("readiness.viewer.hydrated"), { timeout: 15_000 }).toBe(true);

    const names = await readinessNames(page);
    expect(names.indexOf("readiness.viewer.interactive")).toBeLessThan(names.indexOf("readiness.viewer.hydrated"));
  });

  test("editor exposes overlay tools before native PDF inspection hydration", async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto("./#/home");
    await page.getByRole("button", { name: "Open sample" }).click();
    await expect(page.locator(".viewer-app")).toBeVisible();
    await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.clear());

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".editor-app")).toBeVisible();
    await expect(page.locator(".editor-toolrail").getByRole("button", { name: "Text", exact: true })).toBeVisible();
    await expect.poll(async () => (await readinessNames(page)).includes("readiness.editor.interactive")).toBe(true);
    await expect.poll(async () => (await readinessNames(page)).includes("readiness.editor.nativeHydrated"), { timeout: 30_000 }).toBe(true);

    const names = await readinessNames(page);
    expect(names.indexOf("readiness.editor.interactive")).toBeLessThan(names.indexOf("readiness.editor.nativeHydrated"));
  });
});
