import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { chooseEditorTool, switchMode } from "./helpers/taskFirst";

const exportDirectory = resolve(process.env.F9_EXPORT_DIR ?? "test-results/f9-exports");

async function prepareRectangleEdit(page: Page, filename: string): Promise<void> {
  await page.goto("./#/tools/read-pdf");
  await page.locator('input[type="file"][accept*="pdf"]').first()
    .setInputFiles("tests/corpus/p8/" + filename + ".pdf");
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await switchMode(page, "editor");
  await expect(page).toHaveURL(/\/editor(?:\/edit-pdf)?$/);
  const canvas = page.locator(".editor-page-layers");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await chooseEditorTool(page, "Rectangle");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editor canvas has no visible bounds");
  await page.mouse.move(box.x + 48, box.y + 48);
  await page.mouse.down();
  await page.mouse.move(box.x + 148, box.y + 108, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
}

for (const fixture of ["rotated-crop", "incremental"] as const) {
  test("F9 exports a real " + fixture + " edit for independent readers", async ({ page }) => {
    test.setTimeout(90_000);
    await prepareRectangleEdit(page, fixture);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
    await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 25_000 });
    await mkdir(exportDirectory, { recursive: true });
    await download.saveAs(resolve(exportDirectory, fixture + "-edited.pdf"));
  });
}
