import { expect, test } from "@playwright/test";

const expectedReleaseStatus = process.env.VITE_RELEASE_CHANNEL === "stable" ? "Stable" : "Release candidate";

test("Phase 27 release page exposes real-build qualification boundaries", async ({ page }) => {
  await page.goto("./#/release");
  await expect(page.getByRole("heading", { name: /PDF Studio 7.0.0/i })).toBeVisible();
  await expect(page.getByText(expectedReleaseStatus, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What you can rely on" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No document-upload endpoint" })).toBeVisible();
});
