import { expect, test } from "@playwright/test";

test("Phase 12 opens the sample inside one unified multi-mode workspace", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await expect(page.getByRole("tab", { name: /pdf-studio-welcome/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simple" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preservation" })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: /Text/ })).toBeVisible();

  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByRole("button", { name: "Professional" })).toBeVisible();
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History & checkpoints" })).toBeVisible();
});

test("legacy document routes remain compatible", async ({ page }) => {
  await page.goto("./#/editor/missing-project");
  await expect(page.locator("body")).toContainText(/Workspace unavailable|Project not found/i);
});
