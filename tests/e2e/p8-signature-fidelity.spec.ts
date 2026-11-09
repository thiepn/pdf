import { expect, test, type Download, type Page, type TestInfo } from "@playwright/test";
import * as mupdf from "mupdf";
// @ts-ignore Node-only Playwright fixture reader
import { readFileSync } from "node:fs";
import { chooseDocumentTask, chooseEditorTool, downloadEditorCopy, switchMode } from "./helpers/taskFirst";

const corpus = "tests/corpus/p8-signature-qa";
test.setTimeout(45_000);

async function openSignaturePdf(page: Page, signed: boolean) {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true })
    .setInputFiles(`${corpus}/${signed ? "signed" : "unsigned"}.pdf`);
  await expect(page.locator(".viewer-app")).toBeVisible({ timeout: 20_000 });
}
async function openSecurity(page: Page, signed: boolean) {
  await openSignaturePdf(page, signed);
  await chooseDocumentTask(page, "Fill or create PDF forms");
  await expect(page.locator(".security-app")).toBeVisible({ timeout: 20_000 });
}
function inspectExport(path: string) {
  const doc = mupdf.Document.openDocument(new Uint8Array(readFileSync(path)), "application/pdf").asPDF()!;
  try {
    const page = doc.loadPage(0) as mupdf.PDFPage;
    try {
      return page.getWidgets().map((widget) => ({
        name: widget.getName(),
        type: widget.getFieldType(),
        value: String(widget.getValue()),
        signedValuePresent: widget.getFieldType() === "signature" && !widget.getObject().get("V").isNull()
      }));
    } finally { page.destroy(); }
  } finally { doc.destroy(); }
}
async function exportUnsigned(page: Page, info: TestInfo): Promise<ReturnType<typeof inspectExport>> {
  const pending = page.waitForEvent("download", { timeout: 20_000 });
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download: Download = await pending;
  const file = info.outputPath("unsigned-signature-preserved.pdf");
  await download.saveAs(file);
  return inspectExport(file);
}

test("signed Secure source: refuse rewriting and preserve original cryptographic signature", async ({ page }) => {
  await openSecurity(page, true);
  const pending = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null);
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await expect(page.locator(".security-notices .error-banner")).toContainText(/Signed PDF export blocked/i);
  expect(await pending).toBeNull();
});

test("signed Editor source: refuse rewriting and preserve original cryptographic signature", async ({ page }) => {
  await openSignaturePdf(page, true);
  await switchMode(page, "editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({ timeout: 20_000 });
  await chooseEditorTool(page, "Rectangle");
  const rect = await page.locator(".editor-page-layers").boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) return;
  await page.mouse.move(rect.x + 40, rect.y + 40);
  await page.mouse.down();
  await page.mouse.move(rect.x + 120, rect.y + 92, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
  const menu = page.locator(".editor-save-options");
  await menu.locator("summary").click();
  const pending = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null);
  await menu.getByRole("button", { name: "Download copy", exact: true }).click();
  await expect(page.locator(".editor-banner")).toContainText(/Signed PDF export blocked/i);
  expect(await pending).toBeNull();
});

test("unsigned signature field: Secure export preserves interactive signature field and existing values", async ({ page }, info) => {
  await openSecurity(page, false);
  const fields = await exportUnsigned(page, info);
  expect(fields.find((field) => field.name === "QA_Signature")).toEqual({
    name: "QA_Signature", type: "signature", value: "", signedValuePresent: false
  });
  expect(fields.find((field) => field.name === "full_name")?.value).toBe("Ada Lovelace");
  expect(fields.find((field) => field.name === "accepted")?.value).toBe("Yes");
});

test("unsigned signature field: Editor rectangle export keeps signature unsigned and form values intact", async ({ page }, info) => {
  await openSignaturePdf(page, false);
  await switchMode(page, "editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({ timeout: 20_000 });
  await chooseEditorTool(page, "Rectangle");
  const rect = await page.locator(".editor-page-layers").boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) return;
  await page.mouse.move(rect.x + 45, rect.y + 45);
  await page.mouse.down();
  await page.mouse.move(rect.x + 120, rect.y + 95, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
  const downloaded = await downloadEditorCopy(page);
  const file = info.outputPath("editor-unsigned-signature.pdf");
  await downloaded.saveAs(file);
  const fields = inspectExport(file);
  expect(fields.find((field) => field.name === "QA_Signature")?.signedValuePresent).toBe(false);
  expect(fields.find((field) => field.name === "full_name")?.value).toBe("Ada Lovelace");
  expect(fields.find((field) => field.name === "accepted")?.value).toBe("Yes");
});
