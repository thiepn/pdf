import { describe, expect, it } from "vitest";
import { rememberNativeExportReplay, takeNativeExportReplay } from "../../src/native/nativeExportReplay";
import nativeBaseSource from "../../src/native/nativeClientBase.ts?raw";
import replaySource from "../../src/native/nativeExportReplay.ts?raw";
import nativeClientSource from "../../src/native/nativeClient.ts?raw";

describe("native export replay registry", () => {
  it("returns replay metadata only for the exact output byte identity and only once", () => {
    const source = new Uint8Array([1, 2, 3]);
    const output = new Uint8Array([4, 5, 6]);
    rememberNativeExportReplay(output, { sourceBytes: source, edits: [], password: "secret" });

    expect(takeNativeExportReplay(Uint8Array.from(output))).toBeUndefined();
    expect(takeNativeExportReplay(output)).toEqual({
      sourceBytes: source,
      edits: [],
      password: "secret"
    });
    expect(takeNativeExportReplay(output)).toBeUndefined();
  });

  it("keeps pending replay metadata isolated across multiple edited documents", () => {
    const outputA = new Uint8Array([10]);
    const outputB = new Uint8Array([20]);
    const sourceA = new Uint8Array([11]);
    const sourceB = new Uint8Array([21]);

    rememberNativeExportReplay(outputA, { sourceBytes: sourceA, edits: [] });
    rememberNativeExportReplay(outputB, { sourceBytes: sourceB, edits: [] });

    expect(takeNativeExportReplay(outputA)?.sourceBytes).toBe(sourceA);
    expect(takeNativeExportReplay(outputB)?.sourceBytes).toBe(sourceB);
  });

  it("uses weak output keys instead of a module-global strong replay slot", () => {
    expect(replaySource).toContain("new WeakMap<Uint8Array, NativeExportReplay>()");
    expect(nativeBaseSource).toContain("rememberNativeExportReplay(working");
    expect(nativeBaseSource).not.toContain("pendingExportReplay");
  });

  it("uses a session-private credential identity instead of retaining plaintext PDF passwords", () => {
    expect(nativeClientSource).toContain("securityInspectionCredentialIdentity(password)");
    expect(nativeClientSource).toContain("credential.cacheable ? sessions.get(key) : undefined");
    expect(nativeClientSource).toContain("if (credential.cacheable) sessions.set(key, current)");
    expect(nativeClientSource).not.toContain("protected:${password}");
    expect(nativeClientSource).not.toContain("inspectionKey(password");
  });
});
