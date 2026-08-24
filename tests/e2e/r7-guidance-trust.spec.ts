import { expect, test } from "@playwright/test";

const generatedCorpus = "tests/corpus/generated";

test("R7 capability blocker explains why, recovery, and document safety", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "R7 trust copy is browser-independent");
  await page.goto("./#/home");
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(`${generatedCorpus}/annotations.pdf`);
  await expect(page.getByText("ANNOTATION_TARGET_TEXT", { exact: true })).toBeVisible({ timeout: 20_000 });
  const match = page.url().match(/\/workspace\/([^/]+)\/viewer/);
  expect(match?.[1]).toBeTruthy();
  const projectId = decodeURIComponent(match?.[1] ?? "");

  await page.goto(`./#/workspace/${encodeURIComponent(projectId)}/secure/fill-forms`);
  const blocker = page.locator(".task-capability-blocker");
  await expect(blocker.getByRole("heading", { name: /Fill PDF forms cannot start for this document/i })).toBeVisible();
  await expect(blocker.getByText("Why", { exact: true })).toBeVisible();
  await expect(blocker.getByText("What you can do", { exact: true })).toBeVisible();
  await expect(blocker.getByText("This task did not start. Your PDF is unchanged.", { exact: true })).toBeVisible();
});

test("R7 update guidance never blocks normal workspace controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit", "Cover the browser that previously exposed update-banner pointer interception");
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  const history = page.getByRole("button", { name: "History", exact: true });
  await expect(history).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("local-pdf-studio-update-available", {
      detail: { registration: { waiting: null } }
    }));
  });
  const update = page.locator(".update-banner");
  await expect(update).toContainText("App update ready.");
  await expect(update).toContainText("Your open PDFs stay local.");
  expect(await update.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  expect(await update.locator("span").evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  expect(await update.locator("div").evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("auto");

  // The user contract is interaction safety, not a requirement that a passive
  // notification's visual rectangle can never overlap workspace geometry.
  // Clicking History must succeed without dismissing the update notice.
  await history.click();
  await expect(page.getByRole("heading", { name: "History & checkpoints" })).toBeVisible();
});
