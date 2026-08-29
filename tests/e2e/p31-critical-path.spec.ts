import { expect, test, type Page } from "@playwright/test";

async function openEditor(page: Page): Promise<void> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".editor-app")).toBeVisible();
}

test.describe("P31 interaction critical path", () => {
  test("non-critical native hydration waits for an input-quiet window", async ({ page }) => {
    test.setTimeout(40_000);
    await openEditor(page);

    // Keep producing harmless keyboard activity for longer than the quiet
    // window. Existing-content enrichment should not start while the user is
    // actively interacting with the editor.
    for (let index = 0; index < 7; index += 1) {
      await page.keyboard.press("Shift");
      await page.waitForTimeout(150);
    }

    await expect(page.locator(".native-content-hitbox")).toHaveCount(0);

    // Once input stops, the same enrichment remains automatic and the existing
    // PDF content becomes selectable without an explicit user action.
    await expect(page.getByRole("button", { name: /Select existing (?:text|paragraph):/ }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("added-object drag previews stay on the DOM interaction path", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "P31 responsiveness metrics are pinned to Chromium.");
    test.setTimeout(40_000);
    await openEditor(page);

    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    const canvas = page.locator(".editor-page-layers");
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    await page.mouse.click((canvasBox?.x ?? 0) + 180, (canvasBox?.y ?? 0) + 180);

    const object = page.locator(".editor-object--shape").last();
    await expect(object).toBeVisible();
    const objectBox = await object.boundingBox();
    expect(objectBox).toBeTruthy();

    await page.evaluate(() => {
      const state = window as typeof window & { __p31Heartbeat?: number; __p31HeartbeatTimer?: number };
      state.__p31Heartbeat = 0;
      state.__p31HeartbeatTimer = window.setInterval(() => { state.__p31Heartbeat = (state.__p31Heartbeat ?? 0) + 1; }, 20);
      window.__PDF_STUDIO_PERFORMANCE__?.clear();
    });

    const startX = (objectBox?.x ?? 0) + (objectBox?.width ?? 1) / 2;
    const startY = (objectBox?.y ?? 0) + (objectBox?.height ?? 1) / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 140, startY + 70, { steps: 35 });

    // P31 bypasses parent React state during continuous move/resize preview.
    await expect(object).toHaveAttribute("data-interaction-preview", "true");
    await page.mouse.up();
    await expect(object).not.toHaveAttribute("data-interaction-preview", "true");
    await page.waitForTimeout(250);

    const result = await page.evaluate(() => {
      const state = window as typeof window & { __p31Heartbeat?: number; __p31HeartbeatTimer?: number };
      if (state.__p31HeartbeatTimer) window.clearInterval(state.__p31HeartbeatTimer);
      return {
        heartbeat: state.__p31Heartbeat ?? 0,
        performance: window.__PDF_STUDIO_PERFORMANCE__?.summary()
      };
    });

    expect(result.heartbeat).toBeGreaterThanOrEqual(5);
    expect(result.performance).toBeTruthy();
    expect(result.performance!.longTasks.maxMs).toBeLessThan(500);
  });
});
