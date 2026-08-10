import { idbDelete, idbGet, idbPut } from "../storage/database";
import { SECURITY_SCHEMA_VERSION, type SecurityProjectState } from "../types/security";
import { createSecurityState } from "./securityModel";
import { assertReadableStateSchema } from "../projects/stateSchemaGuard";

export async function readSecurityState(projectId: string): Promise<SecurityProjectState> {
  const stored = await idbGet<SecurityProjectState>("securityStates", projectId);
  if (!stored) return createSecurityState(projectId);
  const schemaVersion = assertReadableStateSchema(stored.schemaVersion, SECURITY_SCHEMA_VERSION, "Security state");
  if (schemaVersion < SECURITY_SCHEMA_VERSION) return migrateSecurityState(stored);
  return stored;
}

export async function writeSecurityState(state: SecurityProjectState): Promise<void> {
  await idbPut("securityStates", {
    ...state,
    encryption: { ...state.encryption, userPassword: "", ownerPassword: "" },
    schemaVersion: SECURITY_SCHEMA_VERSION,
    updatedAt: Date.now()
  });
}

export async function deleteSecurityState(projectId: string): Promise<void> {
  await idbDelete("securityStates", projectId);
}

function migrateSecurityState(state: SecurityProjectState): SecurityProjectState {
  const base = createSecurityState(state.projectId);
  return {
    ...base,
    ...state,
    redaction: { ...base.redaction, ...(state.redaction ?? {}) },
    sanitization: { ...base.sanitization, ...(state.sanitization ?? {}) },
    encryption: {
      ...base.encryption,
      ...(state.encryption ?? {}),
      permissions: { ...base.encryption.permissions, ...(state.encryption?.permissions ?? {}) }
    },
    schemaVersion: SECURITY_SCHEMA_VERSION,
    updatedAt: Date.now()
  };
}
