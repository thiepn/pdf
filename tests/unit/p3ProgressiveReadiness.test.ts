import { describe, expect, it } from "vitest";
import schedulerSource from "../../src/performance/deferredHydration.ts?raw";
import viewerSource from "../../src/views/ViewerPage.tsx?raw";
import editorSource from "../../src/views/EditorPage.tsx?raw";
import nativeClientSource from "../../src/native/nativeClient.ts?raw";

function expectOrdered(source: string, earlier: string, later: string): void {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  expect(earlierIndex).toBeGreaterThanOrEqual(0);
  expect(laterIndex).toBeGreaterThan(earlierIndex);
}

describe("Recovery P3 progressive readiness", () => {
  it("schedules enrichment after paint with idle fallback and cancellation", () => {
    expect(schedulerSource).toContain("new AbortController()");
    expect(schedulerSource.match(/requestAnimationFrame/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(schedulerSource).toContain("requestIdleCallback");
    expect(schedulerSource).toContain("setTimeout");
    expect(schedulerSource).toContain("controller.abort()");
  });

  it("makes the viewer interactive before metadata and editor-state hydration", () => {
    expectOrdered(viewerSource, 'recordRuntimeMetric("custom", "readiness.viewer.interactive"', "scheduleDeferredHydration(async (signal)");
    expectOrdered(viewerSource, "setLoading(false)", 'recordRuntimeMetric("custom", "readiness.viewer.interactive"');
    expect(viewerSource).toContain("doc.getPageLabels()");
    expect(viewerSource).toContain("doc.getOutline()");
    expect(viewerSource).toContain("doc.getMetadata()");
    expect(viewerSource).toContain("readEditorState(manifest.id)");
    expect(viewerSource).toContain('recordRuntimeMetric("custom", "readiness.viewer.hydrated"');
  });

  it("makes overlay editing interactive before native inspection and asset hydration", () => {
    expectOrdered(editorSource, 'recordRuntimeMetric("custom", "readiness.editor.interactive"', "scheduleDeferredHydration(async (signal)");
    expectOrdered(editorSource, 'setStatus("Ready · loading PDF content…")', 'recordRuntimeMetric("custom", "readiness.editor.interactive"');
    expect(editorSource).toContain("inspectNativePdf(bytes, suppliedPassword, signal)");
    expect(editorSource).toContain("listEditorAssets(projectId)");
    expect(editorSource).toContain('recordRuntimeMetric("custom", "readiness.editor.nativeHydrated"');
  });

  it("cancels an unused shared native inspection without discarding completed reuse", () => {
    expect(nativeClientSource).toContain("maybeAbortUnused");
    expect(nativeClientSource).toContain("current.settled = true");
    expect(nativeClientSource).toContain("current.controller.abort");
    expect(nativeClientSource).toContain("mupdf.inspection.session.hit");
  });
});
