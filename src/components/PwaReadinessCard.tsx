import { useEffect, useState } from "react";
import { promptPwaInstall, installInstruction, PWA_INSTALL_CHANGED_EVENT } from "../pwa/installManager";
import { collectPwaReadiness, type PwaReadinessSnapshot } from "../pwa/offlineReadiness";
import { routeHref } from "../core/appRouter";

export function PwaReadinessCard({ compact = false }: { compact?: boolean }) {
  const [snapshot, setSnapshot] = useState<PwaReadinessSnapshot | null>(null);
  const [busy, setBusy] = useState<"install" | "persist" | "refresh" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setBusy((current) => current ?? "refresh");
    try { setSnapshot(await collectPwaReadiness()); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    void refresh();
    const update = () => void refresh();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(PWA_INSTALL_CHANGED_EVENT, update);
    navigator.serviceWorker?.addEventListener("controllerchange", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(PWA_INSTALL_CHANGED_EVENT, update);
      navigator.serviceWorker?.removeEventListener("controllerchange", update);
    };
  }, []);

  async function install(): Promise<void> {
    setBusy("install"); setMessage(null);
    try {
      const result = await promptPwaInstall();
      if (result === "unavailable") setMessage(installInstruction());
      else if (result === "dismissed") setMessage("Installation was dismissed. You can install later from your browser menu.");
      await refresh();
    } finally { setBusy(null); }
  }

  async function persist(): Promise<void> {
    if (!navigator.storage?.persist) return;
    setBusy("persist"); setMessage(null);
    try {
      const granted = await navigator.storage.persist();
      setMessage(granted ? "The browser will avoid automatically cleaning up this app’s local project storage." : "The browser did not grant persistent storage. Keep project backups for important work.");
      await refresh();
    } finally { setBusy(null); }
  }

  const ready = Boolean(snapshot?.offlineShellReady);
  return <section className={compact ? "pwa-readiness pwa-readiness--compact" : "pwa-readiness"}>
    <header><div><p className="eyebrow">Install & offline</p><h2>{ready ? "Ready for offline work" : "Prepare this device"}</h2></div>{snapshot ? <span className={snapshot.offlineShellReady ? "status-badge status-badge--pass" : "status-badge status-badge--warning"}>{snapshot.offlineShellReady ? "Offline shell ready" : "Online setup needed"}</span> : null}</header>
    <div className="pwa-readiness__grid">
      <article><span>App</span><strong>{snapshot?.standalone ? "Installed" : "Browser"}</strong><small>{snapshot?.standalone ? "Standalone launch" : installInstruction()}</small></article>
      <article><span>Offline bundle</span><strong>{snapshot?.offlineShellReady ? "Cached" : "Preparing"}</strong><small>{snapshot?.offlineAssetsExpected ? `${snapshot.offlineAssetsCached}/${snapshot.offlineAssetsExpected} release assets` : "Service worker release cache"}</small></article>
      <article><span>Browser cleanup</span><strong>{snapshot?.persisted ? "Prevented" : "May occur"}</strong><small>{snapshot?.persisted ? "Browser persistence granted" : "Projects may be removed automatically if storage is critically low"}</small></article>
      <article><span>OCR offline</span><strong>{snapshot?.installedOcrLanguages ?? 0} packs</strong><small>Only installed language data is available offline</small></article>
    </div>
    <div className="pwa-readiness__actions">
      {!snapshot?.standalone ? <button className="button" disabled={busy === "install"} onClick={() => void install()} type="button">{busy === "install" ? "Opening…" : snapshot?.installPromptAvailable ? "Install app" : "How to install"}</button> : null}
      {!snapshot?.persisted ? <button className="button button--secondary" disabled={!snapshot?.persistenceSupported || busy === "persist"} onClick={() => void persist()} type="button">{busy === "persist" ? "Requesting…" : "Prevent browser cleanup"}</button> : null}
      <a className="button button--ghost" href={routeHref({ name: "help" })}>Offline OCR help</a>
      <button className="button button--ghost" disabled={busy === "refresh"} onClick={() => void refresh()} type="button">Recheck</button>
    </div>
    {message ? <p className="pwa-readiness__message">{message}</p> : null}
    {!compact ? <p className="muted">Installed PWAs can receive PDFs from supported operating-system share/open flows. Browser support varies; normal file pickers always remain available.</p> : null}
  </section>;
}
