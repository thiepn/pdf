import { openSample } from "./helpers/taskFirst";
import { expect, test } from "@playwright/test";

test("global Tools keeps advanced and recovery tasks available without crowding the default catalog", async ({ page }) => {
  await page.goto("./#/tools");
  await expect(page.getByRole("heading", { name: "Find your next PDF tool." })).toBeVisible();

  const advancedDisclosure = page.locator(".product-advanced summary");
  await expect(advancedDisclosure).toBeVisible();
  await expect(page.getByText("Check accessibility", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Batch automation", { exact: true })).not.toBeVisible();

  await advancedDisclosure.click();
  await expect(page.getByText("Check accessibility", { exact: true })).toBeVisible();
  await expect(page.getByText("Batch automation", { exact: true })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Find a PDF tool" });
  await search.fill("archive readiness");
  await expect(page.getByText("Check archive readiness", { exact: true })).toBeVisible();

  await search.fill("repair");
  await expect(page.getByText("Repair PDF", { exact: true })).toBeVisible();

});

test("current-document Tools keeps specialist tasks disclosed and Batch out of everyday related workflows", async ({ page }) => {
  await page.goto("./#/home");
  await openSample(page);
  await expect(page.getByRole("heading", { name: "northstar-launch-review", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Document actions", exact: true });
  const advancedDisclosure = dialog.locator(".product-advanced summary");
  await expect(advancedDisclosure).toBeVisible();
  await expect(dialog.getByText("Insert blank pages", { exact: true })).not.toBeVisible();
  await advancedDisclosure.click();
  await expect(dialog.getByText("Insert blank pages", { exact: true })).toBeVisible();
  const search = dialog.getByRole("searchbox", { name: "Find a PDF tool" });
  await search.fill("repair");
  await expect(dialog.getByText("Repair PDF", { exact: true })).toBeVisible();
});
