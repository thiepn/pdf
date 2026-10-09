import { test, expect } from "@playwright/test";
import mupdf from "mupdf";

function fixture() {
  const pdf = new mupdf.PDFDocument();
  const font = new mupdf.Font("Helvetica");
  try {
    const embedded = pdf.addSimpleFont(font);
    for (let page = 1; page <= 3; page++) {
      pdf.insertPage(-1, pdf.addPage([0, 0, 420, 594], 0, { Font: { F1: embedded } },
        `BT /F1 18 Tf 40 500 Td (Page ${page}) Tj ET`));
    }
    const output = pdf.saveToBuffer({});
    try { return Buffer.from(output.asUint8Array()); }
    finally { output.destroy(); }
  } finally { pdf.destroy(); font.destroy(); }
}

test("D10 displays live document context and follows real page, zoom and tool state", async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"]').setInputFiles({
    name: "Quarterly report.pdf", mimeType: "application/pdf", buffer: fixture()
  });

  const status = page.getByLabel("Document status bar");
  await expect(status).toBeVisible({ timeout: 30000 });
  await expect(status).toContainText("Quarterly report");
  await expect(status).toContainText("Page 1 of 3");
  await expect(status).toContainText("100%");
  await expect(page.locator(".editor-commandbar .editor-purpose")).toContainText("Quarterly report");

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(status).toContainText("Page 2 of 3");
  await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("1.5");
  await expect(status).toContainText("150%");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await expect(status).toContainText("Add text");
  await expect(page.locator(".editor-stage canvas").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("d10-editor-desktop.png"), animations: "disabled" });
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
});

test("D10 mobile status and panel dock remain available at narrow widths", async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"]').setInputFiles({
    name: "Mobile document.pdf", mimeType: "application/pdf", buffer: fixture()
  });
  const status = page.getByLabel("Document status bar");
  await expect(status).toBeVisible({ timeout: 30000 });
  await expect(status).toContainText("Page 1 of 3");
  await expect(page.getByRole("navigation", { name: "Editor panel shortcuts" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("d10-editor-mobile.png"), animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.screenshot({ path: testInfo.outputPath("d10-editor-dark-mobile.png"), animations: "disabled" });
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
});
