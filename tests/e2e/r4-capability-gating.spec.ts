import { expect, test } from "@playwright/test";

const generatedCorpus = "tests/corpus/generated";

test("global task discovery exposes material capability boundaries before file selection", async ({ page }) => {
  await page.goto("./#/tools");
  await expect(page.getByRole("heading", { name: /What do you want to do\?/i })).toBeVisible();

  const archive = page.getByRole("button", { name: /Check archive readiness/i });
  await expect(archive).toContainText("Experimental");
  await expect(archive).toContainText(/does not provide certified PDF\/A conformance/i);

  const signature = page.getByRole("button", { name: /Add visual signature/i });
  await expect(signature).toContainText("Review first");
  await expect(signature).toContainText(/not a certificate-backed digital signature/i);
});

test("current-document task browser disables known unsupported work before execution", async ({ page }) => {
  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${generatedCorpus}/annotations.pdf`);
  await expect(page.getByText("ANNOTATION_TARGET_TEXT", { exact: true })).toBeVisible({ timeout: 20_000 });

  const navigation = page.getByRole("navigation", { name: "Document workspace" });
  await navigation.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByRole("heading", { name: /What do you want to do\?/i })).toBeVisible();

  const split = page.getByRole("button", { name: /Split PDF/i });
  await expect(split).toBeDisabled();
  await expect(split).toContainText(/Not available for this PDF/i);

  const forms = page.getByRole("button", { name: /Fill PDF forms/i });
  await expect(forms).toBeDisabled();
  await expect(forms).toContainText(/No supported interactive form fields/i);
});

test("task-specific direct URLs and Ctrl+K cannot bypass document capability preflight", async ({ page }) => {
  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${generatedCorpus}/annotations.pdf`);
  await expect(page.getByText("ANNOTATION_TARGET_TEXT", { exact: true })).toBeVisible({ timeout: 20_000 });

  const match = page.url().match(/\/workspace\/([^/]+)\/viewer/);
  expect(match?.[1]).toBeTruthy();
  const projectId = decodeURIComponent(match?.[1] ?? "");

  await page.goto(`./#/workspace/${encodeURIComponent(projectId)}/secure/fill-forms`);
  await expect(page.getByRole("heading", { name: /Fill PDF forms cannot start for this document/i })).toBeVisible();
  await expect(page.getByText(/No supported interactive form fields were detected/i)).toBeVisible();

  await page.goto(`./#/workspace/${encodeURIComponent(projectId)}/viewer`);
  await expect(page.getByRole("navigation", { name: "Document workspace" })).toBeVisible();
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: /Find a PDF task/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Search PDF tasks" }).fill("fill pdf forms");
  await dialog.getByRole("link", { name: /Fill PDF forms/i }).click();
  await expect(page).toHaveURL(/\/secure\/fill-forms$/);
  await expect(page.getByRole("heading", { name: /Fill PDF forms cannot start for this document/i })).toBeVisible();

  await page.goto(`./#/workspace/${encodeURIComponent(projectId)}/secure/apply-redactions`);
  await expect(page.getByRole("heading", { name: /Apply permanent redactions cannot start for this document/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/No saved editor redaction marks or existing PDF redaction annotations/i)).toBeVisible();
});

test("a document that satisfies preflight keeps the task available", async ({ page }) => {
  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${generatedCorpus}/forms.pdf`);
  await expect(page.getByText("FORM_FIXTURE", { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("navigation", { name: "Document workspace" }).getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByRole("link", { name: /Fill PDF forms/i })).toBeVisible();
});
