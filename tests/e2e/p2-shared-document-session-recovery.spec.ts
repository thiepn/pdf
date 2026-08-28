import { expect, test } from "@playwright/test";

test.describe("Recovery P2 shared document session", () => {
  test("Read → Edit → Pages → Read reuses source bytes and the parsed PDF session", async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto("./#/home");
    await page.getByRole("button", { name: "Open sample" }).click();
    await expect(page.locator(".viewer-app")).toBeVisible();
    // The viewer shell can paint before the shared parser reports interactive.
    // Start counting handoff metrics only after the initial open has completed so
    // a late first-open metric cannot be mistaken for a mode-switch miss.
    await expect.poll(async () => page.evaluate(() => (window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? []).filter((entry) => entry.name === "readiness.viewer.interactive").length)).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.clear());

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".editor-app")).toBeVisible();
    await expect(page.getByRole("button", { name: /Text$/ })).toBeVisible();

    await page.getByRole("button", { name: "Pages", exact: true }).click();
    await expect(page.locator(".organizer-app")).toBeVisible();

    await page.getByRole("button", { name: "Read", exact: true }).click();
    await expect(page.locator(".viewer-app")).toBeVisible();

    const sessionMetrics = await page.evaluate(() => {
      const snapshot = window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? [];
      const count = (name: string) => snapshot.filter((entry) => entry.name === name).length;
      return {
        sourceMisses: count("projectBytes.session.miss"),
        sourceHits: count("projectBytes.session.hit"),
        parserMisses: count("pdfjs.open"),
        parserHits: count("pdfjs.session.hit")
      };
    });

    expect(sessionMetrics.sourceMisses).toBe(0);
    expect(sessionMetrics.sourceHits).toBeGreaterThanOrEqual(3);
    expect(sessionMetrics.parserMisses).toBe(0);
    expect(sessionMetrics.parserHits).toBeGreaterThanOrEqual(3);
  });

  test("returning to Edit reuses the completed MuPDF inspection session", async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto("./#/home");
    await page.getByRole("button", { name: "Open sample" }).click();
    await expect(page.locator(".viewer-app")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => (window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? []).filter((entry) => entry.name === "readiness.viewer.interactive").length)).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.clear());

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".editor-app")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => (window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? []).filter((entry) => entry.name === "mupdf.inspection.session.miss").length)).toBe(1);
    // P3 intentionally cancels a pending inspection when its last consumer leaves.
    // This qualification is specifically for completed-session reuse, so wait for
    // the deferred native hydration to finish before navigating away.
    await expect.poll(async () => page.evaluate(() => (window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? []).filter((entry) => entry.name === "readiness.editor.nativeHydrated").length), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Read", exact: true }).click();
    await expect(page.locator(".viewer-app")).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".editor-app")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => (window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? []).filter((entry) => entry.name === "mupdf.inspection.session.hit").length)).toBeGreaterThanOrEqual(1);

    const nativeMetrics = await page.evaluate(() => {
      const snapshot = window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? [];
      return {
        misses: snapshot.filter((entry) => entry.name === "mupdf.inspection.session.miss").length,
        hits: snapshot.filter((entry) => entry.name === "mupdf.inspection.session.hit").length
      };
    });
    expect(nativeMetrics.misses).toBe(1);
    expect(nativeMetrics.hits).toBeGreaterThanOrEqual(1);
  });
});
