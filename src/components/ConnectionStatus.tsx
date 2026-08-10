import { useEffect, useState } from "react";
import { getServiceWorkerOfflineStatus } from "../release/serviceWorkerManager";

export function ConnectionStatus({ compact = false }: { compact?: boolean }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const update = () => {
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      if (nextOnline) { setOfflineReady(false); return; }
      void getServiceWorkerOfflineStatus().then((status) => { if (!cancelled) setOfflineReady(status.ready); }).catch(() => { if (!cancelled) setOfflineReady(false); });
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { cancelled = true; window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const label = online ? (compact ? "Online" : "Connected") : offlineReady ? "Offline-ready" : "Offline";
  return <span className={online ? "connection-state connection-state--online" : "connection-state connection-state--offline"}>
    <span className="connection-state__dot" />{label}
  </span>;
}
