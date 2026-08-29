import { expect, test } from "@playwright/test";

test.describe("R5 desktop workspace hierarchy", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("home is task-first with workspace recovery secondary", async ({ page }) => {
    await page.goto("./#/home");

    await expect(page.getByRole("heading", { name: "What do you want to do with your PDF?" })).toBeVisible();
    await expect(page.locator(".home-task-card")).toHaveCount(8);
    await expect(page.getByRole("link", { name: /Edit PDF/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Merge PDFs/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "All PDF tools", exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Open PDF", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore project", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open sample", exact: true })).toBeVisible();

    const heroRadius = await page.locator(".consumer-home-hero").evaluate((element) => Number.parseFloat(getComputedStyle(element).borderRadius));
    expect(heroRadius).toBeLessThanOrEqual(10);
    await expect(page.getByText(/Local autosave\. Browser storage can still be cleared/)).toBeVisible();
  });

  test("keeps one compact document header and one dominant primary mode rail", async ({ page }) => {
    await page.goto("./#/home");
    await page.getByRole("button", { name: "Open sample" }).click();
    await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);

    const navigation = page.getByRole("navigation", { name: "Document workspace" }).first();
    for (const destination of ["Read", "Edit", "Pages", "Tools"]) {
      await expect(navigation.getByRole("button", { name: destination, exact: true })).toBeVisible();
    }

    await expect(page.locator(".workspace-commandbar")).toBeVisible();
    await expect(page.locator(".workspace-mobile-nav")).toBeHidden();
    await expect(page.locator(".workspace-tab__document").first()).toBeHidden();

    const commandbarHeight = await page.locator(".workspace-commandbar").evaluate((element) => element.getBoundingClientRect().height);
    const modeRailHeight = await page.locator(".workspace-modes--primary").evaluate((element) => element.getBoundingClientRect().height);
    expect(commandbarHeight).toBeLessThanOrEqual(58);
    expect(modeRailHeight).toBeLessThanOrEqual(46);

    const activeRead = navigation.getByRole("button", { name: "Read", exact: true });
    await expect(activeRead).toHaveAttribute("aria-current", "page");
    const activeBorder = await activeRead.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.borderBottomWidth, color: style.borderBottomColor };
    });
    expect(activeBorder.width).toBe("2px");
    expect(activeBorder.color).not.toBe("rgba(0, 0, 0, 0)");

    const contextbar = page.locator(".workspace-contextbar");
    if (await contextbar.count()) await expect(contextbar).toBeHidden();

    const viewerCommandbar = page.locator(".viewer-commandbar");
    await expect(viewerCommandbar).toBeVisible();
    expect(await viewerCommandbar.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(48);
    await expect(page.locator(".viewer-file-title strong")).toBeHidden();
    await expect(page.locator(".viewer-file-title span")).toBeVisible();

    const history = page.getByRole("button", { name: "History", exact: true });
    await expect(history).toBeVisible();
    await history.click();
    await expect(page.getByRole("heading", { name: "History & checkpoints" })).toBeVisible();
    await history.click();

    await navigation.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByRole("tab", { name: /pdf-studio-welcome Edit/ })).toHaveAttribute("aria-selected", "true");

    const editorCommandbar = page.locator(".editor-commandbar");
    await expect(editorCommandbar).toBeVisible();
    expect(await editorCommandbar.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(48);
    await expect(page.locator(".editor-file-group strong")).toBeHidden();
    await expect(page.locator(".editor-file-group span")).toBeVisible();

    const editorProperties = page.locator(".editor-properties").first();
    await expect(editorProperties).toBeVisible();
    expect(await editorProperties.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("0px");

    const editorToolrail = page.locator(".editor-toolrail");
    await expect(editorToolrail.getByRole("button")).toHaveCount(18);
    for (const tool of ["Select", "Text", "Image", "Signature", "Highlight", "Comment", "Mark redaction", "Rectangle"]) {
      await expect(editorToolrail.getByRole("button", { name: tool, exact: true })).toBeVisible();
    }
    const primaryToolHeight = await editorToolrail.getByRole("button", { name: "Select", exact: true }).evaluate((element) => element.getBoundingClientRect().height);
    const secondaryToolHeight = await editorToolrail.getByRole("button", { name: "Rectangle", exact: true }).evaluate((element) => element.getBoundingClientRect().height);
    expect(primaryToolHeight).toBeGreaterThan(secondaryToolHeight);

    await navigation.getByRole("button", { name: "Tools", exact: true }).click();
    await expect(page).toHaveURL(/\/toolbox$/);
    const toolHero = page.locator(".document-tools-hub__hero");
    await expect(toolHero).toBeVisible();
    expect(await toolHero.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("0px");

    const firstTask = page.locator(".document-task-card").first();
    await expect(firstTask).toBeVisible();
    expect(await firstTask.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("0px");
  });
});
