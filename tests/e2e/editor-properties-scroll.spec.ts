import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 720 } });

test("editor properties inspector stays inside the workspace and scrolls to the bottom", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);

  const existingText = page.getByRole("button", { name: /Select existing (?:text|paragraph):/ }).first();
  await expect(existingText).toBeVisible({ timeout: 20_000 });
  await existingText.click();

  const workspace = page.locator(".workspace-mode-content");
  const editor = page.locator(".workspace-mode-content > .editor-app");
  const properties = page.locator(".editor-properties.native-unified-properties");
  await expect(properties).toBeVisible();

  const geometry = await page.evaluate(() => {
    const workspaceElement = document.querySelector<HTMLElement>(".workspace-mode-content");
    const editorElement = document.querySelector<HTMLElement>(".workspace-mode-content > .editor-app");
    const propertiesElement = document.querySelector<HTMLElement>(".editor-properties.native-unified-properties");
    if (!workspaceElement || !editorElement || !propertiesElement) throw new Error("Missing editor layout element");
    const workspaceRect = workspaceElement.getBoundingClientRect();
    const editorRect = editorElement.getBoundingClientRect();
    const propertiesRect = propertiesElement.getBoundingClientRect();
    return {
      workspaceBottom: workspaceRect.bottom,
      editorBottom: editorRect.bottom,
      propertiesBottom: propertiesRect.bottom,
      viewportBottom: window.innerHeight,
      clientHeight: propertiesElement.clientHeight,
      scrollHeight: propertiesElement.scrollHeight
    };
  });

  expect(geometry.editorBottom).toBeLessThanOrEqual(geometry.workspaceBottom + 1);
  expect(geometry.propertiesBottom).toBeLessThanOrEqual(geometry.workspaceBottom + 1);
  expect(geometry.propertiesBottom).toBeLessThanOrEqual(geometry.viewportBottom + 1);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);

  await properties.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const scrolled = await properties.evaluate((element) => ({
    scrollTop: element.scrollTop,
    remaining: element.scrollHeight - element.clientHeight - element.scrollTop
  }));
  expect(scrolled.scrollTop).toBeGreaterThan(0);
  expect(scrolled.remaining).toBeLessThanOrEqual(1);
  await expect(properties.locator(".property-section").last()).toBeInViewport();

  await expect(workspace).toBeVisible();
  await expect(editor).toBeVisible();
});
