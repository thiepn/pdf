import { describe, expect, it } from "vitest";
import { createSecurityState, defaultPermissions, hasSecurityChanges, permissionMask } from "../../src/security/securityModel";

describe("security model", () => {
  it("encodes MuPDF permission bits deterministically", () => {
    expect(permissionMask(defaultPermissions)).toBe((1 << 2) | (1 << 5) | (1 << 8) | (1 << 9) | (1 << 11));
  });

  it("starts without user-selected destructive changes", () => {
    const state = createSecurityState("project");
    expect(hasSecurityChanges(state, {})).toBe(false);
  });

  it("detects form, redaction, sanitization, and encryption changes", () => {
    const form = createSecurityState("project");
    form.formValues.name = "Changed";
    expect(hasSecurityChanges(form, { name: "Original" })).toBe(true);
    const redact = createSecurityState("project");
    redact.redaction.enabled = true;
    expect(hasSecurityChanges(redact, {})).toBe(true);
    const protect = createSecurityState("project");
    protect.encryption.mode = "aes-256";
    expect(hasSecurityChanges(protect, {})).toBe(true);
  });
});
