import { idbDelete, idbGet, idbPut } from "../storage/database";
import type { ComplianceOptions, ComplianceState } from "../types/compliance";
import { assertReadableStateSchema } from "../projects/stateSchemaGuard";

const COMPLIANCE_SCHEMA_VERSION = 2;

export const defaultComplianceOptions: ComplianceOptions = {
  fields: [],
  prepareArchival: false,
  archivalLevel: "none",
  removeActiveContent: true,
  setLanguage: "en",
  setTitle: "",
  createBaselineTags: false,
  flattenForms: false,
  addOutputIntent: true,
  normalizeXmp: true,
  repairMissingFormTooltips: false,
  accessibilityRepairs: [],
  topLevelReadingOrder: []
};

function migrateOptions(value?: Partial<ComplianceOptions>): ComplianceOptions {
  const rawLevel = (value as any)?.archivalLevel;
  const archivalLevel = rawLevel === "PDF/A-oriented" ? "PDF/A-2b" : rawLevel ?? "none";
  return { ...defaultComplianceOptions, ...value, archivalLevel } as ComplianceOptions;
}

export async function readComplianceState(projectId: string): Promise<ComplianceState> {
  const saved = await idbGet<any>("complianceStates", projectId);
  if (!saved) return { projectId, schemaVersion: COMPLIANCE_SCHEMA_VERSION, draftFields: [], options: { ...defaultComplianceOptions }, updatedAt: Date.now() };
  assertReadableStateSchema(saved.schemaVersion, COMPLIANCE_SCHEMA_VERSION, "Compliance state");
  return { projectId, schemaVersion: COMPLIANCE_SCHEMA_VERSION, draftFields: Array.isArray(saved.draftFields) ? saved.draftFields : [], options: migrateOptions(saved.options), updatedAt: Number(saved.updatedAt) || Date.now() };
}
export async function writeComplianceState(state: ComplianceState): Promise<void> { await idbPut("complianceStates", { ...state, schemaVersion: COMPLIANCE_SCHEMA_VERSION, updatedAt: Date.now() }); }
export async function deleteComplianceState(projectId: string): Promise<void> { await idbDelete("complianceStates", projectId); }
