import { expect, test } from "@playwright/test";
import { createShowcasePdf } from "../../src/fixtures/showcasePdf";

test.setTimeout(90_000);
async function openRealEditor(page: import("@playwright/test").Page) {
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles({
    name: "d3-qualification.pdf",
    mimeType: "application/pdf",
    buffer: (globalThis as any).Buffer.from(createShowcasePdf())
  });
  const editor = page.locator('.editor-app[data-d3-editor="true"]');
  await expect(editor).toBeVisible({ timeout: 45_000 });
  await expect(editor.getByRole("region", { name: "PDF page canvas" })).toBeVisible();
  return editor;
}

test("D3 real editor keeps the document, tool actions and page controls functional", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  const editor = await openRealEditor(page);
  await expect(editor.locator(".editor-commandbar")).toBeVisible();
  const toolbar = editor.getByRole("navigation", { name: "Editing tools" });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Add text", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Add text", exact: true })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Select", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
  const zoom = editor.getByRole("combobox", { name: "Zoom" });
  await zoom.selectOption("1.25");
  await expect(zoom).toHaveValue("1.25");
  await expect(editor.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath("d3-integrated-desktop.png"), animations: "disabled", fullPage: true });
});

test("D3 narrow view retains visible canvas and accessible tools dialog", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = await openRealEditor(page);
  await expect(editor.getByRole("navigation", { name: "Editing tools" })).toBeVisible();
  await editor.getByRole("button", { name: "More tools", exact: true }).click();
  const dialog = editor.getByRole("dialog", { name: "Editor tools" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add text", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("d3-integrated-phone-tools.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(editor.getByRole("region", { name: "PDF page canvas" })).toBeVisible();
  const bounds = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.viewport + 1);
});

test("D3 tablet layout preserves PDF editing stage without overlapping sidebars", async ({ page }, info) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  const editor = await openRealEditor(page);
  const stage = editor.getByRole("region", { name: "PDF page canvas" });
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("d3-integrated-tablet.png"), animations: "disabled" });
});
