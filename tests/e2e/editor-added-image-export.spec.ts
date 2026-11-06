import { expect, test } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import mupdf from "mupdf";
import { downloadEditorCopy, openSample } from "./helpers/taskFirst";

test("added image remains embedded in independently reopened PDF stamp appearance", async ({ page }) => {
  await openSample(page, "editor");
  const canvas = createCanvas(48, 48);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d62435";
  ctx.fillRect(0, 0, 48, 48);
  ctx.fillStyle = "#132a44";
  ctx.fillRect(12, 12, 24, 24);

  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({
    name: "inline-diagram.png",
    mimeType: "image/png",
    buffer: canvas.toBuffer("image/png")
  });
  await expect(page.locator(".editor-object--image").last()).toBeVisible({ timeout: 15_000 });

  const saved = await downloadEditorCopy(page);
  const stream = await saved.createReadStream();
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(Uint8Array.from(chunk));
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }

  const pdf = new mupdf.PDFDocument(bytes);
  try {
    expect(pdf.countPages()).toBe(1);
    const first = pdf.loadPage(0);
    try {
      const added = first.getAnnotations().filter((annotation: any) => String(annotation.getType()) === "Stamp");
      expect(added.length).toBeGreaterThanOrEqual(1);
      expect(added.some((annotation: any) => {
        const normalAppearance = annotation.getObject().get("AP")?.get("N");
        if (!normalAppearance?.isStream?.()) return false;
        const image = normalAppearance.get("Resources")?.get("XObject")?.get("Im0");
        return Boolean(image?.isStream?.() && String(image.get("Subtype")?.asName?.()) === "Image");
      })).toBe(true);
    } finally { first.destroy(); }
  } finally { pdf.destroy(); }
});
