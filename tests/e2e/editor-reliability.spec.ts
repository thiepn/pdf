import { expect, test } from "@playwright/test";
import { chooseEditorTool, openSample } from "./helpers/taskFirst";

async function reopenDownload(page: import("@playwright/test").Page, download: import("@playwright/test").Download) {
  const path = await download.path();
  if (!path) throw new Error("Downloaded PDF path is unavailable.");
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(path);
  await expect(page.locator('.viewer-app[data-preferences-ready="true"]')).toBeVisible({ timeout: 20_000 });
}

async function searchDocument(page: import("@playwright/test").Page, query: string): Promise<string> {
  await page.keyboard.press("Control+f");
  const search = page.getByRole("searchbox", { name: "Search document", exact: true });
  await expect(search).toBeFocused();
  await search.fill(query);
  await search.press("Enter");
  const summary = page.locator(".search-summary");
  await expect(summary).toBeVisible();
  return (await summary.textContent()) ?? "";
}

test("existing PDF edits participate in Undo/Redo and survive export", async ({ page }) => {
  await openSample(page, "editor");
  const sourceText = page.getByRole("button", { name: /Select existing (?:text|paragraph):/ }).first();
  await expect(sourceText).toBeVisible({ timeout: 20_000 });
  await sourceText.click();

  const properties = page.locator(".native-unified-properties");
  const editor = properties.locator("textarea").first();
  await editor.fill("UNDO OK");
  const beforePreview = await page.locator(".editor-page-layers > canvas").screenshot();
  await properties.getByRole("button", { name: /Apply (?:text|paragraph|layout-aware text) change/ }).click();
  await expect(page.locator(".native-queued-count")).toContainText("1 PDF edit ready");
  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "ready", { timeout: 20_000 });
  const afterPreview = await page.locator(".editor-page-layers > canvas").screenshot();
  expect(afterPreview.equals(beforePreview)).toBe(false);

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator(".native-queued-count")).toHaveCount(0);
  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "source", { timeout: 20_000 });

  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.locator(".native-queued-count")).toContainText("1 PDF edit ready");
  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "ready", { timeout: 20_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  await reopenDownload(page, download);
  await expect.poll(async () => await searchDocument(page, "UNDO OK")).toContain("1 match");
});

test("hidden added objects stay out of exported PDF", async ({ page }) => {
  await openSample(page, "editor");
  await chooseEditorTool(page, "Add text");
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editor canvas is unavailable.");
  await page.mouse.click(box.x + 120, box.y + 160);

  const properties = page.locator(".editor-properties");
  await expect(properties).toBeVisible();
  await properties.getByLabel("Content").fill("HIDDEN EXPORT MARKER");

  const showPages = page.getByRole("button", { name: "Show pages", exact: true });
  if (await showPages.isVisible()) await showPages.click();
  const sidebar = page.locator(".editor-left-panel");
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("combobox", { name: "Sidebar content" }).selectOption("layers");
  await sidebar.getByTitle("Hide").click();
  await expect(page.locator(".editor-object")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  await reopenDownload(page, download);
  await expect.poll(async () => await searchDocument(page, "HIDDEN EXPORT MARKER")).toContain("0 matches");
});
