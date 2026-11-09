import { expect, test, type Download, type Page, type TestInfo } from "@playwright/test";
import * as mupdf from "mupdf";
// @ts-ignore Node-only test fixture paths
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
// @ts-ignore Node-only fixture path
import { tmpdir } from "node:os";
// @ts-ignore Node-only fixture path
import { join } from "node:path";
import { chooseDocumentTask, chooseEditorTool, switchMode } from "./helpers/taskFirst";

const tmp=mkdtempSync(join(tmpdir(),"pdfstudio-p8-action-chains-"));
function addChainedAction(): Uint8Array {
 const doc=mupdf.Document.openDocument(new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf")),"application/pdf").asPDF()!;
 try {
  const page=doc.loadPage(0) as mupdf.PDFPage;
  try {
   const primary=page.getObject().get("Annots").get(0).get("A");
   const supplemental=doc.newDictionary();
   supplemental.put("S",doc.newName("URI"));
   supplemental.put("URI",doc.newString("https://example.org/second-action"));
   primary.put("Next",supplemental);
   page.update();
  } finally {page.destroy()}
  const buffer=doc.saveToBuffer();
  try{return Uint8Array.from(buffer.asUint8Array())} finally {buffer.destroy()}
 }finally{doc.destroy()}
}
const src=join(tmp,"source-with-next.pdf");
writeFileSync(src,addChainedAction());
function inspect(path:string):{url:string;nextAction:string|null} {
 const doc=mupdf.Document.openDocument(new Uint8Array(readFileSync(path)),"application/pdf").asPDF()!;
 try {
  const page=doc.loadPage(0) as mupdf.PDFPage;
  try {
   const link=page.getObject().get("Annots").get(0);
   const primary=link.get("A");
   const next=primary.get("Next");
   return {url:primary.get("URI").asString(),nextAction:next.isNull()?null:next.get("URI").asString()};
  }finally{page.destroy()}
 }finally{doc.destroy()}
}
const before=inspect(src);
const bundledValidator = readdirSync("dist/assets").find((name: string) => /^pdfFidelityClient-[^.]+\.js$/.test(name));
if (!bundledValidator) throw new Error("Production P8 validator bundle missing; build before browser qualification");

function mutation(change: "next" | "aa" | "retarget-next"): Uint8Array {
 const source = change === "retarget-next" ? new Uint8Array(readFileSync(src))
   : new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf"));
 const doc=mupdf.Document.openDocument(source,"application/pdf").asPDF()!;
 try {
  const page=doc.loadPage(0) as mupdf.PDFPage;
  try {
   const link=page.getObject().get("Annots").get(0);
   if(change==="aa"){
    const actions=doc.newDictionary();
    const script=doc.newDictionary();
    script.put("S",doc.newName("JavaScript"));
    script.put("JS",doc.newString("app.alert('controlled-action-probe')"));
    actions.put("E",script);
    link.put("AA",actions);
   }else {
    const supplemental=doc.newDictionary();
    supplemental.put("S",doc.newName("URI"));
    supplemental.put("URI",doc.newString(change === "next" ? "https://example.org/second-action" : "https://example.org/retargeted"));
    link.get("A").put("Next", supplemental);
   }
   page.update();
  } finally { page.destroy(); }
  const buf=doc.saveToBuffer();
  try{return Uint8Array.from(buf.asUint8Array())}finally{buf.destroy()}
 } finally{doc.destroy()}
}
async function browserP8(page:Page,original:Uint8Array,exported:Uint8Array){
 await page.goto("./#/tools/read-pdf");
 return page.evaluate(async ({module,source,output})=>{
  const imported=await import(/* @vite-ignore */ module);
  const validate=imported.t as (source:Uint8Array,output:Uint8Array,pages:number[])=>Promise<{passed:boolean;failures:string[]}>;
  if(typeof validate!=="function")throw new Error("Built P8 validator export unavailable");
  return validate(new Uint8Array(source),new Uint8Array(output),[1]);
 },{module:`/assets/${bundledValidator}`,source:Array.from(original),output:Array.from(exported)});
}

async function load(page:Page) {
 await page.goto("./#/tools/read-pdf");
 await page.getByLabel("PDF file",{exact:true}).setInputFiles(src);
 await expect(page.locator(".viewer-app")).toBeVisible({timeout:20000});
}
async function attemptExport(page:Page,buttonName:string,info:TestInfo,name:string) {
 const pending=page.waitForEvent("download",{timeout:20000});
 await page.getByRole("button",{name:buttonName,exact:true}).click();
 const download=await pending;
 const output=info.outputPath(name);
 await download.saveAs(output);
 // This is a real PDF export; reopen with MuPDF and independently verify
 // the chained /Next action, not just the browser's success message.
 expect(inspect(output)).toEqual(before);
}
test.setTimeout(65000);
test("P8 /Next: Secure export preserves exact chained URI semantics",async({page},info)=>{
 await load(page);
 await chooseDocumentTask(page,"Fill or create PDF forms");
 await expect(page.locator(".security-app")).toBeVisible({timeout:20000});
 await attemptExport(page,"Download PDF",info,"secure-next.pdf");
});
test("P8 /Next: Editor shape preserves exact chained URI semantics",async({page},info)=>{
 await load(page);await switchMode(page,"editor");
 await expect(page.locator(".editor-page-layers")).toBeVisible({timeout:20000});
 await chooseEditorTool(page,"Rectangle");
 const bounds=await page.locator(".editor-page-layers").boundingBox();expect(bounds).not.toBeNull();if(!bounds)return;
 await page.mouse.move(bounds.x+48,bounds.y+65);await page.mouse.down();
 await page.mouse.move(bounds.x+125,bounds.y+120,{steps:4});await page.mouse.up();
 await expect(page.getByText(/1 added object/)).toBeVisible();
 const menu=page.locator(".editor-save-options");
 await menu.locator("summary").click();
 await attemptExport(page,"Download copy",info,"editor-next.pdf");
});

const scripted=join(tmp,"source-with-next-script.pdf");
{
 const pdf=mupdf.Document.openDocument(new Uint8Array(readFileSync(src)),"application/pdf").asPDF()!;
 try {
  const page=pdf.loadPage(0) as mupdf.PDFPage;
  try {
   const chained=page.getObject().get("Annots").get(0).get("A").get("Next");
   chained.put("S",pdf.newName("JavaScript"));
   chained.delete("URI");
   chained.put("JS",pdf.newString("app.alert('test-only-untrusted')"));
   page.update();
  } finally {page.destroy()}
  const bytes=pdf.saveToBuffer();
  try{writeFileSync(scripted,Uint8Array.from(bytes.asUint8Array()))}finally{bytes.destroy()}
 }finally{pdf.destroy()}
}
test("P8 /Next: explicitly removing embedded scripts preserves clean primary URI link", async({page},info)=>{
 await page.goto("./#/tools/read-pdf");
 await page.getByLabel("PDF file",{exact:true}).setInputFiles(scripted);
 await expect(page.locator(".viewer-app")).toBeVisible({timeout:20000});
 await chooseDocumentTask(page,"Fill or create PDF forms");
 await expect(page.locator(".security-app")).toBeVisible({timeout:20000});
 await page.locator(".security-other-tasks > summary").click();
 await page.getByLabel("Settings to show").selectOption("sanitize");
 await page.getByRole("checkbox",{name:/Remove embedded scripts/i}).check();
 const pending=page.waitForEvent("download",{timeout:15000});
 await page.getByRole("button",{name:"Download PDF",exact:true}).click();
 const d=await pending;
 const path=info.outputPath("script-cleared.pdf");
 await d.saveAs(path);
 const pdf=mupdf.Document.openDocument(new Uint8Array(readFileSync(path)),"application/pdf").asPDF()!;
 try{
  const p=pdf.loadPage(0) as mupdf.PDFPage;
  try{
   const action=p.getObject().get("Annots").get(0).get("A");
   expect(action.get("URI").asString()).toBe("https://example.invalid/local");
   const next=action.get("Next");
   expect(next.get("JS").isNull()).toBe(true);
   expect(next.get("S").asName()).not.toBe("JavaScript");
  }finally{p.destroy()}
 }finally{pdf.destroy()}
});

test("P8 Chromium worker refuses an injected chained /Next action", async ({page})=>{
 const original=new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf"));
 const report=await browserP8(page,original,mutation("next"));
 expect(report.passed).toBe(false);
 expect(report.failures.join(" ")).toMatch(/action graph/i);
});
test("P8 Chromium worker refuses mutation of an existing chained action", async ({page})=>{
 const report=await browserP8(page,new Uint8Array(readFileSync(src)),mutation("retarget-next"));
 expect(report.passed).toBe(false);
 expect(report.failures.join(" ")).toMatch(/action graph/i);
});
test("P8 Chromium worker refuses injected annotation /AA actions", async ({page})=>{
 const original=new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf"));
 const report=await browserP8(page,original,mutation("aa"));
 expect(report.passed).toBe(false);
 expect(report.failures.join(" ")).toMatch(/action graph/i);
});
test("P8 Chromium resolves named destinations and rejects remapped target pages", async ({page})=>{
 const root="tests/corpus/p8-named-destination/";
 const source=new Uint8Array(readFileSync(root+"source.pdf"));
 const retarget=new Uint8Array(readFileSync(root+"retarget.pdf"));
 const report=await browserP8(page,source,retarget);
 expect(report.passed).toBe(false);
 expect(report.failures.join(" ")).toMatch(/link/i);
});
test("P8 Chromium accepts destination alias preserving the same page and view", async ({page})=>{
 const root="tests/corpus/p8-named-destination/";
 const source=new Uint8Array(readFileSync(root+"source.pdf"));
 const alias=new Uint8Array(readFileSync(root+"alias.pdf"));
 const report=await browserP8(page,source,alias);
 expect(report.failures).toEqual([]);
});
test("P8 /Next: combined script and comment sanitization preserves link without script", async({page},info)=>{
 await page.goto("./#/tools/read-pdf");
 await page.getByLabel("PDF file",{exact:true}).setInputFiles(scripted);
 await expect(page.locator(".viewer-app")).toBeVisible({timeout:20000});
 await chooseDocumentTask(page,"Fill or create PDF forms");
 await expect(page.locator(".security-app")).toBeVisible({timeout:20000});
 await page.locator(".security-other-tasks > summary").click();
 await page.getByLabel("Settings to show").selectOption("sanitize");
 await page.getByRole("checkbox",{name:/Remove embedded scripts/i}).check();
 await page.getByRole("checkbox",{name:/Remove page annotations and comments/i}).check();
 const pending=page.waitForEvent("download",{timeout:18000});
 await page.getByRole("button",{name:"Download PDF",exact:true}).click();
 const d=await pending;const out=info.outputPath("script-and-comments-cleared.pdf");
 await d.saveAs(out);
 const pdf=mupdf.Document.openDocument(new Uint8Array(readFileSync(out)),"application/pdf").asPDF()!;
 try{
  const p=pdf.loadPage(0) as mupdf.PDFPage;
  try{
   const a=p.getObject().get("Annots").get(0).get("A");
   expect(a.get("URI").asString()).toBe("https://example.invalid/local");
   expect(a.get("Next").get("JS").isNull()).toBe(true);
  }finally{p.destroy()}
 }finally{pdf.destroy()}
});
test("P8 /AA: explicit automatic-action cleanup removes annotation AA and keeps the URL",async({page},info)=>{
 const path=join(tmp,"source-annotation-aa.pdf");
 writeFileSync(path,mutation("aa"));
 await page.goto("./#/tools/read-pdf");
 await page.getByLabel("PDF file",{exact:true}).setInputFiles(path);
 await expect(page.locator(".viewer-app")).toBeVisible({timeout:20000});
 await chooseDocumentTask(page,"Fill or create PDF forms");
 await expect(page.locator(".security-app")).toBeVisible({timeout:20000});
 await page.locator(".security-other-tasks > summary").click();
 await page.getByLabel("Settings to show").selectOption("sanitize");
 await page.getByRole("checkbox",{name:/Remove automatic document actions/i}).check();
 const pending=page.waitForEvent("download",{timeout:18000});
 await page.getByRole("button",{name:"Download PDF",exact:true}).click();
 const d=await pending;
 const exported=info.outputPath("annotation-AA-cleared.pdf");
 await d.saveAs(exported);
 const pdf=mupdf.Document.openDocument(new Uint8Array(readFileSync(exported)),"application/pdf").asPDF()!;
 try{
   const p=pdf.loadPage(0) as mupdf.PDFPage;
   try {
     const a=p.getObject().get("Annots").get(0);
     expect(a.get("AA").isNull()).toBe(true);
     expect(a.get("A").get("URI").asString()).toBe("https://example.invalid/local");
   }finally{p.destroy()}
 }finally{pdf.destroy()}
});
