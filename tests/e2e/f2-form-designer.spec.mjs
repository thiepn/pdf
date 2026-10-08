import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFile } from "node:fs/promises";
import { chooseEditorTool, openSample } from "./helpers/taskFirst";

test.setTimeout(100_000);

test("F2 user workflow creates a true fillable field and exports it", async ({ page }) => {
  await openSample(page, "editor");
  await chooseEditorTool(page, "Form field");

  const canvas = page.locator(".editor-page-layers");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + 115, box.y + 170);

  const field = page.locator(".editor-object--form-field");
  await expect(field).toHaveCount(1);
  const properties = page.locator(".f2-field-properties");
  await expect(properties).toBeVisible();
  await properties.getByLabel("Form field name").fill("Contact_Name");
  await properties.getByLabel("Tooltip / accessible description").fill("Your full name");
  await properties.getByLabel("Default value").fill("Ada Lovelace");
  await expect(page.locator(".editor-app")).toHaveAttribute("data-editor-dirty", "true");

  const pendingDownload = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await pendingDownload;
  const bytes = await readFile(await download.path());
  const pdf = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
  expect(pdf).not.toBeNull();
  try {
    const page0 = pdf.loadPage(0);
    try {
      const widgets = page0.getWidgets();
      try {
        const created = widgets.find((widget) => widget.getName() === "Contact_Name");
        expect(created).toBeDefined();
        expect(created.getValue()).toBe("Ada Lovelace");
      } finally { widgets.forEach((widget) => widget.destroy()); }
    } finally { page0.destroy(); }
  } finally { pdf?.destroy(); }
});
