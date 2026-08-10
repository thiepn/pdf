import { expect, test } from "@playwright/test";

test("core application and sample project do not request cross-origin resources", async ({ page }) => {
  const external = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") {
      const pageOrigin = "http://127.0.0.1:4173";
      if (url.origin !== pageOrigin) external.add(url.href);
    }
  });
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page.getByText("pdf-studio-welcome", { exact: true })).toBeVisible();
  expect([...external]).toEqual([]);
});
