import { expect, test } from "@playwright/test";

async function applyDarkPalette(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--ink", "#f4f1ea");
    root.style.setProperty("--muted", "#aeb7c0");
    root.style.setProperty("--surface-subtle", "#12171c");
    root.style.setProperty("--surface-strong", "#1d232a");
    root.style.setProperty("--line", "#303740");
    root.style.setProperty("--line-strong", "#46515d");
    root.style.setProperty("--accent", "#ff9388");
  });
}

test("task catalog keeps icons visible and capability metadata in normal flow", async ({ page }) => {
  await page.goto("./#/tools");
  await expect(page.getByRole("heading", { name: "What do you want to do?" })).toBeVisible();

  // Reproduce a dark palette explicitly so this regression cannot hide behind
  // the default CI appearance settings.
  await applyDarkPalette(page);

  const tiles = page.locator(".task-tile");
  expect(await tiles.count()).toBeGreaterThan(5);

  const iconState = await tiles.first().evaluate((tile) => {
    const iconBox = tile.querySelector(":scope > span");
    const svg = iconBox?.querySelector("svg");
    if (!(iconBox instanceof HTMLElement) || !(svg instanceof SVGElement)) return null;
    const boxStyle = getComputedStyle(iconBox);
    const svgStyle = getComputedStyle(svg);
    const boxRect = iconBox.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    return {
      background: boxStyle.backgroundColor,
      color: boxStyle.color,
      svgColor: svgStyle.color,
      boxWidth: boxRect.width,
      boxHeight: boxRect.height,
      svgWidth: svgRect.width,
      svgHeight: svgRect.height
    };
  });

  expect(iconState).not.toBeNull();
  expect(iconState!.background).not.toBe(iconState!.color);
  expect(iconState!.svgColor).toBe(iconState!.color);
  expect(iconState!.boxWidth).toBeGreaterThanOrEqual(40);
  expect(iconState!.boxHeight).toBeGreaterThanOrEqual(40);
  expect(iconState!.svgWidth).toBeGreaterThan(0);
  expect(iconState!.svgHeight).toBeGreaterThan(0);

  const layoutProblems = await tiles.evaluateAll((cards) => {
    const problems: string[] = [];
    const intersects = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) > Math.max(a.left, b.left)
      && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

    cards.forEach((card, cardIndex) => {
      const cardRect = card.getBoundingClientRect();
      const metadata = Array.from(card.querySelectorAll("small, .task-capability-chip"));
      const copy = card.querySelector(":scope > div");
      const title = copy?.querySelector(":scope > strong");
      const purpose = copy?.querySelector(":scope > p");

      for (const item of metadata) {
        const style = getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        if (style.position === "absolute" || style.position === "fixed") {
          problems.push(`card ${cardIndex}: metadata escaped normal flow`);
        }
        if (rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1 || rect.top < cardRect.top - 1 || rect.bottom > cardRect.bottom + 1) {
          problems.push(`card ${cardIndex}: metadata escaped card bounds`);
        }
        if (title && intersects(rect, title.getBoundingClientRect())) {
          problems.push(`card ${cardIndex}: metadata overlaps title`);
        }
        if (purpose && intersects(rect, purpose.getBoundingClientRect())) {
          problems.push(`card ${cardIndex}: metadata overlaps purpose`);
        }
      }

      for (let i = 0; i < metadata.length; i += 1) {
        for (let j = i + 1; j < metadata.length; j += 1) {
          if (intersects(metadata[i].getBoundingClientRect(), metadata[j].getBoundingClientRect())) {
            problems.push(`card ${cardIndex}: metadata items overlap each other`);
          }
        }
      }
    });

    return problems;
  });

  expect(layoutProblems).toEqual([]);
});

test("selected task warning stays contained at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("./#/tools/visual-signature");
  await expect(page.getByRole("heading", { name: "Add visual signature" })).toBeVisible();
  await applyDarkPalette(page);

  const focus = page.locator(".task-focus");
  await expect(focus).toBeVisible();

  const layoutProblems = await focus.evaluate((banner) => {
    const problems: string[] = [];
    const bannerRect = banner.getBoundingClientRect();
    const row = banner.querySelector(":scope > div");
    const copy = row?.querySelector(":scope > div");
    const title = copy?.querySelector("h2");
    const purpose = Array.from(copy?.querySelectorAll("p") ?? []).find((item) => !item.classList.contains("eyebrow"));
    const metadata = Array.from(copy?.querySelectorAll(".task-capability-chip, .task-capability-reason, .task-capability-recovery") ?? []);
    const intersects = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) > Math.max(a.left, b.left)
      && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

    for (const item of metadata) {
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      if (style.position === "absolute" || style.position === "fixed") {
        problems.push("selected task metadata escaped normal flow");
      }
      if (rect.left < bannerRect.left - 1 || rect.right > bannerRect.right + 1 || rect.top < bannerRect.top - 1 || rect.bottom > bannerRect.bottom + 1) {
        problems.push("selected task metadata escaped banner bounds");
      }
      if (title && intersects(rect, title.getBoundingClientRect())) {
        problems.push("selected task metadata overlaps title");
      }
      if (purpose && intersects(rect, purpose.getBoundingClientRect())) {
        problems.push("selected task metadata overlaps purpose");
      }
    }

    for (let i = 0; i < metadata.length; i += 1) {
      for (let j = i + 1; j < metadata.length; j += 1) {
        if (intersects(metadata[i].getBoundingClientRect(), metadata[j].getBoundingClientRect())) {
          problems.push("selected task metadata items overlap each other");
        }
      }
    }

    return problems;
  });

  expect(layoutProblems).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
