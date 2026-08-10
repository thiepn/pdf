import { expect, test } from "@playwright/test";

test("phone workspace exposes touch-first document navigation and sheets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Phone-specific responsive flow");
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  const mobileNav = page.locator(".workspace-mobile-nav");
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole("button", { name: "Read" })).toBeVisible();
  await mobileNav.getByRole("button", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/editor$/);
  const editorToolbar = page.getByRole("navigation", { name: "Editor quick tools" });
  await expect(editorToolbar).toBeVisible();
  await editorToolbar.getByRole("button", { name: /^Tools/ }).click();
  const toolsDialog = page.getByRole("dialog", { name: "Editor tools" });
  await expect(toolsDialog).toBeVisible();
  for (const name of ["Select", "Pan", "Text", "Image", "Link", "Signature", "Stamp", "Rectangle", "Ellipse", "Line", "Arrow", "Highlight", "Underline", "Strikeout", "Squiggly", "Draw", "Comment", "Mark redaction"]) {
    await expect(toolsDialog.getByRole("button", { name: new RegExp(`^${name}(?:\\s|$)`) })).toBeVisible();
  }
  await toolsDialog.getByRole("button", { name: /^Highlight(?:\s|$)/ }).click();
  await expect(editorToolbar.getByRole("button", { name: "Tools, active tool: Highlight" })).toBeVisible();
  await page.getByRole("button", { name: "Pages / layers" }).click();
  await expect(page.locator(".editor-left-panel")).toBeVisible();
  await page.locator(".editor-mobile-backdrop").click({ position: { x: 8, y: 8 } });
  await expect(page.locator(".editor-left-panel")).toHaveCount(0);

  await mobileNav.getByRole("button", { name: "Read" }).click();
  await page.getByRole("button", { name: "Pages / search" }).click();
  await expect(page.locator(".viewer-sidebar")).toBeVisible();

  await mobileNav.getByRole("button", { name: "More" }).click();
  const moreDialog = page.getByRole("dialog", { name: "More document tools" });
  await expect(moreDialog).toBeVisible();
  await expect(moreDialog.getByRole("button", { name: "OCR" })).toBeVisible();
});

test("tablet retains canvas space and touch-sized controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "tablet-webkit", "Tablet-specific responsive flow");
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".editor-stage")).toBeVisible();
  const select = page.getByRole("button", { name: /Select/ }).first();
  const box = await select.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("phone professional shell preserves touch targets and horizontal fit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Phone-specific responsive flow");
  await page.goto("./#/home");
  const primaryAction = page.getByRole("button", { name: "Open PDF" });
  expect((await primaryAction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Open sample" }).click();
  const mobileNav = page.locator(".workspace-mobile-nav");
  await expect(mobileNav.locator("svg.studio-icon")).toHaveCount(5);
  for (const control of await mobileNav.getByRole("button").all()) {
    expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("phone editor controls remain reachable and touch sized at narrow widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Phone-specific responsive flow");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`./?e2eViewport=${width}#/home`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Open sample" }).click();
    await page.getByRole("navigation", { name: "Document tools" }).getByRole("button", { name: "Edit" }).click();
    const quickTools = page.getByRole("navigation", { name: "Editor quick tools" });
    for (const control of await quickTools.getByRole("button").all()) {
      const box = await control.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});
