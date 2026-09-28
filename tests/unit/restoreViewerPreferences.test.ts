import { describe, expect, it } from "vitest";
import type { ViewerPreferences } from "../../src/types/project";
import { restoreViewerPreferences } from "../../src/viewer/restorePreferences";
const defaults: ViewerPreferences = { projectId: "current", pageNumber: 1, zoom: 1, viewMode: "continuous", sidebarTab: "pages", sidebarOpen: true, updatedAt: 1 };
describe("reader preference restoration", () => {
  it("restores saved reading state without writing defaults over it", () => {
    const result = restoreViewerPreferences({ ...defaults, pageNumber: 7, zoom: 1.75, viewMode: "single" }, defaults, {}, 20, false);
    expect(result).toMatchObject({ pageNumber: 7, zoom: 1.75, viewMode: "single" });
  });
  it("preserves actions made before a delayed storage read completes", () => {
    const result = restoreViewerPreferences({ ...defaults, pageNumber: 7, zoom: 1.75 }, defaults, { pageNumber: 3, zoom: 2, sidebarTab: "search" }, 20, false);
    expect(result).toMatchObject({ pageNumber: 3, zoom: 2, sidebarTab: "search" });
  });
  it("keeps compact readers uncluttered unless the user explicitly opens the panel", () => {
    expect(restoreViewerPreferences(defaults, defaults, {}, 10, true).sidebarOpen).toBe(false);
    expect(restoreViewerPreferences(defaults, defaults, { sidebarOpen: true }, 10, true).sidebarOpen).toBe(true);
  });
  it("bounds invalid data and never restores another project identity", () => {
    const saved = { ...defaults, projectId: "other", pageNumber: 900, zoom: NaN, viewMode: "bad", sidebarTab: "bad" } as unknown as ViewerPreferences;
    expect(restoreViewerPreferences(saved, defaults, {}, 3, false)).toMatchObject({ projectId: "current", pageNumber: 3, zoom: 1, viewMode: "continuous", sidebarTab: "pages" });
  });
});
