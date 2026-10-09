import { mkdir, readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { chooseEditorTool, switchMode } from "./helpers/taskFirst";

const outDir = "artifacts/f10-exports";
const corpus = "tests/corpus/f10";
test.setTimeout(120_000);

async function captureDownload(page, click, filename, browserProject) {
  const pending = page.waitForEvent("download");
  await click();
  const download = await pending;
  const projectDir = outDir + "/" + browserProject;
  await mkdir(projectDir, { recursive: true });
  await download.saveAs(projectDir + "/" + filename);
  const bytes = await readFile(projectDir + "/" + filename);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(100);
}

async function openSource(page, filename) {
  await page.goto("./#/tools/read-pdf");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(corpus + "/" + filename);
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
}

async function drawRectangle(page) {
  await switchMode(page, "editor");
  const canvas = page.locator(".editor-page-layers");
  await expect(canvas).toBeVisible({ timeout: 25000 });
  await chooseEditorTool(page, "Rectangle");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Missing PDF editor canvas");
  await page.mouse.move(bounds.x + 60, bounds.y + 60);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 170, bounds.y + 120, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
}

for (const filename of ["forms.pdf", "comments-measurements.pdf"]) {
  test("F10 real edited browser export preserves " + filename, async ({ page }, testInfo) => {
    await openSource(page, filename);
    await drawRectangle(page);
    await captureDownload(page, () => page.getByRole("button", { name: "Download PDF", exact: true }).click(), filename, testInfo.project.name);
    await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 25000 });
  });
}

test("F10 actual consumer optimization export", async ({ page }, testInfo) => {
  await page.goto("./#/quick/compress-pdf");
  await page.locator('input[type="file"]').first().setInputFiles(corpus + "/optimization.pdf");
  await page.getByRole("button", { name: "Compress PDF", exact: true }).click();
  const result = page.getByRole("region", { name: "Your files are ready" });
  await expect(result).toBeVisible({ timeout: 75000 });
  await captureDownload(page, () => result.getByRole("button", { name: "Download PDF" }).click(), "optimization.pdf", testInfo.project.name);
});

test("F10 two real independent F6 batch exports", async ({ page }, testInfo) => {
  await page.goto("./#/batch");
  const choose = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add PDFs" }).click();
  await (await choose).setFiles([corpus + "/batch-alpha.pdf", corpus + "/batch-beta.pdf"]);
  await expect(page.locator(".batch-item")).toHaveCount(2);
  await page.getByRole("button", { name: "Run workflow" }).click();
  await expect(page.locator(".batch-item--complete")).toHaveCount(2, { timeout: 90000 });
  for (const filename of ["batch-alpha.pdf", "batch-beta.pdf"]) {
    const row = page.locator(".batch-item").filter({ hasText: filename });
    await captureDownload(page, () => row.getByRole("button", { name: "Download", exact: true }).click(), filename, testInfo.project.name);
  }
  await expect(page.getByRole("button", { name: "Download run report" })).toBeEnabled();
});

test("F10 real inspector CSV includes existing AcroForm names and values", async ({ page }, testInfo) => {
  await openSource(page, "forms.pdf");
  const match = page.url().match(/#\/workspace\/([^/]+)\/viewer/);
  expect(match).not.toBeNull();
  await page.goto("./#/workspace/" + match[1] + "/inspector");
  await expect(page.getByRole("heading", { name: "Document structure report" })).toBeVisible();
  const button = page.getByRole("button", { name: "Export form data CSV", exact: true });
  await expect(button).toBeEnabled({ timeout: 60000 });
  const event = page.waitForEvent("download");
  await button.click();
  const csv = await readFile(await (await event).path());
  const text = csv.toString("utf-8");
  expect(text).toContain("contact.email");
  expect(text).toContain("ada@example.test");
  expect(text).toContain("Contact email");
});
