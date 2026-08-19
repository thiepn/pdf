import { expect, test } from "@playwright/test";

test("P1 edits existing PDF text as one fitted replacement and exports a validated PDF", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);

  const sourceText = page.getByRole("button", { name: /Select existing (?:text|paragraph):/ }).first();
  await expect(sourceText).toBeVisible({ timeout: 20_000 });
  await sourceText.click();

  const properties = page.locator(".native-unified-properties");
  await expect(properties.getByText(/Complete text fits:/)).toBeVisible();
  const editor = properties.locator("textarea").first();
  await expect(editor).toBeVisible();
  await editor.fill("P1 edit");
  await expect(properties.getByText(/Complete text fits:/)).toBeVisible();

  await properties.getByRole("button", { name: /Apply (?:text|paragraph) change/ }).click();
  await expect(page.getByText(/1 existing-content edit queued/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
  await expect(page.getByText("Export validated and downloaded")).toBeVisible({ timeout: 20_000 });
});
