import { expect, test } from "@playwright/test";

const HISTORY_STORES = new Set(["workspaceEvents", "workspaceCheckpoints", "documentTransactions", "documentRevisions"]);

test.describe("Recovery P1 workspace lifecycle", () => {
  test("Read to Edit keeps the workspace shell mounted and does not read History stores", async ({ page }) => {
    await page.goto("./#/home");
    await page.getByRole("button", { name: "Open sample" }).click();
    await expect(page.getByRole("heading", { name: /pdf-studio-welcome/i })).toBeVisible();
    await expect(page.getByText("Editing", { exact: true })).toBeVisible();

    await page.evaluate(() => {
      window.__PDF_STUDIO_PERFORMANCE__?.clear();
      document.querySelector(".unified-workspace")?.setAttribute("data-p1-shell-token", "persistent");
    });

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(/#\/workspace\/[^/]+\/editor/);
    await expect(page.locator('.unified-workspace[data-p1-shell-token="persistent"]')).toBeVisible();
    await expect(page.getByText("Opening document…", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Text$/ })).toBeVisible();

    const forbiddenHistoryReads = await page.evaluate((stores) => {
      const blocked = new Set(stores);
      return (window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? []).filter((entry) =>
        entry.category === "storage"
        && (entry.name === "indexeddb.getAll" || entry.name === "indexeddb.getAllByIndex")
        && blocked.has(String(entry.detail?.store ?? ""))
      ).map((entry) => ({ name: entry.name, store: entry.detail?.store }));
    }, [...HISTORY_STORES]);
    expect(forbiddenHistoryReads).toEqual([]);
  });

  test("History storage is loaded only after the History panel is opened", async ({ page }) => {
    await page.goto("./#/home");
    await page.getByRole("button", { name: "Open sample" }).click();
    await expect(page.getByRole("heading", { name: /pdf-studio-welcome/i })).toBeVisible();
    await page.evaluate(() => window.__PDF_STUDIO_PERFORMANCE__?.clear());

    const before = await historyReadStores(page);
    expect(before).toEqual([]);

    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByRole("heading", { name: "History & checkpoints" })).toBeVisible();
    await expect.poll(() => historyReadStores(page)).toContain("workspaceCheckpoints");

    const after = await historyReadStores(page);
    expect(after).toContain("workspaceEvents");
    expect(after).toContain("workspaceCheckpoints");
    expect(after).toContain("documentTransactions");
    expect(after).toContain("documentRevisions");
  });
});

async function historyReadStores(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate((stores) => {
    const allowed = new Set(stores);
    return Array.from(new Set((window.__PDF_STUDIO_PERFORMANCE__?.snapshot() ?? [])
      .filter((entry) => entry.category === "storage"
        && (entry.name === "indexeddb.getAll" || entry.name === "indexeddb.getAllByIndex")
        && allowed.has(String(entry.detail?.store ?? "")))
      .map((entry) => String(entry.detail?.store ?? ""))));
  }, [...HISTORY_STORES]);
}
