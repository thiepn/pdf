import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  idbDelete: vi.fn(),
  idbGet: vi.fn(),
  idbPut: vi.fn()
}));

vi.mock("../../src/storage/database", () => database);

describe("security state password scrubbing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("scrubs and rewrites a current persisted state containing transient passwords", async () => {
    const { createSecurityState } = await import("../../src/security/securityModel");
    const stored = createSecurityState("project");
    stored.encryption.userPassword = "user-secret";
    stored.encryption.ownerPassword = "owner-secret";
    database.idbGet.mockResolvedValue(stored);

    const { readSecurityState } = await import("../../src/security/securityRepository");
    const result = await readSecurityState("project");

    expect(result.encryption.userPassword).toBe("");
    expect(result.encryption.ownerPassword).toBe("");
    expect(database.idbPut).toHaveBeenCalledOnce();
    const persisted = database.idbPut.mock.calls[0]?.[1];
    expect(persisted.encryption.userPassword).toBe("");
    expect(persisted.encryption.ownerPassword).toBe("");
  });

  it("does not rewrite an already-sanitized current state just for reading it", async () => {
    const { createSecurityState } = await import("../../src/security/securityModel");
    const stored = createSecurityState("project");
    database.idbGet.mockResolvedValue(stored);

    const { readSecurityState } = await import("../../src/security/securityRepository");
    await expect(readSecurityState("project")).resolves.toMatchObject({
      projectId: "project",
      encryption: { userPassword: "", ownerPassword: "" }
    });
    expect(database.idbPut).not.toHaveBeenCalled();
  });

  it("strips transient passwords from every write", async () => {
    const { createSecurityState } = await import("../../src/security/securityModel");
    const state = createSecurityState("project");
    state.encryption.userPassword = "write-user-secret";
    state.encryption.ownerPassword = "write-owner-secret";

    const { writeSecurityState } = await import("../../src/security/securityRepository");
    await writeSecurityState(state);

    const persisted = database.idbPut.mock.calls[0]?.[1];
    expect(persisted.encryption.userPassword).toBe("");
    expect(persisted.encryption.ownerPassword).toBe("");
  });
});
