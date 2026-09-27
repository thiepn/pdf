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
