import { expect, test } from "@playwright/test";
import mupdf from "mupdf";
import { readFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";

function fixture({ password, annotated = false, rotation = 0, active = false } = {}) {
  const pdf = new mupdf.PDFDocument(), font = new mupdf.Font("Helvetica");
  try {
    const embedded = pdf.addSimpleFont(font);
    for (let index = 1; index <= 3; index++) pdf.insertPage(-1, pdf.addPage([10, 20, 310, 420], rotation, { Font: { F1: embedded } }, `BT /F1 16 Tf 40 330 Td (DOCUMENT PAGE ${index}) Tj ET`));
    pdf.setMetaData("info:Title", "PRIVATE DOCUMENT TITLE");
    pdf.setMetaData("info:Author", "PRIVATE AUTHOR");
    if (annotated) {
      const page = pdf.loadPage(0), note = page.createAnnotation("FreeText"), object = page.getObject();
      note.setRect([20, 65, 270, 110]); note.setContents("VISIBLE NOTE"); note.update();
      page.createLink([20, 115, 270, 135], "https://example.org/");
      const widget = pdf.addObject({ Type: "Annot", Subtype: "Widget", FT: "Tx", T: pdf.newString("contact"), V: pdf.newString("VISIBLE FORM VALUE"), Rect: [30, 180, 270, 215], P: object, F: 4, DA: pdf.newString("/Helv 14 Tf 0 g") });
      object.get("Annots").push(widget);
      pdf.getTrailer().get("Root").put("AcroForm", { Fields: [widget], DR: { Font: { Helv: embedded } } });
      page.update(); widget.destroy(); object.destroy(); note.destroy(); page.destroy();
    }
    if (active) {
      pdf.getTrailer().get("Root").put("OpenAction", { S: "JavaScript", JS: pdf.newString("app.alert('DO NOT EXECUTE')") });
      const metadata = pdf.addStream('<x:xmpmeta xmlns:x="adobe:ns:meta/">PRIVATE XMP</x:xmpmeta>', { Type: "Metadata", Subtype: "XML" });
      pdf.getTrailer().get("Root").put("Metadata", metadata); metadata.destroy();
    }
    const result = pdf.saveToBuffer(password ? { encrypt: "aes-256", "user-password": password, "owner-password": password } : {});
    try { return Buffer.from(result.asUint8Array()); } finally { result.destroy(); embedded.destroy(); }
  } finally { font.destroy(); pdf.destroy(); }
}
const file = (buffer = fixture(), name = "source.pdf") => ({ name, mimeType: "application/pdf", buffer });
async function upload(page, task, bytes = fixture()) {
  await page.goto(`./#/quick/${task}`);
  await page.locator('input[type="file"]').setInputFiles(file(bytes));
  await expect(page.getByRole("button", { name: "Change PDF", exact: true }).or(page.getByRole("button", { name: "Add more files", exact: true }))).toBeEnabled();
}
async function download(page, label = "Download PDF") {
  const event = page.waitForEvent("download"); await page.getByRole("button", { name: label, exact: true }).click();
  const result = await event; return { name: result.suggestedFilename(), bytes: await readFile(await result.path()) };
}
function inspect(bytes, callback) {
  const pdf = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
  try { return callback(pdf); } finally { pdf.destroy(); }
}
function text(pdf, index = 0) { const page = pdf.loadPage(index), value = page.toStructuredText(); try { return value.asText(); } finally { value.destroy(); page.destroy(); } }
function zipEntries(bytes) {
  const entries = new Map(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    expect(bytes.readUInt16LE(offset + 8)).toBe(0);
    const length = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"), start = offset + 30 + nameLength + extraLength;
    entries.set(name, bytes.subarray(start, start + length)); offset = start + length;
  }
  expect(bytes.readUInt32LE(offset)).toBe(0x02014b50); return entries;
}
function image() { const canvas = createCanvas(600, 800); const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 600, 800); ctx.fillStyle = "#000"; ctx.fillText("SCAN", 20, 60); return { name: "scan.png", mimeType: "image/png", buffer: canvas.toBuffer("image/png") }; }
test.setTimeout(75_000);

test("Word export creates editable OOXML in selected page order without pretending to preserve layout", async ({ page }) => {
  await upload(page, "pdf-to-docx");
  await expect(page.getByText(/not the original layout, images or editable tables/)).toBeVisible();
  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("3,1");
  await page.getByRole("textbox", { name: "Output filename" }).fill("selected.docx");
  await page.getByRole("button", { name: "Export editable text to Word", exact: true }).click();
  const result = await download(page, "Download Word document"); expect(result.name).toBe("selected.docx");
  const entries = zipEntries(result.bytes); expect(entries.has("[Content_Types].xml")).toBe(true);
  const document = entries.get("word/document.xml").toString("utf8");
  expect(document.indexOf("DOCUMENT PAGE 3")).toBeLessThan(document.indexOf("DOCUMENT PAGE 1"));
  expect(document).not.toContain("DOCUMENT PAGE 2"); expect(document).toContain('<w:br w:type="page"/>');
  expect(document).not.toContain("<w:t>selected.docx</w:t>");
});
test("flatten turns filled fields and notes into visible noninteractive page content", async ({ page }) => {
  await upload(page, "flatten-pdf", fixture({ annotated: true }));
  await page.getByRole("button", { name: "Flatten PDF", exact: true }).click();
  const result = await download(page);
  inspect(result.bytes, pdf => {
    const first = pdf.loadPage(0); try { expect(first.getWidgets()).toHaveLength(0); expect(first.getAnnotations()).toHaveLength(0); } finally { first.destroy(); }
    expect(text(pdf)).toContain("VISIBLE FORM VALUE"); expect(text(pdf)).toContain("VISIBLE NOTE"); expect(pdf.countPages()).toBe(3);
  });
});
test("cleanup removes executable actions without deleting form values", async ({ page }) => {
  await upload(page, "sanitize-pdf", fixture({ annotated: true, active: true }));
  await page.getByLabel("Also remove document metadata").check();
  await page.getByRole("button", { name: "Clean up PDF", exact: true }).click();
  const result = await download(page);
  inspect(result.bytes, pdf => {
    const root = pdf.getTrailer().get("Root"), action = root.get("OpenAction");
    expect(action.isNull()).toBe(true); expect(pdf.getMetaData("info:Author") ?? "").toBe("");
    const first = pdf.loadPage(0), widgets = first.getWidgets();
    try { expect(widgets[0].getValue()).toBe("VISIBLE FORM VALUE"); expect(text(pdf)).toContain("DOCUMENT PAGE 1"); }
    finally { widgets.forEach(w => w.destroy()); first.destroy(); action.destroy(); root.destroy(); }
  });
});
test("metadata removal deletes Info and XMP but retains document content", async ({ page }) => {
  await upload(page, "remove-metadata", fixture({ active: true }));
  await page.getByRole("button", { name: "Remove metadata", exact: true }).click();
  const result = await download(page);
  inspect(result.bytes, pdf => {
    expect(pdf.getMetaData("info:Title") ?? "").toBe(""); expect(pdf.getMetaData("info:Author") ?? "").toBe("");
    const metadata = pdf.getTrailer().get("Root").get("Metadata"); try { expect(metadata.isNull()).toBe(true); } finally { metadata.destroy(); }
    expect(text(pdf)).toContain("DOCUMENT PAGE 1");
  });
});
test("repair produces a reopened valid PDF instead of an unchecked successful download", async ({ page }) => {
  await upload(page, "repair-pdf", Buffer.concat([Buffer.from("RECOVERABLE PREFIX\n"), fixture()]));
  await page.getByRole("button", { name: "Repair PDF", exact: true }).click();
  const result = await download(page);
  inspect(result.bytes, pdf => { expect(pdf.countPages()).toBe(3); expect(text(pdf)).toContain("DOCUMENT PAGE 1"); });
});
test("numbering and Korean watermarks apply only to selected rotated pages", async ({ page }) => {
  await upload(page, "add-watermark", fixture({ rotation: 90 }));
  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("2");
  await page.getByLabel("Watermark text").fill("안녕하세요");
  await page.getByRole("button", { name: "Add watermark", exact: true }).click();
  inspect((await download(page)).bytes, pdf => { expect(text(pdf, 0)).not.toContain("안녕하세요"); expect(text(pdf, 1)).toContain("안녕하세요"); expect(text(pdf, 2)).not.toContain("안녕하세요"); });
});
test("password-protected output continues to extraction with its verified password", async ({ page }) => {
  await upload(page, "password-protect");
  await page.getByLabel("New PDF password", { exact: true }).fill("round-trip-password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("round-trip-password");
  await page.getByRole("button", { name: "Protect PDF", exact: true }).click();
  await expect(page.getByRole("region", { name: "Your files are ready" })).toBeVisible();
  await page.getByRole("button", { name: "Extract pages", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extract selected pages", exact: true })).toBeEnabled();
  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("2");
  await page.getByRole("button", { name: "Extract selected pages", exact: true }).click();
  inspect((await download(page)).bytes, pdf => { expect(pdf.countPages()).toBe(1); expect(text(pdf)).toContain("DOCUMENT PAGE 2"); });
});
test("failed multi-file selection does not append only the first accepted file", async ({ page }) => {
  await upload(page, "merge-pdfs");
  await page.locator('input[type="file"]').setInputFiles([file(fixture(), "extra.pdf"), file(Buffer.from("broken"), "broken.pdf")]);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".task-file-card")).toHaveCount(1);
  await expect(page.locator(".task-file-card")).toContainText("source.pdf");
});
test("file-first scanning receives existing images and rejects unsupported additions atomically", async ({ page }) => {
  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(image());
  await page.getByRole("button", { name: /Scan to PDF/ }).click();
  await expect(page.locator(".scan-card")).toHaveCount(1);
  await page.locator('input[type="file"][multiple]').setInputFiles([{ ...image(), name: "second.png" }, { name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") }]);
  await expect(page.getByRole("alert")).toContainText("No files were added");
  await expect(page.locator(".scan-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  inspect((await download(page)).bytes, pdf => expect(pdf.countPages()).toBe(1));
});
test("cancelled scanning keeps the inputs and publishes no partial result", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => { await new Promise(resolve => setTimeout(resolve, 800)); return original(...args); };
  });
  await page.goto("./#/scan");
  await page.locator('input[type="file"][multiple]').setInputFiles(image());
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  await page.getByRole("button", { name: "Cancel scan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cancelled. Your images and settings are unchanged.");
  await expect(page.locator(".scan-card")).toHaveCount(1); await expect(page.locator(".output-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create PDF", exact: true })).toBeEnabled();
});
test("malformed route encoding recovers to the homepage instead of crashing", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("./#/workspace/%E0%A4%A/viewer");
  await expect(page.getByRole("heading", { name: /Less work.*More done/ })).toBeVisible(); expect(errors).toEqual([]);
});
