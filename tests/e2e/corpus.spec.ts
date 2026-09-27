import { expect, test } from "@playwright/test";
const corpus = "tests/corpus/generated";

async function uploadPdf(page: import("@playwright/test").Page, filename: string): Promise<void> {
  await page.goto("./#/tools/read-pdf");
  const input = page.locator('input[type="file"][accept*="pdf"]').first();
  await input.setInputFiles(`${corpus}/${filename}`);
}

test("opens deterministic text fixture and preserves page count", async ({ page }) => {
  await uploadPdf(page, "plain-text.pdf");
  await expect(page.getByText("PLAIN_PAGE_1_MARKER", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".page-input")).toContainText("/ 3");
});

test("authenticates and opens AES-256 fixture without persisting the password", async ({ page }) => {
  await uploadPdf(page, "encrypted-aes256.pdf");
  await expect(page.getByRole("heading", { name: "This PDF needs a password" })).toBeVisible();
  await page.getByLabel("PDF password", { exact: true }).fill("phase11-user");
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(page.getByText("ENCRYPTED_FIXTURE", { exact: true })).toBeVisible({ timeout: 20_000 });
  const serializedStorage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(serializedStorage).not.toContain("phase11-user");
});

test("opens the 200-page fixture without eager page navigation", async ({ page }) => {
  test.setTimeout(45_000);
  await uploadPdf(page, "large-200-pages.pdf");
  await expect(page.getByText("LARGE_DOCUMENT_PAGE_0001", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".page-input")).toContainText("/ 200");
});
