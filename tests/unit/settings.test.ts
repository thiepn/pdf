import { beforeEach, describe, expect, it } from "vitest";
import { readSettings, writeSettings } from "../../src/settings/settingsStore";
import { SETTINGS_SCHEMA_VERSION } from "../../src/types/settings";

describe("settings migration", () => {
  beforeEach(() => localStorage.clear());

  it("migrates legacy settings and applies stable defaults", () => {
    localStorage.setItem("local-pdf-studio-settings-v1", JSON.stringify({ theme: "dark", defaultZoom: 1.25 }));
    const settings = readSettings();
    expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(settings.theme).toBe("dark");
    expect(settings.defaultZoom).toBe(1.25);
    expect(settings.confirmDestructive).toBe(true);
    expect(settings.recordActivity).toBe(true);
    expect(settings.experienceMode).toBe("simple");
    expect(settings.showPreservationWarnings).toBe(true);
    expect(settings.renderingQuality).toBe("adaptive");
  });

  it("persists workspace, density, and motion preferences", () => {
    const settings = { ...readSettings(), density: "compact" as const, motion: "reduced" as const, experienceMode: "advanced" as const };
    writeSettings(settings);
    expect(readSettings().density).toBe("compact");
    expect(document.documentElement.dataset.motion).toBe("reduced");
    expect(document.documentElement.dataset.experience).toBe("advanced");
  });
});
