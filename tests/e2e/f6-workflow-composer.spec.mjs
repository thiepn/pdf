import { test, expect } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFile } from "node:fs/promises";

function fixture() {
  const doc=new mupdf.PDFDocument();
  const font=new mupdf.Font("Helvetica");
  try {
    const simple=doc.addSimpleFont(font);
    doc.insertPage(-1,doc.addPage([0,0,400,550],0,{Font:{F1:simple}},"BT /F1 14 Tf 50 350 Td (F6 workflow composer source) Tj ET"));
    const b=doc.saveToBuffer({});
    try {return Buffer.from(b.asUint8Array());}finally{b.destroy();}
  } finally { doc.destroy();font.destroy(); }
}
test.setTimeout(120_000);
test("F6 composer edits an ordered workflow with safety review",async({page})=>{
  await page.goto("./#/batch");
  await expect(page.getByRole("heading",{name:"Visual workflow composer"})).toBeVisible();
  const composer=page.getByLabel("Visual workflow composer");
  await expect(composer.getByRole("article",{name:"Step 1: Compress PDF"})).toBeVisible();
  await composer.getByRole("searchbox",{name:"Search workflow actions"}).fill("Rotate pages");
  await composer.getByRole("button",{name:"Rotate pages",exact:true}).click();
  await expect(composer.getByRole("article",{name:/Step 2: Rotate pages/})).toBeVisible();
  await composer.getByRole("button",{name:"Move Rotate pages up"}).click();
  await expect(composer.getByRole("article",{name:/Step 1: Rotate pages/})).toBeVisible();
  await composer.getByRole("button",{name:"Duplicate Rotate pages"}).click();
  await expect(composer.getByRole("article",{name:/Step 2: Rotate pages/})).toBeVisible();
  await composer.getByRole("button",{name:"Remove Rotate pages"}).last().click();
  await expect(composer.getByRole("article",{name:/Step 1: Rotate pages/})).toBeVisible();
  await composer.getByRole("searchbox",{name:"Search workflow actions"}).fill("metadata");
  await composer.getByRole("button",{name:"Remove metadata",exact:true}).click();
  await expect(page.getByLabel("Workflow preflight")).toContainText("intentionally removed");
  await expect(page.getByRole("checkbox",{name:/I reviewed the metadata removal/})).toBeVisible();
  await expect(page.getByRole("button",{name:"Run workflow"})).toBeDisabled();
  await page.getByRole("checkbox",{name:/I reviewed the metadata removal/}).check();
  await expect(page.getByRole("checkbox",{name:/I reviewed the metadata removal/})).toBeChecked();
});
test("F6 executes approved workflows and downloads validated PDF and JSON run report",async({page})=>{
  await page.goto("./#/batch");
  const pendingChooser=page.waitForEvent("filechooser");
  await page.getByRole("button",{name:"Add PDFs"}).click();
  await (await pendingChooser).setFiles({name:"f6.pdf",mimeType:"application/pdf",buffer:fixture()});
  await expect(page.locator(".batch-item")).toHaveCount(1);
  await page.getByRole("button",{name:"Run workflow"}).click();
  await expect(page.locator(".batch-item--complete")).toHaveCount(1,{timeout:60000});
  const pdfDownload=page.waitForEvent("download");
  await page.locator(".batch-item").getByRole("button",{name:"Download"}).click();
  const downloaded=await pdfDownload;
  const bytes=await readFile(await downloaded.path());
  const doc=mupdf.Document.openDocument(bytes,"application/pdf");
  try { expect(doc.countPages()).toBe(1); } finally { doc.destroy(); }
  const evidence=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download run report"}).click();
  const report=JSON.parse((await readFile(await (await evidence).path())).toString("utf8"));
  expect(report.version).toBe(1);
  expect(report.succeeded).toBe(1);
  expect(report.entries[0].name).toBe("f6.pdf");
  expect(report.entries[0].bytesOut).toBeGreaterThan(0);
});
