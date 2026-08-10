import { expect, test } from "@playwright/test";

test("Phase 27 release page exposes real-build qualification boundaries", async ({ page }) => {
  await page.goto("./#/release");
  await expect(page.getByRole("heading", { name: /PDF Studio 5.8.0-phase28/i })).toBeVisible();
  await expect(page.getByText(/Real build & CI qualification/i)).toBeVisible();
  await expect(page.getByText(/exact npm lockfile/i)).toBeVisible();
  await expect(page.getByText(/verified dist artifact/i)).toBeVisible();
});
