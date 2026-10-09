import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./interaction/r3.css";
import "./editor/sidebarScrollFix.css";
import "./product/product.css";
import { applySettings, readSettings } from "./settings/settingsStore";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { recordDiagnosticError } from "./diagnostics/errorRepository";
import { registerAppServiceWorker } from "./release/serviceWorkerManager";
import { applySafeModeState } from "./maintenance/safeMode";
import { MobileViewportManager } from "./mobile/MobileViewportManager";
import { initializePwaInstallCapture } from "./pwa/installManager";
import { registerPwaFileHandling } from "./pwa/launchFiles";
import { ReleaseHealthReporter } from "./release/ReleaseHealthReporter";
import { finishPdfAccountSignIn, isPdfOAuthCallback, nativeLunaConfig } from "./automation/nativeLunaAccount";

initializePwaInstallCapture();
registerPwaFileHandling();

const settings = readSettings();
applySettings(settings);
const safeMode = applySafeModeState();

if (settings.diagnosticLogging) {
  window.addEventListener("error", (event) => { void recordDiagnosticError(event.error ?? event.message, { area: "window", operation: "error", route: window.location.hash, severity: "error", recoverable: true }); });
  window.addEventListener("unhandledrejection", (event) => { void recordDiagnosticError(event.reason, { area: "promise", operation: "unhandled-rejection", route: window.location.hash, severity: "error", recoverable: true }); });
}

let refreshing = false;
const controlledAtBoot = "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller);
if (!safeMode && "serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", () => {
  // clients.claim() also emits controllerchange on a first install. The current
  // page already loaded the matching release, so reloading here only interrupts
  // startup work. Reload when an already-controlled client changes releases.
  if (!controlledAtBoot) return;
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
});
if (!safeMode) void registerAppServiceWorker().catch((reason) => { if (settings.diagnosticLogging) void recordDiagnosticError(reason, { area: "service-worker", operation: "register", severity: "warning", recoverable: true }); });

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
function renderApp():void{
  createRoot(root!).render(<StrictMode><AppErrorBoundary><MobileViewportManager />{!safeMode ? <ReleaseHealthReporter /> : null}<App /></AppErrorBoundary></StrictMode>);
}
let accountConfig:ReturnType<typeof nativeLunaConfig>=null;
try{accountConfig=nativeLunaConfig();}catch{/* Missing/invalid public configuration disables native AI. */}
if(accountConfig&&isPdfOAuthCallback(accountConfig,window.location)){
  // Complete the one-use OAuth callback before mounting the normal app/router.
  // State is validated and the code is erased from history synchronously.
  root.textContent="Completing THIEPN Account sign-in…";
  void finishPdfAccountSignIn(accountConfig)
    .then(()=>{sessionStorage.setItem("pdf-studio:f8b:login-result","connected");})
    .catch(reason=>{sessionStorage.setItem("pdf-studio:f8b:login-result",reason instanceof Error?reason.message:"Account sign-in failed.");})
    .finally(renderApp);
}else{
  renderApp();
}
