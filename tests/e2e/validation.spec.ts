import { expect, test } from "@playwright/test";

test("deployed release validation completes without required failures", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("./#/validation");
  await page.getByRole("button", { name: "Run validation" }).click();
  await expect(page.getByText("Validation complete")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".diagnostic-row .status--failed")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export report" })).toBeEnabled();
});
