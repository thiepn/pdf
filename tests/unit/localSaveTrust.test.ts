import { describe, expect, it } from "vitest";
import { describeLocalSaveError, localSaveNeedsUnloadGuard, localSaveStatusLabel, type LocalSaveState } from "../../src/persistence/localSaveTrust";

function state(phase: LocalSaveState["phase"]): LocalSaveState {
  return { phase, revision: 3 };
}

describe("local save trust", () => {
  it("never describes pending or failed writes as saved", () => {
    expect(localSaveStatusLabel(state("pending"), null, true)).toBe("Changes waiting to save locally");
    expect(localSaveStatusLabel(state("saving"), null, true)).toBe("Saving changes locally…");
    expect(localSaveStatusLabel(state("error"), null, true)).toBe("Local autosave failed");
  });

  it("reports saved state only after a successful persistence revision", () => {
    expect(localSaveStatusLabel(state("saved"), null, true)).toBe("Changes saved locally");
    expect(localSaveStatusLabel(state("saved"), "2 added objects · 4.2 KB", true)).toBe("2 added objects · 4.2 KB");
  });

  it("uses plain language for idle local-save state", () => {
    expect(localSaveStatusLabel(state("idle"), null, true)).toBe("Changes not yet saved locally");
    expect(localSaveStatusLabel(state("idle"), null, false)).toBe("No unsaved local changes");
  });

  it("keeps browser-exit protection while a save is unresolved", () => {
    expect(localSaveNeedsUnloadGuard(state("pending"))).toBe(true);
    expect(localSaveNeedsUnloadGuard(state("saving"))).toBe(true);
    expect(localSaveNeedsUnloadGuard(state("error"))).toBe(true);
    expect(localSaveNeedsUnloadGuard(state("saved"))).toBe(false);
    expect(localSaveNeedsUnloadGuard(state("idle"))).toBe(false);
  });

  it("gives specific recovery language for quota and interrupted writes", () => {
    const quota = new Error("Quota exceeded");
    quota.name = "QuotaExceededError";
    expect(describeLocalSaveError(quota)).toMatch(/Browser storage could not accept this save/i);

    const aborted = new Error("transaction aborted");
    aborted.name = "AbortError";
    expect(describeLocalSaveError(aborted)).toMatch(/write was interrupted/i);
  });

  it("keeps unknown persistence errors truthful without claiming data was saved", () => {
    expect(describeLocalSaveError(new Error("unknown write failure"))).toMatch(/could not save the latest edits/i);
  });
});
