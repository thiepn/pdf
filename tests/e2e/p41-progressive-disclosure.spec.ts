import { expect, test } from "@playwright/test";

test("technical diagnostics are disclosed only when requested", async ({ page }) => {
  await page.goto("./#/diagnostics");
  await expect(page.getByRole("link", { name: "System", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Performance", exact: true })).toBeVisible();
  const technical = page.locator("details.diagnostic-technical-disclosure");
  await expect(technical).not.toHaveAttribute("open", "");
  await expect(technical.getByRole("link", { name: "PDF.js", exact: true })).toBeHidden();
  await technical.locator("summary").click();
  await expect(technical.getByRole("link", { name: "PDF.js", exact: true })).toBeVisible();
  await expect(technical.getByRole("link", { name: "MuPDF", exact: true })).toBeVisible();
  const browserDetails = page.locator("details").filter({ hasText: "Technical browser details" });
  await expect(browserDetails).not.toHaveAttribute("open", "");
});

test("global Tools uses consumer cleanup language", async ({ page }) => {
  await page.goto("./#/tools");
  await expect(page.getByText("Clean up PDF", { exact: true })).toBeVisible();
  await expect(page.getByText("Sanitize PDF", { exact: true })).toHaveCount(0);
});
