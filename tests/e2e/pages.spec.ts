import { expect, test } from "@playwright/test";

test("repository-relative PWA assets resolve inside the configured base", async ({ page }) => {
  await page.goto("./#/home");
  const result = await page.evaluate(async () => {
    const manifest = (document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null)?.href ?? "";
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
    const icon192 = new URL("icons/icon-192.png", document.baseURI).toString();
    const icon512 = new URL("icons/icon-512.png", document.baseURI).toString();
    const responses = await Promise.all([fetch(manifest), fetch(icon192), fetch(icon512)]);
    return { manifest, scope: registration?.scope ?? "", statuses: responses.map((response) => response.status), baseUri: new URL(".", document.baseURI).toString() };
  });
  expect(result.statuses).toEqual([200, 200, 200]);
  expect(result.scope).toBe(result.baseUri);
  expect(result.manifest.startsWith(result.baseUri)).toBeTruthy();
});

test("installed application shell reloads offline", async ({ page, context }) => {
  await page.goto("./#/home");
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return;
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    }
  });
  await expect(page.getByText("PDF Studio", { exact: false }).first()).toBeVisible();
  await context.setOffline(true);
  try {
    await page.evaluate(() => window.location.reload());
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("PDF Studio", { exact: false }).first()).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
