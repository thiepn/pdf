import { idbDelete, idbGet, idbPut } from "../storage/database";
import { SECURITY_SCHEMA_VERSION, type SecurityProjectState } from "../types/security";
import { createSecurityState } from "./securityModel";
import { assertReadableStateSchema } from "../projects/stateSchemaGuard";

function stripTransientPasswords(state: SecurityProjectState): SecurityProjectState {
  return {
    ...state,
    encryption: {
      ...state.encryption,
      userPassword: "",
      ownerPassword: ""
    }
  };
}

export async function readSecurityState(projectId: string): Promise<SecurityProjectState> {
  const stored = await idbGet<SecurityProjectState>("securityStates", projectId);
  if (!stored) return createSecurityState(projectId);
  const schemaVersion = assertReadableStateSchema(stored.schemaVersion, SECURITY_SCHEMA_VERSION, "Security state");
  const state = schemaVersion < SECURITY_SCHEMA_VERSION ? migrateSecurityState(stored) : stripTransientPasswords(stored);
  const hadTransientPasswords = Boolean(stored.encryption?.userPassword || stored.encryption?.ownerPassword);
  if (schemaVersion < SECURITY_SCHEMA_VERSION || hadTransientPasswords) await writeSecurityState(state);
  return state;
}

export async function writeSecurityState(state: SecurityProjectState): Promise<void> {
  const sanitized = stripTransientPasswords(state);
  await idbPut("securityStates", {
    ...sanitized,
    schemaVersion: SECURITY_SCHEMA_VERSION,
    updatedAt: Date.now()
  });
}

export async function deleteSecurityState(projectId: string): Promise<void> {
  await idbDelete("securityStates", projectId);
}

function migrateSecurityState(state: SecurityProjectState): SecurityProjectState {
  const base = createSecurityState(state.projectId);
  return stripTransientPasswords({
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
  });
}
