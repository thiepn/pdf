import { SECURITY_SCHEMA_VERSION, type EncryptionPermissions, type SecurityProjectState } from "../types/security";

export const defaultPermissions: EncryptionPermissions = {
  print: true,
  edit: false,
  copy: false,
  annotate: true,
  form: true,
  accessibility: true,
  assemble: false,
  printHighQuality: true
};

export function createSecurityState(projectId: string): SecurityProjectState {
  return {
    schemaVersion: SECURITY_SCHEMA_VERSION,
    projectId,
    formValues: {},
    redaction: {
      enabled: false,
      blackBoxes: true,
      imageMode: "pixels",
      lineArtMode: "covered",
      removeText: true
    },
    sanitization: {
      removeMetadata: false,
      removeJavaScript: true,
      removeOpenActions: true,
      removeAttachments: false,
      removeLinks: false,
      removeComments: false,
      clearFormValues: false,
      flattenForms: false,
      flattenAnnotations: false,
      collapseRevisionHistory: true
    },
    encryption: {
      mode: "keep",
      userPassword: "",
      ownerPassword: "",
      permissions: { ...defaultPermissions }
    },
    currentPage: 1,
    zoom: 1,
    updatedAt: Date.now()
  };
}

export function permissionMask(permissions: EncryptionPermissions): number {
  let mask = 0;
  if (permissions.print) mask |= 1 << 2;
  if (permissions.edit) mask |= 1 << 3;
  if (permissions.copy) mask |= 1 << 4;
  if (permissions.annotate) mask |= 1 << 5;
  if (permissions.form) mask |= 1 << 8;
  if (permissions.accessibility) mask |= 1 << 9;
  if (permissions.assemble) mask |= 1 << 10;
  if (permissions.printHighQuality) mask |= 1 << 11;
  return mask;
}

export function hasSecurityChanges(state: SecurityProjectState, initialFormValues: Record<string, string>): boolean {
  if (Object.entries(state.formValues).some(([id, value]) => value !== (initialFormValues[id] ?? ""))) return true;
  if (state.redaction.enabled) return true;
  const defaults = createSecurityState(state.projectId).sanitization;
  if (Object.keys(defaults).some((key) => state.sanitization[key as keyof typeof defaults] !== defaults[key as keyof typeof defaults])) return true;
  return state.encryption.mode !== "keep";
}
