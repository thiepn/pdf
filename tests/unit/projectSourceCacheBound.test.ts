import { describe, expect, it } from "vitest";
import projectFilesSource from "../../src/storage/projectFiles.ts?raw";

describe("OPFS source byte cache bound", () => {
  it("keeps the low-level source cache bounded to the repository session window", () => {
    expect(projectFilesSource).toContain("MAX_SOURCE_BYTE_CACHE = 6");
    expect(projectFilesSource).toContain("sourceByteCache.size > MAX_SOURCE_BYTE_CACHE");
    expect(projectFilesSource).toContain("sourceByteCache.keys().next().value");
    expect(projectFilesSource).toContain("sourceByteCache.delete(oldest)");
  });

  it("refreshes a cache hit to most-recently-used order", () => {
    expect(projectFilesSource).toContain("sourceByteCache.delete(projectId)");
    expect(projectFilesSource).toContain("sourceByteCache.set(projectId, bytes)");
    expect(projectFilesSource).toContain("rememberProjectSource(projectId, cached)");
  });

  it("uses the same bounded insertion path for writes and OPFS reads", () => {
    const uses = projectFilesSource.match(/rememberProjectSource\(projectId, bytes\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
});
