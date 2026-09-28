import { expect, test } from "@playwright/test";

const corpus = "tests/corpus/phase28";

async function loadPair(page: import("@playwright/test").Page, left: string, right: string): Promise<void> {
  const inputs = page.locator('.compare-inputs input[type="file"]');
  const slots = page.locator(".compare-inputs .file-slot");
  await inputs.nth(0).setInputFiles(`${corpus}/${left}`);
  await expect(slots.nth(0)).toContainText(left);
  await inputs.nth(1).setInputFiles(`${corpus}/${right}`);
  await expect(slots.nth(1)).toContainText(right);
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
  // This fixture is below the alignment limit, so the operation actually starts.
  await loadPair(page, "pages-300.pdf", "pages-300.pdf");
  await page.getByRole("button", { name: "Find differences", exact: true }).click();
  const cancel = page.getByRole("button", { name: "Cancel comparison", exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(cancel).toBeHidden({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Find differences", exact: true })).toBeEnabled();
  await expect(page.getByText("Comparison issue")).toBeHidden();
});

test("P35 oversized alignment is rejected without trapping the comparison controls", async ({ page }) => {
  await page.goto("./#/compare");
  await loadPair(page, "pages-1000.pdf", "pages-1000.pdf");
  await page.getByRole("button", { name: "Find differences", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("automatic page-matching limit");
  await expect(page.getByRole("button", { name: "Cancel comparison", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Find differences", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Compare pair", exact: true })).toBeEnabled();
});
