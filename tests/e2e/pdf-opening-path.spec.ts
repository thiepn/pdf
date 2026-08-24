import { expect, test } from "@playwright/test";

const generatedCorpus = "tests/corpus/generated";
const phase28Corpus = "tests/corpus/phase28";

test("opens metadata PDF, imports a second PDF, and reopens persisted projects", async ({ page }) => {
  test.setTimeout(60_000);
  const uncaught: string[] = [];
  page.on("pageerror", (error) => uncaught.push(error.message));

  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${phase28Corpus}/unicode-metadata.pdf`);
  await expect(page.getByText("UNICODE_METADATA_MARKER", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Info", exact: true }).click();
  const fileInfo = page.locator(".info-list").filter({ hasText: "unicode-metadata.pdf" });
  await expect(fileInfo).toBeVisible();
  await expect(fileInfo).toContainText("unicode-metadata.pdf");
  const metadataProjectUrl = page.url();

  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${generatedCorpus}/plain-text.pdf`);
  await expect(page.getByText("PLAIN_PAGE_1_MARKER", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".page-input")).toContainText("/ 3");
  expect(page.url()).not.toBe(metadataProjectUrl);

  await page.goto("./#/projects");
  await expect(page.locator(".project-card")).toHaveCount(2);
  const metadataProject = page.locator(".project-card").filter({ hasText: "unicode-metadata" });
  await metadataProject.getByRole("link", { name: "Open workspace" }).click();
  await expect(page).toHaveURL(metadataProjectUrl);
  await expect(page.getByText("UNICODE_METADATA_MARKER", { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page).toHaveURL(metadataProjectUrl);
  await expect(page.getByText("UNICODE_METADATA_MARKER", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(uncaught).toEqual([]);
});
