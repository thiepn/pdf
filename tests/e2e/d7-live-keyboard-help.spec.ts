import { expect, test } from "@playwright/test";
import { createShowcasePdf } from "../../src/fixtures/showcasePdf";

test.setTimeout(90_000);
async function realEditor(page: import("@playwright/test").Page) {
  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles({
    name: "d7-focus.pdf", mimeType: "application/pdf",
    buffer: (globalThis as any).Buffer.from(createShowcasePdf())
  });
  const editor = page.locator('.editor-app[data-d7-polish="true"]');
  await expect(editor).toBeVisible({ timeout: 40_000 });
  return editor;
}

test("D7 actual editor help traps focus, suppresses tool shortcuts, and restores focus", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const editor = await realEditor(page);
  const toolbar = editor.getByRole("navigation", { name: "Editing tools" });
  const selection = toolbar.getByRole("button", { name: "Select", exact: true });
  await expect(selection).toHaveAttribute("aria-pressed", "true");
  const trigger = toolbar.getByRole("button", { name: "Keyboard shortcuts" });
  await trigger.click();
  const dialog = editor.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close keyboard shortcuts" });
  await expect(close).toBeFocused();
  await page.keyboard.press("t");
  await expect(selection).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: info.outputPath("d7-help-desktop.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("t");
  await expect(toolbar.getByRole("button", { name: "Add text", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("D7 phone focus dialog remains reachable in reduced motion and forced colors", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const editor = await realEditor(page);
  // D18 intentionally moved Keyboard shortcuts out of the 320px bar to
  // preserve seven 44px touch controls. Keep genuine dialog/focus/forced-
  // colors acceptance and open the help from its new accessible location.
  const trigger = editor.getByRole("navigation", { name: "Editing tools" }).getByRole("button", { name: "More tools", exact: true });
  await trigger.click();
  const menu = editor.getByRole("dialog", { name: "Editor tools" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
  await expect(menu).toHaveCount(0);
  const dialog = editor.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close keyboard shortcuts" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close keyboard shortcuts" })).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("d7-help-phone-contrast.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
