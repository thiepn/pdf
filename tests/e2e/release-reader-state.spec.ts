import { expect, test } from "@playwright/test";

async function openMultiPageReader(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles("tests/corpus/phase28/pages-50.pdf");
  await expect(page.locator(".viewer-app")).toBeVisible({ timeout: 20_000 });
}

test("reader restores page, scale, view and panel after reload", async ({ page }) => {
  await openMultiPageReader(page);
  const reader = page.locator('.viewer-app[data-preferences-ready="true"]');
  await expect(reader).toBeVisible();
  await page.getByRole("button", { name: "Single", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Current page", exact: true }).fill("2");
  await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("1.75");
  await page.getByRole("combobox", { name: "Reader panel", exact: true }).selectOption("info");
  await expect(page.locator('.pdf-page-shell[data-page-number="2"]')).toBeVisible();
  await page.waitForTimeout(700); // Exercise the documented debounced storage write.
  await page.reload();
  await expect(reader).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue("2");
  await expect(page.getByRole("combobox", { name: "Zoom", exact: true })).toHaveValue("1.75");
  await expect(page.getByRole("combobox", { name: "Reader panel", exact: true })).toHaveValue("info");
  await expect(page.locator(".pdf-page-shell")).toHaveCount(1);
});

test("preloaded pages do not falsely advance reading position", async ({ page }) => {
  await openMultiPageReader(page);
  await expect(page.locator('.viewer-app[data-preferences-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Continuous", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Current page", exact: true }).fill("1");
  await expect(page.locator('.pdf-page-shell[data-page-number="1"][data-rendered="true"]')).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue("1");
  await page.locator('.pdf-page-shell[data-page-number="2"]').evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(page.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue("2");
});

test("modal restoration does not steal a newer skip-link focus", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open command palette", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Find a PDF task", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const skip = page.getByRole("link", { name: "Skip to content", exact: true });
  await skip.focus();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(skip).toBeFocused();
});

test("initial page effects keep an intentionally focused skip link", async ({ page }) => {
  await page.goto("./#/home");
  const skip = page.getByRole("link", { name: "Skip to content", exact: true });
  await skip.focus();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-workspace")).toBeFocused();
});
