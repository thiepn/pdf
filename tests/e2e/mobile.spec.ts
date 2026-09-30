import { expect, test } from "@playwright/test";
import { chooseEditorTool, openSample, switchMode, openDocumentActions, openReaderOptions, readerCommand } from "./helpers/taskFirst";

const overflow = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("touch layouts expose document actions and tools without old navigation rows", async ({ page }) => {
  await openSample(page, "editor");
  await expect(page.locator(".workspace-mobile-nav,.workspace-tabs,.editor-toolrail")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Editing tools" })).toBeVisible();
  await page.getByRole("button", { name: "More tools", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editor tools" });
  for (const name of ["Rectangle", "Arrow", "Underline", "Mark redaction"]) await expect(dialog.getByRole("button", { name, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close tools" }).click();
  await switchMode(page, "viewer");
  await openReaderOptions(page);
  await expect(page.getByRole("button", { name: "Pages / search", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pages / search", exact: true }).click();
  await expect(page.locator(".viewer-sidebar")).toBeVisible();
});
test("primary file and editing actions remain touch-sized and horizontally contained", async ({ page }) => {
  await page.goto("./#/home");
  expect((await page.getByRole("button", { name: "Choose files", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await openSample(page, "editor");
  for (const name of ["Add text", "More tools", "Download PDF"]) {
    const control = page.getByRole("button", { name, exact: true });
    const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
test("editor commands remain reachable from 320px through tablet widths", async ({ page }) => {
  await openSample(page, "editor");
  for (const width of [320, 390, 430, 834]) {
    await page.setViewportSize({ width, height: 844 });
    await openDocumentActions(page);
    await expect(page.getByRole("dialog", { name: "Document actions", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close document actions", exact: true }).click();
    await expect(page.getByRole("button", { name: "More tools", exact: true })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});
test("tool dialogs fit the live viewport and close without changing the active document", async ({ page }) => {
  await openSample(page, "editor");
  const original = page.url();
  await page.getByRole("button", { name: "More tools", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editor tools" });
  const box = await dialog.boundingBox(), height = await page.evaluate(() => window.visualViewport?.height ?? innerHeight);
  expect(box!.height).toBeLessThanOrEqual(Math.ceil(height)); expect(box!.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); expect(page.url()).toBe(original);
});
test("landscape keeps document actions and the canvas reachable", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await openSample(page, "editor");
  await expect(page.locator(".editor-stage")).toBeVisible();
  await openDocumentActions(page);
  const dialog = page.getByRole("dialog", { name: "Document actions", exact: true });
  await expect(dialog.getByRole("button", { name: "Read PDF", exact: true })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
test("tablet properties overlay without consuming the page canvas width", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 }); await openSample(page, "editor");
  const stage = page.locator(".editor-stage"); const before = await stage.boundingBox(); expect(before!.width).toBeGreaterThan(500);
  const properties = page.locator(".editor-properties");
  if (!await properties.isVisible()) await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(properties).toBeVisible(); const after = await stage.boundingBox();
  expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(2);
});


async function expectSingleRow(page: import("@playwright/test").Page, stageSelector: string): Promise<void> {
  const bar = page.locator(".compact-document-bar");
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThanOrEqual(1);
  expect(box.height).toBe(52);
  expect(await page.locator(".document-topbar").count()).toBe(0);
  const stage = (await page.locator(stageSelector).boundingBox())!;
  expect(stage.y).toBeLessThanOrEqual(53);
  expect(stage.height).toBeGreaterThanOrEqual((await page.viewportSize())!.height - 54);
  const bounds = await bar.locator(':scope > .icon-button').evaluateAll(nodes => nodes.map(node => {
    const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};
  }));
  for (const control of bounds) {
    expect(control.width).toBeGreaterThanOrEqual(44); expect(control.height).toBeGreaterThanOrEqual(44);
    expect(control.y).toBe(4); expect(control.x).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual((await page.viewportSize())!.width);
  }
  expect(await bar.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
}

test("phone reader uses one 52px row in portrait and landscape, without horizontal toolbar scrolling", async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", {exact:true}).setInputFiles("tests/corpus/generated/plain-text.pdf");
  await expect(page.locator('.viewer-app[data-preferences-ready="true"]')).toBeVisible();
  for (const viewport of [{width:320,height:740},{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:680,height:900},{width:844,height:390},{width:932,height:430}]) {
    await page.setViewportSize(viewport);
    await expectSingleRow(page,".document-stage");
  }
  await page.setViewportSize({width:390,height:844});
  await readerCommand(page,"Fit width");
  await expect(page.locator('.pdf-page-shell[data-page-number="1"] canvas')).toBeVisible();
  await page.screenshot({path:info.outputPath("compact-reader-phone.png")});
  await page.evaluate(() => document.documentElement.setAttribute("data-theme","dark"));
  await page.screenshot({path:info.outputPath("compact-reader-phone-dark.png")});
  await openReaderOptions(page);
  await page.screenshot({path:info.outputPath("compact-reader-options.png")});
});

test("phone editor uses one row and keeps tools, undo, properties and download working", async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844}); await openSample(page,"editor");
  // Real safety notices remain visible; this fixture has none once detection settles.
  await expect(page.locator(".editor-operation-status")).toHaveCount(0);
  for (const viewport of [{width:320,height:740},{width:390,height:844},{width:430,height:932},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await expectSingleRow(page,".editor-stage");
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button",{name:"Add text",exact:true}).click();
  await expect(page.getByRole("button",{name:"Add text",exact:true})).toHaveAttribute("aria-pressed","true");
  const canvas=page.locator(".editor-page-layers"); await expect(canvas).toBeVisible();
  const rect=(await canvas.boundingBox())!; await page.mouse.click(rect.x+100,rect.y+120);
  await expect(page.getByRole("button",{name:"Undo",exact:true})).toBeEnabled();
  if(await page.getByRole("button",{name:"Close editor panel",exact:true}).isVisible()) await page.getByRole("button",{name:"Close editor panel",exact:true}).click({position:{x:12,y:12}});
  await page.getByRole("button",{name:"Undo",exact:true}).click();
  await expect(page.getByRole("button",{name:"Undo",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"More tools",exact:true}).click();
  const tools=page.getByRole("dialog",{name:"Editor tools"});
  await tools.getByRole("button",{name:"Properties",exact:true}).click();
  await expect(tools).toHaveCount(0); await expect(page.locator(".editor-properties")).toBeVisible();
  await page.getByRole("button",{name:"Close editor panel",exact:true}).click({position:{x:12,y:12}});
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download PDF",exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/i);
  await page.screenshot({path:info.outputPath("compact-editor-phone.png")});
});

test("compact page and comment selection dismiss panels and reveal the target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSample(page, "editor");

  await page.getByRole("button", { name: "More tools", exact: true }).click();
  let tools = page.getByRole("dialog", { name: "Editor tools" });
  await tools.getByRole("button", { name: "Show pages", exact: true }).click();
  const sidebar = page.locator(".editor-left-panel");
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("button", { name: "Open page 1", exact: true }).click();
  await expect(sidebar).toHaveCount(0);
  await expect(page.locator(".editor-stage")).toBeVisible();

  await chooseEditorTool(page, "Comment");
  const canvas = page.locator(".editor-page-layers");
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("Editor canvas is unavailable.");
  await page.mouse.click(rect.x + 130, rect.y + 150);
  await expect(page.locator(".editor-properties")).toBeVisible();
  await page.getByRole("button", { name: "Close editor panel", exact: true }).click({ position: { x: 12, y: 12 } });

  await page.getByRole("button", { name: "More tools", exact: true }).click();
  tools = page.getByRole("dialog", { name: "Editor tools" });
  await tools.getByRole("button", { name: "Show pages", exact: true }).click();
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("combobox", { name: "Sidebar content" }).selectOption("comments");
  const comment = sidebar.locator(".editor-comment-list > button").first();
  await expect(comment).toBeVisible();
  await comment.click();
  await expect(sidebar).toHaveCount(0);
  await expect(page.locator(".editor-properties")).toBeVisible();
  await expect(page.locator(".editor-object--selected").first()).toBeVisible();
});

test("compact options restore focus, preserve state on rotation and do not leave invisible modal traps", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file",{exact:true}).setInputFiles("tests/corpus/generated/plain-text.pdf");
  await expect(page.locator('.viewer-app[data-preferences-ready="true"]')).toBeVisible();
  await readerCommand(page,"Single");
  const trigger=page.getByRole("button",{name:"More reader actions",exact:true});
  await trigger.click();
  const dialog=page.getByRole("dialog",{name:"Reading options",exact:true});
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await page.getByLabel("Current page",{exact:true}).fill("2");
  await expect(page.getByLabel("Current page",{exact:true})).toHaveValue("2");
  await trigger.click();
  await page.getByLabel("Zoom",{exact:true}).selectOption("0.75");
  await page.setViewportSize({width:1366,height:900});
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".document-topbar")).toBeVisible();
  await expect(page.getByLabel("Zoom",{exact:true})).toHaveValue("0.75");
  await expect(page.getByLabel("Current page",{exact:true})).toHaveValue("2");
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator(".compact-document-bar")).toBeVisible();
  await expect(page.getByLabel("Current page",{exact:true})).toHaveValue("2");
  expect(await page.evaluate(()=>document.documentElement.dataset.modalOpen)).toBeUndefined();
});


test("compact editor never leaves an empty properties drawer over the canvas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSample(page, "editor");

  await page.getByRole("button", { name: "Add text", exact: true }).click();
  const canvas = page.locator(".editor-page-layers");
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("Editor canvas is unavailable.");
  await page.mouse.click(rect.x + 110, rect.y + 140);
  const properties = page.locator(".editor-properties");
  await expect(properties).toBeVisible();

  // Starting another creation tool should return the full document canvas.
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await expect(properties).toHaveCount(0);
  await expect(page.locator(".editor-stage")).toBeVisible();

  // Re-select the object, then Escape should dismiss both selection and drawer.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const object = page.locator(".editor-object").last();
  await object.click();
  await expect(properties).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(properties).toHaveCount(0);
  await expect(object).not.toHaveClass(/editor-object--selected/);

  // Deleting the final selection must not leave a useless "No selection" sheet.
  await object.click();
  await expect(properties).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(object).toHaveCount(0);
  await expect(properties).toHaveCount(0);
});
