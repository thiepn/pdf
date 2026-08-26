export type RuntimeMetricCategory = "long-task" | "interaction" | "navigation" | "pdf" | "storage" | "worker" | "render" | "custom";

export interface RuntimeMetricDetail {
  [key: string]: string | number | boolean | null | undefined;
}

export interface RuntimeMetric {
  id: number;
  category: RuntimeMetricCategory;
  name: string;
  startTime: number;
  durationMs: number;
  observedAt: number;
  detail?: RuntimeMetricDetail;
}

export interface RuntimeMetricBucket {
  count: number;
  maxMs: number;
  p95Ms: number;
  totalMs: number;
}

export interface RuntimePerformanceSummary {
  total: number;
  longTasks: RuntimeMetricBucket;
  interactions: RuntimeMetricBucket;
  navigation: RuntimeMetricBucket;
  pdf: RuntimeMetricBucket;
  storage: RuntimeMetricBucket;
  worker: RuntimeMetricBucket;
  render: RuntimeMetricBucket;
  custom: RuntimeMetricBucket;
}

export interface RuntimePerformanceApi {
  snapshot(): RuntimeMetric[];
  summary(): RuntimePerformanceSummary;
  clear(): void;
}

declare global {
  interface Window {
    __PDF_STUDIO_PERFORMANCE__?: RuntimePerformanceApi;
  }
}

const MAX_METRICS = 1_500;
const metrics: RuntimeMetric[] = [];
let nextId = 1;
let initialized = false;
const observers: PerformanceObserver[] = [];
let pendingNavigation: { route: string; startTime: number } | null = null;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function push(metric: Omit<RuntimeMetric, "id" | "observedAt">): RuntimeMetric {
  const entry: RuntimeMetric = { ...metric, id: nextId++, observedAt: Date.now() };
  metrics.push(entry);
  if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS);
  return entry;
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
}

function bucket(category: RuntimeMetricCategory): RuntimeMetricBucket {
  const values = metrics.filter((entry) => entry.category === category).map((entry) => entry.durationMs);
  return {
    count: values.length,
    maxMs: values.length ? Math.max(...values) : 0,
    p95Ms: percentile(values, 0.95),
    totalMs: values.reduce((sum, value) => sum + value, 0)
  };
}

export function runtimePerformanceSummary(): RuntimePerformanceSummary {
  return {
    total: metrics.length,
    longTasks: bucket("long-task"),
    interactions: bucket("interaction"),
    navigation: bucket("navigation"),
    pdf: bucket("pdf"),
    storage: bucket("storage"),
    worker: bucket("worker"),
    render: bucket("render"),
    custom: bucket("custom")
  };
}

export function runtimePerformanceSnapshot(): RuntimeMetric[] {
  return metrics.map((entry) => ({ ...entry, detail: entry.detail ? { ...entry.detail } : undefined }));
}

export function clearRuntimePerformanceMetrics(): void {
  metrics.length = 0;
}

export function recordRuntimeMetric(
  category: RuntimeMetricCategory,
  name: string,
  durationMs: number,
  startTime = now() - durationMs,
  detail?: RuntimeMetricDetail
): RuntimeMetric {
  return push({ category, name, durationMs: Math.max(0, durationMs), startTime, detail });
}

export function beginRuntimeMeasure(
  category: RuntimeMetricCategory,
  name: string,
  detail?: RuntimeMetricDetail
): () => number {
  const startTime = now();
  return () => {
    const duration = Math.max(0, now() - startTime);
    recordRuntimeMetric(category, name, duration, startTime, detail);
    return duration;
  };
}

export async function measureRuntimeAsync<T>(
  category: RuntimeMetricCategory,
  name: string,
  operation: () => Promise<T>,
  detail?: RuntimeMetricDetail
): Promise<T> {
  const finish = beginRuntimeMeasure(category, name, detail);
  try {
    return await operation();
  } finally {
    finish();
  }
}

export function measureRuntimeSync<T>(
  category: RuntimeMetricCategory,
  name: string,
  operation: () => T,
  detail?: RuntimeMetricDetail
): T {
  const finish = beginRuntimeMeasure(category, name, detail);
  try {
    return operation();
  } finally {
    finish();
  }
}

export function noteNavigationStart(routeName: string): void {
  pendingNavigation = { route: routeName, startTime: now() };
}

export function noteNavigationPaint(routeName: string): void {
  const pending = pendingNavigation;
  if (!pending || pending.route !== routeName) return;
  const duration = Math.max(0, now() - pending.startTime);
  recordRuntimeMetric("navigation", `route:${routeName}`, duration, pending.startTime);
  pendingNavigation = null;
}

function observeLongTasks(): void {
  if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recordRuntimeMetric("long-task", entry.name || "main-thread", entry.duration, entry.startTime);
      }
    });
    observer.observe({ type: "longtask", buffered: true });
    observers.push(observer);
  } catch {
    // Long Task API is not supported in every browser engine.
  }
}

function observeInteractions(): void {
  if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("event")) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const event = entry as PerformanceEntry & { interactionId?: number; processingStart?: number; processingEnd?: number };
        if (entry.duration < 16) continue;
        recordRuntimeMetric("interaction", entry.name || "event", entry.duration, entry.startTime, {
          interactionId: event.interactionId ?? 0,
          processingDelayMs: typeof event.processingStart === "number" ? Math.max(0, event.processingStart - entry.startTime) : undefined,
          processingMs: typeof event.processingStart === "number" && typeof event.processingEnd === "number" ? Math.max(0, event.processingEnd - event.processingStart) : undefined
        });
      }
    });
    observer.observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    observers.push(observer);
  } catch {
    // Event Timing API is currently Chromium-focused; other engines still expose manual metrics.
  }
}

function observeWorkerResources(): void {
  if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("resource")) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        const url = resource.name.toLowerCase();
        if (!url.includes("worker") && !url.includes(".wasm") && !url.includes("tesseract")) continue;
        const clean = resource.name.split("?")[0]?.split("/").at(-1) || "worker-resource";
        recordRuntimeMetric("worker", `resource:${clean}`, resource.duration, resource.startTime, {
          initiatorType: resource.initiatorType || "unknown",
          transferSize: resource.transferSize,
          decodedBodySize: resource.decodedBodySize
        });
      }
    });
    observer.observe({ type: "resource", buffered: true });
    observers.push(observer);
  } catch {
    // Resource timing is best effort; manual long-task/operation metrics still remain.
  }
}

export function initializeRuntimePerformanceMonitoring(): RuntimePerformanceApi {
  if (!initialized) {
    initialized = true;
    observeLongTasks();
    observeInteractions();
    observeWorkerResources();
  }
  const api: RuntimePerformanceApi = {
    snapshot: runtimePerformanceSnapshot,
    summary: runtimePerformanceSummary,
    clear: clearRuntimePerformanceMetrics
  };
  if (typeof window !== "undefined") window.__PDF_STUDIO_PERFORMANCE__ = api;
  return api;
}

export function shutdownRuntimePerformanceMonitoring(): void {
  for (const observer of observers.splice(0)) observer.disconnect();
  initialized = false;
}
