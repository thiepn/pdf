import { expect, test, type Download, type Page, type TestInfo } from "@playwright/test";
import * as mupdf from "mupdf";
// @ts-ignore Node-only fixture I/O
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
// @ts-ignore Node-only fixture paths
import { tmpdir } from "node:os";
// @ts-ignore Node-only fixture paths
import { join } from "node:path";
import { chooseDocumentTask, chooseEditorTool, downloadEditorCopy, switchMode } from "./helpers/taskFirst";
import { createP17NativeFidelityPdf } from "../../src/fixtures/p17NativeFidelityPdf";

const dir = mkdtempSync(join(tmpdir(), "pdfstudio-p8-noview-"));
const filename = join(dir, "real-hidden-and-internal-links.pdf");

function fixture() {
  const pdf = mupdf.Document.openDocument(new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf")), "application/pdf").asPDF()!;
  try {
    const page = pdf.loadPage(0) as mupdf.PDFPage;
    try {
      page.createLink([105, 155, 215, 185], pdf.formatLinkURI({
        chapter: 0, page: 1, type: "Fit", x: 0, y: 0, width: 0, height: 0, zoom: 1
      }));
      const note = page.createAnnotation("Text");
      note.setRect([35, 75, 65, 108]);
      note.setContents("Confidential NoView annotation must survive");
      note.setFlags(36); // /NoView plus /Print
      note.update();
      page.update();
    } finally { page.destroy(); }
    const buffer = pdf.saveToBuffer();
    try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally { pdf.destroy(); }
}
writeFileSync(filename, fixture());

type Witness = { links: string[]; notes: Array<{ content: string; flags: number }>; pageCount: number };
function independentReopen(file: string): Witness {
  const pdf = mupdf.Document.openDocument(new Uint8Array(readFileSync(file)), "application/pdf").asPDF()!;
  try {
    const page = pdf.loadPage(0) as mupdf.PDFPage;
    try {
      return {
        links: page.getLinks().map((link) => link.getURI()).sort(),
        notes: page.getAnnotations().filter((annotation) => annotation.getType() === "Text")
          .map((annotation) => ({ content: annotation.getContents(), flags: annotation.getFlags() })),
        pageCount: pdf.countPages()
      };
    } finally { page.destroy(); }
  } finally { pdf.destroy(); }
}
const original = independentReopen(filename);
async function upload(page: Page) {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(filename);
  await expect(page.locator(".viewer-app")).toBeVisible({timeout:20000});
}
async function save(download: Download, info:TestInfo, name:string) {
  const target=info.outputPath(name);
  await download.saveAs(target);
  return independentReopen(target);
}
async function secure(page: Page) {
  await upload(page);
  await chooseDocumentTask(page, "Fill or create PDF forms");
  await expect(page.locator(".security-app")).toBeVisible({ timeout: 20000 });
}
async function downloadSecure(page: Page, info:TestInfo, name:string) {
  const event=page.waitForEvent("download",{timeout:22000});
  await page.getByRole("button",{name:"Download PDF",exact:true}).click();
  return save(await event,info,name);
}
test.setTimeout(60000);
test("P8 NoView: unrelated Editor shape preserves hidden print annotation and internal GoTo",async({page},info)=>{
  await upload(page);
  await switchMode(page,"editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({timeout:20000});
  await chooseEditorTool(page,"Rectangle");
  const bounds=await page.locator(".editor-page-layers").boundingBox();
  expect(bounds).not.toBeNull();if(!bounds)return;
  await page.mouse.move(bounds.x+55,bounds.y+95);await page.mouse.down();
  await page.mouse.move(bounds.x+135,bounds.y+146,{steps:4});await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
  const exported=await save(await downloadEditorCopy(page),info,"noview-editor-export.pdf");
  expect(exported).toEqual(original);
});
test("P8 NoView: ordinary Secure export preserves hidden print annotation and internal GoTo",async({page},info)=>{
  await secure(page);
  expect(await downloadSecure(page,info,"noview-secure-export.pdf")).toEqual(original);
});
test("P8 NoView: explicit comment cleanup removes hidden note, preserves internal GoTo",async({page},info)=>{
  await secure(page);
  await page.locator(".security-other-tasks > summary").click();
  await page.getByLabel("Settings to show").selectOption("sanitize");
  await page.getByRole("checkbox",{name:/Remove page annotations and comments/i}).check();
  const result=await downloadSecure(page,info,"noview-cleared-export.pdf");
  expect(result.notes).toEqual([]);
  expect(result.links).toEqual(original.links);
  expect(result.pageCount).toBe(original.pageCount);
});

function nativeFixture(): Uint8Array {
  const pdf = mupdf.Document.openDocument(createP17NativeFidelityPdf(), "application/pdf").asPDF()!;
  try {
    const page = pdf.loadPage(0) as mupdf.PDFPage;
    try {
      page.createLink([90, 115, 175, 147], pdf.formatLinkURI({
        chapter: 0, page: 0, type: "Fit", x: 0, y: 0, width: 0, height: 0, zoom: 1
      }));
      const note = page.createAnnotation("Text");
      note.setRect([38, 90, 66, 119]);
      note.setContents("P17 hidden review note remains in PDF");
      note.setFlags(36);
      note.update();
      page.update();
    } finally { page.destroy(); }
    const bytes = pdf.saveToBuffer();
    try { return Uint8Array.from(bytes.asUint8Array()); } finally { bytes.destroy(); }
  } finally { pdf.destroy(); }
}
const nativeFilename = join(dir, "p17-native-with-hidden-note-and-link.pdf");
writeFileSync(nativeFilename, nativeFixture());
const nativeOriginal = independentReopen(nativeFilename);

test("P8 NoView: native text edit keeps hidden note and internal link target",async({page},info)=>{
  test.setTimeout(90000);
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file",{exact:true}).setInputFiles(nativeFilename);
  await expect(page.locator(".viewer-app")).toBeVisible({timeout:20000});
  await switchMode(page,"editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({timeout:20000});
  const selected = page.getByRole("button",{name:/Select existing (?:text|paragraph):.*Left opening paragraph/i}).first();
  await expect(selected).toBeVisible({timeout:25000});
  await selected.click();
  const props=page.locator(".native-unified-properties");
  const input=props.locator("textarea").first();
  await expect(input).toBeVisible();
  await input.fill("Left opening updated.");
  await props.getByRole("button",{name:/Apply (?:text|paragraph|layout-aware text) change/}).click();
  await expect(page.locator(".native-queued-count").filter({hasText:/\d+ PDF edit(?:s)? ready/})).toHaveCount(1);
  const result=await save(await downloadEditorCopy(page),info,"native-hidden-internal-link.pdf");
  expect(result).toEqual(nativeOriginal);
});
