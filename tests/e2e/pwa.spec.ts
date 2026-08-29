import { expect, test } from "@playwright/test";

test("production service worker reports a complete consumer-core offline cache", async ({ page }) => {
  await page.goto("./#/home");
  await expect(page.getByRole("heading", { name: /What do you want to do with your PDF\?/i })).toBeVisible();
  const status = await readOfflineStatus(page);
  expect(status.ready).toBe(true);
  expect(status.cachedAssets).toBe(status.expectedAssets);
  expect(status.expectedAssets).toBeGreaterThan(5);
});

test("consumer app shell reopens with the browser network disabled", async ({ page, context }) => {
  await page.goto("./#/home");
  await navigatorServiceWorkerReady(page);
  await context.setOffline(true);
  try {
    await page.evaluate(() => window.location.reload());
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /What do you want to do with your PDF\?/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open PDF" })).toBeVisible();
    const status = await readOfflineStatus(page);
    expect(status.ready).toBe(true);
    expect(status.cachedAssets).toBe(status.expectedAssets);
  } finally {
    await context.setOffline(false);
  }
});

async function navigatorServiceWorkerReady(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
}

async function readOfflineStatus(page: import("@playwright/test").Page): Promise<{ ready: boolean; cachedAssets: number; expectedAssets: number }> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const worker = navigator.serviceWorker.controller ?? registration.active;
    if (!worker) throw new Error("No service worker available");
    return await new Promise<{ ready: boolean; cachedAssets: number; expectedAssets: number }>((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => reject(new Error("Worker status timeout")), 5000);
      channel.port1.onmessage = (event) => { window.clearTimeout(timeout); resolve(event.data); };
      worker.postMessage({ type: "GET_OFFLINE_STATUS" }, [channel.port2]);
    });
  });
}
