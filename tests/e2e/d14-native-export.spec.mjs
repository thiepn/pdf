import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as mupdf from "mupdf";
import { createP17NativeFidelityPdf } from "../../src/fixtures/p17NativeFidelityPdf";

function inspectRenderedImages(bytes) {
  const pdf = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const page = pdf.loadPage(0);
    try {
      const images = [];
      const structured = page.toStructuredText("preserve-images");
      try {
        structured.walk({
          onImageBlock(bbox, _transform, image) {
            const mask = image?.getMask?.();
            try {
              images.push({ bounds: Array.from(bbox), masked: Boolean(mask) });
            } finally { mask?.destroy?.(); }
          }
        });
      } finally { structured.destroy(); }
      return { pages: pdf.countPages(), images };
    } finally { page.destroy(); }
  } finally { pdf.destroy(); }
}

test.setTimeout(120_000);
test("D14 masked-image export preserves original sibling instances in the downloaded PDF", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  const input = Buffer.from(createP17NativeFidelityPdf());
  const baseline = inspectRenderedImages(input);
  expect(baseline.pages).toBe(1);
  expect(baseline.images).toHaveLength(4);
  expect(baseline.images.filter(image => image.masked)).toHaveLength(2);

  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"]').setInputFiles({
    name: "d14-masked-sibling.pdf", mimeType: "application/pdf", buffer: input
  });
  await expect(page.getByLabel("Document status bar")).toBeVisible({ timeout: 45_000 });
  const images = page.getByRole("button", { name: /Select existing image:/ });
  await expect(images.first()).toBeVisible({ timeout: 30_000 });
  const properties = page.locator(".native-unified-properties");
  let selected = false;
  const count = await images.count();
  for (let index = 0; index < count; index++) {
    await images.nth(index).click();
    await expect(properties).toBeVisible();
    if (await properties.getByText("Attached soft mask preserved", { exact: true }).isVisible().catch(() => false)) {
      selected = true;
      break;
    }
  }
  expect(selected, "P17 source image with attached mask must be discoverable").toBe(true);
  await expect(properties.getByText(/shared across 2 invocations/i)).toBeVisible();
  const x = properties.getByLabel("X", { exact: true });
  await x.fill(String(Number(await x.inputValue()) + 12));
  await properties.getByRole("button", { name: "Apply source image transform" }).click();
  await expect(page.locator(".native-queued-count").filter({ hasText: "1 PDF edit ready" })).toHaveCount(1);

  await page.getByLabel("More save options").click();
  // Never report a vague download timeout when the real PDF-fidelity validator
  // has already refused to emit an unsafe document. Retain both outcomes:
  // only an actual downloaded file proceeds to independent MuPDF reopening.
  const pending = page.waitForEvent("download", { timeout: 60_000 })
    .then(download => ({ kind: "download", download }), error => ({ kind: "timeout", error }));
  const blocked = page.locator('.editor-banner, [role="alert"]')
    .filter({ hasText: /Image edit validation failed|P8 fidelity validation failed|Masked image transform did not preserve|The edited PDF could not be verified/i })
    .first()
    .waitFor({ state: "visible", timeout: 60_000 })
    .then(() => ({ kind: "fidelity-refused" }), () => ({ kind: "watch-ended" }));
  await page.getByRole("button", { name: "Download copy", exact: true }).click();
  const outcome = await Promise.race([pending, blocked]);
  if (outcome.kind !== "download") {
    const diagnostic = await page.locator('.editor-banner, [role="alert"], [role="status"]')
      .allInnerTexts();
    throw new Error(`D16 refused unverified PDF export (${outcome.kind}). Diagnostic: ${JSON.stringify(diagnostic.slice(0, 15))}`);
  }
  const outputBytes = await readFile(await outcome.download.path());
  expect(outcome.download.suggestedFilename()).toMatch(/_edited[.]pdf$/i);
  const output = inspectRenderedImages(outputBytes);
  expect(output.pages).toBe(baseline.pages);
  expect(output.images).toHaveLength(4);
  expect(output.images.filter(image => image.masked)).toHaveLength(2);
  expect(output.images.some(image => Math.abs(image.bounds[0] - 402) < 2 && image.masked)).toBe(true);
  expect(output.images.some(image => Math.abs(image.bounds[0] - 478) < 2 && image.masked)).toBe(true);
  await page.screenshot({ path: info.outputPath("d14-masked-source-export.png"), animations: "disabled" });
});
