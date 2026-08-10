import { describe, expect, it } from "vitest";
import { getPreservationContract } from "../../src/workspace/preservationContracts";
import { readAppRoute, routeHref } from "../../src/core/appRouter";

 describe("Phase 12 unified workspace", () => {
  it("round-trips workspace routes", () => {
    const href = routeHref({ name: "workspace", projectId: "project 1", mode: "professional" });
    expect(href).toBe("#/workspace/project%201/professional");
    expect(readAppRoute(href)).toEqual({ name: "workspace", projectId: "project 1", mode: "professional" });
  });

  it("maps legacy document links into the unified workspace", () => {
    expect(routeHref({ name: "editor", projectId: "abc" })).toBe("#/workspace/abc/editor");
    expect(routeHref({ name: "organizer", projectId: "abc" })).toBe("#/workspace/abc/organizer");
  });

  it("classifies destructive and non-destructive modes", () => {
    expect(getPreservationContract("viewer").destructive).toBe(false);
    expect(getPreservationContract("inspector").destructive).toBe(false);
    expect(getPreservationContract("secure").destructive).toBe(true);
    expect(getPreservationContract("ocr").risks.length).toBeGreaterThan(0);
  });
});
