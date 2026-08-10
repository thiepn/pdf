export const SETTINGS_SCHEMA_VERSION = 5;

export interface AppSettings {
  schemaVersion: number;
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
  experienceMode: "simple" | "advanced";
  motion: "system" | "reduced";
  defaultViewMode: "single" | "continuous";
  defaultZoom: number;
  reopenLastProject: boolean;
  retainSearchIndex: boolean;
  renderingQuality: "adaptive" | "balanced" | "high" | "low-memory";
  updateMode: "prompt" | "automatic";
  confirmDestructive: boolean;
  diagnosticLogging: boolean;
  recordActivity: boolean;
  showPreservationWarnings: boolean;
}

export const defaultSettings: AppSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  theme: "system",
  density: "comfortable",
  experienceMode: "simple",
  motion: "system",
  defaultViewMode: "continuous",
  defaultZoom: 1,
  reopenLastProject: false,
  retainSearchIndex: false,
  renderingQuality: "adaptive",
  updateMode: "prompt",
  confirmDestructive: true,
  diagnosticLogging: true,
  recordActivity: true,
  showPreservationWarnings: true
};
