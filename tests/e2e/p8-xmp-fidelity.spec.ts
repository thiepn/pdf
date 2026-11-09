import { expect, test, type Page, type TestInfo } from "@playwright/test";
import * as mupdf from "mupdf";
// @ts-ignore Node-only test fixtures
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
// @ts-ignore Node-only test paths
import { tmpdir } from "node:os";
// @ts-ignore Node-only test paths
import { join } from "node:path";
import { chooseDocumentTask, chooseEditorTool, downloadEditorCopy, switchMode } from "./helpers/taskFirst";

const dir = mkdtempSync(join(tmpdir(), "pdfstudio-p8-xmp-"));
const xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:qa="https://thiepn.dev/qa/"><qa:provenance>REAL-BROWSER-XMP-PROVENANCE</qa:provenance></rdf:Description></rdf:RDF></x:xmpmeta>';

function createFixture() {
  const pdf = mupdf.Document.openDocument(new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf")), "application/pdf").asPDF()!;
  try {
    pdf.getTrailer().get("Root").put("Metadata", pdf.addStream(xml, { Type: pdf.newName("Metadata"), Subtype: pdf.newName("XML") }));
    const buffer = pdf.saveToBuffer();
    try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally { pdf.destroy(); }
}
const input = join(dir, "xmp-source.pdf");
writeFileSync(input, createFixture());

function getXmp(path: string): string {
  const pdf = mupdf.Document.openDocument(new Uint8Array(readFileSync(path)), "application/pdf").asPDF()!;
  try {
    const metadata = pdf.getTrailer().get("Root").get("Metadata");
    if (!metadata.isStream()) return "";
    const buffer = metadata.readStream();
    try { return new TextDecoder().decode(buffer.asUint8Array()); }
    finally { buffer.destroy(); }
  } finally { pdf.destroy(); }
}
async function upload(page: Page) {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", {exact:true}).setInputFiles(input);
  await expect(page.locator(".viewer-app")).toBeVisible({timeout:20000});
}
async function save(download: import("@playwright/test").Download, info: TestInfo, name: string): Promise<string> {
  const file = info.outputPath(name);
  await download.saveAs(file);
  return file;
}
test.setTimeout(55000);

test("P8 XMP: ordinary Editor rectangle preserves unrelated XMP provenance", async ({page},info) => {
  await upload(page);
  await switchMode(page,"editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({timeout:20000});
  await chooseEditorTool(page,"Rectangle");
  const rect=await page.locator(".editor-page-layers").boundingBox();
  expect(rect).not.toBeNull();if(!rect)return;
  await page.mouse.move(rect.x+45,rect.y+56);await page.mouse.down();
  await page.mouse.move(rect.x+120,rect.y+100,{steps:4});await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
  const dl=await downloadEditorCopy(page);
  const output=await save(dl,info,"editor-xmp.pdf");
  expect(getXmp(output)).toBe(xml);
});

test("P8 XMP: Secure form export preserves XMP unless clearing is requested", async ({page},info) => {
  await upload(page);
  await chooseDocumentTask(page,"Fill or create PDF forms");
  await expect(page.locator(".security-app")).toBeVisible({timeout:20000});
  const pending=page.waitForEvent("download",{timeout:22000});
  await page.getByRole("button",{name:"Download PDF",exact:true}).click();
  const output=await save(await pending,info,"secure-xmp.pdf");
  expect(getXmp(output)).toBe(xml);
});

test("P8 XMP: explicit Secure metadata removal clears catalog XMP", async ({page},info) => {
  await upload(page);
  await chooseDocumentTask(page,"Fill or create PDF forms");
  await expect(page.locator(".security-app")).toBeVisible({timeout:20000});
  await page.locator(".security-other-tasks > summary").click();
  await page.getByLabel("Settings to show").selectOption("sanitize");
  await page.getByRole("checkbox",{name:/Remove metadata/i}).check();
  const pending=page.waitForEvent("download",{timeout:22000});
  await page.getByRole("button",{name:"Download PDF",exact:true}).click();
  const output=await save(await pending,info,"secure-cleared-xmp.pdf");
  expect(getXmp(output)).toBe("");
});
