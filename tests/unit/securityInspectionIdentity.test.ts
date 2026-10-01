import { describe, expect, it } from "vitest";
import { securityInspectionByteIdentity, securityInspectionCredentialIdentity } from "../../src/security/securityInspectionIdentity";

describe("security inspection byte identity", () => {
  it("returns the same content identity for independent arrays with identical bytes", async () => {
    const first = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const second = Uint8Array.from(first);

    await expect(securityInspectionByteIdentity(first)).resolves.toBe(
      await securityInspectionByteIdentity(second)
    );
  });

  it("returns a different identity when document bytes differ", async () => {
    const first = new Uint8Array([1, 2, 3, 4]);
    const second = new Uint8Array([1, 2, 3, 5]);

    expect(await securityInspectionByteIdentity(first)).not.toBe(
      await securityInspectionByteIdentity(second)
    );
  });

  it("keeps the identity stable for repeated reads of the same immutable byte array", async () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);
    const first = await securityInspectionByteIdentity(bytes);
    const second = await securityInspectionByteIdentity(bytes);

    expect(second).toBe(first);
  });
});


describe("security inspection credential identity", () => {
  it("keeps unprotected inspection cacheable without a credential secret", async () => {
    await expect(securityInspectionCredentialIdentity()).resolves.toEqual({
      key: "unprotected",
      cacheable: true
    });
  });

  it("uses a stable session-private key for the same protected password", async () => {
    const password = "correct horse battery staple";
    const first = await securityInspectionCredentialIdentity(password);
    const second = await securityInspectionCredentialIdentity(password);

    expect(first.cacheable).toBe(true);
    expect(second).toEqual(first);
    expect(first.key).toMatch(/^protected:[0-9a-f]{64}$/);
    expect(first.key).not.toContain(password);
  });

  it("separates different protected passwords without retaining either plaintext value", async () => {
    const firstPassword = "alpha-secret";
    const secondPassword = "beta-secret";
    const first = await securityInspectionCredentialIdentity(firstPassword);
    const second = await securityInspectionCredentialIdentity(secondPassword);

    expect(first.key).not.toBe(second.key);
    expect(first.key).not.toContain(firstPassword);
    expect(second.key).not.toContain(secondPassword);
  });
});
