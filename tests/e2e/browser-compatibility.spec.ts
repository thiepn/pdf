import { expect, test } from "@playwright/test";

const corpus = "tests/corpus/generated";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Map.prototype, "getOrInsert");
    Reflect.deleteProperty(Map.prototype, "getOrInsertComputed");
  });
});

test("opens and renders a real PDF without Map upsert proposal APIs", async ({ page }, testInfo) => {
  const uncaught: string[] = [];
  page.on("pageerror", error => uncaught.push(error.message));

  await page.goto("./#/home");
  await page.waitForTimeout(250);
  expect(uncaught.filter(message => /getOrInsert(?:Computed)?/.test(message))).toEqual([]);
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${corpus}/plain-text.pdf`);

  await expect(page.getByText("PLAIN_PAGE_1_MARKER", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".page-input")).toContainText("/ 3");
  if (!testInfo.project.name.includes("mobile") && !testInfo.project.name.includes("tablet")) {
    await page.getByRole("button", { name: "Single", exact: true }).click();
    await page.getByLabel("Current page").fill("1");
    await expect(page.getByLabel("Current page")).toHaveValue("1");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByLabel("Current page")).toHaveValue("2");
    await expect(page.getByText("PLAIN_PAGE_2_MARKER", { exact: true })).toBeVisible();
  }
  expect(uncaught.filter(message => /getOrInsert(?:Computed)?/.test(message))).toEqual([]);
});
