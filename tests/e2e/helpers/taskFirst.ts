import { expect, type Download, type Page } from "@playwright/test";
import { createShowcasePdf } from "../../../src/fixtures/showcasePdf";

/** Import the same showcase through the public task-first reader. This avoids
 * coupling native-engine tests to the homepage demo's editor-first shortcut. */
export async function openSample(page: Page, mode: "viewer" | "editor" = "viewer"): Promise<void> {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).evaluate((node, data) => {
    const input = node as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(data).buffer], "northstar-launch-review.pdf", { type: "application/pdf" }));
    input.files = transfer.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  }, Array.from(createShowcasePdf()));
  await expect(page.locator(".viewer-app")).toBeVisible({ timeout: 20_000 });
  if (mode === "editor") await switchMode(page, "editor");
}
export async function switchMode(page: Page, mode: "viewer" | "editor" | "organizer"): Promise<void> {
  await openDocumentActions(page);
  const dialog = page.getByRole("dialog", { name: "Document actions", exact: true });
  await dialog.getByRole("button", { name: mode === "viewer" ? "Read PDF" : mode === "editor" ? "Edit this PDF" : "Arrange pages", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${mode}(?:/[^/]+)?$`));
  await expect(page.locator(mode === "organizer" ? ".organizer-app" : `.${mode}-app`)).toBeVisible();
}
export async function chooseEditorTool(page: Page, label: string): Promise<void> {
  const direct = page.getByRole("navigation", { name: "Editing tools" }).getByRole("button", { name: label, exact: true });
  if (await direct.isVisible()) { await direct.click(); return; }
  await page.getByRole("button", { name: "More tools", exact: true }).click();
  await page.getByRole("dialog", { name: "Editor tools" }).getByRole("button", { name: label, exact: true }).click();
}
export async function chooseDocumentTask(page: Page, label: string): Promise<void> {
  await openDocumentActions(page);
  const dialog = page.getByRole("dialog", { name: "Document actions", exact: true });
  await dialog.getByRole("searchbox", { name: "Find a PDF tool" }).fill(label);
  await dialog.locator(".product-tool-card").filter({ has: page.locator("strong", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) }).click();
}

/** Follow the public overflow menu when the document has its compact controls. */
export async function openDocumentActions(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  const action = page.getByRole("button", { name: "Document actions", exact: true });
  // Both More tools and Keyboard shortcuts open dialogs; only the dedicated
  // overflow trigger contains Document actions. Never use a generic dialog button.
  const compactMenu = page.locator('.compact-document-bar button[aria-label="More tools"], .compact-document-bar button[aria-label="More reader actions"]');
  // Reader/workspace hydration can briefly precede the responsive chrome. Wait
  // for the actual desktop or compact entry point, then follow the public
  // compact menu instead of assuming its contents are already in the DOM.
  await expect.poll(async () => await action.isVisible() || await compactMenu.isVisible(),
    { timeout: 10_000 }).toBe(true);
  if (await action.isVisible()) {
    await action.click();
  } else {
    await compactMenu.click();
    const options = page.getByRole("dialog", { name: /Reading options|Editor tools/ });
    await expect(options).toBeVisible();
    await options.getByRole("button", { name: "Document actions", exact: true }).click();
  }
  await expect(page.getByRole("dialog", { name: "Document actions", exact: true })).toBeVisible();
}
export async function openReaderOptions(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  const menu = page.locator('.compact-document-bar button[aria-label="More reader actions"]');
  if (await menu.isVisible() && !await page.getByRole("dialog", { name: "Reading options", exact: true }).isVisible()) await menu.click();
}
export async function closeReaderOptions(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: "Close reading options", exact: true });
  if (await close.isVisible()) await close.click();
}
export async function readerCommand(page: Page, name: string): Promise<void> {
  await openReaderOptions(page);
  await page.getByRole("button", { name, exact: true }).click();
}

/** Explicitly download an edited copy, independent of the browser's local-file
 * save capability. This follows the production menu and validates the receipt.
 * Do not use the primary save action: capable browsers show "Save as PDF". */
export async function downloadEditorCopy(page: Page): Promise<Download> {
  const menu = page.locator(".editor-save-options");
  await expect(menu).toBeVisible();
  await menu.locator("summary").click();
  const output = page.waitForEvent("download", { timeout: 30_000 });
  await menu.getByRole("button", { name: "Download copy", exact: true }).click();
  const downloaded = await output;
  expect(downloaded.suggestedFilename()).toMatch(/_edited\\.pdf$/);
  await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 25_000 });
  return downloaded;
}
