import { defaultSettings, SETTINGS_SCHEMA_VERSION, type AppSettings } from "../types/settings";

const SETTINGS_KEY = "local-pdf-studio-settings-v5";
const LEGACY_SETTINGS_KEYS = ["local-pdf-studio-settings-v4", "local-pdf-studio-settings-v3", "local-pdf-studio-settings-v2", "local-pdf-studio-settings-v1"] as const;
export const SETTINGS_CHANGED_EVENT = "local-pdf-studio-settings-changed";

function parseStoredSettings(raw: string | null): Partial<AppSettings> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Partial<AppSettings>; } catch { return null; }
}

export function hasFutureSettingsSchema(): boolean {
  try {
    const parsed = parseStoredSettings(localStorage.getItem(SETTINGS_KEY));
    return Number.isSafeInteger(parsed?.schemaVersion) && Number(parsed?.schemaVersion) > SETTINGS_SCHEMA_VERSION;
  } catch { return false; }
}

export function readSettings(): AppSettings {
  try {
    const currentRaw = localStorage.getItem(SETTINGS_KEY);
    const current = parseStoredSettings(currentRaw);
    // Never rewrite settings created by a newer application. Use safe defaults
    // for this older tab while preserving the newer record byte-for-byte.
    if (Number.isSafeInteger(current?.schemaVersion) && Number(current?.schemaVersion) > SETTINGS_SCHEMA_VERSION) return { ...defaultSettings };
    const raw = currentRaw ?? LEGACY_SETTINGS_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ?? null;
    if (!raw) return { ...defaultSettings };
    const parsed = parseStoredSettings(raw);
    if (!parsed) return { ...defaultSettings };
    const migrated: AppSettings = { ...defaultSettings, ...parsed, schemaVersion: SETTINGS_SCHEMA_VERSION };
    if (!currentRaw) localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return { ...defaultSettings };
  }
}

export function writeSettings(settings: AppSettings): void {
  if (hasFutureSettingsSchema()) throw new Error("These settings were created by a newer PDF Studio version. Update the app before changing settings so newer preferences are not overwritten.");
  const normalized = { ...defaultSettings, ...settings, schemaVersion: SETTINGS_SCHEMA_VERSION };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  applySettings(normalized);
  window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_CHANGED_EVENT, { detail: normalized }));
}

export function applySettings(settings: AppSettings): void {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.density = settings.density;
  document.documentElement.dataset.motion = settings.motion;
  document.documentElement.dataset.experience = settings.experienceMode;
}

export function applyTheme(theme: AppSettings["theme"]): void {
  applySettings({ ...readSettings(), theme });
}
