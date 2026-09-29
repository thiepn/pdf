import { test, expect } from "@playwright/test";
import mupdf from "mupdf";
import { readFile } from "node:fs/promises";
function fixture(count = 3) {
    const pdf = new mupdf.PDFDocument();
    const font = new mupdf.Font("Helvetica");
    try {
        const embedded = pdf.addSimpleFont(font);
        for (let number = 1; number <= count; number++)
            pdf.insertPage(-1, pdf.addPage([0, 0, 420, 594], 0, { Font: { F1: embedded } }, `BT /F1 24 Tf 44 510 Td (Document page ${number}) Tj /F1 12 Tf 0 -34 Td (A real PDF for task-first interaction checks.) Tj ET`));
        const bytes = pdf.saveToBuffer({});
        try {
            return Buffer.from(bytes.asUint8Array());
        }
        finally {
            bytes.destroy();
        }
    }
    finally {
        pdf.destroy();
        font.destroy();
    }
}
async function capture(page, info, name) {
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
}
async function noOverflow(page) {
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
}
async function editor(page) {
    await page.goto("./#/tools/edit-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "Quarterly report.pdf", mimeType: "application/pdf", buffer: fixture() });
    await expect(page.locator(".editing-toolbar")).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".editor-stage canvas").first()).toBeVisible({ timeout: 30000 });
}
async function downloadPdf(page) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF", exact: true }).click();
    const result = await pending;
    const path = await result.path();
    expect(path).toBeTruthy();
    return readFile(path);
}
test.setTimeout(60000);
test("homepage is a task-first surface on desktop and mobile, without navigation tabs", async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("./#/home");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Less work.");
    await expect(page.locator(".product-tool-card")).toHaveCount(12);
    await expect(page.locator('[role="tablist"],.app-sidebar,.workspace-tabs')).toHaveCount(0);
    await noOverflow(page);
    await capture(page, info, "01-home-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await capture(page, info, "02-home-mobile");
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await capture(page, info, "03-home-dark-mobile");
});
test("tool directory groups plain-language tasks without mode or category tabs", async ({ page }, info) => {
    await page.goto("./#/tools");
    await expect(page.getByRole("searchbox", { name: "Find a PDF tool" })).toBeVisible();
    await expect(page.locator('[role="tablist"]')).toHaveCount(0);
    await capture(page, info, "04-all-tools");
    await page.getByRole("searchbox", { name: "Find a PDF tool" }).fill("remove pages");
    await page.locator('.product-tool-card[href="#/quick/remove-pages"]').click();
    await expect(page.getByRole("button", { name: "Choose PDF", exact: true })).toBeVisible();
    await capture(page, info, "05-tool-entry");
});
test("file-first entry hands the file directly into page selection and downloads a valid result", async ({ page }, info) => {
    await page.goto("./#/home");
    await page.getByLabel("Choose files to get started", { exact: true }).setInputFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: fixture() });
    await page.getByRole("button", { name: /^Extract pages/ }).click();
    await expect(page).toHaveURL(/quick\/extract-pages$/);
    await page.getByRole("textbox", { name: "Pages", exact: true }).fill("3,1");
    await expect(page.getByRole("button", { name: "Page 2", exact: true })).toHaveAttribute("aria-pressed", "false");
    await capture(page, info, "06-page-selection");
    await page.getByRole("button", { name: "Extract selected pages", exact: true }).click();
    await expect(page.getByRole("region", { name: "Your files are ready" })).toBeVisible();
    await expect(page.locator(".task-options")).toHaveCount(0);
    await capture(page, info, "07-download-result");
    const pdf = mupdf.Document.openDocument(await downloadPdf(page), "application/pdf");
    try {
        expect(pdf.countPages()).toBe(2);
        const first = pdf.loadPage(0);
        const text = first.toStructuredText();
        try {
            expect(text.asText()).toContain("Document page 3");
        }
        finally {
            text.destroy();
            first.destroy();
        }
    }
    finally {
        pdf.destroy();
    }
    await page.getByRole("button", { name: "Edit options", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Pages", exact: true })).toHaveValue("3,1");
});
test("multiple files only suggest a compatible action and keep their order", async ({ page }, info) => {
    await page.goto("./#/home");
    await page.getByLabel("Choose files to get started", { exact: true }).setInputFiles([{ name: "first.pdf", mimeType: "application/pdf", buffer: fixture(2) }, { name: "second.pdf", mimeType: "application/pdf", buffer: fixture(1) }]);
    await expect(page.locator(".product-tool-card")).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^Compare PDFs/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Compress PDF/ })).toBeVisible();
    await page.getByRole("button", { name: /^Merge PDFs/ }).click();
    await expect(page.locator(".task-file-card")).toHaveCount(2);
    await page.getByRole("button", { name: "Move second.pdf up", exact: true }).click();
    await expect(page.locator(".task-file-card").first()).toContainText("second.pdf");
    await capture(page, info, "08-merge-arrange");
});
test("editor replaces document tabs and mode tabs with direct tools and focused dialogs", async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await editor(page);
    await expect(page.locator('[role="tablist"],.workspace-tabs,.workspace-modebar,.editor-toolrail')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Editing tools" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeEnabled();
    await capture(page, info, "09-editor-desktop");
    await page.getByRole("button", { name: "More tools", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Editor tools" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Editor tools" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More tools", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Document actions", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Document actions" })).toBeVisible();
    await capture(page, info, "10-document-actions");
    await page.keyboard.press("Escape");
    const pdf = mupdf.Document.openDocument(await downloadPdf(page), "application/pdf");
    try {
        expect(pdf.countPages()).toBe(3);
    }
    finally {
        pdf.destroy();
    }
});
test("mobile editor exposes touch-sized direct tools and does not overflow the viewport", async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await editor(page);
    await noOverflow(page);
    await capture(page, info, "11-editor-mobile");
    await page.getByRole("button", { name: "More tools", exact: true }).click();
    const tools = page.getByRole("dialog", { name: "Editor tools" });
    await expect(tools.getByRole("button", { name: /Existing-content selection/ })).toBeVisible();
    await capture(page, info, "12-editor-mobile-tools");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "More tools", exact: true }).click();
    const reopenedTools = page.getByRole("dialog", { name: "Editor tools" });
    await reopenedTools.getByRole("button", { name: "Show pages", exact: true }).click();
    await expect(reopenedTools).toHaveCount(0);
    await expect(page.locator(".editor-left-panel")).toBeVisible();
    const backdrop = page.getByRole("button", { name: "Close editor panel", exact: true });
    const bounds = await backdrop.boundingBox();
    expect(bounds).toBeTruthy();
    await backdrop.click({ position: { x: bounds.width - 8, y: 10 } });
    await expect(page.locator(".editor-left-panel")).toHaveCount(0);
});
test("app menu traps focus, closes with Escape, and the skip link does not change the route", async ({ page }) => {
    await page.goto("./#/tools");
    await page.getByRole("button", { name: "Open app menu" }).click();
    await expect(page.getByRole("dialog", { name: "PDF Studio" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator(".skip-link").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/tools$/);
    await expect(page.locator("#main-workspace")).toBeFocused();
});
