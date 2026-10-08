import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFile } from "node:fs/promises";
import { openSample, chooseDocumentTask } from "./helpers/taskFirst";

test.setTimeout(120_000);
test("F4 smart optimizer verifies source structure and retains a safe download", async ({ page }) => {
  await openSample(page);
  await chooseDocumentTask(page, "Compress PDF");
  const heading=page.getByRole("heading",{name:"Make the PDF smaller without losing what matters"});
  await expect(heading).toBeVisible();
  await expect(page.getByText("Smart · preserve everything")).toBeVisible();
  await page.getByRole("button",{name:"Run safe optimizer"}).click();
  await expect(page.getByLabel("Preservation verification")).toBeVisible({timeout:90_000});
  await expect(page.getByLabel("Preservation verification")).toContainText("15 preservation categories");
  const downloadPromise=page.waitForEvent("download",{timeout:20_000});
  await page.getByRole("button",{name:"Download",exact:true}).click();
  const bytes=await readFile(await (await downloadPromise).path());
  const pdf=mupdf.Document.openDocument(bytes,"application/pdf");
  try {
    expect(pdf.countPages()).toBeGreaterThan(0);
    const p=pdf.loadPage(0);
    try {
      const text=p.toStructuredText();
      try { expect(text.asText().trim().length).toBeGreaterThan(0); } finally {text.destroy();}
    } finally {p.destroy();}
  } finally {pdf.destroy();}
});
