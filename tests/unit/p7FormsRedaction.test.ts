import { describe, expect, it } from "vitest";
import { createManualFormField, validateFormCreates } from "../../src/security/formAuthoring";
import { validateIbanForTest, validatePaymentCardForTest } from "../../src/security/redactionDiscovery";
import secureSource from "../../src/views/SecurePage.tsx?raw";
import workerSource from "../../src/workers/security.worker.ts?raw";
import databaseSource from "../../src/storage/database.ts?raw";
import releaseSource from "../../src/core/release.ts?raw";
import type { SecurityFormField } from "../../src/types/security";

const existing: SecurityFormField = {
  id: "existing",
  pageNumber: 1,
  widgetIndex: 0,
  type: "text",
  name: "full_name",
  label: "Name",
  value: "",
  options: [],
  rect: { x0: 20, y0: 20, x1: 120, y1: 40 },
  readOnly: false,
  multiline: false,
  password: false,
  comb: false,
  signed: null
};

describe("P7 forms and redaction excellence", () => {
  it("fails closed on duplicate or invalid form draft names", () => {
    const first = { ...createManualFormField(1, "text", 0), name: "full_name" };
    expect(validateFormCreates([first], [existing]).join(" ")).toContain("already exists");
    const a = { ...createManualFormField(1, "text", 1), name: "new_field" };
    const b = { ...createManualFormField(1, "checkbox", 2), name: "new_field" };
    expect(validateFormCreates([a, b], [])).toContain("Field name “new_field” is used by more than one new field.");
  });

  it("filters structured sensitive identifiers with real validity checks", () => {
    expect(validateIbanForTest("DE89370400440532013000")).toBe(true);
    expect(validateIbanForTest("DE00370400440532013000")).toBe(false);
    expect(validatePaymentCardForTest("4111111111111111")).toBe(true);
    expect(validatePaymentCardForTest("4111111111111112")).toBe(false);
  });

  it("routes accepted candidates through canonical secure writers", () => {
    expect(secureSource).toContain("FormAuthoringPanel");
    expect(secureSource).toContain("RedactionDiscoveryPanel");
    expect(secureSource).toContain("writeEditorState(next)");
    expect(secureSource).toContain("formCreates");
    expect(workerSource).toContain('pdf.newName("Widget")');
    expect(workerSource).toContain("formFieldsCreated");
    expect(workerSource).toContain("page.applyRedactions");
  });

  it("keeps frozen persistence formats unchanged", () => {
    expect(databaseSource).toContain("DB_VERSION = 13");
    expect(releaseSource).toContain("DATABASE_SCHEMA_VERSION = 13");
    expect(releaseSource).toContain("PROJECT_PACKAGE_VERSION = 9");
  });
});
