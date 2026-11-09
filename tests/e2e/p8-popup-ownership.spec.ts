import { expect, test, type Download, type Page, type TestInfo } from "@playwright/test";
import * as mupdf from "mupdf";
// @ts-ignore Node-only fixture IO
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
// @ts-ignore Node-only test path
import { tmpdir } from "node:os";
// @ts-ignore Node-only test path
import { join } from "node:path";
import { chooseDocumentTask, chooseEditorTool, downloadEditorCopy, switchMode } from "./helpers/taskFirst";

const dir=mkdtempSync(join(tmpdir(),"p8-popup-ownership-"));
const source=join(dir,"original.pdf");
function make(): Uint8Array {
  const pdf=mupdf.Document.openDocument(
    new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf")),"application/pdf").asPDF()!;
  try {
    const page=pdf.loadPage(0) as mupdf.PDFPage;
    try {
      for(let i=0;i<2;i++){
        const note=page.createAnnotation("Text");
        note.setRect([40+i*55,90,66+i*55,121]);
        note.setContents("Original comment owner "+i);
        note.update();
      }
      page.update();
    } finally {page.destroy();}
    const buffer=pdf.saveToBuffer();
    try{return Uint8Array.from(buffer.asUint8Array());}finally{buffer.destroy();}
  } finally {pdf.destroy();}
}
writeFileSync(source,make());

function inspect(file:string){
  const pdf=mupdf.Document.openDocument(new Uint8Array(readFileSync(file)),"application/pdf").asPDF()!;
  try{
    const page=pdf.loadPage(0) as mupdf.PDFPage;
    try{
      const entries=page.getObject().get("Annots");
      const byRef=new Map<number,any>();
      const list=Array.from({length:entries.length},(_,i)=>entries.get(i));
      for(const item of list)if(item.isIndirect?.())byRef.set(item.asIndirect(),item);
      const notes=list.filter(item=>item.get("Subtype").asName?.()==="Text");
      const popups=list.filter(item=>item.get("Subtype").asName?.()==="Popup");
      const pairs:string[]=[];
      for(const note of notes){
        const popupRef=note.get("Popup");
        expect(popupRef.isIndirect?.()).toBe(true);
        const popup=byRef.get(popupRef.asIndirect());
        expect(popup?.get("Subtype").asName()).toBe("Popup");
        expect(popup.get("Parent").asIndirect()).toBe(note.asIndirect());
        pairs.push(JSON.stringify({
          contents:note.get("Contents").asString(),
          noteRect:note.get("Rect").asJS(),
          popupRect:popup.get("Rect").asJS(),
          open:popup.get("Open").isNull()?null:popup.get("Open").asJS()
        }));
      }
      expect(popups).toHaveLength(notes.length);
      const links=page.getLinks().map(link=>link.getURI()).sort();
      return { pairs:pairs.sort(),linkTargets:links,pageCount:pdf.countPages() };
    }finally{page.destroy();}
  }finally{pdf.destroy();}
}
const original=inspect(source);
async function upload(page:Page) {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file",{exact:true}).setInputFiles(source);
  await expect(page.locator(".viewer-app")).toBeVisible({timeout:20000});
}
async function exportFile(download:Download,info:TestInfo,name:string){
  const file=info.outputPath(name);
  await download.saveAs(file);
  return inspect(file);
}
test.setTimeout(70000);
test("P8 popup: ordinary Editor shape retains both comment popup owners",async({page},info)=>{
  await upload(page);
  await switchMode(page,"editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({timeout:20000});
  await chooseEditorTool(page,"Rectangle");
  const rect=await page.locator(".editor-page-layers").boundingBox();
  expect(rect).not.toBeNull();if(!rect)return;
  await page.mouse.move(rect.x+52,rect.y+70);await page.mouse.down();
  await page.mouse.move(rect.x+130,rect.y+123,{steps:4});await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
  expect(await exportFile(await downloadEditorCopy(page),info,"editor-popup.pdf")).toEqual(original);
});
test("P8 popup: default Secure export retains reciprocal popup owners",async({page},info)=>{
  await upload(page);
  await chooseDocumentTask(page,"Fill or create PDF forms");
  await expect(page.locator(".security-app")).toBeVisible({timeout:20000});
  const pending=page.waitForEvent("download",{timeout:22000});
  await page.getByRole("button",{name:"Download PDF",exact:true}).click();
  expect(await exportFile(await pending,info,"secure-popup.pdf")).toEqual(original);
});
test("P8 popup: built browser validator rejects crossed /Parent edges",async({page})=>{
  const mutated=join(dir,"crossed-owners.pdf");
  const pdf=mupdf.Document.openDocument(new Uint8Array(readFileSync(source)),"application/pdf").asPDF()!;
  try{
    const p=pdf.loadPage(0) as mupdf.PDFPage;
    try{
      const entries=p.getObject().get("Annots");
      const first=entries.get(1),firstPopup=entries.get(2),second=entries.get(3),secondPopup=entries.get(4);
      firstPopup.put("Parent",second);secondPopup.put("Parent",first);
      p.update();
    }finally{p.destroy();}
    const buffer=pdf.saveToBuffer();
    try{writeFileSync(mutated,Uint8Array.from(buffer.asUint8Array()));}finally{buffer.destroy();}
  }finally{pdf.destroy();}
  const bundle=readdirSync("dist/assets").find((name:string)=>/^pdfFidelityClient-[^.]+\.js$/.test(name));
  if(!bundle)throw new Error("Build production validator before this browser check");
  await page.goto("./#/tools/read-pdf");
  const report=await page.evaluate(async(input:{bundle:string;source:number[];output:number[]})=>{
    const module=await import(/* @vite-ignore */ input.bundle);
    const validate=module.t as (a:Uint8Array,b:Uint8Array,pages:number[])=>Promise<{passed:boolean;failures:string[]}>;
    if(typeof validate!=="function")throw new Error("Production P8 validator export is unavailable");
    return validate(new Uint8Array(input.source),new Uint8Array(input.output),[1]);
  },{bundle:"/assets/"+bundle,source:Array.from(readFileSync(source) as Uint8Array),output:Array.from(readFileSync(mutated) as Uint8Array)});
  expect(report.passed).toBe(false);
  expect(report.failures.join(" ")).toMatch(/popup|ownership|association/i);
});


test("P8 popup: explicitly authorized Secure comment cleanup removes notes and popups",async({page},info)=>{
  await upload(page);
  await chooseDocumentTask(page,"Fill or create PDF forms");
  await expect(page.locator(".security-app")).toBeVisible({timeout:20000});
  await page.locator(".security-other-tasks > summary").click();
  await page.getByLabel("Settings to show").selectOption("sanitize");
  await page.getByRole("checkbox",{name:/Remove page annotations and comments/i}).check();
  const pending=page.waitForEvent("download",{timeout:22000});
  await page.getByRole("button",{name:"Download PDF",exact:true}).click();
  const result=await exportFile(await pending,info,"secure-popup-cleanup.pdf");
  expect(result.pairs).toEqual([]);
  expect(result.linkTargets).toEqual(original.linkTargets);
  expect(result.pageCount).toBe(original.pageCount);
});
test("P8 popup: new Editor comment creates another valid pair while keeping original owners",async({page},info)=>{
  await upload(page);
  await switchMode(page,"editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({timeout:20000});
  await chooseEditorTool(page,"Comment");
  const box=await page.locator(".editor-page-layers").boundingBox();
  expect(box).not.toBeNull();if(!box)return;
  await page.mouse.click(box.x+150,box.y+180);
  await expect(page.getByText(/1 added object/)).toBeVisible();
  await page.getByRole("textbox",{name:"Comment",exact:true}).fill("Authorized Editor annotation");
  const exported=await exportFile(await downloadEditorCopy(page),info,"editor-added-popup.pdf");
  expect(exported.pairs).toHaveLength(original.pairs.length+1);
  for(const pair of original.pairs)expect(exported.pairs).toContain(pair);
  expect(exported.pairs.some(pair=>pair.includes("Authorized Editor annotation"))).toBe(true);
  expect(exported.linkTargets).toEqual(original.linkTargets);
});
