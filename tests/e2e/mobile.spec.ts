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
  await expect(moreDialog.getByRole("button", { name: "Find a PDF task" })).toBeVisible();
  await expect(moreDialog.getByRole("link", { name: "Batch automation" })).toBeVisible();
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
    const navigation = page.getByRole("navigation", { name: "Document workspace" });
    await navigation.getByRole("button", { name: "Edit", exact: true }).click();
    const quickTools = page.getByRole("navigation", { name: "Editor quick tools" });
    for (const control of await quickTools.getByRole("button").all()) {
      if (!await control.isVisible()) continue;
      const box = await control.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("R6 phone editor uses floating quick tools instead of a second reserved bottom row", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "R6 phone-specific layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  const workspaceNav = page.locator(".workspace-mobile-nav");
  await workspaceNav.getByRole("button", { name: "Edit" }).click();

  const quickTools = page.getByRole("navigation", { name: "Editor quick tools" });
  await expect(quickTools).toBeVisible();
  expect(await quickTools.evaluate((element) => getComputedStyle(element).position)).toBe("absolute");
  expect(await quickTools.getByRole("button").count()).toBe(5);
  expect(await quickTools.getByRole("button").nth(3).isVisible()).toBe(false);

  const quickBox = await quickTools.boundingBox();
  const navBox = await workspaceNav.boundingBox();
  expect(quickBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  if (quickBox && navBox) expect(quickBox.y + quickBox.height).toBeLessThanOrEqual(navBox.y + 1);

  const editorRows = await page.locator(".editor-app").evaluate((element) => getComputedStyle(element).gridTemplateRows.split(" ").length);
  expect(editorRows).toBe(4);
});

test("R6 phone sheets fit the live viewport and keyboard state removes competing chrome", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "R6 phone-specific layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  const workspaceNav = page.locator(".workspace-mobile-nav");
  await workspaceNav.getByRole("button", { name: "Edit" }).click();
  const quickTools = page.getByRole("navigation", { name: "Editor quick tools" });
  await quickTools.getByRole("button", { name: /^Tools/ }).click();
  const sheet = page.getByRole("dialog", { name: "Editor tools" });
  await expect(sheet).toBeVisible();
  const sheetBox = await sheet.boundingBox();
  const visualHeight = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
  expect(sheetBox?.height ?? Infinity).toBeLessThanOrEqual(Math.ceil(visualHeight));
  await sheet.getByRole("button", { name: "Close tools" }).click();

  await page.evaluate(() => { document.documentElement.dataset.keyboardOpen = "true"; });
  await expect(workspaceNav).toBeHidden();
  await expect(quickTools).toBeHidden();
  await page.evaluate(() => { delete document.documentElement.dataset.keyboardOpen; });
  await expect(workspaceNav).toBeVisible();
  await expect(quickTools).toBeVisible();
});

test("R6 phone landscape remains horizontally contained with reachable document navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "R6 phone-specific landscape layout");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  const nav = page.locator(".workspace-mobile-nav");
  await expect(nav).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.orientation)).toBe("landscape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  for (const control of await nav.getByRole("button").all()) {
    expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("R6 tablet side panels overlay instead of shrinking the editor canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "tablet-webkit", "R6 tablet-specific layout");
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await page.getByRole("button", { name: "Edit" }).click();

  const stage = page.locator(".editor-stage");
  await expect(stage).toBeVisible();
  const before = await stage.boundingBox();
  expect(before?.width ?? 0).toBeGreaterThan(500);

  const propertiesButton = page.getByRole("button", { name: /Properties/ }).first();
  await propertiesButton.click();
  const properties = page.locator(".editor-properties");
  await expect(properties).toBeVisible();
  expect(await properties.evaluate((element) => getComputedStyle(element).position)).toBe("absolute");
  const after = await stage.boundingBox();
  expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.dataset.viewportClass)).toBe("tablet");
});
