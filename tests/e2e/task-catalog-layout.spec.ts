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
  await expect(page.getByRole("heading", { name: "Choose what you want to do" })).toBeVisible();
  await page.getByText("Advanced & specialist tools", { exact: true }).click();

  // Reproduce a dark palette explicitly so this regression cannot hide behind
  // the default CI appearance settings.
  await applyDarkPalette(page);

  const tiles = page.locator(".task-tile");
  const tileCount = await tiles.count();
  expect(tileCount).toBeGreaterThan(5);

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

  const layoutProblems: string[] = [];
  for (let cardIndex = 0; cardIndex < tileCount; cardIndex += 1) {
    const card = tiles.nth(cardIndex);
    // Task cards use content-visibility:auto for long catalogs. Force each card
    // through a real layout before reading descendant geometry so Chromium and
    // WebKit do not return intrinsic-placeholder rectangles for off-screen cards.
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    const problems = await card.evaluate((element, index) => {
      const cardProblems: string[] = [];
      const cardRect = element.getBoundingClientRect();
      const metadata = Array.from(element.querySelectorAll("small, .task-capability-chip"));
      const copy = element.querySelector(":scope > div");
      const title = copy?.querySelector(":scope > strong");
      const purpose = copy?.querySelector(":scope > p");
      const intersects = (a: DOMRect, b: DOMRect) =>
        Math.min(a.right, b.right) > Math.max(a.left, b.left)
        && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

      for (const item of metadata) {
        const style = getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        if (style.position === "absolute" || style.position === "fixed") {
          cardProblems.push(`card ${index}: metadata escaped normal flow`);
        }
        if (rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1 || rect.top < cardRect.top - 1 || rect.bottom > cardRect.bottom + 1) {
          cardProblems.push(`card ${index}: metadata escaped card bounds`);
        }
        if (title && intersects(rect, title.getBoundingClientRect())) {
          cardProblems.push(`card ${index}: metadata overlaps title`);
        }
        if (purpose && intersects(rect, purpose.getBoundingClientRect())) {
          cardProblems.push(`card ${index}: metadata overlaps purpose`);
        }
      }

      for (let i = 0; i < metadata.length; i += 1) {
        for (let j = i + 1; j < metadata.length; j += 1) {
          if (intersects(metadata[i].getBoundingClientRect(), metadata[j].getBoundingClientRect())) {
            cardProblems.push(`card ${index}: metadata items overlap each other`);
          }
        }
      }
      return cardProblems;
    }, cardIndex);
    layoutProblems.push(...problems);
  }

  expect(layoutProblems).toEqual([]);
});

test("selected task warning and catalog stay contained at narrow width", async ({ page }) => {
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

  const taskGrids = page.locator(".task-grid");
  expect(await taskGrids.count()).toBeGreaterThan(0);
  const narrowGridColumns = await taskGrids.first().evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length);
  expect(narrowGridColumns).toBe(1);

  const cardProblems = await page.locator(".task-tile").evaluateAll((cards) => cards.flatMap((card, cardIndex) => {
    const rect = card.getBoundingClientRect();
    const problems: string[] = [];
    if (rect.width === 0 && rect.height === 0) return problems;
    if (rect.left < -1 || rect.right > window.innerWidth + 1) problems.push(`card ${cardIndex}: card escaped viewport (${rect.left.toFixed(1)}..${rect.right.toFixed(1)})`);
    if (card.scrollWidth > card.clientWidth + 1) problems.push(`card ${cardIndex}: card content overflows by ${card.scrollWidth - card.clientWidth}px`);
    return problems;
  }));
  expect(cardProblems).toEqual([]);

  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);
});
