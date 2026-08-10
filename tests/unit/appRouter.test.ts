import { describe, expect, it } from "vitest";
import { readAppRoute, routeHref } from "../../src/core/appRouter";

describe("application router", () => {
  it("parses viewer project identifiers", () => {
    expect(readAppRoute("#/viewer/project%201")).toEqual({ name: "viewer", projectId: "project 1" });
  });

  it("falls back to home", () => {
    expect(readAppRoute("#/unknown")).toEqual({ name: "home" });
  });

  it("serializes diagnostic routes", () => {
    expect(routeHref({ name: "diagnostics", lab: "viewer" })).toBe("#/diagnostics/viewer");
  });
});

it("parses production editor and tool routes", () => {
  expect(readAppRoute("#/organizer/project%201")).toEqual({ name: "organizer", projectId: "project 1" });
  expect(readAppRoute("#/editor/project%201")).toEqual({ name: "editor", projectId: "project 1" });
  expect(readAppRoute("#/secure/project%201")).toEqual({ name: "secure", projectId: "project 1" });
  expect(readAppRoute("#/ocr/project%201")).toEqual({ name: "ocr", projectId: "project 1" });
  expect(readAppRoute("#/compress/project%201")).toEqual({ name: "compress", projectId: "project 1" });
  expect(readAppRoute("#/inspector/project%201")).toEqual({ name: "inspector", projectId: "project 1" });
  expect(readAppRoute("#/repair/project%201")).toEqual({ name: "repair", projectId: "project 1" });
  expect(routeHref({ name: "editor", projectId: "project 1" })).toBe("#/workspace/project%201/editor");
  expect(routeHref({ name: "secure", projectId: "project 1" })).toBe("#/workspace/project%201/secure");
  expect(readAppRoute("#/workspace/project%201/professional")).toEqual({ name: "workspace", projectId: "project 1", mode: "professional" });
  expect(readAppRoute("#/workspace/project%201/toolbox")).toEqual({ name: "workspace", projectId: "project 1", mode: "toolbox" });
  expect(routeHref({ name: "workspace", projectId: "project 1", mode: "ocr" })).toBe("#/workspace/project%201/ocr");
  expect(readAppRoute("#/validation")).toEqual({ name: "validation" });
  expect(routeHref({ name: "validation" })).toBe("#/validation");
  expect(readAppRoute("#/tools")).toEqual({ name: "tools" });
  expect(readAppRoute("#/merge")).toEqual({ name: "merge" });
  expect(readAppRoute("#/scan")).toEqual({ name: "scan" });
  expect(readAppRoute("#/batch")).toEqual({ name: "batch" });
  expect(readAppRoute("#/compare")).toEqual({ name: "compare" });
  expect(readAppRoute("#/create")).toEqual({ name: "create" });
  expect(routeHref({ name: "create" })).toBe("#/create");
  expect(readAppRoute("#/release")).toEqual({ name: "release" });
  expect(routeHref({ name: "release" })).toBe("#/release");
  expect(readAppRoute("#/activity")).toEqual({ name: "activity" });
  expect(readAppRoute("#/maintenance")).toEqual({ name: "maintenance" });
  expect(readAppRoute("#/help")).toEqual({ name: "help" });
  expect(routeHref({ name: "maintenance" })).toBe("#/maintenance");
});
