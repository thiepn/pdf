import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OutputTrustPanel } from "../../src/components/OutputTrustPanel";
import type { OutputTrustReport } from "../../src/trust/outputVerification";

function report(level: OutputTrustReport["level"], notes: string[]): OutputTrustReport {
  return {
    schemaVersion: 1, operationId: "editor", level, generatedAt: 0,
    headline: "Output checked", facts: [], checks: [], notes, lossy: false
  };
}

describe("PDF output verification disclosures", () => {
  it("exposes material non-lossy compatibility notes without requiring a hidden details click", () => {
    const html = renderToStaticMarkup(createElement(OutputTrustPanel, {
      compact: true,
      report: report("verified-with-notes", [
        "Source contains incremental revisions; edited output was normalized."
      ])
    }));
    expect(html).toMatch(/<details[^>]*open/);
    expect(html).toContain("incremental revisions");
    expect(html).toContain("Verified with notes");
  });

  it("does not add review disclosure when a verified output has no notes", () => {
    const html = renderToStaticMarkup(createElement(OutputTrustPanel, {
      report: report("verified", [])
    }));
    expect(html).not.toContain("output-trust__notes");
    expect(html).toContain("Verified");
  });
});
