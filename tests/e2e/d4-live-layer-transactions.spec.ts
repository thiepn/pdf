import { expect, test } from "@playwright/test";
import { chooseEditorTool, openSample, switchMode } from "./helpers/taskFirst";

test.setTimeout(90_000);

async function openLayerEditor(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("./#/home");
  await openSample(page);
  await switchMode(page, "editor");
  const editor = page.locator('.editor-app[data-d3-editor="true"]');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await chooseEditorTool(page, "Rectangle");
  const canvas = page.locator(".editor-page-layers");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Real editor canvas not available");
  await page.mouse.move(bounds.x + 48, bounds.y + 48);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 165, bounds.y + 118, { steps: 5 });
  await page.mouse.up();
  const picker = page.getByRole("combobox", { name: "Sidebar content" });
  if (!await picker.isVisible()) await page.getByRole("button", { name: "Show pages", exact: true }).click();
  await picker.selectOption("layers");
  const row = editor.locator(".editor-layer-item:not(.native-layer-item)").first();
  await expect(row).toBeVisible();
  return { editor, row };
}

test("D4 layer Lock is a real reversible document transaction", async ({ page }, info) => {
  const { editor, row } = await openLayerEditor(page);
  const lock = row.locator(".d4-layer-lock");
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await expect(lock).toHaveAttribute("aria-label", /^Lock /);
  await lock.click();
  await expect(row.locator(".d4-layer-lock")).toHaveAttribute("aria-pressed", "true");
  await expect(row).toContainText("Locked");
  await expect(row.locator(".d4-layer-lock")).toHaveAttribute("aria-label", /^Unlock /);
  await page.screenshot({ path: info.outputPath("d4-live-locked-object.png"), animations: "disabled" });
  await editor.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(row.locator(".d4-layer-lock")).toHaveAttribute("aria-pressed", "false");
  await expect(row).not.toContainText(" · Locked");
});

test("D4 layer visibility stays controllable and is reversible", async ({ page }) => {
  const { editor, row } = await openLayerEditor(page);
  const visibility = row.locator(".d4-layer-visibility");
  await expect(visibility).toHaveAttribute("aria-pressed", "true");
  await visibility.click();
  await expect(row.locator(".d4-layer-visibility")).toHaveAttribute("aria-pressed", "false");
  await expect(row).toContainText("Hidden");
  await editor.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(row.locator(".d4-layer-visibility")).toHaveAttribute("aria-pressed", "true");
});
