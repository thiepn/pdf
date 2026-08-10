const SAFE_MODE_KEY = "local-pdf-studio-safe-mode";
const REOPEN_ATTEMPTED_KEY = "local-pdf-studio-reopen-attempted";

export function isSafeMode(): boolean {
  try { return sessionStorage.getItem(SAFE_MODE_KEY) === "1"; }
  catch { return false; }
}

export function enableSafeMode(): void {
  try {
    sessionStorage.setItem(SAFE_MODE_KEY, "1");
    sessionStorage.setItem(REOPEN_ATTEMPTED_KEY, "1");
  } catch { /* Session storage may be unavailable. */ }
  document.documentElement.dataset.safeMode = "true";
}

export function disableSafeMode(): void {
  try { sessionStorage.removeItem(SAFE_MODE_KEY); } catch { /* Session storage may be unavailable. */ }
  delete document.documentElement.dataset.safeMode;
}

export function applySafeModeState(): boolean {
  const active = isSafeMode();
  if (active) document.documentElement.dataset.safeMode = "true";
  else delete document.documentElement.dataset.safeMode;
  return active;
}
