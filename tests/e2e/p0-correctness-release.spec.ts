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
  await page.locator('input[type="file"][multiple]').evaluate(async (node) => {
    const input = node as HTMLInputElement;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable in scan regression.");
    context.fillStyle = "white";
    context.fillRect(0, 0, 32, 32);
    context.fillStyle = "black";
    context.fillRect(6, 6, 20, 20);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoding failed.")), "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "page.png", { type: "image/png", lastModified: 1 }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

test("canonical task links activate the exact shared-workspace tool or tab", async ({ page }) => {
  test.setTimeout(70_000);
  const projectId = await openSampleProject(page);

  await openTask(page, projectId, "editor", "visual-signature");
  await expect(page.locator('.editor-toolrail button[aria-label="Signature"]')).toHaveClass(/active/, { timeout: 20_000 });

  await openTask(page, projectId, "secure", "password-protect");
  await expect(page.locator(".security-tabs button").filter({ hasText: "Protect" })).toHaveClass(/active/, { timeout: 35_000 });

  await openTask(page, projectId, "professional", "print-layout");
  await expect(page.locator(".professional-page .professional-tabs button").filter({ hasText: "Print layout" })).toHaveClass(/professional-tab--active|active/, { timeout: 20_000 });

  await openTask(page, projectId, "compliance", "accessibility-check");
  await expect(page.locator(".compliance-page .professional-tabs button").filter({ hasText: "Accessibility" })).toHaveClass(/active/, { timeout: 20_000 });
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

  // Grayscale enhancement defaults on, so click rather than check to guarantee
  // a real recipe change in every browser engine.
  await page.getByLabel("Grayscale enhancement").click();
  await expect(page.locator(".output-bar")).toBeHidden();
});
