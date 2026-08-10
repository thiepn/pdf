import { describe, expect, it } from "vitest";
import { diffWords } from "../../src/comparison/diff";
describe("word comparison", () => {
  it("marks additions and removals", () => {
    const result = diffWords("alpha beta", "alpha gamma");
    expect(result.some((item) => item.kind === "removed" && item.text === "beta")).toBe(true);
    expect(result.some((item) => item.kind === "added" && item.text === "gamma")).toBe(true);
  });
});
