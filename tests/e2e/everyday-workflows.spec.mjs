import { expect, test } from "@playwright/test";
import mupdf from "mupdf";
import { readFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
function fixture(count = 5, password) {
  const pdf = new mupdf.PDFDocument(); const font = new mupdf.Font("Helvetica");
  try {
    const embedded = pdf.addSimpleFont(font);
    for (let number = 1; number <= count; number++) {
      const page = pdf.addPage([0, 0, 300, 400], 0, { Font: { F1: embedded } }, `BT /F1 20 Tf 40 300 Td (Page ${number}) Tj ET`); pdf.insertPage(-1, page);
    }
    const buffer = pdf.saveToBuffer(password ? { encrypt: "aes-256", "user-password": password, "owner-password": password } : {});
    try { return Buffer.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally { pdf.destroy(); font.destroy(); }
}
async function upload(page, task, bytes = fixture(), name = "example.pdf") {
  await page.goto(`./#/quick/${task}`);
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
  await expect(page.getByRole("button", { name: "Change PDF", exact: true }).or(page.getByRole("button", { name: "Add more files", exact: true }))).toBeEnabled();
}
async function getDownload(page, label) {
  const promise = page.waitForEvent("download"); await page.getByRole("button", { name: label, exact: true }).click();
  const download = await promise; const path = await download.path(); expect(path).toBeTruthy(); return readFile(path);
}
function inspect(bytes, password) {
  const pdf = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    if (password) expect(pdf.authenticatePassword(password)).toBeTruthy();
    const text = []; const bounds = [];
    for (let index = 0; index < pdf.countPages(); index++) {
      const page = pdf.loadPage(index);
      try { const structured = page.toStructuredText(); try { text.push(structured.asText()); } finally { structured.destroy(); } bounds.push(page.getBounds()); }
      finally { page.destroy(); }
    }
    return { pages: pdf.countPages(), text, bounds };
  } finally { pdf.destroy(); }
}
function unzipStored(bytes) {
  const files = []; let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    expect(bytes.readUInt16LE(offset + 8)).toBe(0);
    const size = bytes.readUInt32LE(offset + 18); const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    files.push(bytes.subarray(start, start + size)); offset = start + size;
  }
  return files;
}
async function screenshot(page, info, name) { await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true }); }
test.setTimeout(90_000);
test("home search discovers direct everyday tools and reports unavailable Office conversion", async ({ page }, info) => {
  await page.goto("./#/home"); await page.getByRole("searchbox", { name: "Find a PDF tool" }).fill("remove pages");
  await page.locator('.home-task-card[href="#/quick/remove-pages"]').click();
  await expect(page.getByRole("heading", { name: "Remove pages", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose PDF", exact: true })).toBeVisible();
  await screenshot(page, info, "desktop-file-first");
  await page.goto("./#/home"); await page.getByRole("searchbox", { name: "Find a PDF tool" }).fill("Word");
  await expect(page.getByText(/Full-layout Office conversion, Excel and PowerPoint conversion, and Office-file import are not implemented/)).toBeVisible();
});
test("extract preserves selected order, text, and source; changing options invalidates the result", async ({ page }, info) => {
  await upload(page, "extract-pages"); await page.getByRole("textbox", { name: "Pages", exact: true }).fill("4, 2-3");
  await expect(page.getByRole("button", { name: "Page 4", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Extract selected pages", exact: true }).click();
  await expect(page.getByRole("region", { name: "Your files are ready" })).toBeVisible();
  const result = inspect(await getDownload(page, "Download PDF")); expect(result.pages).toBe(3);
  expect(result.text.map((text) => text.trim())).toEqual(["Page 4", "Page 2", "Page 3"]);
  await screenshot(page, info, "desktop-extraction-result");
  await page.getByRole("button", { name: "Edit options", exact: true }).click();
  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("1");
  await expect(page.getByRole("region", { name: "Your files are ready" })).toHaveCount(0);
  await page.getByRole("button", { name: "Extract selected pages", exact: true }).click();
  expect(inspect(await getDownload(page, "Download PDF")).text[0].trim()).toBe("Page 1");
});
test("delete keeps remaining pages and blocks deleting everything", async ({ page }) => {
  await upload(page, "remove-pages");
  await expect(page.getByRole("button", { name: "Remove selected pages", exact: true })).toBeDisabled();
  await expect(page.getByText(/Keep at least one page/)).toBeVisible();
  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("2,4");
  await page.getByRole("button", { name: "Remove selected pages", exact: true }).click();
  expect(inspect(await getDownload(page, "Download PDF")).text.map((text) => text.trim())).toEqual(["Page 1", "Page 3", "Page 5"]);
});
test("rotation only changes chosen pages and hands output to another tool without reupload", async ({ page }) => {
  await upload(page, "rotate-pdf"); await page.getByRole("textbox", { name: "Pages", exact: true }).fill("2");
  await page.getByRole("button", { name: "Rotate selected pages", exact: true }).click();
  const output = inspect(await getDownload(page, "Download PDF")); expect(output.pages).toBe(5);
  expect(output.bounds[0]).toEqual([0, 0, 300, 400]); expect(output.bounds[1]).toEqual([0, 0, 400, 300]);
  await page.getByRole("button", { name: "Extract pages", exact: true }).click();
  await expect(page).toHaveURL(/quick\/extract-pages$/); await expect(page.getByText("5 pages", { exact: false }).first()).toBeVisible();
  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("2");
  await page.getByRole("button", { name: "Extract selected pages", exact: true }).click();
  expect(inspect(await getDownload(page, "Download PDF")).bounds[0]).toEqual([0, 0, 400, 300]);
});
test("custom splitting produces actual PDFs in ZIP and individual downloads", async ({ page }, info) => {
  await upload(page, "split-pdf"); await page.getByRole("combobox", { name: "Split mode" }).selectOption("ranges");
  await page.getByRole("textbox", { name: "Page groups" }).fill("1-2; 5-3");
  await expect(page.getByText("2 PDF files will be created.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Split PDF", exact: true }).click();
  const files = unzipStored(await getDownload(page, "Download all as ZIP")); expect(files).toHaveLength(2);
  expect(inspect(files[0]).pages).toBe(2); expect(inspect(files[1]).text.map((text) => text.trim())).toEqual(["Page 5", "Page 4", "Page 3"]);
  await page.getByText("Download individual files (2)", { exact: true }).click();
  await expect(page.locator(".quick-individual button")).toHaveCount(2); await screenshot(page, info, "split-custom-results");
});
test("merge honors file ordering and downloads without opening a project", async ({ page }) => {
  await page.goto("./#/quick/merge-pdfs");
  await page.locator('input[type="file"]').setInputFiles([{ name: "first.pdf", mimeType: "application/pdf", buffer: fixture(2) }, { name: "second.pdf", mimeType: "application/pdf", buffer: fixture(1) }]);
  await page.getByRole("button", { name: "Move second.pdf up", exact: true }).click();
  await page.getByRole("button", { name: "Merge PDFs", exact: true }).click();
  expect(inspect(await getDownload(page, "Download PDF")).text.map((text) => text.trim())).toEqual(["Page 1", "Page 1", "Page 2"]);
  expect(page.url()).toContain("#/quick/merge-pdfs");
});
for (const [task, label, magic] of [["pdf-to-jpg", "Download JPG", "ffd8"], ["pdf-to-png", "Download PNG", "8950"]]) {
  test(`${task} exports the chosen page as a genuine image`, async ({ page }) => {
    await upload(page, task, fixture(1)); await page.getByRole("button", { name: task === "pdf-to-jpg" ? "Convert to JPG" : "Convert to PNG", exact: true }).click();
    const bytes = await getDownload(page, label); expect(bytes.subarray(0, 2).toString("hex")).toBe(magic); expect(bytes.length).toBeGreaterThan(500);
  });
}
test("images to PDF supports mixed orientations and explicit page sizing", async ({ page }) => {
  const canvas = createCanvas(200, 100); const ctx = canvas.getContext("2d"); ctx.fillStyle = "#339966"; ctx.fillRect(0, 0, 200, 100);
  await page.goto("./#/quick/images-to-pdf");
  await page.locator('input[type="file"]').setInputFiles({ name: "landscape.png", mimeType: "image/png", buffer: canvas.toBuffer("image/png") });
  await page.getByRole("combobox", { name: "Page size" }).selectOption("letter"); await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  const output = inspect(await getDownload(page, "Download PDF")); expect(output.pages).toBe(1); expect(output.bounds[0]).toEqual([0, 0, 792, 612]);
});
test("password protection, wrong-password retry, and authorized unlock produce correct files", async ({ page }) => {
  await upload(page, "password-protect", fixture(1));
  await page.getByLabel("New PDF password", { exact: true }).fill("correct-horse-123"); await page.getByLabel("Confirm new password", { exact: true }).fill("correct-horse-123");
  await page.getByRole("button", { name: "Protect PDF", exact: true }).click(); const encrypted = await getDownload(page, "Download PDF");
  const pdf = mupdf.Document.openDocument(encrypted, "application/pdf");
  try { expect(pdf.needsPassword()).toBeTruthy(); expect(pdf.authenticatePassword("wrong")).toBe(0); expect(pdf.authenticatePassword("correct-horse-123")).toBeTruthy(); } finally { pdf.destroy(); }
  await page.goto("./#/quick/unlock-pdf"); await page.locator('input[type="file"]').setInputFiles({ name: "locked.pdf", mimeType: "application/pdf", buffer: encrypted });
  await page.getByLabel("Existing PDF password", { exact: true }).fill("wrong"); await page.getByRole("button", { name: "Unlock for this task", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("That password did not open");
  await page.getByLabel("Existing PDF password", { exact: true }).fill("correct-horse-123"); await page.getByRole("button", { name: "Unlock for this task", exact: true }).click();
  await page.getByRole("button", { name: "Remove password", exact: true }).click();
  const unlocked = await getDownload(page, "Download PDF"); const clear = mupdf.Document.openDocument(unlocked, "application/pdf");
  try { expect(clear.needsPassword()).toBeFalsy(); expect(clear.countPages()).toBe(1); } finally { clear.destroy(); }
});
test("merging a password-protected file authenticates each source separately", async ({ page }) => {
  await page.goto("./#/quick/merge-pdfs");
  await page.locator('input[type="file"]').setInputFiles([{ name: "locked.pdf", mimeType: "application/pdf", buffer: fixture(2, "secret") }, { name: "clear.pdf", mimeType: "application/pdf", buffer: fixture(1) }]);
  await page.getByLabel("Existing PDF password", { exact: true }).fill("secret"); await page.getByRole("button", { name: "Unlock for this task", exact: true }).click();
  await page.getByRole("button", { name: "Merge PDFs", exact: true }).click(); expect(inspect(await getDownload(page, "Download PDF")).pages).toBe(3);
});
test("lossless compression never offers a larger file, and lossy mode requires consent", async ({ page }) => {
  const original = fixture(); await upload(page, "compress-pdf", original); await page.getByRole("button", { name: "Compress PDF", exact: true }).click();
  expect((await getDownload(page, "Download PDF")).length).toBeLessThanOrEqual(original.length);
  await page.getByRole("button", { name: "Edit options", exact: true }).click();
  await page.getByRole("combobox", { name: "Compression", exact: true }).selectOption("small");
  await expect(page.getByRole("button", { name: "Compress PDF", exact: true })).toBeDisabled(); await expect(page.getByRole("region", { name: "Your files are ready" })).toHaveCount(0);
});
test("text export, numbering, watermarking, and crop create usable outputs", async ({ page }) => {
  await upload(page, "pdf-to-text", fixture(1)); await page.getByRole("button", { name: "Extract text", exact: true }).click();
  expect((await getDownload(page, "Download text")).toString()).toContain("Page 1");
  await upload(page, "add-page-numbers", fixture(1)); await page.getByLabel("Start number", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Add page numbers", exact: true }).click(); expect(inspect(await getDownload(page, "Download PDF")).text[0]).toContain("8");
  await upload(page, "add-watermark", fixture(1)); await page.getByLabel("Watermark text", { exact: true }).fill("DRAFT");
  await page.getByRole("button", { name: "Add watermark", exact: true }).click(); expect(inspect(await getDownload(page, "Download PDF")).text[0]).toContain("DRAFT");
  await upload(page, "crop-pages", fixture(1)); await page.getByLabel("Top margin (mm)", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Crop PDF", exact: true }).click(); const bounds = inspect(await getDownload(page, "Download PDF")).bounds[0];
  expect(bounds[3] - bounds[1]).toBeCloseTo(400 - 10 * 72 / 25.4, 1);
});
test("mobile page selection stays on-screen and keyboard accessible", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await upload(page, "extract-pages", fixture(3));
  await page.getByRole("button", { name: "Page 2", exact: true }).focus(); await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Page 2", exact: true })).toHaveAttribute("aria-pressed", "false");
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1); await screenshot(page, info, "mobile-page-selection");
  await page.getByRole("button", { name: "Extract selected pages", exact: true }).click(); expect(inspect(await getDownload(page, "Download PDF")).pages).toBe(2);
});
