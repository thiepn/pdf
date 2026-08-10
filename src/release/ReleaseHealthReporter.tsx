import { useEffect } from "react";
import { markActiveServiceWorkerHealthy } from "./serviceWorkerManager";

/**
 * Reports a healthy release only after React has committed the application tree.
 * This intentionally sits inside AppErrorBoundary so a failed initial render
 * cannot prune the previous release cache.
 */
export function ReleaseHealthReporter() {
  useEffect(() => {
    void markActiveServiceWorkerHealthy();
  }, []);
  return null;
}
