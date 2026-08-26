import { expect, test } from "@playwright/test";

const generatedCorpus = "tests/corpus/generated";
const p0Corpus = "tests/corpus/p0";

test.describe("Recovery P0 responsiveness qualification", () => {
  test("runtime instrumentation is local and observable", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "P0 timing qualification uses Chromium's Long Task/Event Timing APIs.");
    await page.goto("./#/home");
    const available = await page.evaluate(() => Boolean(window.__PDF_STUDIO_PERFORMANCE__));
    expect(available).toBe(true);

    await page.goto("./#/diagnostics/performance");
    await expect(page.getByRole("heading", { name: "Runtime performance" })).toBeVisible();
    await expect(page.getByText(/measurements retained in the in-memory ring buffer/)).toBeVisible();
    await expect(page.getByText(/does not upload performance events/i)).toBeVisible();
  });

  test("normal PDF reaches first page without catastrophic main-thread work", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "P0 timing qualification is pinned to Chromium for stable metrics.");
    test.setTimeout(40_000);
    const uncaught: string[] = [];
    page.on("pageerror", (error) => uncaught.push(error.message));

    await page.goto("./#/home");
    await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.clear());
    const started = Date.now();
    await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${generatedCorpus}/plain-text.pdf`);
    await expect(page.getByText("PLAIN_PAGE_1_MARKER", { exact: true })).toBeVisible({ timeout: 15_000 });
    const firstPageMs = Date.now() - started;

    const summary = await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.summary());
    expect(firstPageMs).toBeLessThan(15_000);
    expect(summary).toBeTruthy();
    expect(summary!.pdf.count).toBeGreaterThan(0);
    expect(summary!.pdf.maxMs).toBeLessThan(10_000);
    expect(summary!.longTasks.maxMs).toBeLessThan(2_000);
    expect(uncaught).toEqual([]);
  });

  test("dense existing-content inspection leaves the UI event loop responsive", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "P0 event-loop qualification is pinned to Chromium.");
    test.setTimeout(60_000);
    const uncaught: string[] = [];
    page.on("pageerror", (error) => uncaught.push(error.message));

    await page.goto("./#/home");
    await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${p0Corpus}/dense-vectors.pdf`);
    await expect(page.getByText("P0_DENSE_VECTOR_MARKER", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      const state = window as typeof window & { __p0Heartbeat?: number; __p0HeartbeatTimer?: number };
      state.__p0Heartbeat = 0;
      state.__p0HeartbeatTimer = window.setInterval(() => { state.__p0Heartbeat = (state.__p0Heartbeat ?? 0) + 1; }, 50);
      window.__PDF_STUDIO_PERFORMANCE__?.clear();
    });

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".editor-app")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Hide sidebar|Pages \/ layers/ })).toBeVisible();
    await page.waitForTimeout(2_000);

    const heartbeat = await page.evaluate(() => {
      const state = window as typeof window & { __p0Heartbeat?: number; __p0HeartbeatTimer?: number };
      if (state.__p0HeartbeatTimer) window.clearInterval(state.__p0HeartbeatTimer);
      return state.__p0Heartbeat ?? 0;
    });
    const summary = await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.summary());

    // A 50 ms heartbeat should advance roughly 40 times over two seconds. Ten
    // ticks leaves generous CI headroom while still rejecting multi-second UI freezes.
    expect(heartbeat).toBeGreaterThanOrEqual(10);
    expect(summary).toBeTruthy();
    expect(summary!.longTasks.maxMs).toBeLessThan(2_000);
    expect(uncaught).toEqual([]);
  });

  test("1000-page document reaches page one with bounded live canvases", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "P0 large-document timing qualification is pinned to Chromium.");
    test.setTimeout(60_000);
    await page.goto("./#/home");
    await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.clear());

    const started = Date.now();
    await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${p0Corpus}/large-1000-pages.pdf`);
    await expect(page.getByText("P0_PAGE_0001", { exact: true })).toBeVisible({ timeout: 20_000 });
    const firstPageMs = Date.now() - started;
    await expect(page.locator(".page-input")).toContainText("/ 1000");

    const footprint = await page.evaluate(() => ({
      canvases: document.querySelectorAll("canvas").length,
      domNodes: document.querySelectorAll("*").length,
      summary: window.__PDF_STUDIO_PERFORMANCE__?.summary()
    }));

    expect(firstPageMs).toBeLessThan(20_000);
    expect(footprint.canvases).toBeLessThanOrEqual(30);
    expect(footprint.domNodes).toBeLessThan(15_000);
    expect(footprint.summary).toBeTruthy();
    expect(footprint.summary!.longTasks.maxMs).toBeLessThan(3_000);
  });
});
