export const PWA_INSTALL_CHANGED_EVENT = "local-pdf-studio-pwa-install-changed";

interface BeforeInstallPromptEventLike extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

let deferredPrompt: BeforeInstallPromptEventLike | null = null;
let initialized = false;

function emitChanged(): void {
  window.dispatchEvent(new Event(PWA_INSTALL_CHANGED_EVENT));
}

export function isStandalonePwa(): boolean {
  const standaloneMedia = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const navigatorStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return standaloneMedia || navigatorStandalone;
}

export function isIosLikePlatform(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function initializePwaInstallCapture(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEventLike;
    emitChanged();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitChanged();
  });
}

export function canPromptPwaInstall(): boolean {
  return Boolean(deferredPrompt) && !isStandalonePwa();
}

export async function promptPwaInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const prompt = deferredPrompt;
  if (!prompt || isStandalonePwa()) return "unavailable";
  await prompt.prompt();
  const result = await prompt.userChoice;
  if (result.outcome === "accepted") deferredPrompt = null;
  emitChanged();
  return result.outcome;
}

export function installInstruction(): string {
  if (isStandalonePwa()) return "PDF Studio is installed on this device.";
  if (canPromptPwaInstall()) return "Install the app for a standalone window and reliable offline launch.";
  if (isIosLikePlatform()) return "In Safari, use Share → Add to Home Screen to install this app.";
  return "Use your browser's Install app or Add to Home screen command if it is available.";
}
