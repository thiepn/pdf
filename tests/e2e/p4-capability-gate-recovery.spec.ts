import { expect, test } from "@playwright/test";

const generatedCorpus = "tests/corpus/generated";

test("protected-task preflight is reused and opens the exact Protect task", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${generatedCorpus}/forms.pdf`);
  await expect(page.getByText("FORM_FIXTURE", { exact: true })).toBeVisible({ timeout: 20_000 });

  const match = page.url().match(/\/workspace\/([^/]+)\/viewer/);
  expect(match?.[1]).toBeTruthy();
  const projectId = decodeURIComponent(match?.[1] ?? "");

  await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.clear());
  await page.goto(`./#/workspace/${encodeURIComponent(projectId)}/secure/fill-forms`);
  await expect(page.getByRole("button", { name: "Download secured PDF" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".security-tabs button.active")).toContainText("Forms");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pdfTaskIntent)).toBe("fill-forms");

  const inspectionMetrics = await page.evaluate(() => {
    const metrics = window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? [];
    return {
      hits: metrics.filter((metric) => metric.name === "security.inspection.session.hit").length,
      misses: metrics.filter((metric) => metric.name === "security.inspection.session.miss").length
    };
  });

  expect(inspectionMetrics.misses).toBe(1);
  expect(inspectionMetrics.hits).toBeGreaterThanOrEqual(1);
});
