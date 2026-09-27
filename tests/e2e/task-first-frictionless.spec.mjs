import { expect, test } from "@playwright/test";
import mupdf from "mupdf";
import { readFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";

function fixture(label = "Page", count = 3, password) {
  const pdf = new mupdf.PDFDocument(); const font = new mupdf.Font("Helvetica");
  try {
    const embedded = pdf.addSimpleFont(font);
    for (let number = 1; number <= count; number++) pdf.insertPage(-1, pdf.addPage([0, 0, 300, 400], 0, { Font: { F1: embedded } }, `BT /F1 16 Tf 35 330 Td (${label} ${number}) Tj ET`));
    const output = pdf.saveToBuffer(password ? { encrypt: "aes-256", "user-password": password, "owner-password": password } : {});
    try { return Buffer.from(output.asUint8Array()); } finally { output.destroy(); }
  } finally { pdf.destroy(); font.destroy(); }
}
const file = (name, buffer = fixture()) => ({ name, mimeType: "application/pdf", buffer });
function image() { const canvas = createCanvas(180, 100); const context = canvas.getContext("2d"); context.fillStyle = "#225544"; context.fillRect(0, 0, 180, 100); return { name: "cover.png", mimeType: "image/png", buffer: canvas.toBuffer("image/png") }; }
async function download(page, label = "Download PDF") { const pending = page.waitForEvent("download"); await page.getByRole("button", { name: label, exact: true }).click(); const result = await pending; return readFile(await result.path()); }
function inspect(bytes) {
  const pdf = mupdf.Document.openDocument(bytes, "application/pdf");
  try { return Array.from({ length: pdf.countPages() }, (_, index) => { const page = pdf.loadPage(index); try { const structured = page.toStructuredText(); try { return { text: structured.asText().trim(), bounds: page.getBounds() }; } finally { structured.destroy(); } } finally { page.destroy(); } }); } finally { pdf.destroy(); }
}
async function choose(page, task, files) { await page.goto(`./#/quick/${task}`); await page.locator('input[type="file"]').setInputFiles(files); }
async function capture(page, info, name) { await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" }); }
async function noOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1); }
test.setTimeout(90_000);

test("file-first mixed assembly preserves PDF text and image order", async ({ page }, info) => {
  await page.goto("./#/home"); await page.getByLabel("Choose files to get started", { exact: true }).setInputFiles([image(), file("report.pdf")]);
  await expect(page.getByRole("button", { name: /^Compare PDFs/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Merge PDFs/ }).click();
  await expect(page.locator(".task-file-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Merge PDFs", exact: true }).click();
  const result = inspect(await download(page)); expect(result).toHaveLength(4); expect(result.map((p) => p.text)).toEqual(["", "Page 1", "Page 2", "Page 3"]);
  await capture(page, info, "14-mixed-files-result");
});

test("visual page composition supports order, rotation, blanks, removal and undo", async ({ page }, info) => {
  await choose(page, "organize-pages", file("report.pdf"));
  const assembly = page.getByRole("region", { name: "Arrange output pages" }); await expect(assembly).toBeVisible();
  await assembly.getByRole("button", { name: "Reverse order", exact: true }).click();
  await assembly.getByRole("button", { name: "Rotate output page 1", exact: true }).click();
  await assembly.getByRole("button", { name: "Add blank page", exact: true }).click();
  await page.getByLabel("Select output page 2", { exact: true }).check();
  await assembly.getByRole("button", { name: "Remove selected (1)", exact: true }).click();
  await assembly.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".assembly-card")).toHaveCount(4);
  await capture(page, info, "15-page-composition");
  await page.getByRole("button", { name: "Save arranged PDF", exact: true }).click();
  const result = inspect(await download(page)); expect(result.map((p) => p.text)).toEqual(["Page 3", "Page 2", "Page 1", ""]); expect(result[0].bounds).toEqual([0, 0, 400, 300]); expect(result[3].bounds[3]).toBeGreaterThan(800);
});

test("replace with file uses selected position and can be undone", async ({ page }) => {
  await choose(page, "organize-pages", file("original.pdf"));
  const second = page.locator(".assembly-card").nth(1); await second.locator("summary").click();
  const picker = page.waitForEvent("filechooser"); await second.getByRole("button", { name: "Replace with file…", exact: true }).click();
  await (await picker).setFiles(file("replacement.pdf", fixture("Replacement", 2)));
  await expect(page.locator(".assembly-card")).toHaveCount(4);
  await page.getByRole("region", { name: "Arrange output pages" }).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".assembly-card")).toHaveCount(3);
  await page.getByRole("region", { name: "Arrange output pages" }).getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".assembly-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Save arranged PDF", exact: true }).click();
  expect(inspect(await download(page)).map((p) => p.text)).toEqual(["Page 1", "Replacement 1", "Replacement 2", "Page 3"]);
});

test("two file-first PDFs reach comparison without selecting files again", async ({ page }, info) => {
  await page.goto("./#/home"); await page.getByLabel("Choose files to get started", { exact: true }).setInputFiles([file("original.pdf", fixture("Before", 2)), file("revised.pdf", fixture("After", 2))]);
  await page.getByRole("button", { name: /^Compare PDFs/ }).click();
  await expect(page.getByRole("button", { name: /original.pdf/ })).toBeVisible(); await expect(page.getByRole("button", { name: /revised.pdf/ })).toBeVisible();
  await page.getByRole("button", { name: "Find differences", exact: true }).click();
  await expect(page.getByRole("button", { name: "Find differences", exact: true })).toBeEnabled({ timeout: 30000 });
  await expect(page.locator(".compare-alignment").first()).toBeVisible();
  await capture(page, info, "16-comparison");
});

test("visual crop changes only the selected page and keeps numeric fields in sync", async ({ page }, info) => {
  await choose(page, "crop-pages", file("report.pdf"));
  await page.getByLabel("Preview page", { exact: true }).fill("2");
  const stage = page.getByRole("group", { name: "Drag to select the area to keep" }); await expect(page.getByAltText("Page 2 crop preview", { exact: true })).toBeVisible();
  const box = await stage.boundingBox(); expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width * .1, box.y + box.height * .1); await page.mouse.down(); await page.mouse.move(box.x + box.width * .9, box.y + box.height * .9, { steps: 6 }); await page.mouse.up();
  expect(Number(await page.getByLabel("Top margin (mm)", { exact: true }).inputValue())).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Crop only this page", exact: true }).click();
  await expect(page.getByLabel("Pages to crop", { exact: true })).toHaveValue("2");
  await capture(page, info, "17-visual-crop");
  await page.getByRole("button", { name: "Crop PDF", exact: true }).click();
  const result = inspect(await download(page)); expect(result).toHaveLength(3); expect(result[0].bounds).toEqual([0, 0, 300, 400]); expect(result[1].bounds[2]).toBeCloseTo(240, 0); expect(result[1].bounds[3]).toBeCloseTo(320, 0); expect(result[2].bounds).toEqual([0, 0, 300, 400]);
});

test("latest editor text survives immediate tool handoff and real PDF export", async ({ page }, info) => {
  await page.goto("./#/tools/edit-pdf"); await page.locator('input[type="file"]').setInputFiles(file("editable.pdf"));
  await expect(page.locator(".editor-stage canvas").first()).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  const layer = page.locator(".editor-page-layers"); const box = await layer.boundingBox(); expect(box).toBeTruthy();
  await page.mouse.move(box.x + 40, box.y + 140); await page.mouse.down(); await page.mouse.move(box.x + 240, box.y + 200, { steps: 4 }); await page.mouse.up();
  await page.getByLabel("Content", { exact: true }).fill("LATEST EDIT SURVIVES");
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  await page.getByRole("dialog", { name: "Document actions" }).getByRole("button", { name: /^Compress PDF/ }).click();
  await expect(page).toHaveURL(/quick\/compress-pdf$/, { timeout: 30000 });
  await page.getByRole("button", { name: "Compress PDF", exact: true }).click();
  expect(inspect(await download(page)).map((p) => p.text).join("\n")).toContain("LATEST EDIT SURVIVES");
  await capture(page, info, "18-edited-document-continuity");
});

test("form task opens directly and pending values survive another tool", async ({ page }, info) => {
  await page.goto("./#/tools/fill-forms"); await page.locator('input[type="file"]').setInputFiles("tests/corpus/generated/forms.pdf");
  const form = page.locator('.security-task-workflow[data-security-task="forms"]'); await expect(form).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.security-tabs,[role="tablist"]')).toHaveCount(0);
  await page.getByLabel("full_name", { exact: true }).fill("New value before autosave");
  await capture(page, info, "19-form-filling");
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  await page.getByRole("dialog", { name: "Document actions" }).getByRole("button", { name: /^Compress PDF/ }).click();
  await expect(page).toHaveURL(/quick\/compress-pdf$/, { timeout: 30000 }); await page.getByRole("button", { name: "Compress PDF", exact: true }).click();
  const pdf = mupdf.Document.openDocument(await download(page), "application/pdf");
  try { const first = pdf.loadPage(0); try { const widgets = first.getWidgets(); try { expect(widgets.find((widget) => widget.getName() === "full_name").getValue()).toBe("New value before autosave"); } finally { widgets.forEach((widget) => widget.destroy()); } } finally { first.destroy(); } } finally { pdf.destroy(); }
});

test("flat forms provide a direct editor fallback instead of a dead end", async ({ page }) => {
  await page.goto("./#/tools/fill-forms"); await page.locator('input[type="file"]').setInputFiles(file("flat-form.pdf", fixture("Name", 1)));
  await page.getByRole("link", { name: "Fill with text in the editor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add text", exact: true })).toBeVisible({ timeout: 30000 });
});

test("multiple PDFs compress to independently readable ZIP entries", async ({ page }) => {
  await choose(page, "compress-pdf", [file("first.pdf", fixture("First", 2)), file("second.pdf", fixture("Second", 1))]);
  await page.getByRole("button", { name: "Compress PDF", exact: true }).click(); const zip = await download(page, "Download all as ZIP");
  const entries = []; let offset = 0;
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) { expect(zip.readUInt16LE(offset + 8)).toBe(0); const size = zip.readUInt32LE(offset + 18); const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28); entries.push(zip.subarray(start, start + size)); offset = start + size; }
  expect(entries).toHaveLength(2); expect(inspect(entries[0]).map((p) => p.text)).toEqual(["First 1", "First 2"]); expect(inspect(entries[1])[0].text).toBe("Second 1");
});

test("mobile composition and crop stay within the viewport with touch-sized controls", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await choose(page, "organize-pages", file("mobile.pdf"));
  await expect(page.locator(".assembly-card")).toHaveCount(3); await noOverflow(page);
  const rotate = page.getByRole("button", { name: "Rotate output page 1", exact: true }); expect((await rotate.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await capture(page, info, "20-mobile-pages"); await page.setViewportSize({ width: 320, height: 740 }); await noOverflow(page);
  await choose(page, "crop-pages", file("mobile.pdf")); await expect(page.locator(".crop-stage")).toBeVisible(); await noOverflow(page); await capture(page, info, "21-mobile-crop");
});
