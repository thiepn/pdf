import { expect, test } from "@playwright/test";

test("workspace opens the sample with four stable document destinations", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await expect(page.getByRole("tab", { name: /pdf-studio-welcome/i })).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "Document workspace" });
  for (const destination of ["Read", "Edit", "Pages", "Tools"]) {
    await expect(navigation.getByRole("button", { name: destination, exact: true })).toBeVisible();
  }

  await navigation.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: /Text/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History & checkpoints" })).toBeVisible();
  await page.getByRole("button", { name: "History" }).click();

  await navigation.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page).toHaveURL(/\/toolbox$/);
  await expect(page.getByRole("heading", { name: /What do you want to do\?/i })).toBeVisible();
});

test("legacy document routes remain compatible", async ({ page }) => {
  await page.goto("./#/editor/missing-project");
  await expect(page.locator("body")).toContainText(/Workspace unavailable|Project not found/i);
});
