import { expect, test, type Download, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
// @ts-ignore Node-only Playwright fixture reader
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
// @ts-ignore Node-only test path helpers
import { tmpdir } from "node:os";
// @ts-ignore Node-only test path helpers
import { join } from "node:path";
import { chooseDocumentTask, chooseEditorTool, downloadEditorCopy, switchMode } from "./helpers/taskFirst";

const fixtureDir = mkdtempSync(join(tmpdir(), "pdfstudio-p8-browser-"));
function createMixedFixture(): Uint8Array {
  const original = new Uint8Array(readFileSync("tests/corpus/generated/forms.pdf"));
  const doc = mupdf.Document.openDocument(original, "application/pdf").asPDF()!;
  const page = doc.loadPage(0) as mupdf.PDFPage;
  const pageObject = page.getObject();
  const fields = doc.getTrailer().get("Root").get("AcroForm").get("Fields");
  const annotations = pageObject.get("Annots");
  const font = new mupdf.Font("Helvetica");
  const fontRef = doc.addSimpleFont(font);
  try {
    const locked = doc.addObject({
      Type: "Annot", Subtype: "Widget", FT: "Tx", T: doc.newString("locked_code"),
      V: doc.newString("LOCKED-42"), Ff: 1, Rect: [300, 350, 450, 375],
      P: pageObject, F: 4, DA: doc.newString("/Helv 12 Tf 0 g")
    });
    annotations.push(locked); fields.push(locked);
    const parent = doc.addObject({ FT: "Btn", Ff: 32768, T: doc.newString("decision"),
      V: doc.newName("approve"), Kids: doc.newArray() });
    for (const [index, choice] of ["approve", "reject"].entries()) {
      const off = doc.addStream("q Q", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 20, 20] });
      const on = doc.addStream("q 0 0 1 rg 0 0 20 20 re f Q", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 20, 20] });
      const x = 300 + 55 * index;
      const child = doc.addObject({ Type: "Annot", Subtype: "Widget", Parent: parent,
        Rect: [x, 300, x + 20, 320], P: pageObject, F: 4,
        AS: doc.newName(index === 0 ? "approve" : "Off"), AP: { N: { Off: off, [choice]: on } } });
      parent.get("Kids").push(child);
      annotations.push(child);
    }
    fields.push(parent); page.update();
    const buffer = doc.saveToBuffer();
    try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally { page.destroy(); fontRef.destroy(); font.destroy(); doc.destroy(); }
}
const source = join(fixtureDir, "mixed.pdf");
writeFileSync(source, createMixedFixture());
test.setTimeout(65_000);

function reopen(file: string) {
  const doc = mupdf.Document.openDocument(new Uint8Array(readFileSync(file)), "application/pdf").asPDF()!;
  const fields: Array<{ name: string; value: string; type: string; readOnly: boolean }> = [];
  const texts: string[] = [];
  try {
    for (let index = 0; index < doc.countPages(); index++) {
      const page = doc.loadPage(index) as mupdf.PDFPage;
      try {
        for (const widget of page.getWidgets()) fields.push({
          name: widget.getName(), value: String(widget.getValue()), type: String(widget.getFieldType()),
          readOnly: Boolean(widget.isReadOnly())
        });
        const structured = page.toStructuredText();
        try { texts.push(structured.asText()); } finally { structured.destroy(); }
      } finally { page.destroy(); }
    }
    return { pageCount: doc.countPages(), fields, texts };
  } finally { doc.destroy(); }
}
function group(state: ReturnType<typeof reopen>, name: string) {
  return state.fields.filter(field => field.name === name);
}
async function upload(page: Page) {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(source);
  await expect(page.locator(".viewer-app")).toBeVisible({ timeout: 20_000 });
}
async function secure(page: Page) {
  await upload(page);
  await chooseDocumentTask(page, "Fill or create PDF forms");
  await expect(page.locator(".security-app")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeEnabled();
}
async function save(download: Download, target: string) {
  await download.saveAs(target);
  const result = reopen(target);
  expect(result.pageCount).toBe(1);
  return result;
}
async function exportSecure(page: Page, name: string) {
  const output = page.waitForEvent("download", { timeout: 40_000 });
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  return save(await output, join(fixtureDir, "export-" + name + ".pdf"));
}

test("P8 browser: Secure text and checkbox edits preserve unrelated radio, read-only, and choice states", async ({ page }) => {
  await secure(page);
  await page.getByRole("textbox", { name: "full_name", exact: true }).fill("Authorized Browser Update");
  await page.getByRole("checkbox", { name: "accepted", exact: true }).uncheck();
  const state = await exportSecure(page, "secure-edit");
  expect(group(state,"full_name").map(x => x.value)).toEqual(["Authorized Browser Update"]);
  expect(group(state,"accepted").map(x => x.value)).toEqual(["Off"]);
  expect(group(state,"locked_code").map(x => x.value)).toEqual(["LOCKED-42"]);
  expect(group(state,"locked_code")[0].readOnly).toBe(true);
  expect(group(state,"country").map(x => x.value)).toEqual(["Germany"]);
  expect(group(state,"decision").map(x => x.value)).toEqual(["approve", "approve"]);
});

test("P8 browser: selecting radio group's reject option preserves unrelated existing forms", async ({ page }) => {
  await secure(page);
  const radio = page.getByRole("radio", { name: /^decision: (approve|reject)$/ });
  expect(await radio.count()).toBe(2);
  await radio.nth(1).check();
  const state = await exportSecure(page,"radio-change");
  expect(group(state,"decision").map(x => x.value)).toEqual(["reject","reject"]);
  expect(group(state,"full_name")[0].value).toBe("Ada Lovelace");
  expect(group(state,"locked_code")[0].value).toBe("LOCKED-42");
});

test("P8 browser: an existing-field PDF can add authorized text and checkbox widgets", async ({ page }) => {
  await secure(page);
  await page.getByRole("button", { name: "+ Text field", exact: true }).click();
  const first = page.locator(".p7-form-draft").first();
  await first.getByLabel("Field name").fill("new_approval_note");
  await first.getByLabel("Label").fill("New approval note");
  await page.getByRole("button", { name: "+ Checkbox", exact: true }).click();
  const second = page.locator(".p7-form-draft").nth(1);
  await second.getByLabel("Field name").fill("new_confirm");
  await second.getByLabel("Label").fill("New confirmation");
  const state = await exportSecure(page,"create-widgets");
  expect(group(state,"new_approval_note")).toHaveLength(1);
  expect(group(state,"new_confirm")).toHaveLength(1);
  expect(group(state,"locked_code")[0].value).toBe("LOCKED-42");
  expect(group(state,"decision").map(x=>x.value)).toEqual(["approve","approve"]);
});

test("P8 browser: explicit clearing empties editable values but preserves read-only value", async ({ page }) => {
  await secure(page);
  await page.locator(".security-other-tasks > summary").click();
  await page.getByLabel("Settings to show").selectOption("sanitize");
  await page.getByRole("checkbox", { name: /Clear all form values/i }).check();
  const state = await exportSecure(page,"clear-values");
  expect(group(state,"full_name")[0].value).toBe("");
  expect(group(state,"accepted")[0].value).toBe("Off");
  expect(group(state,"locked_code")[0].value).toBe("LOCKED-42");
  expect(group(state,"decision").map(x => x.value)).toEqual(["Off", "Off"]);
});

test("P8 browser: explicit flattening removes actual interactive widgets", async ({ page }) => {
  await secure(page);
  await page.locator(".security-other-tasks > summary").click();
  await page.getByLabel("Settings to show").selectOption("sanitize");
  await page.getByRole("checkbox", { name: /Flatten form fields/i }).check();
  const state = await exportSecure(page,"flatten");
  expect(state.fields).toHaveLength(0);
  expect(state.texts[0]).toContain("Ada Lovelace");
});

test("P8 browser: ordinary Editor rectangle export preserves existing interactive forms", async ({ page }) => {
  await upload(page);
  await switchMode(page, "editor");
  await expect(page.locator(".editor-page-layers")).toBeVisible({ timeout: 20_000 });
  await chooseEditorTool(page, "Rectangle");
  const canvas = page.locator(".editor-page-layers");
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) return;
  await page.mouse.move(rect.x+52,rect.y+56);
  await page.mouse.down();
  await page.mouse.move(rect.x+122,rect.y+98,{steps:4});
  await page.mouse.up();
  await expect(page.getByText(/1 added object/)).toBeVisible();
  const downloaded=await downloadEditorCopy(page);
  const state=await save(downloaded, join(fixtureDir, "editor.pdf"));
  expect(state.fields).toHaveLength(6);
  expect(group(state,"full_name")[0].value).toBe("Ada Lovelace");
  expect(group(state,"accepted")[0].value).toBe("Yes");
  expect(group(state,"locked_code")[0].value).toBe("LOCKED-42");
  expect(group(state,"decision").map(x=>x.value)).toEqual(["approve","approve"]);
});
