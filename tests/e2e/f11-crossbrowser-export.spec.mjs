import { mkdir, readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { chooseEditorTool, switchMode } from "./helpers/taskFirst";

const source = "tests/corpus/p8";
const output = "artifacts/f11-exports";
test.setTimeout(120_000);

async function openAndEdit(page, name) {
  await page.goto("./#/tools/read-pdf");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(source + "/" + name + ".pdf");
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await switchMode(page, "editor");
  const canvas = page.locator(".editor-page-layers");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await chooseEditorTool(page, "Rectangle");
  const box = await canvas.boundingBox();
  if (!box || box.width < 180 || box.height < 120) throw new Error("No drawable PDF editor page");
  await page.mouse.move(box.x + 45, box.y + 45);
  await page.mouse.down();
  await page.mouse.move(box.x + 135, box.y + 95, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible({ timeout: 15000 });
}

for (const name of ["rotated-crop", "nonzero-origin"]) {
  test("F11 independently verifiable real " + name + " export", async ({ page }, testInfo) => {
    await openAndEdit(page, name);
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF", exact: true }).click();
    const download = await event;
    expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
    await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 25000 });
    const folder = output + "/" + testInfo.project.name;
    await mkdir(folder, { recursive: true });
    const filename = folder + "/" + name + "-edited.pdf";
    await download.saveAs(filename);
    const bytes = await readFile(filename);
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(100);
    await expect(page.getByText(/P8 fidelity validation failed/i)).toHaveCount(0);
  });
}

test("F11 AES-256 protected document unlock, storage privacy and subsequent import", async ({ page }) => {
  await page.goto("./#/tools/read-pdf");
  const input = page.locator('input[type="file"][accept*="pdf"]').first();
  await input.setInputFiles("tests/corpus/generated/encrypted-aes256.pdf");
  await expect(page.getByRole("heading", { name: "This PDF needs a password" })).toBeVisible();
  await page.getByLabel("PDF password", { exact: true }).fill("phase11-user");
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(page.getByText("ENCRYPTED_FIXTURE", { exact: true })).toBeVisible({ timeout: 25000 });
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain("phase11-user");
  await page.goto("./#/tools/read-pdf");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles("tests/corpus/generated/plain-text.pdf");
  await expect(page.getByText("PLAIN_PAGE_1_MARKER", { exact: true })).toBeVisible({ timeout: 25000 });
});

test("F11 malformed PDF rejection preserves ability to open a valid PDF", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("./#/tools/read-pdf");
  const input = page.locator('input[type="file"][accept*="pdf"]').first();
  await input.setInputFiles({
    name: "corrupted.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\ninvalid cross-reference and missing trailer\n", "utf8")
  });
  await expect(page.getByRole("alert")).toContainText("Could not open the PDF", { timeout: 25000 });
  await expect(page.getByRole("button", { name: "Choose PDF", exact: true })).toBeEnabled();
  await input.setInputFiles("tests/corpus/generated/plain-text.pdf");
  await expect(page.getByText("PLAIN_PAGE_1_MARKER", { exact: true })).toBeVisible({ timeout: 25000 });
  expect(pageErrors).toEqual([]);
});
