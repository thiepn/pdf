import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFile } from "node:fs/promises";
import { openSample, chooseEditorTool } from "./helpers/taskFirst";

test.setTimeout(90_000);
test("F3 threads and metric dimension survive real editor export", async ({ page }) => {
  await openSample(page, "editor");
  const canvas = page.locator(".editor-page-layers");
  await expect(canvas).toBeVisible();

  await chooseEditorTool(page,"Comment");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + 110, box.y + 150);
  await expect(page.locator(".editor-object--note")).toHaveCount(1);
  await page.getByLabel("Review reply").fill("Please check the dimensions.");
  await page.getByRole("button",{name:"Add reply"}).click();
  await expect(page.locator(".f3-reply-list li")).toHaveCount(1);
  await page.getByLabel("Review status").selectOption("resolved");

  await chooseEditorTool(page,"Measure distance");
  await page.mouse.move(box.x + 220, box.y + 290);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 330, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".editor-object--measurement")).toHaveCount(1);
  await page.getByLabel("Known measurement length in mm").fill("1000");
  await page.getByRole("button",{name:"Apply calibration"}).click();
  await page.getByLabel("Measurement unit").selectOption("cm");
  await expect(page.locator(".f3-measurement-result")).toContainText("100 cm");

  const downloadPromise = page.waitForEvent("download",{timeout:60_000});
  await page.getByRole("button",{name:"Download PDF",exact:true}).click();
  const download = await downloadPromise;
  const pdf = mupdf.Document.openDocument(await readFile(await download.path()),"application/pdf").asPDF();
  expect(pdf).not.toBeNull();
  try {
    const first = pdf.loadPage(0);
    try {
      const annotations = first.getAnnotations();
      try {
        const replies = annotations.filter(a=>!a.getObject().get("IRT").isNull());
        expect(replies.some(a=>a.getContents()==="Please check the dimensions.")).toBe(true);
        const parent = annotations.find(a=>a.getName() === replies[0]?.getObject().get("IRT").resolve().get("NM").asString());
        expect(parent).toBeDefined();
        const measurement = annotations.find(a=>a.getType()==="Line" && !a.getObject().get("Measure").isNull());
        expect(measurement).toBeDefined();
        expect(measurement.getObject().get("Measure").get("Subtype").asName()).toBe("RL");
        expect(measurement.getContents()).toMatch(/100 cm/);
      } finally { annotations.forEach(a=>a.destroy()); }
    } finally { first.destroy(); }
  } finally { pdf.destroy(); }
});
