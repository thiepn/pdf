import { useEffect, useState } from "react";
import { activateWaitingServiceWorker, SERVICE_WORKER_UPDATE_EVENT, type ServiceWorkerUpdateDetail } from "../release/serviceWorkerManager";
import { getActiveProjectOperations, subscribeAllProjectOperations } from "../operations/projectOperationCoordinator";
import "../trust/trust.css";

export function UpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [busy, setBusy] = useState(() => getActiveProjectOperations().length > 0);
  useEffect(() => {
    const listener = (event: Event) => setRegistration((event as CustomEvent<ServiceWorkerUpdateDetail>).detail.registration);
    window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, listener);
    const unsubscribe = subscribeAllProjectOperations((operations) => setBusy(operations.length > 0));
    return () => { window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, listener); unsubscribe(); };
  }, []);
  if (!registration) return null;
  return <div className="update-banner" role="status">
    <span><strong>App update ready.</strong> {busy ? "Your document task keeps priority. Finish or cancel it before updating." : "Your open PDFs stay local. Apply the update when convenient."}</span>
    <div>
      <button className="button button--small" disabled={busy} onClick={() => { if (activateWaitingServiceWorker(registration)) setRegistration(null); }} type="button">Update now</button>
      <button className="button button--ghost button--small" onClick={() => setRegistration(null)} type="button">Later</button>
    </div>
  </div>;
}
