import { expect, test } from "@playwright/test";

const corpus = "tests/corpus/phase28";

async function uploadPdf(page: import("@playwright/test").Page, filename: string): Promise<void> {
  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${corpus}/${filename}`);
}

test("Phase 28 opens a 1,000-page adversarial document progressively", async ({ page }) => {
  test.setTimeout(75_000);
  await uploadPdf(page, "pages-1000.pdf");
  await expect(page.getByText("PAGES_1000_0001", { exact: true })).toBeVisible({ timeout: 40_000 });
  await expect(page.locator(".page-input")).toContainText("/ 1000");
  const canvases = await page.locator(".pdf-page-shell canvas").count();
  expect(canvases).toBeLessThan(50);
});

test("Phase 28 recovery heartbeat remains isolated per project/session", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  const projectId = page.url().match(/workspace\/([^/]+)\/viewer/)?.[1];
  expect(projectId).toBeTruthy();
  await page.evaluate((id) => {
    const now = Date.now();
    localStorage.setItem("local-pdf-studio-workspace-heartbeat-v2:crashed-current", JSON.stringify({ schemaVersion: 2, sessionId: "crashed-current", projectId: id, mode: "editor", startedAt: now - 20_000, heartbeatAt: now - 5_000, cleanExit: false }));
    localStorage.setItem("local-pdf-studio-workspace-heartbeat-v2:other-project", JSON.stringify({ schemaVersion: 2, sessionId: "other-project", projectId: "other-project", mode: "ocr", startedAt: now - 20_000, heartbeatAt: now - 4_000, cleanExit: false }));
  }, projectId!);
  await page.reload();
  await expect(page.getByText("Recovered after an interrupted session", { exact: true })).toBeVisible();
  const otherStillPresent = await page.evaluate(() => localStorage.getItem("local-pdf-studio-workspace-heartbeat-v2:other-project") !== null);
  expect(otherStillPresent).toBe(true);
});

test("Phase 28 viewer rendering is deterministic across reload for a vector-heavy fixture", async ({ page }) => {
  await uploadPdf(page, "vector-dense.pdf");
  const canvas = page.locator(".pdf-page-shell canvas").first();
  await expect(canvas).toBeVisible({ timeout: 25_000 });
  const digest = async () => canvas.evaluate(async (node: HTMLCanvasElement) => {
    const blob = await new Promise<Blob>((resolve, reject) => node.toBlob((value) => value ? resolve(value) : reject(new Error("Canvas serialization failed")), "image/png"));
    const bytes = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash)).map((value) => value.toString(16).padStart(2, "0")).join("");
  });
  const before = await digest();
  await page.reload();
  await expect(canvas).toBeVisible({ timeout: 25_000 });
  const after = await digest();
  expect(after).toBe(before);
});
