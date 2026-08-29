import { expect, test } from "@playwright/test";

test("editor never reports a failed local write as saved and can retry it", async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & { __pdfStudioFailEditorSave?: boolean };
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(value: unknown, key?: IDBValidKey): IDBRequest<IDBValidKey> {
      if (testWindow.__pdfStudioFailEditorSave && this.name === "editorStates") {
        throw new DOMException("Injected editor quota failure", "QuotaExceededError");
      }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
  });

  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  const navigation = page.getByRole("navigation", { name: "Document workspace" });
  await navigation.getByRole("button", { name: "Edit", exact: true }).click();

  const contextStatus = page.locator(".editor-contextbar > strong");
  await expect(contextStatus).toHaveText("Local changes saved", { timeout: 15_000 });

  await page.evaluate(() => { (window as Window & { __pdfStudioFailEditorSave?: boolean }).__pdfStudioFailEditorSave = true; });
  await page.getByRole("checkbox", { name: "Snap" }).click();

  const saveFailure = page.getByRole("alert").filter({ hasText: "Local autosave failed" });
  await expect(saveFailure).toBeVisible({ timeout: 10_000 });
  await expect(contextStatus).toHaveText("Local autosave failed");
  await expect(saveFailure).toContainText(/current edits are still open in this tab/i);
  await expect(saveFailure).toContainText(/retry before closing or refreshing/i);

  await page.evaluate(() => { (window as Window & { __pdfStudioFailEditorSave?: boolean }).__pdfStudioFailEditorSave = false; });
  await saveFailure.getByRole("button", { name: "Retry save" }).click();

  await expect(saveFailure).toBeHidden({ timeout: 10_000 });
  await expect(contextStatus).toHaveText("Local changes saved", { timeout: 10_000 });
});
