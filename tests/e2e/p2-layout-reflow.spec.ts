import { expect, test } from "@playwright/test";

test("P2 exposes font-fidelity evidence and exports through the layout-aware text path", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);

  const sourceText = page.getByRole("button", { name: /Select existing (?:text|paragraph):/ }).first();
  await expect(sourceText).toBeVisible({ timeout: 20_000 });
  await sourceText.click();

  const properties = page.locator(".native-unified-properties");
  await expect(properties.getByText("Existing PDF content · P2")).toBeVisible();
  await expect(properties.getByText("Source spans")).toBeVisible();
  await expect(properties.getByText("Detected font")).toBeVisible();
  await expect(properties.getByText(/PDF Studio does not claim byte-for-byte reuse/)).toBeVisible();

  const editor = properties.locator("textarea").first();
  await editor.fill("P2 fidelity edit");
  await expect(properties.getByText(/Complete text fits:|Layout remains stable|Paragraph (?:expands|contracts)/).first()).toBeVisible();
  await properties.getByRole("button", { name: /Apply layout-aware text change/ }).click();
  await expect(page.getByText(/\d+ existing-content edit(?:s)? queued/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
  await expect(page.getByText("Export validated and downloaded")).toBeVisible({ timeout: 20_000 });
});
