import { describe, expect, it } from "vitest";
import { parsePageSelection } from "../../src/organizer/pageSelection";

describe("parsePageSelection", () => {
  it("parses ranges, keywords, and exclusions", () => {
    const result = parsePageSelection("1-5, odd, last, !3", 10);
    expect(result.errors).toEqual([]);
    expect([...result.pages].sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 7, 9, 10]);
  });

  it("treats exclusion-only expressions as all except", () => {
    expect([...parsePageSelection("!2,!last", 5).pages]).toEqual([1, 3, 4]);
  });

  it("reports unsupported and out-of-range tokens", () => {
    const result = parsePageSelection("0, 12, portrait", 10);
    expect(result.errors).toHaveLength(3);
  });
});
