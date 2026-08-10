import { expect, test } from "@playwright/test";

test("advanced workspace exposes one unified editor and source content is directly selectable", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: "Legacy native edit", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Unified editor/)).toBeVisible();
  await expect(page.getByLabel("PDF content")).toBeChecked();

  const sourceText = page.getByRole("button", { name: /Select existing text:/ }).first();
  await expect(sourceText).toBeVisible();
  await sourceText.click();
  await expect(page.getByText("Existing PDF content", { exact: true })).toBeVisible();
  await expect(page.getByText(/Safe reconstruction|CJK reconstruction|Appearance only/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Queue text edit|Update queued text edit/ })).toBeVisible();
});

test("legacy native workspace route redirects to the unified editor", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  const id = page.url().match(/workspace\/([^/]+)\/viewer/)?.[1];
  expect(id).toBeTruthy();
  await page.goto(`/#/workspace/${id}/native`);
  await expect(page).toHaveURL(new RegExp(`/workspace/${id}/editor$`));
  await expect(page.getByRole("button", { name: "Text", exact: true })).toBeVisible();
});
