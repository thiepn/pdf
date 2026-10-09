import { expect, test, type Page } from "@playwright/test";
import { createShowcasePdf } from "../../src/fixtures/showcasePdf";

test.setTimeout(90_000);
async function openPDF(page: Page) {
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles({
    name: "D12 visual review.pdf",
    mimeType: "application/pdf",
    buffer: (globalThis as any).Buffer.from(createShowcasePdf())
  });
  const editor = page.locator('.editor-app[data-d3-editor="true"]');
  await expect(editor.getByRole("region", { name: "PDF page canvas" })).toBeVisible({ timeout: 45_000 });
  return editor;
}
async function noDocumentOverflow(page: Page) {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

for (const width of [820, 834, 1024]) {
  test(`D12 tablet ${width}px tools scroll without overlapping actions`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const editor = await openPDF(page);
    const toolbar = editor.locator(".editing-toolbar:not(.compact-editor-bar)");
    const primary = toolbar.locator(".editing-toolbar__primary");
    const more = toolbar.getByRole("button", { name: "More tools" });
    await expect(primary).toBeVisible();
    await expect(more).toBeVisible();
    const dims = await page.evaluate(() => {
      const row = document.querySelector('.editor-app[data-d3-editor="true"] .editing-toolbar:not(.compact-editor-bar)')!;
      const primary = row.querySelector(".editing-toolbar__primary")!;
      const more = row.querySelector(".editing-toolbar__more")!;
      const rect = primary.getBoundingClientRect();
      return {
        right: rect.right,
        moreLeft: more.getBoundingClientRect().left,
        overflowX: getComputedStyle(primary).overflowX,
        visibleWidth: rect.width,
        buttons: [...primary.querySelectorAll("button")].map((button) => ({
          width: button.clientWidth,
          scroll: button.scrollWidth
        }))
      };
    });
    expect(dims.right).toBeLessThanOrEqual(dims.moreLeft + 1);
    expect(dims.overflowX).toBe("auto");
    expect(dims.visibleWidth).toBeGreaterThan(120);
    expect(dims.buttons.every(({ width, scroll }) => scroll <= width + 2)).toBe(true);
    await noDocumentOverflow(page);
    await page.screenshot({ path: info.outputPath(`d12-editor-tablet-${width}.png`), animations: "disabled" });
    await more.click();
    await expect(editor.getByRole("dialog", { name: "Editor tools" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor.getByRole("dialog", { name: "Editor tools" })).toHaveCount(0);
  });
}

test("D12 desktop recommends tools without consuming the working canvas", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  const editor = await openPDF(page);
  const entry = page.locator(".document-entry-overlay");
  await expect(entry).toBeVisible({ timeout: 30_000 });
  const dimensions = await entry.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    scrollHeight: node.scrollHeight,
    overflowY: getComputedStyle(node).overflowY,
  }));
  expect(dimensions.height).toBeLessThanOrEqual(169);
  expect(dimensions.overflowY).toBe("auto");
  await expect(editor.getByRole("region", { name: "PDF page canvas" })).toBeVisible();
  const stage = await editor.locator(".editor-stage").boundingBox();
  expect(stage?.height).toBeGreaterThan(300);
  await noDocumentOverflow(page);
  await page.screenshot({ path: info.outputPath("d12-editor-desktop-light.png"), animations: "disabled" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.screenshot({ path: info.outputPath("d12-editor-desktop-dark.png"), animations: "disabled" });
});

test("D12 compact editor retains readable canvas, save status and touch dock", async ({ page }, info) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const editor = await openPDF(page);
    await expect(editor.getByRole("region", { name: "PDF page canvas" })).toBeVisible();
    await expect(editor.getByLabel("Document status bar")).toBeVisible();
    const dock = editor.getByRole("navigation", { name: "Editor panel shortcuts" });
    await expect(dock).toBeVisible();
    await noDocumentOverflow(page);
    await page.screenshot({ path: info.outputPath(`d12-editor-mobile-${width}.png`), animations: "disabled" });
    await dock.getByRole("button", { name: "Layers panel" }).click();
    await expect(editor.locator(".editor-left-panel")).toBeVisible();
    await page.screenshot({ path: info.outputPath(`d12-editor-layers-${width}.png`), animations: "disabled" });
    await noDocumentOverflow(page);
  }
});
