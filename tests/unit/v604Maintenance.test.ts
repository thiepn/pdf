import { describe, expect, it } from "vitest";
import { assertReadableStateSchema } from "../../src/projects/stateSchemaGuard";

describe("v6.0.4 future-state downgrade protection", () => {
  it("accepts legacy and current state schemas", () => {
    expect(assertReadableStateSchema(1, 3, "Editor state")).toBe(1);
    expect(assertReadableStateSchema(3, 3, "Editor state")).toBe(3);
  });
  it("rejects future and invalid state schemas", () => {
    expect(() => assertReadableStateSchema(4, 3, "Editor state")).toThrow(/newer PDF Studio/);
    expect(() => assertReadableStateSchema(0, 3, "Editor state")).toThrow(/invalid schema version/);
  });
});
