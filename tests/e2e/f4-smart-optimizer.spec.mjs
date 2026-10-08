import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFile } from "node:fs/promises";
import { openSample } from "./helpers/taskFirst";

test.setTimeout(120_000);
test("F4 smart optimizer verifies source structure and retains a safe download", async ({ page }) => {
  await openSample(page);
  // The document-actions shortcut opens the file-first quick compressor; F4 is
  // intentionally the existing full Compression workspace for stored projects.
  const viewerRoute = new URL(page.url()).hash.split("/");
  expect(viewerRoute[1]).toBe("workspace");
  expect(viewerRoute[3]).toBe("viewer");
  await page.goto(`./#/workspace/${viewerRoute[2]}/compress`);
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

test("F4 smart mode is usable in the file-first quick compressor", async ({ page }) => {
  await openSample(page);
  // The document-actions shortcut intentionally opens the quick workflow.
  const actions = page.getByRole("button", { name: "Document actions", exact: true });
  await actions.click();
  const dialog = page.getByRole("dialog", { name: "Document actions", exact: true });
  await dialog.getByRole("searchbox", { name: "Find a PDF tool" }).fill("Compress PDF");
  await dialog.locator(".product-tool-card").filter({ has: page.locator("strong", { hasText: /^Compress PDF$/ }) }).click();
  await expect(page.getByRole("heading", { name: "Compress PDF" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("combobox", { name: "Compression" }).selectOption("smart");
  await expect(page.getByRole("combobox", { name: "Smart cleanup strength" })).toBeVisible();
  await page.getByRole("button", { name: "Compress PDF", exact: true }).click();
  const finished = page.getByRole("region", { name: "Your files are ready" });
  await expect(finished).toBeVisible({ timeout: 90_000 });
  await expect(finished.getByText(/Original size unchanged|smaller/)).toBeVisible();
  const pending = page.waitForEvent("download", { timeout: 15_000 });
  await finished.getByRole("button", { name: "Download PDF" }).click();
  const bytes = await readFile(await (await pending).path());
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try { expect(doc.countPages()).toBeGreaterThan(0); } finally { doc.destroy(); }
});
