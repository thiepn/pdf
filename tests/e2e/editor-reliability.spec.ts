import { expect, test } from "@playwright/test";
import { chooseEditorTool, openSample, switchMode } from "./helpers/taskFirst";

async function openEditorFile(page: import("@playwright/test").Page, path: string) {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(path);
  await expect(page.locator(".viewer-app")).toBeVisible({ timeout: 20_000 });
  await switchMode(page, "editor");
  await expect(page.getByLabel("Current page", { exact: true })).toHaveValue("1");
}

async function openMultiPageEditor(page: import("@playwright/test").Page) {
  await openEditorFile(page, "tests/corpus/generated/plain-text.pdf");
}

async function reopenDownload(page: import("@playwright/test").Page, download: import("@playwright/test").Download) {
  const tempPath = `/tmp/pdf-editor-reopen-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  await download.saveAs(tempPath);
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(tempPath);
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

async function medianCanvasPixelAtBox(page: import("@playwright/test").Page, box: { x: number; y: number; width: number; height: number }): Promise<[number, number, number, number]> {
  return page.evaluate(({ x, y, width, height }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-page-layers > canvas");
    if (!canvas) throw new Error("Editor PDF canvas is unavailable.");
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Editor PDF canvas context is unavailable.");
    const fractions = [.08, .28, .5, .72, .92];
    const samples = fractions.flatMap((fy) => fractions.map((fx) => {
      const clientX = x + width * fx;
      const clientY = y + height * fy;
      const pixelX = Math.max(0, Math.min(canvas.width - 1, Math.round((clientX - rect.left) * canvas.width / rect.width)));
      const pixelY = Math.max(0, Math.min(canvas.height - 1, Math.round((clientY - rect.top) * canvas.height / rect.height)));
      return [...context.getImageData(pixelX, pixelY, 1, 1).data] as [number, number, number, number];
    }));
    const median = (channel: number) => {
      const values = samples.map((sample) => sample[channel]).sort((left, right) => left - right);
      return values[Math.floor(values.length / 2)] ?? 0;
    };
    return [median(0), median(1), median(2), median(3)] as [number, number, number, number];
  }, box);
}

test("corrupt imported fonts are rejected before a native text edit can use them", async ({ page }) => {
  await openSample(page, "editor");
  const sourceText = page.getByRole("button", { name: /Select existing (?:text|paragraph):/ }).first();
  await expect(sourceText).toBeVisible({ timeout: 20_000 });
  await sourceText.click();

  const properties = page.locator(".native-unified-properties");
  const fontInput = properties.locator('input[type="file"][accept*=".ttf"]');
  await fontInput.setInputFiles({
    name: "broken-font.ttf",
    mimeType: "font/ttf",
    buffer: (globalThis as any).Buffer.from("this is deliberately not a font")
  });

  await expect(properties.getByRole("alert")).toContainText("Could not use this font", { timeout: 20_000 });
  await expect(properties.getByText(/Matching font: broken-font/)).toHaveCount(0);
  await expect(properties.getByRole("button", { name: /Apply (?:text|paragraph|layout-aware text) change/ })).toBeEnabled();
});

test("existing-text reconstruction preserves colored PDF backgrounds and supports source verification", async ({ page }) => {
  await openSample(page, "editor");
  const target = page.getByRole("button", { name: /Select existing (?:text|paragraph):.*MAY - JUL/i }).first();
  await expect(target).toBeVisible({ timeout: 20_000 });
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error("Colored sample text target is unavailable.");

  const before = await medianCanvasPixelAtBox(page, targetBox);
  // The showcase card is a pale colored vector fill, not white. This assertion
  // makes the test capable of catching the previous opaque-white replacement.
  expect(before[0]).toBeLessThan(252);

  await target.click();
  const properties = page.locator(".native-unified-properties");
  const editor = properties.locator("textarea").first();
  const original = await editor.inputValue();
  expect(original).toContain("MAY - JUL");
  await editor.fill(original.replace("MAY - JUL", "JUN - AUG"));
  const applyTextChange = properties.getByRole("button", { name: /Apply (?:text|paragraph|layout-aware text) change/ });
  await expect(applyTextChange).toBeEnabled();
  await applyTextChange.click();

  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "ready", { timeout: 20_000 });
  const after = await medianCanvasPixelAtBox(page, targetBox);
  for (let channel = 0; channel < 3; channel += 1) expect(Math.abs(after[channel] - before[channel])).toBeLessThanOrEqual(4);

  const originalView = page.getByRole("button", { name: "Original", exact: true });
  const editedView = page.getByRole("button", { name: "Edited preview", exact: true });
  await expect(originalView).toBeVisible();
  await originalView.click();
  await expect(page.getByText("Original PDF · editing paused", { exact: true })).toBeVisible();
  await expect(originalView).toHaveAttribute("aria-pressed", "true");
  const sourceAgain = await medianCanvasPixelAtBox(page, targetBox);
  expect(sourceAgain).toEqual(before);

  await editedView.click();
  await expect(editedView).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Original PDF · editing paused", { exact: true })).toHaveCount(0);
});

test("existing PDF edits participate in Undo/Redo and survive export", async ({ page }) => {
  await openSample(page, "editor");
  const sourceText = page.getByRole("button", { name: /Select existing (?:text|paragraph):/ }).first();
  await expect(sourceText).toBeVisible({ timeout: 20_000 });
  await sourceText.click();

  const properties = page.locator(".native-unified-properties");
  const editor = properties.locator("textarea").first();
  const originalText = await editor.inputValue();
  await editor.fill("UNDO OK");
  const beforePreview = await page.locator(".editor-page-layers > canvas").screenshot();
  await properties.getByRole("button", { name: /Apply (?:text|paragraph|layout-aware text) change/ }).click();
  await expect(page.locator(".native-queued-count")).toContainText(/PDF edit(?:s)? ready/);
  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "ready", { timeout: 20_000 });
  await expect.poll(async () => !(await page.locator(".editor-page-layers > canvas").screenshot()).equals(beforePreview), { timeout: 20_000 }).toBe(true);

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator(".native-queued-count")).toHaveCount(0);
  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "source", { timeout: 20_000 });
  await expect(editor).toHaveValue(originalText);

  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.locator(".native-queued-count")).toContainText(/PDF edit(?:s)? ready/);
  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "ready", { timeout: 20_000 });
  await expect(editor).toHaveValue("UNDO OK");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  await reopenDownload(page, download);
  expect(await searchDocument(page, "UNDO OK")).toContain("1 match");
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
  expect(await searchDocument(page, "HIDDEN EXPORT MARKER")).toContain("0 matches");
});


test("deleted existing objects leave no stale canvas hitbox and return on Undo", async ({ page }) => {
  await openSample(page, "editor");
  const image = page.getByRole("button", { name: /Select existing image:/ }).first();
  await expect(image).toBeVisible({ timeout: 20_000 });
  const nativeId = await image.getAttribute("data-native-object-id");
  expect(nativeId).toBeTruthy();
  await image.click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".native-queued-count")).toContainText(/PDF edit(?:s)? ready/);
  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "ready", { timeout: 20_000 });
  await expect(page.locator(`[data-native-object-id="${nativeId}"]`)).toHaveCount(0);
  await expect(page.locator(".native-unified-properties")).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(page.locator(".native-queued-count")).toHaveCount(0);
  const restored = page.locator(`[data-native-object-id="${nativeId}"]`);
  await expect(restored).toBeVisible();
  await expect(restored).toHaveClass(/active/);

  await page.keyboard.press("Control+y");
  await expect(page.locator(".native-queued-count")).toContainText(/PDF edit(?:s)? ready/);
  await expect(page.locator(`[data-native-object-id="${nativeId}"]`)).toHaveCount(0);
});


test("editable source text can be deleted, previewed, undone and exported", async ({ page }) => {
  await openSample(page, "editor");
  const textTarget = page.getByRole("button", { name: /Select existing (?:text|paragraph):.*SAMPLE BRIEF/i }).first();
  await expect(textTarget).toBeVisible({ timeout: 20_000 });
  const nativeId = await textTarget.getAttribute("data-native-object-id");
  expect(nativeId).toBeTruthy();
  await textTarget.click();

  const properties = page.locator(".native-unified-properties");
  await properties.getByRole("button", { name: "Delete existing text", exact: true }).click();
  await expect(page.locator(".native-queued-count")).toContainText(/PDF edit(?:s)? ready/);
  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "ready", { timeout: 20_000 });
  await expect(page.locator(`[data-native-object-id="${nativeId}"]`)).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(page.locator(".native-queued-count")).toHaveCount(0);
  const restoredText = page.locator(`[data-native-object-id="${nativeId}"]`);
  await expect(restoredText).toBeVisible();
  await expect(restoredText).toHaveClass(/active/);
  await expect(page.locator(".native-unified-properties")).toBeVisible();
  await page.keyboard.press("Control+y");
  await expect(page.locator(".native-queued-count")).toContainText(/PDF edit(?:s)? ready/);
  await expect(page.locator(".editor-app")).toHaveAttribute("data-native-preview-state", "ready", { timeout: 20_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  await reopenDownload(page, download);
  expect(await searchDocument(page, "SAMPLE BRIEF")).toContain("0 matches");
});


test("export creates a clean history checkpoint that Undo can return to", async ({ page }) => {
  await openSample(page, "editor");
  const app = page.locator(".editor-app");
  await expect(app).toHaveAttribute("data-editor-dirty", "false");

  await chooseEditorTool(page, "Add text");
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editor canvas is unavailable.");
  await page.mouse.click(box.x + 120, box.y + 160);
  const content = page.locator(".editor-properties").getByLabel("Content");
  await content.fill("SAVED REVISION");
  await expect(app).toHaveAttribute("data-editor-dirty", "true");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await download;
  await expect(app).toHaveAttribute("data-editor-dirty", "false", { timeout: 20_000 });

  await content.fill("AFTER EXPORT");
  await expect(app).toHaveAttribute("data-editor-dirty", "true");
  await page.keyboard.press("Control+z");
  await expect(app).toHaveAttribute("data-editor-dirty", "false");
  await expect(content).toHaveValue("SAVED REVISION");

  await page.keyboard.press("Control+y");
  await expect(app).toHaveAttribute("data-editor-dirty", "true");
  await expect(content).toHaveValue("AFTER EXPORT");
});

test("page navigation clears stale selections before off-screen shortcuts can run", async ({ page }) => {
  await openMultiPageEditor(page);
  await chooseEditorTool(page, "Add text");
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editor canvas is unavailable.");
  await page.mouse.click(box.x + 120, box.y + 160);
  const object = page.locator(".editor-object").last();
  await expect(object).toBeVisible();

  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByLabel("Current page", { exact: true })).toHaveValue("2");
  await page.keyboard.press("Delete");

  await page.getByRole("button", { name: "Previous page", exact: true }).click();
  await expect(object).toBeVisible();
  await expect(object).not.toHaveClass(/editor-object--selected/);
});

test("page-number entry clears stale added-object selection", async ({ page }) => {
  await openMultiPageEditor(page);
  await chooseEditorTool(page, "Add text");
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editor canvas is unavailable.");
  await page.mouse.click(box.x + 120, box.y + 160);
  const object = page.locator(".editor-object").last();
  await expect(object).toBeVisible();

  const pageInput = page.getByLabel("Current page", { exact: true });
  await pageInput.fill("2");
  await pageInput.press("Enter");
  await expect(pageInput).toHaveValue("2");
  await page.keyboard.press("Delete");

  await pageInput.fill("1");
  await pageInput.press("Enter");
  await expect(object).toBeVisible();
});

test("deleted existing content remains recoverable from the layer list", async ({ page }) => {
  await openSample(page, "editor");
  const image = page.getByRole("button", { name: /Select existing image:/ }).first();
  await expect(image).toBeVisible({ timeout: 20_000 });
  const id = await image.getAttribute("data-native-object-id");
  expect(id).toBeTruthy();
  await image.click();
  await page.keyboard.press("Delete");
  await expect(page.locator(`[data-native-object-id="${id}"]`)).toHaveCount(0);

  const sidebar = page.locator(".editor-left-panel");
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("combobox", { name: "Sidebar content" }).selectOption("layers");
  const restore = sidebar.getByRole("button", { name: "Restore", exact: true }).first();
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(page.locator(".native-queued-count")).toHaveCount(0);
  await expect(page.locator(`[data-native-object-id="${id}"]`)).toBeVisible();
});


test("page Select All and Cut shortcuts are safe for mixed PDF selections", async ({ page }) => {
  await openSample(page, "editor");
  await chooseEditorTool(page, "Add text");
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editor canvas is unavailable.");
  await page.mouse.click(box.x + 110, box.y + 150);

  const added = page.locator(".editor-object").last();
  await expect(added).toBeVisible();
  // Existing-content discovery is deliberately deferred after the editor becomes
  // interactive. Wait for one source hitbox so this test exercises a genuinely
  // mixed selection rather than racing that hydration step.
  await expect(page.locator(".native-content-hitbox").first()).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+a");

  await expect(added).toHaveClass(/editor-object--selected/);
  await expect.poll(async () => page.locator(".native-content-hitbox.active").count()).toBeGreaterThan(0);

  // A mixed selection must never partially cut only the added objects while
  // silently leaving original PDF content behind.
  await page.keyboard.press("Control+x");
  await expect(added).toBeVisible();
  await expect(page.locator(".native-queued-count")).toHaveCount(0);
  await expect(page.locator(".editor-banner.warning-banner")).toContainText("Existing PDF content cannot be cut to the clipboard safely");

  // Cut is supported when the selection is entirely made of objects added in
  // PDF Studio, and participates in document history.
  await page.keyboard.press("Escape");
  await added.click();
  await page.keyboard.press("Control+x");
  await expect(page.locator(".editor-object")).toHaveCount(0);

  await page.keyboard.press("Control+z");
  const restored = page.locator(".editor-object").last();
  await expect(restored).toBeVisible();
  await expect(restored).toHaveClass(/editor-object--selected/);

  await page.keyboard.press("Control+y");
  await expect(page.locator(".editor-object")).toHaveCount(0);

  await page.keyboard.press("Control+v");
  const pasted = page.locator(".editor-object").last();
  await expect(pasted).toBeVisible();
  await expect(pasted).toHaveClass(/editor-object--selected/);
});

test("Ctrl+A inside an editor text field keeps native text-selection behavior", async ({ page }) => {
  await openSample(page, "editor");
  await chooseEditorTool(page, "Add text");
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editor canvas is unavailable.");
  await page.mouse.click(box.x + 110, box.y + 150);

  const content = page.locator(".editor-properties").getByLabel("Content");
  await content.fill("replace this entire field");
  await content.focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("FIELD ONLY");

  await expect(content).toHaveValue("FIELD ONLY");
  await expect(page.locator(".editor-object--selected")).toHaveCount(1);
  await expect(page.locator(".native-content-hitbox.active")).toHaveCount(0);
});


test("locked added objects stay immutable until explicitly unlocked", async ({ page }) => {
  await openSample(page, "editor");
  await chooseEditorTool(page, "Add text");
  const canvas = page.locator(".editor-page-layers");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editor canvas is unavailable.");
  await page.mouse.click(box.x + 140, box.y + 180);

  const object = page.locator(".editor-object").last();
  const properties = page.locator(".editor-properties");
  const content = properties.getByLabel("Content");
  await content.fill("LOCKED OBJECT");
  const locked = properties.getByLabel("Locked", { exact: true });
  await locked.check();

  await expect(content).toBeDisabled();
  await expect(properties.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  await expect(properties.getByRole("button", { name: "Bring front", exact: true })).toBeDisabled();
  await expect(object).toHaveClass(/editor-object--locked/);

  const before = await object.evaluate((element) => {
    const style = (element as HTMLElement).style;
    return { left: style.left, top: style.top, width: style.width, height: style.height, transform: style.transform };
  });
  await object.click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+x");

  await expect(page.locator(".editor-object")).toHaveCount(1);
  const after = await object.evaluate((element) => {
    const style = (element as HTMLElement).style;
    return { left: style.left, top: style.top, width: style.width, height: style.height, transform: style.transform };
  });
  expect(after).toEqual(before);

  await locked.uncheck();
  await expect(content).toBeEnabled();
  await object.click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".editor-object")).toHaveCount(0);
});
