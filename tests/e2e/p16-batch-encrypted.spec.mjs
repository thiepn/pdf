import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("P16 Batch exposes parity steps and recovers encrypted queue items with session-only credentials", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("./#/batch");
  await expect(page.getByRole("heading", { name: /Apply the same saved actions to multiple PDFs/i })).toBeVisible();

  const stepSelect = page.locator(".batch-step-add select");
  await expect(stepSelect.locator('option[value="target-size"]')).toHaveText("Compress to target size");
  await expect(stepSelect.locator('option[value="extract-pages"]')).toHaveText("Extract pages");
  await expect(stepSelect.locator('option[value="remove-pages"]')).toHaveText("Remove pages");
  await expect(stepSelect.locator('option[value="flatten"]')).toHaveText("Flatten forms / annotations");
  await expect(stepSelect.locator('option[value="sanitize"]')).toHaveText("Clean risky content");

  const manifest = JSON.parse(await readFile("tests/corpus/generated/manifest.json", "utf8"));
  const fixtureRecord = manifest.files.find((entry) => entry.filename === "encrypted-aes256.pdf");
  expect(fixtureRecord?.expect?.password).toBeTruthy();
  const fixtureCredential = fixtureRecord.expect.password;

  const encryptedFixture = "tests/corpus/generated/encrypted-aes256.pdf";
  await page.locator('.batch-toolbar input[type="file"]').setInputFiles(encryptedFixture);
  const item = page.locator(".batch-item").filter({ hasText: "encrypted-aes256.pdf" });
  await expect(item).toBeVisible();

  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await expect(item).toContainText("Password required", { timeout: 30000 });

  const credentialInput = page.getByLabel("Password for encrypted-aes256.pdf");
  await credentialInput.fill(fixtureCredential);
  await item.getByRole("button", { name: "Use for this file", exact: true }).click();
  await expect(item).toContainText("Session password ready", { timeout: 30000 });
  await expect(credentialInput).toHaveCount(0);

  const recipeDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workflow", exact: true }).click();
  const recipeFile = await recipeDownload;
  const recipePath = await recipeFile.path();
  expect(recipePath).toBeTruthy();
  const recipeJson = await readFile(recipePath, "utf8");
  expect(recipeJson).not.toContain(fixtureCredential);
  expect(recipeJson).not.toMatch(/password|credential/i);

  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await expect(item.getByRole("button", { name: "Download", exact: true })).toBeVisible({ timeout: 60000 });
  await expect(item).toContainText("Ready");
  await expect(item).toContainText("Session password ready");
});

test("P16 Batch terminal semantics remain explicit", async ({ page }) => {
  await page.goto("./#/batch");
  const select = page.locator(".batch-step-add select");

  await select.selectOption("split-fixed");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await expect(page.locator(".batch-step").last()).toContainText("Terminal step · produces a ZIP of ordered PDF parts.");

  await select.selectOption("page-images");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await expect(page.locator(".batch-step").last()).toContainText("Terminal step · produces a ZIP of PNG pages in source-page order.");
  await expect(page.locator(".batch-step")).toHaveCount(2);
});
