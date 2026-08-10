import { beforeEach, describe, expect, it } from "vitest";
import { applySafeModeState, disableSafeMode, enableSafeMode, isSafeMode } from "../../src/maintenance/safeMode";

describe("safe mode", () => {
  beforeEach(() => { sessionStorage.clear(); disableSafeMode(); });
  it("persists for the current browser session", () => {
    enableSafeMode();
    expect(isSafeMode()).toBe(true);
    expect(applySafeModeState()).toBe(true);
    expect(document.documentElement.dataset.safeMode).toBe("true");
    disableSafeMode();
    expect(isSafeMode()).toBe(false);
  });
});
