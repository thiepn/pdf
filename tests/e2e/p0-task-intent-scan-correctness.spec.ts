import { expect, test } from "@playwright/test";

async function createSampleProject(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page.locator(".viewer-app")).toBeVisible();
  const match = page.url().match(/\/workspace\/([^/]+)\/viewer/);
  expect(match?.[1]).toBeTruthy();
  return decodeURIComponent(match?.[1] ?? "");
}

test.describe("P0 task-intent and Scan correctness", () => {
  test("task routes activate their exact editor and specialist controls", async ({ page }) => {
    test.setTimeout(60_000);
    const projectId = await createSampleProject(page);
    const encoded = encodeURIComponent(projectId);

    await page.goto(`./#/workspace/${encoded}/editor/visual-signature`);
    await expect(page.locator(".editor-app")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.editor-toolrail button[aria-label="Signature"]')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pdfTaskIntent)).toBe("visual-signature");

    await page.goto(`./#/workspace/${encoded}/professional/print-layout`);
    await expect(page.locator(".professional-page")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator(".professional-tabs button.active")).toContainText("Print layout");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pdfTaskIntent)).toBe("print-layout");

    await page.goto(`./#/workspace/${encoded}/compliance/accessibility-check`);
    await expect(page.locator(".compliance-page")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator(".professional-tabs button.active")).toContainText("Accessibility");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pdfTaskIntent)).toBe("accessibility-check");
  });

  test("changing a validated Scan recipe removes the stale output", async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto("./#/scan");
    await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles("public/icons/icon-192.png");
    await expect(page.getByText("Page 1", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Create PDF", exact: true }).click();
    await expect(page.getByText("Output validated", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Save as project", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Rotate page 1", exact: true }).click();
    await expect(page.getByText("Scan settings changed. Create the PDF again.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save as project", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Download", exact: true })).toBeHidden();

    await page.getByRole("button", { name: "Create PDF", exact: true }).click();
    await expect(page.getByText("Output validated", { exact: true })).toBeVisible({ timeout: 20_000 });
  });
});
