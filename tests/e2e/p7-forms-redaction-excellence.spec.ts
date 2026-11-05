import { expect, test } from "@playwright/test";
import mupdf from "mupdf";
import { readFile } from "node:fs/promises";
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
  await page.getByText("Check details", { exact: true }).click();
  await expect(page.getByText("Created form fields", { exact: true })).toBeVisible();
  await expect(page.getByText("2 requested interactive fields reopened successfully.", { exact: true })).toBeVisible();
});

test("P7 finds text for redaction, requires review, then proves permanent removal", async ({ page }) => {
  await openCorpus(page, "tests/corpus/generated/redaction-source.pdf");
  const project = page.url().match(new RegExp("/workspace/([^/]+)/viewer"));
  expect(project).not.toBeNull();
  await chooseDocumentTask(page, "Find & apply permanent redactions");
  // Applying unmarked redactions must remain fail-closed. Discovery itself is
  // available from the separate Document safety overview, where candidates
  // are reviewable and never removed until marked and explicitly exported.
  await expect(page.locator(".task-capability-blocker")).toContainText("No saved editor redaction marks");
  await expect(page.getByText("This task did not start. Your PDF is unchanged.", { exact: true })).toBeVisible();
  await page.goto(`./#/workspace/${project![1]}/secure`);
  await expect(page.locator(".security-app")).toBeVisible({ timeout: 20_000 });
  await page.getByText("Related document settings", { exact: true }).click();
  await page.getByLabel("Settings to show").selectOption("redaction");
  await expect(page.getByRole("heading", { name: "Permanent redaction" })).toBeVisible();

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
  const saved = await download;
  const reopened = new mupdf.PDFDocument(new Uint8Array(await readFile(await saved.path())));
  try {
    const first = reopened.loadPage(0);
    try {
      const extracted = first.toStructuredText();
      try { expect(extracted.asText()).not.toContain("SECRET_ALPHA_491"); }
      finally { extracted.destroy(); }
      expect(first.getAnnotations().some((annotation: any) => ["Redact", "Redaction"].includes(String(annotation.getType())))).toBe(false);
    } finally { first.destroy(); }
  } finally { reopened.destroy(); }
  await expect(page.locator(".security-validation-summary.passed")).toBeAttached();
  await page.getByText("Output verified · view checks", { exact: true }).click();
  await page.getByText("Check details", { exact: true }).click();
  await expect(page.getByText("Redacted text extraction", { exact: true })).toBeVisible();
});
