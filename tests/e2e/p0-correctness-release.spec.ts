import { expect, test, type Page } from "@playwright/test";

async function openSampleProject(page: Page): Promise<string> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  const match = page.url().match(/#\/workspace\/([^/]+)\/viewer/);
  if (!match) throw new Error("Sample project route did not contain a project id.");
  return decodeURIComponent(match[1]);
}

async function openTask(page: Page, projectId: string, mode: string, taskId: string): Promise<void> {
  await page.goto(`./#/workspace/${encodeURIComponent(projectId)}/${mode}/${taskId}`);
  await expect(page.locator(`[data-task-intent-focus="${taskId}"]`)).toHaveCount(1);
}

async function addTinyPng(page: Page): Promise<void> {
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nAAAAABJRU5ErkJggg==";
  await page.locator('input[type="file"][multiple]').evaluate((node, encoded) => {
    const input = node as HTMLInputElement;
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "page.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, base64);
}

test("canonical task links activate the exact shared-workspace tool or tab", async ({ page }) => {
  const projectId = await openSampleProject(page);

  await openTask(page, projectId, "editor", "visual-signature");
  await expect(page.locator('.editor-toolrail button[aria-label="Signature"]')).toHaveClass(/active/);

  await openTask(page, projectId, "secure", "password-protect");
  await expect(page.locator(".security-tabs button").filter({ hasText: "Protect" })).toHaveClass(/active/);

  await openTask(page, projectId, "professional", "print-layout");
  await expect(page.locator(".professional-page .professional-tabs button").filter({ hasText: "Print layout" })).toHaveClass(/professional-tab--active|active/);

  await openTask(page, projectId, "compliance", "accessibility-check");
  await expect(page.locator(".compliance-page .professional-tabs button").filter({ hasText: "Accessibility" })).toHaveClass(/active/);
});

test("scan output disappears as soon as source or cleanup settings change", async ({ page }) => {
  await page.goto("./#/scan");
  await addTinyPng(page);
  await expect(page.locator(".scan-card")).toHaveCount(1);

  await page.getByRole("button", { name: "Create PDF" }).click();
  await expect(page.locator(".output-bar")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Rotate scan page 1" }).click();
  await expect(page.locator(".output-bar")).toBeHidden();
  await expect(page.locator(".processing-header")).toContainText("Scan changed");

  await page.getByRole("button", { name: "Create PDF" }).click();
  await expect(page.locator(".output-bar")).toBeVisible({ timeout: 20_000 });

  await page.getByLabel("Grayscale enhancement").check();
  await expect(page.locator(".output-bar")).toBeHidden();
});
