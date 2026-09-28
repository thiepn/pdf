import { expect, test } from "@playwright/test";
import { openSample, switchMode } from "./helpers/taskFirst";

test.describe("Desktop task-first hierarchy", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("homepage prioritizes tasks and files while project recovery remains secondary", async ({ page }) => {
    await page.goto("./#/home");
    await expect(page.getByRole("heading", { name: /Less work.*More done/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose files", exact: true })).toBeVisible();
    await expect(page.locator(".home-task-card")).toHaveCount(12);
    await expect(page.getByRole("link", { name: /Merge PDFs/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "See all tools", exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore a project backup", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Try an example/ })).toBeVisible();
    await expect(page.locator(".product-trust-line")).toContainText("Originals stay unchanged");
  });
  test("document canvas has one compact heading and context-specific editing controls", async ({ page }) => {
    await openSample(page);
    const header = page.locator(".document-topbar");
    await expect(header).toBeVisible();
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(80);
    await expect(page.locator(".workspace-tabs,.workspace-modebar,.workspace-mobile-nav")).toHaveCount(0);
    await switchMode(page, "editor");
    const tools = page.getByRole("navigation", { name: "Editing tools" });
    await expect(tools.getByRole("button", { name: "Add text", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeVisible();
    await expect(page.locator(".editor-toolrail")).toHaveCount(0);
    await page.getByRole("button", { name: "More tools", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Editor tools" });
    for (const name of ["Rectangle", "Arrow", "Underline", "Mark redaction"]) await expect(dialog.getByRole("button", { name, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
});
