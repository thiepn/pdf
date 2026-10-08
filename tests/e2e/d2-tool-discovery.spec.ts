import { expect, test } from "@playwright/test";

test("D2 shows compact, category-filterable tool discovery with direct destinations", async ({ page }, info) => {
  await page.goto("./#/tools");
  await expect(page.getByRole("heading", { level: 1, name: "All PDF tools" })).toBeVisible();
  const scope = page.getByLabel("Filter PDF tools");
  await expect(scope).toBeVisible();
  await expect(scope.getByRole("button", { name: "All tools" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Organize your pages" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Convert & make smaller" })).toBeVisible();

  await scope.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(scope.getByRole("button", { name: "Pages", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Organize your pages" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Convert & make smaller" })).toHaveCount(0);
  const remove = page.getByRole("link", { name: /^Remove pages/ });
  await expect(remove).toHaveAttribute("href", "#/quick/remove-pages");
  await remove.click();
  await expect(page).toHaveURL(/#\/quick\/remove-pages$/);
  await expect(page.getByRole("button", { name: "Choose PDF", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("d2-tool-entry.png"), fullPage: true });
});

test("D2 natural-language search overrides a previous filter and Escape restores the filter", async ({ page }, info) => {
  await page.goto("./#/tools");
  const scope = page.getByLabel("Filter PDF tools");
  await scope.getByRole("button", { name: "Pages", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Find a PDF tool" });
  await search.fill("make this pdf smaller");
  const results = page.getByRole("region", { name: "Tool search results" });
  await expect(results.locator(".product-tool-card").first()).toContainText("Compress PDF");
  await expect(scope).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("d2-search.png"), fullPage: true });

  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(scope.getByRole("button", { name: "Pages", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Convert & make smaller" })).toHaveCount(0);
});

test("D2 empty searches have working recovery suggestions", async ({ page }) => {
  await page.goto("./#/tools");
  const search = page.getByRole("searchbox", { name: "Find a PDF tool" });
  await search.fill("xxzzyy unlisted action");
  await expect(page.getByRole("heading", { name: "No matching tool" })).toBeVisible();
  await page.getByRole("button", { name: "ocr", exact: true }).click();
  await expect(search).toHaveValue("ocr");
  await expect(page.getByRole("region", { name: "Tool search results" }).locator(".product-tool-card").first()).toContainText("OCR PDF");
  await page.getByRole("button", { name: "Clear tool search" }).click();
  await expect(page.getByRole("button", { name: "All tools" })).toHaveAttribute("aria-pressed", "true");
});

test("D2 capability-blocked tools expose their reason without a dead-end action", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", { configurable: true, value: undefined });
  });
  await page.goto("./#/tools");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const blocked = page.getByRole("group", { name: "OCR PDF unavailable" });
  await expect(blocked).toBeVisible();
  await expect(blocked.getByText(/Web Workers and WebAssembly/)).toBeVisible();
  await expect(blocked.getByText(/Use a current Chromium/)).toBeVisible();
  await expect(blocked.locator("a,button")).toHaveCount(0);
});

test("D2 phone catalog filters and results never overflow horizontally", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/tools");
  const scope = page.getByLabel("Filter PDF tools");
  await expect(scope.getByRole("button", { name: "All tools" })).toBeVisible();
  await scope.getByRole("button", { name: "Edit & sign", exact: true }).click();
  const cols = await page.locator(".product-directory--library .product-tool-grid").first()
    .evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length);
  expect(cols).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
  await page.screenshot({ path: info.outputPath("d2-phone.png"), fullPage: true });
});
