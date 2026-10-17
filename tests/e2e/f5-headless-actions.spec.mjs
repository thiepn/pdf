import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFile } from "node:fs/promises";

function fixture() {
  const pdf=new mupdf.PDFDocument();
  const font=new mupdf.Font("Helvetica");
  try {
    const face=pdf.addSimpleFont(font);
    pdf.insertPage(-1,pdf.addPage([0,0,360,480],0,{Font:{F1:face}},"BT /F1 16 Tf 35 320 Td (Shared action registry F5) Tj ET"));
    const buffer=pdf.saveToBuffer({});
    try{return Buffer.from(buffer.asUint8Array());}finally{buffer.destroy();}
  } finally {pdf.destroy();font.destroy();}
}
async function openQuick(page,task) {
  await page.goto(`./#/quick/${task}`);
  await page.locator('input[type="file"]').setInputFiles({name:"f5.pdf",mimeType:"application/pdf",buffer:fixture()});
  await expect(page.getByRole("button",{name:task==="compress-pdf"?"Compress PDF":"Remove metadata",exact:true})).toBeEnabled();
}
test.setTimeout(90000);
test("F5 registered optimize action runs through the quick compressor and produces a valid PDF",async({page})=>{
  await openQuick(page,"compress-pdf");
  await page.getByRole("button",{name:"Compress PDF",exact:true}).click();
  const finished=page.getByRole("region",{name:"Your files are ready"});
  await expect(finished).toBeVisible({timeout:60000});
  const pending=page.waitForEvent("download");
  await finished.getByRole("button",{name:"Download PDF"}).click();
  const bytes=await readFile(await (await pending).path());
  const pdf=mupdf.Document.openDocument(bytes,"application/pdf");
  try {
    expect(pdf.countPages()).toBe(1);
    const page0=pdf.loadPage(0);
    try {const txt=page0.toStructuredText();try{expect(txt.asText()).toContain("Shared action registry F5");}finally{txt.destroy();}}finally{page0.destroy();}
  }finally{pdf.destroy();}
});
test("F5 registered metadata removal runs in the quick tool",async({page})=>{
  await openQuick(page,"remove-metadata");
  await page.getByRole("button",{name:"Remove metadata",exact:true}).click();
  const finished=page.getByRole("region",{name:"Your files are ready"});
  await expect(finished).toBeVisible({timeout:60000});
  const pending=page.waitForEvent("download");
  await finished.getByRole("button",{name:"Download PDF"}).click();
  const pdf=mupdf.Document.openDocument(await readFile(await (await pending).path()),"application/pdf");
  try{expect(pdf.countPages()).toBe(1);}finally{pdf.destroy();}
});
