import { expect, test } from "@playwright/test";

import { openDocumentActions, openReaderOptions, closeReaderOptions, readerCommand } from "./helpers/taskFirst";

const corpus = "tests/corpus/generated";

function contrastRatio(first: string, second: string): number {
  const luminance = (color: string) => {
    const values = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Map.prototype, "getOrInsert");
    Reflect.deleteProperty(Map.prototype, "getOrInsertComputed");
  });
});

test("opens and renders a real PDF without Map upsert proposal APIs", async ({ page }, testInfo) => {
  const uncaught: string[] = [];
  page.on("pageerror", error => uncaught.push(error.message));

  await page.goto("./#/tools/read-pdf");
  await page.waitForTimeout(250);
  expect(uncaught.filter(message => /getOrInsert(?:Computed)?/.test(message))).toEqual([]);
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${corpus}/plain-text.pdf`);

  await expect(page.getByText("PLAIN_PAGE_1_MARKER", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".page-input")).toContainText("/ 3");
  if (!testInfo.project.name.includes("mobile") && !testInfo.project.name.includes("tablet")) {
    await readerCommand(page, "Single");
    await page.getByLabel("Current page").fill("1");
    await expect(page.getByLabel("Current page")).toHaveValue("1");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByLabel("Current page")).toHaveValue("2");
    await expect(page.getByText("PLAIN_PAGE_2_MARKER", { exact: true })).toBeVisible();
  }
  expect(uncaught.filter(message => /getOrInsert(?:Computed)?/.test(message))).toEqual([]);
});

test("rapid hash navigation and browser history keep the selected tool visible", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("link", { name: "All PDF tools", exact: true }).first().click();
  await expect.poll(() => new URL(page.url()).hash).toBe("#/tools");
  await page.locator("a.product-tool-card").filter({ hasText: "Read PDF" }).click();
  await expect.poll(() => new URL(page.url()).hash).toBe("#/tools/read-pdf");
  await expect(page.getByRole("heading", { name: "Read PDF", exact: true })).toBeVisible();
  await expect(page.locator('input[type="file"][accept*="pdf"]').first()).toBeAttached();
  await page.goBack();
  await expect.poll(() => new URL(page.url()).hash).toBe("#/tools");
  await expect(page.getByRole("heading", { name: "PDF tasks", exact: true })).toBeVisible();
  await page.goForward();
  await expect.poll(() => new URL(page.url()).hash).toBe("#/tools/read-pdf");
  await expect(page.getByRole("heading", { name: "Read PDF", exact: true })).toBeVisible();
  await expect(page.locator('input[type="file"][accept*="pdf"]').first()).toBeAttached();
});

test("reader hydration and page jumps never scroll document actions out of the viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(`${corpus}/plain-text.pdf`);
  await expect(page.locator(".viewer-app")).toHaveAttribute("data-preferences-ready", "true");
  const geometry = await page.locator(".document-stage").evaluate(stage => {
    const nodes = [];
    for (let node: HTMLElement | null = stage as HTMLElement; node; node = node.parentElement) {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      nodes.push({ tag: node.tagName, class: node.className, top: rect.top, height: rect.height, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, display: style.display, overflow: style.overflow, rows: style.gridTemplateRows });
    }
    return nodes;
  });
  await testInfo.attach("reader-viewport-geometry", { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
  expect(geometry[0].height).toBeGreaterThan(80);
  expect(geometry[0].height).toBeLessThan(390);
  expect(geometry[0].scrollHeight).toBeGreaterThan(geometry[0].clientHeight + 400);
  const actions = page.getByRole("button", { name: "More reader actions", exact: true });
  expect((await actions.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.getByLabel("Current page", { exact: true }).fill("3");
  await expect.poll(() => page.locator(".document-stage").evaluate(node => node.scrollTop)).toBeGreaterThan(400);
  expect((await actions.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(await page.locator(".workspace-mode-content").evaluate(node => node.scrollTop)).toBe(0);
  // Legacy reader links do not have the capability wrapper. Both routes must
  // keep the same bounded viewport, rather than relying on intrinsic page size.
  const taskHash = new URL(page.url()).hash;
  const projectId = taskHash.match(/^#\/workspace\/([^/]+)\/viewer/)?.[1];
  expect(projectId).toBeTruthy();
  await page.goto(`./#/viewer/${projectId}`);
  // Suspense temporarily retains the previous ready reader as a hidden tree.
  // Wait for the new route's visible surface, not that stale ready attribute.
  await expect(page.locator(".capability-gated-workspace")).toHaveCount(0);
  await expect(page.locator(".viewer-app")).toBeVisible();
  await expect(page.locator(".viewer-app")).toHaveAttribute("data-preferences-ready", "true");
  const legacyHeight = await page.locator(".document-stage").evaluate(node => node.clientHeight);
  expect(legacyHeight).toBeGreaterThan(80);
  expect(legacyHeight).toBeLessThan(390);
  await page.goto(`./${taskHash}`);
  await expect(page.locator(".capability-gated-workspace .viewer-app")).toBeVisible();
  await expect(page.locator(".capability-gated-workspace .viewer-app")).toHaveAttribute("data-preferences-ready", "true");
  expect(await page.locator(".document-stage").evaluate(node => node.clientHeight)).toBeGreaterThan(80);
  await openDocumentActions(page);
  await expect(page.getByRole("dialog", { name: "Document actions", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit this PDF", exact: true }).click();
  await expect(page.locator(".editor-app")).toBeVisible();
});

test("reader fit, download and search controls remain usable on narrow and wide screens", async ({ page }, testInfo) => {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).evaluate(element => {
    element.addEventListener("change", () => { (window as unknown as { readerTestOriginal: File }).readerTestOriginal = (element as HTMLInputElement).files![0]; }, { once: true });
  });
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(`${corpus}/plain-text.pdf`);
  await expect(page.locator('.viewer-app[data-preferences-ready="true"]')).toBeVisible();
  await readerCommand(page, "Single");
  if (await page.locator(".viewer-sidebar").isVisible()) await readerCommand(page, "Close panel");
  for (const width of [320, 390, 834, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    await readerCommand(page, "Fit width");
    await expect.poll(async () => {
      const stage = await page.locator(".document-stage").boundingBox();
      const paper = await page.locator(".pdf-page-shell").boundingBox();
      return !!stage && !!paper && paper.width <= stage.width && paper.x >= stage.x - 1 && paper.x + paper.width <= stage.x + stage.width + 1;
    }).toBe(true);
    await expect(page.getByRole("button", { name: "Download original PDF", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await openReaderOptions(page);
    const zoom = await page.getByLabel("Zoom", { exact: true }).evaluate(element => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
    expect(contrastRatio(zoom.foreground, zoom.background)).toBeGreaterThanOrEqual(4.5);
    await closeReaderOptions(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await readerCommand(page, "Fit page");
  await expect.poll(async () => (await page.locator(".pdf-page-shell").boundingBox())!.height <= (await page.locator(".document-stage").boundingBox())!.height).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("reader-phone.png") });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.screenshot({ path: testInfo.outputPath("reader-phone-dark.png") });
  await openReaderOptions(page);
  const darkZoom = await page.getByLabel("Zoom", { exact: true }).evaluate(element => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  expect(contrastRatio(darkZoom.foreground, darkZoom.background)).toBeGreaterThanOrEqual(4.5);
  await closeReaderOptions(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original PDF", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("plain-text.pdf");
  const stream = await file.createReadStream();
  if (!stream) throw new Error("Downloaded PDF stream is unavailable.");
  const actual: number[] = [];
  for await (const chunk of stream) actual.push(...Array.from(chunk as Uint8Array));
  const original = await page.evaluate(async () => Array.from(new Uint8Array(await (window as unknown as { readerTestOriginal: File }).readerTestOriginal.arrayBuffer())));
  expect(actual).toEqual(original);
});

test("reader accepts a blank draft, multi-digit page entry, and invalid-number recovery", async ({ page }) => {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles("tests/corpus/phase28/pages-50.pdf");
  await expect(page.locator('.viewer-app[data-preferences-ready="true"]')).toBeVisible();
  await readerCommand(page, "Single");
  const input = page.getByLabel("Current page", { exact: true });
  await input.fill(""); await expect(input).toHaveValue("");
  await input.fill("12"); await input.press("Enter");
  await expect(page.locator('.pdf-page-shell[data-page-number="12"]')).toBeVisible();
  await input.fill(""); await input.press("Escape"); await expect(input).toHaveValue("12"); await expect(input).toBeFocused();
  await input.fill("-1"); await input.press("Enter"); await expect(input).toHaveValue("12");
  await input.fill("999"); await input.press("Enter"); await expect(input).toHaveValue("50");
  await expect(page.locator('.pdf-page-shell[data-page-number="50"]')).toBeVisible();
});

test("document search shortcut works and changing a query removes stale results", async ({ page }) => {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(`${corpus}/plain-text.pdf`);
  await expect(page.locator('.viewer-app[data-preferences-ready="true"]')).toBeVisible();
  await page.keyboard.press("Control+f");
  const search = page.getByRole("searchbox", { name: "Search document", exact: true });
  await expect(search).toBeFocused();
  await search.fill("PLAIN_PAGE"); await search.press("Enter");
  await expect(page.locator(".search-results > button")).toHaveCount(3);
  await search.fill("THIS_TEXT_DOES_NOT_EXIST");
  await expect(page.locator(".search-results > button")).toHaveCount(0);
  await expect(page.locator(".search-summary")).toHaveCount(0);
  await search.press("Enter");
  await expect(page.locator(".search-summary")).toContainText("0 matches");
});
