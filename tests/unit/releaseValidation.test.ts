import { describe, expect, it } from "vitest";
import { listExternalResourceUrls, summarizeReleaseValidation } from "../../src/release/releaseValidationModel";
import type { DiagnosticCheck } from "../../src/lab/types";

function check(status: DiagnosticCheck["status"]): DiagnosticCheck {
  return { id: status, label: status, status, detail: status };
}

describe("release validation summary", () => {
  it("fails when any required check fails", () => {
    expect(summarizeReleaseValidation([check("passed"), check("failed"), check("warning")])).toBe("failed");
  });

  it("returns warning when there are no failures", () => {
    expect(summarizeReleaseValidation([check("passed"), check("warning")])).toBe("warning");
  });

  it("passes when every check passes", () => {
    expect(summarizeReleaseValidation([check("passed")])).toBe("passed");
  });

  it("deduplicates cross-origin resource URLs", () => {
    const resources = [
      { name: "https://example.com/app.js" },
      { name: "https://cdn.example.net/model.bin" },
      { name: "https://cdn.example.net/model.bin" }
    ] as PerformanceResourceTiming[];
    expect(listExternalResourceUrls(resources, "https://example.com")).toEqual(["https://cdn.example.net/model.bin"]);
  });
});
