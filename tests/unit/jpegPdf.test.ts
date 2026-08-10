import { describe, expect, it } from "vitest";
import { buildJpegPdf } from "../../src/pdf/jpegPdf";
describe("JPEG PDF builder", () => {
  it("writes a parseable-looking PDF envelope and page tree", () => {
    const bytes = buildJpegPdf([{ jpeg: new Uint8Array([0xff,0xd8,0xff,0xd9]), pixelWidth: 1, pixelHeight: 1 }]);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.7")).toBe(true);
    expect(text).toContain("/Count 1");
    expect(text).toContain("startxref");
  });
});
