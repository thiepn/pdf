import { describe, expect, it } from "vitest";
import { classifyReceipt, receiptToCsvRow, type ActivityReceipt } from "../../src/activity/activityModel";

describe("activity receipts", () => {
  it("classifies common output types", () => {
    expect(classifyReceipt("edited.pdf", "application/pdf")).toBe("document-output");
    expect(classifyReceipt("backup.lpsproject", "application/octet-stream")).toBe("backup");
    expect(classifyReceipt("report.json", "application/json")).toBe("report");
  });

  it("escapes CSV filenames", () => {
    const receipt: ActivityReceipt = { id: "1", schemaVersion: 1, kind: "report", filename: 'report, "final".json', mimeType: "application/json", byteLength: 10, sha256: "abc", createdAt: 0, route: "#/activity", releaseVersion: "2.0.0" };
    expect(receiptToCsvRow(receipt)).toContain('"report, ""final"".json"');
  });
});
