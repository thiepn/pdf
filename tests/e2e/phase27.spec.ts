import { expect, test } from "@playwright/test";

test("Phase 27 release page exposes real-build qualification boundaries", async ({ page }) => {
  await page.goto("./#/release");
  await expect(page.getByRole("heading", { name: /PDF Studio 6.1.0/i })).toBeVisible();
  await expect(page.getByText("Release candidate", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What you can rely on" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No document-upload endpoint" })).toBeVisible();
});
