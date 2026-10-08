import { createP17NativeFidelityPdf } from "../../src/fixtures/p17NativeFidelityPdf";
import { switchMode } from "./helpers/taskFirst";
import { expect, test, type Page } from "@playwright/test";

async function openP17Fixture(page: Page): Promise<void> {
  await page.goto("./#/tools/read-pdf");
  await page.getByLabel("PDF file", { exact: true }).evaluate((node, data) => {
    const input = node as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(data).buffer], "p17-native-fidelity.pdf", { type: "application/pdf" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, Array.from(createP17NativeFidelityPdf()));
  await expect(page.locator(".viewer-app")).toBeVisible({ timeout: 20_000 });
  await switchMode(page, "editor");
}

async function selectByPanelEvidence(page: Page, buttons: ReturnType<Page["getByRole"]>, evidence: string | RegExp): Promise<void> {
  const panel = page.locator(".native-unified-properties");
  const count = await buttons.count();
  const observed: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const label = await button.getAttribute("aria-label") ?? `object ${index + 1}`;
    await button.click();
    await expect(panel).toBeVisible();
    const text = (await panel.innerText()).replace(/\s+/g, " ").slice(0, 800);
    observed.push(`${index + 1} [${label}]: ${text}`);
    if (await panel.getByText(evidence, typeof evidence === "string" ? { exact: true } : undefined).isVisible().catch(() => false)) return;
  }
  throw new Error(`No detected object exposed ${String(evidence)}. Inspected ${count} objects:\\n${observed.join("\\n")}`);
}

async function downloadEditedPdf(page: Page): Promise<void> {
  const options = page.locator(".editor-save-options");
  await options.locator("summary").click();
  const downloadPromise = page.waitForEvent("download");
  await options.getByRole("button", { name: "Download copy", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_edited\.pdf$/);
  await expect(page.getByText("Edited PDF downloaded")).toBeVisible({ timeout: 20_000 });
}

test("P17 preserves an attached soft mask during source-image transform and keeps replacement blocked", async ({ page }) => {
  await openP17Fixture(page);

  const images = page.getByRole("button", { name: /Select existing image:/ });
  await expect(images.first()).toBeVisible({ timeout: 20_000 });
  await selectByPanelEvidence(page, images, "Attached soft mask preserved");

  const properties = page.locator(".native-unified-properties");
  await expect(properties.getByText("Attached soft mask preserved", { exact: true })).toBeVisible();
  await expect(properties.getByText(/shared across 2 invocations/i)).toBeVisible();
  await expect(properties.getByLabel("Image operation").locator('option[value="replace"]')).toBeDisabled();

  const x = properties.getByLabel("X", { exact: true });
  await x.fill(String(Number(await x.inputValue()) + 12));
  await properties.getByRole("button", { name: "Apply source image transform" }).click();
  await expect(page.locator(".native-queued-count").filter({ hasText: "1 PDF edit ready" })).toHaveCount(1);

  await downloadEditedPdf(page);
});

test("P17 exposes clipped image content as inspectable but fidelity-protected", async ({ page }) => {
  await openP17Fixture(page);

  const images = page.getByRole("button", { name: /Select existing image:/ });
  await expect(images.nth(2)).toBeVisible({ timeout: 20_000 });
  await images.nth(2).click();

  const properties = page.locator(".native-unified-properties");
  await expect(properties.getByText("Fidelity-protected image", { exact: true })).toBeVisible();
  await expect(properties.getByText("Clipping", { exact: true })).toBeVisible();
  await expect(properties.getByText("Yes", { exact: true }).first()).toBeVisible();
  await expect(properties.getByRole("button", { name: /Apply image|Delete existing image/ })).toHaveCount(0);

  await images.nth(3).click();
  await expect(properties.getByText("Fidelity-protected image", { exact: true })).toBeVisible();
  await expect(properties.getByText("Blend", { exact: true })).toBeVisible();
  await expect(properties.getByText("Multiply", { exact: true })).toBeVisible();
});

test("P17 detects and rebuilds the generated merged irregular table", async ({ page }) => {
  await openP17Fixture(page);

  const tables = page.getByRole("button", { name: /Select existing table:/ });
  await expect(tables.first()).toBeVisible({ timeout: 20_000 });
  await selectByPanelEvidence(page, tables, "merged irregular");

  const properties = page.locator(".native-unified-properties");
  await expect(properties.getByText("Table editing", { exact: true })).toBeVisible();
  await expect(properties.getByText("merged irregular", { exact: true })).toBeVisible();

  await properties.getByLabel("Table operation").selectOption("rebuild");
  const firstCell = properties.getByLabel("Cell R1 C1", { exact: true });
  await expect(firstCell).toBeVisible();
  await firstCell.fill("P17 merged heading");
  await properties.getByRole("button", { name: "Apply structured table edit" }).click();

  await downloadEditedPdf(page);
});

test("P17 exposes deterministic adjacent-region metadata for qualified text columns", async ({ page }) => {
  await openP17Fixture(page);

  const text = page.getByRole("button", { name: /Select existing (?:text|paragraph):.*Left opening paragraph/i }).first();
  await expect(text).toBeVisible({ timeout: 20_000 });
  await text.click();

  const properties = page.locator(".native-unified-properties");
  await expect(properties.getByText(/Region 1\/2 · item 1/)).toBeVisible();
  await expect(properties.getByText(/uniquely detected two-column thread/i)).toBeVisible();
});
