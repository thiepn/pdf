import { afterEach, describe, expect, it, vi } from "vitest";
import { discardTaskFiles, handOffTaskFiles, takeTaskTransfer } from "../../src/product/fileHandoff";
import { securityInspectionCredentialIdentity } from "../../src/security/securityInspectionIdentity";

const file = (name: string) => new File(["%PDF-test"], name, { type: "application/pdf" });
const ttlMs = 10 * 60 * 1000;

afterEach(() => {
  discardTaskFiles();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("v7.1.5 runtime handoff lifecycle", () => {
  it("expires unclaimed file and password references when the timer fires", () => {
    vi.useFakeTimers();
    handOffTaskFiles("extract-pages", [file("secret.pdf")], { passwords: ["temporary-secret"] });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(ttlMs);
    expect(vi.getTimerCount()).toBe(0);
    expect(takeTaskTransfer("extract-pages")).toBeNull();
  });

  it("replacing a handoff cancels the previous expiry without dropping newer credentials", () => {
    vi.useFakeTimers();
    handOffTaskFiles("extract-pages", [file("first.pdf")], { passwords: ["old-secret"] });
    vi.advanceTimersByTime(6 * 60 * 1000);
    handOffTaskFiles("extract-pages", [file("second.pdf")], { passwords: ["new-secret"] });
    expect(vi.getTimerCount()).toBe(1);
    // This crosses the first handoff's deadline, but not the second's.
    vi.advanceTimersByTime(5 * 60 * 1000);
    const transfer = takeTaskTransfer("extract-pages");
    expect(transfer?.files.map(item => item.name)).toEqual(["second.pdf"]);
    expect(transfer?.passwords).toEqual(["new-secret"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a wrong-task lookup neither exposes nor consumes the handoff", () => {
    vi.useFakeTimers();
    handOffTaskFiles("extract-pages", [file("private.pdf")], { passwords: ["short-lived"] });
    expect(takeTaskTransfer("compress-pdf")).toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    expect(takeTaskTransfer("extract-pages")?.passwords).toEqual(["short-lived"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("v7.1.5 protected document cache privacy", () => {
  it("disables protected credential reuse instead of caching a plaintext password when Web Crypto is unavailable", async () => {
    vi.stubGlobal("crypto", { subtle: undefined });
    await expect(securityInspectionCredentialIdentity("sensitive-pdf-password")).resolves.toEqual({
      key: "protected-uncached",
      cacheable: false
    });
    await expect(securityInspectionCredentialIdentity()).resolves.toEqual({
      key: "unprotected",
      cacheable: true
    });
  });
});
