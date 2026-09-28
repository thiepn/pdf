import { expect, test } from "@playwright/test";
import { openSample, switchMode, chooseDocumentTask } from "./helpers/taskFirst";

test("document-first workspace keeps reading, editing, history and task handoff available without tabs", async ({ page }) => {
  await openSample(page);
  await expect(page.getByRole("heading", { name: "northstar-launch-review", exact: true })).toBeVisible();
  await expect(page.locator('[role="tablist"],.workspace-modebar,.workspace-mobile-nav')).toHaveCount(0);
  await switchMode(page, "editor");
  await expect(page.locator(".editor-app")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add text", exact: true })).toBeVisible();
  const history = page.getByRole("button", { name: "History and checkpoints", exact: true });
  await history.click();
  await expect(page.getByRole("heading", { name: "History & checkpoints" })).toBeVisible();
  await history.click();
  await chooseDocumentTask(page, "Extract pages");
  await expect(page).toHaveURL(/#\/quick\/extract-pages/);
  await expect(page.getByRole("textbox", { name: "Pages", exact: true })).toBeVisible();
  await expect(page.locator(".task-canvas")).toBeVisible();
});

test("legacy document routes remain compatible", async ({ page }) => {
  await page.goto("./#/editor/missing-project");
  await expect(page.locator("body")).toContainText(/Workspace unavailable|Project not found/i);
});
