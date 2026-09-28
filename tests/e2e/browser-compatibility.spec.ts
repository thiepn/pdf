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

  await page.goto("./#/tools/read-pdf");
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

test("rapid hash navigation and browser history keep the selected tool visible", async ({ page }) => {
  await page.goto("./#/home");
  await page.goto("./#/tools/read-pdf");
  await expect(page.getByLabel("PDF file", { exact: true })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Read PDF", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Choose files", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("PDF file", { exact: true })).toBeAttached();
});

test("reader hydration and page jumps never scroll document actions out of the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(`${corpus}/plain-text.pdf`);
  await expect(page.locator('.viewer-app[data-preferences-ready="true"]')).toBeVisible();
  const actions = page.getByRole("button", { name: "Document actions", exact: true });
  expect((await actions.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.getByLabel("Current page", { exact: true }).fill("3");
  await expect.poll(() => page.locator(".document-stage").evaluate(node => node.scrollTop)).toBeGreaterThan(400);
  expect((await actions.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(await page.locator(".workspace-mode-content").evaluate(node => node.scrollTop)).toBe(0);
  await actions.click();
  await expect(page.getByRole("dialog", { name: "Document actions", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit this PDF", exact: true }).click();
  await expect(page.locator(".editor-app")).toBeVisible();
});
