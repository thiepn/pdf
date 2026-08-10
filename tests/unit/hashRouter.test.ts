import { describe, expect, it } from "vitest";
import { readRoute } from "../../src/core/hashRouter";

describe("hash router", () => {
  it("uses overview for an empty hash", () => {
    expect(readRoute("")).toBe("overview");
  });

  it("reads known routes", () => {
    expect(readRoute("#/viewer")).toBe("viewer");
    expect(readRoute("#storage")).toBe("storage");
  });

  it("falls back for unknown routes", () => {
    expect(readRoute("#/unknown")).toBe("overview");
  });
});
