import { expect, test } from "@playwright/test";

test("advanced workspace exposes one unified editor and source content is directly selectable", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: "Legacy native edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /pdf-studio-welcome Edit/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("checkbox", { name: "PDF content", exact: true })).toBeChecked();

  const sourceText = page.getByRole("button", { name: /Select existing (?:text|paragraph):/ }).first();
  await expect(sourceText).toBeVisible({ timeout: 20_000 });
  await sourceText.click();
  await expect(page.getByText("Existing PDF content", { exact: true })).toBeVisible();
  await expect(page.getByText(/Directly editable|Editable with reconstruction|Limited editing/).first()).toBeVisible();
  await expect(page.locator(".native-unified-properties").locator("textarea").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply (?:text|paragraph) change|Update (?:text|paragraph) change/ })).toBeVisible();
});

test("legacy native workspace route redirects to the unified editor", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  const id = page.url().match(/workspace\/([^/]+)\/viewer/)?.[1];
  expect(id).toBeTruthy();
  await page.goto(`./#/workspace/${id}/native`);
  await expect(page).toHaveURL(new RegExp(`/workspace/${id}/editor$`));
  await expect(page.getByRole("button", { name: /Text$/ })).toBeVisible();
});
