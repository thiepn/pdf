export type ResponsiveClass = "phone" | "tablet" | "desktop";

export interface ViewportMetrics {
  layoutHeight: number;
  visualHeight: number;
  offsetTop: number;
  keyboardInset: number;
  keyboardOpen: boolean;
}

export function classifyResponsiveWidth(width: number): ResponsiveClass {
  if (!Number.isFinite(width) || width <= 0) return "desktop";
  if (width <= 680) return "phone";
  if (width <= 1100) return "tablet";
  return "desktop";
}

export function deriveViewportMetrics(layoutHeight: number, visualHeight: number, offsetTop = 0): ViewportMetrics {
  const safeLayout = Math.max(0, Number.isFinite(layoutHeight) ? layoutHeight : 0);
  const safeVisual = Math.max(0, Number.isFinite(visualHeight) ? visualHeight : safeLayout);
  const safeOffset = Math.max(0, Number.isFinite(offsetTop) ? offsetTop : 0);
  const keyboardInset = Math.max(0, Math.round(safeLayout - safeVisual - safeOffset));
  return {
    layoutHeight: safeLayout,
    visualHeight: safeVisual || safeLayout,
    offsetTop: safeOffset,
    keyboardInset,
    keyboardOpen: keyboardInset >= 120
  };
}
