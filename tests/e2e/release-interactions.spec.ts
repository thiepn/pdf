import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/taskFirst";

test("every supported editor zoom remains named and selectable", async ({ page }) => {
  await openSample(page, "editor");
  const zoom = page.getByRole("combobox", { name: "Zoom", exact: true });
  await zoom.selectOption("2");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(zoom).toHaveValue("2.25");
  await expect(zoom.locator("option:checked")).toHaveText("225%");
  await zoom.selectOption("3");
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(zoom.locator("option:checked")).toHaveText("275%");
});

test("tool search remains available inside the editor and returns focus on dismissal", async ({ page }) => {
  await openSample(page, "editor");
  const button = page.getByRole("button", { name: "Add text", exact: true });
  await button.focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Find a PDF task", exact: true });
  const search = dialog.getByRole("textbox", { name: "Search PDF tasks" });
  await expect(search).toBeFocused();
  await search.fill("remove pages");
  await expect(dialog.locator(".command-palette__results a").first()).toContainText("Remove pages");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
});


test("tool search supports arrow navigation, Enter, and empty results", async ({ page }) => {
  await page.goto("#/home");
  await page.getByRole("button", { name: "Open command palette" }).click();
  const dialog = page.getByRole("dialog", { name: "Find a PDF task", exact: true });
  const input = dialog.getByRole("textbox", { name: "Search PDF tasks" });
  await input.fill("zzzz-no-such-task");
  await input.press("Enter");
  await expect(dialog).toBeVisible();
  await input.fill("PDF");
  const links = dialog.getByRole("link");
  await input.press("ArrowDown");
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(input).toBeFocused();
  await input.fill("remove pages");
  await input.press("Enter");
  await expect(page).toHaveURL(/#\/quick\/remove-pages$/);
  await expect(page.getByRole("heading", { name: "Remove pages", exact: true })).toBeVisible();
});

test("reader sidebar uses one labelled panel control instead of tab navigation", async ({ page }) => {
  await openSample(page);
  const panel = page.getByRole("combobox", { name: "Reader panel", exact: true });
  await panel.selectOption("info");
  await expect(page.locator("#viewer-sidebar-panel")).toBeVisible();
  await expect(page.locator("#viewer-sidebar-panel .info-list").first()).toBeVisible();
  await panel.selectOption("search");
  await expect(page.locator("#viewer-sidebar-panel input[type=search]")).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
});


test("reader zoom keeps every button-selected scale visible", async ({ page }) => {
  await openSample(page);
  const zoom = page.getByRole("combobox", { name: "Zoom", exact: true });
  await zoom.selectOption("1.5");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(zoom.locator("option:checked")).toHaveText("175%");
  await zoom.selectOption("0.5");
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(zoom.locator("option:checked")).toHaveText("25%");
  await zoom.selectOption("4");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(zoom.locator("option:checked")).toHaveText("400%");
});
