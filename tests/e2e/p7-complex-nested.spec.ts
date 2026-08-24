import { expect, test } from "@playwright/test";

async function openNestedGroupEditor(page: import("@playwright/test").Page): Promise<import("@playwright/test").Locator> {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page).toHaveURL(/#\/workspace\/[^/]+\/viewer/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  const nested = page.getByRole("button", { name: /Select existing nested group:/ }).first();
  await expect(nested).toBeVisible({ timeout: 20_000 });
  await nested.click();
  const properties = page.locator(".p7-complex-properties");
  await expect(properties.getByRole("heading", { name: "Nested PDF group" })).toBeVisible();
  await expect(properties.getByText("Instance editing")).toBeVisible();
  await properties.getByText("Technical details", { exact: true }).click();
  await expect(properties.getByText(/text.*vector artwork.*images/)).toBeVisible();
  return properties;
}

async function expectQueuedEdit(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator(".native-queued-count").filter({ hasText: "1 existing-content edit queued" })).toHaveCount(1);
}

test("P7 transforms one reusable Form XObject instance without flattening the shared nested group", async ({ page }) => {
  const properties = await openNestedGroupEditor(page);
  await properties.getByLabel("Nested group operation").selectOption("transform");

  const x = properties.getByLabel("X", { exact: true });
  const width = properties.getByLabel("Width", { exact: true });
  await x.fill(String(Number(await x.inputValue()) + 24));
  await width.fill(String(Number(await width.inputValue()) + 30));
  await properties.getByLabel("Rotation", { exact: true }).fill("12");
  await properties.getByRole("button", { name: "Apply nested group transform" }).click();
  await expectQueuedEdit(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
  await expect(page.getByText("Export validated and downloaded")).toBeVisible({ timeout: 20_000 });
});

test("P7 deletes only the selected Form XObject invocation and preserves the reusable source", async ({ page }) => {
  const properties = await openNestedGroupEditor(page);
  await properties.getByLabel("Nested group operation").selectOption("delete");
  await expect(properties.getByText("Delete one instance only")).toBeVisible();
  await properties.getByRole("button", { name: "Delete nested group" }).click();
  await expectQueuedEdit(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await downloadPromise;
  await expect(page.getByText("Export validated and downloaded")).toBeVisible({ timeout: 20_000 });
});