import type { ViewerPreferences } from "../types/project";

export type ViewerPreferenceChanges = Partial<Pick<ViewerPreferences,
  "pageNumber" | "zoom" | "viewMode" | "sidebarTab" | "sidebarOpen">>;

/** Late storage reads must never overwrite choices made since this view opened. */
export function restoreViewerPreferences(
  saved: ViewerPreferences | undefined,
  current: ViewerPreferences,
  changes: ViewerPreferenceChanges,
  pageCount: number,
  compact: boolean
): ViewerPreferences {
  const merged = { ...current, ...saved, ...(compact ? { sidebarOpen: false } : {}), ...changes };
  return {
    ...merged,
    projectId: current.projectId,
    pageNumber: Math.max(1, Math.min(Math.max(1, pageCount), Math.round(Number.isFinite(merged.pageNumber) ? merged.pageNumber : 1))),
    zoom: Math.max(0.25, Math.min(4, Number.isFinite(merged.zoom) ? merged.zoom : 1)),
    viewMode: merged.viewMode === "single" ? "single" : "continuous",
    sidebarTab: ["pages", "outline", "search", "info"].includes(merged.sidebarTab) ? merged.sidebarTab : "pages",
    sidebarOpen: merged.sidebarOpen !== false
  };
}
