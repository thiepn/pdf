import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../src/types/settings";
import { hasFutureSettingsSchema, readSettings, writeSettings } from "../../src/settings/settingsStore";
import { migrateBatchRecipe } from "../../src/processing/batchModel";
import { activateWaitingServiceWorker } from "../../src/release/serviceWorkerManager";

describe("v6.0.6 Bug Fix Audit 4", () => {
  beforeEach(() => localStorage.clear());

  it("does not overwrite settings created by a newer schema", () => {
    const future = JSON.stringify({ schemaVersion: 6, theme: "dark", futurePreference: "keep-me" });
    localStorage.setItem("local-pdf-studio-settings-v5", future);
    expect(hasFutureSettingsSchema()).toBe(true);
    expect(readSettings()).toEqual(defaultSettings);
    expect(() => writeSettings({ ...defaultSettings, theme: "light" })).toThrow(/newer PDF Studio/);
    expect(localStorage.getItem("local-pdf-studio-settings-v5")).toBe(future);
  });

  it("rejects a future Batch recipe instead of migrating it as legacy", () => {
    expect(() => migrateBatchRecipe({ schemaVersion: 4, id: "future", name: "Future", steps: [], outputSuffix: "x", updatedAt: 1 })).toThrow(/newer PDF Studio/);
  });

  it("reports service-worker activation after capturing the waiting worker", () => {
    let waiting: { postMessage: ReturnType<typeof vi.fn> } | null;
    const worker = { postMessage: vi.fn(() => { waiting = null; }) };
    waiting = worker;
    const registration = { get waiting() { return waiting; } } as unknown as ServiceWorkerRegistration;
    expect(activateWaitingServiceWorker(registration)).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });
});
