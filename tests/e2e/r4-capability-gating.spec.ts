import { expect, test, type Page } from "@playwright/test";
import { chooseDocumentTask } from "./helpers/taskFirst";
const corpus = "tests/corpus/generated";
async function open(page: Page, filename: string, marker: string) {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(`${corpus}/${filename}`);
  await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 20_000 });
  return page.url().match(/\/workspace\/([^/]+)\/viewer/)![1];
}
test("global task discovery exposes material capability boundaries before file selection", async ({ page }) => {
  await page.goto("./#/tools");
  await page.locator(".product-advanced summary").click();
  const archive = page.getByRole("link", { name: /Check archive readiness/ });
  await expect(archive).toContainText("Experimental");
  await expect(archive).toContainText(/does not provide certified PDF\/A conformance/i);
  const signature = page.getByRole("link", { name: /Add visual signature/ });
  await expect(signature).toContainText("Review first");
  await expect(signature).toContainText(/not a certificate-backed digital signature/i);
});
test("a flat PDF offers ordinary text placement rather than a dead end", async ({ page }) => {
  await open(page, "annotations.pdf", "ANNOTATION_TARGET_TEXT");
  await chooseDocumentTask(page, "Fill PDF forms");
  await expect(page.getByRole("link", { name: "Fill with text in the editor" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Fill with text in the editor" }).click();
  await expect(page.getByRole("button", { name: "Add text", exact: true })).toBeVisible();
});
test("direct URLs and command search preserve the form fallback and permanent-redaction safeguards", async ({ page }) => {
  const projectId = await open(page, "annotations.pdf", "ANNOTATION_TARGET_TEXT");
  await page.goto(`./#/workspace/${projectId}/secure/fill-forms`);
  await expect(page.getByRole("link", { name: "Fill with text in the editor" })).toBeVisible({ timeout: 20_000 });
  await page.goto(`./#/workspace/${projectId}/viewer`);
  await expect(page.locator(".viewer-app")).toBeVisible();
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: /Find a PDF task/ });
  await dialog.getByRole("textbox", { name: "Search PDF tasks" }).fill("fill pdf forms");
  await dialog.getByRole("link", { name: /Fill PDF forms/ }).click();
  await expect(page.getByRole("link", { name: "Fill with text in the editor" })).toBeVisible({ timeout: 20_000 });
  await page.goto(`./#/workspace/${projectId}/secure/apply-redactions`);
  const blocker = page.locator(".task-capability-blocker");
  await expect(blocker.getByRole("heading", { name: /Apply permanent redactions cannot start/ })).toBeVisible({ timeout: 20_000 });
  await expect(blocker.getByText("Why", { exact: true })).toBeVisible();
  await expect(blocker.locator(".task-capability-explanation").first().locator("p")).not.toHaveText("");
  await expect(blocker.getByText("This task did not start. Your PDF is unchanged.", { exact: true })).toBeVisible();
});
test("a writable PDF form opens the actual filling surface", async ({ page }) => {
  await open(page, "forms.pdf", "FORM_FIXTURE");
  await chooseDocumentTask(page, "Fill PDF forms");
  await expect(page.locator(".security-form-list")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".security-form-list input").first()).toBeEditable();
});
