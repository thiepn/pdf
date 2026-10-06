import { expect, test } from "@playwright/test";

test("help opens the named modern tools and keeps limitations next to conversion and redaction instructions", async ({ page }) => {
  for (const [article, task, heading] of [
    ["word-export", "pdf-to-docx", "PDF to Word"],
    ["page-tools", "crop-pages", "Crop pages"],
    ["cleanup", "sanitize-pdf", "Clean up PDF"]
  ]) {
    await page.goto("./#/help");
    const instructions = page.locator(`#${article}`);
    if (article === "word-export") await expect(instructions).toContainText("Exact PDF line wrapping");
    if (article === "page-tools") await expect(instructions).toContainText("does not securely erase");
    await instructions.getByRole("link", { name: `Open ${heading}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/quick/${task}$`));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await page.goto("./#/help");
  await page.getByRole("textbox", { name: "Search help articles" }).fill("permanent removal");
  await expect(page.locator("#redaction")).toContainText("A mark is not permanent removal");
  await expect(page.locator("#word-export")).toHaveCount(0);
});
