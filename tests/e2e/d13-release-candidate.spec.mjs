import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import mupdf from "mupdf";

function samplePdf() {
  const pdf = new mupdf.PDFDocument();
  const font = new mupdf.Font("Helvetica");
  try {
    const embedded = pdf.addSimpleFont(font);
    for (let i = 1; i <= 2; i++) {
      pdf.insertPage(-1, pdf.addPage([0, 0, 420, 594], 0, { Font: { F1: embedded } },
        `BT /F1 18 Tf 32 500 Td (D13 release candidate page ${i}) Tj ET`));
    }
    const output = pdf.saveToBuffer({});
    try { return Buffer.from(output.asUint8Array()); }
    finally { output.destroy(); }
  } finally { pdf.destroy(); font.destroy(); }
}

async function noOverflow(page) {
  const sizes = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
}

test.setTimeout(90_000);

test("D13 real two-page PDF opens, edits UI state, downloads and reopens independently", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: "Start with a file" })).toBeVisible();
  await page.goto("./#/tools");
  await expect(page.getByRole("searchbox", { name: "Find a PDF tool" })).toBeVisible();
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"]').setInputFiles({
    name: "D13 release candidate.pdf", mimeType: "application/pdf", buffer: samplePdf()
  });
  const status = page.getByLabel("Document status bar");
  await expect(status).toBeVisible({ timeout: 40000 });
  await expect(status).toContainText("D13 release candidate.pdf");
  await expect(status).toContainText("Page 1 of 2");
  await expect(page.getByRole("region", { name: "PDF page canvas" })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(status).toContainText("Page 2 of 2");
  await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("1.25");
  await expect(status).toContainText("125%");
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("d13-editor-desktop.png"), animations: "disabled" });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await pending;
  const bytes = await readFile(await download.path());
  const reopened = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    expect(reopened.countPages()).toBe(2);
    const first = reopened.loadPage(0);
    const text = first.toStructuredText();
    try { expect(text.asText()).toContain("D13 release candidate page 1"); }
    finally { text.destroy(); first.destroy(); }
  } finally { reopened.destroy(); }
});

test("D13 narrow PDF workspace retains canvas, status and reachable panel controls", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"]').setInputFiles({
    name: "D13 mobile.pdf", mimeType: "application/pdf", buffer: samplePdf()
  });
  const status = page.getByLabel("Document status bar");
  await expect(status).toBeVisible({ timeout: 40000 });
  await expect(status).toContainText("Page 1 of 2");
  await expect(page.getByRole("region", { name: "PDF page canvas" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Editor panel shortcuts" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("d13-editor-mobile-light.png"), animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("d13-editor-mobile-dark.png"), animations: "disabled" });
});
