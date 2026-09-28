/** Fit the rotated page viewport into the usable area without rounding it wider. */
export function fitPageZoom(page: { width: number; height: number }, area: { width: number; height: number }, mode: "width" | "page"): number {
  if (![page.width, page.height, area.width, area.height].every(value => Number.isFinite(value) && value > 0)) return 1;
  const scale = mode === "width" ? area.width / page.width : Math.min(area.width / page.width, area.height / page.height);
  return Math.max(0.01, Math.min(4, Math.floor(scale * 10000) / 10000));
}

/** Keep drafts such as an empty field separate from a valid document position. */
export function pageNumberFromDraft(value: string, total: number, fallback: number, commit = false): number | null {
  const limit = Math.max(1, Number.isFinite(total) ? Math.floor(total) : 1);
  if (!/^\d+$/.test(value.trim())) return commit ? Math.max(1, Math.min(limit, fallback)) : null;
  const page = Number(value);
  if (!Number.isFinite(page)) return commit ? Math.max(1, Math.min(limit, fallback)) : null;
  return commit ? Math.max(1, Math.min(limit, page)) : page >= 1 && page <= limit ? page : null;
}
