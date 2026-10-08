import { test, expect } from "@playwright/test";
import mupdf from "mupdf";

function pdfFixture() {
  const pdf = new mupdf.PDFDocument();
  const font = new mupdf.Font("Helvetica");
  try {
    const embedded = pdf.addSimpleFont(font);
    pdf.insertPage(-1, pdf.addPage([0, 0, 420, 594], 0, { Font: { F1: embedded } },
      "BT /F1 20 Tf 40 500 Td (Visual consistency source) Tj ET"));
    const buffer = pdf.saveToBuffer({});
    try { return Buffer.from(buffer.asUint8Array()); }
    finally { buffer.destroy(); }
  } finally { pdf.destroy(); font.destroy(); }
}

async function metrics(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { radius: style.borderTopLeftRadius, border: style.borderTopColor, bg: style.backgroundColor };
  });
}

async function noHorizontalOverflow(page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

test("D11 Home and Tool Library share readable cards, responsive chrome and spacing", async ({ page }, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./#/home");
  const home = page.locator(".product-home--workspace");
  await expect(home).toBeVisible();
  const homeCard = home.locator(".product-tool-card:not(.product-tool-card--blocked)").first();
  await expect(homeCard).toBeVisible();
  const h = await metrics(homeCard);
  await expect(page.locator(".product-header")).toBeVisible();
  await page.screenshot({ path: info.outputPath("d11-home-desktop-light.png"), animations: "disabled" });

  await page.goto("./#/tools");
  const directory = page.locator(".product-directory--library");
  await expect(directory).toBeVisible();
  const directoryCard = directory.locator(".product-tool-card:not(.product-tool-card--blocked)").first();
  await expect(directoryCard).toBeVisible();
  const d = await metrics(directoryCard);
  expect(d.radius).toBe(h.radius);
  expect(d.border).toBe(h.border);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath("d11-tools-desktop-light.png"), animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath("d11-tools-mobile-light.png"), animations: "disabled" });

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const glyph = directoryCard.locator(".task-glyph");
  const darkBg = await glyph.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  const lightBg = await glyph.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(darkBg).not.toBe(lightBg);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath("d11-tools-mobile-dark.png"), animations: "disabled" });
});

test("D11 Quick Tools and Editor retain real workflows with consistent chrome", async ({ page }, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./#/quick/rotate-pdf");
  const quick = page.locator('[data-d5-quick="true"]');
  await expect(quick).toBeVisible();
  await expect(quick.locator(".task-dropzone")).toBeVisible();
  await page.screenshot({ path: info.outputPath("d11-quick-upload.png"), animations: "disabled" });
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"]').setInputFiles({
    name: "D11 review.pdf", mimeType: "application/pdf", buffer: pdfFixture()
  });
  const editor = page.locator('.editor-app[data-d3-editor="true"][data-d10-status="true"]');
  await expect(editor).toBeVisible({ timeout: 30000 });
  await expect(editor.locator(".editor-stage canvas").first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel("Document status bar")).toContainText("D11 review.pdf");
  await page.screenshot({ path: info.outputPath("d11-editor-desktop-light.png"), animations: "disabled" });
  await noHorizontalOverflow(page);
});
