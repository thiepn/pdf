import { expect, test } from "@playwright/test";

test("global Tools keeps advanced and recovery tasks available without crowding the default catalog", async ({ page }) => {
  await page.goto("./#/tools");
  await expect(page.getByRole("heading", { name: "Choose what you want to do" })).toBeVisible();

  const advancedDisclosure = page.getByText("Advanced & specialist tools", { exact: true });
  await expect(advancedDisclosure).toBeVisible();
  await expect(page.getByText("Check accessibility", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Batch automation", { exact: true })).not.toBeVisible();

  await advancedDisclosure.click();
  await expect(page.getByText("Check accessibility", { exact: true })).toBeVisible();
  await expect(page.getByText("Batch automation", { exact: true })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search PDF tasks" });
  await search.fill("archive readiness");
  await expect(page.getByText("Check archive readiness", { exact: true })).toBeVisible();

  await search.fill("repair");
  await expect(page.getByText("Repair PDF", { exact: true })).toBeVisible();
  await expect(page.getByText("Troubleshooting", { exact: true })).toBeVisible();
});

test("current-document Tools keeps specialist tasks disclosed and Batch out of everyday related workflows", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page.getByRole("heading", { name: "pdf-studio-welcome", exact: true })).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "Document workspace" });
  await navigation.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What do you want to do?" })).toBeVisible();

  const advancedDisclosure = page.getByText("Advanced & specialist tools", { exact: true });
  await expect(advancedDisclosure).toBeVisible();
  await expect(page.getByText("Insert blank pages", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Batch automation", { exact: true })).toHaveCount(0);

  await advancedDisclosure.click();
  await expect(page.getByText("Insert blank pages", { exact: true })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search current PDF tasks" });
  await search.fill("repair");
  await expect(page.getByText("Repair PDF", { exact: true })).toBeVisible();
});
