import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

async function openEditor(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: /Select existing image:/ }).first()).toBeVisible({ timeout: 20_000 });
}

async function addRectangle(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 105, { steps: 4 });
  await page.mouse.up();
}

test("editor status and secondary surfaces use product language", async ({ page }) => {
  await openEditor(page);

  const fileGroup = page.locator(".editor-file-group");
  await expect(fileGroup).toContainText(/Ready · \d+ PDF items? · 0 added objects/);
  await expect(fileGroup).not.toContainText(/PDF engine|Unified editor|overlay objects|Unsaved export|existing-content/i);

  await addRectangle(page);
  await expect(fileGroup).toContainText("1 added object");
  await expect(page.locator(".editor-contextbar strong")).toHaveText("Changes saved locally", { timeout: 10_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await downloadPromise;
  await expect(fileGroup).toContainText("Edited PDF downloaded");
  await expect(page.locator(".editor-contextbar strong")).toContainText(/0 PDF content edits · 1 added object · /);
});

test("retired engineering phrases do not remain in normal editor copy", async () => {
  const editor = readFileSync(join(process.cwd(), "src/views/EditorPage.tsx"), "utf8");
  const localSave = readFileSync(join(process.cwd(), "src/persistence/localSaveTrust.ts"), "utf8");
  const retiredEditorPhrases = [
    "Opening PDF engine",
    "Unified editor ready",
    "detected PDF objects · Unified editor",
    "Existing-content inspection unavailable",
    "overlay editing only",
    "in-memory editing session",
    "editor objects · Unsaved export",
    "local binary assets were unavailable",
    "Compiling editor objects",
    "existing-content edits",
    "Validating unified edited PDF",
    "Reopening and validating edited output",
    "0 existing-content edits",
    "overlay objects",
    "Saving a new project revision",
    "Export validated and downloaded",
    "Undo added-object change",
    "Redo added-object change",
    "existing-content edit",
    "Editor report",
    "No editable objects detected",
    " · ${queued} queued",
    "local PDF engines",
    "could not be decoded"
  ];
  for (const phrase of retiredEditorPhrases) expect(editor).not.toContain(phrase);

  for (const phrase of [
    "Local changes waiting to save",
    "Saving local changes",
    "Local changes saved",
    "Local changes not yet saved",
    "No pending editor changes"
  ]) expect(localSave).not.toContain(phrase);
});
