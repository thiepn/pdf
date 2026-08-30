import { expect, test } from "@playwright/test";

test("P36 keeps native editor property panels in user-facing language", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);

  const cases = [
    { selector: /Select existing (?:text|paragraph):/, heading: /Layout-aware paragraph|Text/ },
    { selector: /Select existing image:/, heading: "Image editing" },
    { selector: /Select existing vector:/, heading: "Vector editing" },
    { selector: /Select existing table:/, heading: "Table editing" },
    { selector: /Select existing nested group:/, heading: "Nested PDF group" }
  ] as const;

  for (const item of cases) {
    const target = page.getByRole("button", { name: item.selector }).first();
    await expect(target).toBeVisible({ timeout: 20_000 });
    await target.click();
    const properties = page.locator(".native-unified-properties");
    await expect(properties.getByRole("heading", { name: item.heading }).first()).toBeVisible();
    await expect(properties).not.toContainText(/Existing (?:PDF content|image|vector|table) · P[2-7]/);
  }

  const table = page.getByRole("button", { name: /Select existing table:/ }).first();
  await table.click();
  const tableProperties = page.locator(".native-unified-properties");
  await expect(tableProperties.locator("dt", { hasText: /^Confidence$/ })).toHaveCount(0);
  await expect(tableProperties).toContainText("On export, PDF Studio removes only the detected table text and grid region");
});
