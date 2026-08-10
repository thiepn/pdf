import { inspectDesktopBridge, type DesktopBridgeInfo } from "../desktop/desktopBridge";
import { readRuntimeSignals } from "../viewer/performancePolicy";

export interface RuntimeHealthSnapshot {
  capturedAt: string;
  logicalProcessors: number;
  deviceMemoryGb?: number;
  viewport: { width: number; height: number; devicePixelRatio: number };
  storage?: { usage: number; quota: number; percent: number; persisted?: boolean };
  desktop: DesktopBridgeInfo | null;
}

export async function collectRuntimeHealth(): Promise<RuntimeHealthSnapshot> {
  const signals = readRuntimeSignals();
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const persisted = await navigator.storage?.persisted?.().catch(() => undefined);
  const quota = estimate?.quota ?? 0;
  return {
    capturedAt: new Date().toISOString(),
    logicalProcessors: signals.logicalProcessors,
    deviceMemoryGb: signals.deviceMemoryGb,
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 },
    storage: estimate ? { usage: estimate.usage ?? 0, quota, percent: quota ? ((estimate.usage ?? 0) / quota) * 100 : 0, persisted } : undefined,
    desktop: await inspectDesktopBridge().catch(() => null)
  };
}
