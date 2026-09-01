import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 720 } });

test("diagnose editor properties containment and hit testing", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);

  const existingText = page.getByRole("button", { name: /Select existing (?:text|paragraph):/ }).first();
  await expect(existingText).toBeVisible({ timeout: 20_000 });

  const hitTest = await existingText.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    const ancestors: Array<Record<string, unknown>> = [];
    let current: HTMLElement | null = element as HTMLElement;
    for (let index = 0; current && index < 12; index += 1, current = current.parentElement) {
      const currentRect = current.getBoundingClientRect();
      const style = getComputedStyle(current);
      ancestors.push({
        tag: current.tagName,
        className: current.className,
        top: currentRect.top,
        bottom: currentRect.bottom,
        left: currentRect.left,
        right: currentRect.right,
        position: style.position,
        zIndex: style.zIndex,
        overflow: style.overflow,
        pointerEvents: style.pointerEvents
      });
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      target: { x, y, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      hit: hit ? { tag: hit.tagName, className: hit.className, aria: hit.getAttribute("aria-label") } : null,
      ancestors
    };
  });
  console.log(`EDITOR_HIT_TEST ${JSON.stringify(hitTest)}`);

  await existingText.click({ force: true });

  const workspace = page.locator(".workspace-mode-content");
  const editor = page.locator(".workspace-mode-content > .editor-app");
  const properties = page.locator(".editor-properties.native-unified-properties");
  await expect(properties).toBeVisible();

  const geometry = await page.evaluate(() => {
    const workspaceElement = document.querySelector<HTMLElement>(".workspace-mode-content");
    const editorElement = document.querySelector<HTMLElement>(".workspace-mode-content > .editor-app");
    const propertiesElement = document.querySelector<HTMLElement>(".editor-properties.native-unified-properties");
    const bodyElement = document.querySelector<HTMLElement>(".workspace-body");
    if (!workspaceElement || !editorElement || !propertiesElement || !bodyElement) throw new Error("Missing editor layout element");
    const rect = (element: HTMLElement) => {
      const value = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { top: value.top, bottom: value.bottom, left: value.left, right: value.right, height: value.height, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, position: style.position, zIndex: style.zIndex, overflow: style.overflow };
    };
    return { body: rect(bodyElement), workspace: rect(workspaceElement), editor: rect(editorElement), properties: rect(propertiesElement), viewportBottom: innerHeight };
  });
  console.log(`EDITOR_SCROLL_GEOMETRY ${JSON.stringify(geometry)}`);

  expect(geometry.editor.bottom).toBeLessThanOrEqual(geometry.workspace.bottom + 1);
  expect(geometry.properties.bottom).toBeLessThanOrEqual(geometry.workspace.bottom + 1);
  expect(geometry.properties.bottom).toBeLessThanOrEqual(geometry.viewportBottom + 1);
  expect(geometry.properties.scrollHeight).toBeGreaterThan(geometry.properties.clientHeight);

  await properties.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const scrolled = await properties.evaluate((element) => ({
    scrollTop: element.scrollTop,
    remaining: element.scrollHeight - element.clientHeight - element.scrollTop
  }));
  console.log(`EDITOR_SCROLL_BOTTOM ${JSON.stringify(scrolled)}`);
  expect(scrolled.scrollTop).toBeGreaterThan(0);
  expect(scrolled.remaining).toBeLessThanOrEqual(1);
  await expect(properties.locator(".property-section").last()).toBeInViewport();

  await expect(workspace).toBeVisible();
  await expect(editor).toBeVisible();
});
