import { test, expect } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFile } from "node:fs/promises";

const proposal=(actions,overrides={})=>JSON.stringify({
  schemaVersion:1,title:"Prepare submission",rationale:"Apply approved native PDF operations in order.",
  actions,notes:["Check the final PDF before distribution."],...overrides
});
function fixture() {
  const pdf=new mupdf.PDFDocument();
  try{
    pdf.insertPage(-1,pdf.addPage([0,0,320,460],0,{},"0.5 g 32 48 145 95 re f"));
    const bytes=pdf.saveToBuffer({});
    try{return Buffer.from(bytes.asUint8Array());}finally{bytes.destroy();}
  }finally{pdf.destroy();}
}
test.setTimeout(90_000);
test("F7 plans via constrained prompt, stages proposal, and does not bypass user consent",async({page})=>{
  await page.goto("./#/batch");
  const planner=page.locator(".f7-planner");
  await expect(planner.getByRole("heading",{name:/Plan with (GPT-6 Luna or )?ChatGPT/})).toBeVisible();
  await planner.getByRole("textbox",{name:"PDF workflow goal"}).fill("Remove document metadata and rotate all pages 90 degrees.");
  await planner.getByRole("button",{name:"Copy ChatGPT prompt"}).click();
  await planner.getByText("View or manually copy generated prompt").click();
  const prompt=await planner.getByRole("textbox",{name:"Generated planning prompt"}).inputValue();
  expect(prompt).toContain("pdf.rotate");
  expect(prompt).toContain("pdf.metadata.remove");
  expect(prompt).toContain("Return ONLY one JSON object");
  await planner.getByRole("textbox",{name:"ChatGPT workflow JSON"}).fill(proposal([
    {actionId:"pdf.metadata.remove",params:{}},{actionId:"pdf.rotate",params:{degrees:90}}
  ]));
  await planner.getByRole("button",{name:"Review proposed workflow"}).click();
  await expect(planner.locator(".f7-review")).toContainText("Replace 1 existing step");
  await expect(planner.getByRole("button",{name:"Apply proposal to composer"})).toBeDisabled();
  await expect(page.locator(".f6-step")).toHaveCount(1);
  await planner.getByRole("checkbox",{name:/I approve replacing the current workflow steps/}).check();
  await planner.getByRole("button",{name:"Apply proposal to composer"}).click();
  await expect(page.locator(".f6-step")).toHaveCount(2);
  await expect(page.getByLabel("Workflow preflight")).toContainText("Document metadata is intentionally removed");
  await expect(page.getByRole("checkbox",{name:/I reviewed the metadata removal effects/})).not.toBeChecked();
  await expect(planner).toContainText("Nothing has run");
});
test("F7 rejects unsafe model output and invalidates a staged plan after manual edits",async({page})=>{
  await page.goto("./#/batch");
  const planner=page.locator(".f7-planner");
  const response=planner.getByRole("textbox",{name:"ChatGPT workflow JSON"});
  await response.fill(JSON.stringify({
    schemaVersion:1,title:"Danger",rationale:"Remove all",
    actions:[{actionId:"pdf.metadata.remove",params:{},approvedRisks:["metadata-removal"]}]
  }));
  await planner.getByRole("button",{name:"Review proposed workflow"}).click();
  await expect(planner.getByRole("alert")).toContainText("Unsupported action");
  await response.fill(proposal([{actionId:"pdf.rotate",params:{degrees:180}}]));
  await planner.getByRole("button",{name:"Review proposed workflow"}).click();
  const composer=page.locator(".f6-composer");
  await composer.getByRole("searchbox",{name:"Search workflow actions"}).fill("metadata");
  await composer.getByRole("button",{name:"Remove metadata",exact:true}).click();
  await expect(planner.getByText(/current workflow changed since this proposal/)).toBeVisible();
  await expect(planner.getByRole("button",{name:"Apply proposal to composer"})).toBeDisabled();
});
test("F7-approved safe plan still waits for separate Run workflow and produces valid PDF",async({page})=>{
  await page.goto("./#/batch");
  const planner=page.locator(".f7-planner");
  await planner.getByRole("textbox",{name:"ChatGPT workflow JSON"}).fill(proposal([
    {actionId:"pdf.optimize",params:{}}
  ]));
  await planner.getByRole("button",{name:"Review proposed workflow"}).click();
  await planner.getByRole("checkbox",{name:/I approve replacing the current workflow steps/}).check();
  await planner.getByRole("button",{name:"Apply proposal to composer"}).click();
  await expect(page.locator(".batch-item")).toHaveCount(0);
  const chooser=page.waitForEvent("filechooser");
  await page.getByRole("button",{name:"Add PDFs"}).click();
  await (await chooser).setFiles({name:"f7-safe.pdf",mimeType:"application/pdf",buffer:fixture()});
  await expect(page.locator(".batch-item")).toHaveCount(1);
  await expect(page.locator(".batch-item--complete")).toHaveCount(0);
  await page.getByRole("button",{name:"Run workflow"}).click();
  await expect(page.locator(".batch-item--complete")).toHaveCount(1,{timeout:60000});
  const download=page.waitForEvent("download");
  await page.locator(".batch-item").getByRole("button",{name:"Download"}).click();
  const result=mupdf.Document.openDocument(await readFile(await (await download).path()),"application/pdf");
  try{expect(result.countPages()).toBe(1);}finally{result.destroy();}
});
