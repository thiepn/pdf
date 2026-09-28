import { openSample, switchMode } from "./helpers/taskFirst";
import { expect, test } from "@playwright/test";

test("checkpoint restore creates an independent project identity", async ({ page }) => {
  await page.goto("./#/home");
  await openSample(page);
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  const sourceUrl = page.url();
  const sourceId = sourceUrl.match(/workspace\/([^/]+)\/viewer/)?.[1];
  expect(sourceId).toBeTruthy();

  await page.getByRole("button", { name: "History and checkpoints", exact: true }).click();
  await page.getByPlaceholder("Checkpoint name").fill("Phase 16 isolation");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Phase 16 isolation", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Restore copy" }).click();
  await expect(page).not.toHaveURL(sourceUrl);
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  const restoredId = page.url().match(/workspace\/([^/]+)\/viewer/)?.[1];
  expect(restoredId).toBeTruthy();
  expect(restoredId).not.toBe(sourceId);
  await expect(page.getByRole("heading", { name: /northstar-launch-review — Phase 16 isolation/i })).toBeVisible();
});

test("duplicate tabs cannot mount mutating modes until project ownership is released", async ({ page, context }) => {
  await page.goto("./#/home");
  await openSample(page);
  await expect(page.locator(".document-workspace:not(.is-readonly)")).toBeVisible();
  const workspaceUrl = page.url();

  const duplicate = await context.newPage();
  await duplicate.goto(workspaceUrl);
  await expect(duplicate.getByText("Read-only in this tab", { exact: true })).toBeVisible();
  // This path intentionally cannot reach an editor: another tab owns it.
  await duplicate.getByRole("button", { name: "Document actions", exact: true }).click();
  await duplicate.getByRole("dialog", { name: "Document actions", exact: true }).getByRole("button", { name: /^Edit PDF/ }).click();
  await expect(duplicate.getByRole("heading", { name: /Edit is locked in this tab/i })).toBeVisible();
  await expect(duplicate.getByRole("button", { name: "Add text", exact: true })).toHaveCount(0);

  await page.close();
  await duplicate.getByRole("button", { name: "Try editing here" }).first().click();
  await expect(duplicate.locator(".document-workspace:not(.is-readonly)")).toBeVisible();
  await expect(duplicate.getByRole("button", { name: "Add text", exact: true })).toBeVisible();
});
