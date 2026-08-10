import { describe, expect, it } from "vitest";
import { CoordinateService, createPdfViewportMatrix, transformRect } from "../../src/core/coordinates";

describe("CoordinateService", () => {
  for (const rotation of [0, 90, 180, 270] as const) {
    it(`round-trips points at ${rotation} degrees`, () => {
      const service = new CoordinateService(createPdfViewportMatrix(612, 792, 1.75, rotation));
      const source = { x: 123.456, y: 654.321 };
      const result = service.viewportToPdf(service.pdfToViewport(source));
      expect(result.x).toBeCloseTo(source.x, 8);
      expect(result.y).toBeCloseTo(source.y, 8);
    });
  }

  it("normalizes transformed rectangle bounds", () => {
    const matrix = createPdfViewportMatrix(612, 792, 1, 0);
    expect(transformRect(matrix, { x0: 10, y0: 20, x1: 50, y1: 80 })).toEqual({
      x0: 10,
      y0: 712,
      x1: 50,
      y1: 772
    });
  });
});
