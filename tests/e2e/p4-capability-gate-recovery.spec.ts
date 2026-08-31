import { expect, test } from "@playwright/test";

const generatedCorpus = "tests/corpus/generated";

test("protected-task preflight is reused when Protect mounts", async ({ page }) => {
  test.setTimeout(50_000);
  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${generatedCorpus}/forms.pdf`);
  await expect(page.getByText("FORM_FIXTURE", { exact: true })).toBeVisible({ timeout: 20_000 });

  const match = page.url().match(/\/workspace\/([^/]+)\/viewer/);
  expect(match?.[1]).toBeTruthy();
  const projectId = decodeURIComponent(match?.[1] ?? "");

  await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.clear());
  await page.goto(`./#/workspace/${encodeURIComponent(projectId)}/secure/fill-forms`);
  await expect(page.getByRole("button", { name: "Download protected PDF" })).toBeVisible({ timeout: 35_000 });

  const inspectionMetrics = await page.evaluate(() => {
    const metrics = window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? [];
    return {
      hits: metrics.filter((metric) => metric.name === "security.inspection.session.hit").length,
      misses: metrics.filter((metric) => metric.name === "security.inspection.session.miss").length
    };
  });

  // The route performs one fail-closed inspection, then Protect reuses that
  // completed report rather than launching a second MuPDF worker pass.
  expect(inspectionMetrics.misses).toBe(1);
  expect(inspectionMetrics.hits).toBeGreaterThanOrEqual(1);
});
