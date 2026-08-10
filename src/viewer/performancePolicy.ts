import type { AppSettings } from "../types/settings";
export type DocumentBudgetClass = "normal" | "large" | "extreme";

export interface PerformanceBudget {
  id: DocumentBudgetClass;
  maxConcurrentRenders: number;
  maxPixelRatio: number;
  activationMarginPx: number;
  evictionDistanceScreens: number;
  maxLiveCanvases: number;
}

export function classifyDocumentBudget(pageCount: number, byteLength: number): DocumentBudgetClass {
  if (pageCount >= 1000 || byteLength >= 500_000_000) return "extreme";
  if (pageCount >= 250 || byteLength >= 100_000_000) return "large";
  return "normal";
}

export function performanceBudgetFor(id: DocumentBudgetClass): PerformanceBudget {
  if (id === "extreme") return { id, maxConcurrentRenders: 1, maxPixelRatio: 1.25, activationMarginPx: 450, evictionDistanceScreens: 1.2, maxLiveCanvases: 6 };
  if (id === "large") return { id, maxConcurrentRenders: 2, maxPixelRatio: 1.5, activationMarginPx: 900, evictionDistanceScreens: 2, maxLiveCanvases: 12 };
  return { id, maxConcurrentRenders: 4, maxPixelRatio: 3, activationMarginPx: 1600, evictionDistanceScreens: 5, maxLiveCanvases: 24 };
}

export interface ViewerPerformancePolicy {
  profile: AppSettings["renderingQuality"];
  effectiveProfile: Exclude<AppSettings["renderingQuality"], "adaptive">;
  largeDocument: boolean;
  extremeDocument: boolean;
  budgetClass: "normal" | "large" | "extreme";
  pixelRatioCap: number;
  renderConcurrency: number;
  activationMarginPx: number;
  evictionDistanceScreens: number;
  reasons: string[];
}

interface RuntimeSignals {
  deviceMemoryGb?: number;
  logicalProcessors: number;
  viewportPixels: number;
}

export function readRuntimeSignals(): RuntimeSignals {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    logicalProcessors: Math.max(1, navigator.hardwareConcurrency || 2),
    viewportPixels: Math.max(1, window.innerWidth * window.innerHeight * (window.devicePixelRatio || 1))
  };
}

export function deriveViewerPerformancePolicy(settings: AppSettings, pageCount: number, byteLength: number, signals = readRuntimeSignals()): ViewerPerformancePolicy {
  const reasons: string[] = [];
  const budgetClass = classifyDocumentBudget(pageCount, byteLength);
  const budget = performanceBudgetFor(budgetClass);
  const largeDocument = budgetClass !== "normal";
  const extremeDocument = budgetClass === "extreme";
  const constrainedMemory = signals.deviceMemoryGb !== undefined && signals.deviceMemoryGb <= 4;
  const constrainedCpu = signals.logicalProcessors <= 4;
  const highDensityViewport = signals.viewportPixels >= 5_000_000;

  let effectiveProfile: ViewerPerformancePolicy["effectiveProfile"];
  if (settings.renderingQuality === "adaptive") {
    if (largeDocument || constrainedMemory) effectiveProfile = "low-memory";
    else if (!constrainedCpu && !highDensityViewport && (signals.deviceMemoryGb ?? 8) >= 8) effectiveProfile = "high";
    else effectiveProfile = "balanced";
    reasons.push(`Adaptive profile selected ${effectiveProfile}.`);
  } else effectiveProfile = settings.renderingQuality;

  if (extremeDocument) reasons.push(`Extreme-document safeguards enabled (${pageCount} pages, ${formatMb(byteLength)} MB).`);
  else if (largeDocument) reasons.push(`Large-document safeguards enabled (${pageCount} pages, ${formatMb(byteLength)} MB).`);
  if (constrainedMemory) reasons.push(`Device memory signal is ${signals.deviceMemoryGb} GB.`);
  if (constrainedCpu) reasons.push(`${signals.logicalProcessors} logical processor(s) detected.`);
  if (highDensityViewport) reasons.push("High-density viewport detected; canvas scale is bounded.");

  const base = effectiveProfile === "high"
    ? { pixelRatioCap: 3, renderConcurrency: 4, activationMarginPx: 1600, evictionDistanceScreens: 5 }
    : effectiveProfile === "low-memory"
      ? { pixelRatioCap: 1.25, renderConcurrency: 1, activationMarginPx: 700, evictionDistanceScreens: 1.8 }
      : { pixelRatioCap: 2, renderConcurrency: 2, activationMarginPx: 1100, evictionDistanceScreens: 3 };

  return {
    profile: settings.renderingQuality,
    effectiveProfile,
    largeDocument,
    extremeDocument,
    budgetClass,
    pixelRatioCap: Math.min(base.pixelRatioCap, budget.maxPixelRatio),
    renderConcurrency: Math.min(base.renderConcurrency, budget.maxConcurrentRenders),
    activationMarginPx: Math.min(base.activationMarginPx, budget.activationMarginPx),
    evictionDistanceScreens: Math.min(base.evictionDistanceScreens, budget.evictionDistanceScreens),
    reasons
  };
}

function formatMb(bytes: number): string {
  return (bytes / 1_000_000).toFixed(bytes >= 1_000_000_000 ? 0 : 1);
}
