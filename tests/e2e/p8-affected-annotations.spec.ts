import { expect, test, type Page, type Download, type TestInfo } from "@playwright/test";
import * as mupdf from "mupdf";
// @ts-ignore Node-only browser fixture storage
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
// @ts-ignore Node-only test paths
import { tmpdir } from "node:os";
// @ts-ignore Node-only test paths
import { join } from "node:path";
import { chooseDocumentTask, chooseEditorTool, downloadEditorCopy, switchMode } from "./helpers/taskFirst";

const dir = mkdtempSync(join(tmpdir(), "p8-link-annotation-"));
function makeSource(): Uint8Array {
  const doc = mupdf.Document.openDocument(new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf")), "application/pdf").asPDF()!;
  try {
    const page = doc.loadPage(0) as mupdf.PDFPage;
    try {
      const comment = page.createAnnotation("Text");
      comment.setRect([42, 78, 78, 107]);
      comment.setContents("Preserve review note");
      comment.update();
      page.update();
    } finally { page.destroy(); }
    const buffer = doc.saveToBuffer();
    try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally { doc.destroy(); }
}
const source = join(dir, "source.pdf");
writeFileSync(source, makeSource());

function reopen(path: string) {
  const doc = mupdf.Document.openDocument(new Uint8Array(readFileSync(path)), "application/pdf").asPDF()!;
  try {
    const pages = Array.from({length:doc.countPages()},(_,index)=>{
      const page=doc.loadPage(index) as mupdf.PDFPage;
      try {
        return {
          links:page.getLinks().map((link)=>link.getURI()).sort(),
          annotations:page.getAnnotations().map((annotation)=>({type:annotation.getType(),contents:annotation.getContents()}))
        };
      } finally { page.destroy(); }
    });
    return pages;
  } finally { doc.destroy(); }
}
const expected = reopen(source);
async function upload(page: Page) {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file",{exact:true}).setInputFiles(source);
  await expect(page.locator(".viewer-app")).toBeVisible({timeout:20000});
}
async function secure(page: Page) {
  await upload(page);
  await chooseDocumentTask(page,"Fill or create PDF forms");
  await expect(page.locator(".security-app")).toBeVisible({timeout:20000});
}
async function save(download: Download, info: TestInfo, name: string) {
  const target=info.outputPath(name);
  await download.saveAs(target);
  return reopen(target);
}
async function exportSecure(page: Page,info:TestInfo,name:string) {
  const pending=page.waitForEvent("download",{timeout:22000});
  await page.getByRole("button",{name:"Download PDF",exact:true}).click();
  return save(await pending,info,name);
}
async function showCleanUp(page: Page) {
  await page.locator(".security-other-tasks > summary").click();
  await page.getByLabel("Settings to show").selectOption("sanitize");
}
test.setTimeout(60000);

test("P8 affected annotations: unrelated Editor rectangle preserves link targets and review note", async({page},info)=>{
  await upload(page);
  await switchMode(page,"editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({timeout:20000});
  await chooseEditorTool(page,"Rectangle");
  const rect=await page.locator(".editor-page-layers").boundingBox();
  expect(rect).not.toBeNull();if(!rect)return;
  await page.mouse.move(rect.x+50,rect.y+65);await page.mouse.down();
  await page.mouse.move(rect.x+135,rect.y+110,{steps:4});await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
  const result=await save(await downloadEditorCopy(page),info,"editor-preserved.pdf");
  expect(result[0].links).toEqual(expected[0].links);
  expect(result[0].annotations.filter(x=>x.type==="Text")).toEqual(expected[0].annotations);
  expect(result.slice(1).map(x=>x.links)).toEqual(expected.slice(1).map(x=>x.links));
});

test("P8 affected annotations: default Secure export preserves existing links and comment",async({page},info)=>{
  await secure(page);
  const result=await exportSecure(page,info,"secure-preserved.pdf");
  expect(result).toEqual(expected);
});
test("P8 affected annotations: explicit Secure remove links removes links but keeps comment",async({page},info)=>{
  await secure(page);
  await showCleanUp(page);
  await page.getByRole("checkbox",{name:/Remove all page links/i}).check();
  const result=await exportSecure(page,info,"secure-remove-links.pdf");
  expect(result.every(x=>x.links.length===0)).toBe(true);
  expect(result[0].annotations.filter(x=>x.type==="Text")).toEqual(expected[0].annotations);
});
test("P8 affected annotations: explicit Secure remove comments keeps original link targets",async({page},info)=>{
  await secure(page);
  await showCleanUp(page);
  await page.getByRole("checkbox",{name:/Remove page annotations and comments/i}).check();
  const result=await exportSecure(page,info,"secure-remove-comments.pdf");
  expect(result[0].links).toEqual(expected[0].links);
  expect(result[0].annotations.filter(x=>x.type==="Text")).toHaveLength(0);
});


test("P8 affected annotations: Editor authorizes a new web link without losing the original",async({page},info)=>{
  await upload(page);
  await switchMode(page,"editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({timeout:20000});
  await chooseEditorTool(page,"Link");
  const box=await page.locator(".editor-page-layers").boundingBox();
  expect(box).not.toBeNull();if(!box)return;
  await page.mouse.move(box.x+85,box.y+140);await page.mouse.down();
  await page.mouse.move(box.x+165,box.y+171,{steps:4});await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
  await page.locator(".property-section").getByLabel("Target",{exact:true}).fill("https://example.org/new-approved");
  const result=await save(await downloadEditorCopy(page),info,"editor-new-link.pdf");
  expect(result[0].links).toContain("https://example.org/new-approved");
  expect(result[0].links).toContain("https://example.invalid/local");
  expect(result[0].links).toHaveLength(expected[0].links.length+1);
  expect(result[0].annotations.filter(x=>x.type==="Text")).toEqual(expected[0].annotations);
});
test("P8 affected annotations: Editor creates a new comment without changing the original",async({page},info)=>{
  await upload(page);
  await switchMode(page,"editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({timeout:20000});
  await chooseEditorTool(page,"Comment");
  const box=await page.locator(".editor-page-layers").boundingBox();
  expect(box).not.toBeNull();if(!box)return;
  await page.mouse.click(box.x+95,box.y+160);
  await expect(page.getByText(/1 added object/)).toBeVisible();
  await page.getByRole("textbox",{name:"Comment",exact:true}).fill("Added through Editor and authorized");
  const result=await save(await downloadEditorCopy(page),info,"editor-new-note.pdf");
  const comments=result[0].annotations.filter(x=>x.type==="Text");
  expect(comments.map(x=>x.contents)).toContain("Preserve review note");
  expect(comments.map(x=>x.contents)).toContain("Added through Editor and authorized");
  expect(result[0].links).toEqual(expected[0].links);
});
