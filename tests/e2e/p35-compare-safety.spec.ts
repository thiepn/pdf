import { expect, test } from "@playwright/test";

const corpus = "tests/corpus/phase28";

async function loadPair(page: import("@playwright/test").Page, left: string, right: string): Promise<void> {
  const inputs = page.locator('.compare-inputs input[type="file"]');
  await inputs.nth(0).setInputFiles(`${corpus}/${left}`);
  await expect(page.getByText(left, { exact: true })).toBeVisible();
  await inputs.nth(1).setInputFiles(`${corpus}/${right}`);
  await expect(page.getByText(right, { exact: true })).toBeVisible();
}

test("P35 visual comparison runs through the bounded worker path", async ({ page }) => {
  await page.goto("./#/compare");
  await loadPair(page, "dense-text-01.pdf", "dense-text-01.pdf");
  await page.getByRole("button", { name: "Compare pair" }).click();
  await expect(page.getByText("0.00% changed pixels", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".visual-compare-grid .compare-canvas canvas")).toHaveCount(3);
});

test("P35 document analysis can be cancelled without leaving Compare stuck", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("./#/compare");
  await loadPair(page, "pages-1000.pdf", "pages-1000.pdf");
  await page.getByRole("button", { name: "Analyze document" }).click();
  const cancel = page.getByRole("button", { name: "Cancel comparison" });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(cancel).toBeHidden({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Analyze document" })).toBeEnabled();
  await expect(page.getByText("Comparison issue")).toBeHidden();
});
