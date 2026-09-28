import { describe, expect, it } from "vitest";
import { fitPageZoom, pageNumberFromDraft } from "../../src/viewer/readerControls";
import { restoreViewerPreferences } from "../../src/viewer/restorePreferences";
import type { ViewerPreferences } from "../../src/types/project";

describe("reader fitting and page entry", () => {
  it("fits a page inside a phone without horizontal clipping", () => {
    const zoom = fitPageZoom({ width: 612, height: 792 }, { width: 294, height: 500 }, "width");
    expect(612 * zoom).toBeLessThanOrEqual(294);
    expect(612 * zoom).toBeGreaterThan(293);
  });
  it("uses both rotated dimensions for fit-page", () => {
    const zoom = fitPageZoom({ width: 792, height: 612 }, { width: 1100, height: 200 }, "page");
    expect(792 * zoom).toBeLessThanOrEqual(1100);
    expect(612 * zoom).toBeLessThanOrEqual(200);
    expect(612 * zoom).toBeGreaterThan(199);
  });
  it("supports very large pages and guards invalid geometry", () => {
    expect(fitPageZoom({ width: 10000, height: 12000 }, { width: 300, height: 500 }, "width")).toBe(0.03);
    expect(fitPageZoom({ width: 0, height: 792 }, { width: 300, height: 500 }, "page")).toBe(1);
    expect(fitPageZoom({ width: 612, height: 792 }, { width: 300, height: NaN }, "page")).toBe(1);
  });
  it("does not turn an empty or invalid draft into page one", () => {
    for (const value of ["", "-1", "1.5", "NaN", "9e2", "0", "999"]) expect(pageNumberFromDraft(value, 50, 12)).toBeNull();
    expect(pageNumberFromDraft("12", 50, 3)).toBe(12);
    expect(pageNumberFromDraft("", 50, 12, true)).toBe(12);
    expect(pageNumberFromDraft("999", 50, 12, true)).toBe(50);
    expect(pageNumberFromDraft("0", 50, 12, true)).toBe(1);
  });
  it("preserves fitted scales below the old 25% minimum on reopening", () => {
    const preferences: ViewerPreferences = { projectId: "fit", pageNumber: 1, zoom: 0.03, viewMode: "single", sidebarTab: "pages", sidebarOpen: false, updatedAt: 0 };
    expect(restoreViewerPreferences(preferences, { ...preferences, zoom: 1 }, {}, 3, true).zoom).toBe(0.03);
  });
});
