import { expect, test } from "@playwright/test";
import { chooseDocumentTask } from "./helpers/taskFirst";

async function openCorpus(page: import("@playwright/test").Page, file: string) {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(file);
  await expect(page.locator(".viewer-app")).toBeVisible({ timeout: 20_000 });
}

test("P7 authors interactive text and checkbox fields and verifies them after secure export", async ({ page }) => {
  await openCorpus(page, "tests/corpus/generated/plain-text.pdf");
  await chooseDocumentTask(page, "Fill or create PDF forms");
  await expect(page.locator(".security-app")).toBeVisible();

  await page.getByRole("button", { name: "+ Text field", exact: true }).click();
  const draft = page.locator(".p7-form-draft").first();
  await expect(draft).toBeVisible();
  await draft.getByLabel("Field name").fill("p7_review_name");
  await draft.getByLabel("Label").fill("Review name");
  await page.getByRole("button", { name: "+ Checkbox", exact: true }).click();
  const checkbox = page.locator(".p7-form-draft").nth(1);
  await expect(checkbox).toBeVisible();
  await checkbox.getByLabel("Field name").fill("p7_confirmed");
  await checkbox.getByLabel("Label").fill("Confirmed");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toMatch(/secured\.pdf$/i);
  await expect(page.locator(".security-validation-summary.passed")).toBeAttached();
  await page.getByText("Output verified · view checks", { exact: true }).click();
  await expect(page.getByText("Created form fields", { exact: true })).toBeVisible();
  await expect(page.getByText("2 requested interactive fields reopened successfully.", { exact: true })).toBeVisible();
});

test("P7 finds text for redaction, requires review, then proves permanent removal", async ({ page }) => {
  await openCorpus(page, "tests/corpus/generated/redaction-source.pdf");
  await chooseDocumentTask(page, "Find & apply permanent redactions");
  await expect(page.locator(".security-app")).toBeVisible();

  await page.getByLabel("Text", { exact: true }).fill("SECRET_ALPHA_491");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator(".p7-redaction-candidate")).toHaveCount(1);
  await expect(page.getByText("SEC…491", { exact: true })).toBeVisible();
  await page.locator(".p7-redaction-candidate").getByRole("button", { name: "View", exact: true }).click();
  await expect(page.locator(".security-redaction-candidate-preview")).toBeVisible();
  await page.getByRole("button", { name: "Mark 1 selected for redaction", exact: true }).click();
  await expect(page.locator(".security-redaction-candidate-preview")).toHaveCount(0);
  await expect(page.locator(".security-redaction-preview")).toHaveCount(1);
  await expect(page.getByText(/1 redaction mark added/)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await download;
  await expect(page.locator(".security-validation-summary.passed")).toBeAttached();
  await page.getByText("Output verified · view checks", { exact: true }).click();
  await expect(page.getByText("Redacted text extraction", { exact: true })).toBeVisible();
});
