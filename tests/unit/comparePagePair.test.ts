import { describe, expect, it } from "vitest";
import { resolveComparePagePresence } from "../../src/comparison/pagePair";

describe("comparison page pairing", () => {
  it("does not clamp a missing page to the shorter document's last page", () => {
    expect(resolveComparePagePresence(5, 7, 7)).toEqual({ pageNumber: 7, leftPresent: false, rightPresent: true });
  });

  it("marks pages present on both sides when both documents contain them", () => {
    expect(resolveComparePagePresence(5, 7, 5)).toEqual({ pageNumber: 5, leftPresent: true, rightPresent: true });
  });
});
