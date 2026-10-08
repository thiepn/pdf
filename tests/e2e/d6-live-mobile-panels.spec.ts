import { expect, test } from "@playwright/test";
import { createShowcasePdf } from "../../src/fixtures/showcasePdf";

test.setTimeout(90_000);
async function openEditor(page: import("@playwright/test").Page) {
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles({
    name: "d6-mobile.pdf", mimeType: "application/pdf",
    buffer: (globalThis as any).Buffer.from(createShowcasePdf())
  });
  const editor = page.locator('.editor-app[data-d3-editor="true"]');
  await expect(editor).toBeVisible({ timeout: 35_000 });
  return editor;
}

test("D6 phone dock opens real Pages, Layers and Properties without competing overlays", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = await openEditor(page);
  const nav = editor.getByRole("navigation", { name: "Editor panel shortcuts" });
  await expect(nav).toBeVisible();
  const pages = nav.getByRole("button", { name: "Pages panel" });
  const layers = nav.getByRole("button", { name: "Layers panel" });
  const properties = nav.getByRole("button", { name: "Properties panel" });
  await pages.click();
  await expect(pages).toHaveAttribute("aria-pressed", "true");
  await expect(editor.locator(".editor-left-panel")).toBeVisible();
  await layers.click();
  await expect(layers).toHaveAttribute("aria-pressed", "true");
  await expect(editor.getByRole("combobox", { name: "Sidebar content" })).toHaveValue("layers");
  await properties.click();
  await expect(properties).toHaveAttribute("aria-pressed", "true");
  await expect(editor.locator(".editor-left-panel")).toHaveCount(0);
  await expect(editor.locator(".editor-properties")).toBeVisible();
  await properties.click();
  await expect(editor.locator(".editor-properties")).toHaveCount(0);
  await expect(editor.getByRole("region", { name: "PDF page canvas" })).toBeVisible();
  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(bodyWidth).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("d6-real-phone.png"), animations: "disabled" });
});

test("D6 tablet retains full document canvas without duplicate phone navigation", async ({ page }, info) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  const editor = await openEditor(page);
  await expect(editor.locator(".d6-live-editor-dock")).toHaveCount(0);
  await expect(editor.getByRole("region", { name: "PDF page canvas" })).toBeVisible();
  const width = await editor.getByRole("region", { name: "PDF page canvas" }).evaluate((node) => node.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(300);
  await page.screenshot({ path: info.outputPath("d6-real-tablet.png"), animations: "disabled" });
});

test("D6 forced-colors and reduced-motion keep phone dock functional", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const editor = await openEditor(page);
  const dock = editor.getByRole("navigation", { name: "Editor panel shortcuts" });
  const button = dock.getByRole("button", { name: "Layers panel" });
  await expect(button).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.focus();
  await expect(button).toBeFocused();
});
