import { describe, expect, it } from "vitest";
import { formFieldsToCsv } from "../../src/inspector/formDataExport";
import type { SecurityFormField } from "../../src/types/security";

const field = (patch: Partial<SecurityFormField> = {}): SecurityFormField => ({
  id: "one", name: "contact.email", label: "Email", value: "ada@example.test", pageNumber: 1,
  type: "text", widgetIndex: 0, options: [], rect: { x0: 10, y0: 10, x1: 130, y1: 35 },
  readOnly: false, multiline: false, password: false, comb: false, signed: null, ...patch
});

describe("F10 local form-data CSV export", () => {
  it("writes a BOM, stable headers and RFC4180 quoted multiline values", () => {
    const text = formFieldsToCsv([field({ name: 'person,"name', value: 'A, B\nC"D' })]);
    expect(text.startsWith('\uFEFF"page","name"')).toBe(true);
    expect(text).toContain('"person,""name"');
    expect(text).toContain('"A, B\nC""D"');
    expect(text.endsWith("\r\n")).toBe(true);
  });
  it("neutralizes leading formula expressions even after whitespace", () => {
    const text = formFieldsToCsv([field({ name: "=1+1", label: "  @cmd", value: "+SUM(1,1)" })]);
    expect(text).toContain('"\'=1+1"');
    expect(text).toContain('"\'  @cmd"');
    expect(text).toContain('"\' +SUM(1,1)"'.replace("' +", "'+"));
    expect(formFieldsToCsv([field({ value: "\t=HYPERLINK(1)" })])).toContain('"\'\t=HYPERLINK(1)"');
  });
  it("omits password and signature payloads and preserves distinct rows", () => {
    const text = formFieldsToCsv([
      field({ name: "secret", value: "private password", password: true }),
      field({ name: "signed", value: "private certificate material", type: "signature", signed: true })
    ]);
    expect(text).toContain("[password omitted]");
    expect(text).toContain("[signature contents omitted]");
    expect(text).not.toContain("private password");
    expect(text).not.toContain("private certificate material");
    expect(text.match(/"page"/g)?.length).toBe(1);
  });
  it("does not invent form fields", () => {
    expect(formFieldsToCsv([]).split("\r\n").filter(Boolean)).toHaveLength(1);
  });
});
