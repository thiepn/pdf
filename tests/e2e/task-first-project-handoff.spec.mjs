import { test, expect } from "@playwright/test";
import mupdf from "mupdf";
import { readFile } from "node:fs/promises";

function documentBytes() {
  const document = new mupdf.PDFDocument();
  try {
    for (let page = 0; page < 3; page++) {
      document.insertPage(-1, document.addPage([0, 0, 420, 594], 0, {}, "0.7 g 40 450 150 70 re f"));
    }
    const buffer = document.saveToBuffer({});
    try { return Buffer.from(buffer.asUint8Array()); }
    finally { buffer.destroy(); }
  } finally { document.destroy(); }
}

test("document actions hand a stored PDF into a quick task without confusing its display name with a filename", async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"]').setInputFiles({ name: "Source handoff.pdf", mimeType: "application/pdf", buffer: documentBytes() });
  await expect(page.locator(".editing-toolbar")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".document-identity h1")).toHaveText("Source handoff");
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  await page.getByRole("dialog", { name: "Document actions" }).getByRole("button", { name: /^Extract pages/ }).click();
  await expect(page.getByRole("button", { name: "Page 3", exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".quick-warning")).not.toContainText("saved source PDF");
  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("2");
  await page.getByRole("button", { name: "Extract selected pages", exact: true }).click();
  await expect(page.getByRole("region", { name: "Your files are ready" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const file = await download;
  const result = mupdf.Document.openDocument(await readFile(await file.path()), "application/pdf");
  try { expect(result.countPages()).toBe(1); }
  finally { result.destroy(); }
  await page.screenshot({ path: info.outputPath("13-project-to-task-result.png"), fullPage: true, animations: "disabled" });
});
