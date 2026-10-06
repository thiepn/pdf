import { describe, expect, it, vi } from "vitest";
import {
  MAX_TARGET_SIZE_ATTEMPTS,
  MIN_TARGET_SIZE_BYTES,
  TARGET_SIZE_RASTER_PROFILES,
  compressPdfToTarget
} from "../../src/processing/targetSizeCompression";
import type { PDFDocumentProxy } from "pdfjs-dist";

const document = {} as PDFDocumentProxy;
const bytes = (length: number) => new Uint8Array(length);
const report = (inputBytes: number, outputBytes: number) => ({
  operation: "optimize",
  inputBytes,
  outputBytes,
  repaired: false,
  versionsBefore: 1,
  durationMs: 1,
  warnings: [] as string[]
});

describe("P15 target-size compression", () => {
  it("meets a target with the structure-preserving pass before any raster fallback", async () => {
    const rasterize = vi.fn();
    const result = await compressPdfToTarget(bytes(240_000), document, {
      targetBytes: 180_000,
      preservation: "allow-raster"
    }, {
      optimize: vi.fn(async () => ({ bytes: bytes(150_000), report: report(240_000, 150_000) })),
      rasterize
    });

    expect(result.outcome).toBe("target-met");
    expect(result.method).toBe("structure-preserving");
    expect(result.outputBytes).toBe(150_000);
    expect(result.preservation?.mode).toBe("structure-preserved");
    expect(result.attempts).toHaveLength(1);
    expect(rasterize).not.toHaveBeenCalled();
  });

  it("returns honest best effort when strict preservation cannot reach the requested target", async () => {
    const rasterize = vi.fn();
    const result = await compressPdfToTarget(bytes(240_000), document, {
      targetBytes: 100_000,
      preservation: "preserve-structure"
    }, {
      optimize: vi.fn(async () => ({ bytes: bytes(170_000), report: report(240_000, 170_000) })),
      rasterize
    });

    expect(result.outcome).toBe("best-effort");
    expect(result.method).toBe("structure-preserving");
    expect(result.outputBytes).toBe(170_000);
    expect(result.message).toMatch(/target not reached/i);
    expect(result.warnings.join(" ")).toMatch(/structure-preserving boundary/i);
    expect(rasterize).not.toHaveBeenCalled();
  });

  it("uses the bounded raster ladder only after structural optimization and stops at the first target hit", async () => {
    const rasterSizes = [150_000, 92_000, 70_000];
    const rasterize = vi.fn(async () => bytes(rasterSizes.shift() ?? 60_000));
    const result = await compressPdfToTarget(bytes(260_000), document, {
      targetBytes: 100_000,
      preservation: "allow-raster"
    }, {
      optimize: vi.fn(async () => ({ bytes: bytes(210_000), report: report(260_000, 210_000) })),
      rasterize
    });

    expect(result.outcome).toBe("target-met");
    expect(result.method).toBe("raster");
    expect(result.outputBytes).toBe(92_000);
    expect(result.attempts.map((attempt) => attempt.method)).toEqual(["structure-preserving", "raster", "raster"]);
    expect(result.attempts[2].dpi).toBe(TARGET_SIZE_RASTER_PROFILES[1].dpi);
    expect(rasterize).toHaveBeenCalledTimes(2);
    expect(result.preservation).toEqual(expect.objectContaining({
      mode: "rasterized",
      searchableText: false,
      vectorContent: false,
      interactiveContent: false
    }));
  });

  it("offers the smallest real improvement as best effort when the bounded ladder cannot reach the target", async () => {
    const sizes = [200_000, 170_000, 130_000, 110_000, 90_000];
    const result = await compressPdfToTarget(bytes(300_000), document, {
      targetBytes: 70_000,
      preservation: "allow-raster"
    }, {
      optimize: vi.fn(async () => ({ bytes: bytes(250_000), report: report(300_000, 250_000) })),
      rasterize: vi.fn(async () => bytes(sizes.shift()!))
    });

    expect(result.outcome).toBe("best-effort");
    expect(result.outputBytes).toBe(90_000);
    expect(result.attempts).toHaveLength(MAX_TARGET_SIZE_ATTEMPTS);
    expect(result.warnings.join(" ")).toMatch(/bounded compression ladder/i);
  });

  it("never labels an output larger than the source as successful compression", async () => {
    const result = await compressPdfToTarget(bytes(200_000), document, {
      targetBytes: 100_000,
      preservation: "preserve-structure"
    }, {
      optimize: vi.fn(async () => ({ bytes: bytes(220_000), report: report(200_000, 220_000) })),
      rasterize: vi.fn()
    });

    expect(result.outcome).toBe("refused");
    expect(result.bytes).toBeUndefined();
    expect(result.outputBytes).toBeUndefined();
    expect(result.attempts[0]).toEqual(expect.objectContaining({
      targetMet: false,
      smallerThanSource: false
    }));
  });

  it("rejects already-met and unqualified tiny targets without running an attempt", async () => {
    const optimize = vi.fn();
    const alreadyMet = await compressPdfToTarget(bytes(200_000), document, {
      targetBytes: 200_000,
      preservation: "allow-raster"
    }, { optimize });
    const tooSmall = await compressPdfToTarget(bytes(200_000), document, {
      targetBytes: MIN_TARGET_SIZE_BYTES - 1,
      preservation: "allow-raster"
    }, { optimize });

    expect(alreadyMet.outcome).toBe("refused");
    expect(alreadyMet.message).toMatch(/already meets/i);
    expect(tooSmall.outcome).toBe("refused");
    expect(tooSmall.message).toMatch(/64 KiB/i);
    expect(optimize).not.toHaveBeenCalled();
  });
});
