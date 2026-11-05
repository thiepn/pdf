import { expect, test } from "@playwright/test";
import { createP17NativeFidelityPdf } from "../../src/fixtures/p17NativeFidelityPdf";

/**
 * The genuine D19 full-CI Firefox trace (37981651394, artifact 11643069405)
 * logged "warning: dropping unclosed device" from native-image.worker while
 * the four-image/two-soft-mask P17 fixture was being inspected.
 *
 * This regression checks the real built WebAssembly worker. It does NOT
 * interpret a clean device shutdown as proof that the still-unqualified
 * source/SMask-to-device paint mapping, export, or sibling preservation passes.
 */
test("PDF-03 closes the real MuPDF image inspection device without relaxing native refusal", async ({ page }) => {
  const unclosed: Array<{ message: string; url: string }> = [];
  page.on("console", (message) => {
    const url = message.location().url;
    if (message.text().includes("dropping unclosed device") && /native-image[.]worker/.test(url)) {
      unclosed.push({ message: message.text(), url });
    }
  });

  await page.goto("./#/tools/edit-pdf");
  await page.locator('input[type="file"]').setInputFiles({
    name: "pdf03-p17-device-lifecycle.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(createP17NativeFidelityPdf())
  });
  await expect(page.getByLabel("Document status bar")).toBeVisible({ timeout: 45_000 });

  const images = page.getByRole("button", { name: /Select existing image:/ });
  await expect(images).toHaveCount(4, { timeout: 30_000 });
  await images.first().click();
  const panel = page.locator(".native-unified-properties");
  await expect(panel).toBeVisible();

  // A masked source that is not uniquely proven must remain non-mutatable.
  if (await panel.getByText("Fidelity-protected image", { exact: true }).isVisible().catch(() => false)) {
    await expect(panel.getByRole("button", { name: /Apply source image transform|Delete existing image/ })).toHaveCount(0);
  }

  // Flush the page event loop after the inspection response and UI selection.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  expect(unclosed).toEqual([]);
});
